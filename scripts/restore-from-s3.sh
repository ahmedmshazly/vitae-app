#!/usr/bin/env bash
# Download a Vitae S3 backup and run the existing G4 restore CLI.
#
# Required env:
#   BACKUP_S3_URI   e.g. s3://vitae-backups/prod
# Optional:
#   BACKUP_DAY      YYYY-MM-DD (default: contents of .../exports/LATEST)
#   DRY_RUN=1       download + verify checksum only; no database writes
#   CONFIRM=YES     required unless DRY_RUN=1
#   FORCE=1         pass --force to restore (non-empty target)
#
# Target: same API database environment as `pnpm --filter @vitae/api restore`.
# Checksums: sidecar zip_sha256, then the bundle's own manifest.json via restore.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

: "${BACKUP_S3_URI:?BACKUP_S3_URI is required (e.g. s3://vitae-backups/prod)}"

DRY_RUN="${DRY_RUN:-0}"
CONFIRM="${CONFIRM:-}"
FORCE="${FORCE:-0}"
S3_BASE="${BACKUP_S3_URI%/}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $1" >&2
    exit 1
  }
}
need aws
need pnpm
need sha256sum
need python3
need unzip

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/vitae-restore.XXXXXX")"
cleanup() { rm -rf "${WORKDIR}"; }
trap cleanup EXIT

if [[ -z "${BACKUP_DAY:-}" ]]; then
  BACKUP_DAY="$(aws s3 cp "${S3_BASE}/exports/LATEST" - 2>/dev/null | tr -d '[:space:]' || true)"
fi
if [[ -z "${BACKUP_DAY}" ]]; then
  echo "FAIL: set BACKUP_DAY=YYYY-MM-DD or ensure ${S3_BASE}/exports/LATEST exists" >&2
  exit 1
fi
if [[ ! "${BACKUP_DAY}" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "FAIL: invalid BACKUP_DAY=${BACKUP_DAY} (expected YYYY-MM-DD)" >&2
  exit 1
fi

S3_PREFIX="${S3_BASE}/exports/${BACKUP_DAY}"
ZIP_PATH="${WORKDIR}/vitae-export.zip"
SIDECAR_PATH="${WORKDIR}/backup-manifest.json"
BUNDLE_DIR="${WORKDIR}/bundle"

echo "restore: day=${BACKUP_DAY} from ${S3_PREFIX}"

aws s3 cp "${S3_PREFIX}/vitae-export.zip" "${ZIP_PATH}" --only-show-errors
aws s3 cp "${S3_PREFIX}/backup-manifest.json" "${SIDECAR_PATH}" --only-show-errors

EXPECTED_SHA="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["zip_sha256"])' "${SIDECAR_PATH}")"
ACTUAL_SHA="$(sha256sum "${ZIP_PATH}" | awk '{print $1}')"
if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  echo "FAIL: zip sha256 mismatch expected=${EXPECTED_SHA} actual=${ACTUAL_SHA}" >&2
  exit 1
fi
INCLUDES="$(python3 -c 'import json,sys; print("true" if json.load(open(sys.argv[1])).get("includes_sensitive") else "false")' "${SIDECAR_PATH}")"
if [[ "${INCLUDES}" != "true" ]]; then
  echo "FAIL: sidecar includes_sensitive is not true, refusing (share export ≠ backup)" >&2
  exit 1
fi
echo "restore: zip sha256 ok (${ACTUAL_SHA})"

mkdir -p "${BUNDLE_DIR}"
unzip -q "${ZIP_PATH}" -d "${BUNDLE_DIR}"

PASS_FORCE=0
if [[ "${FORCE}" == "1" ]]; then
  PASS_FORCE=1
fi
for arg in "$@"; do
  if [[ "${arg}" == "--force" ]]; then
    PASS_FORCE=1
  fi
done

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "DRY_RUN: would run: pnpm --filter @vitae/api restore ${BUNDLE_DIR}$( [[ ${PASS_FORCE} -eq 1 ]] && echo ' --force' )"
  echo "DRY_RUN: sidecar:"
  cat "${SIDECAR_PATH}"
  if [[ -f "${BUNDLE_DIR}/manifest.json" ]]; then
    echo "DRY_RUN: bundle manifest counts:"
    python3 -c 'import json; m=json.load(open("'"${BUNDLE_DIR}"'/manifest.json")); print(json.dumps({"includes_sensitive": m.get("includes_sensitive"), "counts": m.get("counts")}, indent=2))'
  fi
  exit 0
fi

if [[ "${CONFIRM}" != "YES" ]]; then
  echo "FAIL: restore writes to the target database. Re-run with CONFIRM=YES (or DRY_RUN=1)." >&2
  exit 1
fi

RESTORE_ARGS=("${BUNDLE_DIR}")
if [[ "${PASS_FORCE}" -eq 1 ]]; then
  RESTORE_ARGS+=(--force)
fi

echo "restore: invoking pnpm --filter @vitae/api restore ${RESTORE_ARGS[*]}"
pnpm --filter @vitae/api restore "${RESTORE_ARGS[@]}"

echo "restore: ok day=${BACKUP_DAY}"
