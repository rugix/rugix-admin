<p align="center">
    <img src="https://rugix.org/img/logo.svg" width="12%" alt="Rugix Logo">
</p>
<h1 align="center">
    Rugix Admin
</h1>
<h4 align="center">
    Local web interface for Rugix-powered devices.
</h4>
<p align="center">
  <a href="https://github.com/rugix/rugix-admin/releases"><img alt="Rugix Admin Version Badge" src="https://img.shields.io/github/v/tag/rugix/rugix-admin?label=version"></a>
  <a href="https://github.com/rugix/rugix-admin/actions"><img alt="Pipeline Status Badge" src="https://img.shields.io/github/actions/workflow/status/rugix/rugix-admin/check-and-lint.yml"></a>
</p>

Rugix Admin is an open-source local operator interface for systems running
[Rugix Ctrl](https://github.com/rugix/rugix). It is developed by the
[Rugix](https://rugix.org) project.

It exposes system status, update operations, application management, component compatibility information, and job logs through a single self-contained service. The privileged Rugix Ctrl daemon determines which operations are available.

- **System Updates**: Install uploaded or remote bundles with boot-group, overlay,
  reboot, verification, compatibility, range-request, and retry controls.
- **Application Management**: Install uploaded or remote bundles; inspect app
  state, workload health, generations, and metadata; and manage the complete
  daemon-backed lifecycle.
- **Component Compatibility**: Review scanned component roots, loaded components, capabilities, and consistency problems.
- **Job Tracking**: Follow long-running operations with streamed status and logs.
- **Embedded Frontend**: Ships the React frontend as part of the release binary.
- **Systemd Installer**: Includes an installer for apt-based systems with systemd.

Use Rugix Admin when you want a web interface for managing an individual Rugix
device.

[Read the Rugix Admin documentation to install and deploy it securely.](https://rugix.org/docs/admin/)

## Installation

For systems built with Rugix Bakery, install Rugix Admin with the
[`rugix-extra/rugix-admin`](https://github.com/rugix/rugix-extra/tree/main/recipes/rugix-admin)
recipe. Add `rugix-extra` to the project repositories:

```toml
[repositories]
rugix-extra = { git = "https://github.com/rugix/rugix-extra.git" }
```

Then include `rugix-extra/rugix-admin` and `core/rugix-ctrl-daemon` in the
system's layer. See the
[installation documentation](https://rugix.org/docs/admin/installation/) for a
complete example and deployment guidance.

For Yocto-based systems, the official
[`meta-rugix`](https://github.com/rugix/meta-rugix) layer provides
`rugix-admin` and its Rugix Ctrl daemon dependency:

```bitbake
IMAGE_INSTALL:append = " rugix-admin"
```

For evaluation or for an existing system that is not built with Rugix Bakery,
`installer/install-rugix-admin.sh` installs the release binary and systemd
services on apt-based systems with systemd. By default, it downloads release
assets from `rugix/rugix-admin`. If `rugix-ctrl` is not installed, it also
installs the latest stable Rugix Ctrl 1.x Debian package.

```sh
sudo bash installer/install-rugix-admin.sh
```

Set `RUGIX_ADMIN_VERSION` or pass a version as the first argument to install a
specific Rugix Admin release. Set `RUGIX_CTRL_VERSION` to select the Rugix Ctrl
release installed when the command is absent. `RUGIX_ADMIN_GITHUB_REPO` and
`RUGIX_CTRL_GITHUB_REPO` override the respective GitHub repositories.
An existing `rugix-ctrl` command is preserved and must provide daemon mode.

The service listens on `127.0.0.1:7492` by default. Configure a trusted listen
address before accessing it from another machine.

## Configuration

Rugix Admin optionally reads `/etc/rugix/admin.toml` at startup. For example:

```toml
address = "127.0.0.1:7492"
```

When the file is absent, Rugix Admin listens on `127.0.0.1:7492`. An explicit
`--address` command-line option overrides the value in the configuration file.
Invalid configuration prevents the service from starting.

The installer only adds that command-line override to the systemd service when
`RUGIX_ADMIN_ADDRESS` is explicitly set during installation. The installer does
not add firewall rules.

## Security

Rugix Admin does not provide authentication or TLS. Treat anyone who can reach
the service as a device operator, and do not expose it directly to an untrusted
network. Restrict network access and enable only the Rugix Ctrl operations the
device needs.

See the [secure deployment guidance](https://rugix.org/docs/admin/security/) for
Rugix Admin and the
[privileged daemon reference](https://rugix.org/docs/ctrl/reference/privileged-daemon/)
for the authoritative Rugix Ctrl policy documentation.

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
cargo run -- --address 127.0.0.1:7492
mise run dev
mise run check
mise run fmt
mise run codegen
mise run test:e2e
mise run build x86_64-unknown-linux-musl
```

On NixOS or a host without Playwright browsers, run
`cd frontend && pnpm run test:e2e:nix` instead.

Run `mise run doctor` to check host dependencies. Development requires rustup
and a C compiler. Cross-builds additionally require Docker or Podman.

Builds use `RUGIX_ADMIN_VERSION` as the version reported by
`rugix-admin --version` and the frontend. Without an explicit value, builds from
a Git checkout use `git-` followed by a commit prefix of at least eight
characters; builds without Git metadata report `unknown`.

The Cargo workspace and frontend package use `0.0.0` as a development
placeholder. Release builds whose `RUGIX_ADMIN_VERSION` is a semantic version
tag such as `v0.5.0` materialize `0.5.0` in the Cargo and frontend package
metadata before compilation and SBOM generation. This keeps the Git tag
authoritative while ensuring that release artifacts contain accurate package
metadata.

Each binary archive contains `rugix-admin.cdx.json`, a validated CycloneDX SBOM
that combines the target-specific Rust dependency graph with the production
frontend dependency graph.

To deliberately update the non-Rust toolchain, update the loose specifications
if needed and run `mise lock`; commit `mise.toml` and `mise.lock` together.
Update Rust by changing the dated channel in `rust-toolchain.toml`.

## Support

This repository is covered by
[Tier 1: Core](https://rugix.org/support-commitment/#tier-core) of the Rugix
Support Commitment.

## Licensing

This project is licensed under either [MIT](https://github.com/rugix/rugix-admin/blob/main/LICENSE-MIT) or [Apache 2.0](https://github.com/rugix/rugix-admin/blob/main/LICENSE-APACHE) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this project by you, as defined in the Apache 2.0 license, shall be dual licensed as above, without any additional terms or conditions.

---

Made with ❤️ for OSS by [Silitics](https://www.silitics.com)
