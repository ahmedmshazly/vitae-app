import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

const REPO_ROOT = resolve(import.meta.dirname, '../..');
const BUILDER = resolve(REPO_ROOT, 'scripts/docs/build-content.mjs');
const CORPUS = resolve(REPO_ROOT, 'docs/observatory');
const MODEL = resolve(REPO_ROOT, 'docs/registry/content-model.json');

function compile(): void {
  execFileSync(process.execPath, [BUILDER, '--quiet'], { cwd: REPO_ROOT, stdio: 'inherit' });
}

/**
 * Keep the compiled corpus fresh while the dev server is running.
 *
 * The corpus is not a web asset any more: it is served by the API behind the
 * owner allow-list, out of the directory `DOCS_CONTENT_DIR` names. Nothing in
 * this bundle reads it, so this plugin no longer runs at build time — it exists
 * purely so that editing a page during development recompiles it and the API
 * serves the new text on the next request.
 *
 * The compiled JSON is not committed. An artifact that lives in the repository
 * is one someone can forget to regenerate, and the failure mode is the worst
 * kind: a documentation surface confidently serving a page that no longer says
 * what the corpus says.
 *
 * The builder runs as a separate process rather than an import because a watch
 * rebuild needs it to run again, and a module that has already been evaluated
 * will not.
 */
export function docsContent(): Plugin {
  return {
    name: 'vitae-docs-content',
    // No `buildStart`. A production build of this bundle must not compile the
    // corpus: nothing here serves it, and writing it anywhere near `dist` is
    // how it became public in the first place.
    configureServer(server) {
      server.watcher.add([CORPUS, MODEL]);
      const rebuild = (path: string) => {
        if (!path.startsWith(CORPUS) && path !== MODEL) return;
        try {
          compile();
        } catch {
          // The builder has already printed which page it could not read, and
          // throwing here would take the dev server down with it. The reader
          // keeps the last good corpus until the page is fixed.
          return;
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', rebuild);
      server.watcher.on('change', rebuild);
      server.watcher.on('unlink', rebuild);
    },
  };
}
