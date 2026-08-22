#!/usr/bin/env bash
#
# Local equivalent of .github/workflows/ci.yml.
#
# This mirrors the CI jobs in the same order and preserves its fatal-skip rule:
# a suite that quietly skips itself is a failure, not a pass.
#
#   ./scripts/ci-local.sh            # everything that runs without Docker
#   ./scripts/ci-local.sh --full     # adds both image builds and e2e
#   ./scripts/ci-local.sh --quick    # typecheck + lint + core tests only
#
# The Auth emulator is reused when already running. The script starts only the
# services it owns and leaves an existing local Postgres container in place.

set -uo pipefail
cd "$(dirname "$0")/.."

FULL=0
QUICK=0
for arg in "$@"; do
  case "$arg" in
    --full) FULL=1 ;;
    --quick) QUICK=1 ;;
    -h|--help) sed -n '3,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown flag: $arg (try --help)" >&2; exit 2 ;;
  esac
done

AUTH_PORT=9099
POSTGRES_PORT=5433
E2E_DATABASE_NAME=vitae_e2e
E2E_DATABASE_URL="postgresql://vitae:vitae@127.0.0.1:$POSTGRES_PORT/$E2E_DATABASE_NAME"
API_PORT=4010
WEB_PORT=5183
BUILDSVC_PORT=8797
STARTED_EMULATORS=0
EMULATOR_PID=""
EMULATOR_LOG="$(mktemp -t vitae-ci-emulators.XXXXXX.log)"
SERVICE_PIDS=()
BUILDSVC_CONTAINER=""
BUILDSVC_IMAGE="vitae/buildsvc:ci-local"
API_LOG="$(mktemp -t vitae-ci-api.XXXXXX.log)"
WEB_LOG="$(mktemp -t vitae-ci-web.XXXXXX.log)"

PASSED=(); FAILED=()

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
step() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

run_step() {
  local name="$1"; shift
  step "$name"
  if "$@"; then
    PASSED+=("$name")
  else
    FAILED+=("$name")
    printf '\033[31m✗ %s\033[0m\n' "$name"
  fi
}

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

cleanup() {
  for pid in "${SERVICE_PIDS[@]:-}"; do
    # Both services start in their own session. Stopping the whole process
    # group matters: `pnpm start` otherwise leaves its `tsx` child listening
    # after an E2E failure and contaminates the next isolated run.
    [ -n "$pid" ] && kill -- "-$pid" 2>/dev/null || true
  done
  for pid in "${SERVICE_PIDS[@]:-}"; do
    [ -n "$pid" ] && wait "$pid" 2>/dev/null || true
  done
  if [ -n "$BUILDSVC_CONTAINER" ]; then
    docker rm -f "$BUILDSVC_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ "$STARTED_EMULATORS" = "1" ] && [ -n "$EMULATOR_PID" ]; then
    step "Stopping the Auth emulator this script started (pid $EMULATOR_PID)"
    # The Firebase CLI launches Java children. It gets its own process group so
    # cleanup cannot leave an orphaned Auth emulator occupying the next run.
    kill -- "-$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

ensure_emulators() {
  if port_open "$AUTH_PORT"; then
    echo "Reusing the Auth emulator already listening on $AUTH_PORT."
    return 0
  fi
  step "Starting the Firebase Auth emulator (log: $EMULATOR_LOG)"
  # Without the Emulator UI. Nothing here opens it, and firebase treats a taken
  # UI port as fatal, so a browser tab left open by any other project on this
  # machine would otherwise take the whole suite down with it.
  EMULATOR_CONFIG="$(mktemp -t vitae-ci-firebase.XXXXXX.json)"
  node -e 'const c=require("./firebase.json");c.emulators.ui={enabled:false};require("fs").writeFileSync(process.argv[1],JSON.stringify(c))' "$EMULATOR_CONFIG"
  # --config moves firebase's notion of the project root to the temp file's
  # directory, where there is no .firebaserc, so the project has to be named.
  EMULATOR_PROJECT="$(node -p 'JSON.parse(require("fs").readFileSync(".firebaserc","utf8")).projects.default')"
  setsid npx firebase emulators:start --only auth \
    --config "$EMULATOR_CONFIG" --project "$EMULATOR_PROJECT" >"$EMULATOR_LOG" 2>&1 &
  EMULATOR_PID=$!
  STARTED_EMULATORS=1
  for _ in $(seq 1 60); do
    if port_open "$AUTH_PORT"; then
      echo "Auth emulator ready."
      return 0
    fi
    if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
      echo "Auth emulator exited early. Last lines:"; tail -20 "$EMULATOR_LOG"; return 1
    fi
    sleep 2
  done
  echo "Auth emulator did not become ready in 120s. Last lines:"; tail -20 "$EMULATOR_LOG"
  return 1
}

ensure_postgres() {
  if ! port_open "$POSTGRES_PORT"; then
    step "Starting local Postgres"
    docker compose up -d postgres
  fi
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U vitae -d vitae >/dev/null 2>&1; then
      echo "Postgres ready on $POSTGRES_PORT."
      return 0
    fi
    sleep 1
  done
  echo "Postgres did not become ready on $POSTGRES_PORT." >&2
  return 1
}

ensure_e2e_database() {
  ensure_postgres || return 1
  local exists
  exists="$(docker compose exec -T postgres psql -U vitae -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$E2E_DATABASE_NAME'")"
  if [ "$exists" != "1" ]; then
    step "Creating isolated E2E database $E2E_DATABASE_NAME"
    docker compose exec -T postgres psql -U vitae -d postgres -c "CREATE DATABASE \"$E2E_DATABASE_NAME\""
  fi
}

