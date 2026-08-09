/**
 * Clean up artefacts left by the LinkedIn/Aperture profile import.
 *
 *   pnpm --filter @vitae/api tidy:import              # dry run (default)
 *   pnpm --filter @vitae/api tidy:import --apply      # write
 *   pnpm --filter @vitae/api tidy:import --undo --apply
 *
 * The import brought in real records but also scrape artefacts that no
 * validation could reject, because each one is individually well-formed:
 *
 *   - posts are titled with scraped page chrome, the reaction bar on most, an
 *     author profile block or share menu on the rest, and props.text holds the
 *     same blob, so there is no body to recover a headline from;
 *   - "People also viewed" suggestions arrived as RELATES_TO
 *     {label:"similar profile"} edges, asserting relationships that do not
 *     exist and pointing at profiles that have since been deleted;
 *   - the people behind those suggestions arrived as bare names, no contact
 *     detail, no records, and once the suggestion edges go, no relationships;
 *   - recommendation blocks arrived as person *titles*, carrying the
 *     recommender's headline and the recommendation sentence;
 *   - skills arrived with no category, and dated edges with no is_current.
 *
 * This command is dry-run by default and records every change.
 * journalled per run under meta/<JOURNAL_DOC>/runs/{runId} with the pre-image,
 * undo replays pre-images forward so rev only increases, and a record edited
 * after the run is reported as a conflict rather than overwritten.
 *
 * Ownership note: 219 of these records belong to scraped third-party profiles,
 * not the graph owner. This never changes who owns what. The one removal it
 * makes is the inert suggestion people (`--only=orphans`), and that is a soft
 * delete, recoverable from Trash, and in the journal.
 */
import '../env.js';
import { repository } from '../db/repository.js';
import { getSelf } from '../services/self.js';
import { searchIndex } from '../db/search-index.js';
import { invalidateDuplicateScan } from '../services/duplicates.js';

const ACTOR = 'tidy-import';
const JOURNAL_DOC = 'tidy_import_journal';
const POST_TITLE_MAX = 80;

const apply = process.argv.includes('--apply');
const undo = process.argv.includes('--undo');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

/** The scraped LinkedIn reaction bar, used verbatim as a post title. */
const REACTION_BAR = /^(Like\s+)+Celebrate\s+Support\s+Love\s+Insightful\s+Funny\s+Comment\s+Share$/;

/** Trailing recommendation block: "… June 25, 2024, Allan managed Leila directly". */
const RECOMMENDATION_TAIL =
  /\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4},\s+.+$/;

const NAME_SUFFIX = /^(Ph\.?D\.?|PhD|MBA|MSc|MD|BSc|Jr\.?|Sr\.?|II|III)[,.]?$/i;

/**
 * Capitalised words that start a LinkedIn headline rather than continue a name.
 * Needed because a name can be three or four words ("Mohamed Yaser El-fardy"),
 * so "stop after two capitalised tokens" truncates real surnames, but
 * "Tom Parry Higher Education Partnerships" would otherwise swallow the
 * headline. Only a strongly-signalled boundary is trusted; anything else is
 * left unparsed rather than guessed at.
 */
const HEADLINE_STARTER = new Set([
  'Higher', 'Product', 'Functional', 'Development', 'Narrative', 'Senior', 'Lead', 'Head',
  'Director', 'Manager', 'Coach', 'Partnerships', 'Data', 'Strategist', 'Founder', 'Ag',
  'Global', 'Chief', 'Principal', 'Program', 'Programme', 'Project', 'Research', 'Software',
  'Engineering', 'Engineer', 'Consultant', 'Advisor', 'Specialist', 'Analyst', 'Entrepreneur',
  'Investor', 'Building', 'Helping', 'Ex-Google', 'Board', 'Education', 'Business', 'Digital',
]);

/**
 * Categories for the skills the import left uncategorised. Curated by hand:
 * a heuristic on the name would mislabel too many ("Analysis" is a method,
 * "Analytics" a method, "Analytical Skills" a soft skill). Anything genuinely
 * ambiguous is deliberately absent so it stays unset rather than wrong.
 */
