#!/usr/bin/env bash
# First-time and update bring-up for the loopback personal install.
# Docs: docs/runbooks/personal-local.md
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

COMPOSE=(docker compose -f deploy/compose.personal.yml --env-file deploy/.env.personal)
ENV_FILE="${ROOT}/deploy/.env.personal"
BACKUP_DIR="${BACKUP_DIR:-${HOME}/vitae-backups}"
UNIT_DIR="${HOME}/.config/systemd/user"
DESKTOP_DIR="${HOME}/.local/share/applications"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $1" >&2
    exit 1
  }
}

need docker
need openssl
need pnpm

if ! docker info >/dev/null 2>&1; then
  echo "FAIL: Docker is not running. Start it, then re-run." >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  owner="${OWNER_EMAIL:-}"
  if [[ -z "${owner}" ]]; then
    owner="$(git config --get user.email 2>/dev/null || true)"
  fi
  if [[ -z "${owner}" ]]; then
    echo "FAIL: set OWNER_EMAIL or git config user.email before the first run." >&2
    exit 1
  fi
  umask 077
  cat >"${ENV_FILE}" <<EOF
OWNER_EMAIL=${owner}
SESSION_SECRET=$(openssl rand -hex 32)
BUILDSVC_HMAC_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
FIREBASE_PROJECT_ID=vitae-personal
EOF
  echo "Wrote ${ENV_FILE} for ${owner}"
else
  echo "Using existing ${ENV_FILE}"
fi

echo "Building web (productivity on, Cloud off, Google sign-in off)..."
# Caddy serves the SPA and API from one loopback origin. A relative API path
# keeps the browser on whichever supported loopback hostname opened the app
# (`localhost` or `127.0.0.1`) and avoids reaching into the private API port.
VITE_API_BASE_URL=/api/v1 \
  VITE_PUBLIC_PRODUCTIVITY_ENABLED=true \
  VITE_PUBLIC_CLOUD_ENABLED=false \
  VITE_FIREBASE_API_KEY=demo-api-key \
  VITE_FIREBASE_AUTH_DOMAIN=vitae-local.firebaseapp.com \
  VITE_FIREBASE_PROJECT_ID=vitae-local \
  VITE_FIREBASE_USE_EMULATOR=true \
  pnpm --filter @vitae/web build

if [[ ! -f apps/web/dist/index.html ]]; then
  echo "FAIL: web build did not write apps/web/dist/index.html" >&2
  exit 1
fi

echo "Compiling documentation corpus (optional if this fails)..."
if ! pnpm docs:build; then
  echo "docs:build failed; /docs will answer 503 until it succeeds." >&2
else
  mkdir -p deploy/docs-content
  rsync -a --delete docs/.compiled/ deploy/docs-content/ 2>/dev/null || \
    cp -a docs/.compiled/. deploy/docs-content/
fi

echo "Starting personal stack..."
"${COMPOSE[@]}" up -d --build

echo "Applying migrations..."
"${COMPOSE[@]}" run --rm --no-deps api ./node_modules/.bin/tsx src/scripts/migrate.ts

mkdir -p "${BACKUP_DIR}" "${UNIT_DIR}" "${DESKTOP_DIR}"

service_unit="${UNIT_DIR}/vitae-personal-backup.service"
timer_unit="${UNIT_DIR}/vitae-personal-backup.timer"
sed "s|@VITAE_APP_DIR@|${ROOT}|g; s|@BACKUP_DIR@|${BACKUP_DIR}|g" \
  "${ROOT}/deploy/systemd/personal/vitae-personal-backup.service" >"${service_unit}"
sed "s|@VITAE_APP_DIR@|${ROOT}|g" \
  "${ROOT}/deploy/systemd/personal/vitae-personal-backup.timer" >"${timer_unit}"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload || true
  systemctl --user enable --now vitae-personal-backup.timer || \
    echo "Could not enable the user backup timer; run it later with: systemctl --user enable --now vitae-personal-backup.timer" >&2
fi

install -m 0644 "${ROOT}/deploy/personal/vitae.desktop" "${DESKTOP_DIR}/vitae.desktop"
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "${DESKTOP_DIR}" >/dev/null 2>&1 || true
fi

if command -v sudo >/dev/null 2>&1; then
  sudo -n systemctl enable --now docker >/dev/null 2>&1 || \
    echo "Docker may not be enabled at boot. Run: sudo systemctl enable --now docker" >&2
fi

echo "Smoke backup (empty-graph floor disabled for this first ZIP)..."
BACKUP_DIR="${BACKUP_DIR}" BACKUP_MIN_NODES=0 \
  BACKUP_EXPORT_CMD="${COMPOSE[*]} run --rm --no-deps -e EXPORT_OUT -v /tmp:/tmp api ./node_modules/.bin/tsx src/scripts/export-bundle.ts" \
  ./scripts/backup-local.sh || echo "First backup skipped (stack may still be warming)." >&2

if curl -fsS http://127.0.0.1:8080/ready >/dev/null; then
  echo "Ready at http://127.0.0.1:8080"
else
  echo "Stack is up; /ready is not 200 yet. Check: ${COMPOSE[*]} ps"
fi
