//! Rugix Ctrl process execution and streamed job integration.
//!
//! This module runs typed query commands, forwards bundle uploads, and translates
//! machine-readable Rugix Ctrl events into Rugix Admin job events.

use std::process::Stdio;

use axum::extract::multipart::Field;
use axum::extract::Multipart;
use reportify::Report;
use reportify::ResultExt;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncRead;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::process::Child;
use tokio::process::Command;
use tokio::task::JoinHandle;
use tracing::debug;
use tracing::error;
use tracing::info;
use tracing::warn;
use tracing::Instrument;

use crate::error::ApiError;
use crate::generated::events;
use crate::generated::jobs;
use crate::jobs::JobManager;
use crate::ApiResult;

reportify::new_whatever_type! {
    /// Multipart upload processing error.
    UploadError
}

type UploadResult<T> = Result<T, Report<UploadError>>;

#[derive(Debug, Clone)]
pub(crate) struct CommandSpec {
    pub(crate) title: String,
    pub(crate) kind: jobs::JobKind,
    pub(crate) target: Option<String>,
    pub(crate) args: Vec<String>,
}

impl CommandSpec {
    pub(crate) fn new(
        title: &str,
        kind: jobs::JobKind,
        target: Option<String>,
        args: Vec<String>,
    ) -> Self {
        Self {
            title: title.to_owned(),
            kind,
            target,
            args,
        }
    }
}

#[tracing::instrument(level = "debug", skip_all, fields(command = "rugix-ctrl"))]
pub(crate) async fn run_json_command<T>(args: &[&str]) -> ApiResult<T>
where
    T: DeserializeOwned,
{
    debug!("running rugix-ctrl JSON command");
    let output = Command::new("rugix-ctrl")
        .args(args)
        .output()
        .await
        .map_err(|err| ApiError::command_spawn("rugix-ctrl", err))?;

    if !output.status.success() {
        return Err(ApiError::command_failed("rugix-ctrl", &output));
    }

    debug!(
        stdout_bytes = output.stdout.len(),
        "rugix-ctrl JSON command completed"
    );
    serde_json::from_slice(&output.stdout).map_err(ApiError::invalid_ctrl_output)
}

#[tracing::instrument(
    level = "debug",
    skip_all,
    fields(command = "rugix-ctrl components check")
)]
pub(crate) async fn run_components_check_command<T>() -> ApiResult<T>
where
    T: DeserializeOwned,
{
    let args = ["components", "check"];
    debug!("running rugix-ctrl components check");
    let output = Command::new("rugix-ctrl")
        .args(args)
        .output()
        .await
        .map_err(|err| ApiError::command_spawn("rugix-ctrl", err))?;

    match output.status.code() {
        Some(0 | 1) => {
            debug!(
                status = %output.status,
                stdout_bytes = output.stdout.len(),
                "rugix-ctrl components check completed"
            );
            serde_json::from_slice(&output.stdout).map_err(ApiError::invalid_ctrl_output)
        }
        _ => Err(ApiError::command_failed("rugix-ctrl", &output)),
    }
}

#[tracing::instrument(level = "info", skip_all, fields(%job_id))]
pub(crate) fn spawn_command_job(jobs: JobManager, job_id: String, args: Vec<String>) {
    let span = tracing::info_span!("rugix_ctrl_job", %job_id);
    tokio::spawn(
        async move {
            info!("starting rugix-ctrl job");
            jobs.set_status(&job_id, jobs::JobStatus::Running).await;
            let mut child = match Command::new("rugix-ctrl")
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
            {
                Ok(child) => child,
                Err(err) => {
                    error!(error = %err, "failed to spawn rugix-ctrl for job");
                    jobs.fail(&job_id, format!("failed to spawn rugix-ctrl: {err}"), None)
                        .await;
                    return;
                }
            };

            let stdout = child.stdout.take();
            let stderr = child.stderr.take();
            let stdout_task = stdout.map(|stdout| {
                tokio::spawn(read_output_lines(
                    jobs.clone(),
                    job_id.clone(),
                    events::JobOutputStream::Stdout,
                    stdout,
                ))
            });
            let stderr_task = stderr.map(|stderr| {
                tokio::spawn(read_output_lines(
                    jobs.clone(),
                    job_id.clone(),
                    events::JobOutputStream::Stderr,
                    stderr,
                ))
            });

            wait_for_child(jobs, job_id, child, stdout_task, stderr_task, true).await;
        }
        .instrument(span),
    );
}

