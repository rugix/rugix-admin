use std::convert::Infallible;

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
use serde_json::Value;
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
use crate::ApiResult;
use crate::ServerState;

pub(crate) async fn health() -> Json<api::HealthResponse> {
    Json(api::HealthResponse::new("ok".to_owned()))
}

pub(crate) async fn daemon_info() -> ApiResult<Json<api::DaemonInfoResponse>> {
    let raw = run_json_command(&["daemon", "info", "--json"]).await?;
    let response = serde_json::from_value(raw).map_err(ApiError::invalid_ctrl_output)?;
    Ok(Json(response))
}

pub(crate) async fn system_info() -> ApiResult<Json<api::SystemInfoResponse>> {
    let raw = run_json_command(&["system", "info", "--json"]).await?;
    let response = serde_json::from_value(raw).map_err(ApiError::invalid_ctrl_output)?;
    Ok(Json(response))
}

pub(crate) async fn components() -> ApiResult<Json<api::ComponentsCheckResponse>> {
    let raw = run_components_check_command().await?;
    let response = serde_json::from_value(raw).map_err(ApiError::invalid_ctrl_output)?;
    Ok(Json(response))
}

pub(crate) async fn upload_system_update(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    Query(query): Query<SystemInstallQuery>,
    multipart: Multipart,
) -> ApiResult<Json<api::JobResponse>> {
    let args = system_update_args(query, "-".to_owned());

    state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install system update".to_owned(),
            "system-update".to_owned(),
            None,
        )
        .await?;
    stream_upload_job(state.jobs.clone(), job_id.clone(), args, multipart, "image").await;
    Ok(Json(api::JobResponse::new(state.jobs.get(&job_id).await?)))
}

pub(crate) async fn install_system_update_from_url(
    State(state): State<ServerState>,
    Path(job_id): Path<String>,
    Query(query): Query<SystemInstallQuery>,
    Json(request): Json<SystemUpdateUrlRequest>,
) -> ApiResult<Json<api::JobResponse>> {
    let args = system_update_args(query, request.url.trim().to_owned());
    let url = request.url.trim();
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err(ApiError::bad_request(
            "invalid-url",
            "system update URL must start with http:// or https://",
        ));
    }

    let job = state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install system update".to_owned(),
            "system-update".to_owned(),
            None,
        )
        .await?;
    spawn_command_job(state.jobs.clone(), job_id, args);
    Ok(Json(api::JobResponse::new(job)))
}

