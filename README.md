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

- **System Updates**: Install Rugix system updates from uploaded bundles or URLs.
- **Application Management**: Install, inspect, start, stop, and remove Rugix application bundles.
- **Component Compatibility**: Review scanned component roots, loaded components, capabilities, and consistency problems.
- **Job Tracking**: Follow long-running operations with streamed status and logs.
- **Embedded Frontend**: Ships the React frontend as part of the release binary.
- **Systemd Installer**: Includes an installer for apt-based systems with systemd.

Use Rugix Admin when you want a local web interface for device operation, debugging, demos, or field service workflows.

[**Get started today! Build your first system and deploy an update, all in under 30 minutes!**](https://rugix.org/docs/getting-started) 🚀

## Installation

`installer/install-rugix-admin.sh` installs the release binary and a systemd service on apt-based systems with systemd. By default, it downloads release assets from `rugix/rugix-admin`.

```sh
sudo bash installer/install-rugix-admin.sh
```

Set `RUGIX_ADMIN_VERSION` or pass a version as the first argument to install a specific release. Set `RUGIX_ADMIN_GITHUB_REPO` to install from another GitHub repository.

## Configuration

Rugix Admin optionally reads `/etc/rugix/admin.toml` at startup. For example:

```toml
address = "127.0.0.1:8088"
```

When the file is absent, Rugix Admin listens on `0.0.0.0:8088`. An explicit
`--address` command-line option overrides the value in the configuration file.
Invalid configuration prevents the service from starting.

The installer only adds that command-line override to the systemd service when
`RUGIX_ADMIN_ADDRESS` is explicitly set during installation.

## Development

Run Rugix Admin locally:

```sh
cargo run -- --address 127.0.0.1:8088
```

Run the frontend development server:

```sh
cd frontend
pnpm install --frozen-lockfile
pnpm run dev
```

Build the frontend assets before creating a release binary:

```sh
cd frontend
pnpm run build
cd ..
cargo build --release
```

Build release tarballs for Linux targets:

```sh
./scripts/build-binaries.sh x86_64-unknown-linux-musl
```

Run browser-driven frontend tests:

```sh
cd frontend
pnpm run test:e2e
```

## Licensing

This project is licensed under either [MIT](https://github.com/rugix/rugix-admin/blob/main/LICENSE-MIT) or [Apache 2.0](https://github.com/rugix/rugix-admin/blob/main/LICENSE-APACHE) at your option.

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in this project by you, as defined in the Apache 2.0 license, shall be dual licensed as above, without any additional terms or conditions.

---

Made with ❤️ for OSS by [Silitics](https://www.silitics.com)
