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
  const _pycairo = await org('PyCairo', 'pycairo.org', 'community');
  const _univ = await org('Cairo University', 'cu.edu.eg', 'university');

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
  await knows(sarah, { closeness: 4, cadence_target_days: 60, met_via: 'DevFest speaker dinner', topics: ['reinforcement learning', 'hiring'], favors: [{ direction: 'owed_to_me', what: 'intro to her VP', settled: false }] });
  await knows(omar, { closeness: 5, cadence_target_days: 30, topics: ['frontend', 'design systems'] });
  await knows(lina, { closeness: 2, cadence_target_days: 365, met_via: 'DevFest', topics: ['reinforcement learning'] });
  await knows(karim, { closeness: 3, cadence_target_days: 120, topics: ['hiring', 'perception'] });

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
