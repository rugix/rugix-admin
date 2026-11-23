//! Rugix Ctrl process execution and streamed job integration.
//!
//! This module runs typed query commands, forwards bundle uploads, and translates
//! machine-readable Rugix Ctrl events into Rugix Admin job events.

use std::io;
use std::process::Output;
use std::process::Stdio;

use axum::extract::multipart::Field;
use axum::extract::Multipart;
use axum::http::StatusCode;
use reportify::Report;
use reportify::ResultExt;
use serde::de::DeserializeOwned;
use serde::Deserialize;
use tokio::io::AsyncBufRead;
use tokio::io::AsyncBufReadExt;
use tokio::io::AsyncRead;
use tokio::io::AsyncReadExt;
use tokio::io::AsyncWriteExt;
use tokio::io::BufReader;
use tokio::process::Child;
use tokio::process::Command;
use tokio::sync::Semaphore;
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
use crate::terminal_output::sanitize_terminal_bytes;
use crate::terminal_output::sanitize_terminal_text;
use crate::ApiResult;

const MAX_LINE_BYTES: usize = 16 * 1024;
static QUERY_SLOTS: Semaphore = Semaphore::const_new(8);

reportify::new_whatever_type! {
    /// Multipart upload processing error.
    UploadError
}

type UploadResult<T> = Result<T, Report<UploadError>>;

