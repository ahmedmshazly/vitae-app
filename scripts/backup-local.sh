#!/usr/bin/env bash
# On-disk Vitae backup: full export (includeSensitive) → BACKUP_DIR.
# Reuses the G4 export ZIP shape; does not invent a second dump format.
#
# Required:
#   nothing, if defaults are acceptable
# Optional:
#   BACKUP_DIR        destination root (default: $HOME/vitae-backups)
#   BACKUP_DAY        YYYY-MM-DD (default: UTC today)
#   BACKUP_KEEP_DAYS  delete dated folders older than this (default: 14)
#   BACKUP_MIN_NODES  refuse an export holding fewer nodes than this (default: 1)
#   DRY_RUN=1         produce ZIP + sidecar; skip rotation
#   BACKUP_EXPORT_CMD how to run the exporter when pnpm is not on the host.
#                     Receives EXPORT_OUT in the environment.
#
# Database: provide the normal API database environment to the exporter.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

DRY_RUN="${DRY_RUN:-0}"
DAY="${BACKUP_DAY:-$(date -u +%Y-%m-%d)}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
BACKUP_MIN_NODES="${BACKUP_MIN_NODES:-1}"
if [[ -n "${BACKUP_DIR+x}" && -z "${BACKUP_DIR}" ]]; then
  echo "FAIL: BACKUP_DIR is empty." >&2
  exit 2
fi
BACKUP_DIR="${BACKUP_DIR:-${HOME}/vitae-backups}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $1" >&2
    exit 1
  }
}

BACKUP_EXPORT_CMD="${BACKUP_EXPORT_CMD:-}"
if [[ -z "${BACKUP_EXPORT_CMD}" ]]; then
  need pnpm
fi
need sha256sum
need python3

if ! mkdir -p "${BACKUP_DIR}"; then
  echo "FAIL: cannot create BACKUP_DIR=${BACKUP_DIR}" >&2
  exit 2
fi

DEST="${BACKUP_DIR}/${DAY}"
if ! mkdir -p "${DEST}"; then
  echo "FAIL: cannot create backup out-dir ${DEST}" >&2
  exit 2
fi

ZIP_PATH="${EXPORT_OUT:-${DEST}/vitae-export.zip}"
SIDECAR_PATH="${DEST}/backup-manifest.json"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/vitae-local-backup.XXXXXX")"
cleanup() { rm -rf "${WORKDIR}"; }
trap cleanup EXIT

EXPORT_LOG="${WORKDIR}/export.log"
STAGE_ZIP="${WORKDIR}/vitae-export.zip"
if [[ -z "${EXPORT_OUT:-}" ]]; then
  EXPORT_OUT="${STAGE_ZIP}"
fi

echo "backup-local: day=${DAY} dry_run=${DRY_RUN} → ${ZIP_PATH}"

set +e
if [[ -n "${BACKUP_EXPORT_CMD}" ]]; then
  # shellcheck disable=SC2086
  EXPORT_OUT="${EXPORT_OUT}" ${BACKUP_EXPORT_CMD} 2>&1 | tee "${EXPORT_LOG}"
else
  pnpm --filter @vitae/api export:bundle -- --out="${EXPORT_OUT}" 2>&1 | tee "${EXPORT_LOG}"
fi
EXPORT_EC=${PIPESTATUS[0]}
set -e
if [[ "${EXPORT_EC}" -ne 0 ]]; then
  echo "FAIL: export:bundle exited ${EXPORT_EC}" >&2
  exit "${EXPORT_EC}"
fi

SUMMARY_LINE="$(grep -E '^\{' "${EXPORT_LOG}" | tail -n1 || true)"
if [[ -z "${SUMMARY_LINE}" ]]; then
  echo "FAIL: export:bundle did not print a JSON summary line" >&2
  exit 1
fi

if [[ "${EXPORT_OUT}" != "${ZIP_PATH}" ]]; then
  cp -f "${EXPORT_OUT}" "${ZIP_PATH}"
