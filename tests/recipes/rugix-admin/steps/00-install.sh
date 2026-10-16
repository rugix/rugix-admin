#!/bin/bash

set -euo pipefail

BINARY="${RUGIX_PROJECT_DIR}/build/rugix-admin"

echo "${RECIPE_PARAM_SHA256}  ${BINARY}" | sha256sum --check
install -m 755 "${BINARY}" /usr/bin/rugix-admin
install -D -m 644 "${RECIPE_DIR}/files/rugix-admin.service" -t /usr/lib/systemd/system/
systemctl enable rugix-admin
