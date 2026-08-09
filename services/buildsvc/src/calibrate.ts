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

// ── Sample content ────────────────────────────────────────────────────────────
// Everything the renderers can emit must appear here at least once: regular /
// bold / italic in serif AND sans at every size used (\Huge, \LARGE, \large,
// \small, body), \href, and every glyph macro latex-escape.ts can produce
// (\textbullet, \textbar, \textendash, \textemdash, \textperiodcentered).

const NAME = 'Jordan Kim';
const HEADLINE = String.raw`Machine Learning Engineer \textendash{} Data Systems`;
const CONTACT_LINE = String.raw`Kigali, Rwanda \textbullet{} \href{https://github.com/example}{github.com/example} \textbullet{} \href{mailto:a@example.com}{a@example.com} \textbullet{} +250\,780\,000\,000`;
const SUMMARY_TEXT = String.raw`Engineer \textemdash{} builds {\bfseries reliable} systems \textperiodcentered{} ships {\itshape measurable} results\textbar{}fast. {\bfseries\itshape Bold italic serif} and {\sffamily sans regular, {\bfseries sans bold}, {\itshape sans italic}} all warm here. Ligatures: efficient offices affix fluffy waffles.`;

// Cobalt macro vocabulary (\cventry / \skillrow / pts / \dotsep).
const COBALT_TOKENS: Record<string, string> = {
  ACCENT_HEX: '2563EB',
  NAME,
  HEADLINE,
  TAGLINE_BLOCK: String.raw`{\small Kigali \dotsep{} Cairo \dotsep{} Pittsburgh}\\[5pt]
  `,
  CONTACT_LINE: String.raw`Kigali, Rwanda \dotsep{} \href{https://github.com/example}{github.com/example} \dotsep{} \href{https://linkedin.com/in/example}{linkedin.com/in/example} \dotsep{} +250\,780\,000\,000`,
  SUMMARY_BLOCK: `\\section{Summary}\n${SUMMARY_TEXT}\n`,
  SECTIONS: String.raw`\section{Technical Skills}
\skillrow{Programming}{Python, TypeScript, SQL, C++ \textendash{} production use}
\skillrow{Platforms}{Kubernetes \textperiodcentered{} AWS \textperiodcentered{} GCP}
\section{Experience}
\cventry{Senior ML Engineer}{Nile Robotics\,\textbar\,Kigali}{Jan 2022 -- Present}
\begin{pts}
  \item Cut inference latency 38\% across 12 services \textemdash{} p99 under 80\,ms.
  \item Built a {\bfseries reinforcement-learning} pipeline processing {\itshape 4\,TB/day}.
\end{pts}
\vspace{2pt}
\cventry{Data Engineering Intern}{NiaDelta}{Jun 2020 -- Aug 2020}
\begin{pts}
  \item Automated ingestion for 30+ sources; see \href{https://example.com/report}{the write-up}.
\end{pts}
\section{Education}
\cventry{MSc Computer Science (CGPA 3.9 / 4.0)}{Carnegie Mellon University\,\textbar\,Pittsburgh}{2024 -- 2026}
\begin{pts}
  \item Relevant coursework: Distributed Systems, Convex Optimization.
\end{pts}
\section{Awards}
\noindent{\small Best Poster \textemdash{} IEEE AFRICON \textemdash{} 2023}\par\vspace{1.5pt}
\noindent{\small Dean's List \textemdash{} 2022}\par\vspace{1.5pt}`,
};

// Generic macro vocabulary (onyx / argon: plain \section + itemize).
const GENERIC_TOKENS: Record<string, string> = {
  ACCENT_HEX: '2563EB',
  NAME,
  HEADLINE,
  TAGLINE_BLOCK: '',
  CONTACT_LINE,
  SUMMARY_BLOCK: `${SUMMARY_TEXT}\\par\\vspace{4pt}`,
  SECTIONS: String.raw`\section{Skills}
{\bfseries Programming:} Python, TypeScript, SQL \textendash{} production use\\
{\bfseries Platforms:} Kubernetes \textperiodcentered{} AWS\\
\section{Experience}
{\bfseries Senior ML Engineer}, Nile Robotics \hfill Jan 2022 -- Present\\
\begin{itemize}
  \item Cut inference latency 38\% \textemdash{} p99 under 80\,ms; see \href{https://example.com}{notes}.
  \item Built a {\bfseries reinforcement-learning} pipeline processing {\itshape 4\,TB/day}.
\end{itemize}
\section{Education}
{\bfseries MSc Computer Science}, Carnegie Mellon University \hfill 2024 -- 2026\\
\begin{itemize}
  \item Relevant coursework: Distributed Systems, Convex Optimization.
\end{itemize}
\section{Awards}
\begin{itemize}
  \item Best Poster \textemdash{} IEEE AFRICON \textemdash{} 2023
\end{itemize}`,
};

