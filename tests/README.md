# System Tests

The system tests run Rugix Admin on a real Rugix system. They bake an
operating system image with Rugix Bakery that contains Rugix Admin and the
privileged Rugix Ctrl daemon, boot it in a QEMU virtual machine (VM), and call
the Rugix Admin API from inside the VM to install a system update, reboot into
it, commit it, and manage an app's lifecycle. The tests use
[Rugix Testkit](https://github.com/rugix/rugix-testkit), which documents the
available fixtures.

## Running the Tests

Prerequisites:

- A container runtime (Podman or Docker) for Rugix Bakery.
- `qemu-system-x86_64` with OVMF firmware.

The tests install the musl build of Rugix Admin from
`../build/binaries/x86_64-unknown-linux-musl/rugix-admin`. Set
`RUGIX_ADMIN_BINARY` to test a different build. Rugix Ctrl comes from the Bakery
image named by `RUGIX_BAKERY_IMAGE`, which must be available locally. From the
repository root, run:

```sh
mise run build x86_64-unknown-linux-musl
export RUGIX_BAKERY_IMAGE=ghcr.io/rugix/rugix-bakery:branch-main
podman pull "$RUGIX_BAKERY_IMAGE"
mise run test:system
```

The serial output and command history of each test's VM end up in
`test-outputs/`.
