//! Rugix Admin HTTP service and command-line interface.
//!
//! The service exposes a typed local management API, runs Rugix Ctrl operations as
//! tracked jobs, reports build information, and serves the embedded browser
//! interface.

use std::net::SocketAddr;
use std::time::Duration;
use std::time::Instant;

use axum::body::Body;
use axum::extract::DefaultBodyLimit;
use axum::http::Request;
use axum::middleware;
use axum::middleware::Next;
use axum::response::Response;
use axum::routing::get;
use axum::routing::post;
use axum::Router;
use axum::Server;
use clap::Parser;
use include_dir::include_dir;
use include_dir::Dir;
use reportify::Report;
use reportify::ResultExt;
use tracing::debug;
use tracing::error;
use tracing::info;
use tracing::warn;
use tracing::Instrument;

mod assets;
mod config;
mod ctrl;
mod error;
mod handlers;
mod jobs;
mod operation_options;
mod request_guard;
mod terminal_output;

sidex::include_bundle!(pub rugix_admin as generated);

use error::ApiError;
use jobs::JobManager;
use request_guard::AllowedHosts;

/// Version reported by the CLI and HTTP API.
pub(crate) const RUGIX_ADMIN_VERSION: &str = env!("RUGIX_ADMIN_VERSION");

const DEFAULT_BODY_LIMIT: usize = 64 * 1024;
const HEADER_READ_TIMEOUT: Duration = Duration::from_secs(30);

static FRONTEND: Dir<'_> = include_dir!("$OUT_DIR/frontend-dist");

type ApiResult<T> = Result<T, ApiError>;

reportify::new_whatever_type! {
    /// Rugix Admin application error.
    pub(crate) AdminError
}

type AdminResult<T> = Result<T, Report<AdminError>>;

#[derive(Debug, Clone, Parser)]
#[command(version = RUGIX_ADMIN_VERSION)]
struct Args {
    /// The address to bind to (overrides /etc/rugix/admin.toml).
    #[clap(long)]
    address: Option<SocketAddr>,
    #[clap(flatten)]
    logging: si_observability::clap4::LoggingArgs,
}

/// Shared state available to every HTTP handler.
#[derive(Debug, Clone)]
pub(crate) struct ServerState {
    jobs: JobManager,
}

#[tokio::main]
async fn main() -> AdminResult<()> {
    reportify::install_pretty_panic_hook();
    let args = Args::parse();
    let config = config::load()?;
    let address = config::resolve_address(args.address, &config);
    let _guard = si_observability::Initializer::new("RUGIX")
        .apply(&args.logging)
        .init();

    info!(%address, "starting Rugix Admin");

    let allowed_hosts = AllowedHosts::new(config.allowed_hosts.unwrap_or_default());
    Server::bind(&address)
        .http1_header_read_timeout(HEADER_READ_TIMEOUT)
        .serve(router(allowed_hosts, JobManager::default()).into_make_service())
        .await
        .whatever("failed to serve Rugix Admin")
        .field_display("address", address)?;
    Ok(())
}

fn router(allowed_hosts: AllowedHosts, jobs: JobManager) -> Router {
    Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/info", get(handlers::admin_info))
        .route("/api/daemon", get(handlers::daemon_info))
        .route("/api/system/info", get(handlers::system_info))
        .route("/api/components", get(handlers::components))
        .route(
            "/api/system/update/:job_id",
            post(handlers::upload_system_update).layer(DefaultBodyLimit::disable()),
        )
        .route(
            "/api/system/update/:job_id/url",
            post(handlers::install_system_update_from_url),
        )
        .route("/api/system/actions/:action", post(handlers::system_action))
        .route("/api/apps", get(handlers::list_apps))
        .route(
            "/api/apps/install/:job_id",
            post(handlers::upload_app_bundle).layer(DefaultBodyLimit::disable()),
        )
        .route(
            "/api/apps/install/:job_id/url",
            post(handlers::install_app_bundle_from_url),
        )
        .route("/api/apps/actions/gc", post(handlers::garbage_collect_apps))
        .route("/api/apps/:app", get(handlers::app_info))
        .route("/api/apps/:app/actions/:action", post(handlers::app_action))
        .route("/api/jobs", get(handlers::list_jobs))
        .route("/api/events", get(handlers::server_events))
        .route("/api/jobs/:job_id", get(handlers::get_job))
        .route("/api/jobs/:job_id/events", get(handlers::job_events))
        .fallback(assets::static_asset)
        .layer(DefaultBodyLimit::max(DEFAULT_BODY_LIMIT))
        .layer(middleware::from_fn_with_state(
            allowed_hosts,
            request_guard::guard,
        ))
        .layer(middleware::from_fn(trace_request))
        .layer(middleware::from_fn(request_guard::security_headers))
        .with_state(ServerState { jobs })
}

