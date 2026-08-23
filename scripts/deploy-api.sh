#!/usr/bin/env bash
#
# Deploy the API (and buildsvc) to the production VM.
#
#   ./scripts/deploy-api.sh          # pull + build + migrate + restart, then verify
#   ./scripts/deploy-api.sh --check  # report what is deployed, change nothing
#
# Production is one VM running caddy + api + buildsvc from
# deploy/compose.prod.yml at the explicit VITAE_APP_DIR. Postgres is the system
# of record and lives outside this VM, so the VM is disposable and this only
# moves code.
#
# The SPA is not here: Vercel builds it from main on push.
#
# See docs/DEPLOYMENT.md.
set -euo pipefail

HOST="${VITAE_HOST:-}"
SSH_KEY="${VITAE_SSH_KEY:-}"
KNOWN_HOSTS="${VITAE_KNOWN_HOSTS:-${HOME}/.ssh/known_hosts}"
HOST_KEY_NAME="${VITAE_HOST_KEY_NAME:-${HOST#*@}}"
APP_DIR="${VITAE_APP_DIR:-}"
HEALTH_URL="${VITAE_HEALTH_URL:-}"
BRANCH="${VITAE_BRANCH:-main}"

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

[ -n "$HOST" ] || die "set VITAE_HOST (e.g. ubuntu@api.vitae.example.com)"
[ -n "$APP_DIR" ] || die "set VITAE_APP_DIR (the absolute path to the deployed checkout)"
case "$APP_DIR" in
  /*) ;;
  *) die "VITAE_APP_DIR must be an absolute path" ;;
esac
[ -n "$HEALTH_URL" ] || die "set VITAE_HEALTH_URL (e.g. https://api.vitae.example.com/health)"
command -v ssh        >/dev/null || die "ssh not found"
command -v ssh-keygen >/dev/null || die "ssh-keygen not found"
[ -f "$KNOWN_HOSTS" ] || die "known-hosts file not found at $KNOWN_HOSTS (set VITAE_KNOWN_HOSTS)"
ssh-keygen -F "$HOST_KEY_NAME" -f "$KNOWN_HOSTS" >/dev/null 2>&1 \
  || die "no pinned SSH host key for $HOST_KEY_NAME in $KNOWN_HOSTS"

SSH=(
  ssh
  -o BatchMode=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$KNOWN_HOSTS"
)
[ -n "$SSH_KEY" ] && SSH+=(-o IdentitiesOnly=yes -i "$SSH_KEY")
SSH+=("$HOST")

case "${1:-}" in
  "") ;;
  --check) ;;
  *) die "unknown option: $1" ;;
esac

if [ "${1:-}" = "--check" ]; then
  step "Deployed on ${HOST}"
  "${SSH[@]}" "cd ${APP_DIR} && git log --oneline -1 && docker compose -f deploy/compose.prod.yml ps"
  curl -fsS --max-time 10 "$HEALTH_URL" && echo
  exit 0
fi

step "Deploying ${BRANCH} to ${HOST}:${APP_DIR}"
"${SSH[@]}" bash -seuo pipefail <<REMOTE
  cd "${APP_DIR}"
  git fetch --quiet origin "${BRANCH}"
  test -z "\$(git status --porcelain)" || {
    echo "remote working tree is dirty; refusing to overwrite it" >&2
    exit 1
  }
  git checkout --quiet "${BRANCH}"
  git merge --ff-only "origin/${BRANCH}"
  git log --oneline -1
  # The API image bakes the source. Build it before migrating so the migration
  # runner and the image that will serve traffic use the same release.
  docker compose -f deploy/compose.prod.yml build api buildsvc
  docker compose -f deploy/compose.prod.yml run --rm --no-deps api ./node_modules/.bin/tsx src/scripts/migrate.ts
  # A changed tag alone is not enough for every Compose version to replace an
  # existing container. Force the two source-bearing services to recreate;
  # Caddy stays at the edge and resumes proxying once API health is restored.
  docker compose -f deploy/compose.prod.yml up -d --force-recreate api buildsvc
REMOTE

step "Waiting for readiness"
# /health is liveness (the process is up); /ready is the one that says it should
# get traffic, so that is what a deploy waits on.
READY_URL="${HEALTH_URL%/health}/ready"
for attempt in $(seq 1 20); do
  if curl -fsS --max-time 10 "$READY_URL" >/dev/null 2>&1; then
    step "Deployed: ${READY_URL} is answering"
    "${SSH[@]}" "cd ${APP_DIR} && docker compose -f deploy/compose.prod.yml ps"
    exit 0
  fi
  sleep 3
done

printf '\033[31m✗ never became ready at %s\033[0m\n' "$READY_URL" >&2
"${SSH[@]}" "cd ${APP_DIR} && docker compose -f deploy/compose.prod.yml logs --tail 40 api" >&2
exit 1
