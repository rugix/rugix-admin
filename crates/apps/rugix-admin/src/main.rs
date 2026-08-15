//! Rugix Admin HTTP service.
//!
//! The service exposes a typed local management API, runs Rugix Ctrl operations as
//! tracked jobs, and serves the embedded browser interface.

use std::net::SocketAddr;
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
mod terminal_output;

sidex::include_bundle!(pub rugix_admin as generated);

use error::ApiError;
use jobs::JobManager;

static FRONTEND: Dir<'_> = include_dir!("$OUT_DIR/frontend-dist");

type ApiResult<T> = Result<T, ApiError>;

reportify::new_whatever_type! {
    /// Rugix Admin application error.
    pub(crate) AdminError
}

type AdminResult<T> = Result<T, Report<AdminError>>;

#[derive(Debug, Clone, Parser)]
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

    let state = ServerState {
        jobs: JobManager::default(),
    };

    let app = Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/daemon", get(handlers::daemon_info))
        .route("/api/system/info", get(handlers::system_info))
        .route("/api/components", get(handlers::components))
        .route(
            "/api/system/update/:job_id",
            post(handlers::upload_system_update),
        )
        .route(
            "/api/system/update/:job_id/url",
            post(handlers::install_system_update_from_url),
        )
        .route("/api/system/actions/:action", post(handlers::system_action))
        .route("/api/apps", get(handlers::list_apps))
        .route(
            "/api/apps/install/:job_id",
            post(handlers::upload_app_bundle),
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
        .layer(middleware::from_fn(trace_request))
        .layer(DefaultBodyLimit::disable())
        .with_state(state);

    Server::bind(&address)
        .serve(app.into_make_service())
        .await
        .whatever("failed to serve Rugix Admin")
        .field_display("address", address)?;
    Ok(())
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
    use super::*;

    /// Verifies that configuration, rather than Clap, supplies the default address.
    #[test]
    fn address_has_no_cli_default() {
        let args = Args::try_parse_from(["rugix-admin"]).unwrap();

        assert_eq!(args.address, None);
    }
}
