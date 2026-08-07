//! HTTP handlers for the Rugix Admin API.
//!
//! The handlers translate requests into typed Rugix Ctrl commands and background jobs.

use std::convert::Infallible;

use axum::extract::multipart::MultipartRejection;
use axum::extract::rejection::JsonRejection;
use axum::extract::rejection::PathRejection;
use axum::extract::rejection::QueryRejection;
use axum::extract::Multipart;
use axum::extract::Path;
use axum::extract::Query;
use axum::extract::State;
use axum::response::sse::Event;
use axum::response::sse::KeepAlive;
use axum::response::sse::Sse;
use axum::Json;
use futures::Stream;
use indexmap::IndexMap;
use reportify::ResultExt;
use serde::Deserialize;
use tokio::sync::broadcast;

use crate::ctrl::run_components_check_command;
use crate::ctrl::run_json_command;
use crate::ctrl::spawn_command_job;
use crate::ctrl::stream_upload_job;
use crate::ctrl::CommandSpec;
use crate::error::ApiError;
use crate::generated::api;
use crate::generated::apps;
use crate::generated::events;
use crate::operation_options::app_install_args;
use crate::operation_options::apply_compatibility_override;
use crate::operation_options::invalid_action_options;
use crate::operation_options::is_http_url;
use crate::operation_options::reject_generation_and_keep_options;
use crate::operation_options::reject_keep_option;
use crate::operation_options::reject_unused_app_action_options;
use crate::operation_options::required_non_empty_option;
use crate::operation_options::system_update_args;
use crate::operation_options::AppActionQuery;
use crate::operation_options::AppGarbageCollectionQuery;
use crate::operation_options::AppInstallQuery;
use crate::operation_options::InstallFromUrlRequest;
use crate::operation_options::SystemActionQuery;
use crate::operation_options::SystemInstallQuery;
use crate::ApiResult;
use crate::ServerState;

pub(crate) async fn health() -> Json<api::HealthResponse> {
    Json(api::HealthResponse::new(api::HealthStatus::Ok))
}

pub(crate) async fn daemon_info() -> ApiResult<Json<api::DaemonInfoResponse>> {
    let response = run_json_command(&["daemon", "info", "--json"]).await?;
    Ok(Json(response))
}

pub(crate) async fn system_info() -> ApiResult<Json<api::SystemInfoResponse>> {
    let response = run_json_command(&["system", "info", "--json"]).await?;
    Ok(Json(response))
}

pub(crate) async fn components() -> ApiResult<Json<api::ComponentsCheckResponse>> {
    let response = run_components_check_command().await?;
    Ok(Json(response))
}

pub(crate) async fn upload_system_update(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    query: Result<Query<SystemInstallQuery>, QueryRejection>,
    multipart: Result<Multipart, MultipartRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Query(query) = query.map_err(invalid_query)?;
    let multipart = multipart.map_err(invalid_multipart)?;
    let args = system_update_args(query, "-".to_owned(), false)?;

    state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install system update".to_owned(),
            crate::generated::jobs::JobKind::SystemUpdate,
            None,
        )
        .await?;
    stream_upload_job(state.jobs.clone(), job_id.clone(), args, multipart, "image").await;
    Ok(Json(api::JobResponse::new(state.jobs.get(&job_id).await?)))
}

