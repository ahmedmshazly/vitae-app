#!/usr/bin/env bash
#
# Deploy the API (and buildsvc) to the production VM.
#
#   ./scripts/deploy-api.sh          # publish docs + pull + build + migrate + restart, verify
#   ./scripts/deploy-api.sh --check  # report what is deployed, change nothing
#
# Production is one VM running caddy + api + buildsvc from
# deploy/compose.prod.yml at the explicit VITAE_APP_DIR. Postgres is the system
# of record and lives outside this VM, so the VM is disposable and this only
# moves code.
#
# The SPA is not here: Vercel builds it from main on push.
#
# The documentation corpus IS here. It is private - served by the API behind the
# OWNER_EMAIL allow-list rather than published by the web host - so it has to
# reach the VM, and it cannot be built there: the compiler reads the tracked
# file set with git and the VM's checkout is not where the corpus is authored.
# This script compiles it locally and copies it up before restarting anything.
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
command -v rsync      >/dev/null || die "rsync not found (needed to publish the documentation)"
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
  step "Documentation corpus on ${HOST}"
  # A directory with no manifest is not a corpus. A bind mount whose host path
  # is missing is created empty, so "the directory is there" proves nothing.
  "${SSH[@]}" "cd ${APP_DIR} && if [ -f deploy/docs-content/manifest.json ]; then \
      echo \"published: \$(grep -c '\"route\"' deploy/docs-content/manifest.json) page entries\"; \
    else echo 'NOT published — /api/v1/docs will answer 503'; fi"
  curl -fsS --max-time 10 "$HEALTH_URL" && echo
  exit 0
fi

# The corpus is compiled from the working tree, so a deploy publishes the
# documentation that matches the branch being deployed rather than whatever was
# last left in docs/.compiled.
step "Compiling the documentation corpus"
pnpm docs:build
[ -f docs/.compiled/manifest.json ] || die "docs:build produced no manifest"

# Moving the code first, publishing second, is not arbitrary. The corpus lands
# inside the deployed checkout, so copying it up before the cleanliness check
# makes the tree dirty and the deploy refuses itself - which is exactly what
# happened the first time this ran. Merging first also means the .gitignore
# that excludes the published corpus is in place before it arrives.
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
REMOTE

step "Publishing the corpus to ${HOST}:${APP_DIR}/deploy/docs-content"
# --delete so a page removed from the corpus stops being served. The API reads
# this read-only and refuses anything outside it, so a stale file left behind
# would simply be served forever.
rsync -a --delete \
  -e "$(printf '%q ' "${SSH[@]:0:${#SSH[@]}-1}")" \
  docs/.compiled/ "${HOST}:${APP_DIR}/deploy/docs-content/"

step "Building and restarting"
"${SSH[@]}" bash -seuo pipefail <<REMOTE
  cd "${APP_DIR}"
  # The API image bakes the source. Build it before migrating so the migration
  # runner and the image that will serve traffic use the same release.
  docker compose -f deploy/compose.prod.yml build api buildsvc

  # \`< /dev/null\` is load-bearing, not tidiness. This script reaches the remote
  # shell on stdin, and \`compose run\` attaches stdin to the container it
  # starts - so without the redirect it consumes the rest of THIS SCRIPT. The
  # recreate below was swallowed on every deploy that ever ran: the migration
  # succeeded, nothing was recreated, and the readiness check then passed
  # against the container that had never gone away.
  docker compose -f deploy/compose.prod.yml run --rm --no-deps -T api \
    ./node_modules/.bin/tsx src/scripts/migrate.ts < /dev/null

  # A changed tag alone is not enough for every Compose version to replace an
  # existing container. Force the two source-bearing services to recreate;
  # Caddy stays at the edge and resumes proxying once API health is restored.
  docker compose -f deploy/compose.prod.yml up -d --force-recreate api buildsvc

  # Prove the container that is now running is the image just built. Readiness
  # alone cannot: an old container answers /ready perfectly well, which is
  # exactly how the swallowed recreate went unnoticed.
  running=\$(docker inspect -f '{{.Image}}' vitae-api-1)
  built=\$(docker inspect -f '{{.Id}}' vitae/api:prod)
  if [ "\$running" != "\$built" ]; then
    echo "api container is running \$running but the build produced \$built" >&2
    echo "the recreate did not take effect; refusing to report a successful deploy" >&2
    exit 1
  fi
  echo "api is running the image just built (\${built:0:19})"
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
