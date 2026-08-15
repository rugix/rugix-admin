//! In-memory job state and event distribution.
//!
//! [`JobManager`] keeps recent event history for late subscribers and broadcasts live
//! changes to connected browsers.

use std::collections::VecDeque;
use std::sync::Arc;

use indexmap::IndexMap;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

use crate::error::ApiError;
use crate::generated::events;
use crate::generated::jobs;
use crate::ApiResult;

const JOB_EVENT_CHANNEL_CAPACITY: usize = 128;
const JOB_EVENT_HISTORY_CAPACITY: usize = 512;
const SERVER_EVENT_CHANNEL_CAPACITY: usize = 32;

/// In-memory job registry and event broadcaster.
#[derive(Debug, Clone)]
pub(crate) struct JobManager {
    inner: Arc<RwLock<IndexMap<String, JobEntry>>>,
    server_tx: broadcast::Sender<events::ServerEvent>,
}

/// Job event paired with its stable stream sequence.
#[derive(Debug, Clone)]
pub(crate) struct SequencedJobEvent {
    /// Monotonically increasing sequence within one job.
    pub(crate) sequence: u64,
    /// Typed event payload.
    pub(crate) event: events::AdminEvent,
}

#[derive(Debug)]
struct JobEntry {
    job: jobs::Job,
    events: VecDeque<SequencedJobEvent>,
    next_event_sequence: u64,
    last_install_progress_percent: Option<u8>,
    last_stderr_line: Option<String>,
    tx: broadcast::Sender<SequencedJobEvent>,
}

impl Default for JobManager {
    fn default() -> Self {
        let (server_tx, _initial_receiver) = broadcast::channel(SERVER_EVENT_CHANNEL_CAPACITY);
        Self {
            inner: Arc::default(),
            server_tx,
        }
    }
}

impl JobManager {
    pub(crate) async fn create(
        &self,
        id: Option<String>,
        title: String,
        kind: jobs::JobKind,
        target: Option<String>,
    ) -> ApiResult<jobs::Job> {
        let id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        tracing::info!(job_id = %id, %title, ?kind, target = ?target, "creating job");
        let now = now();
        let job = jobs::Job::new(
            id.clone(),
            title,
            kind,
            jobs::JobStatus::Queued,
            now.clone(),
            now,
        )
        .with_target(target);
        let event = SequencedJobEvent {
            sequence: 1,
            event: events::AdminEvent::JobChanged(events::JobChangedEvent::new(job.clone())),
        };
        let (tx, _initial_receiver) = broadcast::channel(JOB_EVENT_CHANNEL_CAPACITY);
        let mut events = VecDeque::new();
        events.push_back(event);

        let mut inner = self.inner.write().await;
        if inner.contains_key(&id) {
            return Err(ApiError::conflict("job-exists", "job id already exists"));
        }
        inner.insert(
            id,
            JobEntry {
                job: job.clone(),
                events,
                next_event_sequence: 2,
                last_install_progress_percent: None,
                last_stderr_line: None,
                tx: tx.clone(),
            },
        );
        Ok(job)
    }

    pub(crate) async fn list(&self) -> Vec<jobs::Job> {
        self.inner
            .read()
            .await
            .values()
            .rev()
            .map(|entry| entry.job.clone())
            .collect()
    }

    pub(crate) async fn get(&self, job_id: &str) -> ApiResult<jobs::Job> {
        self.inner
            .read()
            .await
            .get(job_id)
            .map(|entry| entry.job.clone())
            .ok_or_else(|| ApiError::not_found("job-not-found", "job not found"))
    }

    pub(crate) async fn subscribe(
        &self,
        job_id: &str,
    ) -> ApiResult<(
        VecDeque<SequencedJobEvent>,
        broadcast::Receiver<SequencedJobEvent>,
    )> {
        let inner = self.inner.read().await;
        let entry = inner
            .get(job_id)
            .ok_or_else(|| ApiError::not_found("job-not-found", "job not found"))?;
        Ok((entry.events.clone(), entry.tx.subscribe()))
    }

    pub(crate) fn subscribe_server_events(&self) -> broadcast::Receiver<events::ServerEvent> {
        self.server_tx.subscribe()
    }

    pub(crate) async fn set_status(&self, job_id: &str, status: jobs::JobStatus) {
        tracing::info!(%job_id, ?status, "updating job status");
        self.update_job(job_id, |job| job.status = status).await;
    }

