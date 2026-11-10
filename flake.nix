{
  description = "Rugix Admin local device management interface";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    rugix.url = "github:rugix/rugix/v1.4.0";
    rugix.inputs.nixpkgs.follows = "nixpkgs";
    # Keep the frontend generator aligned with the Sidex revision in Cargo.lock.
    sidex.url = "github:silitics/sidex/v0.4.1";
    sidex.inputs.nixpkgs.follows = "nixpkgs";
  };

  outputs =
    {
      self,
      nixpkgs,
      rugix,
      sidex,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forEachSystem = nixpkgs.lib.genAttrs systems;
    in
    {
      nixosModules.rugix-admin = {
        imports = [
          rugix.nixosModules.rugix
          ./nix/rugix-admin.nix
        ];
      };
      nixosModules.default = self.nixosModules.rugix-admin;

      overlays.default = final: _prev: {
        rugix-admin = final.callPackage ./nix/package.nix {
          source = self;
          version = self.shortRev or self.dirtyShortRev or "unknown";
          sidex = sidex.packages.${final.stdenv.buildPlatform.system}.default;
        };
      };

      packages = forEachSystem (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            overlays = [ self.overlays.default ];
          };
        in
        {
          inherit (pkgs) rugix-admin;
          default = pkgs.rugix-admin;
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [
              pkgs.xz
              pkgs.openssl
              pkgs.stdenv.cc.cc.lib
            ];
            packages = with pkgs; [
              git
              pkg-config
              openssl
              xz
              podman
            ];
          };
          browser-tests = pkgs.mkShell {
            inherit (self.devShells.${system}.default) LD_LIBRARY_PATH;
            inputsFrom = [ self.devShells.${system}.default ];
            RUGIX_ADMIN_TESTS_PLAYWRIGHT_BROWSERS = "${pkgs.playwright-driver.browsers}";
          };
          system-tests = pkgs.mkShell {
            packages = with pkgs; [
              podman
              qemu
              mtools
            ];
            RUGIX_OVMF_CODE_AMD64 = "${pkgs.OVMF.fd}/FV/OVMF_CODE.fd";
            RUGIX_OVMF_VARS_AMD64 = "${pkgs.OVMF.fd}/FV/OVMF_VARS.fd";
          };
        }
      );

      apps = forEachSystem (system: {
        default = self.apps.${system}.rugix-admin;
        rugix-admin = {
          type = "app";
          program = "${self.packages.${system}.rugix-admin}/bin/rugix-admin";
          meta.description = "Run Rugix Admin";
        };
      });

      checks = forEachSystem (system: {
        inherit (self.packages.${system}) rugix-admin;
        nixos = import ./nix/test.nix {
          pkgs = nixpkgs.legacyPackages.${system};
          module = self.nixosModules.rugix-admin;
          admin = self.packages.${system}.rugix-admin;
          rugixCtrl = rugix.packages.${system}.rugix-ctrl;
        };
      });
    };
}
