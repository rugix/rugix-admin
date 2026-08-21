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
CYCLONEDX_BIN="${CYCLONEDX_BIN:-$(command -v cyclonedx || true)}"
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm || true)}"
PYTHON_BIN="${PYTHON_BIN:-$(command -v python3 || true)}"

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

generate_sbom() (
    local target="$1"
    local output_path="$2"
    local backend_sbom_prefix="rugix-admin-backend-${target}"
    local sbom_dir
    sbom_dir="$(mktemp -d)"
    trap 'rm -rf "${sbom_dir}"' EXIT

    echo "==> Generating SBOMs for ${target}"
    (cd "${PROJECT_DIR}" && "${CARGO_CYCLONEDX_BIN}" cyclonedx \
        --format json \
        --manifest-path crates/apps/rugix-admin/Cargo.toml \
        --override-filename "${backend_sbom_prefix}" \
        --spec-version 1.5 \
        --target "${target}")
    mv "${PROJECT_DIR}/crates/apps/rugix-admin/${backend_sbom_prefix}.json" \
        "${sbom_dir}/backend.cdx.json"
    (cd "${FRONTEND_DIST}/.." && "${PNPM_BIN}" sbom \
        --lockfile-only \
        --out "${sbom_dir}/frontend.cdx.json" \
        --prod \
        --sbom-format cyclonedx \
        --sbom-spec-version 1.5 \
        --sbom-type application)

    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 "${CYCLONEDX_BIN}" merge \
        --group rugix \
        --hierarchical \
        --input-files "${sbom_dir}/backend.cdx.json" "${sbom_dir}/frontend.cdx.json" \
        --input-format json \
        --name rugix-admin \
        --output-file "${output_path}" \
        --output-format json \
        --output-version v1_5 \
        --version "${RUGIX_ADMIN_VERSION#v}"
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1 "${CYCLONEDX_BIN}" validate \
        --fail-on-errors \
        --input-file "${output_path}" \
        --input-format json \
        --input-version v1_5
    if [ "$(grep -c '"purl": "pkg:cargo/' "${output_path}")" -le 1 ]; then
        echo "error: SBOM contains no Cargo dependency components" >&2
        exit 1
    fi
    if [ "$(grep -c '"purl": "pkg:npm/' "${output_path}")" -le 1 ]; then
        echo "error: SBOM contains no frontend dependency components" >&2
        exit 1
    fi
)

build_target() {
    local target="$1"

    echo "==> Building ${target}"

    # Cross must be run from the project directory; it maps the working
    # directory into the Docker container rather than using --manifest-path.
    (cd "${PROJECT_DIR}" && "${CROSS_BIN}" build --frozen --release --target "${target}" --bin rugix-admin)

    local target_dir="${CARGO_TARGET_DIR:-${PROJECT_DIR}/target}"
    local release_dir="${target_dir}/${target}/release"

    local binaries_dir="${OUTPUT_DIR}/${target}"
    rm -rf "${binaries_dir}"
    mkdir -p "${binaries_dir}"

    cp "${release_dir}/rugix-admin" "${binaries_dir}/"
    generate_sbom "${target}" "${binaries_dir}/rugix-admin.cdx.json"

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
    require_tool cyclonedx "${CYCLONEDX_BIN}"
    require_tool pnpm "${PNPM_BIN}"
    require_tool python3 "${PYTHON_BIN}"
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

    if [[ "${RUGIX_ADMIN_VERSION}" == v* ]]; then
        echo "==> Materializing package version ${RUGIX_ADMIN_VERSION#v}"
        "${PYTHON_BIN}" "${PROJECT_DIR}/scripts/materialize-version.py" \
            "${RUGIX_ADMIN_VERSION}"
    fi

    mkdir -p "${OUTPUT_DIR}"

    for target in "$@"; do
        build_target "${target}"
    done
}

main "$@"