/// Rugix Ctrl command and the job metadata used to present it.
#[derive(Debug, Clone)]
pub(crate) struct CommandSpec {
    /// Operator-facing job title.
    pub(crate) title: String,
    /// Machine-readable operation category.
    pub(crate) kind: jobs::JobKind,
    /// Optional application or resource targeted by the command.
    pub(crate) target: Option<String>,
    /// Arguments passed to `rugix-ctrl`.
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
    let output = read_only_output(args).await?;

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
    let output = read_only_output(&args).await?;

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

async fn read_only_output(args: &[&str]) -> ApiResult<Output> {
    let _permit = QUERY_SLOTS
        .acquire()
        .await
        .expect("the read-only command semaphore is never closed");
    Command::new("rugix-ctrl")
        .args(args)
        .kill_on_drop(true)
        .output()
        .await
        .map_err(|err| ApiError::command_spawn("rugix-ctrl", err))
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
                    let _ = jobs
                        .fail(&job_id, format!("failed to spawn rugix-ctrl: {err}"), None)
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

/// Keeps processing an accepted upload if the request handler is cancelled.
pub(crate) async fn run_upload_job(
    jobs: JobManager,
    job_id: String,
    args: Vec<String>,
    multipart: Multipart,
    file_field: &'static str,
) -> ApiResult<jobs::Job> {
    let task = tokio::spawn(stream_upload_job(
        jobs.clone(),
        job_id.clone(),
        args,
        multipart,
        file_field,
    ));
    match task.await {
        Ok(result) => result,
        Err(error) => {
            error!(%job_id, %error, "upload task failed");
            let _ = jobs
                .fail(&job_id, "upload task failed".to_owned(), None)
                .await;
            Err(ApiError::request_rejection(
                StatusCode::INTERNAL_SERVER_ERROR,
                "upload-task-failed",
                "upload task failed",
            ))
        }
    }
}

#[tracing::instrument(level = "info", skip_all, fields(%job_id, %file_field))]
async fn stream_upload_job(
    jobs: JobManager,
    job_id: String,
    args: Vec<String>,
    mut multipart: Multipart,
    file_field: &'static str,
) -> ApiResult<jobs::Job> {
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
            drain_upload_after_failure(&job_id, &mut multipart).await;
            return jobs
                .fail(&job_id, format!("failed to spawn rugix-ctrl: {err}"), None)
                .await;
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
        drain_upload_after_failure(&job_id, &mut multipart).await;
        wait_for_child(
            jobs.clone(),
            job_id.clone(),
            child,
            stdout_task,
            stderr_task,
            false,
        )
        .await;
        return jobs
            .fail(&job_id, "rugix-ctrl stdin is unavailable".to_owned(), None)
            .await;
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

    drop(stdin);
    if let Some(message) = upload_error {
        wait_for_child(
            jobs.clone(),
            job_id.clone(),
            child,
            stdout_task,
            stderr_task,
            false,
        )
        .await;
        return jobs.fail(&job_id, message, None).await;
    }

    info!(
        %job_id,
        bytes_read,
        bytes_written,
        "upload streamed to rugix-ctrl"
    );
    let job = jobs.get(&job_id).await;
    spawn_wait_for_child(jobs, job_id, child, stdout_task, stderr_task);
    job
}

fn spawn_wait_for_child(
    jobs: JobManager,
    job_id: String,
    child: Child,
    stdout_task: Option<JoinHandle<()>>,
    stderr_task: Option<JoinHandle<()>>,
) {
    let span = tracing::info_span!("rugix_ctrl_wait", %job_id);
    tokio::spawn(
        async move {
            wait_for_child(jobs, job_id, child, stdout_task, stderr_task, true).await;
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
                let _ = jobs
                    .fail(
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
    let mut reader = BufReader::new(reader);
    let mut bytes = Vec::new();
    loop {
        bytes.clear();
        match (&mut reader)
            .take(MAX_LINE_BYTES as u64 + 1)
            .read_until(b'\n', &mut bytes)
            .await
        {
            Ok(0) => break,
            Ok(_) => {
                if bytes.last() == Some(&b'\n') {
                    bytes.pop();
                }
                let truncated = bytes.len() > MAX_LINE_BYTES;
                if !truncated && bytes.last() == Some(&b'\r') {
                    bytes.pop();
                }
                bytes.truncate(MAX_LINE_BYTES);
                let mut line = sanitize_terminal_bytes(&bytes);
                if truncated {
                    line.push('…');
                }
                debug!(%job_id, ?stream, "received rugix-ctrl output line");
                if !truncated
                    && matches!(stream, events::JobOutputStream::Stdout)
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
                if truncated {
                    if let Err(err) = discard_line_tail(&mut reader).await {
                        warn!(%job_id, ?stream, error = %err, "failed to discard rugix-ctrl output");
                        break;
                    }
                }
            }
            Err(err) => {
                warn!(%job_id, ?stream, error = %err, "failed to read rugix-ctrl output");
                break;
            }
        }
    }
}

/// Consumes the remainder of an oversized line without allocating a buffer.
async fn discard_line_tail(reader: &mut (impl AsyncBufRead + Unpin)) -> io::Result<()> {
    loop {
        let bytes = reader.fill_buf().await?;
        if bytes.is_empty() {
            return Ok(());
        }
        if let Some(newline) = bytes.iter().position(|byte| *byte == b'\n') {
            reader.consume(newline + 1);
            return Ok(());
        }
        let len = bytes.len();
        reader.consume(len);
    }
}

/// Emits a parsed machine-readable Rugix Ctrl event.
async fn emit_ctrl_event(jobs: &JobManager, job_id: &str, event: CtrlEvent) {
    match event {
        CtrlEvent::UpdateProgress { progress } => {
            if progress.is_finite() {
                jobs.emit_install_progress(job_id, progress.clamp(0.0, 100.0))
                    .await;
            } else {
                warn!(%job_id, progress, "ignoring non-finite Rugix Ctrl update progress");
            }
        }
        CtrlEvent::CompatibilityCheckSkipped { scope, reason } => {
            jobs.emit_compatibility_check_skipped(job_id, scope, sanitize_terminal_text(&reason))
                .await;
        }
        CtrlEvent::AppActivationResult {
            app,
            generation,
            outcome,
        } => {
            jobs.emit_app_activation_result(
                job_id,
                sanitize_terminal_text(&app),
                generation,
                outcome,
            )
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

    /// Verifies truncation at EOF and resumption after an oversized line's newline.
    #[tokio::test]
    async fn truncates_oversized_output() {
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
        let oversized = "x".repeat(1024 * 1024);
        let input = format!("{oversized}\nnext line\n{oversized}");
        read_output_lines(
            manager.clone(),
            job.id.clone().into(),
            events::JobOutputStream::Stdout,
            input.as_bytes(),
        )
        .await;

        let (history, _) = manager.subscribe(&job.id).await.unwrap();
        let lines: Vec<_> = history
            .iter()
            .filter_map(|event| match &event.event {
                events::AdminEvent::JobOutput(output) => Some(output.line.as_str()),
                _ => None,
            })
            .collect();
        let truncated = format!("{}…", "x".repeat(MAX_LINE_BYTES));
        assert_eq!(lines, [truncated.as_str(), "next line", truncated.as_str()]);
    }

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
