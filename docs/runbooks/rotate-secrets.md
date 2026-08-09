# Runbook: rotate secrets

All secrets live only in the git-ignored `.env` (local) or the deploy platform's
secret store (prod). Names are documented in `.env.example`; values are never
committed.

## Cloudinary (`CLOUDINARY_URL`)
1. In the Cloudinary console → Settings → Security → **regenerate API secret**.
2. Update `CLOUDINARY_URL=cloudinary://<key>:<new_secret>@<cloud>` in `.env`
   (and the prod secret store).
3. Restart the API. Existing stored objects are unaffected (content-addressed).

> The initial dev `CLOUDINARY_URL` was shared in chat during setup. Rotate it
> at least once before any real use.

## Build service HMAC (`BUILDSVC_HMAC_SECRET`)
1. Pick a new random string (`openssl rand -hex 32`).
2. Set it identically in the API's `.env` **and** the buildsvc container env
   (`compose.yaml` / Fly secret). They must match or every compile 401s.
3. Restart both.

## Session secret (`SESSION_SECRET`)
Rotating invalidates existing dev-login sessions (users re-sign-in). Update
`.env` and restart the API.
