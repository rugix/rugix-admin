//! Request validation and Rugix Ctrl argument construction for privileged operations.
//!
//! Sidex-generated types define the public request shapes used by these helpers.

use crate::error::ApiError;
use crate::generated::api;
use crate::ApiResult;

pub(crate) fn system_update_args(
    query: api::SystemInstallOptions,
    bundle: String,
    http_source: bool,
) -> ApiResult<Vec<String>> {
    let mut args = vec!["update".to_owned(), "install".to_owned()];
    apply_install_options(
        &mut args,
        query.bundle_hash.as_deref(),
        query.root_cert.as_deref(),
        query.insecure_skip_bundle_verification,
        query.insecure_allow_missing_block_index,
        query.skip_compatibility_check,
    )?;
    if let Some(reboot) = query.reboot {
        args.extend([
            "--reboot".to_owned(),
            system_reboot_mode(&reboot).to_owned(),
        ]);
    }
    if let Some(boot_group) = query.boot_group {
        args.extend([
            "--boot-group".to_owned(),
            required_non_empty("boot group", &boot_group)?,
        ]);
    }
    if query.keep_overlay.unwrap_or(false) {
        args.push("--keep-overlay".to_owned());
    }
    apply_http_options(
        &mut args,
        query.disable_range_queries,
        query.http_max_retries,
        query.http_retry_initial_backoff,
        query.http_retry_max_backoff,
        http_source,
    )?;
    args.push(bundle);
    Ok(args)
}

pub(crate) fn app_install_args(
    query: api::AppInstallOptions,
    bundle: String,
    http_source: bool,
) -> ApiResult<Vec<String>> {
    let mut args = vec!["apps".to_owned(), "install".to_owned()];
    apply_install_options(
        &mut args,
        query.bundle_hash.as_deref(),
        query.root_cert.as_deref(),
        query.insecure_skip_bundle_verification,
        query.insecure_allow_missing_block_index,
        query.skip_compatibility_check,
    )?;
    apply_http_options(
        &mut args,
        None,
        query.http_max_retries,
        query.http_retry_initial_backoff,
        query.http_retry_max_backoff,
        http_source,
    )?;
    args.push(bundle);
    Ok(args)
}

pub(crate) fn apply_compatibility_override(args: &mut Vec<String>, enabled: Option<bool>) {
    if enabled.unwrap_or(false) {
        args.push("--skip-compatibility-check".to_owned());
    }
}

pub(crate) fn reject_unused_app_action_options(
    generation: Option<u64>,
    keep: Option<usize>,
    skip_compatibility_check: Option<bool>,
) -> ApiResult<()> {
    if generation.is_some() || keep.is_some() || skip_compatibility_check.unwrap_or(false) {
        return Err(invalid_action_options());
    }
    Ok(())
}

pub(crate) fn reject_generation_and_keep_options(
    generation: Option<u64>,
    keep: Option<usize>,
) -> ApiResult<()> {
    if generation.is_some() || keep.is_some() {
        return Err(invalid_action_options());
    }
    Ok(())
}

pub(crate) fn reject_keep_option(keep: Option<usize>) -> ApiResult<()> {
    if keep.is_some() {
        return Err(invalid_action_options());
    }
    Ok(())
}

pub(crate) fn required_non_empty_option(
    label: &str,
    value: Option<String>,
) -> ApiResult<Option<String>> {
    match value {
        Some(value) if value.trim().is_empty() => Err(ApiError::bad_request(
            "invalid-action-options",
            format!("{label} must not be empty"),
        )),
        Some(value) => Ok(Some(value.trim().to_owned())),
        None => Ok(None),
    }
}

pub(crate) fn is_http_url(value: &str) -> bool {
    let Ok(uri) = value.parse::<axum::http::Uri>() else {
        return false;
    };
    matches!(uri.scheme_str(), Some("http" | "https")) && uri.authority().is_some()
}

fn apply_install_options(
    args: &mut Vec<String>,
    bundle_hash: Option<&str>,
    root_cert: Option<&str>,
    insecure_skip_bundle_verification: Option<bool>,
    insecure_allow_missing_block_index: Option<bool>,
    skip_compatibility_check: Option<bool>,
) -> ApiResult<()> {
    if insecure_skip_bundle_verification.unwrap_or(false) {
        args.push("--insecure-skip-bundle-verification".to_owned());
    }
    if insecure_allow_missing_block_index.unwrap_or(false) {
        args.push("--insecure-allow-missing-block-index".to_owned());
    }
    apply_compatibility_override(args, skip_compatibility_check);
    if let Some(root_cert) = root_cert {
        args.extend([
            "--root-cert".to_owned(),
            required_non_empty("root certificate", root_cert)?,
        ]);
    }
    if let Some(bundle_hash) = bundle_hash {
        args.extend([
            "--bundle-hash".to_owned(),
            required_non_empty("bundle hash", bundle_hash)?,
        ]);
    }
    Ok(())
}

