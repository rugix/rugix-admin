//! API error reporting and JSON response conversion.
//!
//! [`ApiError`] preserves diagnostic context for server logs while exposing a stable,
//! typed error response to HTTP clients.

use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::Response;
use axum::Json;
use reportify::Error as _;
use reportify::ErrorExt;
use reportify::Report;

use crate::generated::api;
use crate::terminal_output::sanitize_terminal_bytes;

#[derive(Debug)]
struct ApiErrorData {
    status: StatusCode,
    code: &'static str,
    message: String,
    details: Option<api::CommandFailureDetails>,
}

impl reportify::Error for ApiErrorData {
    fn message(&self) -> Option<&dyn std::fmt::Display> {
        Some(&self.message)
    }

    fn code(&self) -> Option<&'static str> {
        Some(self.code)
    }

    fn type_name(&self) -> &'static str {
        "rugix_admin.api"
    }
}

/// Report-backed error converted into the stable Sidex API error contract.
#[derive(Debug)]
pub(crate) struct ApiError(Report<ApiErrorData>);

impl ApiError {
    fn data(status: StatusCode, code: &'static str, message: impl Into<String>) -> ApiErrorData {
        ApiErrorData {
            status,
            code,
            message: message.into(),
            details: None,
        }
    }

    fn from_data(error: ApiErrorData) -> Self {
        Self(Report::new(error))
    }

    pub(crate) fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self::from_data(Self::data(StatusCode::BAD_REQUEST, code, message))
    }

    pub(crate) fn request_rejection(
        status: StatusCode,
        code: &'static str,
        message: impl Into<String>,
    ) -> Self {
        Self::from_data(Self::data(status, code, message))
    }

    pub(crate) fn conflict(code: &'static str, message: impl Into<String>) -> Self {
        Self::from_data(Self::data(StatusCode::CONFLICT, code, message))
    }

    pub(crate) fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::from_data(Self::data(StatusCode::NOT_FOUND, code, message))
    }

    pub(crate) fn command_spawn(command: &str, err: std::io::Error) -> Self {
        let error = Self::data(
            StatusCode::BAD_GATEWAY,
            "command-spawn-failed",
            format!("failed to spawn {command}: {err}"),
        );
        Self(
            err.escalate(error)
                .message("failed to start command")
                .field("command", command),
        )
    }

    pub(crate) fn command_failed(command: &str, output: &std::process::Output) -> Self {
        let stdout = sanitize_terminal_bytes(&output.stdout);
        let stderr = sanitize_terminal_bytes(&output.stderr);
        let details = api::CommandFailureDetails::new(output.status.to_string())
            .with_stdout(non_empty(stdout.clone()))
            .with_stderr(non_empty(stderr.clone()));
        let error = ApiErrorData {
            status: StatusCode::BAD_GATEWAY,
            code: "command-failed",
            message: format!("{command} failed with {}", output.status),
            details: Some(details),
        };
        Self(
            Report::new(error)
                .message("command exited unsuccessfully")
                .field("command", command)
                .field_display("status", output.status),
        )
    }

    pub(crate) fn invalid_ctrl_output(err: serde_json::Error) -> Self {
        let error = Self::data(
            StatusCode::BAD_GATEWAY,
            "invalid-ctrl-output",
            format!("rugix-ctrl returned invalid JSON: {err}"),
        );
        Self(
            err.escalate(error)
                .message("failed to decode rugix-ctrl output"),
        )
    }
}

/// Returns `None` for empty command output.
fn non_empty(value: String) -> Option<String> {
    (!value.trim().is_empty()).then_some(value)
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let report = self.0;
        let error = report.error();
        if error.status.is_server_error() {
            tracing::error!(
                error.r#type = error.type_name(),
                error.code = error.code(),
                "{report}"
            );
        } else {
            tracing::warn!(
                error.r#type = error.type_name(),
                error.code = error.code(),
                "{report}"
            );
        }
        let ApiErrorData {
            status,
            code,
            message,
            details,
        } = report.into_error();
        let body = api::ApiErrorResponse::new(
            api::ApiError::new(code.to_owned(), message).with_details(details),
        );
        (status, Json(body)).into_response()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that process-spawn failures retain their source error and API category.
    #[test]
    fn command_spawn_error_retains_its_cause() {
        let error = ApiError::command_spawn(
            "rugix-ctrl",
            std::io::Error::new(std::io::ErrorKind::NotFound, "not found"),
        );

        assert!(error.0.context().cause().is_some());
        assert_eq!(error.0.error().status, StatusCode::BAD_GATEWAY);
        assert_eq!(error.0.error().code, "command-spawn-failed");
    }

    /// Verifies that caller validation errors do not invent a source error.
    #[test]
    fn validation_error_has_no_synthetic_cause() {
        let error = ApiError::bad_request("invalid-input", "invalid input");

        assert!(error.0.context().cause().is_none());
        assert_eq!(error.0.error().status, StatusCode::BAD_REQUEST);
    }
}