function splice(templateKey: string, source: string): string {
  const tokens = templateKey === 'cobalt' ? COBALT_TOKENS : GENERIC_TOKENS;
  const out = source.replace(/«([A-Z_]+)»/g, (_, name: string) => {
    if (!(name in tokens)) throw new Error(`template ${templateKey}: no sample content for token «${name}»`);
    return tokens[name]!;
  });
  const leftover = out.match(/«[^»]*»/);
  if (leftover) throw new Error(`template ${templateKey}: unresolved token ${leftover[0]}`);
  return out;
}

async function compileFixture(templateKey: string, tex: string): Promise<number> {
  const workdir = await mkdtemp(join(tmpdir(), 'vitae-cal-'));
  await writeFile(join(workdir, 'main.tex'), tex);
  const args = ['-X', 'compile', 'main.tex', '--untrusted', '--outdir', workdir];
  if (ONLY_CACHED) args.push('--only-cached');
  await run('tectonic', args, { cwd: workdir });
  const { stdout } = await run('pdfinfo', [join(workdir, 'main.pdf')]);
  const m = stdout.match(/Pages:\s+(\d+)/);
  const pages = m ? Number(m[1]) : 0;
  console.log(`  ${templateKey}: ${pages} page(s)${ONLY_CACHED ? ' [offline]' : ''}`);
  return pages;
}

function capacityFixture(templateKey: string, source: string, bullets: number): string {
  const list = Array.from({ length: bullets }, (_, index) => `  \\item Calibration line ${index + 1}.`).join('\n');
  const sections = templateKey === 'cobalt'
    ? `\\section{Calibration}\n\\begin{pts}\n${list}\n\\end{pts}`
    : `\\section{Calibration}\n\\begin{itemize}\n${list}\n\\end{itemize}`;
  // splice() uses the rich fixture map for remaining header tokens.
  return splice(templateKey, source.replace(/«SECTIONS»/g, sections).replace(/«SUMMARY_BLOCK»/g, ''));
}

async function verifyLineModel(templateKey: string, source: string): Promise<{ configured: number; measured: number }> {
  const config = JSON.parse(await readFile(join(TEMPLATES_DIR, templateKey, 'line-model.json'), 'utf8')) as {
    line_model?: { lines_per_page?: number };
  };
  const configured = Number(config.line_model?.lines_per_page ?? 0);
  if (!Number.isFinite(configured) || configured <= 0) throw new Error(`${templateKey}: invalid lines_per_page`);
  let low = 1;
  let high = Math.ceil(configured * 2);
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const pages = await compileFixture(templateKey, capacityFixture(templateKey, source, mid));
    if (pages <= 1) low = mid;
    else high = mid - 1;
  }
  // Strict gate: knapsack budgets trust lines_per_page. Allow only ±3 lines of
  // measurement noise (binary search / fixture variance) before failing the image.
  const tolerance = 3;
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
for (const key of keys) {
  const source = await readFile(join(TEMPLATES_DIR, key, 'main.tex'), 'utf8');
  const version = source.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? '0.0.0';
  const pages = await compileFixture(key, splice(key, source));
  if (pages !== 1) {
    console.error(`Calibration FAILED: ${key} fixture compiled to ${pages} pages (expected 1).`);
    process.exit(1);
  }
  lineCalibration[key] = await verifyLineModel(key, source);
  warmed.push(`${key}@${version}`);
}

await writeFile(MANIFEST_PATH, JSON.stringify({
  templates_warmed: warmed,
  line_calibration: lineCalibration,
  generated_at: new Date().toISOString(),
}, null, 2));
console.log(`Calibration OK: ${warmed.join(', ')}, one page each${ONLY_CACHED ? ', fully offline' : ''}.`);
console.log(`Manifest written to ${MANIFEST_PATH}`);
