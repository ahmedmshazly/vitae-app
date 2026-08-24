import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

function routeHtmlPath(outputDirectory: string, routePath: string): string {
  if (routePath === '/') return resolve(outputDirectory, 'index.html');
  return resolve(outputDirectory, routePath.slice(1), 'index.html');
}

function withStaticBody(html: string, body: string): string {
  return html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
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

      // The documentation is deliberately absent from this build. It is served
      // by the API behind the owner allow-list, because prerendering it here
      // would publish the whole corpus as static files to anyone with the URL.
      writeFileSync(resolve(outputDirectory, 'robots.txt'), robotsTxt(launch));
      writeFileSync(resolve(outputDirectory, 'sitemap.xml'), sitemapXml(launch));
      writeFileSync(resolve(outputDirectory, 'manifest.webmanifest'), webManifest());
    },
  };
}