const SKILL_CATEGORY: Record<string, string> = {
  // soft
  Management: 'soft', Communication: 'soft', Teamwork: 'soft', 'Problem Solving': 'soft',
  'Critical Thinking': 'soft', 'Strategic Thinking': 'soft', 'Creativity Skills': 'soft',
  Persuasion: 'soft', Debate: 'soft', 'Team Leadership': 'soft', Coaching: 'soft',
  'Relationship Building': 'soft', 'Oral Communication': 'soft', 'Persuasive Presentations': 'soft',
  Writing: 'soft', Salesmanship: 'soft', 'Analytical Skills': 'soft', Interviewing: 'soft',
  'Staff Development': 'soft', 'Career Development': 'soft', 'Team Management': 'soft',
  // tool
  'Microsoft Excel': 'tool', 'Microsoft PowerPoint': 'tool', PowerPoint: 'tool',
  'Microsoft Office': 'tool', MetaBase: 'tool', Stata: 'tool', 'Microsoft SQL Server': 'tool',
  WordPress: 'tool', 'Node-RED': 'tool', n8n: 'tool', Jupyter: 'tool', 'Microsoft Power BI': 'tool',
  Jira: 'tool', DAX: 'tool', 'Python pandas': 'tool', 'Looker - Google studio': 'tool',
  'Salesforce.com': 'tool', 'Active Directory': 'tool', 'Microsoft Exchange': 'tool',
  'Microsoft Entra ID': 'tool', 'Visual Basic for Applications (VBA)': 'tool',
  'JumpCloud Management': 'tool', 'Google Workspace Administration': 'tool',
  'Office 365 Administration': 'tool', 'Salesforce Administration': 'tool',
  'Mobile Device Management': 'tool', 'System Administration': 'tool',
  // method
  'Project Management': 'method', 'Strategic Planning': 'method', Research: 'method',
  Analysis: 'method', 'Event Management': 'method', 'Data Analysis': 'method',
  'Design Thinking': 'method', 'User-centered Design': 'method', 'Survey Research': 'method',
  'Research Writing': 'method', 'Proposal Writing': 'method', 'Academic Research': 'method',
  'Market Research': 'method', 'Industry Research': 'method', 'Economic Research': 'method',
  'Research Skills': 'method', 'Project Coordination': 'method', Statistics: 'method',
  Analytics: 'method', 'Data Visualization': 'method', 'Big Data Analytics': 'method',
  'Capacity Building': 'method', 'Library Management': 'method',
  'Library of Congress Classification': 'method', 'Circulation Management': 'method',
  'Inventory Management': 'method', 'Logistics Management': 'method', 'Sales Operations': 'method',
  'Sales Management': 'method', 'Outbound Sales': 'method', 'Sales Development': 'method',
  'Customer Acquisition': 'method', 'Account Management': 'method', 'Client Relations': 'method',
  'Customer Service': 'method', 'Technical Support': 'method', 'Help Desk Support': 'method',
  'Partner Development': 'method', 'Corporate Partnership Development': 'method',
  'Strategic Partner Relationship Management': 'method', 'Internal Communications': 'method',
  'Content Strategy': 'method', 'Digital Marketing': 'method', Marketing: 'method',
  'Marketing Strategy': 'method', 'Social Media': 'method',
  // domain
  Economics: 'domain', 'International Economics': 'domain', 'Behavioral Science': 'domain',
  Cybersecurity: 'domain', 'Internet of Things (IoT)': 'domain', 'Data Structures': 'domain',
  'Financial Analysis': 'domain', 'Investment Management': 'domain', Investments: 'domain',
  'Venture Capital': 'domain', 'Business Strategy': 'domain', Strategy: 'domain',
  'Innovation Management': 'domain', 'Product Development': 'domain',
  'Product Innovation': 'domain', 'Start-up Ventures': 'domain',
  'Software as a Service (SaaS)': 'domain', 'Identity and Access Management (IAM)': 'domain',
  // platform
  Arduino: 'platform', 'Complex Programmable Logic Device (CPLD)': 'platform',
  'Audio Visual (AV) Systems': 'platform', 'WMS Implementations': 'platform',
};

interface PatchEntry {
  kind: 'node_patch' | 'edge_patch';
  id: string;
  label: string;
  before: Record<string, unknown>;
  absent?: string[];
  rev_after: number;
}
interface CreatedEntry {
  kind: 'edge_created';
  id: string;
  label: string;
}
type JournalEntry = PatchEntry | CreatedEntry;

const journal: JournalEntry[] = [];
const enabled = (op: string): boolean => !only || only === op;

