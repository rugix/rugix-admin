use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::response::Response;
use axum::Json;
use reportify::Error as _;
use reportify::ErrorExt;
use reportify::Report;
use serde_json::json;
use serde_json::Value;

use crate::generated::api;

#[derive(Debug)]
struct ApiErrorData {
    status: StatusCode,
    code: &'static str,
    message: String,
    details: Option<Value>,
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
            format!("unable to spawn {command}: {err}"),
        );
        Self(
            err.escalate(error)
                .message("unable to start command")
                .field("command", command),
        )
    }

    pub(crate) fn command_failed(
        command: &str,
        args: &[&str],
        output: &std::process::Output,
    ) -> Self {
        let stdout = String::from_utf8_lossy(&output.stdout).into_owned();
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let error = ApiErrorData {
            status: StatusCode::BAD_GATEWAY,
            code: "command-failed",
            message: format!("{command} exited with {}", output.status),
            details: Some(json!({
                "args": args,
                "stdout": stdout,
                "stderr": stderr,
            })),
        };
        Self(
            Report::new(error)
                .message("command exited unsuccessfully")
                .field("command", command)
                .field_debug("arguments", args)
                .field_display("status", output.status)
                .field("stdout", stdout)
                .field("stderr", stderr),
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
                .message("unable to decode rugix-ctrl output"),
        )
    }
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

    #[test]
    fn validation_error_has_no_synthetic_cause() {
        let error = ApiError::bad_request("invalid-input", "invalid input");

        assert!(error.0.context().cause().is_none());
        assert_eq!(error.0.error().status, StatusCode::BAD_REQUEST);
    }
}
