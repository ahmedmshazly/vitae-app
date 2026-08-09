#!/usr/bin/env bash
# Off-box Vitae backup: full export (includeSensitive) → S3.
# Reuses the G4 export ZIP shape; does not invent a second dump format.
#
# Required env (unless DRY_RUN=1 without wanting an upload):
#   BACKUP_S3_URI   e.g. s3://vitae-backups/prod
# Optional:
#   BACKUP_DAY      YYYY-MM-DD (default: UTC today)
#   DRY_RUN=1       produce ZIP + sidecar locally; skip S3
#   KEEP_LOCAL=1    keep work dir under .vitae-backup/<day>/
#   EXPORT_OUT      override ZIP path inside the work dir
#   BACKUP_SSE_KMS_KEY_ID  KMS CMK id/arn for uploads (default: SSE-S3 AES256)
#   BACKUP_MIN_NODES  refuse to publish an export holding fewer nodes than this
#                     (default 1, i.e. never publish an empty backup)
#   BACKUP_EXPORT_CMD how to run the exporter, when pnpm is not on the host.
#                     Receives EXPORT_OUT in the environment. The production VM
#                     has only Docker, so its systemd unit sets this.
#
# Database: provide the normal API database environment to the exporter.
# AWS: prefer GHA OIDC or an EC2 instance role, no long-lived keys in git.
#
# S3 layout:
#   ${BACKUP_S3_URI}/exports/YYYY-MM-DD/vitae-export.zip
#   ${BACKUP_S3_URI}/exports/YYYY-MM-DD/backup-manifest.json
#   ${BACKUP_S3_URI}/exports/LATEST
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

DRY_RUN="${DRY_RUN:-0}"
KEEP_LOCAL="${KEEP_LOCAL:-0}"
DAY="${BACKUP_DAY:-$(date -u +%Y-%m-%d)}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
# Floor defaults to "not empty". Callers that know the real size should raise it
#, see the nightly workflow, which pins a figure just under the live graph.
BACKUP_MIN_NODES="${BACKUP_MIN_NODES:-1}"

# Server-side encryption for the uploaded objects (the ZIP is a full sensitive
# export). Default to SSE-S3 (AES256); set BACKUP_SSE_KMS_KEY_ID to use a KMS CMK
# instead. The upload never depends on the bucket's implicit default encryption.
if [[ -n "${BACKUP_SSE_KMS_KEY_ID:-}" ]]; then
  SSE_ARGS=(--sse aws:kms --sse-kms-key-id "${BACKUP_SSE_KMS_KEY_ID}")
else
  SSE_ARGS=(--sse AES256)
fi

if [[ "${DRY_RUN}" != "1" ]]; then
  : "${BACKUP_S3_URI:?BACKUP_S3_URI is required unless DRY_RUN=1 (e.g. s3://vitae-backups/prod)}"
fi

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "FAIL: required command not found: $1" >&2
    exit 1
  }
}
# The exporter runs through pnpm on a dev machine, but the production VM has
# only Docker, no node, no pnpm. BACKUP_EXPORT_CMD lets the caller supply the
# invocation; the systemd unit passes the compose one-off. Defaulting to pnpm
# keeps every existing caller working unchanged.
BACKUP_EXPORT_CMD="${BACKUP_EXPORT_CMD:-}"
if [[ -z "${BACKUP_EXPORT_CMD}" ]]; then
  need pnpm
fi
need sha256sum
need python3
if [[ "${DRY_RUN}" != "1" ]]; then
  need aws
fi

if [[ "${DRY_RUN}" == "1" || "${KEEP_LOCAL}" == "1" ]]; then
  # A containerised exporter cannot write into the repo checkout, only /tmp is
  # shared, so the keep-the-artifact modes still stage under /tmp there. Found
  # by dry-running the host timer, which is the point of dry-running it.
  if [[ -n "${BACKUP_EXPORT_CMD}" ]]; then
    WORKDIR="${TMPDIR:-/tmp}/vitae-backup-${DAY}"
  else
    WORKDIR="${ROOT}/.vitae-backup/${DAY}"
  fi
  mkdir -p "${WORKDIR}"
  cleanup() { :; }
