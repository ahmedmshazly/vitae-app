/**
 * The documentation corpus, served to the owner and to nobody else.
 *
 * The corpus used to be static files on the public web host. It is not public:
 * the curated half describes every trust boundary and known gap in the system,
 * and the generated half enumerates every route, endpoint, table, migration and
 * exported symbol in the repository. Published openly it is a map of the
 * software for anyone who wants one.
 *
 * Serving it from here is what makes it private, and it costs no new
 * authorisation code. `app.use('/api', authGate)` already refuses every request
 * that does not carry a verified identity, and in self-hosted mode
 * `authorized()` additionally requires that identity to be OWNER_EMAIL. This
 * router therefore inherits exactly the allow-list that protects the graph
 * itself. There is nothing to get wrong here, which is the point of putting it
 * here rather than writing a second gate.
 *
 * What this file still has to get right is file access. It maps a URL onto a
 * path under one directory, and that is the classic way to serve `/etc/passwd`
 * by accident. `resolveWithin` is the whole defence and it is deliberately
 * paranoid: resolve first, then prove the result is inside the root, and refuse
 * anything else without explaining which part was wrong.
 */
import { Router, type Request } from 'express';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
export const docsRouter: Router = Router();

/**
 * The directory the corpus was built into, or null if this deployment has none.
 *
 * Read from `process.env` on each request rather than from the validated env
 * object, which is the same choice `cloudEnabled()` makes and for the same
 * reason: the validated object is parsed once at import, so a deployment that
 * mounts the corpus after start — and every test that varies it — would be
 * reading a value frozen before the directory existed. The schema in
 * `packages/config` still declares and validates the variable; this only
 * decides when it is read.
 */
// apps/api/src/routes/v1 -> repo root is five levels up.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

function contentRoot(): string | null {
  const configured = process.env.DOCS_CONTENT_DIR;
  if (!configured) return null;
  // A relative value is resolved against the repository root, not the process
  // working directory. `.env` lives at the repository root and is written by
  // someone thinking in repository paths, so `docs/.compiled` has to mean what
  // it looks like it means. Resolved against the cwd it silently becomes
  // `apps/api/docs/.compiled`, and the only symptom is documentation that
  // reports itself unavailable for no visible reason.
  return isAbsolute(configured) ? resolve(configured) : resolve(REPO_ROOT, configured);
}

/**
 * Resolve a request path to a real file inside `root`, or null.
 *
 * Null covers every refusal — traversal, absolute paths, a symlink pointing
 * out, a directory, a missing file — and the caller answers all of them with
 * the same 404. Distinguishing "outside the root" from "does not exist" would
 * tell a caller where the root is and what is next to it.
 */
function resolveWithin(root: string, requested: string): string | null {
  // A decoded `%2e%2e` is still `..`, and Express has already decoded it.
  const cleaned = normalize(requested).replace(/^([/\\])+/, '');
  if (cleaned.includes('\0')) return null;

  const candidate = resolve(root, cleaned);
  // `startsWith(root)` alone would accept a sibling named `corpus-secrets`
  // when the root is `corpus`. The separator is what makes it containment.
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  if (!existsSync(candidate)) return null;

  // `resolve` is string arithmetic: it does not follow symlinks, so a link
  // *inside* the corpus pointing anywhere on the filesystem passes the check
  // above and is then happily read. `realpathSync` is what turns the path into
  // the file that will actually be opened, and the containment check has to be
  // made against that. Both sides are realpathed because the root itself is
  // often a link (a temporary directory usually is).
  let real: string;
  let realRoot: string;
  try {
    real = realpathSync(candidate);
    realRoot = realpathSync(root);
  } catch {
    return null;
  }
  if (real !== realRoot && !real.startsWith(realRoot + sep)) return null;

  // Sockets, FIFOs and directories are not documentation.
  if (!statSync(real).isFile()) return null;
  return real;
}

/**
 * Everything under this router is private, so it must never enter a shared
 * cache. `private` keeps it out of proxies; `no-store` keeps it off disk. The
 * corpus is small and local, so re-fetching costs nothing worth trading for.
 */
function privately(res: Parameters<Parameters<Router['get']>[1]>[1]): void {
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
}

docsRouter.get('/', (_req, res) => {
  const root = contentRoot();
  res.json({
    available: root !== null && existsSync(root),
    // Named so an operator can tell "not built" from "built somewhere else"
    // without reading the container's filesystem.
    configured: root !== null,
  });
});

// Express 4's wildcard, which captures the remainder into `params[0]`. The
// `/{*name}` form belongs to Express 5 and would be read here as a literal
// path segment, so the route would simply never match.
docsRouter.get('/*', (req: Request<Record<string, string>>, res) => {
  const root = contentRoot();
  if (root === null || !existsSync(root)) {
    res.status(503).json({
      code: 'DOCS_UNAVAILABLE',
      message:
        'No documentation corpus was built into this deployment. Run `pnpm docs:build --out <dir>` '
        + 'and set DOCS_CONTENT_DIR to that directory.',
    });
    return;
  }

  const requested = String(req.params[0] ?? '');
  const file = resolveWithin(root, requested);
  if (!file) {
    res.status(404).json({ code: 'NOT_FOUND', message: 'No such documentation file.' });
    return;
  }

  privately(res);
  // The corpus is JSON throughout. Saying so explicitly, rather than letting a
  // static handler guess from the extension, means a file that somehow is not
  // JSON cannot be served as something a browser will execute.
  res.type('application/json');
  createReadStream(file).pipe(res);
});