fn apply_http_options(
    args: &mut Vec<String>,
    disable_range_queries: Option<bool>,
    max_retries: Option<u32>,
    initial_backoff: Option<u64>,
    max_backoff: Option<u64>,
    http_source: bool,
) -> ApiResult<()> {
    let has_options = disable_range_queries.is_some()
        || max_retries.is_some()
        || initial_backoff.is_some()
        || max_backoff.is_some();
    if has_options && !http_source {
        return Err(ApiError::bad_request(
            "invalid-install-options",
            "HTTP retry and range options require a bundle URL",
        ));
    }
    if initial_backoff.unwrap_or(1) > max_backoff.unwrap_or(30) {
        return Err(ApiError::bad_request(
            "invalid-install-options",
            "initial HTTP retry backoff must not exceed the maximum backoff",
        ));
    }
    if disable_range_queries.unwrap_or(false) {
        args.push("--disable-range-queries".to_owned());
    }
    if let Some(value) = max_retries {
        args.extend(["--http-max-retries".to_owned(), value.to_string()]);
    }
    if let Some(value) = initial_backoff {
        args.extend(["--http-retry-initial-backoff".to_owned(), value.to_string()]);
    }
    if let Some(value) = max_backoff {
        args.extend(["--http-retry-max-backoff".to_owned(), value.to_string()]);
    }
    Ok(())
}

fn required_non_empty(label: &str, value: &str) -> ApiResult<String> {
    if value.trim().is_empty() {
        return Err(ApiError::bad_request(
            "invalid-install-options",
            format!("{label} must not be empty"),
        ));
    }
    Ok(value.trim().to_owned())
}

pub(crate) fn invalid_action_options() -> ApiError {
    ApiError::bad_request(
        "invalid-action-options",
        "the selected application action does not accept these options",
    )
}

fn system_reboot_mode(mode: &api::SystemRebootMode) -> &'static str {
    match mode {
        api::SystemRebootMode::Yes => "yes",
        api::SystemRebootMode::No => "no",
        api::SystemRebootMode::Set => "set",
        api::SystemRebootMode::Deferred => "deferred",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that all daemon-gated install overrides reach Rugix Ctrl.
    #[test]
    fn forwards_install_options_for_daemon_authorization() {
        let mut args = Vec::new();

        apply_install_options(
            &mut args,
            Some("sha256:abc"),
            Some("/etc/rugix/root.pem"),
            Some(true),
            Some(true),
            Some(true),
        )
        .unwrap();

        assert_eq!(
            args,
            [
                "--insecure-skip-bundle-verification",
                "--insecure-allow-missing-block-index",
                "--skip-compatibility-check",
                "--root-cert",
                "/etc/rugix/root.pem",
                "--bundle-hash",
                "sha256:abc",
            ]
        );
    }

    /// Verifies that every system URL option is forwarded with its exact CLI spelling.
    #[test]
    fn forwards_complete_system_url_options() {
        let query = serde_urlencoded::from_str::<api::SystemInstallOptions>(
            "skipCompatibilityCheck=true&reboot=deferred&bootGroup=b&keepOverlay=true&disableRangeQueries=true&httpMaxRetries=8&httpRetryInitialBackoff=2&httpRetryMaxBackoff=45",
        )
        .unwrap();

        let args = system_update_args(
            query,
            "https://updates.example/update.rugixb".to_owned(),
            true,
        )
        .unwrap();

        assert_eq!(
            args,
            [
                "update",
                "install",
                "--skip-compatibility-check",
                "--reboot",
                "deferred",
                "--boot-group",
                "b",
                "--keep-overlay",
                "--disable-range-queries",
                "--http-max-retries",
                "8",
                "--http-retry-initial-backoff",
                "2",
                "--http-retry-max-backoff",
                "45",
                "https://updates.example/update.rugixb",
            ]
        );
    }

    /// Verifies that HTTP-only options are rejected for streamed file uploads.
    #[test]
    fn rejects_http_options_for_file_uploads() {
        let query =
            serde_urlencoded::from_str::<api::AppInstallOptions>("httpMaxRetries=2").unwrap();

        assert!(app_install_args(query, "-".to_owned(), false).is_err());
    }
}
