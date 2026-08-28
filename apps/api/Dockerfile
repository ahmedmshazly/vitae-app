# Vitae API, production image.
#
# The API runs its TypeScript source directly under tsx (a production
# dependency), which also resolves the workspace packages (@vitae/core,
# @vitae/config) from source, no compile step, no dist wiring.
#
# Build from the REPO ROOT (the workspace lockfile is the build input):
#   docker build -f apps/api/Dockerfile -t vitae/api .
#
# Runtime env: see docs/DEPLOYMENT.md §2 (WEB_ORIGIN, OWNER_EMAIL,
# GOOGLE_APPLICATION_CREDENTIALS, SESSION_SECRET, CLOUDINARY_URL, ...).

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS deps
RUN corepack enable
WORKDIR /app
# Manifests only, so the dependency layer caches across source changes.
# Normalize permissions explicitly after copying so this Dockerfile also works
# with engines that do not support BuildKit-only COPY flags.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
RUN pnpm --filter @vitae/api... install --frozen-lockfile --prod

FROM node:22-alpine@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app /app
COPY packages/core packages/core
COPY packages/config packages/config
COPY apps/api apps/api
# Résumé LaTeX templates. services/resume.ts falls back to a relative walk
# (../../../../templates) when TEMPLATES_DIR is unset, set it explicitly so
# the image doesn't depend on that directory-depth coupling.
COPY templates templates
ENV TEMPLATES_DIR=/app/templates
# The npm CLI ships inside the Node base image and vendors its own copy of
# `tar`. CVE-2026-59873 (tar < 7.5.19) is reported against that copy, and
# --ignore-unfixed does not suppress it because upstream HAS fixed it: the
# first npm carrying a patched tar (10.9.9) was published one day after the
# last Node 22 release, so no node:22 digest exists to move to. Nothing in
# this image runs npm — CMD is tsx, HEALTHCHECK is node — so the CLI comes out
# rather than being chased version to version. The `deps` stage keeps its own
# npm and corepack and is discarded.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
 && chmod -R a+rX /app

USER node
WORKDIR /app/apps/api
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.API_PORT||4000)+'/ready',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["./node_modules/.bin/tsx", "src/index.ts"]
