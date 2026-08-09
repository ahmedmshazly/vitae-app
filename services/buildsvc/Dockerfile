# Vitae LaTeX build service (SRS §8.4).
# Debian-slim + pinned Tectonic + poppler-utils. Built from the REPO ROOT
# context so the real templates/ are baked in and warmed: calibrate.ts splices
# sample content into every template and compiles it, then a --network=none
# pass proves the cache is complete, the image cannot build if any font or
# package would need the network at runtime. Runs non-root, offline.
#
#   docker compose build buildsvc        (compose sets context to the repo root)

# FR-016 (review 2026-07-13): this is the compiler's supply chain, so nothing in
# it may be mutable. The base image is pinned by digest (a tag can be moved), npm
# resolves from the committed lockfile (`npm ci`, not `npm install`), and the
# Tectonic tarball is verified against a recorded SHA-256 before it is unpacked
# and executed, a substituted release binary would otherwise run inside every
# résumé compile with no diff in this repository.

# ── Stage 1: compile the TypeScript server ───────────────────────────────────
FROM node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf AS build
WORKDIR /app
COPY services/buildsvc/package.json services/buildsvc/package-lock.json services/buildsvc/tsconfig.json ./
RUN npm ci
COPY services/buildsvc/src ./src
RUN npm run build

# ── Stage 2: runtime with Tectonic + poppler ─────────────────────────────────
FROM node:22-bookworm-slim@sha256:53ada149d435c38b14476cb57e4a7da73c15595aba79bd6971b547ceb6d018bf
ARG TECTONIC_VERSION=0.15.0
# sha256 of tectonic-0.15.0-x86_64-unknown-linux-gnu.tar.gz (upstream release).
ARG TECTONIC_SHA256=875fbbc9ab48560d7776088c608e0beee49197b57ab4a2f6c5385b2c661c842f

# poppler-utils (pdfinfo/pdftotext) + the shared libs the prebuilt Tectonic
# binary is dynamically linked against (graphite2, harfbuzz, freetype, icu, ssl).
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates poppler-utils fontconfig \
      libgraphite2-3 libharfbuzz0b libfreetype6 libfontconfig1 \
      libicu72 libssl3 zlib1g \
    && rm -rf /var/lib/apt/lists/*

# Install a pinned Tectonic release, download, VERIFY, then unpack. Piping curl
# straight into tar would execute whatever the URL happened to serve.
RUN curl -fsSL -o /tmp/tectonic.tar.gz \
      "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-gnu.tar.gz" \
    && echo "${TECTONIC_SHA256}  /tmp/tectonic.tar.gz" | sha256sum -c - \
    && tar -xz -C /usr/local/bin -f /tmp/tectonic.tar.gz tectonic \
    && rm /tmp/tectonic.tar.gz \
    && tectonic --version

WORKDIR /app
ENV NODE_ENV=production
# Build-time cache location, baked into the image; the entrypoint copies it to
# the writable TECTONIC_CACHE_DIR (tmpfs) at startup. No named volume: volumes
# only seed when empty, so they silently go stale across image rebuilds.
ENV TECTONIC_CACHE_DIR=/app/.tectonic-cache-image
ENV XDG_CACHE_HOME=/tmp/.cache

COPY services/buildsvc/package.json services/buildsvc/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY services/buildsvc/entrypoint.sh ./entrypoint.sh
# calibrate.ts falls back to CWD-relative ./templates when TEMPLATES_DIR is
# unset, set it explicitly so the image doesn't depend on the working dir.
COPY templates ./templates
ENV TEMPLATES_DIR=/app/templates

# Warm the cache by compiling EVERY template with representative content
# (must succeed, no `|| true`), then prove the cache is complete by
# recompiling with the network disabled and --only-cached. This is the
# regression gate for the "phvr8t / dns error" class of production failure.
RUN node dist/calibrate.js
RUN --network=none node dist/calibrate.js --only-cached

# Runtime cache lives on tmpfs; the entrypoint seeds it from the image.
ENV TECTONIC_CACHE_SEED=/app/.tectonic-cache-image
ENV TECTONIC_CACHE_DIR=/tmp/.tectonic-cache

# Drop privileges.
RUN useradd -m -u 10001 texbuilder && chown -R texbuilder:texbuilder /app
USER texbuilder

EXPOSE 8787
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/server.js"]
