#!/usr/bin/env bash
# Prove backup-local.sh refuses a missing destination and an empty graph.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="${ROOT}/scripts/backup-local.sh"
PASS=0
FAIL=0

check() {
  local name="$1"
  shift
  if "$@"; then
    echo "ok  ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL  ${name}" >&2
    FAIL=$((FAIL + 1))
  fi
}

FAKE_OK="$(mktemp)"
FAKE_EMPTY="$(mktemp)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}" "${FAKE_OK}" "${FAKE_EMPTY}"' EXIT

cat >"${FAKE_OK}" <<'PY'
#!/usr/bin/env python3
import json, os, zipfile
out = os.environ["EXPORT_OUT"]
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, "w") as z:
    z.writestr("nodes.json", "[]")
sha = __import__("hashlib").sha256(open(out, "rb").read()).hexdigest()
print("log line")
print(json.dumps({"sha256": sha, "includes_sensitive": True, "counts": {"nodes": 3}, "project_id": "test"}))
PY
chmod +x "${FAKE_OK}"

cat >"${FAKE_EMPTY}" <<'PY'
#!/usr/bin/env python3
import json, os, zipfile
out = os.environ["EXPORT_OUT"]
os.makedirs(os.path.dirname(out), exist_ok=True)
with zipfile.ZipFile(out, "w") as z:
    z.writestr("nodes.json", "[]")
sha = __import__("hashlib").sha256(open(out, "rb").read()).hexdigest()
print(json.dumps({"sha256": sha, "includes_sensitive": True, "counts": {"nodes": 0}, "project_id": "test"}))
PY
chmod +x "${FAKE_EMPTY}"

check "refuses an empty BACKUP_DIR" bash -c "
  BACKUP_DIR= DRY_RUN=1 BACKUP_EXPORT_CMD='true' '${SCRIPT}' >/dev/null 2>&1
  test \$? -ne 0
"

check "refuses an empty export floor" bash -c "
  BACKUP_DIR='${WORKDIR}/empty' BACKUP_MIN_NODES=1 DRY_RUN=1 BACKUP_EXPORT_CMD='python3 ${FAKE_EMPTY}' '${SCRIPT}' >/dev/null 2>&1
  test \$? -ne 0
"

check "keeps a non-empty dry-run export" bash -c "
  BACKUP_DIR='${WORKDIR}/ok' BACKUP_MIN_NODES=1 DRY_RUN=1 BACKUP_EXPORT_CMD='python3 ${FAKE_OK}' '${SCRIPT}' >/dev/null 2>&1
  test \$? -eq 0 && test -f '${WORKDIR}/ok/'*/vitae-export.zip
"

echo "backup-local selftest: ${PASS} passed, ${FAIL} failed"
test "${FAIL}" -eq 0
