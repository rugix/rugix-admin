//! Rugix Admin configuration loading and command-line override resolution.

use std::fs;
use std::io;
use std::net::SocketAddr;
use std::path::Path;

use reportify::ErrorExt;
use reportify::ResultExt;
use serde::Deserialize;

pub(crate) use crate::generated::config::Config;
use crate::AdminResult;

pub(crate) const CONFIG_PATH: &str = "/etc/rugix/admin.toml";
pub(crate) const DEFAULT_ADDRESS: &str = "0.0.0.0:7492";

/// Strict parsing view for the Sidex contract, whose generated decoder permits
/// forward-compatible unknown fields.
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "kebab-case")]
struct ConfigFile {
    address: Option<SocketAddr>,
}

#[tracing::instrument(level = "debug")]
pub(crate) fn load() -> AdminResult<Config> {
    load_from(Path::new(CONFIG_PATH))
}

pub(crate) fn resolve_address(cli_address: Option<SocketAddr>, config: &Config) -> SocketAddr {
    cli_address.or(config.address).unwrap_or_else(|| {
        DEFAULT_ADDRESS
            .parse::<SocketAddr>()
            .assert_ok("the built-in Rugix Admin address must be valid")
    })
}

fn load_from(path: &Path) -> AdminResult<Config> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(error) => {
            return Err(error
                .whatever("failed to read Rugix Admin configuration")
                .field("path", path));
        }
    };

    parse_config(&content)
        .whatever("failed to parse Rugix Admin configuration")
        .field("path", path)
}

/// Parses the Sidex-defined configuration while rejecting misspelled fields.
fn parse_config(content: &str) -> Result<Config, toml::de::Error> {
    let ConfigFile { address } = toml::from_str(content)?;
    Ok(Config { address })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Verifies that a configured socket address is parsed.
    #[test]
    fn parses_address() {
        let config = parse_config("address = \"127.0.0.1:9000\"").unwrap();

        assert_eq!(config.address, Some("127.0.0.1:9000".parse().unwrap()));
    }

    /// Verifies that misspelled configuration fields fail closed.
    #[test]
    fn rejects_unknown_fields() {
        let error = parse_config("adress = \"127.0.0.1:9000\"").unwrap_err();

        assert!(error.to_string().contains("unknown field"));
    }

    /// Verifies that parse failures retain both their path and source error.
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
        assert!(rendered.contains("failed to parse Rugix Admin configuration"));
        assert!(rendered.contains(&path.display().to_string()));
    }

    /// Verifies that an absent optional configuration file uses defaults.
    #[test]
    fn missing_file_uses_empty_config() {
        let config = load_from(Path::new("/path/that/does/not/exist/admin.toml")).unwrap();

        assert_eq!(config.address, None);
    }

    /// Verifies that an explicit command-line address has highest precedence.
    #[test]
    fn cli_address_overrides_config() {
        let config = Config {
            address: Some("127.0.0.1:9000".parse().unwrap()),
        };

        assert_eq!(
            resolve_address(Some("127.0.0.1:8000".parse().unwrap()), &config),
            "127.0.0.1:8000".parse().unwrap()
        );
    }

    /// Verifies configuration precedence over the built-in default address.
    #[test]
    fn uses_config_address_before_default() {
        let config = Config {
            address: Some("127.0.0.1:9000".parse().unwrap()),
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
}
