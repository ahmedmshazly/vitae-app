#!/usr/bin/env node
// Rasterizes the Weighted V mark SVGs into the PNG sizes the app and the
// brand-assets archive need. Run after editing any of the source SVGs in
// apps/web/public/, nothing else in the repo does SVG->PNG conversion.
//
// docs/design/brand-assets/ -> apps/web/public/ is a manual sync (brand-book.html
// ch.05): this script writes both sides from the same source so they can't drift.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'apps/web/public');
const ARCHIVE_LOGO_DIR = join(ROOT, 'docs/design/brand-assets/logo');
const ARCHIVE_APPICON_DIR = join(ROOT, 'docs/design/brand-assets/app-icon');

const BG = '#0F0F0F';
const INK = '#FAFAF8';
// Small-variant path (thin arm thickened to 3.1 units), legible at <32px.
const MARK_PATH_SMALL = 'M6.4 7.5 L20 31 L32 7.5 L28.9 7.5 L20 25.6 L12.4 7.5 Z';

/** Mark on a filled canvas, at whatever size/padding the target needs, used
 * for contexts (browser chrome, iOS home screen) where a transparent mark
 * would lose contrast against a light background. */
function markOnCanvas(canvasSize, markSize) {
  const inset = (canvasSize - markSize) / 2;
  const scale = markSize / 40;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasSize}" height="${canvasSize}" viewBox="0 0 ${canvasSize} ${canvasSize}"><rect width="${canvasSize}" height="${canvasSize}" fill="${BG}"/><g transform="translate(${inset},${inset}) scale(${scale})"><path d="${MARK_PATH_SMALL}" fill="${INK}"/></g></svg>`;
}

async function rasterize(svg, outPath, size) {
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
  console.log(`  wrote ${outPath} (${size}x${size})`);
}

async function rasterizeFile(svgPath, outPath, width, height) {
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(svgPath).resize(width, height).png().toFile(outPath);
  console.log(`  wrote ${outPath} (${width}x${height})`);
}

async function copyFile(src, dest) {
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, await readFile(src));
  console.log(`  copied ${dest}`);
}

async function main() {
  console.log('Favicons (apps/web/public/), mark on --ae-bg canvas, clear space scaled in:');
  // Full clear space (half cap height, ~30% of mark size) at 16px would leave
  // an illegible sliver, so the mark fills progressively more of the canvas
  // as it shrinks, the same reasoning the small-variant path itself follows.
  await rasterize(markOnCanvas(16, 12), join(PUBLIC_DIR, 'favicon-16.png'), 16);
  await rasterize(markOnCanvas(32, 22), join(PUBLIC_DIR, 'favicon-32.png'), 32);
  await rasterize(markOnCanvas(48, 34), join(PUBLIC_DIR, 'favicon-48.png'), 48);
  await rasterize(markOnCanvas(180, 108), join(PUBLIC_DIR, 'apple-touch-icon.png'), 180);

  console.log('Archive sync (docs/design/brand-assets/):');
  await copyFile(join(PUBLIC_DIR, 'favicon.svg'), join(ARCHIVE_APPICON_DIR, 'favicon.svg'));
  await rasterize(markOnCanvas(16, 12), join(ARCHIVE_APPICON_DIR, 'favicon-16.png'), 16);
  await rasterize(markOnCanvas(32, 22), join(ARCHIVE_APPICON_DIR, 'favicon-32.png'), 32);
  await rasterize(markOnCanvas(48, 34), join(ARCHIVE_APPICON_DIR, 'favicon-48.png'), 48);
  await rasterize(markOnCanvas(64, 46), join(ARCHIVE_APPICON_DIR, 'favicon-64.png'), 64);

  await copyFile(join(PUBLIC_DIR, 'vitae-mark.svg'), join(ARCHIVE_LOGO_DIR, 'vitae-mark.svg'));
  await copyFile(
    join(PUBLIC_DIR, 'vitae-logo-horizontal.svg'),
    join(ARCHIVE_LOGO_DIR, 'vitae-logo-horizontal.svg'),
  );
  await copyFile(
    join(PUBLIC_DIR, 'vitae-logo-stacked.svg'),
    join(ARCHIVE_LOGO_DIR, 'vitae-logo-stacked.svg'),
  );
  await rasterizeFile(
    join(PUBLIC_DIR, 'vitae-logo-horizontal.svg'),
    join(ARCHIVE_LOGO_DIR, 'vitae-logo-horizontal.png'),
    760,
    224,
  );
  await rasterizeFile(
    join(PUBLIC_DIR, 'vitae-logo-stacked.svg'),
    join(ARCHIVE_LOGO_DIR, 'vitae-logo-stacked.png'),
    640,
    504,
  );

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
