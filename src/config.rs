use std::fs;
use std::io;
use std::net::SocketAddr;
use std::path::Path;

use reportify::ErrorExt;
use reportify::ResultExt;
use serde::Deserialize;

use crate::AdminResult;

pub const CONFIG_PATH: &str = "/etc/rugix/admin.toml";
pub const DEFAULT_ADDRESS: &str = "127.0.0.1:8088";

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// The address to bind to.
    pub address: Option<SocketAddr>,
    /// Allow binding to a non-loopback address despite the lack of authentication.
    #[serde(
        default,
        rename = "insecure-allow-remote-access",
        alias = "insecure_allow_remote_access"
    )]
    pub insecure_allow_remote_access: bool,
    /// Allow installation options that weaken bundle verification.
    #[serde(
        default,
        rename = "dangerously-insecure",
        alias = "dangerously_insecure"
    )]
    pub dangerously_insecure: bool,
}

pub fn load() -> AdminResult<Config> {
    load_from(Path::new(CONFIG_PATH))
}

fn load_from(path: &Path) -> AdminResult<Config> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(error) => {
            return Err(error
                .whatever("unable to read Rugix Admin configuration")
                .field("path", path));
        }
    };

    toml::from_str(&content)
        .whatever("unable to parse Rugix Admin configuration")
        .field("path", path)
}

pub fn resolve_address(cli_address: Option<SocketAddr>, config: &Config) -> SocketAddr {
    cli_address.or(config.address).unwrap_or_else(|| {
        DEFAULT_ADDRESS
            .parse::<SocketAddr>()
            .assert_ok("the built-in Rugix Admin address must be valid")
    })
}

pub fn resolve_dangerously_insecure(cli_dangerously_insecure: bool, config: &Config) -> bool {
    cli_dangerously_insecure || config.dangerously_insecure
}

pub fn resolve_insecure_allow_remote_access(
    cli_insecure_allow_remote_access: bool,
    config: &Config,
) -> bool {
    cli_insecure_allow_remote_access || config.insecure_allow_remote_access
}

pub fn validate_remote_access(
    address: SocketAddr,
    insecure_allow_remote_access: bool,
) -> AdminResult<()> {
    if !address.ip().is_loopback() && !insecure_allow_remote_access {
        reportify::bail!(
            "refusing to expose unauthenticated Rugix Admin on non-loopback address {address}; \
             set `insecure-allow-remote-access = true` in {CONFIG_PATH} or pass \
             `--insecure-allow-remote-access` to acknowledge the risk"
        );
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_address() {
        let config: Config = toml::from_str("address = \"127.0.0.1:9000\"").unwrap();

        assert_eq!(config.address, Some("127.0.0.1:9000".parse().unwrap()));
        assert!(!config.insecure_allow_remote_access);
        assert!(!config.dangerously_insecure);
    }

    #[test]
    fn parses_dangerously_insecure() {
        let config: Config = toml::from_str("dangerously-insecure = true").unwrap();

        assert!(config.dangerously_insecure);
    }

    #[test]
    fn rejects_unknown_fields() {
        let error = toml::from_str::<Config>("adress = \"127.0.0.1:9000\"").unwrap_err();

        assert!(error.to_string().contains("unknown field"));
    }

    #[test]
    fn invalid_file_retains_path_and_parse_cause() {
        let path = std::env::temp_dir().join(format!(
            "rugix-admin-config-test-{}.toml",
            uuid::Uuid::new_v4()
        ));
        fs::write(&path, "address = false").unwrap();

        let error = load_from(&path).unwrap_err();
        let rendered = error.to_string();
        fs::remove_file(&path).unwrap();

        assert!(error.context().cause().is_some());
        assert!(rendered.contains("unable to parse Rugix Admin configuration"));
        assert!(rendered.contains(&path.display().to_string()));
    }

    #[test]
    fn missing_file_uses_empty_config() {
        let config = load_from(Path::new("/path/that/does/not/exist/admin.toml")).unwrap();

        assert_eq!(config.address, None);
    }

    #[test]
    fn cli_address_overrides_config() {
        let config = Config {
            address: Some("127.0.0.1:9000".parse().unwrap()),
            ..Config::default()
        };

        assert_eq!(
            resolve_address(Some("127.0.0.1:8000".parse().unwrap()), &config),
            "127.0.0.1:8000".parse().unwrap()
        );
    }

    #[test]
    fn uses_config_address_before_default() {
        let config = Config {
            address: Some("127.0.0.1:9000".parse().unwrap()),
            ..Config::default()
        };

        assert_eq!(
            resolve_address(None, &config),
            "127.0.0.1:9000".parse().unwrap()
        );
        assert_eq!(
            resolve_address(None, &Config::default()),
            DEFAULT_ADDRESS.parse().unwrap()
        );
    }

    #[test]
    fn resolves_dangerously_insecure_as_an_opt_in() {
        assert!(!resolve_dangerously_insecure(false, &Config::default()));
        assert!(resolve_dangerously_insecure(true, &Config::default()));

        let config: Config = toml::from_str("dangerously-insecure = true").unwrap();
        assert!(resolve_dangerously_insecure(false, &config));
    }

    #[test]
    fn configured_remote_access_requires_explicit_acknowledgement() {
        let local_config = Config::default();
        validate_remote_access(
            resolve_address(None, &local_config),
            resolve_insecure_allow_remote_access(false, &local_config),
        )
        .unwrap();

        let remote_config: Config =
            toml::from_str("address = \"0.0.0.0:8088\"\ninsecure-allow-remote-access = true")
                .unwrap();
        validate_remote_access(
            resolve_address(None, &remote_config),
            resolve_insecure_allow_remote_access(false, &remote_config),
        )
        .unwrap();

        let unacknowledged_config: Config = toml::from_str("address = \"0.0.0.0:8088\"").unwrap();
        let error = validate_remote_access(
            resolve_address(None, &unacknowledged_config),
            resolve_insecure_allow_remote_access(false, &unacknowledged_config),
        )
        .unwrap_err();
        assert!(error.to_string().contains("insecure-allow-remote-access"));
    }
}