else
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/vitae-backup.XXXXXX")"
  cleanup() { rm -rf "${WORKDIR}"; }
  trap cleanup EXIT
fi

ZIP_PATH="${EXPORT_OUT:-${WORKDIR}/vitae-export.zip}"
SIDECAR_PATH="${WORKDIR}/backup-manifest.json"
S3_BASE="${BACKUP_S3_URI:+${BACKUP_S3_URI%/}}"
S3_PREFIX="${S3_BASE:+${S3_BASE}/exports/${DAY}}"

echo "backup: day=${DAY} dry_run=${DRY_RUN} → ${ZIP_PATH}"

# Capture the last JSON line from export:bundle (summary); keep human logs on stderr path via tee.
EXPORT_LOG="${WORKDIR}/export.log"
set +e
if [[ -n "${BACKUP_EXPORT_CMD}" ]]; then
  # shellcheck disable=SC2086  # deliberate word-splitting: the command is a template
  EXPORT_OUT="${ZIP_PATH}" ${BACKUP_EXPORT_CMD} 2>&1 | tee "${EXPORT_LOG}"
else
  pnpm --filter @vitae/api export:bundle -- --out="${ZIP_PATH}" 2>&1 | tee "${EXPORT_LOG}"
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

# Content floor. A checksum only proves the ZIP is intact, not that it holds
# anything, so an export against an empty or wrong database uploads cleanly and
# reports success. That is the worst failure a backup can have, because it looks
# healthy right up until you need it. Assert the graph is actually in there.
COUNTS_SUMMARY="$(python3 -c 'import json,sys; c=json.loads(sys.argv[1]).get("counts",{}); print(" ".join(f"{k}={v}" for k,v in sorted(c.items()) if v))' "${SUMMARY_LINE}")"
NODE_COUNT="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("counts",{}).get("nodes",0))' "${SUMMARY_LINE}")"
echo "backup: counts ${COUNTS_SUMMARY:-<all zero>}"
if (( NODE_COUNT < BACKUP_MIN_NODES )); then
  echo "FAIL: export holds ${NODE_COUNT} nodes, below the floor of ${BACKUP_MIN_NODES}." >&2
  echo "      Either the graph really shrank, or this ran against the wrong database." >&2
  echo "      Refusing to publish it as a backup. Override with BACKUP_MIN_NODES." >&2
  exit 1
fi

python3 - "${SIDECAR_PATH}" "${STAMP}" "${DAY}" "${PROJECT_ID}" "${ZIP_SHA}" "${ZIP_BYTES}" "${S3_PREFIX:-}" <<'PY'
import json, sys
path, stamp, day, project_id, sha, bytes_, s3_prefix = sys.argv[1:8]
manifest = {
    "schema_version": 1,
    "created_at": stamp,
    "day": day,
    "project_id": project_id,
    "includes_sensitive": True,
    "artifact": "vitae-export.zip",
    "zip_sha256": sha,
    "zip_bytes": int(bytes_),
    "s3_exports_prefix": s3_prefix or None,
    "note": "Share-safe default export ≠ backup. This artifact is a full G4 export ZIP.",
}
with open(path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PY

echo "backup: zip_sha256=${ZIP_SHA} bytes=${ZIP_BYTES} project=${PROJECT_ID}"
cat "${SIDECAR_PATH}"

if [[ "${DRY_RUN}" == "1" ]]; then
  echo "backup: DRY_RUN=1, skipped S3 upload"
  echo "backup: local dir: ${WORKDIR}"
  exit 0
fi

echo "backup: upload → ${S3_PREFIX}/ (sse: ${SSE_ARGS[*]})"
aws s3 cp "${ZIP_PATH}" "${S3_PREFIX}/vitae-export.zip" "${SSE_ARGS[@]}" --only-show-errors
aws s3 cp "${SIDECAR_PATH}" "${S3_PREFIX}/backup-manifest.json" "${SSE_ARGS[@]}" --only-show-errors
echo "${DAY}" | aws s3 cp - "${S3_BASE}/exports/LATEST" "${SSE_ARGS[@]}" --content-type text/plain --only-show-errors

echo "backup: ok day=${DAY} LATEST → ${DAY}"
