/**
 * Seed the DEMO data space with a sample graph for "Jordan", a software and data
 * engineer. Covers all 33 node types, plus edges, résumé atoms (variants and
 * skills), parsed JD targets, and a finalized résumé so every demo surface has
 * something to show.
 *
 * Writes only through `runInSpace('demo')`. The real graph is never touched.
 *
 *   pnpm seed:demo
 */
import '../env.js';
import { repository } from '../db/repository.js';
import { TABLES } from '../db/schema.js';
import { newId, nowIso } from '../db/util.js';
import { closeDb } from '../db/pg.js';
import { runInSpace } from '../db/space.js';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

async function wipe() {
  // docTruncate is space-scoped; this script runs in demo, so real records stay put.
  for (const table of TABLES) await repository.docTruncate(table);
  console.log('  cleared demo collections');
}

async function main() {
  console.log('Seeding the DEMO space (Jordan’s sample graph)…');
  await wipe();

  // ── Skills (JD parser dictionary + Technical Skills section) ───────────────
  const skill = async (title: string, aliases: string[], category: string) =>
    (await repository.createNode({ type: 'skill', title, props: { aliases, category, proficiency: 'proficient' }, source: 'manual' })).id;
  const sPy = await skill('Python', ['py'], 'language');
  const sC = await skill('C', [], 'language');
  const sSql = await skill('SQL', [], 'language');
  await skill('Java', [], 'language');
  const sJs = await skill('JavaScript', ['js', 'node'], 'language');
  await skill('Kotlin', [], 'language');
  const sPyTorch = await skill('PyTorch', ['torch'], 'framework');
  await skill('scikit-learn', ['sklearn'], 'framework');
  await skill('Pandas', [], 'framework');
  const sDjango = await skill('Django', [], 'framework');
  await skill('React', ['reactjs'], 'framework');
  const sPostgres = await skill('PostgreSQL', ['postgres'], 'platform');
  const sLinux = await skill('Linux', [], 'platform');
  await skill('Docker', [], 'platform');
  const sGit = await skill('Git', ['github'], 'tool');
  const sTableau = await skill('Tableau', [], 'tool');
  const sEtl = await skill('ETL', ['data pipelines', 'pipeline'], 'method');
  const sScraping = await skill('Web Scraping', ['scraping'], 'method');
  const sRl = await skill('Reinforcement Learning', ['rl'], 'domain');
  const sMl = await skill('Machine Learning', ['ml'], 'domain');
  const sEmbedded = await skill('Embedded Systems', ['rtos', 'arduino'], 'domain');
  const sViz = await skill('Data Visualization', ['dashboards'], 'domain');

  // ── Self ────────────────────────────────────────────────────────────────────
  const self = await repository.createNode({
    type: 'person',
    title: 'Jordan Kim',
    subtitle: 'Software & Data Engineer',
    props: {
      is_self: true,
      emails: ['jordan.demo@example.com'],
      phones: ['+250 780 000 000'],
      city: 'Kigali',
      timezone: 'Africa/Kigali',
      headline: 'Automated data pipelines · applied ML · embedded systems',
      socials: { linkedin: 'https://linkedin.com/in/jordan-demo', github: 'https://github.com/jordan-demo' },
    },
    source: 'manual',
  });

  // ── Organizations ───────────────────────────────────────────────────────────
  const org = async (title: string, domain: string, kind: string, city?: string) =>
    (await repository.createNode({ type: 'organization', title, props: { domain, kind, website: `https://${domain}`, ...(city ? { city } : {}) }, source: 'manual' })).id;
  const niadelta = await org('NiaDelta', 'niadelta.example', 'company', 'Port Louis');
  const nasersalem = await org('NaserSalem Motors', 'nasersalem.example', 'company', 'Sohag');
  const goodera = await org('Goodera', 'goodera.example', 'company', 'Bangalore');
  const cmu = await org('Carnegie Mellon University Africa', 'africa.engineering.cmu.edu', 'university', 'Kigali');
  const alu = await org('African Leadership University', 'alueducation.com', 'university', 'Kigali');
  const aurora = await org('Aurora Dynamics', 'aurora-dynamics.example', 'company', 'Nairobi');

  // ── People (network) ────────────────────────────────────────────────────────
  const person = async (title: string, props: Record<string, unknown>) =>
    (await repository.createNode({ type: 'person', title, props, source: 'manual', confidence: 0.9 })).id;
  const priya = await person('Priya Sharma', { headline: 'Operations lead @ Goodera', city: 'Bangalore', emails: ['priya@goodera.example'] });
  const fatima = await person('Dr. Fatima Nkurunziza', { headline: 'Assistant Professor, ECE @ CMU-Africa', city: 'Kigali', emails: ['fatima@cmu.example'] });
  const jean = await person('Jean-Paul Habimana', { headline: 'MSc EAI classmate, computer vision', city: 'Kigali' });
  const marc = await person('Marc Uwimana', { headline: 'Data platform lead @ Aurora Dynamics', city: 'Nairobi', emails: ['marc@aurora.example'] });
  const sara = await person('Sara Mahmoud', { headline: 'M&E manager @ NiaDelta', city: 'Port Louis' });
  const omar = await person('Omar Hassan', { headline: 'Owner, NaserSalem Motors', city: 'Sohag' });
  const grace = await person('Grace Mutesi', { headline: 'Talent partner @ Aurora Dynamics', city: 'Nairobi' });
  const tarek = await person('Tarek Aziz', { headline: 'CTO @ stealth robotics', city: 'Dubai' });

  const knows = async (dst: string, props: Record<string, unknown>) =>
    repository.createEdge({ type: 'KNOWS', src: self.id, dst, props, source: 'manual' });
  await knows(priya, { closeness: 4, cadence_target_days: 90, met_via: 'Goodera internship', topics: ['automation', 'referrals'] });
  await knows(fatima, { closeness: 5, cadence_target_days: 30, met_via: 'CMU-Africa research', topics: ['reinforcement learning', 'publications'] });
  await knows(jean, { closeness: 5, cadence_target_days: 14, topics: ['computer vision', 'coursework'] });
  await knows(marc, { closeness: 3, cadence_target_days: 60, met_via: 'Deep Learning Indaba', topics: ['data platforms', 'hiring'], favors: [{ direction: 'owed_to_me', what: 'referral to Aurora', settled: false }] });
  await knows(sara, { closeness: 3, cadence_target_days: 120, topics: ['M&E', 'dashboards'] });
  await knows(omar, { closeness: 2, cadence_target_days: 365, topics: ['inventory system'] });
  await knows(grace, { closeness: 2, cadence_target_days: 60, topics: ['ML engineer role'] });
  await knows(tarek, { closeness: 3, cadence_target_days: 180, met_via: 'DevFest', topics: ['robotics', 'founding'] });

  // ── Roles ───────────────────────────────────────────────────────────────────
  const role = async (title: string, subtitle: string, orgId: string, location: string, start: string, end: string | null, extra: Record<string, unknown> = {}) => {
    const r = await repository.createNode({
      type: 'role',
      title,
      subtitle,
      props: { employment_type: 'intern', location, ...extra },
      start_date: start,
      ...(end ? { end_date: end } : {}),
      source: 'manual',
    });
    await repository.createEdge({ type: 'HELD', src: self.id, dst: r.id, source: 'manual' });
    await repository.createEdge({ type: 'ROLE_AT', src: r.id, dst: orgId, source: 'manual' });
    return r.id;
  };
  const rNia = await role('Data Engineering Intern', 'NiaDelta · Data & automation', niadelta, 'Remote (Mauritius)', '2023-04-01', '2024-12-20', { tech_stack: ['Python', 'PostgreSQL', 'Google Sheets API'] });
  const rNaser = await role('Software Development Intern', 'NaserSalem Motors · Sales systems', nasersalem, 'Sohag, Egypt', '2022-06-01', '2022-08-31', { tech_stack: ['Django', 'PostgreSQL'] });
  const rGoodera = await role('Business Analyst & Automation Intern', 'Goodera · Partnerships data', goodera, 'Remote (India)', '2022-02-01', '2022-06-30', { tech_stack: ['Python', 'Selenium'] });
  const rCmuRa = await role('Graduate Research Assistant', 'CMU-Africa · Adaptive pipelines', cmu, 'Kigali, Rwanda', '2025-08-15', null, { employment_type: 'part_time', tech_stack: ['PyTorch', 'NumPy', 'SciPy'] });

  for (const [rid, skills] of [
    [rNia, [sPy, sEtl, sViz]],
    [rNaser, [sDjango, sPostgres]],
    [rGoodera, [sPy, sScraping]],
    [rCmuRa, [sPyTorch, sRl]],
  ] as Array<[string, string[]]>) {
    for (const s of skills) await repository.createEdge({ type: 'USES_SKILL', src: rid, dst: s, source: 'manual' });
  }

  // ── Projects + repositories ────────────────────────────────────────────────
  const project = async (title: string, props: Record<string, unknown>, start: string, end?: string) => {
    const p = await repository.createNode({ type: 'project', title, props, start_date: start, ...(end ? { end_date: end } : {}), source: 'manual' });
    await repository.createEdge({ type: 'WORKED_ON', src: self.id, dst: p.id, props: { involvement: 'led' }, source: 'manual' });
    return p.id;
  };
  const pFiler = await project('Filer: Content-Aware File Organization Engine', { kind: 'personal', my_role: 'creator', status: 'active', outcome: 'Cross-platform Electron app for intelligent file cataloging on Linux.' }, '2026-02-01');
  const pMulti = await project('Multithreaded Client-Server System', { kind: 'personal', my_role: 'author', status: 'done', outcome: 'Concurrent IPC + socket server in C supporting many parallel clients.' }, '2025-01-15', '2025-04-30');
  const pRlStudy = await project('Adaptive Data Pipeline Orchestration (RL study)', { kind: 'research', my_role: 'researcher', status: 'done', outcome: 'Reproducible RL study across 1,000 seeded simulations.' }, '2026-01-10', '2026-05-05');
  await project('Sales & Inventory Web System', { kind: 'work', my_role: 'developer', status: 'done', outcome: 'Django + PostgreSQL system with role-based access.' }, '2022-06-05', '2022-08-25');
  const pNavRobot = await project('Campus Navigation Robot', { kind: 'personal', my_role: 'team lead', status: 'done', outcome: 'Line-following robot; national championship winner.' }, '2019-03-01', '2019-08-15');

  const repo = async (title: string, fullName: string, lang: string, desc: string, projectId?: string) => {
    const r = await repository.createNode({
      type: 'repository',
      title,
      props: { host: 'github', full_name: fullName, url: `https://github.com/${fullName}`, primary_language: lang, languages: { [lang]: 90 }, stars: 12, topics: ['demo'], description: desc },
      source: 'import_github',
    });
    if (projectId) await repository.createEdge({ type: 'PART_OF', src: r.id, dst: projectId, source: 'manual' });
    return r.id;
  };
  await repo('filer', 'jordan-demo/filer', 'TypeScript', 'Content-aware file organization engine (Electron).', pFiler);
  await repo('mt-server', 'jordan-demo/mt-server', 'C', 'Multithreaded IPC + socket server.', pMulti);
  await repo('rl-orchestrator', 'jordan-demo/rl-orchestrator', 'Python', 'Utility-based RL agent for pipeline orchestration.', pRlStudy);

  // ── Education / certifications / courses ───────────────────────────────────
  const msc = await repository.createNode({
    type: 'education',
    title: 'M.Sc., Electrical & Computer Engineering',
    subtitle: 'Carnegie Mellon University Africa',
    props: { degree: 'M.Sc. ECE: Embedded Systems & Signal Processing', field_of_study: 'Electrical & Computer Engineering', coursework: ['Machine Learning for Engineers', 'Real-Time Embedded Systems', 'Signal Processing'] },
    start_date: '2024-08-15',
    end_date: '2027-05-15',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: msc.id, source: 'manual' });
  await repository.createEdge({ type: 'PART_OF', src: msc.id, dst: cmu, source: 'manual' });

  const bsc = await repository.createNode({
    type: 'education',
    title: 'B.Sc., Computer Science',
    subtitle: 'African Leadership University',
    props: { degree: 'B.Sc. Computer Science', field_of_study: 'Computer Science', gpa: 3.57, coursework: ['Machine Learning', 'Computer Architecture', 'Systems Programming', 'Databases'] },
    start_date: '2021-01-10',
    end_date: '2024-04-30',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: bsc.id, source: 'manual' });
  await repository.createEdge({ type: 'PART_OF', src: bsc.id, dst: alu, source: 'manual' });

  const cert = async (title: string, issued: string, url: string) => {
    const c = await repository.createNode({ type: 'certification', title, props: { issued_on: issued, credential_url: url, status: 'valid' }, source: 'manual' });
    await repository.createEdge({ type: 'EARNED', src: self.id, dst: c.id, source: 'manual' });
    return c.id;
  };
  await cert('Data Analyst Nanodegree (Udacity)', '2022-09-30', 'https://confirm.udacity.com/demo');
  await cert('AWS Cloud Practitioner', '2024-02-15', 'https://aws.amazon.com/verification');

  const course = async (title: string, provider: string, status: string, completed?: string) => {
    const c = await repository.createNode({
      type: 'course',
      title,
      props: { provider, format: 'self_paced', course_status: status, ...(completed ? { completed_on: completed, completion: 100 } : { completion: 60 }), skills_gained: ['Python', 'ML'] },
      source: 'manual',
    });
    await repository.createEdge({ type: 'COMPLETED', src: self.id, dst: c.id, source: 'manual' });
    return c.id;
  };
  await course('18-662 · Machine Learning for Engineers', 'CMU-Africa', 'completed', '2026-05-10');
  await course('Deep Reinforcement Learning Specialization', 'Coursera', 'in_progress');
  await course('Embedded Systems Programming on ARM', 'edX', 'completed', '2025-06-20');

  // ── Publications / talks / awards / references ─────────────────────────────
  const pubRl = await repository.createNode({
    type: 'publication',
    title: 'Self-Learning Utility-Based Agent for Adaptive Data Pipeline Orchestration',
    props: { pub_type: 'workshop', venue: 'CMU-Africa Graduate Research Symposium', authors: ['Jordan Kim', 'Fatima Nkurunziza'], author_position: 1, my_contribution: 'Designed and ran the full reproducible RL study.', published_on: '2026-05-20', url: 'https://example.com/rl-pipelines' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: pubRl.id, props: { author_position: 1, weight: 'lead' }, source: 'manual' });
  await repository.createEdge({ type: 'ABOUT', src: pubRl.id, dst: pRlStudy, source: 'manual' });

  const pubLa = await repository.createNode({
    type: 'publication',
    title: 'Integrating Methodological Perspectives in ML & Learning Analytics',
    props: { pub_type: 'preprint', venue: 'arXiv', authors: ['Jordan Kim'], author_position: 1, my_contribution: 'Literature review proposing a new categorization scheme.', published_on: '2023-11-15', url: 'https://arxiv.org/abs/demo' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: pubLa.id, source: 'manual' });

  const pubEmb = await repository.createNode({
    type: 'publication',
    title: 'Low-Power Signal Pipelines on Constrained Microcontrollers',
    props: { pub_type: 'conference', venue: 'IEEE AFRICON 2026', authors: ['Jordan Kim', 'Jean-Paul Habimana'], author_position: 1, published_on: '2026-06-10' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: pubEmb.id, source: 'manual' });

  const talk = async (title: string, event: string, city: string, date: string, audience: number) => {
    const t = await repository.createNode({ type: 'talk', title, props: { talk_type: 'meetup', event_name: event, city, delivered_on: date, audience_size: audience }, source: 'manual' });
    await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: t.id, source: 'manual' });
    return t.id;
  };
  await talk('Reproducible RL experiments on a budget', 'PyData Kigali', 'Kigali', '2026-04-18', 80);
  await talk('From spreadsheets to pipelines', 'Data Science Rwanda meetup', 'Kigali', '2025-10-22', 45);

  const award = async (title: string, level: string, awardedOn: string, forWhat: string) => {
    const a = await repository.createNode({ type: 'award', title, props: { level, awarded_on: awardedOn, award_for: forWhat }, source: 'manual' });
    await repository.createEdge({ type: 'EARNED', src: self.id, dst: a.id, source: 'manual' });
    return a.id;
  };
  await award('1st Place: Egyptian National Finals, World Robot Challenge', 'national', '2019-08-10', 'Campus Navigation Robot (Nile University)');
  await award('Dean’s List', 'org', '2023-06-30', 'Top 5% academic performance, ALU');
  await award('Best Poster: Graduate Research Symposium', 'org', '2026-05-21', 'Adaptive pipeline orchestration study');

  const reference = async (personId: string, relationship: string, blurb: string) => {
    const ref = await repository.createNode({
      type: 'reference',
      title: relationship,
      props: { relationship, reference_type: 'professional', blurb, strength: 5, can_contact: true, context: relationship },
      source: 'manual',
    });
    await repository.createEdge({ type: 'RECOMMENDS', src: personId, dst: ref.id, source: 'manual' });
    return ref.id;
  };
  await reference(priya, 'Manager at Goodera (2022)', 'Jordan automated our partner-data collection end to end. Meticulous, fast, and self-directed.');
  await reference(fatima, 'Research advisor at CMU-Africa', 'One of the most rigorous students I have supervised; his experiment hygiene is exemplary.');

  // ── Job search: postings, application, interview ───────────────────────────
  const posting = async (title: string, company: string, orgId: string, jd: string) => {
    const jp = await repository.createNode({
      type: 'job_posting',
      title,
      props: { company, role_title: title, location: 'Nairobi (hybrid)', location_mode: 'hybrid', employment_type: 'full_time', jd_text: jd, posting_status: 'interested', source: 'referral' },
      source: 'manual',
    });
    await repository.createEdge({ type: 'APPLIED_TO', src: jp.id, dst: orgId, source: 'manual' });
    return jp.id;
  };
  const jpMl = await posting('Machine Learning Engineer', 'Aurora Dynamics', aurora, 'Python, PyTorch, data pipelines, Kubernetes.');
  await posting('Data Engineer', 'Kivu Analytics', await org('Kivu Analytics', 'kivu.example', 'company', 'Kigali'), 'SQL, ETL, Python, dashboarding.');

  const app = await repository.createNode({
    type: 'application',
    title: 'Machine Learning Engineer @ Aurora Dynamics',
    props: { role_title: 'Machine Learning Engineer', status: 'interview', applied_on: dateAgo(18), channel: 'referral', next_step: 'Technical interview with Marc', next_step_date: dateAgo(-4) },
    source: 'manual',
  });
  await repository.createEdge({ type: 'APPLIED_TO', src: app.id, dst: aurora, source: 'manual' });
  await repository.createEdge({ type: 'REFERRED_BY', src: app.id, dst: marc, source: 'manual' });
  await repository.createEdge({ type: 'RELATES_TO', src: app.id, dst: jpMl, props: { label: 'posting' }, source: 'manual' });

  const interview = await repository.createNode({
    type: 'interview',
    title: 'Recruiter screen: Aurora Dynamics',
    props: { round: 'Recruiter screen', stage_no: 1, format: 'video', scheduled_at: daysAgo(6), duration_min: 30, outcome: 'passed', reflection: 'Went well; asked about the RL study and NiaDelta pipeline.' },
    source: 'manual',
  });
  await repository.createEdge({ type: 'INTERVIEW_FOR', src: interview.id, dst: app.id, source: 'manual' });
  await repository.createEdge({ type: 'WITH', src: interview.id, dst: grace, source: 'manual' });

  // ── Life: events, interactions, tasks, goals, habits, journal, ideas ───────
  const indaba = await repository.createNode({
    type: 'event',
    title: 'Deep Learning Indaba 2025',
    props: { kind: 'conference', venue: 'KCC', city: 'Kigali', attended: true },
    start_date: '2025-09-01',
    end_date: '2025-09-05',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: indaba.id, source: 'manual' });
  await repository.createEdge({ type: 'ATTENDED', src: marc, dst: indaba.id, source: 'manual' });
  await repository.createNode({ type: 'event', title: 'CMU-Africa Career Fair', props: { kind: 'meetup', venue: 'CMU-Africa campus', city: 'Kigali', attended: true }, start_date: dateAgo(30), source: 'manual' });
  await repository.createNode({ type: 'event', title: 'PyData Kigali: April meetup', props: { kind: 'meetup', city: 'Kigali', attended: true }, start_date: '2026-04-18', source: 'manual' });

  const interaction = async (personId: string, kind: string, title: string, agoDays: number) => {
    const i = await repository.createNode({ type: 'interaction', title, props: { kind, occurred_at: daysAgo(agoDays), talking_points: ['Aurora role', 'RL study'] }, source: 'manual' });
    await repository.createEdge({ type: 'WITH', src: i.id, dst: personId, source: 'manual' });
  };
  await interaction(marc, 'coffee', 'Coffee at Indaba: walked through the Aurora data platform', 45);
  await interaction(fatima, 'meeting', 'Weekly research sync: paired stats review', 3);
  await interaction(grace, 'call', 'Recruiter screen debrief', 6);
  await interaction(jean, 'message', 'WhatsApp: swapped embedded lab notes', 1);
  await interaction(priya, 'email', 'Email: asked for a reference letter', 12);

  const task = async (title: string, status: string, due?: string, priority = 'p2') =>
    repository.createNode({ type: 'task', title, props: { status, priority, ...(due ? { due } : {}) }, source: 'manual' });
  await task('Prepare Aurora technical interview', 'doing', dateAgo(-3), 'p1');
  await task('Send Priya the reference form', 'next', dateAgo(-7));
  await task('Calibrate résumé atoms for data-engineering roles', 'next');
  await task('Renew AWS certification', 'inbox', dateAgo(-60), 'p3');

  await repository.createNode({
    type: 'goal',
    title: 'Land an ML engineering role by graduation',
    props: { horizon: 'year', goal_status: 'active', target_date: '2027-05-31', success_criteria: 'Signed offer, ML/data scope, African tech hub.', key_results: [{ name: 'Applications', current: 2, target: 10, unit: 'apps' }, { name: 'Referrals', current: 1, target: 5, unit: 'intros' }] },
    source: 'manual',
  });
  const goalPub = await repository.createNode({
    type: 'goal',
    title: 'Publish 2 first-author papers during the M.Sc.',
    props: { horizon: 'year', goal_status: 'active', success_criteria: 'Two peer-reviewed first-author publications.', key_results: [{ name: 'Papers', current: 1, target: 2, unit: 'papers' }] },
    source: 'manual',
  });
  await repository.createEdge({ type: 'RELATES_TO', src: goalPub.id, dst: pubRl.id, props: { label: 'evidence' }, source: 'manual' });

  const habit = async (title: string, checkedDays: number[]) => {
    const h = await repository.createNode({ type: 'habit', title, props: { cadence: 'daily', active: true, target_per_period: 1 }, source: 'manual' });
    for (const d of checkedDays) {
      const date = dateAgo(d);
      await repository.docPut('habit_checks', `${h.id}_${date}`, { habit_id: h.id, date, created_at: nowIso() });
    }
  };
  await habit('Deep work 2h before noon', [0, 1, 2, 4, 5, 7, 8, 9, 11, 12]);
  await habit('One outreach message a day', [0, 2, 3, 6, 10]);

  const journal = async (title: string, agoDays: number, mood: number) =>
    repository.createNode({ type: 'journal_entry', title, props: { entry_date: dateAgo(agoDays), mood, energy: mood }, notes_md: 'Notes on the week: research, interviews, and pacing.', source: 'manual' });
  await journal('Symposium week: poster award!', 50, 5);
  await journal('Interview prep is eating my evenings', 6, 3);
  await journal('Good research rhythm this week', 2, 4);

  await repository.createNode({ type: 'idea', title: 'Line-model calibrator for LaTeX résumés', props: { status: 'building', one_liner: 'Fit chars/line from compiled PDFs automatically.', excitement: 4 }, source: 'manual' });
  await repository.createNode({ type: 'idea', title: 'Open dataset of African tech-hub JDs', props: { status: 'spark', one_liner: 'Scrape + normalize job descriptions for career research.', excitement: 3 }, source: 'manual' });
  const ideaFiler = await repository.createNode({ type: 'idea', title: 'Filer plugin marketplace', props: { status: 'explored', one_liner: 'Let users share content-detection rules.', excitement: 4 }, source: 'manual' });
  await repository.createEdge({ type: 'RELATES_TO', src: ideaFiler.id, dst: pFiler, props: { label: 'extends' }, source: 'manual' });

  // ── Links, documents, subscriptions ────────────────────────────────────────
  const link = async (title: string, url: string, reason: string, sharedBy?: string) => {
    const l = await repository.createNode({ type: 'link', title, props: { url, domain: new URL(url).hostname, saved_reason: reason }, source: 'manual' });
    if (sharedBy) await repository.createEdge({ type: 'SHARED_BY', src: l.id, dst: sharedBy, source: 'manual' });
    return l.id;
  };
  const rlLink = await link('Reinforcement Learning: An Introduction', 'http://incompleteideas.net/book/the-book-2nd.html', 'reference for the study', fatima);
  await link('The Missing Semester of Your CS Education', 'https://missing.csail.mit.edu/', 'recommended to juniors');
  await link('Tectonic: a modern TeX engine', 'https://tectonic-typesetting.github.io/', 'powers the résumé compile pipeline');
  await repository.createEdge({ type: 'MENTIONS', src: rlLink, dst: pRlStudy, source: 'manual' });

  await repository.createNode({ type: 'document', title: 'ALU transcript (final)', props: { doc_kind: 'transcript', issued_on: '2024-05-15', extracted_text: 'B.Sc. Computer Science: CGPA 3.57/4.0' }, source: 'manual' });
  await repository.createNode({ type: 'document', title: 'NiaDelta internship completion letter', props: { doc_kind: 'certificate', issued_on: '2024-12-22' }, source: 'manual' });

  await repository.createNode({ type: 'subscription', title: 'Linear Business', props: { vendor: 'Linear', category: 'software', plan: 'Business', cost: { amount: 96, currency: 'USD', period: 'yearly' }, renews_on: dateAgo(-20), sub_status: 'active' }, source: 'manual' });
  await repository.createNode({ type: 'subscription', title: 'Notion Plus', props: { vendor: 'Notion', category: 'software', plan: 'Plus', cost: { amount: 96, currency: 'USD', period: 'yearly' }, renews_on: '2027-01-05', sub_status: 'active' }, source: 'manual' });

  // ── Proposed types: locations, trips, media, highlights, assets, health, accounts ──
  const loc = async (title: string, lat: number, lng: number, cc: string) =>
    (await repository.createNode({ type: 'location', title, props: { kind: 'city', lat, lng, country_code: cc, city: title }, source: 'manual' })).id;
  const kigali = await loc('Kigali', -1.9441, 30.0619, 'RW');
  const cairo = await loc('Cairo', 30.0444, 31.2357, 'EG');
  await loc('Nairobi', -1.2921, 36.8219, 'KE');
  await repository.createEdge({ type: 'LOCATED_IN', src: self.id, dst: kigali, source: 'manual' });
  await repository.createEdge({ type: 'VISITED', src: self.id, dst: cairo, source: 'manual' });

  await repository.createNode({ type: 'trip', title: 'Cairo: family + AFRICON paper', props: { destination: 'Cairo', purpose: 'family', transport: ['plane'], highlights: 'Presented the embedded pipelines paper.' }, start_date: '2026-06-05', end_date: '2026-06-20', source: 'manual' });
  await repository.createNode({ type: 'trip', title: 'Nairobi: Aurora onsite loop', props: { destination: 'Nairobi', purpose: 'work', transport: ['plane'] }, start_date: dateAgo(-10), end_date: dateAgo(-13), source: 'manual' });

  const book = await repository.createNode({ type: 'media_item', title: 'Designing Data-Intensive Applications', props: { media_kind: 'book', creator: 'Martin Kleppmann', consumption_status: 'in_progress', rating: 5, started_on: dateAgo(40) }, source: 'manual' });
  await repository.createEdge({ type: 'SHARED_BY', src: book.id, dst: marc, props: { channel: 'Indaba coffee' }, source: 'manual' });
  await repository.createNode({ type: 'media_item', title: 'Lex Fridman #400: RL and robotics', props: { media_kind: 'podcast', consumption_status: 'done', rating: 4 }, source: 'manual' });

  const hl = await repository.createNode({ type: 'highlight', title: 'On log-structured storage', props: { excerpt: 'The log is the heart of the system…', loc_ref: 'ch. 3', thought: 'Applies to my artifact-record design in the RL study.' }, source: 'manual' });
  await repository.createEdge({ type: 'ABOUT', src: hl.id, dst: book.id, source: 'manual' });
  await repository.createNode({ type: 'highlight', title: 'Reward shaping pitfalls', props: { excerpt: 'Shaped rewards leak designer assumptions…', loc_ref: '32:10', thought: 'Cited in the symposium poster.' }, source: 'manual' });

  await repository.createNode({ type: 'asset', title: 'ThinkPad T14 Gen 5', props: { category: 'electronics', vendor: 'Lenovo', model: 'T14 Gen 5', purchased_on: '2024-09-01', price: { amount: 1250, currency: 'USD' }, warranty_until: '2027-09-01', asset_status: 'owned' }, source: 'manual' });
  await repository.createNode({ type: 'asset', title: 'Saleae Logic 8 analyzer', props: { category: 'electronics', vendor: 'Saleae', purchased_on: '2025-02-10', price: { amount: 399, currency: 'USD' }, asset_status: 'owned' }, source: 'manual' });

  await repository.createNode({ type: 'health_log', title: 'Morning run: 5k along the ridge', props: { metric: 'workout', value: 5, unit: 'km', logged_at: daysAgo(1) }, sensitivity: 'sensitive', source: 'manual' });
  await repository.createNode({ type: 'health_log', title: 'Sleep: 7.5h', props: { metric: 'sleep_h', value: 7.5, unit: 'h', logged_at: daysAgo(0) }, sensitivity: 'sensitive', source: 'manual' });

  await repository.createNode({ type: 'account', title: 'Hetzner Cloud', props: { kind: 'online', service: 'Hetzner', url: 'https://console.hetzner.cloud', cost: { amount: 9, currency: 'EUR', period: 'monthly' }, account_status: 'active' }, source: 'manual' });
  await repository.createNode({ type: 'account', title: 'Bank of Kigali (savings)', props: { kind: 'financial', identifier_masked: '…7204', account_status: 'active' }, sensitivity: 'sensitive', source: 'manual' });

  // ── Résumé atoms (the raw material) ─────────────────────────────────────────
  let pinnedLeft = 2;
  const atom = async (
    owner: string,
    dateEnd: string | undefined,
    metrics: unknown[],
    skillIds: string[],
    variants: Array<{ emphasis: string; text: string; is_default?: boolean }>,
    flags: { pinned?: boolean; blocked?: boolean } = {},
  ) => {
    const id = newId();
    const now = nowIso();
    const pinned = flags.pinned ?? false;
    if (pinned) pinnedLeft -= 1;
    await repository.docPut('atoms', id, {
      id,
      owner_node: owner,
      kind: 'achievement',
      metrics,
      ...(dateEnd ? { date_end: dateEnd } : {}),
      pinned,
      blocked: flags.blocked ?? false,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    for (const [i, v] of variants.entries()) {
      const vid = newId();
      await repository.docPut('atom_variants', vid, { id: vid, atom_id: id, emphasis: v.emphasis, text: v.text, is_default: v.is_default ?? i === 0 });
    }
    for (const sid of skillIds) {
      const asid = newId();
      await repository.docPut('atom_skills', asid, { id: asid, atom_id: id, skill_id: sid, weight: 1 });
    }
    return id;
  };

  // NiaDelta (6)
  await atom(rNia, '2024-12-20', [{ value: 17, unit: 'teams' }, { value: 25, unit: 'products' }], [sPy, sEtl], [
    { emphasis: 'technical', text: 'Built a semi-automated data pipeline connecting a PostgreSQL reporting service with the Google Sheets API to consolidate, enrich, and report product data across 17 teams and 25 offerings.' },
    { emphasis: 'concise', text: 'Built a PostgreSQL and Sheets pipeline consolidating product data across 17 teams.' },
  ], { pinned: true });
  await atom(rNia, '2024-12-20', [], [sSql, sEtl], [
    { emphasis: 'technical', text: 'Designed **validation rules, schema improvements, and cross-source consistency checks**, raising the reliability of cross-team datasets.' },
    { emphasis: 'concise', text: 'Designed validation rules and schema checks for cross-team datasets.' },
  ]);
  await atom(rNia, '2024-12-20', [{ value: 18, unit: 'products' }], [sViz, sTableau], [
    { emphasis: 'technical', text: 'Led trend analysis of 18 priority products with the M&E team and delivered structured dashboards used in cross-team planning.' },
    { emphasis: 'concise', text: 'Led trend analysis of 18 products; shipped planning dashboards.' },
  ]);
  await atom(rNia, '2024-12-20', [{ value: 60, unit: '%', label: 'manual effort' }], [sPy], [
    { emphasis: 'technical', text: 'Automated weekly reporting with Google Apps Script + Python, cutting manual consolidation effort by roughly 60%.' },
    { emphasis: 'concise', text: 'Automated weekly reporting, cutting manual effort ~60%.' },
  ]);
  await atom(rNia, '2024-12-20', [], [sPy, sMl], [
    { emphasis: 'technical', text: 'Prototyped LLM-assisted categorization of free-text partner submissions, reviewed and adopted by the data team.' },
    { emphasis: 'concise', text: 'Prototyped LLM-assisted categorization of partner submissions.' },
  ]);
  await atom(rNia, '2024-12-20', [], [sViz], [
    { emphasis: 'technical', text: 'Ran fortnightly data-quality reviews with 5 team leads, closing recurring gaps at the source.' },
    { emphasis: 'concise', text: 'Ran fortnightly data-quality reviews with 5 team leads.' },
  ], { blocked: true });

  // Goodera (5)
  await atom(rGoodera, '2022-06-30', [{ value: 47500, unit: 'data points' }], [sPy, sScraping], [
    { emphasis: 'technical', text: 'Built **Python web-scraping and automation tools** that extracted and classified **47,500+ data points** across diverse web and email sources.' },
    { emphasis: 'concise', text: 'Built Python scrapers classifying 47,500+ data points.' },
  ], { pinned: true });
  await atom(rGoodera, '2022-06-30', [{ value: 1200, unit: 'hours' }, { value: 14, unit: 'partners' }], [sPy, sEtl], [
    { emphasis: 'technical', text: 'Engineered **CRM import pipelines** from scraped data, expanding outreach into 8 new markets and onboarding 14 partners while saving ~1,200 employee-hours.' },
    { emphasis: 'concise', text: 'Engineered CRM import pipelines saving ~1,200 employee-hours.' },
  ]);
  await atom(rGoodera, '2022-06-30', [], [sPy], [
    { emphasis: 'technical', text: 'Automated email parsing and classification for partner responses, replacing a fully manual triage workflow.' },
    { emphasis: 'concise', text: 'Automated email parsing and classification for partner responses.' },
  ]);
  await atom(rGoodera, '2022-06-30', [{ value: 8, unit: 'markets' }], [sViz], [
    { emphasis: 'technical', text: 'Delivered market-entry dashboards for 8 new regions, used directly by the partnerships team for prioritization.' },
    { emphasis: 'concise', text: 'Delivered market-entry dashboards for 8 regions.' },
  ]);
  await atom(rGoodera, '2022-06-30', [], [sSql], [
    { emphasis: 'technical', text: 'Normalized scraped records into a queryable store with dedup rules, cutting duplicate outreach incidents to near zero.' },
    { emphasis: 'concise', text: 'Normalized scraped records with dedup rules.' },
  ]);

  // NaserSalem (4)
  await atom(rNaser, '2022-08-31', [], [sDjango, sPostgres], [
    { emphasis: 'technical', text: 'Designed and deployed a **Django + PostgreSQL** sales and inventory web system with secure role-based access.' },
    { emphasis: 'concise', text: 'Deployed a Django + PostgreSQL sales & inventory system.' },
  ]);
  await atom(rNaser, '2022-08-31', [{ value: 30, unit: '%', label: 'accuracy' }], [sDjango, sMl], [
    { emphasis: 'technical', text: 'Integrated automated, AI-assisted inventory checks that increased order-report accuracy by roughly 30%.' },
    { emphasis: 'concise', text: 'AI-assisted inventory checks raised report accuracy ~30%.' },
  ]);
  await atom(rNaser, '2022-08-31', [], [sPostgres], [
    { emphasis: 'technical', text: 'Modeled the dealership’s sales, stock, and supplier data into a normalized PostgreSQL schema with migration scripts.' },
    { emphasis: 'concise', text: 'Modeled dealership data into a normalized PostgreSQL schema.' },
  ]);
  await atom(rNaser, '2022-08-31', [], [sDjango], [
    { emphasis: 'technical', text: 'Trained 6 non-technical staff on the new system and wrote the operations runbook that outlived the internship.' },
    { emphasis: 'concise', text: 'Trained 6 staff and wrote the ops runbook.' },
  ]);

  // CMU RA (3)
  await atom(rCmuRa, undefined, [{ value: 1000, unit: 'simulations' }], [sPyTorch, sRl], [
    { emphasis: 'technical', text: 'Designed and ran a fully **reproducible reinforcement-learning study** (PyTorch, NumPy, SciPy) across 1,000 seeded simulations with paired statistical tests and an 81-cell parameter sweep.' },
    { emphasis: 'concise', text: 'Ran a reproducible RL study across 1,000 seeded simulations.' },
  ]);
  await atom(rCmuRa, undefined, [], [sGit, sPy], [
    { emphasis: 'technical', text: 'Engineered **commit-pinned, hash-verified artifact records** (config hashing, disjoint seed pools, one-command reproduction) for end-to-end result integrity.' },
    { emphasis: 'concise', text: 'Engineered hash-verified artifact records for one-command reproduction.' },
  ]);
  await atom(rCmuRa, undefined, [], [sRl, sMl], [
    { emphasis: 'technical', text: 'Isolated policy effects with action-trace ablations, turning a noisy simulation into publishable evidence.' },
    { emphasis: 'concise', text: 'Isolated policy effects with action-trace ablations.' },
  ]);

  // Projects (5)
  await atom(pFiler, undefined, [], [sJs, sLinux], [
    { emphasis: 'technical', text: 'Designing a cross-platform desktop app (**Electron**) for intelligent, content-aware file cataloging on Linux, using a spec-driven workflow.' },
    { emphasis: 'concise', text: 'Building an Electron app for content-aware file cataloging.' },
  ]);
  await atom(pFiler, undefined, [], [sPy, sMl], [
    { emphasis: 'technical', text: 'Built the content-classification prototype combining file-signature heuristics with embedding similarity.' },
    { emphasis: 'concise', text: 'Built the content-classification prototype for Filer.' },
  ]);
  await atom(pMulti, '2025-04-30', [], [sC, sLinux], [
    { emphasis: 'technical', text: 'Implemented a **multithreaded client-server system in C**: concurrent IPC and a socket server for many parallel clients, tested for scalability.' },
    { emphasis: 'concise', text: 'Implemented a multithreaded IPC + socket server in C.' },
  ]);
  await atom(pRlStudy, '2026-05-05', [{ value: 81, unit: 'cells' }], [sRl, sPyTorch], [
    { emphasis: 'technical', text: 'Swept an 81-cell parameter grid with disjoint seed pools, showing the utility-based agent beat static schedules in 74% of regimes.' },
    { emphasis: 'concise', text: '81-cell sweep: utility agent beat static schedules in 74% of regimes.' },
  ]);
  await atom(pNavRobot, '2019-08-15', [], [sC, sEmbedded], [
    { emphasis: 'technical', text: 'Led the embedded control stack of the national-champion navigation robot (sensor fusion + PID on ATmega).' },
    { emphasis: 'concise', text: 'Led the embedded control stack of a national-champion robot.' },
  ]);

  // Publications (3)
  await atom(pubRl.id, '2026-05-20', [], [sRl], [
    { emphasis: 'technical', text: 'First-author workshop paper on a self-learning utility-based agent for adaptive data-pipeline orchestration.' },
    { emphasis: 'concise', text: 'First-author paper on utility-based pipeline orchestration.' },
  ]);
  await atom(pubLa.id, '2023-11-15', [], [sMl], [
    { emphasis: 'technical', text: 'Literature review proposing a new categorization scheme and improved clustering for education-research datasets.' },
    { emphasis: 'concise', text: 'Literature review on ML methods in learning analytics.' },
  ]);
  await atom(pubEmb.id, '2026-06-10', [], [sEmbedded], [
    { emphasis: 'technical', text: 'Co-designed low-power signal pipelines achieving real-time filtering on sub-$5 microcontrollers.' },
    { emphasis: 'concise', text: 'Low-power real-time signal pipelines on sub-$5 MCUs.' },
  ]);
  void pinnedLeft;

  // ── Saved views + settings ──────────────────────────────────────────────────
  const view = async (name: string, query: string) => {
    const id = newId();
    await repository.docPut('saved_views', id, { id, name, query, created_at: nowIso() });
  };
  await view('Job hunt', 'type:application');
  await view('Research artifacts', 'type:publication');

  await repository.docPut('meta', 'settings', {
    profile: { name: 'Jordan Kim', headline: 'Software & Data Engineer', email: 'jordan.demo@example.com', links: ['https://github.com/jordan-demo'] },
    updated_at: nowIso(),
  });

  // ── Targets (parsed JDs) + a finalized résumé ──────────────────────────────
  const { createTarget } = await import('../services/resume.js');
  const target1 = await createTarget({
    role_title: 'Machine Learning Engineer',
    company: 'Aurora Dynamics',
    jd_raw: `Machine Learning Engineer: Aurora Dynamics (Nairobi, hybrid)

About the team
We build data platforms and applied ML systems for logistics across East Africa.

What you'll do
- Design and operate automated data pipelines (ETL) feeding our ML models
- Train and evaluate models in PyTorch and scikit-learn
- Ship reliable Python services; own data quality end to end

Requirements
- Strong Python and SQL experience is required
- Experience building data pipelines / ETL at scale
- Working knowledge of machine learning and PyTorch
- Comfort with Linux, Git, and Docker
- Clear written communication across remote teams

Nice to have
- Reinforcement learning exposure
- Web scraping and data visualization experience`,
  });

  const target2 = await createTarget({
    role_title: 'Data Engineer',
    company: 'Kivu Analytics',
    jd_raw: `Data Engineer: Kivu Analytics (Kigali)

Requirements
- Python and SQL fluency
- ETL design and data validation experience
- Dashboarding (Tableau or similar)
- PostgreSQL in production
- Web scraping experience is a plus`,
  });
  // Manual-mode draft so Tailor opens mid-session on this target.
  await repository.docMerge('targets', target2.id as string, {
    draft: { mode: 'manual', templateKey: 'cobalt', include: [], sectionsEnabled: { summary: true, skills: true, experience: true, research: false, projects: true, education: true, awards: false } },
    updated_at: nowIso(),
  });

  const resumeId = newId();
  await repository.docPut('resumes', resumeId, {
    id: resumeId,
    target_id: target1.id,
    template_key: 'cobalt',
    name: `Aurora Dynamics / Machine Learning Engineer (${dateAgo(9)})`,
    config: { headline: 'Machine Learning Engineer', summary: 'Software and data engineer with a track record of turning messy, manual processes into reliable automated pipelines.' },
    selection: { entries: [], totalLines: 0, weightedCoverage: 0.96 },
    coverage: { weightedPct: 0.96, passesGate: true, gaps: [], perKeyword: [] },
    pages: 1,
    status: 'sent',
    sent_at: daysAgo(8),
    created_at: daysAgo(9),
    updated_at: daysAgo(8),
  });

  const counts = { nodes: (await repository.allLiveNodes()).length, edges: (await repository.allLiveEdges()).length };
  console.log(`\n✓ Demo seed complete: ${counts.nodes} nodes, ${counts.edges} edges (demo_* collections).`);
  console.log('  Toggle "View demo" in the top bar to explore. Try /resume/tailor with the Aurora Dynamics target.');
}

// Awaited, not fire-and-forget: an un-awaited top-level promise exits 0 the
// moment the event loop drains, so a failure after the last synchronous line
// would be reported as success.
await runInSpace('demo', main)
  .catch((err: unknown) => {
    console.error('Demo seed failed:', err);
    process.exitCode = 1;
  })
  .finally(closeDb);