fi

ZIP_SHA="$(sha256sum "${ZIP_PATH}" | awk '{print $1}')"
ZIP_BYTES="$(wc -c <"${ZIP_PATH}" | tr -d ' ')"
SUMMARY_SHA="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["sha256"])' "${SUMMARY_LINE}")"
if [[ "${ZIP_SHA}" != "${SUMMARY_SHA}" ]]; then
  echo "FAIL: zip sha256 mismatch export=${SUMMARY_SHA} file=${ZIP_SHA}" >&2
  exit 1
fi

PROJECT_ID="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("project_id",""))' "${SUMMARY_LINE}")"
INCLUDES_SENSITIVE="$(python3 -c 'import json,sys; print("true" if json.loads(sys.argv[1]).get("includes_sensitive") else "false")' "${SUMMARY_LINE}")"
if [[ "${INCLUDES_SENSITIVE}" != "true" ]]; then
  echo "FAIL: backup ZIP must include sensitive records (got includes_sensitive=${INCLUDES_SENSITIVE})" >&2
  exit 1
fi

COUNTS_SUMMARY="$(python3 -c 'import json,sys; c=json.loads(sys.argv[1]).get("counts",{}); print(" ".join(f"{k}={v}" for k,v in sorted(c.items()) if v))' "${SUMMARY_LINE}")"
NODE_COUNT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("counts",{}).get("nodes",0))' "${SUMMARY_LINE}")"
echo "backup-local: counts ${COUNTS_SUMMARY:-<all zero>}"
if (( NODE_COUNT < BACKUP_MIN_NODES )); then
  echo "FAIL: export holds ${NODE_COUNT} nodes, below the floor of ${BACKUP_MIN_NODES}." >&2
  echo "      Either the graph really shrank, or this ran against the wrong database." >&2
  echo "      Refusing to keep it as a backup. Override with BACKUP_MIN_NODES." >&2
  rm -f "${ZIP_PATH}"
  exit 1
fi

python3 - "${SIDECAR_PATH}" "${STAMP}" "${DAY}" "${PROJECT_ID}" "${ZIP_SHA}" "${ZIP_BYTES}" "${BACKUP_DIR}" <<'PY'
import json, sys
path, stamp, day, project_id, sha, bytes_, backup_dir = sys.argv[1:8]
manifest = {
    "schema_version": 1,
    "created_at": stamp,
    "day": day,
    "project_id": project_id,
    "includes_sensitive": True,
    "artifact": "vitae-export.zip",
    "zip_sha256": sha,
    "zip_bytes": int(bytes_),
    "backup_dir": backup_dir,
    "note": "Share-safe default export ≠ backup. This artifact is a full G4 export ZIP.",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

echo "backup-local: zip_sha256=${ZIP_SHA} bytes=${ZIP_BYTES} project=${PROJECT_ID}"
cat "${SIDECAR_PATH}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "backup-local: DRY_RUN=1, skipped rotation"
  echo "backup-local: local dir: ${DEST}"
  exit 0
fi

# Drop dated folders older than BACKUP_KEEP_DAYS. Names are YYYY-MM-DD.
python3 - "${BACKUP_DIR}" "${BACKUP_KEEP_DAYS}" "${DAY}" <<'PY'
import os, shutil, sys
from datetime import datetime, timedelta, timezone
root, keep_s, today = sys.argv[1], int(sys.argv[2]), sys.argv[3]
cutoff = datetime.strptime(today, "%Y-%m-%d").replace(tzinfo=timezone.utc) - timedelta(days=keep_s)
for name in os.listdir(root):
    path = os.path.join(root, name)
    if not os.path.isdir(path):
        continue
    try:
        day = datetime.strptime(name, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        continue
    if day < cutoff:
        shutil.rmtree(path)
        print(f"backup-local: rotated {name}")
PY

echo "backup-local: ok day=${DAY} dir=${DEST}"