function absentKeys(before: Record<string, unknown>): string[] {
  return Object.keys(before).filter((k) => before[k] === undefined);
}
function undoPatch(e: { before: Record<string, unknown>; absent?: string[] }): Record<string, unknown> {
  const p: Record<string, unknown> = { ...e.before };
  for (const k of e.absent ?? []) p[k] = undefined;
  return p;
}

/** First sentence-ish slice of a post body, cut on a word boundary. */
function titleFromText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= POST_TITLE_MAX) return flat;
  const cut = flat.slice(0, POST_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Split "Allan Villegas, Ph.D. CEO @LiaPay | … June 25, 2024, Allan managed …"
 * into the person's name and the headline that was appended to it. Returns null
 * when the split is not confident, so a title we cannot parse is left alone.
 */
function splitPersonTitle(title: string): { name: string; headline: string } | null {
  const withoutTail = title.replace(RECOMMENDATION_TAIL, '').trim();
  const tokens = withoutTail.split(/\s+/);
  const name: string[] = [];
  let i = 0;
  let boundaryWasSignalled = false;
  for (; i < tokens.length && name.length < 4; i += 1) {
    const t = tokens[i]!;
    if (NAME_SUFFIX.test(t)) {
      name.push(t);
      continue;
    }
    const strongBoundary =
      t.includes('@') ||
      /^[A-Z]{2,}$/.test(t) ||        // CEO, CTO
      !/^[A-ZÀ-Þ]/.test(t) ||         // lowercase word, or "--"
      t.startsWith('|') ||
      HEADLINE_STARTER.has(t.replace(/[|,].*$/, ''));
    if (strongBoundary) {
      boundaryWasSignalled = true;
      break;
    }
    name.push(t);
  }
  const nm = name.join(' ').replace(/[,\s]+$/, '').trim();
  const headline = tokens
    .slice(i)
    .join(' ')
    .replace(/^[-\s|]+/, '')
    .replace(/[-\s|]+$/, '')
    .trim();
  // Two conditions, both required: a plausible multi-word name, and a boundary
  // we actually recognised. Without the second, a four-word name would be
  // silently cut at four tokens with the rest treated as a headline.
  if (nm.split(/\s+/).length < 2 || !boundaryWasSignalled) return null;
  return { name: nm, headline };
}

async function runUndo(): Promise<void> {
  // Was `meta/<JOURNAL_DOC>/runs/{runId}`; meta_runs flattens that, with
  // meta_id naming the journal the run belongs to.
  const runs = (
    await repository.docQuery<{ id: string; at: string; entries: JournalEntry[] }>('meta_runs', {
      meta_id: JOURNAL_DOC,
    })
  ).sort((a, b) => (a.at < b.at ? 1 : -1));
  if (runs.length === 0) {
    console.error(`No journal runs for ${JOURNAL_DOC}, nothing to undo.`);
    process.exitCode = 1;
    return;
  }
  const entries = runs.flatMap((r) => r.entries ?? []);
  const patches = entries.filter((e): e is PatchEntry => e.kind.endsWith('_patch'));
  const creates = entries.filter((e): e is CreatedEntry => e.kind === 'edge_created');
  console.log(`${runs.length} run(s), ${entries.length} entr(ies): ${patches.length} patch(es), ${creates.length} created`);

  let conflicts = 0;
  for (const p of patches) {
    const live =
      p.kind === 'node_patch'
        ? await repository.getNode(p.id, { includeDeleted: true })
        : await repository.getEdge(p.id, { includeDeleted: true });
    if (!live || live.rev !== p.rev_after) conflicts += 1;
  }
  if (conflicts) console.log(`  ${conflicts} record(s) edited since the run, those will be skipped`);
  if (!apply) {
    console.log('\ndry run, pass --undo --apply to roll back');
    return;
  }
  let rolled = 0;
  for (const p of patches) {
    const live =
      p.kind === 'node_patch'
        ? await repository.getNode(p.id, { includeDeleted: true })
        : await repository.getEdge(p.id, { includeDeleted: true });
    if (!live || live.rev !== p.rev_after) continue;
    if (p.kind === 'node_patch') await repository.updateNode(p.id, undoPatch(p), { actor: ACTOR });
    else await repository.updateEdge(p.id, undoPatch(p), { actor: ACTOR });
    rolled += 1;
  }
  let removed = 0;
  for (const c of creates) {
    if (await repository.getEdge(c.id)) {
      await repository.softDeleteEdge(c.id, { actor: ACTOR });
      removed += 1;
    }
  }
  for (const r of runs) {
    await repository.docDelete('meta_runs', r.id);
  }
  searchIndex.markDirty();
  await invalidateDuplicateScan();
  console.log(`\nrolled back ${rolled} patch(es), soft-deleted ${removed} edge(s), cleared ${runs.length} run(s)`);
}

async function main(): Promise<void> {
  if (undo) return runUndo();

  const nodes = await repository.allLiveNodes();
  const edges = await repository.allLiveEdges();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const self = await getSelf();
  const P = (n: { props?: unknown }): Record<string, unknown> => (n.props ?? {}) as Record<string, unknown>;
  const today = new Date().toISOString().slice(0, 10);

  console.log(`live: ${nodes.length} nodes, ${edges.length} edges`);
  console.log(`self: ${self ? `"${self.title}"` : 'NONE'}\n`);

  const patchNode = async (id: string, label: string, patch: Record<string, unknown>, before: Record<string, unknown>) => {
    if (!apply) return;
    const after = await repository.updateNode(id, patch, { actor: ACTOR });
    journal.push({ kind: 'node_patch', id, label, before, absent: absentKeys(before), rev_after: after.rev });
  };
  const patchEdge = async (id: string, label: string, patch: Record<string, unknown>, before: Record<string, unknown>) => {
    if (!apply) return;
    const after = await repository.updateEdge(id, patch, { actor: ACTOR });
    journal.push({ kind: 'edge_patch', id, label, before, absent: absentKeys(before), rev_after: after.rev });
  };

  // ── 1. retire "People also viewed" edges ──────────────────────────────────
  if (enabled('similar')) {
    const sim = edges.filter((e) => e.type === 'RELATES_TO' && (P(e).label as string) === 'similar profile');
    const dangling = sim.filter((e) => !byId.has(e.src) || !byId.has(e.dst)).length;
    console.log(`── similar-profile edges: ${sim.length} to retire (${dangling} of them dangling)`);
    for (const e of sim) {
      const from = byId.get(e.src)?.title ?? e.src;
      const to = byId.get(e.dst)?.title ?? `${e.dst} (deleted)`;
      console.log(`   -EDGE ${from.slice(0, 32)} -> ${to.slice(0, 40)}`);
      await patchEdge(e.id, 'similar profile', { deleted_at: new Date().toISOString() }, { deleted_at: e.deleted_at ?? null });
    }
  }

  // ── 2. retitle posts ──────────────────────────────────────────────────────
  // The scrape captured page chrome, not the post body, the reaction widget on
  // most rows, an author profile block or a share menu on the rest. In every
  // case props.text holds the same blob as the title, so there is nothing to
  // derive a headline from. The LinkedIn id in props.url is the only real datum.
  if (enabled('posts')) {
    const norm = (v: string): string => v.replace(/\s+/g, ' ').trim().toLowerCase();
    const posts = nodes.filter((n) => {
      if (n.type !== 'post') return false;
      const text = typeof P(n).text === 'string' ? (P(n).text as string) : '';
      // Chrome, not content: the reaction bar verbatim, or a title that is just
      // the text repeated back. Anything else is left alone.
      return REACTION_BAR.test(n.title.trim()) || (text.length > 0 && norm(text).startsWith(norm(n.title).slice(0, 60)));
    });
    console.log(`\n── posts whose title is scraped chrome: ${posts.length}`);
    let fromText = 0;
    let fromUrl = 0;
    let skipped = 0;
    for (const n of posts) {
      const props = P(n);
      const text = typeof props.text === 'string' ? props.text.trim() : '';
      const url = typeof props.url === 'string' ? props.url : '';
      const isChrome = REACTION_BAR.test(text) || norm(text).startsWith(norm(n.title).slice(0, 60));
      const hasRealText = text.length > 40 && !isChrome;

      let title: string;
      const patch: Record<string, unknown> = {};
      const before: Record<string, unknown> = { title: n.title };

      if (hasRealText) {
        title = titleFromText(text);
        fromText += 1;
      } else {
        const activity = url.match(/(?:activity|ugcPost):(\d+)/)?.[1];
        // Pulse articles carry a slug instead of a numeric id. It is real, so
        // keep it, but label it as an identifier rather than dress it up as a
        // headline the scrape never captured.
        const slug = url.match(/\/pulse\/([^/?#]+)/)?.[1];
        if (activity) {
          title = `LinkedIn post ${activity}`;
        } else if (slug) {
          title = `LinkedIn article: ${slug.slice(0, 70)}`;
        } else {
          skipped += 1;
          console.log(`   !SKIP no usable text and no LinkedIn id: ${n.id}`);
          continue;
        }
        fromUrl += 1;
        // Only drop text that is provably chrome, never real content.
        if (text && isChrome) {
          const { text: _drop, ...rest } = props;
          patch.props = rest;
          before.props = props;
        }
      }
      patch.title = title;
      console.log(`   ~NODE "${title.slice(0, 76)}"${patch.props ? '  (dropped chrome text)' : ''}`);
      await patchNode(n.id, `post ${n.id}`, patch, before);
    }
    console.log(`   ${fromText} titled from real text, ${fromUrl} from the LinkedIn id, ${skipped} skipped`);
  }

  // ── 2b. retire "People also viewed" leftovers ─────────────────────────────
  // Names scraped from a suggestions rail: no relationship, no records, and
  // (for most) not a single prop. Once the similar-profile edges went, they
  // became provably inert rows in the people directory.
  if (enabled('orphans')) {
    const touched = new Set<string>();
    for (const e of edges) {
      touched.add(e.src);
      touched.add(e.dst);
    }
    const carriesSomething = (n: (typeof nodes)[number]): boolean => {
      const pr = P(n);
      const socials = (pr.socials as Record<string, unknown>) ?? {};
      return (
        ((pr.emails as unknown[]) ?? []).length > 0 ||
        ((pr.phones as unknown[]) ?? []).length > 0 ||
        Object.keys(socials).length > 0 ||
        Boolean(n.notes_md)
      );
    };
    const inert = nodes.filter(
      (n) =>
        n.type === 'person' &&
        !touched.has(n.id) &&
        (n.props as { is_self?: boolean; is_placeholder?: boolean }).is_self !== true &&
        (n.props as { is_placeholder?: boolean }).is_placeholder !== true &&
        !carriesSomething(n),
    );
    console.log(`\n── edge-less people carrying no contact detail: ${inert.length}`);
    for (const n of inert) {
      console.log(`   -NODE ${n.title.slice(0, 46)}`);
      if (!apply) continue;
      const after = await repository.softDeleteNode(n.id, { actor: ACTOR });
      journal.push({
        kind: 'node_patch',
        id: n.id,
        label: `orphan person ${n.title}`,
        before: { deleted_at: n.deleted_at ?? null },
        rev_after: after.rev,
      });
    }
  }

  // ── 3. person titles carrying a recommendation block ──────────────────────
  if (enabled('names')) {
    const badge = nodes.filter(
      (n) => n.type === 'person' && (RECOMMENDATION_TAIL.test(n.title) || /\b(1st|2nd|3rd)\b|Premium member/.test(n.title)),
    );
    console.log(`\n── person titles carrying a headline/recommendation: ${badge.length}`);
    for (const n of badge) {
      const split = splitPersonTitle(n.title);
      if (!split) {
        console.log(`   !SKIP unparseable: ${n.title.slice(0, 70)}`);
        continue;
      }
      const patch: Record<string, unknown> = { title: split.name };
      const before: Record<string, unknown> = { title: n.title };
      const props = P(n);
      if (!props.headline && split.headline) {
        patch.props = { ...props, headline: split.headline };
        before.props = props;
      }
      console.log(`   ~NODE "${n.title.slice(0, 50)}…"`);
      console.log(`          name     -> "${split.name}"`);
      if (patch.props) console.log(`          headline -> "${split.headline.slice(0, 60)}"`);
      await patchNode(n.id, `person ${n.id}`, patch, before);
    }
  }

  // ── 4. skill categories ───────────────────────────────────────────────────
  if (enabled('skills')) {
    const uncategorised = nodes.filter((n) => n.type === 'skill' && !P(n).category);
    const known = uncategorised.filter((n) => SKILL_CATEGORY[n.title]);
    const unknown = uncategorised.filter((n) => !SKILL_CATEGORY[n.title]);
    console.log(`\n── uncategorised skills: ${uncategorised.length}: ${known.length} classified, ${unknown.length} left unset`);
    for (const n of known) {
      const props = P(n);
      const category = SKILL_CATEGORY[n.title]!;
      console.log(`   ~NODE ${n.title} -> ${category}`);
      await patchNode(n.id, `skill ${n.title}`, { props: { ...props, category } }, { props });
    }
    if (unknown.length) console.log(`   left unset (too ambiguous to guess): ${unknown.map((n) => n.title).join(', ')}`);
  }

  // ── 5. is_current on dated edges ──────────────────────────────────────────
  if (enabled('current')) {
    const dated = edges.filter((e) => (e.start_date || e.end_date) && e.is_current === undefined);
    console.log(`\n── dated edges with is_current unset: ${dated.length}`);
    let cur = 0;
    for (const e of dated) {
      const is_current = !e.end_date || e.end_date >= today;
      if (is_current) cur += 1;
      await patchEdge(e.id, `${e.type} ${e.id}`, { is_current }, { is_current: undefined });
    }
    console.log(`   ${cur} inferred current, ${dated.length - cur} ended`);
  }

  // ── 6. KNOWS from evidence already in the graph ───────────────────────────
  if (enabled('knows') && self) {
    const orgsOf = (pid: string): Set<string> => {
      const out = new Set<string>();
      const roleIds = edges.filter((e) => e.type === 'HELD' && e.src === pid).map((e) => e.dst);
      for (const r of roleIds) for (const e of edges.filter((x) => x.type === 'ROLE_AT' && x.src === r)) out.add(e.dst);
      for (const e of edges.filter((x) => x.type === 'MEMBER_OF' && x.src === pid)) out.add(e.dst);
      return out;
    };
    const mine = orgsOf(self.id);
    const existing = new Set(
      edges.filter((e) => e.type === 'KNOWS').map((e) => (e.src === self.id ? e.dst : e.src)),
    );
    const candidates: Array<{ id: string; title: string; why: string; relation?: string }> = [];
    for (const p of nodes.filter((n) => n.type === 'person' && n.id !== self.id)) {
      if (existing.has(p.id)) continue;
      const rec = edges.filter((e) => e.type === 'RECOMMENDS' && (e.src === p.id || e.dst === p.id));
      const shared = [...orgsOf(p.id)].filter((o) => mine.has(o));
      if (rec.length > 0) {
        candidates.push({ id: p.id, title: p.title, why: `${rec.length} RECOMMENDS edge(s)`, relation: 'colleague' });
      } else if (shared.length > 0) {
        candidates.push({
          id: p.id,
          title: p.title,
          why: `shared organisation: ${shared.map((o) => byId.get(o)?.title).join(', ')}`,
          relation: 'colleague',
        });
      }
    }
    console.log(`\n── KNOWS edges justified by existing graph evidence: ${candidates.length}`);
    console.log('   (closeness/cadence deliberately left unset, those are judgements only you can make)');
    for (const c of candidates) {
      console.log(`   +EDGE KNOWS -> ${c.title.slice(0, 45)}  [${c.why}]`);
      if (!apply) continue;
      const created = await repository.createEdge(
        {
          type: 'KNOWS',
          src: self.id,
          dst: c.id,
          props: { relation: c.relation, topics: [] },
          source: 'system',
          source_ref: 'tidy-import-knows-v1',
          confidence: 0.7,
          notes_md: `Inferred from ${c.why}.`,
        },
        { actor: ACTOR },
      );
      journal.push({ kind: 'edge_created', id: created.id, label: `KNOWS -> ${c.title}` });
    }
  }

  // ── finish ────────────────────────────────────────────────────────────────
  if (!apply) {
    console.log('\ndry run, nothing was written. Re-run with --apply to write.');
    return;
  }
  if (journal.length === 0) {
    console.log('\nnothing changed, no journal run written');
  } else {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    // meta_runs has a foreign key onto meta, so the parent document must exist.
    await repository.docPut('meta', JOURNAL_DOC, { id: JOURNAL_DOC, kind: 'journal' });
    await repository.docPut(
      'meta_runs',
      runId,
      { id: runId, at: new Date().toISOString(), entries: journal },
      { meta_id: JOURNAL_DOC },
    );
    console.log(`\njournal run ${runId} written (${journal.length} entries)`);
    console.log('undo with: pnpm --filter @vitae/api tidy:import --undo --apply');
  }
  searchIndex.markDirty();
  await invalidateDuplicateScan();
  await repository.publishSearchInvalidation();
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
