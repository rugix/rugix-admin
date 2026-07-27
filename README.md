<p align="center">
    <img src="https://rugix.org/img/logo.svg" width="12%" alt="Rugix Logo">
</p>
<h1 align="center">
    Rugix Admin
</h1>
<h4 align="center">
    Web management interface for Rugix-powered systems.
</h4>
<p align="center">
  <a href="https://github.com/rugix/rugix-admin/releases"><img alt="Rugix Admin Version Badge" src="https://img.shields.io/github/v/tag/rugix/rugix-admin?label=version"></a>
  <a href="https://github.com/rugix/rugix-admin/actions"><img alt="Pipeline Status Badge" src="https://img.shields.io/github/actions/workflow/status/rugix/rugix-admin/check-and-lint.yml"></a>
</p>

Rugix Admin is part of [Rugix](https://rugix.org), an open-source tool suite for building robust, Linux-powered products.

Rugix Admin provides a browser-based management interface for systems running [Rugix Ctrl](https://github.com/rugix/rugix). It exposes system status, update operations, application management, component compatibility information, and job logs through a single self-contained service.

> [!WARNING]
> Rugix Admin is intended only for development and demos. It has no
> authentication and can request privileged Rugix Ctrl operations. Do not
> expose it to untrusted users or networks.

- **System Updates**: Install Rugix system updates from uploaded bundles or URLs.
- **Application Management**: Install, inspect, start, stop, and remove Rugix application bundles.
- **Component Compatibility**: Review scanned component roots, loaded components, capabilities, and consistency problems.
- **Job Tracking**: Follow long-running operations with streamed status and logs.
- **Embedded Frontend**: Ships the React frontend as part of the release binary.
- **Systemd Installer**: Includes an installer for apt-based systems with systemd.

Use Rugix Admin when you want a local web interface for device development,
debugging, or demos.

[**Get started today! Build your first system and deploy an update, all in under 30 minutes!**](https://rugix.org/docs/getting-started) 🚀

## Installation

`installer/install-rugix-admin.sh` installs the release binary and a systemd service on apt-based systems with systemd. By default, it downloads release assets from `rugix/rugix-admin`.

```sh
sudo bash installer/install-rugix-admin.sh
```

Set `RUGIX_ADMIN_VERSION` or pass a version as the first argument to install a specific release. Set `RUGIX_ADMIN_GITHUB_REPO` to install from another GitHub repository.

The service listens only on the device's loopback interface by default. Access
it through an SSH tunnel:

```sh
ssh -L 8088:127.0.0.1:8088 root@device
```

Then open `http://127.0.0.1:8088/`.

## Configuration

Rugix Admin optionally reads `/etc/rugix/admin.toml` at startup. For example:

```toml
address = "127.0.0.1:8088"
insecure-allow-remote-access = false
dangerously-insecure = false
```

When the file is absent, Rugix Admin listens on `127.0.0.1:8088`. An explicit
`--address` command-line option overrides the value in the configuration file.
Invalid configuration prevents the service from starting.

Rugix Admin refuses to bind to a non-loopback address unless
`insecure-allow-remote-access = true` is also set. The equivalent command-line
flag is `--insecure-allow-remote-access`. This opt-in acknowledges that anyone
who can reach the service can control the device:

```toml
address = "0.0.0.0:8088"
insecure-allow-remote-access = true
```

Setting `dangerously-insecure = true` enables API and frontend options that
weaken bundle verification, including verification skips and explicit bundle
hashes, and allows callers to override the root certificate. It can also be
enabled with `--dangerously-insecure`. Leave it disabled for normal
installations so that Rugix Ctrl requires properly signed bundles using the
system's configured trust policy. The privileged Rugix Ctrl daemon independently
requires `dangerously-insecure = true` in `/etc/rugix/daemon.toml` before it
accepts those options.

The installer only adds that command-line override to the systemd service when
`RUGIX_ADMIN_ADDRESS` is explicitly set during installation. Set
`RUGIX_ADMIN_INSECURE_ALLOW_REMOTE_ACCESS=true` alongside a non-loopback
installer address. The installer does not add firewall rules.

## Security Model

The installer runs Rugix Admin as a dedicated unprivileged user. Its
`rugix-ctrl` subprocesses connect to the privileged Rugix Ctrl daemon over a
group-restricted Unix socket. `/etc/rugix/daemon.toml` determines whether the
service may reset state, commit or reboot the system, or manage application
lifecycle state. The installer creates this file when it is absent and preserves
an existing configuration.

The HTTP API still has no authentication or authorization. A client that can
reach the service can request every daemon capability enabled for Rugix Admin.

Loopback binding prevents direct network access but does not restrict local
users. Use Rugix Admin only on development and demo devices where every local
and SSH user is trusted to manage the entire device. An SSH tunnel authenticates
network access to the device; it does not add authorization inside Rugix Admin.

Production use requires an authenticated deployment model.

## Development

Rugix Admin uses [mise](https://mise.jdx.dev/) for development tools and tasks.
Tool specifications stay intentionally loose where mise can resolve them;
`mise.lock` records the exact versions and checksums used by developers and CI.
Rust is managed separately by rustup through `rust-toolchain.toml`, so Cargo,
rust-analyzer, and editors use the same dated nightly without requiring mise
activation.

Install the locked toolchain and inspect the available commands:

```sh
mise install
mise tasks
```

Common workflows are:

```sh
cargo run -- --address 127.0.0.1:8088
mise run dev
mise run check
mise run fmt
mise run codegen
mise run test:e2e
mise run build x86_64-unknown-linux-musl
```

Run `mise run doctor` to check host dependencies. Development requires rustup
and a C compiler. Cross-builds additionally require Docker or Podman.

To deliberately update the non-Rust toolchain, update the loose specifications
if needed and run `mise lock`; commit `mise.toml` and `mise.lock` together.
Update Rust by changing the dated channel in `rust-toolchain.toml`.

## Licensing

This project is licensed under either [MIT](https://github.com/rugix/rugix-admin/blob/main/LICENSE-MIT) or [Apache 2.0](https://github.com/rugix/rugix-admin/blob/main/LICENSE-APACHE) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this project by you, as defined in the Apache 2.0 license, shall be dual licensed as above, without any additional terms or conditions.

---

Made with ❤️ for OSS by [Silitics](https://www.silitics.com)
