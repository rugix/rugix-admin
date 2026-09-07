{
  fetchPnpmDeps,
  lib,
  nodejs_22,
  pnpm_11,
  pnpmConfigHook,
  rustPlatform,
  sidex,
  source,
  version,
}:

rustPlatform.buildRustPackage {
  pname = "rugix-admin";
  inherit version;
  src = source;

  cargoBuildFlags = [
    "--bin"
    "rugix-admin"
  ];
  cargoLock = {
    lockFile = "${source}/Cargo.lock";
    allowBuiltinFetchGit = true;
  };

  pnpmRoot = "frontend";
  pnpmDeps = fetchPnpmDeps {
    pname = "rugix-admin-frontend";
    inherit version;
    src = "${source}/frontend";
    pnpm = pnpm_11;
    fetcherVersion = 3;
    hash = "sha256-j2KMtN6cUomojyJA5Nanza2I13H+q70mhHdHYC1pi3I=";
  };

  nativeBuildInputs = [
    nodejs_22
    pnpm_11
    pnpmConfigHook
    sidex
  ];

  env.RUGIX_ADMIN_VERSION = "git-${version}";

  preBuild = ''
    (cd frontend && pnpm run build)
  '';

  meta = {
    description = "Local web interface for Rugix-powered devices";
    homepage = "https://rugix.org/docs/admin/";
    license = with lib.licenses; [
      asl20
      mit
    ];
    mainProgram = "rugix-admin";
    platforms = lib.platforms.linux;
  };
}