    pub(crate) async fn fail(&self, job_id: &str, message: String, exit_code: Option<i32>) {
        tracing::warn!(%job_id, ?exit_code, "failing job");
        self.set_status(
            job_id,
            jobs::JobStatus::Failed(jobs::JobFailure::new(message).with_exit_code(exit_code)),
        )
        .await;
    }

    pub(crate) async fn fail_command(&self, job_id: &str, exit_code: Option<i32>) {
        let last_stderr_line = self
            .inner
            .read()
            .await
            .get(job_id)
            .and_then(|entry| entry.last_stderr_line.clone());
        let message = last_stderr_line
            .map(|line| format!("rugix-ctrl failed: {line}"))
            .unwrap_or_else(|| match exit_code {
                Some(code) => format!("rugix-ctrl failed with exit code {code}"),
                None => "rugix-ctrl failed without an exit code".to_owned(),
            });
        self.fail(job_id, message, exit_code).await;
    }

    pub(crate) async fn emit_output(
        &self,
        job_id: &str,
        stream: events::JobOutputStream,
        line: String,
    ) {
        let event = events::AdminEvent::JobOutput(events::JobOutputEvent::new(
            job_id.to_owned(),
            stream.clone(),
            line.clone(),
        ));
        let (tx, event) = {
            let mut inner = self.inner.write().await;
            let Some(entry) = inner.get_mut(job_id) else {
                tracing::warn!(%job_id, "discarding output for an unknown job");
                return;
            };
            if matches!(stream, events::JobOutputStream::Stderr) {
                entry.last_stderr_line = Some(line);
            }
            push_entry_event(entry, event)
        };
        send_live_event(job_id, &tx, event);
    }

    pub(crate) async fn emit_upload_progress(&self, job_id: &str, bytes: u64) {
        self.push_event(
            job_id,
            events::AdminEvent::UploadProgress(events::UploadProgressEvent::new(
                job_id.to_owned(),
                bytes,
            )),
        )
        .await;
    }

    pub(crate) async fn emit_install_progress(&self, job_id: &str, progress: f64) {
        let progress_percent = rounded_progress_percent(progress);
        let event = events::AdminEvent::InstallProgress(events::InstallProgressEvent::new(
            job_id.to_owned(),
            f64::from(progress_percent),
        ));
        let (tx, event) = {
            let mut inner = self.inner.write().await;
            let Some(entry) = inner.get_mut(job_id) else {
                tracing::warn!(%job_id, "discarding install progress for an unknown job");
                return;
            };
            if entry.last_install_progress_percent == Some(progress_percent) {
                return;
            }
            entry.last_install_progress_percent = Some(progress_percent);
            push_entry_event(entry, event)
        };
        send_live_event(job_id, &tx, event);
    }

    pub(crate) async fn emit_compatibility_check_skipped(
        &self,
        job_id: &str,
        scope: events::CompatibilityCheckScope,
        reason: String,
    ) {
        self.push_event(
            job_id,
            events::AdminEvent::CompatibilityCheckSkipped(
                events::CompatibilityCheckSkippedEvent::new(job_id.to_owned(), scope, reason),
            ),
        )
        .await;
    }

    pub(crate) async fn emit_app_activation_result(
        &self,
        job_id: &str,
        app: String,
        generation: u64,
        outcome: events::AppActivationOutcome,
    ) {
        self.push_event(
            job_id,
            events::AdminEvent::AppActivationResult(events::AppActivationResultEvent::new(
                job_id.to_owned(),
                app,
                generation,
                outcome,
            )),
        )
        .await;
    }

    async fn update_job(&self, job_id: &str, update: impl FnOnce(&mut jobs::Job)) {
        let (tx, event, completed) = {
            let mut inner = self.inner.write().await;
            let Some(entry) = inner.get_mut(job_id) else {
                tracing::warn!(%job_id, "discarding a status change for an unknown job");
                return;
            };
            let was_terminal = is_terminal(&entry.job.status);
            update(&mut entry.job);
            entry.job.updated_at = now();
            let completed = !was_terminal && is_terminal(&entry.job.status);
            let event =
                events::AdminEvent::JobChanged(events::JobChangedEvent::new(entry.job.clone()));
            let (tx, event) = push_entry_event(entry, event);
            (tx, event, completed)
        };
        send_live_event(job_id, &tx, event);
        if completed {
            send_server_event(&self.server_tx, events::ServerEvent::InvalidateAll);
        }
    }