# API tests use an isolated vitae_test database. Auth remains on Firebase, so
# the Auth emulator is retained only for the local developer-token contract.
api_integration() {
  ensure_emulators || return 1
  ensure_postgres || return 1
  CI=1 \
  FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH_PORT" \
  FIREBASE_PROJECT_ID=vitae-ci \
  GCLOUD_PROJECT=vitae-ci \
  DATABASE_URL="postgresql://vitae:vitae@127.0.0.1:$POSTGRES_PORT/vitae" \
  VITAE_TEST_ADMIN_URL="postgresql://vitae:vitae@127.0.0.1:$POSTGRES_PORT/postgres" \
  OWNER_EMAIL=owner@example.com \
  SESSION_SECRET=ci-session-secret-not-a-real-one \
  AUTH_ENABLE_DEV_LOGIN=true \
  BUILDSVC_HMAC_SECRET=ci-buildsvc-secret \
    pnpm --filter @vitae/api test
}

# Production images are digest-pinned and CI enforces it. Keep the guard here
# because it catches an irreversible mistake early.
digest_pin_guard() {
  local pattern='^\s*(FROM|image:)\s+[^\s@]+:[^\s@]+\s*$'
  local exclude='@sha256:|image: vitae/'
  local targets=(apps/api/Dockerfile services/buildsvc/Dockerfile deploy/compose.prod.yml)
  local matcher=(grep -nEv "$exclude")
  if grep -nE "$pattern" "${targets[@]}" 2>/dev/null | "${matcher[@]}"; then
    echo "Production image reference is not digest-pinned (above)."
    return 1
  fi
  echo "All production image references are digest-pinned."
}

bold "Vitae · local CI  (mirror of .github/workflows/ci.yml)"

run_step "Install (frozen lockfile)" pnpm install --frozen-lockfile
run_step "Typecheck"                 pnpm typecheck
run_step "Lint"                      pnpm lint
run_step "Unit + property tests (packages/core)" pnpm test:core
run_step "Web unit tests"            pnpm --filter @vitae/web test

if [ "$QUICK" = "0" ]; then
  run_step "Digest-pin guard"        digest_pin_guard
  run_step "Production build"        pnpm build
  run_step "API integration (Postgres + Auth emulator)" api_integration
fi

build_buildsvc_image() {
  # services/buildsvc pins its TeX cache with `RUN --network=none`, which only
  # the BuildKit builder understands. Say so plainly rather than surfacing
  # docker's "the --network option requires BuildKit".
  if ! docker buildx version >/dev/null 2>&1; then
    if docker image inspect vitae/buildsvc:local >/dev/null 2>&1; then
      BUILDSVC_IMAGE="vitae/buildsvc:local"
      echo "BuildKit is unavailable; reusing the existing $BUILDSVC_IMAGE image."
      echo "Install docker-buildx to rebuild the offline Tectonic cache locally."
      return 0
    fi
    echo "BuildKit is unavailable and no vitae/buildsvc:local fallback image exists." >&2
    echo "Install docker-buildx, then rerun the full gate." >&2
    return 1
  fi
  DOCKER_BUILDKIT=1 docker build -q -t "$BUILDSVC_IMAGE" -f services/buildsvc/Dockerfile .
}

ci_env() {
  local database_url="${VITAE_CI_DATABASE_URL:-postgresql://vitae:vitae@127.0.0.1:$POSTGRES_PORT/vitae}"
  env \
    FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$AUTH_PORT" \
    FIREBASE_PROJECT_ID=vitae-ci \
    GCLOUD_PROJECT=vitae-ci \
    DATABASE_URL="$database_url" \
    OWNER_EMAIL=owner@example.com \
    SESSION_SECRET=ci-session-secret-not-a-real-one \
    AUTH_ENABLE_DEV_LOGIN=true \
    BUILDSVC_HMAC_SECRET=ci-buildsvc-secret \
    "$@"
}

