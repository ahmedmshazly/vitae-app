/**
 * The three ways every generator has to be runnable, in one place.
 *
 *   (default)  write the artifact and print a one-line summary
 *   --check    fail when the committed artifact differs from a fresh derivation
 *   --stdout   print without writing, so a caller can join against current
 *              evidence rather than against whatever was last committed
 *
 * The third mode is not a convenience. A gate that reads the committed artifact
 * judges an edit using the evidence that existed before the edit, which lets
 * exactly the change under review pass unexamined.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function emit(artifact, outPath, root, summarize) {
  const serialized = JSON.stringify(artifact, null, 2) + '\n';
  const abs = join(root, outPath);

  if (process.argv.includes('--stdout')) {
    process.stdout.write(serialized);
    return;
  }
  if (process.argv.includes('--check')) {
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    if (current !== serialized) {
      console.error(`${outPath} is stale. Run \`pnpm docs:gen\` and commit the result.`);
      process.exit(1);
    }
    console.log(`${outPath}: up to date`);
    return;
  }
  writeFileSync(abs, serialized);
  console.log(summarize(artifact));
}