async fn trace_request(request: Request<Body>, next: Next<Body>) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_owned();
    let started = Instant::now();
    let span = tracing::info_span!("request", %method, %path);

    async move {
        debug!("handling request");
        let response = next.run(request).await;
        let status = response.status();
        let elapsed_ms = started.elapsed().as_millis();
        if status.is_server_error() {
            error!(%status, elapsed_ms, "request failed");
        } else if status.is_client_error() {
            warn!(%status, elapsed_ms, "request completed with client error");
        } else {
            info!(%status, elapsed_ms, "request completed");
        }
        response
    }
    .instrument(span)
    .await
}

#[cfg(test)]
mod tests {
    use axum::body::HttpBody;
    use axum::http::header;
    use axum::http::request::Builder;
    use axum::http::StatusCode;
    use tower::ServiceExt;

    use super::*;
    use crate::generated::api;
    use crate::generated::jobs;

    fn app(jobs: JobManager) -> Router {
        router(AllowedHosts::new(vec!["device.local".into()].into()), jobs)
    }

    fn post_request(path: &str) -> Builder {
        Request::post(path).header(header::HOST, "localhost:7492")
    }

    async fn assert_api_error(response: Response, status: StatusCode, code: &str) {
        assert_eq!(response.status(), status);
        let bytes = response.into_body().data().await.unwrap().unwrap();
        let body: api::ApiErrorResponse = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body.error.code, code);
    }

    /// Verifies the mutation marker and fetch metadata on the commit route.
    #[tokio::test]
    async fn commit_requires_same_origin_marker() {
        let app = app(JobManager::default());
        // The handler rejects backup options for commit without running Rugix Ctrl.
        let path = "/api/system/actions/commit?backup=true";
        for (marker, fetch_site, status, code) in [
            (None, None, StatusCode::FORBIDDEN, "cross-site-request"),
            (
                Some("1"),
                Some("cross-site"),
                StatusCode::FORBIDDEN,
                "cross-site-request",
            ),
            (
                Some("1"),
                Some("same-site"),
                StatusCode::FORBIDDEN,
                "cross-site-request",
            ),
            (
                Some("1"),
                Some("same-origin"),
                StatusCode::BAD_REQUEST,
                "invalid-action-options",
            ),
            (
                Some("1"),
                Some("none"),
                StatusCode::BAD_REQUEST,
                "invalid-action-options",
            ),
            (
                Some("1"),
                None,
                StatusCode::BAD_REQUEST,
                "invalid-action-options",
            ),
        ] {
            let mut request = post_request(path);
            if let Some(marker) = marker {
                request = request.header("X-Rugix-Admin", marker);
            }
            if let Some(fetch_site) = fetch_site {
                request = request.header("Sec-Fetch-Site", fetch_site);
            }
            let response = app
                .clone()
                .oneshot(request.body(Body::empty()).unwrap())
                .await
                .unwrap();
            assert_api_error(response, status, code).await;
        }
    }

    /// Verifies that the asset fallback accepts only trusted host authorities.
    #[tokio::test]
    async fn asset_host_allowlist() {
        let app = app(JobManager::default());
        for host in [
            "192.0.2.10:7492",
            "[::1]:7492",
            "localhost:7492",
            "DEVICE.LOCAL:7492",
        ] {
            let request = Request::get("/")
                .header(header::HOST, host)
                .body(Body::empty())
                .unwrap();
            assert_eq!(
                app.clone().oneshot(request).await.unwrap().status(),
                StatusCode::OK
            );
        }
        for host in ["attacker.example", "[::1]suffix", "localhost:invalid", ""] {
            let request = Request::get("/")
                .header(header::HOST, host)
                .body(Body::empty())
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            assert_api_error(
                response,
                StatusCode::MISDIRECTED_REQUEST,
                "host-not-allowed",
            )
            .await;
        }
    }

    /// Verifies that read-only API calls can omit the mutation marker.
    #[tokio::test]
    async fn info_does_not_require_marker() {
        let request = Request::get("/api/info")
            .header(header::HOST, "localhost")
            .body(Body::empty())
            .unwrap();
        let response = app(JobManager::default()).oneshot(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    /// Verifies that assets, API responses, and guard rejections carry security headers.
    #[tokio::test]
    async fn responses_have_security_headers() {
        let app = app(JobManager::default());
        for (path, host, status) in [
            ("/", "localhost", StatusCode::OK),
            ("/api/health", "localhost", StatusCode::OK),
            ("/", "attacker.example", StatusCode::MISDIRECTED_REQUEST),
        ] {
            let request = Request::get(path)
                .header(header::HOST, host)
                .body(Body::empty())
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            assert_eq!(response.status(), status);
            let headers = response.headers();
            assert!(headers[header::CONTENT_SECURITY_POLICY]
                .to_str()
                .unwrap()
                .contains("frame-ancestors 'none'"));
            assert_eq!(headers[header::X_FRAME_OPTIONS], "DENY");
            assert_eq!(headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
            assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
        }
    }

    /// Verifies that the fifth queued or running job returns a conflict.
    #[tokio::test]
    async fn rejects_jobs_at_capacity() {
        let jobs = JobManager::default();
        for _ in 0..4 {
            jobs.create(
                None,
                "Existing job".to_owned(),
                jobs::JobKind::SystemAction,
                None,
            )
            .await
            .unwrap();
        }
        let request = post_request("/api/system/actions/commit")
            .header("X-Rugix-Admin", "1")
            .body(Body::empty())
            .unwrap();
        let response = app(jobs).oneshot(request).await.unwrap();
        assert_api_error(response, StatusCode::CONFLICT, "too-many-jobs").await;
    }

    /// Verifies that URL installs reject oversized JSON before starting a command.
    #[tokio::test]
    async fn limits_url_install_body_size() {
        let request = post_request("/api/system/update/8d71675f-c8c3-4a8a-8f7b-c8a772c76409/url")
            .header("X-Rugix-Admin", "1")
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(format!(
                r#"{{"url":"https://example.test/{}"}}"#,
                "a".repeat(100 * 1024)
            )))
            .unwrap();
        let response = app(JobManager::default()).oneshot(request).await.unwrap();
        assert_api_error(response, StatusCode::PAYLOAD_TOO_LARGE, "invalid-json").await;
    }

    /// Verifies that all installation routes reject non-UUID job IDs.
    #[tokio::test]
    async fn install_routes_require_uuids() {
        let app = app(JobManager::default());
        for path in [
            "/api/system/update/not-a-uuid",
            "/api/system/update/not-a-uuid/url",
            "/api/apps/install/not-a-uuid",
            "/api/apps/install/not-a-uuid/url",
        ] {
            let request = post_request(path)
                .header("X-Rugix-Admin", "1")
                .body(Body::empty())
                .unwrap();
            let response = app.clone().oneshot(request).await.unwrap();
            assert_api_error(response, StatusCode::BAD_REQUEST, "invalid-job-id").await;
        }
    }

    /// Verifies that configuration, rather than Clap, supplies the default address.
    #[test]
    fn address_has_no_cli_default() {
        let args = Args::try_parse_from(["rugix-admin"]).unwrap();

        assert_eq!(args.address, None);
    }
}
