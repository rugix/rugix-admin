#!/usr/bin/env bash
set -euo pipefail

# Build Rugix Admin binaries for one or more Rust targets using Cross.
#
# Usage: ./scripts/build-binaries.sh TARGET [TARGET...]
#
# The binary is placed in build/binaries/<target>/ and a tarball
# binaries-<target>.tar is created in build/binaries/.
#
# Cross and cargo-cyclonedx are provided by the mise development environment.

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="${PROJECT_DIR}/build/binaries"
FRONTEND_DIST="${PROJECT_DIR}/frontend/dist"

CROSS_BIN="${CROSS_BIN:-$(command -v cross || true)}"
CARGO_CYCLONEDX_BIN="${CARGO_CYCLONEDX_BIN:-$(command -v cargo-cyclonedx || true)}"

require_tool() {
    local name="$1"
    local path="$2"
    if [ -z "${path}" ]; then
        echo "error: ${name} is not available; run 'mise install' first" >&2
        exit 1
    fi
}

ensure_rugix_admin_frontend() {
    if [ -f "${FRONTEND_DIST}/index.html" ]; then
        return
    fi
    cat >&2 <<EOF
error: Rugix Admin frontend distribution is missing.

Build it before packaging binaries:

    cd frontend
    pnpm install --frozen-lockfile
    pnpm run build

EOF
    exit 1
}

build_target() {
    local target="$1"

    echo "==> Building ${target}"

    # Cross must be run from the project directory; it maps the working
    # directory into the Docker container rather than using --manifest-path.
    (cd "${PROJECT_DIR}" && "${CROSS_BIN}" build --frozen --release --target "${target}" --bin rugix-admin)

    local target_dir="${CARGO_TARGET_DIR:-${PROJECT_DIR}/target}"
    local release_dir="${target_dir}/${target}/release"

    echo "==> Generating SBOMs for ${target}"
    (cd "${PROJECT_DIR}" && "${CARGO_CYCLONEDX_BIN}" cyclonedx -f json --target "${target}" --manifest-path crates/apps/rugix-admin/Cargo.toml)

    local binaries_dir="${OUTPUT_DIR}/${target}"
    rm -rf "${binaries_dir}"
    mkdir -p "${binaries_dir}"

    cp "${release_dir}/rugix-admin" "${binaries_dir}/"
    local sbom="${PROJECT_DIR}/crates/apps/rugix-admin/rugix-admin.cdx.json"
    if [ -f "${sbom}" ]; then
        cp "${sbom}" "${binaries_dir}/rugix-admin.cdx.json"
    fi

    tar -cf "${OUTPUT_DIR}/binaries-${target}.tar" -C "${binaries_dir}" .

    echo "==> Built ${target} -> ${binaries_dir}"
}

main() {
    if [ $# -eq 0 ]; then
        echo "Usage: $0 TARGET [TARGET...]" >&2
        exit 1
    fi

    require_tool cross "${CROSS_BIN}"
    require_tool cargo-cyclonedx "${CARGO_CYCLONEDX_BIN}"
    ensure_rugix_admin_frontend

    if [ -z "${RUGIX_ADMIN_VERSION:-}" ]; then
        local git_revision
        git_revision="$(git -C "${PROJECT_DIR}" rev-parse --short=8 HEAD 2>/dev/null || true)"
        if [ -n "${git_revision}" ]; then
            export RUGIX_ADMIN_VERSION="git-${git_revision}"
        else
            echo "warning: failed to read Rugix Admin Git metadata; using unknown" >&2
            export RUGIX_ADMIN_VERSION="unknown"
        fi
    fi

    mkdir -p "${OUTPUT_DIR}"

    for target in "$@"; do
        build_target "${target}"
    done
}

main "$@"
