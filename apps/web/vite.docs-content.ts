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
 * Compile the documentation corpus into `public/docs-content` before Vite
 * serves or builds.
 *
 * The compiled JSON is not committed. An artifact that lives in the repository
 * is one someone can forget to regenerate, and the failure mode is the worst
 * kind: a documentation surface confidently serving a page that no longer says
 * what the corpus says. Compiling on every serve and every build removes the
 * chance to be out of date rather than adding a check for it.
 *
 * The builder runs as a separate process rather than an import because a watch
 * rebuild needs it to run again, and a module that has already been evaluated
 * will not.
 */
export function docsContent(): Plugin {
  return {
    name: 'vitae-docs-content',
    buildStart() {
      compile();
    },
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
