#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
    echo "run as root, for example: sudo bash $0" >&2
    exit 1
fi

if ! command -v apt-get >/dev/null 2>&1; then
    distro="unknown"
    if [[ -r /etc/os-release ]]; then
        # shellcheck source=/dev/null
        . /etc/os-release
        distro="${PRETTY_NAME:-${ID:-unknown}}"
    fi
    echo "unsupported distro: ${distro}; this installer requires apt-get" >&2
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "this installer requires systemd" >&2
    exit 1
fi

RUGIX_ADMIN_GITHUB_REPO="${RUGIX_ADMIN_GITHUB_REPO:-rugix/rugix-admin}"
RUGIX_CTRL_GITHUB_REPO="${RUGIX_CTRL_GITHUB_REPO:-${RUGIX_GITHUB_REPO:-rugix/rugix}}"
REQUESTED_RUGIX_ADMIN_VERSION="${1:-${RUGIX_ADMIN_VERSION:-latest}}"
REQUESTED_RUGIX_CTRL_VERSION="${RUGIX_CTRL_VERSION:-v1}"
RUGIX_DEB_VARIANT="${RUGIX_DEB_VARIANT:-musl}"
RUGIX_ADMIN_ADDRESS_EXPLICIT="${RUGIX_ADMIN_ADDRESS+x}"
RUGIX_ADMIN_ADDRESS="${RUGIX_ADMIN_ADDRESS:-127.0.0.1:7492}"
RUGIX_ADMIN_PORT="${RUGIX_ADMIN_PORT:-${RUGIX_ADMIN_ADDRESS##*:}}"

case "$(uname -m)" in
    x86_64|amd64)
        RUGIX_TARGET="x86_64-unknown-linux-musl"
        DEB_ARCH="amd64"
        ;;
    aarch64|arm64)
        RUGIX_TARGET="aarch64-unknown-linux-musl"
        DEB_ARCH="arm64"
        ;;
    armv7l|armv8l)
        RUGIX_TARGET="armv7-unknown-linux-musleabihf"
        DEB_ARCH="armhf"
        ;;
    arm*)
        RUGIX_TARGET="arm-unknown-linux-musleabihf"
        DEB_ARCH="armhf"
        ;;
    *) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

case "${RUGIX_DEB_VARIANT}" in
    musl|gnu) ;;
    *) echo "unsupported Rugix Ctrl Debian package variant: ${RUGIX_DEB_VARIANT}" >&2; exit 1 ;;
esac

if ! [[ "${RUGIX_ADMIN_PORT}" =~ ^[0-9]+$ ]] \
    || ((RUGIX_ADMIN_PORT < 1 || RUGIX_ADMIN_PORT > 65535)); then
    echo "invalid Rugix Admin port: ${RUGIX_ADMIN_PORT}" >&2
    exit 1
fi

if ! [[ "${RUGIX_ADMIN_ADDRESS}" =~ ^[][0-9A-Fa-f.:]+$ ]]; then
    echo "invalid Rugix Admin address: ${RUGIX_ADMIN_ADDRESS}" >&2
    exit 1
fi

apt-get update
apt-get install -y ca-certificates curl jq tar

resolve_release_version() {
    local repo="$1"
    local requested="$2"
    local api="https://api.github.com/repos/${repo}/releases"
    if [[ "${requested}" == "latest" ]]; then
        curl -fsSL "${api}?per_page=100" \
            | jq -r \
                '[.[] | select((.draft | not) and (.prerelease | not))]
                 | sort_by(.published_at)
                 | last
                 | .tag_name'
    elif [[ "${requested}" =~ ^v[0-9]+$ ]]; then
        curl -fsSL "${api}?per_page=100" \
            | jq -r --arg prefix "${requested}." \
                '[.[] | select((.draft | not) and (.prerelease | not) and (.tag_name | startswith($prefix)))]
                 | sort_by(.published_at)
                 | last
                 | .tag_name'
    else
        echo "${requested}"
    fi
}

release_tag_to_deb_version() {
    local version="${1#v}"
    if [[ "${version}" == *-* ]]; then
        local base="${version%%-*}"
        local rest="${version#*-}"
        version="${base}+${rest//-/.}"
    fi
    echo "${version}"
}

tmpdir="$(mktemp -d)"
trap 'rm -rf "${tmpdir}"' EXIT

