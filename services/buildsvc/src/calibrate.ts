/**
 * Template warm + calibration (SRS FR-RES-009, R3). Compiles every shipped
 * template (templates/<key>/main.tex) with rich sample content spliced into its
 * «TOKENS», so the Tectonic package cache is warmed with the EXACT preamble,
 * macros, fonts, and glyphs each template can emit at runtime, the runtime
 * container has no network, so anything missed here becomes a compile failure
 * in production.
 *
 * Runs twice during the Docker image build:
 *   1. `node dist/calibrate.js` (network on) , fetches + caches everything;
 *   2. `node dist/calibrate.js --only-cached` under `RUN --network=none`.
 *      proves the cache is complete; the image build fails if it is not.
 * Writes warmed-manifest.json next to the cache for /healthz.
 *
 * Every template declares its own fixture in templates/<key>/calibration.json:
 * its kind, the sample content for its own «TOKEN» vocabulary, how many pages
 * that content is expected to fill, and whether the line model applies to it.
 * Until that file existed this script chose between two hardcoded token maps by
 * directory name (`cobalt` or not) and demanded exactly one page, so the first
 * non-résumé template added to templates/ failed the image build before it
 * could ever be used. Nothing here may infer a template's vocabulary from its
 * name again.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const TEMPLATES_DIR = process.env.TEMPLATES_DIR ?? join(process.cwd(), 'templates');
const MANIFEST_PATH = process.env.WARMED_MANIFEST_PATH ?? join(process.cwd(), 'warmed-manifest.json');
const ONLY_CACHED = process.argv.includes('--only-cached');

const KINDS = ['resume', 'letter', 'dossier'] as const;
type TemplateKind = (typeof KINDS)[number];

/** An exact page count, or an inclusive range for documents that legitimately run long. */
type PageExpectation = number | { min: number; max: number };

interface LineModelCheck {
  /** False for kinds whose length is content-driven, a letter has no line budget to drift from. */
  check: boolean;
  tolerance?: number;
  /** Token the capacity fixture fills with a list of measured lines. */
  body_token?: string;
  /** Tokens blanked while measuring, so only the list under test occupies the page. */
  blank_tokens?: string[];
  section_title?: string;
  /** `itemize` for the plain templates, `pts` for cobalt's tight list. */
  list_environment?: string;
}

interface Calibration {
  kind: TemplateKind;
  expected_pages: PageExpectation;
  line_model: LineModelCheck;
  tokens: Record<string, string>;
}

function calibrationPath(templateKey: string): string {
  return join(TEMPLATES_DIR, templateKey, 'calibration.json');
}

/**
 * Read and validate one template's fixture. A missing or malformed file is
 * fatal by design: skipping it would ship an uncalibrated template into a
 * runtime container with no network, where the first real compile fails with a
 * package fetch nobody can service.
 */
async function loadCalibration(templateKey: string): Promise<Calibration> {
  const path = calibrationPath(templateKey);
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch {
    throw new Error(
      `template ${templateKey}: no calibration.json. Add ${path} declaring {kind, expected_pages, line_model, tokens} for this template's own «TOKEN» vocabulary.`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`template ${templateKey}: ${path} is not valid JSON (${String(err)})`);
  }
  const config = parsed as Partial<Calibration>;
  if (!KINDS.includes(config.kind as TemplateKind)) {
    throw new Error(`template ${templateKey}: calibration.json kind must be one of ${KINDS.join(', ')}`);
  }
  if (!config.tokens || typeof config.tokens !== 'object') {
    throw new Error(`template ${templateKey}: calibration.json needs a tokens object`);
  }
  for (const [name, value] of Object.entries(config.tokens)) {
    if (typeof value !== 'string') {
      throw new Error(`template ${templateKey}: calibration.json token «${name}» must be a string`);
    }
  }
  const expected = config.expected_pages;
  if (typeof expected === 'number') {
    if (!Number.isInteger(expected) || expected < 1) {
      throw new Error(`template ${templateKey}: expected_pages must be a positive integer`);
    }
  } else if (expected && typeof expected === 'object') {
    const { min, max } = expected;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
      throw new Error(`template ${templateKey}: expected_pages range must be {min,max} with 1 <= min <= max`);
    }
  } else {
    throw new Error(`template ${templateKey}: calibration.json needs expected_pages (a count or {min,max})`);
  }
  const lineModel = config.line_model;
  if (!lineModel || typeof lineModel.check !== 'boolean') {
    throw new Error(`template ${templateKey}: calibration.json needs line_model.check (true or false)`);
  }
  return {
    kind: config.kind as TemplateKind,
    expected_pages: expected,
    line_model: lineModel,
    tokens: config.tokens as Record<string, string>,
  };
}

function pageExpectationSatisfied(expected: PageExpectation, pages: number): boolean {
  return typeof expected === 'number' ? pages === expected : pages >= expected.min && pages <= expected.max;
}

function describePageExpectation(expected: PageExpectation): string {
  return typeof expected === 'number' ? String(expected) : `${expected.min}-${expected.max}`;
}

function splice(templateKey: string, source: string, tokens: Record<string, string>): string {
  const out = source.replace(/«([A-Z_]+)»/g, (_, name: string) => {
    if (!(name in tokens)) {
      throw new Error(
        `template ${templateKey}: no sample content for token «${name}». Add it to ${calibrationPath(templateKey)}.`,
      );
    }
    return tokens[name]!;
  });
  const leftover = out.match(/«[^»]*»/);
  if (leftover) throw new Error(`template ${templateKey}: unresolved token ${leftover[0]}`);
  return out;
}

