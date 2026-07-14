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
pub struct Args {
    /// The address to bind to (overrides /etc/rugix/admin.toml).
    #[clap(long)]
    pub address: Option<SocketAddr>,
    /// Allow options that weaken bundle verification.
    #[clap(long)]
    pub dangerously_insecure: bool,
    #[clap(flatten)]
    logging: si_observability::clap4::LoggingArgs,
}

#[derive(Debug, Clone)]
pub(crate) struct ServerState {
    jobs: JobManager,
    dangerously_insecure: bool,
}

#[tokio::main]
async fn main() -> AdminResult<()> {
    reportify::install_pretty_panic_hook();
    let args = Args::parse();
    let config = config::load()?;
    let address = config::resolve_address(args.address, &config);
    let dangerously_insecure =
        config::resolve_dangerously_insecure(args.dangerously_insecure, &config);
    let _guard = si_observability::Initializer::new("RUGIX")
        .apply(&args.logging)
        .init();

    info!(%address, dangerously_insecure, "starting Rugix Admin");

    let state = ServerState {
        jobs: JobManager::default(),
        dangerously_insecure,
    };

    let app = Router::new()
        .route("/api/health", get(handlers::health))
        .route("/api/config", get(handlers::configuration))
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
        .route("/api/apps/:app", get(handlers::app_info))
        .route("/api/apps/:app/actions/:action", post(handlers::app_action))
        .route("/api/jobs", get(handlers::list_jobs))
        .route("/api/jobs/:job_id", get(handlers::get_job))
        .route("/api/jobs/:job_id/events", get(handlers::job_events))
        .fallback(assets::static_asset)
        .layer(middleware::from_fn(trace_request))
        .layer(DefaultBodyLimit::disable())
        .with_state(state);

    Server::bind(&address)
        .serve(app.into_make_service())
        .await
        .whatever("unable to serve Rugix Admin")
        .field_display("address", address)?;
    Ok(())
}

async fn trace_request(request: Request<Body>, next: Next<Body>) -> Response {
    let method = request.method().clone();
    let uri = request.uri().clone();
    let started = Instant::now();
    let span = tracing::info_span!("request", %method, uri = %uri);

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

    #[test]
    fn address_has_no_cli_default() {
        let args = Args::try_parse_from(["rugix-admin"]).unwrap();

        assert_eq!(args.address, None);
        assert!(!args.dangerously_insecure);
    }

    #[test]
    fn dangerously_insecure_can_be_enabled_on_cli() {
        let args = Args::try_parse_from(["rugix-admin", "--dangerously-insecure"]).unwrap();

        assert!(args.dangerously_insecure);
    }
}
