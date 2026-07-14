use std::fs;
use std::io;
use std::net::SocketAddr;
use std::path::Path;

use serde::Deserialize;

pub const CONFIG_PATH: &str = "/etc/rugix/admin.toml";
pub const DEFAULT_ADDRESS: &str = "0.0.0.0:8088";

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// The address to bind to.
    pub address: Option<SocketAddr>,
}

pub fn load() -> Result<Config, String> {
    load_from(Path::new(CONFIG_PATH))
}

fn load_from(path: &Path) -> Result<Config, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Config::default()),
        Err(error) => {
            return Err(format!(
                "unable to read configuration file {}: {error}",
                path.display()
            ));
        }
    };

    toml::from_str(&content).map_err(|error| {
        format!(
            "unable to parse configuration file {}: {error}",
            path.display()
        )
    })
}

pub fn resolve_address(cli_address: Option<SocketAddr>, config: Config) -> SocketAddr {
    cli_address.or(config.address).unwrap_or_else(|| {
        DEFAULT_ADDRESS
            .parse()
            .expect("default address must be valid")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_address() {
        let config: Config = toml::from_str("address = \"127.0.0.1:9000\"").unwrap();

        assert_eq!(config.address, Some("127.0.0.1:9000".parse().unwrap()));
    }

    #[test]
    fn rejects_unknown_fields() {
        let error = toml::from_str::<Config>("adress = \"127.0.0.1:9000\"").unwrap_err();

        assert!(error.to_string().contains("unknown field"));
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
        };

        assert_eq!(
            resolve_address(Some("127.0.0.1:8000".parse().unwrap()), config),
            "127.0.0.1:8000".parse().unwrap()
        );
    }

    #[test]
    fn uses_config_address_before_default() {
        let config = Config {
            address: Some("127.0.0.1:9000".parse().unwrap()),
        };

        assert_eq!(
            resolve_address(None, config),
            "127.0.0.1:9000".parse().unwrap()
        );
        assert_eq!(
            resolve_address(None, Config::default()),
            DEFAULT_ADDRESS.parse().unwrap()
        );
    }
}