pub(crate) async fn system_action(
    State(state): State<ServerState>,
    Path(action): Path<String>,
) -> ApiResult<Json<api::JobResponse>> {
    let spec = match action.as_str() {
        "factory-reset" => CommandSpec::new(
            "Factory reset",
            "system-action",
            None,
            ["state", "reset"].into_iter().map(str::to_owned).collect(),
        ),
        "commit" => CommandSpec::new(
            "Commit active system",
            "system-action",
            None,
            ["system", "commit"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        "reboot" => CommandSpec::new(
            "Reboot system",
            "system-action",
            None,
            ["system", "reboot"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        "reboot-spare" => CommandSpec::new(
            "Reboot into spare system",
            "system-action",
            None,
            ["system", "reboot", "--spare"]
                .into_iter()
                .map(str::to_owned)
                .collect(),
        ),
        _ => {
            return Err(ApiError::bad_request(
                "invalid-action",
                "invalid system action",
            ))
        }
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
        metadata: Option<Value>,
    }

    let raw = run_json_command(&["apps", "list"]).await?;
    let entries: IndexMap<String, CliAppEntry> =
        serde_json::from_value(raw).map_err(ApiError::invalid_ctrl_output)?;
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
    Query(query): Query<AppInstallQuery>,
    multipart: Multipart,
) -> ApiResult<Json<api::JobResponse>> {
    let mut args = vec!["apps".to_owned(), "install".to_owned()];
    apply_install_options(&mut args, &query.into_insecure_options());
    args.push("-".to_owned());

    state
        .jobs
        .create(
            Some(job_id.clone()),
            "Install app bundle".to_owned(),
            "app-install".to_owned(),
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

pub(crate) async fn app_info(Path(app): Path<String>) -> ApiResult<Json<api::AppInfoResponse>> {
    let raw = run_json_command(&["apps", "info", &app]).await?;
    let info = serde_json::from_value(raw).map_err(ApiError::invalid_ctrl_output)?;
    Ok(Json(info))
}

pub(crate) async fn app_action(
    State(state): State<ServerState>,
    Path((app, action)): Path<(String, String)>,
    Query(query): Query<AppActionQuery>,
) -> ApiResult<Json<api::JobResponse>> {
    let mut args = vec!["apps".to_owned()];
    let title;
    match action.as_str() {
        "start" => {
            title = format!("Start {app}");
            args.extend(["start".to_owned(), app.clone()]);
        }
        "stop" => {
            title = format!("Stop {app}");
            args.extend(["stop".to_owned(), app.clone()]);
        }
        "activate" => {
            title = format!("Activate {app}");
            args.extend(["activate".to_owned(), app.clone()]);
            if let Some(generation) = query.generation {
                args.push(generation.to_string());
            }
        }
        "deactivate" => {
            title = format!("Deactivate {app}");
            args.extend(["deactivate".to_owned(), app.clone()]);
        }
        "rollback" => {
            title = format!("Rollback {app}");
            args.extend(["rollback".to_owned(), app.clone()]);
        }
        "remove" => {
            title = format!("Remove {app}");
            args.extend(["remove".to_owned(), app.clone()]);
        }
        "gc" => {
            title = format!("Garbage collect {app}");
            args.extend(["gc".to_owned(), app.clone()]);
            if let Some(keep) = query.keep {
                args.extend(["--keep".to_owned(), keep.to_string()]);
            }
        }
        _ => {
            return Err(ApiError::bad_request(
                "invalid-action",
                "invalid app action",
            ))
        }
    }
    let job = state
        .jobs
        .create(None, title, "app-action".to_owned(), Some(app))
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
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => return None,
            }
        }
    });
    Ok(Sse::new(stream).keep_alive(KeepAlive::default()))
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct AppActionQuery {
    generation: Option<u64>,
    keep: Option<usize>,
}

#[derive(Debug, Default)]
pub(crate) struct InsecureInstallOptions {
    bundle_hash: Option<String>,
    root_cert: Option<String>,
    insecure_skip_bundle_verification: Option<bool>,
    insecure_allow_missing_block_index: Option<bool>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SystemInstallQuery {
    #[serde(alias = "bundle_hash")]
    bundle_hash: Option<String>,
    #[serde(alias = "root_cert")]
    root_cert: Option<String>,
    #[serde(alias = "insecure_skip_bundle_verification")]
    insecure_skip_bundle_verification: Option<bool>,
    #[serde(alias = "insecure_allow_missing_block_index")]
    insecure_allow_missing_block_index: Option<bool>,
    reboot: Option<String>,
    #[serde(alias = "boot_group")]
    boot_group: Option<String>,
    #[serde(alias = "keep_overlay")]
    keep_overlay: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SystemUpdateUrlRequest {
    url: String,
}

#[derive(Debug, Deserialize, Default)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct AppInstallQuery {
    #[serde(alias = "bundle_hash")]
    bundle_hash: Option<String>,
    #[serde(alias = "root_cert")]
    root_cert: Option<String>,
    #[serde(alias = "insecure_skip_bundle_verification")]
    insecure_skip_bundle_verification: Option<bool>,
    #[serde(alias = "insecure_allow_missing_block_index")]
    insecure_allow_missing_block_index: Option<bool>,
}

impl SystemInstallQuery {
    fn into_parts(self) -> (InsecureInstallOptions, SystemInstallOptions) {
        // Keep this destructuring exhaustive: every future API option must be
        // explicitly classified as secure or insecure before the code compiles.
        let Self {
            bundle_hash,
            root_cert,
            insecure_skip_bundle_verification,
            insecure_allow_missing_block_index,
            reboot,
            boot_group,
            keep_overlay,
        } = self;
        (
            InsecureInstallOptions {
                bundle_hash,
                root_cert,
                insecure_skip_bundle_verification,
                insecure_allow_missing_block_index,
            },
            SystemInstallOptions {
                reboot,
                boot_group,
                keep_overlay,
            },
        )
    }
}

impl AppInstallQuery {
    fn into_insecure_options(self) -> InsecureInstallOptions {
        // Keep this destructuring exhaustive for the same fail-closed property
        // as `SystemInstallQuery::into_parts`.
        let Self {
            bundle_hash,
            root_cert,
            insecure_skip_bundle_verification,
            insecure_allow_missing_block_index,
        } = self;
        InsecureInstallOptions {
            bundle_hash,
            root_cert,
            insecure_skip_bundle_verification,
            insecure_allow_missing_block_index,
        }
    }
}

#[derive(Debug, Default)]
struct SystemInstallOptions {
    reboot: Option<String>,
    boot_group: Option<String>,
    keep_overlay: Option<bool>,
}

fn apply_install_options(args: &mut Vec<String>, options: &InsecureInstallOptions) {
    let InsecureInstallOptions {
        bundle_hash,
        root_cert,
        insecure_skip_bundle_verification,
        insecure_allow_missing_block_index,
    } = options;
    if insecure_skip_bundle_verification.unwrap_or(false) {
        args.push("--insecure-skip-bundle-verification".to_owned());
    }
    if insecure_allow_missing_block_index.unwrap_or(false) {
        args.push("--insecure-allow-missing-block-index".to_owned());
    }
    if let Some(root_cert) = root_cert {
        args.extend(["--root-cert".to_owned(), root_cert.clone()]);
    }
    if let Some(bundle_hash) = bundle_hash {
        args.extend(["--bundle-hash".to_owned(), bundle_hash.clone()]);
    }
}

fn system_update_args(query: SystemInstallQuery, bundle: String) -> Vec<String> {
    let (insecure_options, secure_options) = query.into_parts();
    let mut args = vec!["update".to_owned(), "install".to_owned()];
    apply_install_options(&mut args, &insecure_options);
    let SystemInstallOptions {
        reboot,
        boot_group,
        keep_overlay,
    } = secure_options;
    if let Some(reboot) = reboot {
        args.extend(["--reboot".to_owned(), reboot]);
    }
    if let Some(boot_group) = boot_group {
        args.extend(["--boot-group".to_owned(), boot_group]);
    }
    if keep_overlay.unwrap_or(false) {
        args.push("--keep-overlay".to_owned());
    }
    args.push(bundle);
    args
}

fn sse_event(event: events::AdminEvent) -> Event {
    let event_name = match &event {
        events::AdminEvent::JobChanged(_) => "job-changed",
        events::AdminEvent::JobOutput(_) => "job-output",
        events::AdminEvent::UploadProgress(_) => "upload-progress",
        events::AdminEvent::InstallProgress(_) => "install-progress",
    };
    Event::default().event(event_name).data(
        serde_json::to_string(&event)
            .assert_ok("a Sidex-generated admin event must serialize to JSON"),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_info_accepts_missing_boot_flow_and_all_state_details() {
        let info = serde_json::from_value::<api::SystemInfoResponse>(serde_json::json!({
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
        }))
        .unwrap();

        assert!(info.boot.is_none());
        assert!(matches!(info.state, api::SystemStateInfo::Active(_)));
        assert!(
            serde_json::from_value::<api::SystemInfoResponse>(serde_json::json!({
                "slots": {},
                "state": { "status": "EphemeralFallback" }
            }))
            .is_ok()
        );
    }

    #[test]
    fn forwards_install_options_for_daemon_authorization() {
        let query = InsecureInstallOptions {
            bundle_hash: Some("sha256:abc".to_owned()),
            root_cert: Some("/etc/rugix/root.pem".to_owned()),
            insecure_skip_bundle_verification: Some(true),
            insecure_allow_missing_block_index: Some(true),
        };
        let mut args = Vec::new();

        apply_install_options(&mut args, &query);

        assert_eq!(
            args,
            [
                "--insecure-skip-bundle-verification",
                "--insecure-allow-missing-block-index",
                "--root-cert",
                "/etc/rugix/root.pem",
                "--bundle-hash",
                "sha256:abc",
            ]
        );
    }

    #[test]
    fn install_queries_reject_unknown_options() {
        assert!(serde_urlencoded::from_str::<SystemInstallQuery>("futureOption=true").is_err());
        assert!(serde_urlencoded::from_str::<AppInstallQuery>("futureOption=true").is_err());
        assert!(serde_json::from_str::<SystemUpdateUrlRequest>(
            r#"{"url":"https://example.com/update.rugixb","futureOption":true}"#
        )
        .is_err());
    }
}