wait_http() {
  local name="$1" url="$2" attempts="${3:-60}"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS --max-time 2 "$url" >/dev/null 2>&1; then
      echo "$name ready at $url"
      return 0
    fi
    sleep 1
  done
  echo "$name did not become ready at $url" >&2
  return 1
}

e2e_local() {
  ensure_emulators || return 1
  ensure_e2e_database || return 1
  # A previous CI process may have been interrupted before its EXIT trap ran.
  # This name is reserved for the disposable build-service container created
  # below, so reclaim it before checking ports. Never remove an arbitrary
  # process or container owned by a developer.
  local stale_buildsvc
  stale_buildsvc="$(docker ps -q --filter 'name=^/vitae-buildsvc-ci-local-')"
  if [ -n "$stale_buildsvc" ]; then
    docker rm -f $stale_buildsvc >/dev/null
  fi
  for port in "$API_PORT" "$WEB_PORT" "$BUILDSVC_PORT"; do
    if port_open "$port"; then
      echo "E2E port $port is already in use; refusing to test against an unrelated process." >&2
      return 1
    fi
  done

  VITAE_CI_DATABASE_URL="$E2E_DATABASE_URL" ci_env pnpm --filter @vitae/api migrate || return 1
  VITAE_CI_DATABASE_URL="$E2E_DATABASE_URL" ci_env pnpm --filter @vitae/api seed || return 1
  VITAE_CI_DATABASE_URL="$E2E_DATABASE_URL" ci_env pnpm --filter @vitae/api seed:demo || return 1

  BUILDSVC_CONTAINER="vitae-buildsvc-ci-local-$$"
  docker run -d \
    --name "$BUILDSVC_CONTAINER" \
    --network host \
    --tmpfs /tmp \
    --read-only \
    --security-opt no-new-privileges:true \
    -e "PORT=$BUILDSVC_PORT" \
    -e BUILDSVC_HOST=127.0.0.1 \
    -e BUILDSVC_HMAC_SECRET=ci-buildsvc-secret \
    "$BUILDSVC_IMAGE" >/dev/null || return 1
  if ! wait_http "build service" "http://127.0.0.1:$BUILDSVC_PORT/healthz" 30; then
    docker logs "$BUILDSVC_CONTAINER" >&2
    return 1
  fi

  VITE_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
    pnpm --filter @vitae/web build || return 1

  VITAE_CI_DATABASE_URL="$E2E_DATABASE_URL" ci_env setsid env \
    API_PORT="$API_PORT" \
    WEB_ORIGIN="http://127.0.0.1:$WEB_PORT" \
    BUILDSVC_URL="http://127.0.0.1:$BUILDSVC_PORT" \
    pnpm --filter @vitae/api start >"$API_LOG" 2>&1 &
  SERVICE_PIDS+=("$!")

  setsid pnpm --filter @vitae/web exec vite preview \
    --host 127.0.0.1 \
    --port "$WEB_PORT" >"$WEB_LOG" 2>&1 &
  SERVICE_PIDS+=("$!")

  if ! wait_http "API" "http://127.0.0.1:$API_PORT/ready"; then
    tail -80 "$API_LOG" >&2
    return 1
  fi
  if ! wait_http "web" "http://127.0.0.1:$WEB_PORT/"; then
    tail -80 "$WEB_LOG" >&2
    return 1
  fi

  if [ -n "${VITAE_E2E_TESTS:-}" ]; then
    E2E_BASE_URL="http://127.0.0.1:$WEB_PORT" \
    E2E_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
      pnpm --filter @vitae/e2e exec playwright test $VITAE_E2E_TESTS
  else
    E2E_BASE_URL="http://127.0.0.1:$WEB_PORT" \
    E2E_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
      pnpm e2e
  fi
}

if [ "$FULL" = "1" ]; then
  run_step "Docker image · api"      docker build -q -f apps/api/Dockerfile .
  run_step "Docker image · buildsvc" build_buildsvc_image
  run_step "E2E (Playwright)"        e2e_local
fi

echo
bold "── Summary ──────────────────────────────────────────"
for s in "${PASSED[@]:-}"; do [ -n "$s" ] && printf '  \033[32m✓\033[0m %s\n' "$s"; done
for s in "${FAILED[@]:-}"; do [ -n "$s" ] && printf '  \033[31m✗\033[0m %s\n' "$s"; done

if [ "${#FAILED[@]}" -gt 0 ]; then
  printf '\n\033[31m%d step(s) failed.\033[0m\n' "${#FAILED[@]}"
  exit 1
fi

if [ "$QUICK" = "1" ]; then
  printf '\n\033[33mQuick mode: build, API integration and the digest guard did NOT run.\033[0m\n'
elif [ "$FULL" = "0" ]; then
  printf '\n\033[33mDocker image builds and e2e did NOT run (use --full before a deploy).\033[0m\n'
fi
printf '\033[32mAll executed steps passed.\033[0m\n'
