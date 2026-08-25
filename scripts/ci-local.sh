#!/usr/bin/env bash
#
# Local equivalent of .github/workflows/ci.yml.
#
# This mirrors the CI jobs in the same order and preserves its fatal-skip rule:
# a suite that quietly skips itself is a failure, not a pass.
#
#   ./scripts/ci-local.sh            # everything that runs without Docker
#   ./scripts/ci-local.sh --full     # adds both image builds and e2e
#   ./scripts/ci-local.sh --quick    # the gates that need no Postgres or build
#
# GitHub Actions on this account can be billing-blocked, so this script is the
# gate rather than a convenience. It therefore runs the repository gates, the
# property suite, the accessibility suite, the dependency audit and the web
# budgets that the workflow runs, plus @vitae/ui and @vitae/testkit, which no
# job on either side used to run at all.
#
# Not covered here, and deliberately: the Trivy image scans, the SBOM, and the
# LaTeX calibration job. They need registry access and a warmed Tectonic cache.
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
    -h|--help) sed -n '3,23p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# Stop whatever is listening on a port this script owns.
#
# `e2e_local()` refuses to run when any of these ports is already in use, so
# anything holding one at cleanup time was started here. That is what makes
# reaping by port safe rather than a blunt instrument.
#
# It is also necessary. `$!` after `ci_env setsid env ... &` is the pid of the
# subshell bash forks to run the `ci_env` *function*, not of the session
# `setsid` creates for the service inside it. `kill -- -$pid` therefore
# signalled a process group with no members, the API survived, and the `wait`
# that followed blocked on that subshell for ever: the gate printed its summary
# and never exited, holding 4010, 5183 and 8797 so the next run refused to
# start. Seen on 2026-08-25, hung for 54 minutes.
reap_port() {
  local port="$1" pid pgid
  pid="$(ss -ltnp 2>/dev/null | grep ":$port " | grep -oE 'pid=[0-9]+' | head -1 | cut -d= -f2)"
  [ -n "$pid" ] || return 0
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [ -n "$pgid" ] && kill -- "-$pgid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
}