/**
 * Compile a fixture and count its pages. Returns null when pdfinfo produced no
 * page count at all: a zero would travel into the manifest as if the document
 * were empty, and "unknown" and "empty" are different facts.
 */
async function compileFixture(templateKey: string, tex: string): Promise<number | null> {
  const workdir = await mkdtemp(join(tmpdir(), 'vitae-cal-'));
  await writeFile(join(workdir, 'main.tex'), tex);
  const args = ['-X', 'compile', 'main.tex', '--untrusted', '--outdir', workdir];
  if (ONLY_CACHED) args.push('--only-cached');
  await run('tectonic', args, { cwd: workdir });
  const { stdout } = await run('pdfinfo', [join(workdir, 'main.pdf')]);
  const m = stdout.match(/Pages:\s+(\d+)/);
  const pages = m ? Number(m[1]) : null;
  console.log(`  ${templateKey}: ${pages ?? 'unknown'} page(s)${ONLY_CACHED ? ' [offline]' : ''}`);
  return pages;
}

/** Same as compileFixture, but for the callers whose next step cannot proceed on "unknown". */
async function compileFixturePages(templateKey: string, tex: string): Promise<number> {
  const pages = await compileFixture(templateKey, tex);
  if (pages === null) {
    throw new Error(`${templateKey}: pdfinfo reported no page count for the calibration fixture`);
  }
  return pages;
}

function capacityFixture(
  templateKey: string,
  source: string,
  config: Calibration,
  bullets: number,
): string {
  const list = Array.from({ length: bullets }, (_, index) => `  \\item Calibration line ${index + 1}.`).join('\n');
  const listEnvironment = config.line_model.list_environment ?? 'itemize';
  const title = config.line_model.section_title ?? 'Calibration';
  const bodyToken = config.line_model.body_token ?? 'SECTIONS';
  const sections = `\\section{${title}}\n\\begin{${listEnvironment}}\n${list}\n\\end{${listEnvironment}}`;
  let filled = source.replaceAll(`«${bodyToken}»`, sections);
  for (const token of config.line_model.blank_tokens ?? []) {
    filled = filled.replaceAll(`«${token}»`, '');
  }
  // splice() uses the rich fixture map for remaining header tokens.
  return splice(templateKey, filled, config.tokens);
}

async function verifyLineModel(
  templateKey: string,
  source: string,
  config: Calibration,
): Promise<{ configured: number; measured: number }> {
  const lineModelPath = join(TEMPLATES_DIR, templateKey, 'line-model.json');
  const parsed = JSON.parse(await readFile(lineModelPath, 'utf8')) as {
    line_model?: { lines_per_page?: number };
  };
  const configured = Number(parsed.line_model?.lines_per_page ?? 0);
  if (!Number.isFinite(configured) || configured <= 0) throw new Error(`${templateKey}: invalid lines_per_page`);
  let low = 1;
  let high = Math.ceil(configured * 2);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const pages = await compileFixturePages(templateKey, capacityFixture(templateKey, source, config, mid));
    if (pages <= 1) low = mid;
    else high = mid - 1;
  }
  // Strict gate: knapsack budgets trust lines_per_page. Allow only ±3 lines of
  // measurement noise (binary search / fixture variance) before failing the image.
  const tolerance = config.line_model.tolerance ?? 3;
  if (Math.abs(low - configured) > tolerance) {
    throw new Error(
      `${templateKey}: line model drift, configured ${configured} lines/page, rendered capacity ${low} (tolerance ±${tolerance})`,
    );
  }
  console.log(`  ${templateKey}: line model ${configured}, rendered capacity ${low} (±${tolerance})`);
  return { configured, measured: low };
}

const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
const keys = entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
if (keys.length === 0) {
  console.error(`No templates found in ${TEMPLATES_DIR}`);
  process.exit(1);
}

const warmed: string[] = [];
const lineCalibration: Record<string, { configured: number; measured: number }> = {};
const pageCalibration: Record<string, { kind: TemplateKind; expected: string; measured: number }> = {};
for (const key of keys) {
  let config: Calibration;
  try {
    config = await loadCalibration(key);
  } catch (err) {
    console.error(`Calibration FAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  const source = await readFile(join(TEMPLATES_DIR, key, 'main.tex'), 'utf8');
  const version = source.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0';
  const pages = await compileFixture(key, splice(key, source, config.tokens));
  if (pages === null) {
    console.error(`Calibration FAILED: ${key} fixture compiled but pdfinfo reported no page count.`);
    process.exit(1);
  }
  if (!pageExpectationSatisfied(config.expected_pages, pages)) {
    console.error(
      `Calibration FAILED: ${key} fixture compiled to ${pages} pages (expected ${describePageExpectation(config.expected_pages)}).`,
    );
    process.exit(1);
  }
  if (config.line_model.check) {
    lineCalibration[key] = await verifyLineModel(key, source, config);
  }
  pageCalibration[key] = {
    kind: config.kind,
    expected: describePageExpectation(config.expected_pages),
    measured: pages,
  };
  warmed.push(`${key}@${version}`);
}

await writeFile(MANIFEST_PATH, JSON.stringify({
  templates_warmed: warmed,
  line_calibration: lineCalibration,
  page_calibration: pageCalibration,
  generated_at: new Date().toISOString(),
}, null, 2));
// "one page each" is only true while every template says so, and it stops being
// true the moment a letter or dossier template ships.
const everyTemplateIsOnePage = keys.every((key) => pageCalibration[key]!.expected === '1');
console.log(
  `Calibration OK: ${warmed.join(', ')}${everyTemplateIsOnePage ? ', one page each' : ''}${ONLY_CACHED ? ', fully offline' : ''}.`,
);
console.log(`Manifest written to ${MANIFEST_PATH}`);
