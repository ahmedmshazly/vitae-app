#!/bin/sh
# Copy the image's warmed Tectonic cache onto writable tmpfs at startup.
# The runtime root filesystem is read-only (compose hardening) and has no
# network, so the cache must be (a) writable: Tectonic writes to its cache
# even on fully cached compiles, and (b) exactly what this image warmed;
# a named volume would go stale across image rebuilds (it only seeds when
# empty), which is how the phvr8t/DNS production failure happened.
set -eu

SRC="${TECTONIC_CACHE_SEED:-/app/.tectonic-cache-image}"
DST="${TECTONIC_CACHE_DIR:-/tmp/.tectonic-cache}"

mkdir -p "$DST"
cp -R "$SRC/." "$DST/"
chmod -R u+rwX "$DST"
echo "buildsvc: seeded tectonic cache $SRC -> $DST ($(du -sh "$DST" | cut -f1))"

if [ "$#" -eq 0 ]; then
  set -- node dist/server.js
fi
exec "$@"
