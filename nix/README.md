# Nix Integration

The flake builds Rugix Admin's frontend and Rust service together and embeds the
frontend in the binary. It exports `packages.<system>.rugix-admin` and a runnable
app for x86-64 and AArch64 Linux, plus `overlays.default` and
`nixosModules.rugix-admin` (`nixosModules.default` is an alias).

## Build Rugix Admin

From this repository:

```console
nix build .
nix run . -- --help
```

The result is `result/bin/rugix-admin`.

## Enable the NixOS Service

In a flake with `nixpkgs` and `rugix-admin` inputs, configure a device as follows:

```nix
nixosConfigurations.device = nixpkgs.lib.nixosSystem {
  modules = [
    rugix-admin.nixosModules.rugix-admin
    {
      services.rugix.package = rugix-admin.inputs.rugix.packages.x86_64-linux.rugix-ctrl;
      services.rugix-admin = {
        enable = true;
        package = rugix-admin.packages.x86_64-linux.rugix-admin;
      };
    }
    ./configuration.nix
  ];
};
```

Use the package attributes for the device's architecture. `configuration.nix`
supplies the device platform, storage, and Rugix settings. Set
`rugix-admin.inputs.nixpkgs.follows = "nixpkgs"` in the flake inputs to share the
package set. The module imports the upstream Rugix module; enabling Admin also
enables Rugix Ctrl and its daemon. Choose allowed operations explicitly through
`services.rugix.daemon.features`.

## Service Options

All options are under `services.rugix-admin`.

| Option          | Default            | Purpose                                                       |
| --------------- | ------------------ | ------------------------------------------------------------- |
| `enable`        | `false`            | Start the Admin service.                                      |
| `package`       | `pkgs.rugix-admin` | Package to run; supply directly or install the Admin overlay. |
| `listenAddress` | `127.0.0.1`        | Bind address.                                                 |
| `port`          | `7492`             | HTTP port.                                                    |
| `openFirewall`  | `false`            | Open the HTTP port in the NixOS firewall.                     |

The service runs as a dynamic user in the `rugix-daemon` group. Network exposure
and privileged operations remain device configuration choices.

## Test the Service

```console
nix build .#checks.x86_64-linux.nixos
```

The check boots a NixOS VM and verifies the embedded frontend, daemon access
from the dynamic service user, and recovery after an Admin service restart.

## Maintain the Build Inputs

The frontend generator uses the Sidex revision pinned in `flake.nix`, matching
`Cargo.lock`. Keep these revisions aligned when updating Sidex. Update the
frontend dependency hash in `nix/package.nix` when `frontend/pnpm-lock.yaml`
changes.