pub(crate) async fn install_system_update_from_url(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    query: Result<Query<SystemInstallQuery>, QueryRejection>,
    request: Result<Json<InstallFromUrlRequest>, JsonRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Query(query) = query.map_err(invalid_query)?;
    let Json(request) = request.map_err(invalid_json)?;
    let url = request.url.trim();
    if !is_http_url(url) {
        return Err(ApiError::bad_request(
            "invalid-url",
            "system update URL must be an absolute HTTP or HTTPS URL",
        ));
    }
    let args = system_update_args(query, url.to_owned(), true)?;

    let job = state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install system update".to_owned(),
            crate::generated::jobs::JobKind::SystemUpdate,
            None,
        )
        .await?;
    spawn_command_job(state.jobs.clone(), job_id, args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn system_action(
    State(state): State<ServerState>,
    path: Result<Path<api::SystemAction>, PathRejection>,
    query: Result<Query<SystemActionQuery>, QueryRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Path(action) = path.map_err(invalid_path)?;
    let Query(query) = query.map_err(invalid_query)?;
    let backup_name = required_non_empty_option("factory-reset backup name", query.backup_name)?;
    if !matches!(action, api::SystemAction::FactoryReset)
        && (query.backup.unwrap_or(false) || backup_name.is_some())
    {
        return Err(ApiError::bad_request(
            "invalid-action-options",
            "backup options apply only to factory reset",
        ));
    }
    let spec = match action {
        api::SystemAction::FactoryReset => {
            let mut args = vec!["state".to_owned(), "reset".to_owned()];
            if query.backup.unwrap_or(false) {
                args.push("--backup".to_owned());
                if let Some(name) = backup_name {
                    args.extend(["--backup-name".to_owned(), name]);
                }
            } else if backup_name.is_some() {
                return Err(ApiError::bad_request(
                    "invalid-action-options",
                    "a factory-reset backup name requires backup=true",
                ));
            }
            CommandSpec::new(
                "Factory reset",
                crate::generated::jobs::JobKind::SystemAction,
                None,
                args,
            )
        }
        api::SystemAction::Commit => CommandSpec::new(
            "Commit active system",
            crate::generated::jobs::JobKind::SystemAction,
            None,
            ["system", "commit"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        api::SystemAction::Reboot => CommandSpec::new(
            "Reboot system",
            crate::generated::jobs::JobKind::SystemAction,
            None,
            ["system", "reboot"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        api::SystemAction::RebootSpare => CommandSpec::new(
            "Reboot into spare system",
            crate::generated::jobs::JobKind::SystemAction,
            None,
            ["system", "reboot", "--spare"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
    };
    let job = state
        .jobs
        .create(None, spec.title, spec.kind, spec.target)
        .await?;
    spawn_command_job(state.jobs.clone(), job.id.clone(), spec.args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn list_apps() -> ApiResult<Json<api::AppsListResponse>> {
    #[derive(Debug, Deserialize)]
    struct CliAppEntry {
        status: apps::AppStatus,
        generation: Option<u64>,
        metadata: Option<api::JsonValue>,
    }

    let entries: IndexMap<String, CliAppEntry> = run_json_command(&["apps", "list"]).await?;
    let apps = entries
        .into_iter()
        .map(|(name, entry)| {
            api::AppSummary::new(name, entry.status)
                .with_generation(entry.generation)
                .with_metadata(entry.metadata)
        })
        .collect();
    Ok(Json(api::AppsListResponse::new(apps)))
}

pub(crate) async fn upload_app_bundle(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    query: Result<Query<AppInstallQuery>, QueryRejection>,
    multipart: Result<Multipart, MultipartRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Query(query) = query.map_err(invalid_query)?;
    let multipart = multipart.map_err(invalid_multipart)?;
    let args = app_install_args(query, "-".to_owned(), false)?;

    state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install app bundle".to_owned(),
            crate::generated::jobs::JobKind::AppInstall,
            None,
        )
        .await?;
    stream_upload_job(
        state.jobs.clone(),
        job_id.clone(),
        args,
        multipart,
        "bundle",
    )
    .await;
    Ok(Json(api::JobResponse::new(state.jobs.get(&job_id).await?)))
}

pub(crate) async fn install_app_bundle_from_url(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    query: Result<Query<AppInstallQuery>, QueryRejection>,
    request: Result<Json<InstallFromUrlRequest>, JsonRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Query(query) = query.map_err(invalid_query)?;
    let Json(request) = request.map_err(invalid_json)?;
    let url = request.url.trim();
    if !is_http_url(url) {
        return Err(ApiError::bad_request(
            "invalid-url",
            "application bundle URL must be an absolute HTTP or HTTPS URL",
        ));
    }
    let args = app_install_args(query, url.to_owned(), true)?;
    let job = state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install app bundle".to_owned(),
            crate::generated::jobs::JobKind::AppInstall,
            None,
        )
        .await?;
    spawn_command_job(state.jobs.clone(), job_id, args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn app_info(Path(app): Path<String>) -> ApiResult<Json<api::AppInfoResponse>> {
    let info = run_json_command(&["apps", "info", &app]).await?;
    Ok(Json(info))
}

pub(crate) async fn app_action(
    State(state): State<ServerState>,
    path: Result<Path<(String, api::AppAction)>, PathRejection>,
    query: Result<Query<AppActionQuery>, QueryRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Path((app, action)) = path.map_err(invalid_path)?;
    let Query(query) = query.map_err(invalid_query)?;
    let mut args = vec!["apps".to_owned()];
    let title;
    let AppActionQuery {
        generation,
        keep,
        skip_compatibility_check,
    } = query;
    match action {
        api::AppAction::Start => {
            reject_unused_app_action_options(generation, keep, skip_compatibility_check)?;
            title = format!("Start {app}");
            args.extend(["start".to_owned(), app.clone()]);
        }
        api::AppAction::Stop => {
            reject_unused_app_action_options(generation, keep, skip_compatibility_check)?;
            title = format!("Stop {app}");
            args.extend(["stop".to_owned(), app.clone()]);
        }
        api::AppAction::Activate => {
            reject_keep_option(keep)?;
            title = format!("Activate {app}");
            args.extend(["activate".to_owned(), app.clone()]);
            if let Some(generation) = generation {
                args.push(generation.to_string());
            }
            apply_compatibility_override(&mut args, skip_compatibility_check);
        }
        api::AppAction::Deactivate => {
            reject_generation_and_keep_options(generation, keep)?;
            title = format!("Deactivate {app}");
            args.extend(["deactivate".to_owned(), app.clone()]);
            apply_compatibility_override(&mut args, skip_compatibility_check);
        }
        api::AppAction::Rollback => {
            reject_generation_and_keep_options(generation, keep)?;
            title = format!("Rollback {app}");
            args.extend(["rollback".to_owned(), app.clone()]);
            apply_compatibility_override(&mut args, skip_compatibility_check);
        }
        api::AppAction::Remove => {
            reject_generation_and_keep_options(generation, keep)?;
            title = format!("Remove {app}");
            args.extend(["remove".to_owned(), app.clone()]);
            apply_compatibility_override(&mut args, skip_compatibility_check);
        }
        api::AppAction::Gc => {
            if generation.is_some() || skip_compatibility_check.unwrap_or(false) {
                return Err(invalid_action_options());
            }
            title = format!("Garbage collect {app}");
            args.extend(["gc".to_owned(), app.clone()]);
            if let Some(keep) = keep {
                args.extend(["--keep".to_owned(), keep.to_string()]);
            }
        }
    }
    let job = state
        .jobs
        .create(
            None,
            title,
            crate::generated::jobs::JobKind::AppAction,
            Some(app),
        )
        .await?;
    spawn_command_job(state.jobs.clone(), job.id.clone(), args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn garbage_collect_apps(
    State(state): State<ServerState>,
    query: Result<Query<AppGarbageCollectionQuery>, QueryRejection>,
) -> ApiResult<Json<api::JobResponse>> {
    let Query(query) = query.map_err(invalid_query)?;
    let mut args = vec!["apps".to_owned(), "gc".to_owned()];
    if let Some(keep) = query.keep {
        args.extend(["--keep".to_owned(), keep.to_string()]);
    }
    let job = state
        .jobs
        .create(
            None,
            "Garbage collect apps".to_owned(),
            crate::generated::jobs::JobKind::AppAction,
            None,
        )
        .await?;
    spawn_command_job(state.jobs.clone(), job.id.clone(), args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn list_jobs(State(state): State<ServerState>) -> Json<api::JobsListResponse> {
    Json(api::JobsListResponse::new(state.jobs.list().await))
}

pub(crate) async fn get_job(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
) -> ApiResult<Json<api::JobResponse>> {
    let job = state.jobs.get(&job_id).await?;
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn job_events(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
) -> ApiResult<Sse<impl Stream<Item = Result<Event, Infallible>>>> {
    let (initial, rx) = state.jobs.subscribe(&job_id).await?;
    let stream = futures::stream::unfold((initial, rx), |(mut initial, mut rx)| async move {
        if let Some(event) = initial.pop_front() {
            return Some((Ok(sse_event(event)), (initial, rx)));
        }
        loop {
            match rx.recv().await {
                Ok(event) => return Some((Ok(sse_event(event)), (initial, rx))),
                Err(broadcast::error::RecvError::Lagged(skipped)) => {
                    tracing::warn!(skipped, "job event subscriber lagged");
                    continue;
                }
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

fn invalid_query(error: QueryRejection) -> ApiError {
    ApiError::request_rejection(
        error.status(),
        "invalid-query",
        format!("invalid query parameters: {error}"),
    )
}

fn invalid_path(error: PathRejection) -> ApiError {
    ApiError::request_rejection(
        error.status(),
        "invalid-path",
        format!("invalid path parameters: {error}"),
    )
}

fn invalid_json(error: JsonRejection) -> ApiError {
    ApiError::request_rejection(
        error.status(),
        "invalid-json",
        format!("invalid JSON request: {error}"),
    )
}

fn invalid_multipart(error: MultipartRejection) -> ApiError {
    ApiError::request_rejection(
        error.status(),
        "invalid-multipart",
        format!("invalid multipart upload: {error}"),
    )
}

fn sse_event(event: events::AdminEvent) -> Event {
    let event_name = match &event {
        events::AdminEvent::JobChanged(_) => "job-changed",
        events::AdminEvent::JobOutput(_) => "job-output",
        events::AdminEvent::UploadProgress(_) => "upload-progress",
        events::AdminEvent::InstallProgress(_) => "install-progress",
        events::AdminEvent::CompatibilityCheckSkipped(_) => "compatibility-check-skipped",
        events::AdminEvent::AppActivationResult(_) => "app-activation-result",
    };
    Event::default().event(event_name).data(
        serde_json::to_string(&event)
            .assert_ok("a Sidex-generated admin event must serialize to JSON"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that system information accepts every supported state detail and no boot
    /// flow.
    #[test]
    fn system_info_accepts_missing_boot_flow_and_all_state_details() {
        let info = serde_json::from_str::<api::SystemInfoResponse>(
            r#"{
                "slots": {
                    "system": {
                        "active": true,
                        "hashes": { "sha256": "abc" },
                        "size": 42,
                        "updatedAt": "2026-07-14T09:45:00Z"
                    }
                },
                "state": {
                    "status": "Active",
                    "dataPartition": "/dev/vda6"
                }
            }"#,
        )
        .unwrap();

        assert!(info.boot.is_none());
        assert!(matches!(info.state, api::SystemStateInfo::Active(_)));
        let error_info = serde_json::from_str::<api::SystemInfoResponse>(
            r#"{
                "slots": {},
                "state": {
                    "status": "Error",
                    "message": "The data partition failed to mount.",
                    "ephemeral": true
                }
            }"#,
        )
        .unwrap();
        assert!(matches!(
            error_info.state,
            api::SystemStateInfo::Error(ref error) if error.ephemeral == Some(true)
        ));

        assert!(serde_json::from_str::<api::SystemInfoResponse>(
            r#"{
                "slots": {},
                "state": { "status": "Error" }
            }"#,
        )
        .is_ok());
    }
}