    async fn push_event(&self, job_id: &str, event: events::AdminEvent) {
        let (tx, event) = {
            let mut inner = self.inner.write().await;
            let Some(entry) = inner.get_mut(job_id) else {
                tracing::warn!(%job_id, "discarding an event for an unknown job");
                return;
            };
            push_entry_event(entry, event)
        };
        send_live_event(job_id, &tx, event);
    }
}

fn push_entry_event(
    entry: &mut JobEntry,
    event: events::AdminEvent,
) -> (broadcast::Sender<SequencedJobEvent>, SequencedJobEvent) {
    let event = SequencedJobEvent {
        sequence: entry.next_event_sequence,
        event,
    };
    entry.next_event_sequence += 1;
    entry.events.push_back(event.clone());
    while entry.events.len() > JOB_EVENT_HISTORY_CAPACITY {
        entry.events.pop_front();
    }
    (entry.tx.clone(), event)
}

/// Broadcasts an event when subscribers are present; history covers late subscribers.
fn send_live_event(
    job_id: &str,
    tx: &broadcast::Sender<SequencedJobEvent>,
    event: SequencedJobEvent,
) {
    if tx.send(event).is_err() {
        tracing::debug!(%job_id, "job has no live event subscribers");
    }
}

/// Broadcasts a global event when subscribers are present.
fn send_server_event(tx: &broadcast::Sender<events::ServerEvent>, event: events::ServerEvent) {
    if tx.send(event).is_err() {
        tracing::debug!("server has no global event subscribers");
    }
}

fn is_terminal(status: &jobs::JobStatus) -> bool {
    matches!(
        status,
        jobs::JobStatus::Succeeded | jobs::JobStatus::Failed(_)
    )
}

fn rounded_progress_percent(progress: f64) -> u8 {
    progress.clamp(0.0, 100.0).round() as u8
}

fn now() -> String {
    jiff::Timestamp::now().to_string()
}

#[cfg(test)]
mod tests {
    use tokio::sync::broadcast::error::TryRecvError;

    use super::*;

    /// Verifies that replayed job events retain their original increasing sequences.
    #[tokio::test]
    async fn replayed_job_events_keep_stable_sequences() {
        let manager = JobManager::default();
        let job = manager
            .create(
                None,
                "Test job".to_owned(),
                jobs::JobKind::SystemAction,
                None,
            )
            .await
            .unwrap();
        manager.set_status(&job.id, jobs::JobStatus::Running).await;
        manager
            .emit_output(
                &job.id,
                events::JobOutputStream::Stdout,
                "test output".to_owned(),
            )
            .await;

        let (first_replay, _) = manager.subscribe(&job.id).await.unwrap();
        let (second_replay, _) = manager.subscribe(&job.id).await.unwrap();
        let sequences = |events: VecDeque<SequencedJobEvent>| {
            events
                .into_iter()
                .map(|event| event.sequence)
                .collect::<Vec<_>>()
        };

        assert_eq!(sequences(first_replay), vec![1, 2, 3]);
        assert_eq!(sequences(second_replay), vec![1, 2, 3]);
    }

    /// Verifies that only the transition to a terminal job state invalidates device data.
    #[tokio::test]
    async fn completed_job_emits_one_global_invalidation() {
        let manager = JobManager::default();
        let mut receiver = manager.subscribe_server_events();
        let job = manager
            .create(
                None,
                "Test job".to_owned(),
                jobs::JobKind::SystemAction,
                None,
            )
            .await
            .unwrap();

        manager.set_status(&job.id, jobs::JobStatus::Running).await;
        assert!(matches!(receiver.try_recv(), Err(TryRecvError::Empty)));

        manager
            .set_status(&job.id, jobs::JobStatus::Succeeded)
            .await;
        assert!(matches!(
            receiver.try_recv(),
            Ok(events::ServerEvent::InvalidateAll)
        ));

        manager
            .set_status(&job.id, jobs::JobStatus::Succeeded)
            .await;
        assert!(matches!(receiver.try_recv(), Err(TryRecvError::Empty)));
    }
}
