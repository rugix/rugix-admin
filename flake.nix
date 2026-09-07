{
  description = "Rugix Admin local device management interface";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-26.05";
    rugix.url = "github:rugix/rugix/e9c3a2677d9389c71209e792f7c6777a243275ff";
    rugix.inputs.nixpkgs.follows = "nixpkgs";
    # Keep the frontend generator aligned with the Sidex revision in Cargo.lock.
    sidex.url = "github:silitics/sidex/53f5e11480ebf471ba37a97fa2a683be1e2bf235";
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
