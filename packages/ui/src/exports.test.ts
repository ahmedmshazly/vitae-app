/**
 * The package's `exports` map, checked against the files it points at.
 *
 * `@vitae/ui` ships TypeScript and CSS straight from `src`, so a stylesheet is
 * reachable only if `package.json` names it. A missing entry fails at the
 * consumer's bundler with "Package subpath ./styles/x.css is not defined",
 * which is a build error in `apps/web` for a change made in `packages/ui` —
 * the kind of break that is cheapest to catch on this side of the boundary.
 *
 * The reverse direction is deliberately not asserted here. `src/styles`
 * currently holds the combobox sheet, which is imported by the application
 * alongside the rest of the shared primitives.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import manifest from '../package.json' with { type: 'json' };

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const exportMap = manifest.exports as Record<string, string>;

describe('@vitae/ui exports', () => {
  it('exports the motion stylesheet, which the app imports by subpath', () => {
    expect(exportMap['./styles/motion.css']).toBe('./src/styles/motion.css');
  });

  it('still exports every sheet it exported before motion.css was added', () => {
    for (const subpath of [
      '.',
      './styles/tokens.css',
      './styles/base.css',
      './styles/components.css',
      './styles/layout.css',
      './styles/toast.css',
      './styles/combobox.css',
    ]) {
      expect(exportMap, `${subpath} is no longer exported`).toHaveProperty(subpath);
    }
  });

  it('points every subpath at a file that exists', () => {
    const broken = Object.entries(exportMap).filter(
      ([, target]) => !existsSync(join(PACKAGE_ROOT, target)),
    );
    expect(broken).toEqual([]);
  });

  /* Narrower than "every sheet is exported" on purpose: see the module header.
     This pins the sheets the app's import chain in apps/web/src/main.tsx
     actually walks, so dropping one from the export map fails here rather than
     in a web build. */
  it('exports every sheet the app imports', () => {
    const targets = new Set(Object.values(exportMap));
    const imported = [
      'tokens.css',
      'base.css',
      'motion.css',
      'components.css',
      'layout.css',
      'toast.css',
      'combobox.css',
    ];
    const missing = imported.filter((name) => !targets.has(`./src/styles/${name}`));
    expect(missing).toEqual([]);

    // And each of those is a real file, not just a well-spelled promise.
    const absent = imported.filter((name) => !existsSync(join(PACKAGE_ROOT, 'src/styles', name)));
    expect(absent).toEqual([]);
  });

  it('names the fonts base.css declares, so no @font-face points at nothing', () => {
    const base = readFileSync(join(PACKAGE_ROOT, 'src/styles/base.css'), 'utf8');
    const referenced = [...base.matchAll(/url\('\.\/fonts\/([^']+)'\)/g)].map((m) => m[1]!);
    expect(referenced.length).toBeGreaterThan(0);

    const present = new Set(readdirSync(join(PACKAGE_ROOT, 'src/styles/fonts')));
    expect(referenced.filter((file) => !present.has(file))).toEqual([]);
  });

  it('ships four distinct Space Grotesk weights, not one file under four names', () => {
    const dir = join(PACKAGE_ROOT, 'src/styles/fonts');
    const hashes = ['400', '500', '600', '700'].map((weight) =>
      createHash('sha256')
        .update(readFileSync(join(dir, `SpaceGrotesk-${weight}.woff2`)))
        .digest('hex'),
    );
    expect(new Set(hashes).size).toBe(4);
  });
});