#[tracing::instrument(level = "info", skip_all, fields(%job_id, %file_field))]
pub(crate) async fn stream_upload_job(
    jobs: JobManager,
    job_id: String,
    args: Vec<String>,
    mut multipart: Multipart,
    file_field: &'static str,
) {
    info!(%job_id, %file_field, "starting upload job");
    jobs.set_status(&job_id, jobs::JobStatus::Running).await;
    let mut child = match Command::new("rugix-ctrl")
        .args(&args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(err) => {
            error!(%job_id, error = %err, "failed to spawn rugix-ctrl for upload");
            jobs.fail(&job_id, format!("failed to spawn rugix-ctrl: {err}"), None)
                .await;
            drain_upload_after_failure(&job_id, &mut multipart).await;
            return;
        }
    };

    let stdout_task = child.stdout.take().map(|stdout| {
        tokio::spawn(read_output_lines(
            jobs.clone(),
            job_id.clone(),
            events::JobOutputStream::Stdout,
            stdout,
        ))
    });
    let stderr_task = child.stderr.take().map(|stderr| {
        tokio::spawn(read_output_lines(
            jobs.clone(),
            job_id.clone(),
            events::JobOutputStream::Stderr,
            stderr,
        ))
    });

    let Some(stdin) = child.stdin.take() else {
        error!(%job_id, "rugix-ctrl stdin is unavailable");
        jobs.fail(&job_id, "rugix-ctrl stdin is unavailable".to_owned(), None)
            .await;
        drain_upload_after_failure(&job_id, &mut multipart).await;
        spawn_wait_for_child(jobs, job_id, child, stdout_task, stderr_task, false);
        return;
    };

    let mut stdin = Some(stdin);
    let mut found_file = false;
    let mut bytes_read = 0u64;
    let mut bytes_written = 0u64;
    let mut upload_error = None::<String>;
    'fields: loop {
        match multipart.next_field().await {
            Ok(Some(mut field)) => {
                let field_name = field.name().map(ToOwned::to_owned);
                debug!(%job_id, field = ?field_name, "received multipart field");
                if field_name.as_deref() != Some(file_field) {
                    if let Err(err) = drain_field(&mut field).await {
                        let message = format!("failed to drain multipart field: {err}");
                        warn!(%job_id, field = ?field_name, %message);
                        upload_error.get_or_insert(message);
                        break 'fields;
                    }
                    continue;
                }
                found_file = true;
                loop {
                    match field.chunk().await {
                        Ok(Some(chunk)) => {
                            bytes_read += chunk.len() as u64;
                            if let Some(child_stdin) = stdin.as_mut() {
                                if let Err(err) = child_stdin.write_all(&chunk).await {
                                    let message =
                                        format!("failed to stream upload to rugix-ctrl: {err}");
                                    warn!(
                                        %job_id,
                                        bytes_read,
                                        bytes_written,
                                        %message,
                                        "rugix-ctrl stopped accepting upload data"
                                    );
                                    upload_error.get_or_insert(message);
                                    stdin.take();
                                } else {
                                    bytes_written += chunk.len() as u64;
                                    jobs.emit_upload_progress(&job_id, bytes_written).await;
                                }
                            }
                        }
                        Ok(None) => break,
                        Err(err) => {
                            let message = format!("failed to read upload stream: {err}");
                            warn!(
                                %job_id,
                                bytes_read,
                                bytes_written,
                                %message,
                                "failed reading upload stream"
                            );
                            upload_error.get_or_insert(message);
                            stdin.take();
                            break 'fields;
                        }
                    }
                }
            }
            Ok(None) => break,
            Err(err) => {
                let message = format!("invalid multipart upload: {err}");
                warn!(
                    %job_id,
                    bytes_read,
                    bytes_written,
                    %message,
                    "failed reading multipart upload"
                );
                upload_error.get_or_insert(message);
                stdin.take();
                break;
            }
        }
    }

    if !found_file {
        upload_error.get_or_insert_with(|| format!("missing `{file_field}` file field"));
    }

    if let Some(message) = &upload_error {
        jobs.fail(&job_id, message.clone(), None).await;
    } else {
        info!(
            %job_id,
            bytes_read,
            bytes_written,
            "upload streamed to rugix-ctrl"
        );
    }

    drop(stdin);
    spawn_wait_for_child(
        jobs,
        job_id,
        child,
        stdout_task,
        stderr_task,
        upload_error.is_none(),
    );
}