if ! command -v rugix-ctrl >/dev/null 2>&1; then
    RUGIX_CTRL_VERSION_RESOLVED="$(
        resolve_release_version "${RUGIX_CTRL_GITHUB_REPO}" "${REQUESTED_RUGIX_CTRL_VERSION}"
    )"
    if [[ -z "${RUGIX_CTRL_VERSION_RESOLVED}" || "${RUGIX_CTRL_VERSION_RESOLVED}" == "null" ]]; then
        echo "unable to resolve Rugix Ctrl release version" >&2
        exit 1
    fi

    deb_version="$(release_tag_to_deb_version "${RUGIX_CTRL_VERSION_RESOLVED}")"
    package="rugix-ctrl-${RUGIX_DEB_VARIANT}"
    deb="${tmpdir}/${package}_${deb_version}_${DEB_ARCH}.deb"
    url="https://github.com/${RUGIX_CTRL_GITHUB_REPO}/releases/download/${RUGIX_CTRL_VERSION_RESOLVED}/$(basename "${deb}")"
    echo "rugix-ctrl was not found; downloading ${url}"
    curl -fL "${url}" -o "${deb}"
    apt-get install -y "${deb}"
fi

if ! rugix-ctrl daemon --help >/dev/null 2>&1; then
    echo "the installed rugix-ctrl does not provide daemon mode; update Rugix Ctrl first" >&2
    exit 1
fi

RUGIX_ADMIN_VERSION_RESOLVED="$(
    resolve_release_version "${RUGIX_ADMIN_GITHUB_REPO}" "${REQUESTED_RUGIX_ADMIN_VERSION}"
)"
if [[ -z "${RUGIX_ADMIN_VERSION_RESOLVED}" || "${RUGIX_ADMIN_VERSION_RESOLVED}" == "null" ]]; then
    echo "unable to resolve Rugix Admin release version" >&2
    exit 1
fi

archive="${tmpdir}/binaries.tar"
url="https://github.com/${RUGIX_ADMIN_GITHUB_REPO}/releases/download/${RUGIX_ADMIN_VERSION_RESOLVED}/binaries-${RUGIX_TARGET}.tar"
echo "downloading ${url}"
curl -fL "${url}" -o "${archive}"
tar -xf "${archive}" -C "${tmpdir}"
install -m 755 "${tmpdir}/rugix-admin" /usr/bin/rugix-admin

getent group rugix-daemon >/dev/null || groupadd --system rugix-daemon

install -d -m 755 /etc/rugix
if [[ ! -e /etc/rugix/daemon.toml ]]; then
    cat >/etc/rugix/daemon.toml <<'EOF'
[features]
factory-reset = true
system-commit = true
system-reboot = true
app-lifecycle = true
EOF
    chmod 644 /etc/rugix/daemon.toml
fi

admin_exec_start="/usr/bin/rugix-admin"
if [[ -n "${RUGIX_ADMIN_ADDRESS_EXPLICIT}" ]]; then
    admin_exec_start+=" --address ${RUGIX_ADMIN_ADDRESS}"
fi

cat >/etc/systemd/system/rugix-ctrl-daemon.service <<'EOF'
[Unit]
Description=Privileged Rugix Ctrl Operation Daemon
After=local-fs.target
ConditionFileIsExecutable=/usr/bin/rugix-ctrl

[Service]
Type=simple
User=root
Group=rugix-daemon
UMask=0117
ExecStart=/usr/bin/rugix-ctrl daemon
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/systemd/system/rugix-admin.service <<EOF
[Unit]
Description=Rugix Admin
ConditionFileIsExecutable=/usr/bin/rugix-admin
After=rugix-ctrl-daemon.service
Requires=rugix-ctrl-daemon.service

[Service]
DynamicUser=yes
User=rugix-admin
Group=rugix-daemon
NoNewPrivileges=true
ExecStart=${admin_exec_start}
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable rugix-ctrl-daemon.service rugix-admin.service
systemctl restart rugix-ctrl-daemon.service
systemctl restart rugix-admin.service

cat <<EOF

Rugix Admin is installed and listening on ${RUGIX_ADMIN_ADDRESS}.

Next steps:
  Open Rugix Admin through an address that reaches the configured listener on
  port ${RUGIX_ADMIN_PORT}. With the default settings, the local URL is:
    http://127.0.0.1:7492/

  To access Rugix Admin from another machine, configure a trusted listen
  address and appropriate network access controls.

  Check the service:
    systemctl status rugix-admin.service

  Follow logs:
    journalctl -u rugix-admin.service -f
EOF