cleanup() {
  for pid in "${SERVICE_PIDS[@]:-}"; do
    [ -n "$pid" ] && kill -- "-$pid" 2>/dev/null || true
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  reap_port "$API_PORT"
  reap_port "$WEB_PORT"
  # Bounded. A service that ignores the signal must not hold the gate open.
  local waited=0
  while { port_open "$API_PORT" || port_open "$WEB_PORT"; } && [ "$waited" -lt 10 ]; do
    sleep 1
    waited=$((waited + 1))
  done
  if [ -n "$BUILDSVC_CONTAINER" ]; then
    docker rm -f "$BUILDSVC_CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ "$STARTED_EMULATORS" = "1" ] && [ -n "$EMULATOR_PID" ]; then
    step "Stopping the Auth emulator this script started (pid $EMULATOR_PID)"
    # The Firebase CLI launches Java children, in their own session, so the
    # recorded pid is not the group that holds the port. Same reason as
    # reap_port above: signal what is actually listening.
    kill -- "-$EMULATOR_PID" 2>/dev/null || true
    kill "$EMULATOR_PID" 2>/dev/null || true
    reap_port "$AUTH_PORT"
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

# The four repository gates the `quality` job runs as one step. Grouped the same
# way so a failure points at the same place the workflow would.
repository_gates() {
  pnpm test:map && pnpm test:prose && pnpm test:public && pnpm test:brand
}

# The two gates that guard this script and the suite it runs. test:mirror fails
# when the workflow gains a step this file does not; test:ratchets fails when
# the suite loses coverage. Both carry their own self-tests, because a gate
# nobody has seen fail is a gate nobody should trust.
harness_gates() {
  pnpm test:mirror && pnpm test:ratchets
}

# The web bundle is measured, not guessed. The repository .env carries
# NODE_ENV=development, and Vite captures `isNodeEnvSet` before it loads the
# config, so a value in .env outranks `vite build` and the result is a
# development bundle about a megabyte larger than what ships. Exporting
# NODE_ENV here is what makes this the same artifact CI builds from a bare
# checkout. scripts/check-web-budgets.mjs carries the full account.
#
# It must not leak any further: packages/config refuses to boot an API with
# NODE_ENV=production and AUTH_ENABLE_DEV_LOGIN=true, which is every run below.
production_build() {
  NODE_ENV=production pnpm build && test -f apps/web/dist/index.html
}

web_budgets() {
  VITAE_REQUIRE_BUDGETS=true pnpm test:performance
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
run_step "Repository gates (map, prose, public, brand)" repository_gates
run_step "Generated documentation"   pnpm docs:check
run_step "Harness gates (mirror, ratchets)" harness_gates
run_step "Unit tests (core + testkit)" pnpm test:unit
run_step "Design system (@vitae/ui)" pnpm --filter @vitae/ui test
run_step "Web unit tests"            pnpm test:web
run_step "Web accessibility (axe)"   pnpm test:a11y

if [ "$QUICK" = "0" ]; then
  run_step "Property, metamorphic and golden" pnpm test:property
  run_step "Dependency audit"        pnpm audit --audit-level=high
  run_step "Digest-pin guard"        digest_pin_guard
  run_step "Production build"        production_build
  run_step "Web performance budgets" web_budgets
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
    DOCS_CONTENT_DIR=docs/.compiled \
    "$@"
}

# What the workflow's e2e job sets for the browser bundle. Without these the
# sign-in screen renders no developer button and every signed-in spec fails at
# the door. A relative DOCS_CONTENT_DIR resolves against the repository root,
# not the process cwd, which is why the bare value works from anywhere.
web_build_env() {
  env \
    NODE_ENV=production \
    VITE_FIREBASE_API_KEY=demo-api-key \
    VITE_FIREBASE_AUTH_DOMAIN=vitae-local.firebaseapp.com \
    VITE_FIREBASE_PROJECT_ID=vitae-local \
    VITE_FIREBASE_USE_EMULATOR=true \
    VITE_FIREBASE_AUTH_EMULATOR_HOST="http://127.0.0.1:$AUTH_PORT" \
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

  # The API caches "no corpus published" on its first request, so the corpus is
  # compiled before anything starts. Without it the API answers 503 and the
  # nineteen cases in docs.spec.ts fail looking exactly like a product defect.
  pnpm docs:build || return 1

  web_build_env VITE_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
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

  # CI=1 buys the same single retry the workflow gets, for the same reason: the
  # stack is real and one cold-start hiccup is not a regression. It is also what
  # e2e/playwright.config.ts reads to decide there is a gate watching.
  local status=0
  if [ -n "${VITAE_E2E_TESTS:-}" ]; then
    CI=1 \
    E2E_BASE_URL="http://127.0.0.1:$WEB_PORT" \
    E2E_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
      pnpm --filter @vitae/e2e exec playwright test $VITAE_E2E_TESTS || status=$?
  else
    CI=1 \
    E2E_BASE_URL="http://127.0.0.1:$WEB_PORT" \
    E2E_API_BASE_URL="http://127.0.0.1:$API_PORT/api/v1" \
      pnpm e2e || status=$?
  fi

  if [ "$status" != "0" ]; then
    echo
    echo "E2E failed. The evidence is on disk, not only in this scrollback:"
    echo "  report  e2e/playwright-report/index.html"
    echo "  traces  e2e/test-results/            (open one with: pnpm --filter @vitae/e2e exec playwright show-trace <path>)"
    echo "  junit   e2e/test-results/junit.xml"
    echo "  api log $API_LOG"
    echo "  web log $WEB_LOG"
  fi
  return "$status"
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
  printf '\n\033[33mQuick mode: property tests, the dependency audit, the digest guard, the build, the web budgets and API integration did NOT run.\033[0m\n'
elif [ "$FULL" = "0" ]; then
  printf '\n\033[33mDocker image builds and e2e did NOT run (use --full before a deploy).\033[0m\n'
fi
printf '\033[32mAll executed steps passed.\033[0m\n'
