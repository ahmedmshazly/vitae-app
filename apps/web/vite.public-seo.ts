import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import { PUBLIC_METADATA, getPublicLaunchConfig } from './src/public/site.js';
import {
  robotsTxt,
  sitemapXml,
  staticPublicBody,
  webManifest,
  withPublicHead,
} from './src/public/seo.js';
import { docsPageMetadata, docsStaticBody } from './src/public/docs-static.js';
import type { DocsManifest, DocsPageContent } from './src/routes/docs/docsModel.js';

function routeHtmlPath(outputDirectory: string, routePath: string): string {
  if (routePath === '/') return resolve(outputDirectory, 'index.html');
  return resolve(outputDirectory, routePath.slice(1), 'index.html');
}

function withStaticBody(html: string, body: string): string {
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

/**
 * The compiled documentation corpus, if this build produced one.
 *
 * Vite copies `public/` into the output directory before `closeBundle`, so by
 * the time this runs the manifest the documentation plugin compiled is sitting
 * there as a plain file. Reading it back is what lets one plugin prerender
 * pages another plugin authored without the two having to share state.
 *
 * A missing manifest is not an error. A build with the documentation plugin
 * disabled is a legitimate build; it simply has no documentation to prerender.
 */
function readDocsCorpus(outputDirectory: string): DocsManifest | null {
  const manifestPath = resolve(outputDirectory, 'docs-content/manifest.json');
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as DocsManifest;
}

/**
 * Write every documentation page as a document that needs no script.
 *
 * The reader in the browser and this loop render from the same compiled JSON
 * and ask the same model module for breadcrumbs, reading order and status
 * words, so the two documents agree by construction rather than by review.
 *
 * Returns the routes written, for the sitemap.
 */
function writeDocsPages(
  outputDirectory: string,
  shell: string,
  launch: ReturnType<typeof getPublicLaunchConfig>,
): readonly string[] {
  const manifest = readDocsCorpus(outputDirectory);
  if (!manifest) return [];

  const written: string[] = [];
  for (const summary of manifest.pages) {
    const contentPath = resolve(outputDirectory, 'docs-content', summary.content);
    if (!existsSync(contentPath)) continue;
    const page = JSON.parse(readFileSync(contentPath, 'utf8')) as DocsPageContent;
    const outputPath = routeHtmlPath(outputDirectory, summary.route);
    const html = withStaticBody(
      withPublicHead(shell, docsPageMetadata(summary), launch),
      docsStaticBody(manifest, summary, page),
    );
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, html);
    written.push(summary.route);
  }
  return written;
}

/**
 * Produces a real HTML entry point for every public URL after Vite emits the
 * app shell. This keeps private routes in the SPA fallback while public pages
 * get individual title, canonical, robots, social, structured-data, and text
 * snapshots without adding a runtime server.
 */
export function publicSeoArtifacts(env: Record<string, string>): Plugin {
  let resolved: ResolvedConfig | null = null;
  const launch = getPublicLaunchConfig(env);

  return {
    name: 'vitae-public-seo-artifacts',
    apply: 'build',
    configResolved(config) {
      resolved = config;
    },
    closeBundle() {
      if (!resolved) return;
      const outputDirectory = resolve(resolved.root, resolved.build.outDir);
      const shellPath = resolve(outputDirectory, 'index.html');
      const shell = readFileSync(shellPath, 'utf8');

      for (const page of PUBLIC_METADATA) {
        // Sign-in and sign-up are intentionally client-only entry screens. They
        // retain runtime metadata but do not need search-facing static copies.
        if (page.path === '/signin' || page.path === '/signup') continue;
        const outputPath = routeHtmlPath(outputDirectory, page.path);
        const publicHtml = withStaticBody(
          withPublicHead(shell, page, launch),
          staticPublicBody(page, launch),
        );
        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, publicHtml);
      }

      // Documentation last, so a corpus route can never overwrite a marketing
      // page that happens to share its path. Nothing in PUBLIC_METADATA is
      // under /docs today, and if that ever changes the marketing page is the
      // one someone deliberately registered.
      const docsRoutes = writeDocsPages(outputDirectory, shell, launch);

      writeFileSync(resolve(outputDirectory, 'robots.txt'), robotsTxt(launch));
      writeFileSync(resolve(outputDirectory, 'sitemap.xml'), sitemapXml(launch, docsRoutes));
      writeFileSync(resolve(outputDirectory, 'manifest.webmanifest'), webManifest());
    },
  };
}
