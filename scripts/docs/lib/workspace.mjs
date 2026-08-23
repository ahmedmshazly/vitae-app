/**
 * The workspace as a set of packages and files, read from the same manifests
 * pnpm reads.
 *
 * Several generators need the same three things — which packages exist, which
 * files are first-party source, and who imports what — and each one deriving
 * them separately is how two catalogs end up disagreeing about how many
 * packages this repository has. The globs come from pnpm-workspace.yaml rather
 * than a hard-coded list, so adding a package to the workspace adds it here.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, ts, importsOf } from './ts-index.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const SOURCE_EXT = new Set(['.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.turbo', 'build']);

/** Every workspace package, in the order pnpm's globs produce them. */
export function packages() {
  const yaml = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8');
  // The file is a flat list of quoted globs. A YAML parser would be a new
  // dependency for six lines whose shape is fixed by pnpm's own schema.
  const globs = [...yaml.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map((m) => m[1].trim());
  const out = [];
  for (const glob of globs) {
    const [prefix, star] = glob.split('/');
    const dirs = star === '*'
      ? readdirSync(join(root, prefix)).map((name) => join(prefix, name))
      : [glob];
    for (const dir of dirs) {
      const manifest = join(root, dir, 'package.json');
      if (!existsSync(manifest)) continue;
      out.push({ dir, manifest: relative(root, manifest), json: JSON.parse(readFileSync(manifest, 'utf8')) });
    }
  }
  return out;
}

/** Recursively list source files under a directory, repo-relative. */
export function sourceFiles(dir, { tests = true } = {}) {
  const out = [];
  const abs = join(root, dir);
  if (!existsSync(abs)) return out;
  const walkDir = (current) => {
    for (const name of readdirSync(current)) {
      if (SKIP_DIRS.has(name)) continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walkDir(full);
        continue;
      }
      const dot = name.lastIndexOf('.');
      if (dot === -1 || !SOURCE_EXT.has(name.slice(dot))) continue;
      const rel = relative(root, full);
      if (!tests && isTest(rel)) continue;
      out.push(rel);
    }
  };
  walkDir(abs);
  return out.sort();
}

/** A test file, by this repository's two conventions. */
export function isTest(rel) {
  return /\.(test|spec)\.tsx?$/.test(rel) || rel.startsWith('e2e/');
}

/**
 * Which first-party file imports which symbol from where.
 *
 * Returned as both directions because the questions differ: a page about a
 * module asks "who uses this", and a page about a file asks "what does this
 * pull in". Building one from the other at read time is cheap; building it
 * twice from source is not.
 */
export function importGraph(dirs) {
  const byFile = new Map();
  const bySpecifier = new Map();
  for (const dir of dirs) {
    for (const rel of sourceFiles(dir)) {
      let sf;
      try { sf = parse(join(root, rel)); } catch { continue; }
      const imports = importsOf(sf);
      byFile.set(rel, imports);
      for (const imp of imports) {
        if (!bySpecifier.has(imp.module)) bySpecifier.set(imp.module, []);
        bySpecifier.get(imp.module).push({ file: rel, ...imp });
      }
    }
  }
  return { byFile, bySpecifier };
}

export { ts };