fn spawn_wait_for_child(
    jobs: JobManager,
    job_id: String,
    child: Child,
    stdout_task: Option<JoinHandle<()>>,
    stderr_task: Option<JoinHandle<()>>,
    update_job_status: bool,
) {
    let span = tracing::info_span!("rugix_ctrl_wait", %job_id, update_job_status);
    tokio::spawn(
        async move {
            wait_for_child(
                jobs,
                job_id,
                child,
                stdout_task,
                stderr_task,
                update_job_status,
            )
            .await;
        }
        .instrument(span),
    );
}

async fn wait_for_child(
    jobs: JobManager,
    job_id: String,
    mut child: Child,
    stdout_task: Option<JoinHandle<()>>,
    stderr_task: Option<JoinHandle<()>>,
    update_job_status: bool,
) {
    let status = child.wait().await;
    wait_for_output_reader(&job_id, "stdout", stdout_task).await;
    wait_for_output_reader(&job_id, "stderr", stderr_task).await;

    match status {
        Ok(status) if status.success() => {
            info!(%job_id, %status, "rugix-ctrl exited successfully");
            if update_job_status {
                jobs.set_status(&job_id, jobs::JobStatus::Succeeded).await;
            }
        }
        Ok(status) => {
            warn!(%job_id, %status, "rugix-ctrl exited with failure");
            if update_job_status {
                jobs.fail_command(&job_id, status.code()).await;
            }
        }
        Err(err) => {
            error!(%job_id, error = %err, "failed to wait for rugix-ctrl");
            if update_job_status {
                jobs.fail(
                    &job_id,
                    format!("failed to wait for rugix-ctrl: {err}"),
                    None,
                )
                .await;
            }
        }
    }
}

/// Waits for one output reader and reports a task failure without changing operation
/// status.
async fn wait_for_output_reader(job_id: &str, stream: &'static str, task: Option<JoinHandle<()>>) {
    if let Some(task) = task {
        if let Err(err) = task.await {
            warn!(%job_id, %stream, error = %err, "rugix-ctrl output reader task failed");
        }
    }
}

async fn read_output_lines<R>(
    jobs: JobManager,
    job_id: String,
    stream: events::JobOutputStream,
    reader: R,
) where
    R: AsyncRead + Unpin,
{
    let mut lines = BufReader::new(reader).lines();
    loop {
        match lines.next_line().await {
            Ok(Some(line)) => {
                debug!(%job_id, ?stream, "received rugix-ctrl output line");
                if matches!(stream, events::JobOutputStream::Stdout)
                    && line.trim_start().starts_with('{')
                {
                    match parse_ctrl_event(&line) {
                        Ok(event) => {
                            emit_ctrl_event(&jobs, &job_id, event).await;
                            continue;
                        }
                        Err(error) => {
                            warn!(%job_id, error = %error, "unrecognized structured rugix-ctrl output");
                        }
                    }
                }
                jobs.emit_output(&job_id, stream.clone(), line).await;
            }
            Ok(None) => break,
            Err(err) => {
                warn!(%job_id, ?stream, error = %err, "failed to read rugix-ctrl output");
                break;
            }
        }
    }
}

