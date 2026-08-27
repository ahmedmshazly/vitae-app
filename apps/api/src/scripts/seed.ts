/**
 * Seed a fictional sample graph into Postgres. Produces enough to demonstrate
 * every journey: capture, who-to-call,
 * résumé tailoring, reconnect, and export.
 *
 *   pnpm seed
 */
import '../env.js';
import { repository } from '../db/repository.js';
import { TABLES } from '../db/schema.js';
import { newId, nowIso } from '../db/util.js';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function wipe() {
  // TRUNCATE with CASCADE is what the test harness uses; here the per-table
  // delete keeps the active data space intact, so seeding demo never touches
  // real records.
  for (const table of TABLES) await repository.docTruncate(table);
  console.log('  cleared the current data space');
}

async function main() {
  console.log('Seeding Vitae sample graph…');
  await wipe();

  // ── Skills (the JD parser dictionary) ──────────────────────────────────────
  const skill = async (title: string, aliases: string[], category: string) =>
    (await repository.createNode({ type: 'skill', title, props: { aliases, category }, source: 'manual' })).id;
  const sPy = await skill('Python', ['py'], 'language');
  const sK8s = await skill('Kubernetes', ['k8s'], 'platform');
  const sRL = await skill('Reinforcement Learning', ['rl'], 'domain');
  const sGrpc = await skill('gRPC', ['grpc'], 'framework');
  const _sReact = await skill('React', ['reactjs'], 'framework');
  const sPyTorch = await skill('PyTorch', ['torch'], 'framework');

  // ── Self ───────────────────────────────────────────────────────────────────
  const self = await repository.createNode({
    type: 'person',
    title: 'Jordan Kim',
    subtitle: 'ML platforms engineer',
    props: {
      is_self: true,
      emails: ['jordan@example.com'],
      phones: ['+20 100 000 0000'],
      city: 'Giza',
      timezone: 'Africa/Cairo',
      headline: 'ML platforms · perception · career-tools builder',
      socials: { linkedin: 'https://linkedin.com/in/jordan-kim', github: 'https://github.com/jordan-kim' },
    },
    source: 'manual',
  });

  // ── Organizations ──────────────────────────────────────────────────────────
  const org = async (title: string, domain: string, kind: string) =>
    (await repository.createNode({ type: 'organization', title, props: { domain, kind, website: `https://${domain}` }, source: 'manual' })).id;
  const nile = await org('Nile Robotics', 'nile-robotics.com', 'company');
  const _devfest = await org('DevFest Cairo', 'devfest.cairo', 'community');
  const pycairo = await org('PyCairo', 'pycairo.org', 'community');
  const univ = await org('Cairo University', 'cu.edu.eg', 'university');

  // ── People (network) ───────────────────────────────────────────────────────
  const person = async (title: string, props: Record<string, unknown>) =>
    (await repository.createNode({ type: 'person', title, props: { ...props }, source: 'manual', confidence: 0.9 })).id;
  const sarah = await person('Sarah Chen', { headline: 'Staff SWE, ML platforms', city: 'Berlin', emails: ['sarah@nile-robotics.com'] });
  const omar = await person('Omar Khaled', { headline: 'Frontend lead', city: 'Cairo', emails: ['omar@example.com'] });
  const lina = await person('Lina Farouk', { headline: 'RL researcher', city: 'Giza' });
  const karim = await person('Karim Nabil', { headline: 'Eng manager @ Nile', city: 'Berlin' });

  // ── KNOWS edges (the relationships) ────────────────────────────────────────
  const knows = async (dst: string, props: Record<string, unknown>) =>
    repository.createEdge({ type: 'KNOWS', src: self.id, dst, props, source: 'manual' });
  const peerKnows = async (src: string, dst: string, props: Record<string, unknown>) =>
    repository.createEdge({ type: 'KNOWS', src, dst, props, source: 'manual' });
  await knows(sarah, { closeness: 4, cadence_target_days: 60, met_via: 'DevFest speaker dinner', topics: ['reinforcement learning', 'hiring'], favors: [{ direction: 'owed_to_me', what: 'intro to her VP', settled: false }] });
  await knows(omar, { closeness: 5, cadence_target_days: 30, topics: ['frontend', 'design systems'] });
  await knows(lina, { closeness: 2, cadence_target_days: 365, met_via: 'DevFest', topics: ['reinforcement learning'] });
  await knows(karim, { closeness: 3, cadence_target_days: 120, topics: ['hiring', 'perception'] });

  // The low-stakes peer tie makes the warm-path screen demonstrate a real
  // multi-hop ask: Jordan → Lina → Karim → Nile Robotics.
  await peerKnows(lina, karim, {
    relation: 'colleague',
    met_via: 'DevFest research circle',
    topics: ['reinforcement learning', 'hiring'],
    strength: 0.3,
  });

  // ── Roles + org links ──────────────────────────────────────────────────────
  const myRole = await repository.createNode({
    type: 'role',
    title: 'Senior ML Engineer',
    subtitle: 'Nile Robotics · Perception',
    props: { employment_type: 'full_time', seniority: 'senior', team: 'Perception', tech_stack: ['Python', 'Kubernetes', 'PyTorch'] },
    start_date: '2022-01-01',
    end_date: '2025-01-01',
    source: 'manual',
  });
  await repository.createEdge({ type: 'HELD', src: self.id, dst: myRole.id, source: 'manual' });
  await repository.createEdge({ type: 'ROLE_AT', src: myRole.id, dst: nile, source: 'manual' });

  // Sarah works at Nile (affiliation for who-to-call).
  const sarahRole = await repository.createNode({ type: 'role', title: 'Staff SWE', props: { employment_type: 'full_time', seniority: 'staff' }, start_date: '2021-01-01', status: 'active', source: 'manual' });
  await repository.createEdge({ type: 'HELD', src: sarah, dst: sarahRole.id, source: 'manual' });
  await repository.createEdge({ type: 'ROLE_AT', src: sarahRole.id, dst: nile, source: 'manual' });

  // Karim's profile already named Nile; record the role so it can be used as
  // the concrete affiliation at the end of the peer-to-peer introduction path.
  const karimRole = await repository.createNode({
    type: 'role',
    title: 'Engineering Manager',
    subtitle: 'Nile Robotics · Perception',
    props: {
      employment_type: 'full_time',
      seniority: 'manager',
      team: 'Perception',
      tech_stack: ['Python', 'Kubernetes'],
    },
    start_date: '2023-06-01',
    status: 'active',
    source: 'manual',
  });
  await repository.createEdge({ type: 'HELD', src: karim, dst: karimRole.id, source: 'manual' });
  await repository.createEdge({ type: 'ROLE_AT', src: karimRole.id, dst: nile, source: 'manual' });

  // ── Project + skills ───────────────────────────────────────────────────────
  const proj = await repository.createNode({ type: 'project', title: 'PerceptionBench', props: { kind: 'work', my_role: 'tech lead', status: 'done', outcome: 'Open benchmark for perception inference latency' }, start_date: '2024-03-01', end_date: '2024-11-30', source: 'manual' });
  await repository.createEdge({ type: 'WORKED_ON', src: self.id, dst: proj.id, props: { involvement: 'led' }, source: 'manual' });
  await repository.createEdge({ type: 'WORKED_ON', src: sarah, dst: proj.id, props: { involvement: 'core' }, source: 'manual' });
  for (const s of [sPy, sK8s, sPyTorch]) await repository.createEdge({ type: 'USES_SKILL', src: myRole.id, dst: s, source: 'manual' });
  await repository.createEdge({ type: 'USES_SKILL', src: sarah, dst: sRL, source: 'manual' });
  await repository.createEdge({ type: 'USES_SKILL', src: lina, dst: sRL, source: 'manual' });

  // ── Interactions (drive tie strength) ──────────────────────────────────────
  const interaction = async (personId: string, kind: string, title: string, agoDays: number) => {
    const i = await repository.createNode({ type: 'interaction', title, props: { kind, occurred_at: daysAgo(agoDays), talking_points: ['RL hiring', 'PerceptionBench'] }, source: 'manual' });
    await repository.createEdge({ type: 'WITH', src: i.id, dst: personId, source: 'manual' });
  };
  await interaction(sarah, 'coffee', 'Coffee: walked through my Nile referral ask', 21);
  await interaction(sarah, 'call', 'Call: she will intro me to Karim', 5);
  await interaction(omar, 'message', 'Slack: reviewed my design system PR', 40);
  await interaction(karim, 'video', 'Intro call about the Perception team', 14);

  // ── Atoms (résumé raw material) ────────────────────────────────────────────
  const atom = async (owner: string, dateEnd: string, metrics: unknown[], skillIds: string[], variants: Array<{ emphasis: string; text: string; is_default?: boolean }>) => {
    const id = newId();
    const now = nowIso();
    await repository.docPut('atoms', id, { id, owner_node: owner, kind: 'achievement', metrics, date_end: dateEnd, pinned: false, blocked: false, created_at: now, updated_at: now, deleted_at: null });
    for (const [i, v] of variants.entries()) {
      const vid = newId();
      await repository.docPut('atom_variants', vid, { id: vid, atom_id: id, emphasis: v.emphasis, text: v.text, is_default: v.is_default ?? i === 0 });
    }
    for (const sid of skillIds) {
      const asid = newId();
      await repository.docPut('atom_skills', asid, { id: asid, atom_id: id, skill_id: sid, weight: 1 });
    }
  };
  await atom(myRole.id, '2025-01-01', [{ value: 38, unit: '%', label: 'latency' }, { value: 12, unit: 'services' }], [sPy, sK8s], [
    { emphasis: 'technical', text: 'Cut Python inference latency 38% across 12 services by rearchitecting the model-serving path on Kubernetes.' },
    { emphasis: 'concise', text: 'Cut inference latency 38% across 12 services on Kubernetes.' },
    { emphasis: 'leadership', text: 'Led a 4-engineer effort that cut inference latency 38% across 12 services.' },
  ]);
  await atom(myRole.id, '2025-01-01', [{ value: 4, unit: 'TB/day' }], [sPyTorch, sRL], [
    { emphasis: 'technical', text: 'Built a reinforcement-learning training pipeline in PyTorch processing 4TB/day of perception data.' },
    { emphasis: 'concise', text: 'Built an RL training pipeline processing 4TB/day.' },
  ]);
  await atom(myRole.id, '2025-01-01', [], [sGrpc], [
    { emphasis: 'technical', text: 'Migrated internal services to gRPC, halving p99 request latency between perception components.' },
    { emphasis: 'concise', text: 'Migrated services to gRPC, halving p99 latency.' },
  ]);

  // ── Career history for the Timeline lanes ──────────────────────────────────
  const oldRole = await repository.createNode({
    type: 'role',
    title: 'ML Engineer',
    subtitle: 'Cairo AI Lab',
    props: { employment_type: 'full_time', seniority: 'mid' },
    start_date: '2020-02-01',
    end_date: '2021-12-31',
    source: 'manual',
  });
  await repository.createEdge({ type: 'HELD', src: self.id, dst: oldRole.id, source: 'manual' });
  const cairoAi = await org('Cairo AI Lab', 'cairo-ai.example', 'company');
  await repository.createEdge({ type: 'ROLE_AT', src: oldRole.id, dst: cairoAi, source: 'manual' });

  const bsc = await repository.createNode({
    type: 'education',
    title: 'Cairo University',
    subtitle: 'B.Sc Computer Science',
    props: { degree: 'B.Sc Computer Science' },
    start_date: '2016-09-01',
    end_date: '2020-06-30',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: bsc.id, source: 'manual' });

  // ── Events + trips (Timeline lanes + Map pins) ─────────────────────────────
  const devfestEvent = await repository.createNode({
    type: 'event',
    title: 'DevFest Cairo',
    props: { kind: 'conference', venue: 'Cairo ICC', city: 'Cairo', attended: true },
    start_date: '2025-09-12',
    end_date: '2025-09-13',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: devfestEvent.id, source: 'manual' });
  await repository.createEdge({ type: 'ATTENDED', src: sarah, dst: devfestEvent.id, source: 'manual' });

  const trip = async (title: string, city: string, start: string, end: string, purpose: string) =>
    repository.createNode({
      type: 'trip',
      title,
      props: { city, destination: city, purpose, transport: ['plane'] },
      start_date: start,
      end_date: end,
      source: 'manual',
    });
  await trip('Berlin: ML infra meetups', 'Berlin', '2024-06-10', '2024-06-17', 'work');
  await trip('Dubai: recruiting trip', 'Dubai', '2025-03-02', '2025-03-06', 'work');

  const berlinLoc = await repository.createNode({
    type: 'location',
    title: 'Berlin',
    props: { city: 'Berlin', kind: 'city', lat: 52.52, lng: 13.405, country_code: 'DE' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'VISITED', src: self.id, dst: berlinLoc.id, source: 'manual' });

  // ── Application pipeline (Today's pipeline strip) ──────────────────────────
  const application = async (roleTitle: string, orgId: string, status: string, appliedDaysAgo: number) => {
    const a = await repository.createNode({
      type: 'application',
      title: `${roleTitle}`,
      props: { role_title: roleTitle, status, applied_on: daysAgo(appliedDaysAgo).slice(0, 10) },
      source: 'manual',
    });
    await repository.createEdge({ type: 'APPLIED_TO', src: a.id, dst: orgId, source: 'manual' });
    return a.id;
  };
  const zeta = await org('Zeta Autonomy', 'zeta-autonomy.example', 'company');
  const helio = await org('Helio Health', 'helio.example', 'company');
  await application('Senior ML Engineer', nile, 'interview', 20);
  await application('Staff Perception Engineer', zeta, 'screening', 12);
  await application('ML Platform Lead', helio, 'applied', 5);

  // ── Habits + 30-day checks (Today's dot grids + streaks) ───────────────────
  const habit = async (title: string, checkedDays: number[]) => {
    const h = await repository.createNode({
      type: 'habit',
      title,
      props: { cadence: 'daily', active: true, target_per_period: 1 },
      source: 'manual',
    });
    for (const d of checkedDays) {
      const date = daysAgo(d).slice(0, 10);
      await repository.docPut('habit_checks', `${h.id}_${date}`, { habit_id: h.id, date, created_at: nowIso() });
    }
  };
  await habit('Deep work 2h', [0, 1, 2, 3, 5, 6, 8, 9, 10, 12, 13]);
  await habit('Reach out to one person', [0, 2, 4, 7, 11]);

  // ── Links + ideas (Collections tiles, capture feed) ────────────────────────
  await repository.createNode({
    type: 'link',
    title: 'A recipe for training stable RL agents',
    props: { url: 'https://arxiv.org/abs/2501.00001', domain: 'arxiv.org', saved_reason: 'shared by Omar' },
    source: 'manual',
  });
  await repository.createNode({
    type: 'idea',
    title: 'Résumé atoms as a graph',
    props: { status: 'building', one_liner: 'Every bullet is a node with provenance.' },
    source: 'manual',
  });

  // ── A dormant tie (drives the Reconnect lane) ──────────────────────────────
  const tarek = await person('Tarek Aziz', { headline: 'CTO @ stealth', city: 'Dubai', emails: ['tarek@example.com'] });
  await knows(tarek, { closeness: 4, cadence_target_days: 90, topics: ['founding', 'robotics'], favors: [{ direction: 'owed_by_me', what: 'reviewed my pitch deck', settled: false }] });
  await interaction(tarek, 'coffee', 'Coffee in DIFC: talked robotics founding', 200);

  // ── Long-tail records with typed props (forms + collections demo) ──────────
  const pub = await repository.createNode({
    type: 'publication',
    title: 'Sim-to-real transfer for warehouse manipulation',
    props: {
      pub_type: 'conference',
      venue: 'CoRL 2025',
      authors: ['You', 'Sarah Chen'],
      author_position: 1,
      my_contribution: 'Led the sim-to-real pipeline and evaluation.',
      published_on: '2025-11-06',
      url: 'https://example.com/corl2025',
    },
    source: 'manual',
  });
  await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: pub.id, props: { author_position: 1, weight: 'lead' }, source: 'manual' });

  const talkNode = await repository.createNode({
    type: 'talk',
    title: 'Deterministic intelligence for personal tools',
    props: { talk_type: 'meetup', event_name: 'DevFest Cairo', city: 'Cairo', audience_size: 150, delivered_on: '2025-09-13' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: talkNode.id, source: 'manual' });

  const awardNode = await repository.createNode({
    type: 'award',
    title: 'Best Demo Award',
    props: { level: 'international', award_for: 'PerceptionBench live demo', awarded_on: '2025-11-07' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'EARNED', src: self.id, dst: awardNode.id, source: 'manual' });

  const goalNode = await repository.createNode({
    type: 'goal',
    title: 'Land a staff-level robotics role',
    props: {
      horizon: 'year',
      goal_status: 'active',
      target_date: '2026-12-31',
      success_criteria: 'Signed offer at a robotics company, staff scope.',
      key_results: [
        { name: 'Applications in flight', current: 3, target: 8, unit: 'apps' },
        { name: 'Warm referrals', current: 1, target: 4, unit: 'intros' },
      ],
    },
    source: 'manual',
  });

  const book = await repository.createNode({
    type: 'media_item',
    title: 'The Staff Engineer’s Path',
    props: { media_kind: 'book', creator: 'Tanya Reilly', consumption_status: 'in_progress', rating: 4, started_on: '2026-05-20' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'SHARED_BY', src: book.id, dst: sarah, props: { channel: 'coffee chat' }, source: 'manual' });
  const hl = await repository.createNode({
    type: 'highlight',
    title: 'On being glue',
    props: { excerpt: 'Being glue is being the person who notices the missing pieces…', loc_ref: 'p. 141', thought: 'Applies to how I frame platform work in atoms.' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'ABOUT', src: hl.id, dst: book.id, source: 'manual' });
  await repository.createEdge({ type: 'RELATES_TO', src: goalNode.id, dst: awardNode.id, props: { label: 'evidence' }, source: 'manual' });

  await repository.createNode({
    type: 'asset',
    title: 'ThinkPad X1 Carbon',
    props: { category: 'electronics', vendor: 'Lenovo', model: 'X1 Carbon Gen 12', purchased_on: '2025-01-15', price: { amount: 1650, currency: 'USD' }, warranty_until: '2028-01-15', asset_status: 'owned' },
    source: 'manual',
  });
  await repository.createNode({
    type: 'health_log',
    title: 'Morning run: 5k',
    props: { metric: 'workout', value: 5, unit: 'km', logged_at: daysAgo(1) },
    sensitivity: 'sensitive',
    source: 'manual',
  });
  await repository.createNode({
    type: 'account',
    title: 'Cloudflare',
    props: { kind: 'subscription', service: 'Cloudflare Pro', url: 'https://dash.cloudflare.com', cost: { amount: 20, currency: 'USD', period: 'monthly' }, renewal_on: '2026-08-01', account_status: 'active' },
    source: 'manual',
  });

  // ── A correspondence world ─────────────────────────────────────────────────
  //
  // Everything above this line is the smallest graph that makes each screen
  // render. That was enough while the screens only had to draw; it stopped
  // being enough once they started computing. Five undirected interactions
  // cannot demonstrate a reciprocity ratio, a reply latency, an imbalance, or
  // a tie that was once strong and went quiet, because none of those figures
  // exist in five records.
  //
  // So the seven people below are not more of the same. Each one is a
  // different shape of correspondence, chosen against what the algorithms
  // actually key on: the Hawkes kernel decays with a 90-day constant, a tie
  // counts as once-strong at a peak of 0.55, an imbalance is only ranked once
  // four directional events exist, and a direction change more than 60 days
  // apart is a new thread rather than a reply. Data that ignores those numbers
  // fills a screen without demonstrating anything on it.
  //
  // Every exchange is stated, never inferred. Where a real operator would not
  // have recorded who reached out - an annual meeting, a corridor encounter -
  // the direction is left unset, and the coverage line owns up to it. That is
  // the honest shape of a real log, and a seed where every single interaction
  // carries a direction would quietly imply the product asks for one.

  /** [days ago, kind, who opened it (null when unrecorded), what it was]. */
  type Beat = [number, string, 'me' | 'them' | null, string];

  const exchange = async (personId: string, topics: string[], beats: Beat[]) => {
    // Oldest first, so the log reads the way the correspondence happened.
    for (const [agoDays, kind, who, title] of [...beats].sort((a, b) => b[0] - a[0])) {
      const node = await repository.createNode({
        type: 'interaction',
        title,
        props: {
          kind,
          occurred_at: daysAgo(agoDays),
          talking_points: topics,
          ...(who ? { initiated_by: who } : {}),
        },
        source: 'manual',
      });
      await repository.createEdge({ type: 'WITH', src: node.id, dst: personId, source: 'manual' });
    }
  };

  const meridian = await org('Meridian Labs', 'meridian-labs.example', 'company');

  /**
   * Where someone works, as a role node joined to an organization, which is
   * the shape the warm-path search reads. A person with a headline naming an
   * employer and no ROLE_AT edge looks affiliated to a human reader and
   * unaffiliated to every query, which is the gap this closes.
   */
  const worksAt = async (personId: string, roleTitle: string, orgId: string, startDate: string) => {
    const role = await repository.createNode({
      type: 'role',
      title: roleTitle,
      props: { employment_type: 'full_time' },
      start_date: startDate,
      status: 'active',
      source: 'manual',
    });
    await repository.createEdge({ type: 'HELD', src: personId, dst: role.id, source: 'manual' });
    await repository.createEdge({ type: 'ROLE_AT', src: role.id, dst: orgId, source: 'manual' });
  };

  // Mariam: the peer. Two people at the same level who genuinely trade, which
  // is what a reciprocity ratio near even and a two-day median reply look like.
  const mariam = await person('Mariam Sabry', {
    headline: 'Principal engineer, autonomy platform',
    city: 'Amsterdam',
    emails: ['mariam@zeta-autonomy.example'],
    socials: { linkedin: 'https://linkedin.com/in/mariam-sabry' },
  });
  await knows(mariam, {
    closeness: 4,
    cadence_target_days: 45,
    met_via: 'CoRL 2024 workshop',
    topics: ['sim-to-real', 'evaluation harnesses', 'perception'],
  });
  await exchange(mariam, ['sim-to-real', 'evaluation'], [
    [612, 'email', 'me', 'Asked how Zeta evaluates sim-to-real gap'],
    [610, 'email', 'them', 'She sent their eval harness write-up'],
    [575, 'video', 'them', 'Walked me through their scenario generator'],
    [540, 'email', 'me', 'Sent my notes on scenario coverage'],
    [537, 'email', 'them', 'Pushed back on my coverage metric'],
    [498, 'call', 'me', 'Argued out the coverage metric properly'],
    [451, 'email', 'them', 'Draft of her workshop abstract'],
    [449, 'email', 'me', 'Comments on the abstract'],
    [402, 'video', 'them', 'Reviewed my PerceptionBench design'],
    [365, 'email', 'me', 'Shared the benchmark results'],
    [362, 'email', 'them', 'Asked for the raw traces'],
    [318, 'email', 'me', 'Sent the traces and the caveats'],
    [287, 'coffee', null, 'Ran into each other at the Amsterdam meetup'],
    [264, 'email', 'them', 'Suggested we write the eval piece together'],
    [261, 'email', 'me', 'Agreed, and sketched an outline'],
    [230, 'video', 'me', 'Outline review'],
    [227, 'email', 'them', 'Her section draft'],
    [223, 'email', 'me', 'My section draft'],
    [186, 'call', 'them', 'Talked through the reviewer comments'],
    [151, 'email', 'me', 'Camera-ready sent'],
    [149, 'email', 'them', 'Congratulations, and a hiring question'],
    [146, 'email', 'me', 'Answered the hiring question'],
    [112, 'video', 'them', 'Asked whether I would consider Zeta'],
    [109, 'email', 'me', 'Said I was starting to look'],
    [77, 'email', 'them', 'Sent the Staff Perception role'],
    [75, 'email', 'me', 'Thanked her and applied'],
    [44, 'call', 'them', 'Prep call before the Zeta screen'],
    [41, 'email', 'me', 'Debrief after the screen'],
    [19, 'email', 'them', 'Checked how the loop was going'],
    [17, 'email', 'me', 'Updated her on the timeline'],
  ]);

  // Youssef: the recruiter. He writes far more than he is written to, and the
  // last few messages have no answer at all. This is what the unanswered
  // inbound count and the inbound half of the imbalance register are for.
  const youssef = await person('Youssef Darwish', {
    headline: 'Talent partner, engineering',
    city: 'Cairo',
    emails: ['youssef@helio.example'],
  });
  await knows(youssef, {
    closeness: 2,
    cadence_target_days: 90,
    met_via: 'cold outreach',
    topics: ['hiring', 'roles'],
  });
  await exchange(youssef, ['hiring'], [
    [340, 'email', 'them', 'Cold note about a platform role'],
    [333, 'email', 'me', 'Said not now, but keep in touch'],
    [268, 'email', 'them', 'Another role, more senior'],
    [265, 'email', 'me', 'Asked what the team actually owns'],
    [263, 'email', 'them', 'Sent the team charter'],
    [196, 'email', 'them', 'Checking in'],
    [188, 'email', 'me', 'Brief reply, still not looking'],
    [131, 'email', 'them', 'ML Platform Lead is open'],
    [128, 'call', 'me', 'Called him back about it'],
    [126, 'email', 'them', 'Sent the full brief'],
    [122, 'email', 'me', 'Applied'],
    [88, 'email', 'them', 'Screen scheduled'],
    [54, 'email', 'them', 'Nudge about availability'],
    [33, 'email', 'them', 'Second nudge'],
    [21, 'email', 'them', 'Asked whether I am still interested'],
    [9, 'email', 'them', 'Third nudge, offering to call'],
  ]);

  // Hoda: the mentor. Everything outbound and nothing back in writing, which
  // is the extreme of the imbalance register - and the two annual meetings
  // carry no recorded direction, so the coverage line has something true to
  // own up to rather than a seed where every record happens to be complete.
  const hoda = await person('Hoda El-Masry', {
    headline: 'Professor of computer science',
    city: 'Cairo',
    emails: ['h.elmasry@cu.edu.eg'],
  });
  await knows(hoda, {
    closeness: 3,
    cadence_target_days: 180,
    met_via: 'undergraduate thesis supervisor',
    topics: ['research', 'mentoring', 'graduate study'],
    favors: [{ direction: 'owed_by_me', what: 'wrote my graduate reference', settled: true }],
  });
  await exchange(hoda, ['mentoring', 'research'], [
    [700, 'email', 'me', 'Sent her the PerceptionBench paper'],
    [640, 'meeting', null, 'Annual visit to the department'],
    [520, 'email', 'me', 'Update on the Nile work'],
    [430, 'email', 'me', 'Asked about the graduate reference'],
    [365, 'email', 'me', 'Thanked her for the reference'],
    [280, 'meeting', null, 'Annual visit to the department'],
    [190, 'email', 'me', 'Sent the CoRL acceptance'],
    [96, 'email', 'me', 'Asked whether she knows anyone in robotics hiring'],
    [30, 'email', 'me', 'Update on the search'],
  ]);

  // Nour: dormant, and once the strongest tie in the graph. Six months of
  // weekly project contact takes the Hawkes intensity well past the 0.55 peak
  // that qualifies a tie as once-strong; fourteen months of silence is far
  // past eight times the median gap, which is what makes it dormant. Both
  // halves are needed - a tie that was never strong is not a loss, and a tie
  // that never went quiet is not a reconnect.
  const nour = await person('Nour Abdelrahman', {
    headline: 'Robotics perception lead',
    city: 'Munich',
    emails: ['nour@meridian-labs.example'],
    socials: { linkedin: 'https://linkedin.com/in/nour-abdelrahman' },
  });
  await knows(nour, {
    closeness: 4,
    cadence_target_days: 60,
    met_via: 'the joint perception evaluation project',
    topics: ['perception', 'sensor fusion', 'robotics'],
    favors: [{ direction: 'owed_to_me', what: 'covered my on-call for a week', settled: false }],
  });
  const nourThreads = [
    'Weekly sync: calibration drift',
    'Weekly sync: sensor fusion latency',
    'Weekly sync: dataset splits',
    'Weekly sync: labelling backlog',
    'Weekly sync: evaluation harness',
    'Weekly sync: the deadline',
  ];
  const nourBeats: Beat[] = [];
  // 660 days ago to 480, weekly, alternating who called it.
  for (let i = 0, ago = 660; ago >= 480; i += 1, ago -= 7) {
    nourBeats.push([ago, i % 3 === 0 ? 'video' : 'call', i % 2 === 0 ? 'me' : 'them', `${nourThreads[i % nourThreads.length]} (week ${i + 1})`]);
  }
  nourBeats.push(
    [474, 'email', 'them', 'Final results and the write-up'],
    [470, 'email', 'me', 'Signed off on the write-up'],
    [455, 'coffee', null, 'Last coffee before she moved to Munich'],
  );
  await exchange(nour, ['perception', 'sensor fusion'], nourBeats);

  // Basma: the broker. Two of the introductions in this graph came through
  // her, which is what gives the recorded-introductions register something to
  // count that is not a free-text met_via string.
  const basma = await person('Basma Zaki', {
    headline: 'Engineering director',
    city: 'Cairo',
    emails: ['basma@cairo-ai.example'],
  });
  await knows(basma, {
    closeness: 4,
    cadence_target_days: 90,
    met_via: 'my manager at Cairo AI Lab',
    topics: ['leadership', 'hiring', 'robotics'],
    favors: [{ direction: 'owed_by_me', what: 'two introductions', settled: false }],
  });
  await exchange(basma, ['leadership', 'hiring'], [
    [900, 'meeting', null, 'Last one-to-one before I left the lab'],
    [700, 'coffee', 'them', 'She asked how the Nile move was going'],
    [610, 'email', 'me', 'Sent her the PerceptionBench link'],
    [607, 'email', 'them', 'Offered to introduce me to Mariam'],
    [520, 'call', 'me', 'Asked her advice on staff scope'],
    [430, 'coffee', 'them', 'Caught up in Zamalek'],
    [300, 'email', 'me', 'Told her I was starting to look'],
    [297, 'email', 'them', 'Offered to introduce me to Rania'],
    [210, 'call', 'them', 'Talked through what staff means at Helio'],
    [120, 'coffee', null, 'Coffee, no agenda'],
    [64, 'email', 'me', 'Asked her to look at my packet'],
    [61, 'email', 'them', 'Comments on the packet'],
    [26, 'call', 'me', 'Walked through the Zeta loop with her'],
  ]);

  // Amr: the community tie, which exists in bursts around the conference and
  // is quiet the rest of the year. The register rule plots interactions by
  // date rather than evenly, and a seasonal correspondence is what makes the
  // difference between those two visible.
  const amr = await person('Amr Selim', {
    headline: 'Data platform engineer, PyCairo organiser',
    city: 'Cairo',
    emails: ['amr@pycairo.org'],
  });
  await knows(amr, {
    closeness: 3,
    cadence_target_days: 120,
    met_via: 'PyCairo',
    topics: ['community', 'data platforms', 'speaking'],
  });
  await exchange(amr, ['community', 'speaking'], [
    [718, 'email', 'them', 'Call for speakers'],
    [714, 'email', 'me', 'Submitted a talk'],
    [700, 'email', 'them', 'Accepted, here is the slot'],
    [690, 'message', 'me', 'Logistics questions'],
    [688, 'message', 'them', 'Answers'],
    [683, 'encounter', null, 'The conference itself'],
    [680, 'message', 'them', 'Thanks and the recording link'],
    [560, 'message', 'me', 'Shared a post about deterministic tooling'],
    [420, 'message', 'them', 'Asked if I would review a submission'],
    [418, 'message', 'me', 'Said yes'],
    [400, 'email', 'me', 'Review sent'],
    [353, 'email', 'them', 'Call for speakers, second year'],
    [349, 'email', 'me', 'Submitted again'],
    [335, 'email', 'them', 'Accepted'],
    [322, 'message', 'me', 'Asked about the audience'],
    [320, 'message', 'them', 'Roughly 150, mostly practitioners'],
    [318, 'encounter', null, 'The conference itself'],
    [315, 'message', 'them', 'Recording link'],
    [140, 'message', 'them', 'Shared a job posting he thought I would like'],
    [138, 'message', 'me', 'Thanked him'],
  ]);

  // Rania: the newest tie, and the one that is climbing. Introduced three
  // months ago and accelerating from monthly to weekly, which is the opposite
  // shape to Nour and the reason both are here.
  const rania = await person('Rania Fouad', {
    headline: 'Product manager, clinical platforms',
    city: 'Dubai',
    emails: ['rania@helio.example'],
  });
  await knows(rania, {
    closeness: 3,
    cadence_target_days: 30,
    met_via: 'introduced by Basma Zaki',
    topics: ['product', 'health data', 'hiring'],
  });
  await exchange(rania, ['product', 'hiring'], [
    [92, 'email', 'them', 'Basma introduced us'],
    [90, 'email', 'me', 'Replied and suggested a call'],
    [86, 'video', 'me', 'First call, what Helio is building'],
    [62, 'email', 'them', 'Sent the platform roadmap'],
    [59, 'email', 'me', 'Questions about the data model'],
    [57, 'email', 'them', 'Answers, and an offer to introduce me internally'],
    [38, 'video', 'them', 'Walked me through the org'],
    [35, 'email', 'me', 'Thanked her, asked about the lead role'],
    [24, 'call', 'them', 'The lead role in detail'],
    [16, 'email', 'me', 'Sent my application'],
    [11, 'email', 'them', 'Confirmed it landed with the hiring manager'],
    [4, 'message', 'me', 'Asked what to expect from the panel'],
    [2, 'message', 'them', 'Told me who is on it'],
  ]);

  // Direction on two of the ties that were already here, so the correspondence
  // panel has something to say on the profiles the tour actually opens.
  await exchange(sarah, ['reinforcement learning', 'hiring'], [
    [300, 'email', 'me', 'Asked whether Nile was hiring'],
    [297, 'email', 'them', 'Said yes, and asked for my CV'],
    [295, 'email', 'me', 'Sent the CV'],
    [240, 'video', 'them', 'Told me about the perception opening'],
    [180, 'email', 'me', 'Asked how the reorg landed'],
    [176, 'email', 'them', 'Explained the reorg'],
    [120, 'coffee', null, 'Coffee in Berlin'],
    [96, 'email', 'them', 'Sent the RL reading list'],
    [93, 'email', 'me', 'Thanked her, asked about her VP'],
    [60, 'call', 'me', 'Asked for the introduction'],
    [58, 'email', 'them', 'Said she would make it'],
  ]);
  await exchange(omar, ['frontend', 'design systems'], [
    [210, 'message', 'them', 'Asked me to look at a rendering bug'],
    [208, 'message', 'me', 'Found it, sent a patch'],
    [150, 'message', 'me', 'Asked about token naming'],
    [149, 'message', 'them', 'Long answer about naming'],
    [88, 'coffee', null, 'Coffee, mostly complaining about tooling'],
    [52, 'message', 'them', 'Shared his design system talk'],
    [50, 'message', 'me', 'Notes on the talk'],
    [12, 'message', 'them', 'Asked whether I was still job hunting'],
  ]);

  // ── Recorded introductions ─────────────────────────────────────────────────
  //
  // An introduction is a first-class fact here, not a sentence in a met_via
  // field: who was connected to whom, by whom, when, and in what context. The
  // rollup counts these apart from free-text credits precisely because the two
  // are different kinds of evidence, and the warm-path search reads them.
  const introduced = async (dst: string, via: string, occurredOn: string, context: string) =>
    repository.createEdge({
      type: 'INTRODUCED',
      src: self.id,
      dst,
      props: { via, occurred_on: occurredOn, context },
      source: 'manual',
    });
  await introduced(mariam, basma, daysAgo(605).slice(0, 10), 'Basma put us in touch after the workshop');
  await introduced(rania, basma, daysAgo(92).slice(0, 10), 'Basma introduced us when I started looking');
  await introduced(karim, sarah, daysAgo(56).slice(0, 10), 'Sarah introduced me to her engineering manager');

  // Where these seven actually work. Without it the graph holds seven people
  // whose headlines name employers and whose records claim no affiliation at
  // all, which reads as a network to a person and as nothing to a query.
  await worksAt(mariam, 'Principal Engineer', zeta, '2021-04-01');
  await worksAt(youssef, 'Talent Partner', helio, '2023-02-01');
  await worksAt(rania, 'Product Manager', helio, '2022-09-01');
  await worksAt(nour, 'Perception Lead', meridian, '2025-02-01');
  await worksAt(basma, 'Engineering Director', cairoAi, '2018-01-01');
  await worksAt(hoda, 'Professor', univ, '2009-09-01');
  await repository.createEdge({
    type: 'MEMBER_OF',
    src: amr,
    dst: pycairo,
    props: { role: 'organiser' },
    source: 'manual',
  });

  // ── A saved target (JD) ────────────────────────────────────────────────────
  const { createTarget } = await import('../services/resume.js');
  await createTarget({
    role_title: 'Senior ML Engineer',
    company: 'Nile Robotics',
    jd_raw: `Senior Machine Learning Engineer\n\nAbout the team\nWe build perception systems for robotics.\n\nRequirements\n- Strong Python experience is required\n- Deep reinforcement learning background\n- Experience deploying models on Kubernetes\n- Familiarity with gRPC\n\nNice to have\n- PyTorch at scale`,
  });

  const counts = { nodes: (await repository.allLiveNodes()).length, edges: (await repository.allLiveEdges()).length };
  console.log(`\n✓ Seed complete: ${counts.nodes} nodes, ${counts.edges} edges.`);
  console.log('  Try: /ask/people (referral at Nile Robotics, RL) · /resume/tailor · the Reconnect lane on Today.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
