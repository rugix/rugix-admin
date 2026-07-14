use axum::http::header;
use axum::http::HeaderValue;
use axum::http::StatusCode;
use axum::http::Uri;
use axum::response::IntoResponse;
use axum::response::Response;
use reportify::ResultExt;

use crate::FRONTEND;

pub(crate) async fn static_asset(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "index.html" } else { path };
    let file = FRONTEND
        .get_file(path)
        .or_else(|| FRONTEND.get_file("index.html"));

    let Some(file) = file else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mime = mime_guess::from_path(file.path()).first_or_octet_stream();
    let mut response = file.contents().to_vec().into_response();
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime.as_ref())
            .assert_ok("a MIME type returned by mime_guess must be a valid HTTP header value"),
    );
    if file.path().file_name().and_then(|name| name.to_str()) == Some("index.html") {
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    }
    response
}