/// Emits a parsed machine-readable Rugix Ctrl event.
async fn emit_ctrl_event(jobs: &JobManager, job_id: &str, event: CtrlEvent) {
    match event {
        CtrlEvent::UpdateProgress { progress } => {
            if progress.is_finite() {
                jobs.emit_install_progress(job_id, progress.clamp(0.0, 100.0))
                    .await;
            }
        }
        CtrlEvent::CompatibilityCheckSkipped { scope, reason } => {
            jobs.emit_compatibility_check_skipped(job_id, scope, reason)
                .await;
        }
        CtrlEvent::AppActivationResult {
            app,
            generation,
            outcome,
        } => {
            jobs.emit_app_activation_result(job_id, app, generation, outcome)
                .await;
        }
    }
}

/// Parses a complete Rugix Ctrl JSON event while leaving ordinary output untouched.
fn parse_ctrl_event(line: &str) -> Result<CtrlEvent, serde_json::Error> {
    serde_json::from_str(line)
}

async fn drain_upload_after_failure(job_id: &str, multipart: &mut Multipart) {
    match drain_multipart(multipart).await {
        Ok(bytes) => {
            debug!(%job_id, bytes, "drained upload body after early failure");
        }
        Err(err) => {
            warn!(%job_id, error = %err, "failed to drain upload body after early failure");
        }
    }
}

async fn drain_multipart(multipart: &mut Multipart) -> UploadResult<u64> {
    let mut bytes = 0u64;
    while let Some(mut field) = multipart
        .next_field()
        .await
        .whatever("failed to read multipart field")?
    {
        bytes += drain_field(&mut field).await?;
    }
    Ok(bytes)
}

async fn drain_field(field: &mut Field<'_>) -> UploadResult<u64> {
    let mut bytes = 0u64;
    while let Some(chunk) = field
        .chunk()
        .await
        .whatever("failed to read multipart field data")?
    {
        bytes += chunk.len() as u64;
    }
    Ok(bytes)
}

#[derive(Debug, Deserialize)]
#[serde(tag = "event")]
enum CtrlEvent {
    UpdateProgress {
        progress: f64,
    },
    CompatibilityCheckSkipped {
        scope: events::CompatibilityCheckScope,
        reason: String,
    },
    AppActivationResult {
        app: String,
        generation: u64,
        outcome: events::AppActivationOutcome,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that every structured Rugix Ctrl event consumed by the UI is decoded.
    #[test]
    fn parses_supported_ctrl_events() {
        assert!(matches!(
            parse_ctrl_event(r#"{"event":"UpdateProgress","progress":42.5}"#),
            Ok(CtrlEvent::UpdateProgress { progress: 42.5 })
        ));
        assert!(matches!(
            parse_ctrl_event(
                r#"{"event":"CompatibilityCheckSkipped","scope":"app","reason":"requested"}"#
            ),
            Ok(CtrlEvent::CompatibilityCheckSkipped { .. })
        ));
        assert!(matches!(
            parse_ctrl_event(
                r#"{"event":"AppActivationResult","app":"demo","generation":2,"outcome":"rolled-back"}"#
            ),
            Ok(CtrlEvent::AppActivationResult {
                outcome: events::AppActivationOutcome::RolledBack,
                ..
            })
        ));
    }

    /// Verifies that ordinary process output remains visible as a log line.
    #[test]
    fn leaves_ordinary_output_unparsed() {
        assert!(parse_ctrl_event("installing payload").is_err());
        assert!(parse_ctrl_event(r#"{"event":"FutureEvent"}"#).is_err());
    }
}
