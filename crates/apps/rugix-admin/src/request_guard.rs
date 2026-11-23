//! Request checks and response policies for Rugix Admin's browser interface.

use std::net::IpAddr;
use std::net::Ipv6Addr;

use axum::body::Body;
use axum::extract::State;
use axum::http::header;
use axum::http::uri::Authority;
use axum::http::HeaderMap;
use axum::http::HeaderValue;
use axum::http::Method;
use axum::http::Request;
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::IntoResponse;
use axum::response::Response;
use sidex::types::Seq;
use sidex::types::Str;

use crate::error::ApiError;

const MUTATION_HEADER: &str = "x-rugix-admin";
const CSP: &str = "default-src 'self'; script-src 'self'; style-src 'self'; \
    img-src 'self' data:; connect-src 'self'; object-src 'none'; \
    base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/// Configured host names accepted alongside IP literals and localhost.
#[derive(Debug, Clone)]
pub(crate) struct AllowedHosts(Seq<Str>);

impl AllowedHosts {
    pub(crate) fn new(hosts: Seq<Str>) -> Self {
        Self(hosts)
    }

    fn permits(&self, authority: &Authority) -> bool {
        let value = authority.as_str();
        if value.contains('@') {
            return false;
        }
        let host = authority.host();
        let suffix = &value[host.len()..];
        if host.is_empty() || (!suffix.is_empty() && !valid_port_suffix(suffix)) {
            return false;
        }
        if let Some(ipv6) = host
            .strip_prefix('[')
            .and_then(|host| host.strip_suffix(']'))
        {
            return ipv6.parse::<Ipv6Addr>().is_ok();
        }
        host.parse::<IpAddr>().is_ok()
            || host.eq_ignore_ascii_case("localhost")
            || self
                .0
                .iter()
                .any(|allowed| host.eq_ignore_ascii_case(allowed))
    }
}

/// Rejects requests outside the configured browser trust boundary.
pub(crate) async fn guard(
    State(allowed): State<AllowedHosts>,
    request: Request<Body>,
    next: Next<Body>,
) -> Response {
    let mut hosts = request.headers().get_all(header::HOST).into_iter();
    let host_allowed = hosts
        .next()
        .and_then(|host| host.to_str().ok()?.parse::<Authority>().ok())
        .is_some_and(|authority| allowed.permits(&authority))
        && hosts.next().is_none()
        && request
            .uri()
            .authority()
            .is_none_or(|authority| allowed.permits(authority));
    if !host_allowed {
        return ApiError::request_rejection(
            StatusCode::MISDIRECTED_REQUEST,
            "host-not-allowed",
            "the request's Host is not allowed; add it to allowed-hosts",
        )
        .into_response();
    }

    let path = request.uri().path();
    if (path == "/api" || path.starts_with("/api/"))
        && !matches!(
            *request.method(),
            Method::GET | Method::HEAD | Method::OPTIONS
        )
        && !permits_mutation(request.headers())
    {
        return ApiError::request_rejection(
            StatusCode::FORBIDDEN,
            "cross-site-request",
            "state-changing requests require X-Rugix-Admin: 1 and must be same-origin",
        )
        .into_response();
    }
    next.run(request).await
}

/// Adds browser security headers to assets, API responses, and rejections.
pub(crate) async fn security_headers(request: Request<Body>, next: Next<Body>) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(CSP),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    response
}

fn valid_port_suffix(suffix: &str) -> bool {
    suffix.strip_prefix(':').is_some_and(|port| {
        port.bytes().all(|byte| byte.is_ascii_digit()) && port.parse::<u16>().is_ok()
    })
}

fn permits_mutation(headers: &HeaderMap) -> bool {
    let mut markers = headers.get_all(MUTATION_HEADER).into_iter();
    markers
        .next()
        .is_some_and(|marker| marker.as_bytes() == b"1")
        && markers.next().is_none()
        && headers
            .get_all("sec-fetch-site")
            .iter()
            .all(|value| matches!(value.as_bytes(), b"same-origin" | b"none"))
}
