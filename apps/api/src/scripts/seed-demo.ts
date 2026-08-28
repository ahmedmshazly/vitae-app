/**
 * Seed the DEMO data space with a fourteen-year working life for "Jordan Kim",
 * a software and data engineer. All 34 node types, all 29 edge types, and every
 * product surface has enough in it to be read rather than merely rendered: a
 * career from a 2012 technician job to a graduate research assistantship, a
 * network of sixty-odd people across twenty-five organisations, years of dated
 * correspondence, a job search spanning all eight application states, a hundred
 * résumé atoms with wording variants, a dozen targets and outputs, cover
 * letters, dossiers, imports with a re-import to diff against, and a ledger of
 * changes going back months.
 *
 * Writes only through `runInSpace('demo')`. The real graph is never touched.
 *
 *   pnpm seed:demo
 *
 * Those two counts are stated, and asserted at the end of the run, because the
 * previous ones were wrong. This file claimed to cover 33 node types when the
 * catalogue holds 34, and `post` - the single type it had never seeded - was
 * exactly what the miscount hid. A comment that counts the domain incorrectly
 * is a defect rather than a typo: it is the thing a reader checks coverage
 * against, and it read as complete for as long as nobody counted.
 *
 * ── What this seed is not allowed to do ─────────────────────────────────────
 *
 * Nine end-to-end specs sign into this space and assert against what is here.
 * Bulk data breaks them in one specific way: a Playwright locator that resolves
 * to one element today resolves to two once a new record happens to share its
 * wording, and the spec fails on strict mode rather than on the product. That
 * has happened before (commit 3642c0d). The rules below are what keep it from
 * happening again, and each is written next to the assertion it protects.
 *
 *   · Certain wordings are matched with no `.first()`, each on one screen: an
 *     output name may not say "workflow" (the résumé hub), a bullet may not say
 *     "all atoms" or a number followed by "bullets" (Tailor) nor end in "shown"
 *     (the atom library), an output name may not end in "outputs", and nothing
 *     anywhere may say "demo space", which is the banner sign-in waits for.
 *     The scope of each rule is the screen its assertion runs on and no wider.
 *   · Nothing constrains what a bullet may say about education or technical
 *     skills. The document editor once asked the paper for those headings as
 *     loose text, which a bullet could satisfy by accident; it now asks each
 *     section for its own heading, so the wording is free again.
 *   · "Machine Learning Engineer" belongs to the Aurora Dynamics target alone.
 *     Four specs open it by that name; a second target carrying it would open
 *     the wrong one. Its `updated_at` is bumped last so it sorts first.
 *   · Aurora Dynamics is reachable through Marc Uwimana and no one else, and
 *     Marc is reachable from Jean-Paul Habimana and no one else. The warm-path
 *     assertion names that exact chain, and any new tie into either person can
 *     outrank it. New peer ties go anywhere else in the graph.
 *   · Résumé and letter artifacts are never fabricated. An attachments row
 *     asserts a blob that can actually be fetched (commit d9f949b), so this
 *     seed writes none and leaves the compile buttons to make real ones.
 *
 * Dates stay relative to now through `daysAgo`/`dateAgo`, or are fixed calendar
 * dates in the past. Nothing here is random: a seed that varies between runs
 * turns a failing assertion into a flake.
 */
import '../env.js';
import { EDGE_TYPES, NODE_TYPES } from '@vitae/core';
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
  console.log("Seeding the DEMO space (Jordan's sample graph)...");
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

  // The rest of the dictionary, with the fields the first batch leaves at their
  // defaults. Proficiency and last-used are what the skills matrix sorts and
  // shades by, so a graph where every skill is "proficient, undated" draws a
  // flat grid and demonstrates nothing.
  const skillAt = async (
    title: string,
    aliases: string[],
    category: string,
    proficiency: string,
    years: number,
    lastUsedDaysAgo: number,
  ) =>
    (
      await repository.createNode({
        type: 'skill',
        title,
        props: { aliases, category, proficiency, years_estimate: years, last_used: dateAgo(lastUsedDaysAgo) },
        source: 'manual',
      })
    ).id;

  const sTs = await skillAt('TypeScript', ['ts'], 'language', 'proficient', 5, 2);
  const sGo = await skillAt('Go', ['golang'], 'language', 'working', 2, 210);
  const sBash = await skillAt('Bash', ['shell', 'zsh'], 'language', 'expert', 12, 0);
  const sR = await skillAt('R', [], 'language', 'working', 3, 400);
  const sPhp = await skillAt('PHP', [], 'language', 'working', 4, 1600);
  const sArabic = await skillAt('Arabic', [], 'spoken_language', 'expert', 30, 0);
  const sEnglish = await skillAt('English', [], 'spoken_language', 'expert', 20, 0);
  const sFrench = await skillAt('French', [], 'spoken_language', 'working', 6, 30);
  const sKinya = await skillAt('Kinyarwanda', [], 'spoken_language', 'learning', 3, 1);
  const sFastapi = await skillAt('FastAPI', ['fast api'], 'framework', 'proficient', 4, 12);
  const sSpark = await skillAt('Apache Spark', ['spark', 'pyspark'], 'framework', 'working', 3, 150);
  const sAirflow = await skillAt('Apache Airflow', ['airflow'], 'framework', 'proficient', 4, 9);
  const sDbt = await skillAt('dbt', ['data build tool'], 'framework', 'proficient', 3, 14);
  const sLaravel = await skillAt('Laravel', [], 'framework', 'working', 3, 1800);
  const sNumpy = await skillAt('NumPy', ['numpy'], 'framework', 'expert', 8, 3);
  const sK8s = await skillAt('Kubernetes', ['k8s'], 'platform', 'working', 3, 40);
  const sAws = await skillAt('AWS', ['amazon web services'], 'platform', 'proficient', 6, 20);
  const sGcp = await skillAt('Google Cloud', ['gcp', 'bigquery'], 'platform', 'working', 3, 55);
  const sRedis = await skillAt('Redis', [], 'platform', 'working', 4, 70);
  const sKafka = await skillAt('Kafka', ['apache kafka'], 'platform', 'working', 2, 120);
  const sDuck = await skillAt('DuckDB', ['duckdb'], 'platform', 'proficient', 2, 5);
  const sTerraform = await skillAt('Terraform', ['iac'], 'tool', 'working', 3, 90);
  const sGrafana = await skillAt('Grafana', [], 'tool', 'proficient', 5, 16);
  const sMetabase = await skillAt('Metabase', [], 'tool', 'proficient', 3, 25);
  const sLatex = await skillAt('LaTeX', ['tex', 'tectonic'], 'tool', 'expert', 9, 0);
  const sFigma = await skillAt('Figma', [], 'tool', 'working', 4, 60);
  const sPytest = await skillAt('Pytest', ['pytest'], 'tool', 'expert', 7, 1);
  const sDataModeling = await skillAt('Dimensional Modeling', ['star schema'], 'method', 'proficient', 6, 18);
  const sCi = await skillAt('CI/CD', ['continuous integration'], 'method', 'proficient', 7, 0);
  const sDq = await skillAt('Data Quality Engineering', ['data validation'], 'method', 'expert', 6, 4);
  const sExperiment = await skillAt('Experiment Design', ['ab testing'], 'method', 'proficient', 5, 22);
  const sTechWriting = await skillAt('Technical Writing', ['documentation'], 'method', 'expert', 10, 1);
  const sNlp = await skillAt('Natural Language Processing', ['nlp'], 'domain', 'working', 3, 45);
  const sCv = await skillAt('Computer Vision', ['cv'], 'domain', 'working', 2, 260);
  const sTimeSeries = await skillAt('Time-Series Forecasting', ['forecasting'], 'domain', 'proficient', 5, 35);
  const sGeo = await skillAt('Geospatial Analysis', ['gis'], 'domain', 'working', 3, 130);
  const sSignals = await skillAt('Signal Processing', ['dsp'], 'domain', 'proficient', 4, 28);
  const sSecurity = await skillAt('Application Security', ['appsec'], 'domain', 'working', 4, 110);
  const sMentoring = await skillAt('Mentoring', ['coaching'], 'soft', 'expert', 9, 2);
  const sFacilitation = await skillAt('Workshop Facilitation', ['facilitation'], 'soft', 'proficient', 6, 33);
  const sStakeholder = await skillAt('Stakeholder Management', [], 'soft', 'proficient', 7, 8);
  const sPublicSpeaking = await skillAt('Public Speaking', ['speaking'], 'soft', 'proficient', 6, 130);

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

  // The rest of the employers, schools, communities and counterparties. The
  // industry and size fields exist so the organisation directory can be sorted
  // and filtered by something other than name.
  const orgFull = async (
    title: string,
    domain: string,
    kind: string,
    city: string,
    industry: string,
    size: string,
  ) =>
    (
      await repository.createNode({
        type: 'organization',
        title,
        props: {
          kind,
          domain,
          website: `https://${domain}`,
          industry,
          size_hint: size,
          hq_city: city,
          city,
          linkedin_url: `https://linkedin.com/company/${domain.split('.')[0]}`,
        },
        source: 'manual',
      })
    ).id;

  const zamba = await orgFull('Zamba Logistics', 'zamba.example', 'company', 'Kigali', 'Logistics', '201-500');
  const tembo = await orgFull('Tembo Health', 'tembohealth.example', 'company', 'Kampala', 'Digital health', '51-200');
  const sahara = await orgFull('Sahara Fintech', 'saharafintech.example', 'company', 'Cairo', 'Financial services', '501-1000');
  const nileDelta = await orgFull('Nile Delta Systems', 'niledelta.example', 'company', 'Sohag', 'IT services', '11-50');
  const cairoMetro = await orgFull('Cairo Metro Digital', 'cairometro.example', 'company', 'Cairo', 'Digital agency', '11-50');
  const ubwenge = await orgFull('Ubwenge Labs', 'ubwenge.example', 'company', 'Kigali', 'Applied AI', '11-50');
  const savanna = await orgFull('Savanna Grid', 'savannagrid.example', 'company', 'Nairobi', 'Energy', '201-500');
  const meridianFreight = await orgFull('Meridian Freight', 'meridianfreight.example', 'company', 'Mombasa', 'Shipping', '501-1000');
  const okavango = await orgFull('Okavango Data Collective', 'okavango.example', 'nonprofit', 'Gaborone', 'Open data', '11-50');
  const brightPath = await orgFull('Bright Path Foundation', 'brightpath.example', 'nonprofit', 'Kigali', 'STEM outreach', '11-50');
  const karibu = await orgFull('Karibu Cloud', 'karibucloud.example', 'company', 'Nairobi', 'Cloud infrastructure', '51-200');
  const amani = await orgFull('Amani Robotics', 'amanirobotics.example', 'company', 'Kigali', 'Robotics', '11-50');
  const sokoni = await orgFull('Sokoni Commerce', 'sokoni.example', 'company', 'Dar es Salaam', 'E-commerce', '201-500');
  const lattice = await orgFull('Lattice Bio', 'latticebio.example', 'company', 'Cape Town', 'Biotech', '51-200');
  const ictChamber = await orgFull('Rwanda ICT Chamber', 'ictchamber.example', 'community', 'Kigali', 'Industry body', '11-50');
  const pydataKigali = await orgFull('PyData Kigali', 'pydatakigali.example', 'community', 'Kigali', 'Developer community', '1-10');
  const indabaOrg = await orgFull('Deep Learning Indaba', 'indaba.example', 'community', 'Kigali', 'Research community', '11-50');
  const nileUni = await orgFull('Nile University', 'nileuniversity.example', 'university', 'Cairo', 'Higher learning', '1001-5000');
  const sohagInstitute = await orgFull('Sohag Technical Institute', 'sohagtech.example', 'university', 'Sohag', 'Vocational training', '501-1000');

  // Who owns, partners with, or competes against whom. Nothing here touches
  // Aurora Dynamics: the warm-path assertion depends on Aurora's neighbourhood
  // staying exactly as small as it is.
  const orgRelated = async (src: string, dst: string, kind: string, note: string) =>
    repository.createEdge({ type: 'ORG_RELATED', src, dst, props: { kind, note }, source: 'manual' });
  await orgRelated(zamba, meridianFreight, 'customer', "Zamba moves Meridian's inland freight.");
  await orgRelated(sahara, cairoMetro, 'vendor', 'Cairo Metro built the first payment portal.');
  await orgRelated(savanna, karibu, 'partner', 'Grid telemetry runs on Karibu regions.');
  await orgRelated(ubwenge, amani, 'competitor', 'Both chase the same applied-robotics grants.');
  await orgRelated(nileDelta, sahara, 'subsidiary', "Absorbed into Sahara's field-services arm in 2019.");
  await orgRelated(okavango, ictChamber, 'affiliate', 'Joint open-data policy working group.');

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
  const peerKnows = async (src: string, dst: string, props: Record<string, unknown>) =>
    repository.createEdge({ type: 'KNOWS', src, dst, props, source: 'manual' });
  await knows(priya, { closeness: 4, cadence_target_days: 90, met_via: 'Goodera internship', topics: ['automation', 'referrals'] });
  await knows(fatima, { closeness: 5, cadence_target_days: 30, met_via: 'CMU-Africa research', topics: ['reinforcement learning', 'publications'] });
  await knows(jean, { closeness: 5, cadence_target_days: 14, topics: ['computer vision', 'coursework'] });
  await knows(marc, { closeness: 3, cadence_target_days: 60, met_via: 'Deep Learning Indaba', topics: ['data platforms', 'hiring'], favors: [{ direction: 'owed_to_me', what: 'referral to Aurora', settled: false }] });
  await knows(sara, { closeness: 3, cadence_target_days: 120, topics: ['M&E', 'dashboards'] });
  await knows(omar, { closeness: 2, cadence_target_days: 365, topics: ['inventory system'] });
  await knows(grace, { closeness: 2, cadence_target_days: 60, topics: ['ML engineer role'] });
  await knows(tarek, { closeness: 3, cadence_target_days: 180, met_via: 'DevFest', topics: ['robotics', 'founding'] });
  await peerKnows(jean, marc, {
    relation: 'colleague',
    met_via: 'Deep Learning Indaba',
    topics: ['data platforms', 'machine learning'],
    strength: 0.3,
  });

  // ── The wider network ───────────────────────────────────────────────────────
  //
  // Sixty people is not scale for its own sake. The reachability search, the
  // tie-strength ranking and the reconnect lane all rank one contact against
  // another, and a graph of eight has no ranking to show: every result is on
  // screen at once. What follows is a network with structure - cohorts that
  // overlap, employers that people left, brokers who connect two circles that
  // otherwise never touch - because that is what those algorithms read.
  //
  // Where somebody works is a role node joined to an organisation, never a
  // sentence in a headline. A headline naming an employer looks like an
  // affiliation to a reader and like nothing at all to a query.
  const worksAt = async (
    personId: string,
    roleTitle: string,
    orgId: string,
    startDate: string,
    endDate?: string,
  ) => {
    const r = await repository.createNode({
      type: 'role',
      title: roleTitle,
      props: { employment_type: 'full_time' },
      start_date: startDate,
      ...(endDate ? { end_date: endDate } : { status: 'active' }),
      source: 'manual',
    });
    await repository.createEdge({ type: 'HELD', src: personId, dst: r.id, source: 'manual' });
    await repository.createEdge({ type: 'ROLE_AT', src: r.id, dst: orgId, source: 'manual' });
    return r.id;
  };

  interface ContactSpec {
    name: string;
    headline: string;
    city: string;
    email?: string;
    /** 1-5; feeds the deterministic half of the tie-strength score. */
    closeness: number;
    /** Null means "no cadence expected", which is different from a long one. */
    cadence: number | null;
    relation: string;
    metVia?: string;
    topics: string[];
    /** [role title, organisation, start date, optional end date]. */
    job?: [string, string, string, string?];
    props?: Record<string, unknown>;
    knows?: Record<string, unknown>;
  }

  const contacts: ContactSpec[] = [
    // CMU-Africa: the current cohort, the people Jordan sees every week.
    { name: 'Prof. Elias Mwangi', headline: 'Associate Professor, ECE', city: 'Kigali', email: 'elias@cmu.example', closeness: 4, cadence: 45, relation: 'mentor', metVia: 'Real-Time Embedded Systems course', topics: ['embedded systems', 'grant writing'], job: ['Associate Professor', cmu, '2019-08-01'] },
    { name: 'Dr. Ines Uwase', headline: 'Postdoctoral researcher, low-power sensing', city: 'Kigali', email: 'ines@cmu.example', closeness: 4, cadence: 30, relation: 'colleague', metVia: 'the sensing lab', topics: ['sensor calibration', 'papers'], job: ['Postdoctoral Researcher', cmu, '2024-01-15'] },
    { name: 'Chidinma Eze', headline: 'MSc EAI candidate, applied NLP', city: 'Kigali', closeness: 5, cadence: 14, relation: 'classmate', metVia: 'MSc cohort', topics: ['coursework', 'job search'] },
    { name: 'Kwame Boateng', headline: 'MSc ECE candidate, power systems', city: 'Kigali', closeness: 4, cadence: 21, relation: 'classmate', metVia: 'MSc cohort', topics: ['coursework', 'hardware'] },
    { name: 'Aline Ingabire', headline: 'MSc ECE candidate, signal processing', city: 'Kigali', closeness: 4, cadence: 21, relation: 'classmate', metVia: 'Signal Processing lab', topics: ['DSP', 'study group'] },
    { name: 'Nadia Belkacem', headline: 'MSc EAI candidate, speech systems', city: 'Kigali', closeness: 3, cadence: 45, relation: 'classmate', metVia: 'MSc cohort', topics: ['speech corpora', 'Kinyarwanda ASR'] },
    { name: 'Samuel Kiptoo', headline: 'PhD candidate, field robotics', city: 'Kigali', closeness: 3, cadence: 60, relation: 'colleague', metVia: 'robotics reading group', topics: ['robotics', 'field trials'] },
    { name: 'Beatrice Mukamana', headline: 'Programme manager, graduate studies', city: 'Kigali', email: 'beatrice@cmu.example', closeness: 2, cadence: 120, relation: 'acquaintance', metVia: 'admissions', topics: ['funding', 'paperwork'], job: ['Programme Manager', cmu, '2021-03-01'] },

    // ALU: the undergraduate cohort, now scattered across four countries.
    { name: 'Thabo Nkosi', headline: 'Backend engineer, payments', city: 'Johannesburg', email: 'thabo@sokoni.example', closeness: 4, cadence: 60, relation: 'classmate', metVia: 'ALU capstone team', topics: ['backend', 'payments'], job: ['Backend Engineer', sokoni, '2024-06-01'] },
    { name: 'Zainab Adeyemi', headline: 'Associate product manager', city: 'Lagos', closeness: 3, cadence: 90, relation: 'classmate', metVia: 'ALU capstone team', topics: ['product', 'discovery'], job: ['Associate Product Manager', sokoni, '2024-09-01'] },
    { name: 'Emmanuel Rukundo', headline: 'Security engineer', city: 'Kigali', email: 'emmanuel@ubwenge.example', closeness: 4, cadence: 45, relation: 'friend', metVia: 'ALU security club', topics: ['appsec', 'CTFs'], job: ['Security Engineer', ubwenge, '2024-02-01'] },
    { name: 'Lulu Chirwa', headline: 'Learning coach, computer science', city: 'Kigali', closeness: 3, cadence: 180, relation: 'mentor', metVia: 'ALU', topics: ['teaching', 'curriculum'], job: ['Learning Coach', alu, '2020-01-06'] },
    { name: 'Dan Kigozi', headline: 'Founder, logistics tooling', city: 'Kampala', email: 'dan@zamba.example', closeness: 3, cadence: 90, relation: 'friend', metVia: 'ALU entrepreneurship track', topics: ['founding', 'logistics'] },

    // Sahara Fintech and the Egyptian years: the strongest professional ties,
    // and the ones that have had five years to go quiet.
    { name: 'Yasmine Farouk', headline: 'Engineering manager, core banking', city: 'Cairo', email: 'yasmine@saharafintech.example', closeness: 5, cadence: 90, relation: 'mentor', metVia: 'my manager at Sahara Fintech', topics: ['leadership', 'references', 'career'], job: ['Engineering Manager', sahara, '2016-01-01'], knows: { favors: [{ direction: 'owed_by_me', what: 'wrote my graduate school reference', settled: true }] } },
    { name: 'Hossam Ragab', headline: 'Technical lead, ledger services', city: 'Cairo', email: 'hossam@saharafintech.example', closeness: 4, cadence: 120, relation: 'colleague', metVia: 'the reconciliation rewrite', topics: ['distributed systems', 'reconciliation'], job: ['Technical Lead', sahara, '2015-05-01'] },
    { name: 'Mina Guirguis', headline: 'QA lead', city: 'Cairo', closeness: 3, cadence: 180, relation: 'colleague', metVia: 'Cairo Metro Digital', topics: ['testing', 'release process'], job: ['QA Lead', cairoMetro, '2014-02-01'] },
    { name: 'Ahmed Sobhy', headline: 'Founder and managing director', city: 'Sohag', email: 'ahmed@niledelta.example', closeness: 3, cadence: 365, relation: 'mentor', metVia: 'my first employer', topics: ['field services', 'small business'], job: ['Managing Director', nileDelta, '2008-04-01'] },
    { name: 'Rania Mostafa', headline: 'Product owner, public sector', city: 'Cairo', closeness: 2, cadence: 365, relation: 'colleague', metVia: 'Cairo Metro Digital', topics: ['public sector delivery'], job: ['Product Owner', cairoMetro, '2015-09-01'] },

    // Savanna Grid and the Nairobi year.
    { name: 'Peter Njoroge', headline: 'Senior data engineer, grid telemetry', city: 'Nairobi', email: 'peter@savannagrid.example', closeness: 4, cadence: 60, relation: 'colleague', metVia: 'Savanna Grid data team', topics: ['streaming', 'telemetry', 'hiring'], job: ['Senior Data Engineer', savanna, '2019-11-01'] },
    { name: 'Lilian Wanjiru', headline: 'Analytics lead', city: 'Nairobi', email: 'lilian@savannagrid.example', closeness: 3, cadence: 90, relation: 'colleague', metVia: 'Savanna Grid', topics: ['analytics', 'forecasting'], job: ['Analytics Lead', savanna, '2020-07-01'] },
    { name: 'Bernard Oduya', headline: 'Talent partner, engineering', city: 'Nairobi', email: 'bernard@savannagrid.example', closeness: 2, cadence: 120, relation: 'acquaintance', metVia: 'cold outreach', topics: ['roles', 'hiring'], job: ['Talent Partner', savanna, '2022-04-01'] },

    // The current job search: the people on the other side of the table.
    { name: 'Josephine Uwera', headline: 'Chief technology officer', city: 'Kigali', email: 'josephine@zamba.example', closeness: 3, cadence: 45, relation: 'acquaintance', metVia: 'Rwanda ICT Chamber panel', topics: ['data platforms', 'hiring'], job: ['Chief Technology Officer', zamba, '2022-08-01'] },
    { name: 'Miriam Kayitesi', headline: 'Hiring manager, data platform', city: 'Kigali', email: 'miriam@zamba.example', closeness: 2, cadence: 30, relation: 'acquaintance', metVia: 'Zamba screening call', topics: ['the platform role'], job: ['Engineering Manager', zamba, '2023-01-09'] },
    { name: 'Felix Mugisha', headline: 'Platform engineer', city: 'Kigali', email: 'felix@zamba.example', closeness: 3, cadence: 60, relation: 'colleague', metVia: 'contract work at Zamba', topics: ['Airflow', 'on-call'], job: ['Platform Engineer', zamba, '2023-05-15'] },
    { name: 'Halima Yusuf', headline: 'Recruiter, clinical platforms', city: 'Kampala', email: 'halima@tembohealth.example', closeness: 2, cadence: 60, relation: 'acquaintance', metVia: 'inbound message', topics: ['the lead role'], job: ['Recruiter', tembo, '2024-03-01'] },
    { name: 'Doreen Atim', headline: 'Head of operations', city: 'Kampala', email: 'doreen@tembohealth.example', closeness: 2, cadence: 90, relation: 'acquaintance', metVia: 'Tembo interview loop', topics: ['cold chain', 'field data'], job: ['Head of Operations', tembo, '2021-06-01'] },
    { name: 'Vera Nsengiyumva', headline: 'Head of people', city: 'Kigali', email: 'vera@ubwenge.example', closeness: 2, cadence: 90, relation: 'acquaintance', metVia: 'Ubwenge open day', topics: ['culture', 'roles'], job: ['Head of People', ubwenge, '2022-11-01'] },
    { name: 'Gideon Otieno', headline: 'Technical recruiter, agency side', city: 'Nairobi', closeness: 1, cadence: null, relation: 'acquaintance', metVia: 'unsolicited email', topics: ['roles'] },
    { name: 'Paulo Mendes', headline: 'Engineering director, computational biology', city: 'Cape Town', email: 'paulo@latticebio.example', closeness: 2, cadence: 120, relation: 'acquaintance', metVia: 'Indaba poster session', topics: ['pipelines', 'research engineering'], job: ['Engineering Director', lattice, '2020-02-01'] },

    // The community: bursts around conferences, quiet in between.
    { name: 'Wanjiku Kamau', headline: 'Organiser, PyData Kigali', city: 'Kigali', email: 'wanjiku@pydatakigali.example', closeness: 4, cadence: 60, relation: 'friend', metVia: 'PyData Kigali', topics: ['community', 'speaking'] },
    { name: 'Tunde Bakare', headline: 'Organiser, research community', city: 'Lagos', email: 'tunde@indaba.example', closeness: 3, cadence: 120, relation: 'acquaintance', metVia: 'Deep Learning Indaba', topics: ['community', 'travel grants'] },
    { name: 'Sofia Almeida', headline: 'ML engineer, protein pipelines', city: 'Cape Town', closeness: 3, cadence: 90, relation: 'friend', metVia: 'Indaba poster session', topics: ['pipelines', 'reproducibility'], job: ['ML Engineer, Protein Pipelines', lattice, '2023-03-01'] },
    { name: 'Hakim Diallo', headline: 'Developer relations', city: 'Nairobi', email: 'hakim@karibucloud.example', closeness: 3, cadence: 90, relation: 'friend', metVia: 'DevFest', topics: ['cloud', 'talks'], job: ['Developer Advocate', karibu, '2022-01-10'] },
    { name: 'Aisha Bello', headline: 'Robotics researcher', city: 'Kigali', email: 'aisha@amanirobotics.example', closeness: 3, cadence: 90, relation: 'colleague', metVia: 'robotics reading group', topics: ['robotics', 'control'], job: ['Research Engineer', amani, '2023-09-01'] },
    { name: 'Michel Habyarimana', headline: 'Founder, applied AI studio', city: 'Kigali', email: 'michel@ubwenge.example', closeness: 3, cadence: 90, relation: 'acquaintance', metVia: 'Rwanda ICT Chamber', topics: ['founding', 'consulting'] },
    { name: 'Clarisse Umutoni', headline: 'Community manager', city: 'Kigali', closeness: 2, cadence: 180, relation: 'acquaintance', metVia: 'Rwanda ICT Chamber', topics: ['events', 'policy'], job: ['Community Manager', ictChamber, '2021-09-01'] },
    { name: 'Yohannes Tesfaye', headline: 'Data journalist', city: 'Addis Ababa', closeness: 2, cadence: 180, relation: 'acquaintance', metVia: 'open-data workshop', topics: ['open data', 'storytelling'] },
    { name: 'Amara Okafor', headline: 'Software engineer, marketplace', city: 'Dar es Salaam', closeness: 2, cadence: 180, relation: 'acquaintance', metVia: 'PyData Kigali', topics: ['Python', 'marketplaces'], job: ['Software Engineer', sokoni, '2022-05-01'] },
    { name: 'Ibrahim Toure', headline: 'Data scientist, open data', city: 'Gaborone', email: 'ibrahim@okavango.example', closeness: 3, cadence: 120, relation: 'colleague', metVia: 'the freelance contract', topics: ['open data', 'geospatial'], job: ['Data Scientist', okavango, '2020-10-01'] },
    { name: 'Naledi Motsepe', headline: 'Executive director', city: 'Gaborone', email: 'naledi@okavango.example', closeness: 3, cadence: 180, relation: 'colleague', metVia: 'the freelance contract', topics: ['funding', 'open data'], job: ['Executive Director', okavango, '2018-01-15'] },
    { name: 'Prisca Nyirahabimana', headline: 'Secondary school teacher, STEM club', city: 'Kigali', closeness: 3, cadence: 90, relation: 'colleague', metVia: 'the mentoring programme', topics: ['outreach', 'curriculum'], job: ['Programme Coordinator', brightPath, '2021-02-01'] },

    // Life outside work. These carry no employer and no professional topic,
    // which is the point: a life graph that only holds colleagues is a CRM.
    { name: 'Min-seo Kim', headline: 'Architect', city: 'Seoul', closeness: 5, cadence: 21, relation: 'sibling', topics: ['family'] },
    { name: 'Dae-ho Kim', headline: 'Retired civil engineer', city: 'Seoul', closeness: 5, cadence: 14, relation: 'parent', topics: ['family'] },
    { name: 'Hana Kim', headline: 'Retired pharmacist', city: 'Seoul', closeness: 5, cadence: 14, relation: 'parent', topics: ['family'] },
    { name: 'Bruno Iradukunda', headline: 'Physiotherapist', city: 'Kigali', closeness: 5, cadence: 14, relation: 'friend', metVia: 'the running club', topics: ['running', 'weekends'] },
    { name: 'Sandrine Mukashema', headline: 'Veterinarian', city: 'Kigali', closeness: 4, cadence: 30, relation: 'friend', metVia: 'the running club', topics: ['running', 'hiking'] },
    { name: 'Olivier Bizimana', headline: 'Coach, Kigali runners', city: 'Kigali', closeness: 3, cadence: 30, relation: 'acquaintance', metVia: 'the running club', topics: ['training plans'] },
    { name: 'Alice Nyiramana', headline: 'Neighbour, Kimihurura', city: 'Kigali', closeness: 3, cadence: 60, relation: 'neighbor', topics: ['the building', 'power cuts'] },
    { name: 'Eric Nshuti', headline: 'Landlord', city: 'Kigali', closeness: 1, cadence: 365, relation: 'other', topics: ['the lease'] },
    { name: 'Dr. Claudine Mukamurenzi', headline: 'General practitioner', city: 'Kigali', closeness: 2, cadence: 365, relation: 'other', topics: ['annual check-up'] },
  ];

  const people = new Map<string, string>();
  for (const c of contacts) {
    const id = await person(c.name, {
      headline: c.headline,
      city: c.city,
      ...(c.email ? { emails: [c.email] } : {}),
      ...(c.props ?? {}),
    });
    people.set(c.name, id);
    await knows(id, {
      closeness: c.closeness,
      cadence_target_days: c.cadence,
      relation: c.relation,
      ...(c.metVia ? { met_via: c.metVia } : {}),
      topics: c.topics,
      ...(c.knows ?? {}),
    });
    if (c.job) await worksAt(id, c.job[0], c.job[1], c.job[2], c.job[3]);
  }
  /** Look a seeded contact up by name; throws rather than silently seeding an edge to nothing. */
  const who = (name: string) => {
    const id = people.get(name);
    if (!id) throw new Error(`seed-demo: no contact named ${name}`);
    return id;
  };

  // Two records that exist to be worked on rather than read. A placeholder is
  // what the capture flow leaves behind when a name is known and nothing else
  // is; do-not-contact is a standing instruction the outreach ranking has to
  // honour, and it can only be seen to honour it if somebody carries the flag.
  const panelPlaceholder = await person('Zamba panel (second interviewer)', {
    headline: 'Name not caught on the call',
    is_placeholder: true,
  });
  await knows(panelPlaceholder, { closeness: 1, cadence_target_days: null, relation: 'other', topics: ['interview loop'] });
  const victor = await person('Victor Rukara', {
    headline: 'Former contractor',
    city: 'Kigali',
    do_not_contact: true,
  });
  await knows(victor, {
    closeness: 1,
    cadence_target_days: null,
    relation: 'other',
    do_not_ping: true,
    topics: ['closed contract'],
  });

  // A near-duplicate pair for the identity screen to find. Two spellings of one
  // person is the ordinary way a graph gets dirty: a card scan and a typed
  // note, months apart, neither wrong.
  const adaezeA = await person('Adaeze Okonkwo', {
    headline: 'Data engineer, marketplace analytics',
    city: 'Lagos',
    emails: ['adaeze@sokoni.example'],
  });
  const adaezeB = await person('Adaeze N. Okonkwo', {
    headline: 'Data engineer',
    city: 'Lagos',
    emails: ['adaeze@sokoni.example'],
  });
  await knows(adaezeA, { closeness: 2, cadence_target_days: 180, relation: 'acquaintance', topics: ['analytics'] });
  await knows(adaezeB, { closeness: 2, cadence_target_days: 180, relation: 'acquaintance', topics: ['analytics'] });

  // These four were written by hand rather than from the table above, so they
  // are registered here: `who()` throws on a missing name, and a lookup that
  // silently returned nothing would seed an interview with no interviewer.
  people.set('Zamba panel (second interviewer)', panelPlaceholder);
  people.set('Victor Rukara', victor);
  people.set('Adaeze Okonkwo', adaezeA);
  people.set('Adaeze N. Okonkwo', adaezeB);

  // Peer-to-peer ties. Deliberately none of these touch Marc Uwimana or
  // Jean-Paul Habimana: the warm-path spec asserts that the first multi-hop
  // route to Aurora Dynamics is Jean-Paul → Marc, and the ranking is a product
  // of edge strengths, so a stronger tie into either of them would displace it.
  const peers: Array<[string, string, string, number, string]> = [
    ['Chidinma Eze', 'Kwame Boateng', 'classmate', 0.6, 'MSc cohort'],
    ['Chidinma Eze', 'Nadia Belkacem', 'classmate', 0.55, 'MSc cohort'],
    ['Kwame Boateng', 'Aline Ingabire', 'classmate', 0.5, 'study group'],
    ['Prof. Elias Mwangi', 'Dr. Ines Uwase', 'colleague', 0.7, 'the sensing lab'],
    ['Prof. Elias Mwangi', 'Samuel Kiptoo', 'mentor', 0.6, 'doctoral supervision'],
    ['Yasmine Farouk', 'Hossam Ragab', 'colleague', 0.65, 'Sahara Fintech'],
    ['Yasmine Farouk', 'Ahmed Sobhy', 'acquaintance', 0.3, 'the Nile Delta acquisition'],
    ['Hossam Ragab', 'Mina Guirguis', 'colleague', 0.4, 'the payment portal'],
    ['Peter Njoroge', 'Lilian Wanjiru', 'colleague', 0.6, 'Savanna Grid'],
    ['Peter Njoroge', 'Bernard Oduya', 'colleague', 0.35, 'Savanna Grid'],
    ['Josephine Uwera', 'Miriam Kayitesi', 'colleague', 0.7, 'Zamba Logistics'],
    ['Miriam Kayitesi', 'Felix Mugisha', 'colleague', 0.55, 'Zamba Logistics'],
    ['Josephine Uwera', 'Dan Kigozi', 'friend', 0.45, 'the logistics founders circle'],
    ['Wanjiku Kamau', 'Hakim Diallo', 'friend', 0.5, 'PyData Kigali'],
    ['Wanjiku Kamau', 'Amara Okafor', 'acquaintance', 0.3, 'PyData Kigali'],
    ['Tunde Bakare', 'Sofia Almeida', 'colleague', 0.5, 'Deep Learning Indaba'],
    ['Sofia Almeida', 'Paulo Mendes', 'colleague', 0.65, 'Lattice Bio'],
    ['Michel Habyarimana', 'Vera Nsengiyumva', 'colleague', 0.6, 'Ubwenge Labs'],
    ['Michel Habyarimana', 'Emmanuel Rukundo', 'colleague', 0.5, 'Ubwenge Labs'],
    ['Clarisse Umutoni', 'Michel Habyarimana', 'acquaintance', 0.35, 'Rwanda ICT Chamber'],
    ['Ibrahim Toure', 'Naledi Motsepe', 'colleague', 0.7, 'Okavango Data Collective'],
    ['Ibrahim Toure', 'Yohannes Tesfaye', 'acquaintance', 0.3, 'the open-data workshop'],
    ['Thabo Nkosi', 'Zainab Adeyemi', 'colleague', 0.6, 'ALU capstone team'],
    ['Thabo Nkosi', 'Amara Okafor', 'colleague', 0.45, 'Sokoni Commerce'],
    ['Lulu Chirwa', 'Thabo Nkosi', 'mentor', 0.4, 'ALU'],
    ['Aisha Bello', 'Samuel Kiptoo', 'colleague', 0.5, 'robotics reading group'],
    ['Doreen Atim', 'Halima Yusuf', 'colleague', 0.55, 'Tembo Health'],
    ['Bruno Iradukunda', 'Sandrine Mukashema', 'friend', 0.7, 'the running club'],
    ['Bruno Iradukunda', 'Olivier Bizimana', 'friend', 0.5, 'the running club'],
    ['Min-seo Kim', 'Dae-ho Kim', 'family', 0.9, 'family'],
    ['Min-seo Kim', 'Hana Kim', 'family', 0.9, 'family'],
  ];
  for (const [a, b, relation, strength, metVia] of peers) {
    await peerKnows(who(a), who(b), { relation, strength, met_via: metVia, topics: [] });
  }

  // Who reports to whom, where Jordan has actually seen the org chart. Two
  // lines, not twenty: this is a personal graph, and a complete hierarchy would
  // be a claim to knowledge nobody outside the company has.
  const reportsTo = async (src: string, dst: string, note: string) =>
    repository.createEdge({ type: 'REPORTS_TO', src, dst, notes_md: note, source: 'manual' });
  await reportsTo(who('Hossam Ragab'), who('Yasmine Farouk'), 'Told to me directly during the reconciliation rewrite.');
  await reportsTo(who('Felix Mugisha'), who('Miriam Kayitesi'), 'Visible from the contract standups.');
  await reportsTo(who('Sofia Almeida'), who('Paulo Mendes'), 'Named on the Lattice Bio poster.');

  // Founders, memberships, follows: three different kinds of affiliation that a
  // single ROLE_AT edge would flatten into one.
  await repository.createEdge({ type: 'FOUNDED', src: who('Michel Habyarimana'), dst: ubwenge, source: 'manual' });
  await repository.createEdge({ type: 'FOUNDED', src: who('Ahmed Sobhy'), dst: nileDelta, source: 'manual' });
  await repository.createEdge({ type: 'FOUNDED', src: who('Dan Kigozi'), dst: zamba, source: 'manual' });
  for (const [name, orgId, role] of [
    ['Wanjiku Kamau', pydataKigali, 'organiser'],
    ['Tunde Bakare', indabaOrg, 'organiser'],
    ['Hakim Diallo', pydataKigali, 'member'],
    ['Clarisse Umutoni', ictChamber, 'staff'],
    ['Emmanuel Rukundo', pydataKigali, 'member'],
  ] as Array<[string, string, string]>) {
    await repository.createEdge({ type: 'MEMBER_OF', src: who(name), dst: orgId, props: { role }, source: 'manual' });
  }
  await repository.createEdge({ type: 'MEMBER_OF', src: self.id, dst: pydataKigali, props: { role: 'member' }, source: 'manual' });
  await repository.createEdge({ type: 'MEMBER_OF', src: self.id, dst: indabaOrg, props: { role: 'attendee' }, source: 'manual' });
  for (const orgId of [zamba, tembo, lattice, karibu, ubwenge, savanna]) {
    await repository.createEdge({ type: 'FOLLOWS', src: self.id, dst: orgId, source: 'manual' });
  }
  await repository.createEdge({ type: 'FOLLOWS', src: self.id, dst: who('Yasmine Farouk'), source: 'manual' });
  await repository.createEdge({ type: 'STUDIED_AT', src: self.id, dst: cmu, source: 'manual' });
  await repository.createEdge({ type: 'STUDIED_AT', src: self.id, dst: alu, source: 'manual' });
  await repository.createEdge({ type: 'STUDIED_AT', src: self.id, dst: sohagInstitute, source: 'manual' });
  await repository.createEdge({ type: 'STUDIED_AT', src: who('Kwame Boateng'), dst: cmu, source: 'manual' });

  // Introductions as facts rather than as a sentence in `met_via`. The rollup
  // counts these separately for exactly that reason: one is a record, the other
  // is a memory.
  const introduced = async (dst: string, via: string, agoDays: number, context: string) =>
    repository.createEdge({
      type: 'INTRODUCED',
      src: self.id,
      dst,
      props: { via, occurred_on: dateAgo(agoDays), context },
      source: 'manual',
    });
  await introduced(who('Josephine Uwera'), who('Michel Habyarimana'), 200, 'Michel walked me over at the ICT Chamber panel.');
  await introduced(who('Paulo Mendes'), who('Sofia Almeida'), 320, 'Sofia introduced me at her poster.');
  await introduced(who('Miriam Kayitesi'), who('Josephine Uwera'), 96, 'Josephine passed my name to her hiring manager.');
  await introduced(who('Halima Yusuf'), who('Doreen Atim'), 74, 'Doreen forwarded my note to the recruiter.');
  await introduced(who('Peter Njoroge'), who('Lilian Wanjiru'), 900, 'Lilian introduced me on my first week at Savanna Grid.');

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

  const marcRole = await repository.createNode({
    type: 'role',
    title: 'Data Platform Lead',
    subtitle: 'Aurora Dynamics · Data Platform',
    props: {
      employment_type: 'full_time',
      seniority: 'lead',
      team: 'Data Platform',
      tech_stack: ['Python', 'PostgreSQL'],
    },
    start_date: '2024-01-01',
    status: 'active',
    source: 'manual',
  });
  await repository.createEdge({ type: 'HELD', src: marc, dst: marcRole.id, source: 'manual' });
  await repository.createEdge({ type: 'ROLE_AT', src: marcRole.id, dst: aurora, source: 'manual' });

  for (const [rid, skills] of [
    [rNia, [sPy, sEtl, sViz]],
    [rNaser, [sDjango, sPostgres]],
    [rGoodera, [sPy, sScraping]],
    [rCmuRa, [sPyTorch, sRl]],
  ] as Array<[string, string[]]>) {
    for (const s of skills) await repository.createEdge({ type: 'USES_SKILL', src: rid, dst: s, source: 'manual' });
  }

  // ── The rest of the career ──────────────────────────────────────────────────
  //
  // The four roles above are the graduate years. They are not a career, and a
  // timeline that starts in 2022 cannot show a progression, a promotion inside
  // one employer, a gap, or a change of country - all of which the résumé
  // engine and the timeline lanes exist to render. The eight below run back to
  // 2012: a technician's job in Sohag, an agency, six years in Cairo fintech
  // ending as a senior engineer, a year in Nairobi, then the return to study
  // that the internships belong to.
  const career = async (
    title: string,
    subtitle: string,
    orgId: string,
    location: string,
    employmentType: string,
    start: string,
    end: string | null,
    skillIds: string[],
    extra: Record<string, unknown> = {},
  ) => {
    const r = await repository.createNode({
      type: 'role',
      title,
      subtitle,
      props: { employment_type: employmentType, location, ...extra },
      start_date: start,
      ...(end ? { end_date: end } : { status: 'active' }),
      source: 'manual',
    });
    await repository.createEdge({ type: 'HELD', src: self.id, dst: r.id, source: 'manual' });
    await repository.createEdge({ type: 'ROLE_AT', src: r.id, dst: orgId, source: 'manual' });
    for (const s of skillIds) {
      await repository.createEdge({ type: 'USES_SKILL', src: r.id, dst: s, source: 'manual' });
    }
    return r.id;
  };

  const rTech = await career(
    'IT Support Technician', 'Nile Delta Systems · Field services', nileDelta, 'Sohag, Egypt',
    'full_time', '2012-07-01', '2014-08-15', [sLinux, sBash, sSql],
    { seniority: 'junior', location_mode: 'onsite', city: 'Sohag', tech_stack: ['Linux', 'Bash', 'MySQL'], reason_left: 'Moved to Cairo for agency work.' },
  );
  const rJunior = await career(
    'Junior Web Developer', 'Cairo Metro Digital · Client delivery', cairoMetro, 'Cairo, Egypt',
    'full_time', '2014-09-01', '2016-11-30', [sPhp, sLaravel, sSql, sJs],
    { seniority: 'junior', team: 'Client delivery', location_mode: 'onsite', city: 'Cairo', tech_stack: ['PHP', 'Laravel', 'MySQL', 'jQuery'], reason_left: 'Wanted product work instead of agency work.' },
  );
  const rSwe = await career(
    'Software Engineer', 'Sahara Fintech · Ledger services', sahara, 'Cairo, Egypt',
    'full_time', '2016-12-01', '2019-05-31', [sPy, sPostgres, sRedis, sCi],
    { seniority: 'mid', team: 'Ledger services', location_mode: 'onsite', city: 'Cairo', tech_stack: ['Python', 'PostgreSQL', 'Redis', 'Celery'] },
  );
  const rSenior = await career(
    'Senior Software Engineer', 'Sahara Fintech · Ledger services', sahara, 'Cairo, Egypt',
    'full_time', '2019-06-01', '2021-01-31', [sPy, sPostgres, sKafka, sSecurity, sMentoring],
    {
      seniority: 'senior', team: 'Ledger services', location_mode: 'hybrid', city: 'Cairo',
      tech_stack: ['Python', 'PostgreSQL', 'Kafka', 'Docker'],
      reason_left: 'Relocated to Kigali; the team had no remote track.',
      comp: { currency: 'EGP', base: 480_000, notes: 'Senior band, Cairo office.' },
    },
  );
  const rGrid = await career(
    'Data Engineer', 'Savanna Grid · Telemetry platform', savanna, 'Remote (Kenya)',
    'full_time', '2021-02-01', '2022-01-31', [sPy, sSpark, sAirflow, sTimeSeries, sGcp],
    { seniority: 'mid', team: 'Telemetry platform', location_mode: 'remote', tech_stack: ['Python', 'Airflow', 'Spark', 'BigQuery'], reason_left: 'Started the degree full time.' },
  );
  const rFreelance = await career(
    'Freelance Data Consultant', 'Okavango Data Collective · Open data programme', okavango, 'Remote (Botswana)',
    'freelance', '2022-09-01', '2023-03-31', [sPy, sGeo, sViz, sStakeholder],
    { seniority: 'mid', location_mode: 'remote', tech_stack: ['Python', 'GeoPandas', 'Metabase'] },
  );
  const rMentor = await career(
    'Volunteer STEM Mentor', 'Bright Path Foundation · Saturday club', brightPath, 'Kigali, Rwanda',
    'volunteer', '2023-05-06', null, [sMentoring, sFacilitation, sPy],
    { location_mode: 'onsite', city: 'Kigali', tech_stack: ['Python', 'micro:bit'] },
  );
  const rZamba = await career(
    'Data Engineer (contract)', 'Zamba Logistics · Fleet data', zamba, 'Kigali, Rwanda',
    'contract', '2025-02-03', '2025-12-19', [sPy, sAirflow, sDbt, sDuck, sDq],
    { seniority: 'senior', team: 'Fleet data', location_mode: 'hybrid', city: 'Kigali', tech_stack: ['Python', 'Airflow', 'dbt', 'DuckDB'] },
  );

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

  // Everything shipped for an employer, plus the side work that outlived it.
  // A project is joined to the role or the organisation it belongs to, so the
  // graph can answer "what did this job actually produce" without the reader
  // matching dates by eye.
  const workProject = async (
    title: string,
    props: Record<string, unknown>,
    start: string,
    end: string | undefined,
    involvement: 'led' | 'core' | 'contributor' | 'advisor',
    belongsTo?: string,
  ) => {
    const p = await repository.createNode({
      type: 'project',
      title,
      props,
      start_date: start,
      ...(end ? { end_date: end } : {}),
      source: 'manual',
    });
    await repository.createEdge({ type: 'WORKED_ON', src: self.id, dst: p.id, props: { involvement }, source: 'manual' });
    if (belongsTo) await repository.createEdge({ type: 'PART_OF', src: p.id, dst: belongsTo, source: 'manual' });
    return p.id;
  };

  const pReconcile = await workProject('Payment Reconciliation Engine', { kind: 'work', my_role: 'tech lead', status: 'done', outcome: 'Replaced a nightly spreadsheet close with a deterministic matcher running in minutes.' }, '2017-03-01', '2018-06-30', 'led', rSwe);
  const pOcr = await workProject('Arabic Invoice OCR Pipeline', { kind: 'work', my_role: 'developer', status: 'done', outcome: 'Digitised supplier invoices for the field-services desk.' }, '2016-01-10', '2016-10-28', 'core', rJunior);
  const pFraud = await workProject('Transaction Anomaly Screening', { kind: 'work', my_role: 'engineer', status: 'done', outcome: 'Streaming rules engine flagging suspect ledger movements in near real time.' }, '2019-09-01', '2020-11-30', 'led', rSenior);
  const pGridForecast = await workProject('Grid Load Forecasting Service', { kind: 'work', my_role: 'data engineer', status: 'done', outcome: 'Day-ahead demand forecasts feeding the dispatch desk.' }, '2021-04-01', '2021-12-15', 'core', rGrid);
  const pFleet = await workProject('Fleet Telemetry Ingestion', { kind: 'work', my_role: 'contractor', status: 'done', outcome: 'One ingestion path for four telematics vendors, with per-vendor validation.' }, '2025-03-01', '2025-11-30', 'led', rZamba);
  const pColdChain = await workProject('Cold-Chain Sensor Monitoring', { kind: 'work', my_role: 'consultant', status: 'paused', outcome: 'Vaccine-fridge excursions detected from cheap sensors, piloted in two districts.' }, '2024-04-01', undefined, 'advisor', tembo);
  const pOpenBus = await workProject('Open Bus-Route Dataset', { kind: 'oss', my_role: 'maintainer', status: 'active', outcome: 'A cleaned, versioned dataset of Kigali bus routes anyone can query.', url: 'https://github.com/jordan-demo/open-bus-routes' }, '2023-06-01', undefined, 'led');
  const pGeoAtlas = await workProject('District Indicator Atlas', { kind: 'work', my_role: 'consultant', status: 'done', outcome: "Open indicators mapped to district boundaries for the collective's partners." }, '2022-10-01', '2023-03-15', 'led', rFreelance);
  const pSpeech = await workProject('Kinyarwanda Speech Corpus', { kind: 'research', my_role: 'co-investigator', status: 'active', outcome: 'A permissively licensed read-speech corpus for low-resource recognition.' }, '2025-09-01', undefined, 'core', cmu);
  const pEnergy = await workProject('Household Energy Dashboard', { kind: 'personal', my_role: 'creator', status: 'done', outcome: 'A year of meter readings turned into a bill-forecasting page.' }, '2021-08-01', '2022-02-28', 'led');
  const pCalibrator = await workProject('Line-Model Calibrator', { kind: 'personal', my_role: 'creator', status: 'active', outcome: 'Fits characters-per-line from compiled PDFs so page estimates stop guessing.' }, '2026-03-01', undefined, 'led');
  const pClub = await workProject('Saturday Coding Club Curriculum', { kind: 'personal', my_role: 'author', status: 'active', outcome: 'Twelve weeks of Python and micro:bit material, taught and revised twice.' }, '2023-05-06', undefined, 'led', rMentor);

  const repoAt = async (
    title: string,
    fullName: string,
    lang: string,
    desc: string,
    stars: number,
    topics: string[],
    projectId?: string,
    isPrivate = false,
  ) => {
    const r = await repository.createNode({
      type: 'repository',
      title,
      props: {
        host: 'github',
        full_name: fullName,
        url: `https://github.com/${fullName}`,
        primary_language: lang,
        languages: { [lang]: 78, Python: 12, Shell: 10 },
        stars,
        forks: Math.max(0, Math.round(stars / 4)),
        is_private: isPrivate,
        topics,
        description: desc,
        default_branch: 'main',
        last_synced_at: daysAgo(1),
      },
      source: 'import_github',
    });
    if (projectId) await repository.createEdge({ type: 'PART_OF', src: r.id, dst: projectId, source: 'manual' });
    return r.id;
  };
  await repoAt('open-bus-routes', 'jordan-demo/open-bus-routes', 'Python', 'Cleaned, versioned Kigali bus-route dataset with a loader.', 184, ['open-data', 'geospatial'], pOpenBus);
  await repoAt('line-model-calibrator', 'jordan-demo/line-model-calibrator', 'Python', 'Fits chars-per-line and lines-per-page from compiled PDFs.', 31, ['latex', 'typesetting'], pCalibrator);
  await repoAt('kinyarwanda-corpus-tools', 'jordan-demo/kinyarwanda-corpus-tools', 'Python', 'Recording, alignment and QA tooling for a read-speech corpus.', 47, ['speech', 'low-resource'], pSpeech);
  await repoAt('fleet-ingest', 'jordan-demo/fleet-ingest', 'Python', 'Vendor-agnostic telematics ingestion with per-vendor validation.', 0, ['airflow', 'etl'], pFleet, true);
  await repoAt('energy-dash', 'jordan-demo/energy-dash', 'TypeScript', 'Household meter readings, bill forecasting, and one very stubborn chart.', 12, ['dashboards'], pEnergy);
  await repoAt('dotfiles', 'jordan-demo/dotfiles', 'Shell', 'Twelve years of accumulated shell, editor and tmux settings.', 8, ['dotfiles'], undefined);
  await repoAt('advent-of-code', 'jordan-demo/advent-of-code', 'Python', 'Solutions, mostly written on trains.', 3, ['puzzles'], undefined);
  await repoAt('coding-club-kits', 'jordan-demo/coding-club-kits', 'Python', 'Saturday club worksheets and micro:bit starter projects.', 26, ['teaching'], pClub);
  await repoAt('reconciler', 'jordan-demo/reconciler', 'Python', 'The matcher from the reconciliation rewrite, re-implemented in the open.', 63, ['fintech', 'ledger'], pReconcile);

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

  // The qualification the career actually started from. Leaving it out made the
  // 2012 technician job look like it arrived from nowhere.
  const diploma = await repository.createNode({
    type: 'education',
    title: 'Diploma, Information Technology',
    subtitle: 'Sohag Technical Institute',
    props: {
      degree: 'Diploma in Information Technology',
      field_of_study: 'Information Technology',
      gpa: 3.2,
      honors: 'Graduated second in cohort',
      coursework: ['Networking', 'Operating Systems', 'Database Fundamentals', 'Electronics'],
    },
    start_date: '2010-09-15',
    end_date: '2012-06-30',
    source: 'manual',
  });
  await repository.createEdge({ type: 'ATTENDED', src: self.id, dst: diploma.id, source: 'manual' });
  await repository.createEdge({ type: 'PART_OF', src: diploma.id, dst: sohagInstitute, source: 'manual' });
  await repository.createEdge({ type: 'EARNED', src: self.id, dst: diploma.id, source: 'manual' });
  await repository.createEdge({ type: 'EARNED', src: self.id, dst: bsc.id, source: 'manual' });
  await repository.createEdge({ type: 'STUDIED_AT', src: self.id, dst: nileUni, props: { field: 'Robotics club, visiting member' }, source: 'manual' });

  // Certifications, including two that have lapsed. A wall of valid badges
  // hides the thing the screen is for: noticing the one about to expire.
  const certFull = async (
    title: string,
    issued: string,
    expires: string | null,
    status: string,
    credentialId: string,
  ) => {
    const c = await repository.createNode({
      type: 'certification',
      title,
      props: {
        credential_id: credentialId,
        credential_url: `https://credentials.example/${credentialId}`,
        issued_on: issued,
        ...(expires ? { expires_on: expires } : {}),
        status,
      },
      source: 'manual',
    });
    await repository.createEdge({ type: 'EARNED', src: self.id, dst: c.id, source: 'manual' });
    return c.id;
  };
  await certFull('Certified Kubernetes Administrator', '2024-11-04', '2027-11-04', 'valid', 'cka-9f22');
  await certFull('dbt Analytics Engineering Certification', '2025-04-18', '2027-04-18', 'valid', 'dbt-4471');
  await certFull('TensorFlow Developer Certificate', '2023-02-09', '2026-02-09', 'expired', 'tf-1180');
  await certFull('Google Data Analytics Professional Certificate', '2021-07-22', null, 'valid', 'gda-6653');
  await certFull('Microsoft Azure Data Fundamentals', '2022-03-30', '2025-03-30', 'expired', 'dp900-2214');
  await certFull('Oracle Database SQL Associate', '2015-05-11', null, 'valid', 'ocasql-7098');
  await certFull('First Aid at Work', '2025-08-01', '2028-08-01', 'valid', 'fa-3391');

  // Courses across all four states, so the tracker has an enrolled row, a
  // dropped one, and a partial completion bar to draw rather than a full grid.
  const courseFull = async (
    title: string,
    provider: string,
    format: string,
    status: string,
    completion: number,
    hours: number,
    skillsGained: string[],
    dates: { started?: string; completed?: string } = {},
  ) => {
    const c = await repository.createNode({
      type: 'course',
      title,
      props: {
        provider,
        platform: provider,
        format,
        course_status: status,
        completion,
        hours,
        skills_gained: skillsGained,
        ...(dates.started ? { started_on: dates.started } : {}),
        ...(dates.completed ? { completed_on: dates.completed } : {}),
      },
      source: 'manual',
    });
    await repository.createEdge({ type: 'COMPLETED', src: self.id, dst: c.id, props: dates.completed ? { completed_on: dates.completed } : {}, source: 'manual' });
    return c.id;
  };
  await courseFull('18-661 · Introduction to Machine Learning for Engineers', 'CMU-Africa', 'in_person', 'completed', 100, 130, ['Machine Learning', 'NumPy'], { started: '2025-08-25', completed: '2025-12-12' });
  await courseFull('18-748 · Wireless Sensor Networks', 'CMU-Africa', 'in_person', 'completed', 100, 120, ['Embedded Systems'], { started: '2025-01-13', completed: '2025-05-09' });
  await courseFull('18-786 · Deep Learning Systems', 'CMU-Africa', 'in_person', 'enrolled', 12, 130, ['PyTorch'], { started: dateAgo(20) });
  await courseFull('Data Engineering Zoomcamp', 'DataTalks.Club', 'cohort', 'completed', 100, 90, ['dbt', 'Apache Airflow'], { started: '2024-01-15', completed: '2024-04-20' });
  await courseFull('Designing Data-Intensive Systems', 'Educative', 'self_paced', 'in_progress', 55, 40, ['Kafka', 'PostgreSQL'], { started: dateAgo(70) });
  await courseFull('Practical Geospatial Analysis with Python', 'Coursera', 'self_paced', 'completed', 100, 35, ['Geospatial Analysis'], { started: '2022-10-05', completed: '2022-12-01' });
  await courseFull('Advanced SQL for Analytics', 'Udacity', 'self_paced', 'completed', 100, 28, ['SQL', 'Dimensional Modeling'], { started: '2021-03-02', completed: '2021-04-16' });
  await courseFull('Rust for Systems Programmers', 'Manning liveProject', 'self_paced', 'dropped', 24, 30, [], { started: '2024-08-01' });
  await courseFull('Kinyarwanda for Beginners', 'Kigali Language Centre', 'in_person', 'in_progress', 45, 60, ['Kinyarwanda'], { started: dateAgo(160) });
  await courseFull('Technical Interview Preparation', 'Interviewing.io', 'cohort', 'in_progress', 70, 24, [], { started: dateAgo(52) });
  await courseFull('Full-Stack Web Bootcamp', 'Cairo Code Academy', 'bootcamp', 'completed', 100, 320, ['PHP', 'JavaScript'], { started: '2014-03-01', completed: '2014-07-30' });

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
  await award("Dean's List", 'org', '2023-06-30', 'Top 5% academic performance, ALU');
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

  // Six more pieces of written work, across every publication type the schema
  // knows. A record set where everything is a workshop paper cannot show what
  // the type field is for.
  const publication = async (
    title: string,
    pubType: string,
    venue: string,
    authors: string[],
    position: number,
    publishedOn: string,
    contribution: string,
    extra: Record<string, unknown> = {},
    aboutId?: string,
  ) => {
    const p = await repository.createNode({
      type: 'publication',
      title,
      props: { pub_type: pubType, venue, authors, author_position: position, my_contribution: contribution, published_on: publishedOn, ...extra },
      source: 'manual',
    });
    await repository.createEdge({
      type: 'AUTHORED',
      src: self.id,
      dst: p.id,
      props: { author_position: position, weight: position === 1 ? (authors.length === 1 ? 'sole' : 'lead') : 'co' },
      source: 'manual',
    });
    if (aboutId) await repository.createEdge({ type: 'ABOUT', src: p.id, dst: aboutId, source: 'manual' });
    return p.id;
  };
  const pubFleet = await publication(
    'Benchmarking Sensor Fusion on Low-Cost Fleet Telematics', 'conference',
    'IEEE Vehicular Technology Conference', ['Jordan Kim', 'Felix Mugisha', 'Aisha Bello'], 1, '2026-03-12',
    'Built the evaluation harness and ran the road trials.',
    { doi: '10.0000/vtc.2026.0412', citation_count: 4, url: 'https://example.com/fleet-fusion' }, pFleet,
  );
  const pubSpeech = await publication(
    'A Read-Speech Corpus for Kinyarwanda Recognition', 'journal',
    'Language Resources and Evaluation', ['Nadia Belkacem', 'Jordan Kim', 'Fatima Nkurunziza'], 2, '2026-07-02',
    'Designed the recording protocol and the alignment quality checks.',
    { doi: '10.0000/lre.2026.0088', citation_count: 2 }, pSpeech,
  );
  const pubCost = await publication(
    'Cost Models for Batch Pipelines in Constrained Cloud Regions', 'preprint',
    'arXiv', ['Jordan Kim'], 1, '2025-11-28',
    'Whole paper: model, measurements, and the replication package.',
    { url: 'https://arxiv.org/abs/demo-cost', citation_count: 1 },
  );
  const pubThesis = await publication(
    'Adaptive Scheduling for Streaming Feature Stores', 'thesis',
    'Carnegie Mellon University Africa', ['Jordan Kim'], 1, '2027-04-30',
    "Master's thesis in progress; the RL study is its second chapter.",
    {}, pRlStudy,
  );
  const pubPatent = await publication(
    'Deterministic Document Assembly from Structured Records', 'patent',
    'ARIPO (filed)', ['Jordan Kim', 'Michel Habyarimana'], 1, '2026-02-20',
    'Drafted the claims covering the selection-and-budget algorithm.',
    { url: 'https://patents.example/ap-2026-0220' },
  );
  const pubBlog = await publication(
    'Why deterministic beats clever in personal tooling', 'blog',
    'jordan-demo.example/notes', ['Jordan Kim'], 1, '2026-06-04',
    'Wrote it after the third time an LLM rewrote a bullet I had measured.',
    { url: 'https://jordan-demo.example/notes/deterministic' },
  );

  const talkFull = async (
    title: string,
    talkType: string,
    event: string,
    city: string,
    date: string,
    audience: number,
    extra: Record<string, unknown> = {},
  ) => {
    const t = await repository.createNode({
      type: 'talk',
      title,
      props: { talk_type: talkType, event_name: event, city, delivered_on: date, audience_size: audience, ...extra },
      source: 'manual',
    });
    await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: t.id, source: 'manual' });
    return t.id;
  };
  await talkFull('Cheap sensors, honest error bars', 'conference', 'IEEE AFRICON 2026', 'Cairo', '2026-06-12', 220, { slides_url: 'https://example.com/slides/africon', video_url: 'https://example.com/video/africon' });
  await talkFull('What a fleet actually tells you', 'meetup', 'Kigali Data Engineering meetup', 'Kigali', '2025-11-06', 60, { co_presenters: ['Felix Mugisha'] });
  await talkFull('Reading a job description like a compiler', 'guest_lecture', 'ALU career week', 'Kigali', '2026-02-11', 130);
  await talkFull('Building for one user, carefully', 'podcast', 'The Kigali Build podcast', 'Kigali', '2026-01-22', 0, { video_url: 'https://example.com/podcast/build' });
  await talkFull('Airflow without the folklore', 'webinar', 'DataTalks.Club webinar', 'Remote', '2024-09-19', 340);
  await talkFull('From notebook to pipeline in one afternoon', 'workshop', 'PyData Kigali workshop day', 'Kigali', '2025-07-26', 35, { co_presenters: ['Wanjiku Kamau'] });

  const awardFull = async (title: string, level: string, awardedOn: string, forWhat: string, prize?: string) => {
    const a = await repository.createNode({
      type: 'award',
      title,
      props: { level, awarded_on: awardedOn, award_for: forWhat, ...(prize ? { prize } : {}) },
      source: 'manual',
    });
    await repository.createEdge({ type: 'EARNED', src: self.id, dst: a.id, source: 'manual' });
    return a.id;
  };
  await awardFull('Engineering Excellence Award', 'org', '2018-12-14', 'The reconciliation rewrite at Sahara Fintech', 'Team bonus');
  await awardFull('Team of the Quarter', 'team', '2020-04-03', 'Anomaly screening shipped two quarters early');
  await awardFull('Open Data Prize, East Africa', 'international', '2023-11-09', 'The open bus-route dataset', 'USD 5,000');
  await awardFull('Best Workshop Paper', 'international', '2026-03-14', 'Sensor fusion on low-cost telematics');
  await awardFull('Volunteer of the Year', 'org', '2024-12-06', 'Two years of the Saturday coding club');

  // The existing helper stamps every reference `professional`, which is right
  // for a manager and wrong for a running partner. This one takes the kind, so
  // the four the schema knows are all represented and the filter has something
  // to filter.
  const referenceOfKind = async (
    personId: string,
    relationship: string,
    kind: string,
    strength: number,
    canContact: boolean,
    blurb: string,
  ) => {
    const ref = await repository.createNode({
      type: 'reference',
      title: relationship,
      props: { relationship, reference_type: kind, blurb, strength, can_contact: canContact, context: relationship },
      source: 'manual',
    });
    await repository.createEdge({ type: 'RECOMMENDS', src: personId, dst: ref.id, props: { relationship, strength }, source: 'manual' });
    return ref.id;
  };
  await referenceOfKind(who('Yasmine Farouk'), 'Engineering manager at Sahara Fintech (2016-2021)', 'professional', 5, true, 'Jordan rebuilt the reconciliation path and then taught three other engineers to own it. I would hire him again tomorrow.');
  await referenceOfKind(who('Peter Njoroge'), 'Data engineering peer at Savanna Grid', 'professional', 4, true, 'The only person on that team who wrote down why a pipeline was built the way it was.');
  await referenceOfKind(who('Prof. Elias Mwangi'), 'Course instructor, CMU-Africa', 'academic', 5, true, 'Consistently the strongest lab reports in a strong cohort.');
  await referenceOfKind(who('Naledi Motsepe'), 'Client at Okavango Data Collective', 'professional', 5, true, 'Delivered a contract that three previous consultants had returned unfinished.');
  await referenceOfKind(who('Bruno Iradukunda'), 'Friend and running partner, eight years', 'personal', 4, true, 'Shows up. That is the whole reference, and it is not a small one.');
  await referenceOfKind(who('Prisca Nyirahabimana'), 'Co-teacher, Saturday coding club', 'character', 5, true, "Three years of Saturdays with other people's children, unpaid and unmissed.");
  await referenceOfKind(who('Ahmed Sobhy'), 'First employer, Nile Delta Systems', 'character', 4, false, 'Prefers not to be contacted in writing; will take a call.');

  // Written the other way round, too: Jordan vouching for other people. A
  // reference register that only records inbound praise is half a ledger.
  for (const [name, note] of [
    ['Chidinma Eze', 'Wrote her a recommendation for the Ubwenge internship.'],
    ['Felix Mugisha', 'Vouched for him when Zamba made the platform role permanent.'],
    ['Thabo Nkosi', 'Referred him into the Sokoni backend team.'],
  ] as Array<[string, string]>) {
    await repository.createEdge({
      type: 'RECOMMENDS',
      src: self.id,
      dst: who(name),
      props: { relationship: 'former teammate', strength: 5 },
      notes_md: note,
      source: 'manual',
    });
  }

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

  // ── The rest of the job search ──────────────────────────────────────────────
  //
  // One application at one status is a pipeline with one column filled in, and
  // the outcomes half of the board does not render at all until something has
  // closed. Below: every posting status, all eight application states including
  // the three terminal ones, and interviews at every outcome and format, spread
  // over eighteen months so the board reads as a search rather than a snapshot.
  const postingFull = async (
    title: string,
    company: string,
    orgId: string,
    location: string,
    mode: string,
    postingStatus: string,
    source: string,
    jd: string,
    deadlineDaysAgo?: number,
  ) => {
    const jp = await repository.createNode({
      type: 'job_posting',
      title,
      props: {
        company,
        role_title: title,
        location,
        location_mode: mode,
        employment_type: 'full_time',
        jd_text: jd,
        posting_status: postingStatus,
        source,
        url: `https://jobs.example/${title.toLowerCase().replace(/[^a-z]+/g, '-')}`,
        ...(deadlineDaysAgo === undefined ? {} : { deadline: dateAgo(deadlineDaysAgo) }),
      },
      source: 'manual',
    });
    await repository.createEdge({ type: 'APPLIED_TO', src: jp.id, dst: orgId, source: 'manual' });
    return jp.id;
  };
  const jpZamba = await postingFull('Data Platform Engineer', 'Zamba Logistics', zamba, 'Kigali (hybrid)', 'hybrid', 'applied', 'referral', 'Airflow, dbt, PostgreSQL, warehouse modelling, on-call rotation.', -12);
  const jpTembo = await postingFull('Lead Data Engineer', 'Tembo Health', tembo, 'Kampala (remote)', 'remote', 'applied', 'recruiter', 'Python, SQL, clinical data, HL7, pipeline reliability, team leadership.', -3);
  const jpLattice = await postingFull('Research Engineer, Pipelines', 'Lattice Bio', lattice, 'Cape Town (onsite)', 'onsite', 'closed', 'inbound', 'Python, Nextflow, reproducibility, scientific computing.', 40);
  const jpKaribu = await postingFull('Platform Engineer', 'Karibu Cloud', karibu, 'Nairobi (hybrid)', 'hybrid', 'interested', 'cold', 'Go, Kubernetes, Terraform, multi-tenant infrastructure.');
  const jpAmani = await postingFull('Applied Scientist', 'Amani Robotics', amani, 'Kigali (onsite)', 'onsite', 'interested', 'referral', 'PyTorch, control, simulation, field robotics, reinforcement learning.');
  const jpSokoni = await postingFull('ML Infrastructure Engineer', 'Sokoni Commerce', sokoni, 'Dar es Salaam (remote)', 'remote', 'passed', 'inbound', 'Kubernetes, feature stores, model serving, Python.', 210);
  const jpUbwenge = await postingFull('Senior Data Engineer', 'Ubwenge Labs', ubwenge, 'Kigali (onsite)', 'onsite', 'watching', 'cold', 'Python, dbt, DuckDB, analytics engineering, client delivery.');
  const jpMeridian = await postingFull('Analytics Engineer', 'Meridian Freight', meridianFreight, 'Mombasa (hybrid)', 'hybrid', 'watching', 'inbound', 'SQL, dbt, shipping operations, warehouse modelling.');
  const jpSavanna = await postingFull('Senior Data Engineer', 'Savanna Grid', savanna, 'Nairobi (remote)', 'remote', 'applied', 'referral', 'Python, Spark, streaming telemetry, forecasting, BigQuery.', -25);
  const jpOkavango = await postingFull('Data Engineering Contractor', 'Okavango Data Collective', okavango, 'Remote', 'remote', 'closed', 'referral', 'Python, geospatial, open data publishing.', 520);

  interface ApplicationSpec {
    role: string;
    company: string;
    orgId: string;
    status: string;
    appliedDaysAgo: number;
    channel: string;
    mode: string;
    posting?: string;
    referredBy?: string;
    nextStep?: [string, number];
    salary?: string;
    notes?: string;
  }
  const applications: ApplicationSpec[] = [
    { role: 'Data Platform Engineer', company: 'Zamba Logistics', orgId: zamba, status: 'offer', appliedDaysAgo: 46, channel: 'referral', mode: 'hybrid', posting: jpZamba, referredBy: who('Josephine Uwera'), nextStep: ['Answer the offer by Friday', -5], salary: 'RWF 32-38M', notes: 'Strongest offer so far. The team is the one I contracted for, so there are no surprises left in it.' },
    { role: 'Lead Data Engineer', company: 'Tembo Health', orgId: tembo, status: 'interview', appliedDaysAgo: 31, channel: 'recruiter', mode: 'remote', posting: jpTembo, referredBy: who('Doreen Atim'), nextStep: ['Panel with the clinical data team', -6], salary: 'USD 70-85k' },
    { role: 'Senior Data Engineer', company: 'Savanna Grid', orgId: savanna, status: 'screening', appliedDaysAgo: 22, channel: 'referral', mode: 'remote', posting: jpSavanna, referredBy: who('Peter Njoroge'), nextStep: ['Take-home due', -2] },
    { role: 'Applied Scientist', company: 'Amani Robotics', orgId: amani, status: 'screening', appliedDaysAgo: 15, channel: 'referral', mode: 'onsite', posting: jpAmani, referredBy: who('Aisha Bello'), nextStep: ['Recruiter call to book the loop', -9] },
    { role: 'Platform Engineer', company: 'Karibu Cloud', orgId: karibu, status: 'applied', appliedDaysAgo: 9, channel: 'cold', mode: 'hybrid', posting: jpKaribu },
    { role: 'Senior Data Engineer', company: 'Ubwenge Labs', orgId: ubwenge, status: 'draft', appliedDaysAgo: 0, channel: 'cold', mode: 'onsite', posting: jpUbwenge, nextStep: ['Finish the cover letter', -1], notes: 'Half-written. Michel has offered to walk it in, which is worth more than the application.' },
    { role: 'Analytics Engineer', company: 'Meridian Freight', orgId: meridianFreight, status: 'withdrawn', appliedDaysAgo: 118, channel: 'inbound', mode: 'hybrid', posting: jpMeridian, notes: 'Withdrew after the second reschedule. Two months of calendar for a role I was lukewarm on.' },
    { role: 'ML Infrastructure Engineer', company: 'Sokoni Commerce', orgId: sokoni, status: 'rejected', appliedDaysAgo: 205, channel: 'inbound', mode: 'remote', posting: jpSokoni, notes: 'Rejected at the system-design round. Fair: I had never run a feature store in anger.' },
    { role: 'Research Engineer, Pipelines', company: 'Lattice Bio', orgId: lattice, status: 'rejected', appliedDaysAgo: 152, channel: 'inbound', mode: 'onsite', posting: jpLattice, referredBy: who('Sofia Almeida'), notes: 'They wanted somebody on site in Cape Town from day one.' },
    { role: 'Backend Engineer', company: 'Sahara Fintech', orgId: sahara, status: 'withdrawn', appliedDaysAgo: 330, channel: 'referral', mode: 'onsite', referredBy: who('Hossam Ragab'), notes: 'A step backwards dressed as a homecoming. Withdrew before the loop.' },
    { role: 'Data Engineering Contractor', company: 'Okavango Data Collective', orgId: okavango, status: 'accepted', appliedDaysAgo: 700, channel: 'referral', mode: 'remote', posting: jpOkavango, referredBy: who('Ibrahim Toure'), salary: 'USD 320/day', notes: 'Accepted and delivered; it became the freelance stretch on the résumé.' },
  ];

  const applicationIds = new Map<string, string>();
  for (const spec of applications) {
    const node = await repository.createNode({
      type: 'application',
      title: `${spec.role} @ ${spec.company}`,
      props: {
        role_title: spec.role,
        status: spec.status,
        applied_on: dateAgo(spec.appliedDaysAgo),
        channel: spec.channel,
        location_mode: spec.mode,
        ...(spec.salary ? { salary_range: spec.salary } : {}),
        ...(spec.nextStep ? { next_step: spec.nextStep[0], next_step_date: dateAgo(spec.nextStep[1]) } : {}),
      },
      ...(spec.notes ? { notes_md: spec.notes } : {}),
      source: 'manual',
    });
    applicationIds.set(`${spec.role}@${spec.orgId}`, node.id);
    await repository.createEdge({ type: 'APPLIED_TO', src: node.id, dst: spec.orgId, source: 'manual' });
    if (spec.referredBy) {
      await repository.createEdge({
        type: 'REFERRED_BY',
        src: node.id,
        dst: spec.referredBy,
        props: { asked_on: dateAgo(spec.appliedDaysAgo + 4), outcome: 'agreed' },
        source: 'manual',
      });
    }
    if (spec.posting) {
      await repository.createEdge({ type: 'RELATES_TO', src: node.id, dst: spec.posting, props: { label: 'posting' }, source: 'manual' });
    }
  }
  const appAt = (role: string, orgId: string) => {
    const id = applicationIds.get(`${role}@${orgId}`);
    if (!id) throw new Error(`seed-demo: no application for ${role}`);
    return id;
  };

  const interviewFor = async (
    applicationId: string,
    title: string,
    round: string,
    stageNo: number,
    format: string,
    scheduledDaysAgo: number,
    durationMin: number,
    outcome: string,
    withNames: string[],
    reflection?: string,
    prep?: string,
  ) => {
    const iv = await repository.createNode({
      type: 'interview',
      title,
      props: {
        round,
        stage_no: stageNo,
        format,
        scheduled_at: daysAgo(scheduledDaysAgo),
        duration_min: durationMin,
        outcome,
        interviewers: withNames,
        ...(reflection ? { reflection } : {}),
        ...(prep ? { prep_notes: prep } : {}),
      },
      source: 'manual',
    });
    await repository.createEdge({ type: 'INTERVIEW_FOR', src: iv.id, dst: applicationId, props: { round_no: stageNo }, source: 'manual' });
    for (const name of withNames) {
      await repository.createEdge({ type: 'WITH', src: iv.id, dst: who(name), source: 'manual' });
    }
    return iv.id;
  };

  const appZamba = appAt('Data Platform Engineer', zamba);
  await interviewFor(appZamba, 'Zamba: recruiter screen', 'Recruiter screen', 1, 'phone', 42, 30, 'passed', ['Miriam Kayitesi'], 'Short. She had already read the contract work, so it was mostly logistics.');
  await interviewFor(appZamba, 'Zamba: pipeline design exercise', 'Technical', 2, 'take_home', 36, 180, 'passed', ['Felix Mugisha'], 'Modelled the vendor-agnostic ingest I had actually built. Felt like cheating.', 'Reuse the fleet-ingest validation diagram.');
  await interviewFor(appZamba, 'Zamba: architecture panel', 'Panel', 3, 'panel', 27, 75, 'passed', ['Josephine Uwera', 'Felix Mugisha', 'Zamba panel (second interviewer)'], 'Two of the three had read the take-home. The third had not, and asked better questions for it.');
  await interviewFor(appZamba, 'Zamba: values conversation', 'Final', 4, 'onsite', 19, 45, 'passed', ['Josephine Uwera'], 'Offer signalled at the end of the call.');

  const appTembo = appAt('Lead Data Engineer', tembo);
  await interviewFor(appTembo, 'Tembo: recruiter screen', 'Recruiter screen', 1, 'phone', 26, 25, 'passed', ['Halima Yusuf'], 'Compensation band came up first, which I appreciated.');
  await interviewFor(appTembo, 'Tembo: clinical data deep dive', 'Technical', 2, 'video', 12, 60, 'passed', ['Doreen Atim'], 'Spent most of it on data provenance in the field, not on code.');
  await interviewFor(appTembo, 'Tembo: leadership panel', 'Panel', 3, 'panel', -6, 90, 'scheduled', ['Doreen Atim', 'Halima Yusuf'], undefined, 'Prepare two stories about handing a system over, not about building one.');

  const appSavanna = appAt('Senior Data Engineer', savanna);
  await interviewFor(appSavanna, 'Savanna Grid: catch-up screen', 'Recruiter screen', 1, 'video', 17, 30, 'passed', ['Bernard Oduya'], 'Odd to interview at a place I used to work. He had my old commits open.');
  await interviewFor(appSavanna, 'Savanna Grid: take-home review', 'Technical', 2, 'video', -2, 60, 'pending', ['Peter Njoroge', 'Lilian Wanjiru'], undefined, 'Ship the forecast notebook with the error analysis, not without it.');

  const appAmani = appAt('Applied Scientist', amani);
  await interviewFor(appAmani, 'Amani Robotics: intro call', 'Recruiter screen', 1, 'phone', 11, 20, 'cancelled', ['Aisha Bello'], 'They cancelled an hour before; the hiring manager was in the field.');

  const appSokoni = appAt('ML Infrastructure Engineer', sokoni);
  await interviewFor(appSokoni, 'Sokoni: systems design', 'Technical', 2, 'video', 190, 60, 'failed', ['Amara Okafor'], 'Could not defend a feature-store design I had only read about. Correct outcome.');

  const appLattice = appAt('Research Engineer, Pipelines', lattice);
  await interviewFor(appLattice, 'Lattice Bio: hiring manager call', 'Hiring manager', 1, 'video', 145, 45, 'passed', ['Paulo Mendes'], 'Good conversation, wrong continent.');
  await interviewFor(appLattice, 'Lattice Bio: onsite loop', 'Onsite', 2, 'onsite', 138, 240, 'failed', ['Sofia Almeida', 'Paulo Mendes'], 'They needed somebody in the lab; I needed to finish a degree in Kigali.');

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

  // ── A correspondence world ──────────────────────────────────────────────────
  //
  // Five undirected interactions cannot demonstrate a reciprocity ratio, a
  // reply latency, an imbalance, or a tie that was strong and went quiet,
  // because none of those figures exist in five records. What follows is built
  // against what the algorithms key on: the Hawkes kernel decays on a 90-day
  // constant, a tie counts as once-strong at a peak of 0.55, an imbalance needs
  // four directional events before it is ranked, and a direction change more
  // than 60 days later is a new thread rather than a reply.
  //
  // Where a real operator would not have written down who reached out - an
  // annual visit, a corridor encounter - the direction is left unset, and the
  // coverage line owns up to it. A log where every single record carries a
  // direction would quietly imply the product demands one.

  /** [days ago, kind, who opened it (null when unrecorded), what it was]. */
  type Beat = [number, string, 'me' | 'them' | null, string];

  const exchange = async (personId: string, topics: string[], beats: Beat[]) => {
    // Oldest first, so the log is written in the order it happened.
    for (const [agoDays, kind, initiator, title] of [...beats].sort((a, b) => b[0] - a[0])) {
      const node = await repository.createNode({
        type: 'interaction',
        title,
        props: {
          kind,
          occurred_at: daysAgo(agoDays),
          talking_points: topics,
          ...(initiator ? { initiated_by: initiator } : {}),
        },
        source: 'manual',
      });
      await repository.createEdge({ type: 'WITH', src: node.id, dst: personId, source: 'manual' });
    }
  };

  // Yasmine: the manager who became a referee. Six years of dense contact, a
  // quiet stretch after the move to Kigali, and a revival that is entirely
  // about the reference. Reciprocity near even, reply latency short.
  await exchange(who('Yasmine Farouk'), ['leadership', 'references', 'career'], [
    [1780, 'meeting', null, 'First one-to-one after she took over the team'],
    [1620, 'email', 'them', 'Asked me to own the reconciliation rewrite'],
    [1617, 'email', 'me', 'Said yes and asked for two engineers'],
    [1450, 'meeting', 'them', 'Mid-project review'],
    [1200, 'coffee', 'me', 'Asked what senior looked like here'],
    [1197, 'email', 'them', 'Sent the promotion criteria'],
    [1060, 'meeting', 'them', 'Promotion conversation'],
    [900, 'email', 'me', 'Told her I was leaving for Kigali'],
    [897, 'call', 'them', 'Talked me out of leaving badly'],
    [860, 'coffee', null, 'Last coffee before the flight'],
    [640, 'email', 'me', 'Sent the graduate application draft'],
    [636, 'email', 'them', 'Comments, and an offer to be a referee'],
    [500, 'email', 'me', 'Asked her for the reference formally'],
    [497, 'email', 'them', 'Reference submitted'],
    [493, 'email', 'me', 'Thanked her'],
    [300, 'video', 'them', 'Checked how the degree was going'],
    [140, 'email', 'me', 'Told her the search had started'],
    [137, 'email', 'them', 'Offered to make two introductions'],
    [58, 'call', 'me', 'Walked through the Zamba offer with her'],
    [21, 'email', 'them', 'Asked how the offer landed'],
    [19, 'email', 'me', 'Answered, and asked one more question about scope'],
  ]);

  // Hossam: dormant, and once the strongest professional tie here. Weekly
  // contact for the length of a project, then nothing for over a year. Both
  // halves matter: a tie that was never strong is not a loss, and a tie that
  // never went quiet is not a reconnect.
  const hossamBeats: Beat[] = [];
  const hossamThreads = [
    'Weekly sync: matcher rules',
    'Weekly sync: the settlement window',
    'Weekly sync: partial payments',
    'Weekly sync: the migration cutover',
    'Weekly sync: replay tooling',
  ];
  for (let i = 0, ago = 1580; ago >= 1380; i += 1, ago -= 7) {
    hossamBeats.push([ago, i % 3 === 0 ? 'video' : 'call', i % 2 === 0 ? 'me' : 'them', `${hossamThreads[i % hossamThreads.length]} (week ${i + 1})`]);
  }
  hossamBeats.push(
    [1370, 'email', 'them', 'Cutover results and the post-mortem'],
    [1365, 'email', 'me', 'Signed off on the post-mortem'],
    [1100, 'coffee', null, 'Ran into each other at the Cairo meetup'],
    [640, 'message', 'them', 'Congratulations on the CMU place'],
    [638, 'message', 'me', 'Thanked him'],
  );
  await exchange(who('Hossam Ragab'), ['distributed systems', 'reconciliation'], hossamBeats);

  // Peter: the peer who genuinely trades. Even ratio, two-day median reply,
  // and the reason the Savanna Grid application exists at all.
  await exchange(who('Peter Njoroge'), ['streaming', 'telemetry', 'hiring'], [
    [1400, 'email', 'me', 'Asked how they handled late-arriving telemetry'],
    [1398, 'email', 'them', 'Long answer with their watermarking notes'],
    [1200, 'video', 'them', 'Walked me through the ingestion topology'],
    [1050, 'email', 'me', 'Sent my forecast error analysis'],
    [1047, 'email', 'them', 'Pushed back on the baseline'],
    [1010, 'call', 'me', 'Argued out the baseline properly'],
    [800, 'email', 'them', 'Asked me to review a design doc'],
    [797, 'email', 'me', 'Review sent'],
    [520, 'video', 'me', 'Caught up after I left'],
    [300, 'email', 'them', 'Shared the grid forecasting write-up'],
    [297, 'email', 'me', 'Comments, and a question about the new team'],
    [120, 'email', 'me', 'Told him I was looking again'],
    [117, 'email', 'them', 'Sent the senior role and offered to refer me'],
    [26, 'call', 'them', 'Prep call before the screen'],
    [16, 'email', 'me', 'Debrief after the screen'],
    [4, 'message', 'them', 'Nudge about the take-home'],
  ]);

  // Halima: the recruiter. She writes far more than she is written to, and the
  // last three have no answer at all - the unanswered-inbound count and the
  // inbound half of the imbalance register both need somebody like this.
  await exchange(who('Halima Yusuf'), ['hiring', 'the lead role'], [
    [88, 'email', 'them', 'Cold note about a data role'],
    [85, 'email', 'me', 'Asked what the team actually owns'],
    [83, 'email', 'them', 'Sent the team charter'],
    [60, 'email', 'them', 'Checking in'],
    [55, 'email', 'me', 'Brief reply, still finishing a contract'],
    [34, 'email', 'them', 'The lead role is open'],
    [31, 'call', 'me', 'Called her back about it'],
    [29, 'email', 'them', 'Sent the full brief'],
    [26, 'email', 'me', 'Applied'],
    [13, 'email', 'them', 'Panel being scheduled'],
    [8, 'email', 'them', 'Nudge about availability'],
    [3, 'email', 'them', 'Second nudge, offering to call'],
  ]);

  // Gideon: entirely inbound, entirely unanswered, five sends and no replies.
  // The extreme case the imbalance register is scaled against.
  await exchange(who('Gideon Otieno'), ['roles'], [
    [240, 'email', 'them', 'Unsolicited note about a backend role'],
    [180, 'email', 'them', 'A different role, same template'],
    [120, 'email', 'them', 'Third template'],
    [64, 'email', 'them', 'Asked whether I had seen his messages'],
    [15, 'outreach', 'them', 'Connection request with a note'],
  ]);

  // Elias: outbound-heavy, which is what a supervision relationship looks like
  // from the student's side, and the two term meetings carry no direction.
  await exchange(who('Prof. Elias Mwangi'), ['embedded systems', 'grant writing'], [
    [420, 'email', 'me', 'Asked to join the sensing reading group'],
    [418, 'email', 'them', 'Yes, Thursdays'],
    [360, 'meeting', null, 'Start-of-term meeting'],
    [300, 'email', 'me', 'Sent the calibration results'],
    [240, 'email', 'me', 'Draft of the AFRICON abstract'],
    [237, 'email', 'them', 'Comments on the abstract'],
    [180, 'meeting', null, 'Start-of-term meeting'],
    [120, 'email', 'me', 'Asked about the travel grant'],
    [90, 'email', 'me', 'Camera-ready sent'],
    [40, 'email', 'me', 'Asked whether he would supervise the thesis'],
    [37, 'email', 'them', 'Agreed, with conditions'],
    [7, 'meeting', 'me', 'Thesis scope meeting'],
  ]);

  // Michel: the broker. Two of the introductions in this graph came through
  // him, which gives the recorded-introductions register something to count
  // that is not a free-text credit.
  await exchange(who('Michel Habyarimana'), ['founding', 'consulting'], [
    [520, 'encounter', null, 'Met at the ICT Chamber mixer'],
    [430, 'coffee', 'them', 'Asked whether I did contract work'],
    [427, 'email', 'me', 'Sent my rates and availability'],
    [300, 'call', 'them', 'Talked through a project he could not staff'],
    [204, 'email', 'them', 'Offered to introduce me to Josephine'],
    [200, 'email', 'me', 'Said yes, please'],
    [150, 'coffee', null, 'Coffee, no agenda'],
    [70, 'message', 'me', 'Asked what Ubwenge pays for senior data work'],
    [68, 'message', 'them', 'Answered, and said to apply'],
    [12, 'message', 'them', 'Nudge about the Ubwenge application'],
  ]);

  // Wanjiku: the community tie, which exists in bursts around the meetup
  // calendar and is quiet in between. Plotted by date, that seasonality is the
  // whole difference between this shape and a steady one.
  await exchange(who('Wanjiku Kamau'), ['community', 'speaking'], [
    [700, 'email', 'them', 'Call for speakers'],
    [696, 'email', 'me', 'Submitted a talk'],
    [682, 'email', 'them', 'Accepted, here is the slot'],
    [672, 'message', 'me', 'Logistics questions'],
    [670, 'message', 'them', 'Answers'],
    [665, 'encounter', null, 'The meetup itself'],
    [663, 'message', 'them', 'Thanks and the recording link'],
    [400, 'message', 'them', 'Asked if I would run a workshop'],
    [398, 'message', 'me', 'Said yes'],
    [396, 'encounter', null, 'The workshop day'],
    [330, 'email', 'them', 'Call for speakers, next season'],
    [327, 'email', 'me', 'Submitted again'],
    [140, 'encounter', null, 'April meetup'],
    [136, 'message', 'them', 'Recording link'],
    [30, 'message', 'them', 'Asked whether I would keep organising if I move'],
    [28, 'message', 'me', 'Said I would'],
  ]);

  // Miriam: the newest tie, and the one that is climbing - monthly to weekly
  // in three months, which is the opposite shape to Hossam.
  await exchange(who('Miriam Kayitesi'), ['the platform role', 'hiring'], [
    [96, 'email', 'them', 'Josephine passed on my name'],
    [94, 'email', 'me', 'Replied and suggested a call'],
    [90, 'call', 'me', 'First call, what the team owns'],
    [62, 'email', 'them', 'Sent the platform brief'],
    [59, 'email', 'me', 'Questions about the on-call rotation'],
    [57, 'email', 'them', 'Answers, honest ones'],
    [46, 'email', 'me', 'Applied'],
    [42, 'call', 'them', 'Recruiter screen'],
    [30, 'email', 'them', 'Take-home sent'],
    [27, 'video', 'them', 'Architecture panel'],
    [19, 'video', 'them', 'Values conversation'],
    [12, 'email', 'them', 'Offer, in writing'],
    [8, 'call', 'me', 'Questions about the offer'],
    [5, 'message', 'them', 'Checking whether I need more time'],
    [2, 'message', 'me', 'Asked for until Friday'],
  ]);

  // Chidinma: high volume, low ceremony. Short messages nearly every week, the
  // shape a classmate makes and a colleague does not.
  const chidinmaBeats: Beat[] = [];
  const chidinmaThreads = [
    'Notes swap before the lab',
    'Complaining about the assignment deadline',
    'Study group time change',
    'Sent her the reading I could not finish',
    'She sent the corrected solution',
    'Lunch after the lecture',
  ];
  for (let i = 0, ago = 300; ago >= 2; i += 1, ago -= 11) {
    chidinmaBeats.push([ago, i % 4 === 0 ? 'meeting' : 'message', i % 2 === 0 ? 'me' : 'them', `${chidinmaThreads[i % chidinmaThreads.length]} (${i + 1})`]);
  }
  await exchange(who('Chidinma Eze'), ['coursework', 'job search'], chidinmaBeats);

  // Josephine: the sponsor. Few records, all of them consequential.
  await exchange(who('Josephine Uwera'), ['data platforms', 'hiring'], [
    [204, 'encounter', null, 'ICT Chamber panel'],
    [200, 'coffee', 'them', 'Asked what I was doing after the degree'],
    [196, 'email', 'me', 'Sent her the fleet ingestion write-up'],
    [193, 'email', 'them', 'Said she would pass my name to Miriam'],
    [96, 'message', 'them', 'Confirmed she had done it'],
    [19, 'video', 'them', 'Values conversation'],
    [11, 'call', 'them', 'Talked about what the first six months look like'],
  ]);

  // Ahmed: the first employer. Once a year, no direction recorded, and the
  // coverage line should say so rather than guess.
  await exchange(who('Ahmed Sobhy'), ['field services', 'small business'], [
    [1450, 'meeting', null, 'Visit to the Sohag workshop'],
    [1080, 'meeting', null, 'Visit to the Sohag workshop'],
    [720, 'call', 'me', 'Called at Eid'],
    [700, 'meeting', null, 'Visit to the Sohag workshop'],
    [360, 'call', 'me', 'Called at Eid'],
    [340, 'meeting', null, 'Visit to the Sohag workshop'],
  ]);

  // Life outside work, which the correspondence screens should be able to show
  // without pretending it is networking.
  await exchange(who('Bruno Iradukunda'), ['running', 'weekends'], [
    [400, 'encounter', null, 'Saturday long run'],
    [330, 'encounter', null, 'Saturday long run'],
    [240, 'message', 'them', 'Asked if I was racing the half'],
    [238, 'message', 'me', 'Said yes, badly'],
    [200, 'encounter', null, 'The half marathon'],
    [120, 'coffee', null, 'Coffee after the run'],
    [60, 'encounter', null, 'Saturday long run'],
    [21, 'encounter', null, 'Saturday long run'],
    [7, 'encounter', null, 'Saturday long run'],
    [1, 'message', 'them', 'Route for tomorrow'],
  ]);
  await exchange(who('Min-seo Kim'), ['family'], [
    [365, 'video', 'them', 'New year call'],
    [280, 'video', 'me', 'Sunday call'],
    [210, 'video', 'them', 'Sunday call'],
    [140, 'video', 'me', 'Sunday call'],
    [90, 'message', 'them', 'Photos from Seoul'],
    [70, 'video', 'me', 'Sunday call'],
    [35, 'video', 'them', 'Sunday call'],
    [14, 'video', 'me', 'Sunday call'],
    [3, 'message', 'me', 'Sent the offer news'],
    [2, 'message', 'them', 'Very pleased, and one question about the salary'],
  ]);
  await exchange(who('Dae-ho Kim'), ['family'], [
    [300, 'call', 'them', 'Monthly call'],
    [240, 'call', 'me', 'Monthly call'],
    [180, 'call', 'them', 'Monthly call'],
    [120, 'call', 'me', 'Monthly call'],
    [60, 'call', 'them', 'Monthly call'],
    [12, 'call', 'me', 'Monthly call'],
  ]);

  // The ties that already existed here get their history too, so the profiles
  // the tour opens have a correspondence panel with something in it.
  await exchange(marc, ['data platforms', 'hiring'], [
    [340, 'encounter', null, 'Met at Deep Learning Indaba'],
    [300, 'email', 'me', 'Asked how Aurora structures its data team'],
    [297, 'email', 'them', 'Answered, and asked what I was building'],
    [200, 'video', 'them', 'Walked me through their platform'],
    [120, 'email', 'me', 'Sent the RL study results'],
    [117, 'email', 'them', 'Said he would flag me to the recruiter'],
    [30, 'call', 'them', 'Prep before the recruiter screen'],
  ]);
  await exchange(fatima, ['reinforcement learning', 'publications'], [
    [400, 'meeting', 'them', 'First supervision meeting'],
    [330, 'email', 'me', 'Sent the experiment protocol'],
    [327, 'email', 'them', 'Comments on the protocol'],
    [200, 'meeting', null, 'Weekly research sync'],
    [140, 'email', 'me', 'Draft of the symposium paper'],
    [136, 'email', 'them', 'Line edits, and a warning about the claims'],
    [60, 'meeting', null, 'Weekly research sync'],
    [24, 'email', 'them', 'Asked whether I would extend the study'],
    [22, 'email', 'me', 'Said yes if the thesis allows it'],
  ]);
  await exchange(jean, ['computer vision', 'coursework'], [
    [260, 'message', 'them', 'Asked about the embedded lab kit'],
    [258, 'message', 'me', 'Sent the wiring photo'],
    [180, 'coffee', null, 'Coffee between lectures'],
    [90, 'message', 'me', 'Asked whether he knew anyone at Aurora'],
    [88, 'message', 'them', 'Said he would ask Marc'],
    [40, 'message', 'them', 'Shared a paper on event cameras'],
    [8, 'message', 'me', 'Notes on the paper'],
  ]);
  await exchange(grace, ['ML engineer role'], [
    [64, 'email', 'them', 'Introduced herself as the recruiter'],
    [61, 'email', 'me', 'Sent my CV'],
    [40, 'email', 'them', 'Booked the screen'],
    [12, 'email', 'them', 'Asked for two references'],
    [10, 'email', 'me', 'Sent the references'],
  ]);
  await exchange(priya, ['automation', 'referrals'], [
    [1300, 'meeting', 'them', 'First one-to-one at Goodera'],
    [1200, 'email', 'me', 'Sent the scraper design'],
    [1197, 'email', 'them', 'Approved it, with a warning about rate limits'],
    [900, 'coffee', null, 'Last day coffee'],
    [420, 'email', 'me', 'Asked how the partnerships team was doing'],
    [200, 'email', 'me', 'Told her about the degree'],
    [40, 'email', 'me', 'Asked for a reference letter'],
    [36, 'email', 'them', 'Agreed, asked for the form'],
  ]);
  await exchange(sara, ['M&E', 'dashboards'], [
    [700, 'meeting', 'them', 'Handover of the reporting pack'],
    [500, 'email', 'me', 'Sent the dashboard changes'],
    [300, 'email', 'them', 'Asked for one more breakdown'],
    [280, 'email', 'me', 'Shipped it'],
    [90, 'email', 'them', 'Told me the pack is still in use'],
  ]);
  await exchange(omar, ['inventory system'], [
    [1250, 'meeting', 'them', 'Requirements walk-through in the showroom'],
    [1180, 'call', 'me', 'Training call for the sales staff'],
    [900, 'call', 'them', 'Asked how to add a supplier'],
    [400, 'message', 'them', 'System still running, no changes needed'],
  ]);
  await exchange(tarek, ['robotics', 'founding'], [
    [560, 'encounter', null, 'Met at DevFest'],
    [500, 'coffee', 'them', 'Talked robotics founding in DIFC'],
    [300, 'email', 'me', 'Sent him the navigation robot write-up'],
    [210, 'email', 'them', 'Asked whether I would join as employee two'],
    [205, 'email', 'me', 'Said not until the degree is finished'],
  ]);

  // The shallow half of the network. Everybody here is a real tie with a
  // handful of records, which is what most of a real address book looks like
  // and what keeps the reconnect lane from being a list of five names.
  const lightExchanges: Array<[string, string[], Beat[]]> = [
    ['Dr. Ines Uwase', ['sensor calibration'], [[300, 'meeting', null, 'Lab induction'], [180, 'email', 'me', 'Calibration questions'], [176, 'email', 'them', 'Answers and a spreadsheet'], [40, 'meeting', null, 'Bench session'], [9, 'message', 'them', 'Reminder about the lab key']]],
    ['Kwame Boateng', ['coursework'], [[240, 'meeting', null, 'Study group'], [150, 'message', 'me', 'Swapped notes'], [70, 'meeting', null, 'Study group'], [18, 'message', 'them', 'Exam timetable']]],
    ['Aline Ingabire', ['DSP'], [[260, 'meeting', null, 'Lab pairing'], [130, 'message', 'them', 'Filter design question'], [128, 'message', 'me', 'Answered with a plot'], [25, 'meeting', null, 'Lab pairing']]],
    ['Nadia Belkacem', ['speech corpora'], [[210, 'email', 'them', 'Asked me to join the corpus work'], [207, 'email', 'me', 'Said yes'], [120, 'video', null, 'Recording protocol review'], [45, 'email', 'me', 'Sent the alignment QA results'], [11, 'email', 'them', 'Journal submission confirmed']]],
    ['Samuel Kiptoo', ['robotics'], [[280, 'meeting', null, 'Reading group'], [140, 'meeting', null, 'Reading group'], [33, 'message', 'them', 'Shared a field-trial video']]],
    ['Beatrice Mukamana', ['funding'], [[400, 'email', 'them', 'Enrolment paperwork'], [220, 'email', 'me', 'Asked about the assistantship'], [217, 'email', 'them', 'Sent the form'], [60, 'email', 'them', 'Reminder about registration']]],
    ['Thabo Nkosi', ['backend'], [[600, 'video', null, 'Capstone retrospective'], [300, 'message', 'me', 'Asked about their payments stack'], [297, 'message', 'them', 'Long answer'], [90, 'message', 'them', 'Job posting he thought I would like'], [88, 'message', 'me', 'Thanked him']]],
    ['Zainab Adeyemi', ['product'], [[600, 'video', null, 'Capstone retrospective'], [250, 'message', 'them', 'Asked me to review a spec'], [248, 'message', 'me', 'Review sent'], [64, 'message', 'them', 'Congratulations on the paper']]],
    ['Emmanuel Rukundo', ['appsec'], [[500, 'coffee', null, 'Security club reunion'], [300, 'message', 'me', 'Asked about their threat model'], [180, 'meeting', null, 'CTF evening'], [50, 'message', 'them', 'Shared a write-up'], [6, 'message', 'me', 'Asked what Ubwenge is like to work at']]],
    ['Lulu Chirwa', ['teaching'], [[800, 'meeting', null, 'Final capstone review'], [400, 'email', 'me', 'Sent her the club curriculum'], [396, 'email', 'them', 'Suggested three changes'], [120, 'email', 'them', 'Asked me to guest lecture']]],
    ['Dan Kigozi', ['founding', 'logistics'], [[520, 'coffee', 'them', 'Pitched me his logistics idea'], [300, 'call', 'me', 'Asked how Zamba structures its data'], [150, 'message', 'them', 'Shared his fundraising deck'], [148, 'message', 'me', 'Comments on the deck']]],
    ['Mina Guirguis', ['testing'], [[1500, 'meeting', null, 'Release retrospective'], [900, 'email', 'me', 'Asked for a reference on the agency years'], [897, 'email', 'them', 'Agreed'], [200, 'message', 'them', 'New year message']]],
    ['Rania Mostafa', ['public sector delivery'], [[1400, 'meeting', null, 'Requirements workshop'], [600, 'message', 'them', 'New year message'], [240, 'message', 'them', 'New year message']]],
    ['Lilian Wanjiru', ['analytics'], [[900, 'meeting', null, 'Weekly analytics review'], [500, 'email', 'me', 'Sent the forecast comparison'], [497, 'email', 'them', 'Adopted the baseline'], [120, 'email', 'them', 'Asked whether I would come back'], [17, 'video', 'them', 'Screen with Bernard']]],
    ['Bernard Oduya', ['roles'], [[300, 'email', 'them', 'Introduced himself'], [130, 'email', 'them', 'Sent an unrelated role'], [30, 'email', 'them', 'Sent the senior role'], [27, 'email', 'me', 'Applied'], [17, 'video', 'them', 'Recruiter screen']]],
    ['Felix Mugisha', ['Airflow', 'on-call'], [[420, 'meeting', null, 'Contract kickoff'], [300, 'message', 'me', 'Asked about the vendor quirks'], [298, 'message', 'them', 'Sent the vendor notes'], [200, 'meeting', null, 'Weekly standup'], [36, 'video', 'them', 'Take-home review'], [10, 'message', 'them', 'Hoping I take the offer']]],
    ['Doreen Atim', ['cold chain'], [[300, 'email', 'me', 'Asked about the sensor pilot'], [297, 'email', 'them', 'Sent the district data'], [74, 'email', 'them', 'Offered to pass my name to the recruiter'], [12, 'video', 'them', 'Clinical data deep dive']]],
    ['Vera Nsengiyumva', ['culture'], [[260, 'encounter', null, 'Ubwenge open day'], [120, 'email', 'me', 'Asked about their hiring process'], [117, 'email', 'them', 'Answered in detail']]],
    ['Paulo Mendes', ['pipelines'], [[320, 'encounter', null, 'Indaba poster session'], [200, 'email', 'them', 'Sent the research engineer posting'], [197, 'email', 'me', 'Applied'], [145, 'video', 'them', 'Hiring manager call'], [138, 'meeting', null, 'Onsite loop'], [130, 'email', 'them', 'Declined, with reasons']]],
    ['Sofia Almeida', ['reproducibility'], [[330, 'encounter', null, 'Indaba poster session'], [250, 'email', 'me', 'Asked how they pin dependencies'], [247, 'email', 'them', 'Sent their lockfile policy'], [140, 'video', null, 'Mock interview before the Lattice loop'], [50, 'message', 'them', 'Checked how the search was going']]],
    ['Hakim Diallo', ['cloud', 'talks'], [[400, 'encounter', null, 'DevFest'], [300, 'message', 'them', 'Asked me to speak at a webinar'], [298, 'message', 'me', 'Said yes'], [120, 'message', 'them', 'Shared the recording'], [20, 'message', 'them', 'Asked whether I am hiring-available']]],
    ['Aisha Bello', ['robotics', 'control'], [[280, 'meeting', null, 'Reading group'], [160, 'email', 'me', 'Asked about the field trials'], [157, 'email', 'them', 'Sent the trial protocol'], [22, 'email', 'them', 'Flagged the applied scientist role'], [11, 'call', 'them', 'Intro call, cancelled at short notice']]],
    ['Clarisse Umutoni', ['events'], [[420, 'encounter', null, 'ICT Chamber mixer'], [204, 'encounter', null, 'ICT Chamber panel'], [90, 'email', 'them', 'Invitation to the next panel']]],
    ['Yohannes Tesfaye', ['open data'], [[500, 'meeting', null, 'Open-data workshop'], [300, 'email', 'them', 'Asked to use the bus dataset'], [298, 'email', 'me', 'Said yes, with attribution'], [60, 'email', 'them', 'Sent the published piece']]],
    ['Amara Okafor', ['Python'], [[350, 'encounter', null, 'PyData Kigali'], [200, 'message', 'them', 'Asked about scraping etiquette'], [198, 'message', 'me', 'Answered'], [190, 'video', 'them', 'Sokoni systems design']]],
    ['Ibrahim Toure', ['open data', 'geospatial'], [[1200, 'email', 'them', 'Asked whether I took contracts'], [1197, 'email', 'me', 'Sent rates'], [900, 'meeting', null, 'Contract kickoff'], [700, 'video', null, 'Fortnightly delivery review'], [520, 'email', 'me', 'Final handover'], [200, 'message', 'them', 'Asked how the degree was going']]],
    ['Naledi Motsepe', ['funding'], [[1000, 'meeting', null, 'Contract scoping'], [520, 'email', 'them', 'Signed off on the delivery'], [516, 'email', 'me', 'Thanked her'], [180, 'email', 'me', 'Asked for a reference'], [177, 'email', 'them', 'Written and sent']]],
    ['Prisca Nyirahabimana', ['outreach'], [[800, 'meeting', null, 'First Saturday club session'], [400, 'email', 'me', 'Sent the revised curriculum'], [396, 'email', 'them', 'Adopted it'], [90, 'meeting', null, 'Saturday club'], [16, 'meeting', null, 'Saturday club']]],
    ['Sandrine Mukashema', ['running', 'hiking'], [[300, 'encounter', null, 'Saturday long run'], [150, 'encounter', null, 'Hike up Kigali ridge'], [40, 'message', 'them', 'Photos from the hike'], [5, 'encounter', null, 'Saturday long run']]],
    ['Olivier Bizimana', ['training plans'], [[240, 'message', 'them', 'Sent the training block'], [120, 'encounter', null, 'Track session'], [30, 'message', 'me', 'Asked to adjust the plan around exams']]],
    ['Alice Nyiramana', ['the building'], [[300, 'encounter', null, 'Stairwell conversation about the water tank'], [120, 'message', 'them', 'Power cut warning'], [20, 'encounter', null, 'Stairwell conversation']]],
    ['Eric Nshuti', ['the lease'], [[400, 'email', 'them', 'Lease renewal'], [35, 'email', 'them', 'Rent receipt']]],
    ['Dr. Claudine Mukamurenzi', ['annual check-up'], [[380, 'meeting', null, 'Annual check-up'], [15, 'meeting', null, 'Annual check-up']]],
    ['Hana Kim', ['family'], [[200, 'call', 'them', 'Monthly call'], [100, 'call', 'them', 'Monthly call'], [20, 'call', 'me', 'Monthly call']]],
    ['Adaeze Okonkwo', ['analytics'], [[350, 'encounter', null, 'PyData Kigali'], [200, 'email', 'me', 'Asked about their warehouse model']]],
    ['Victor Rukara', ['closed contract'], [[610, 'meeting', null, 'Contract handover, badly'], [600, 'email', 'them', 'Disputed the final invoice']]],
  ];
  for (const [name, topics, beats] of lightExchanges) {
    await exchange(who(name), topics, beats);
  }

  // ── More of the calendar, the backlog, and the notebook ─────────────────────
  const event = async (
    title: string,
    kind: string,
    city: string,
    venue: string,
    start: string,
    end: string | undefined,
    attended: boolean,
    attendees: string[] = [],
    myRole?: string,
  ) => {
    const e = await repository.createNode({
      type: 'event',
      title,
      props: { kind, venue, city, attended },
      start_date: start,
      ...(end ? { end_date: end } : {}),
      source: 'manual',
    });
    await repository.createEdge({
      type: 'ATTENDED',
      src: self.id,
      dst: e.id,
      ...(myRole ? { props: { role: myRole } } : {}),
      source: 'manual',
    });
    for (const name of attendees) {
      await repository.createEdge({ type: 'ATTENDED', src: who(name), dst: e.id, source: 'manual' });
    }
    return e.id;
  };
  await event('IEEE AFRICON 2026', 'conference', 'Cairo', 'Cairo ICC', '2026-06-10', '2026-06-13', true, ['Dr. Ines Uwase'], 'speaker');
  await event('Deep Learning Indaba 2024', 'conference', 'Dakar', 'UCAD', '2024-08-25', '2024-08-31', true, ['Tunde Bakare', 'Sofia Almeida'], 'attendee');
  await event('Rwanda ICT Chamber industry panel', 'meetup', 'Kigali', 'Norrsken House', dateAgo(204), undefined, true, ['Josephine Uwera', 'Clarisse Umutoni', 'Michel Habyarimana'], 'speaker');
  await event('Kigali Data Engineering meetup', 'meetup', 'Kigali', 'Impact Hub', '2025-11-06', undefined, true, ['Felix Mugisha', 'Wanjiku Kamau'], 'speaker');
  await event('PyData Kigali workshop day', 'meetup', 'Kigali', 'kLab', '2025-07-26', undefined, true, ['Wanjiku Kamau', 'Hakim Diallo'], 'organizer');
  await event('Kigali Build Weekend', 'hackathon', 'Kigali', 'Norrsken House', dateAgo(96), dateAgo(94), true, ['Emmanuel Rukundo', 'Chidinma Eze'], 'attendee');
  await event('CMU-Africa cohort welcome', 'party', 'Kigali', 'CMU-Africa campus', '2024-08-20', undefined, true, ['Chidinma Eze', 'Kwame Boateng', 'Aline Ingabire'], 'attendee');
  await event("Sandrine and Bruno's wedding", 'wedding', 'Musanze', 'Lake Ruhondo', dateAgo(160), undefined, true, ['Bruno Iradukunda', 'Sandrine Mukashema', 'Olivier Bizimana'], 'attendee');
  await event('18-786 Deep Learning Systems, first lecture', 'class', 'Kigali', 'CMU-Africa campus', dateAgo(20), undefined, true, ['Chidinma Eze'], 'student');
  await event('Annual medical check-up', 'appointment', 'Kigali', 'Kimihurura clinic', dateAgo(15), undefined, true, [], 'attendee');
  await event('Zamba Logistics offer conversation', 'appointment', 'Kigali', 'Zamba head office', dateAgo(19), undefined, true, ['Josephine Uwera'], 'attendee');
  await event('Residence permit renewal', 'appointment', 'Kigali', 'Immigration office', dateAgo(-14), undefined, false, [], 'attendee');
  await event('Deep Learning Indaba 2026', 'conference', 'Accra', 'University of Ghana', dateAgo(-64), dateAgo(-58), false, ['Tunde Bakare'], 'attendee');

  const taskFull = async (
    title: string,
    status: string,
    priority: string,
    opts: { dueDaysAgo?: number; scheduledDaysAgo?: number; effort?: number; completedDaysAgo?: number; about?: string; notes?: string } = {},
  ) => {
    const t = await repository.createNode({
      type: 'task',
      title,
      props: {
        status,
        priority,
        ...(opts.dueDaysAgo === undefined ? {} : { due: dateAgo(opts.dueDaysAgo) }),
        ...(opts.scheduledDaysAgo === undefined ? {} : { scheduled: dateAgo(opts.scheduledDaysAgo) }),
        ...(opts.effort ? { effort_min: opts.effort } : {}),
        ...(opts.completedDaysAgo === undefined ? {} : { completed_at: daysAgo(opts.completedDaysAgo) }),
      },
      ...(opts.notes ? { notes_md: opts.notes } : {}),
      source: 'manual',
    });
    if (opts.about) await repository.createEdge({ type: 'ABOUT', src: t.id, dst: opts.about, source: 'manual' });
    return t.id;
  };
  await taskFull('Answer the Zamba offer', 'doing', 'p1', { dueDaysAgo: -5, effort: 60, about: appZamba, notes: 'Ask about the on-call rotation before saying yes.' });
  await taskFull('Send the Savanna Grid take-home', 'doing', 'p1', { dueDaysAgo: -2, effort: 240, about: appSavanna });
  await taskFull('Prepare the Tembo leadership panel', 'next', 'p1', { dueDaysAgo: -6, effort: 120, about: appTembo });
  await taskFull('Finish the Ubwenge cover letter', 'next', 'p2', { dueDaysAgo: -1, effort: 45 });
  await taskFull('Book the thesis proposal slot', 'next', 'p2', { dueDaysAgo: -11, effort: 15 });
  await taskFull('Rerun the calibration sweep with the new sensor batch', 'next', 'p2', { effort: 180 });
  await taskFull('Write up the fleet ingestion post-mortem', 'next', 'p3', { effort: 90 });
  await taskFull('Chase the AFRICON travel reimbursement', 'waiting', 'p3', { dueDaysAgo: -20, notes: 'With the finance office since the 14th.' });
  await taskFull('Wait on the Amani recruiter to rebook', 'waiting', 'p3', { about: appAmani });
  await taskFull('Renew the residence permit', 'waiting', 'p2', { dueDaysAgo: -14 });
  await taskFull('Reply to Gideon or mute the thread', 'inbox', 'p4');
  await taskFull('Read the event-camera paper Jean-Paul sent', 'inbox', 'p4', { effort: 45 });
  await taskFull('Decide whether to keep organising PyData after the move', 'inbox', 'p3');
  await taskFull('Back up the corpus recordings off the laptop', 'inbox', 'p2', { effort: 30 });
  await taskFull('Submit the journal camera-ready', 'done', 'p1', { completedDaysAgo: 11, effort: 120 });
  await taskFull('Send Peter the forecast error analysis', 'done', 'p2', { completedDaysAgo: 16 });
  await taskFull('File the Zamba contract invoices', 'done', 'p3', { completedDaysAgo: 30, effort: 45 });
  await taskFull('Update the résumé base with the contract work', 'done', 'p2', { completedDaysAgo: 44 });
  await taskFull('Ask Yasmine for the reference', 'done', 'p1', { completedDaysAgo: 497 });
  await taskFull('Apply to the Meridian analytics role', 'dropped', 'p3', { notes: 'Dropped when I withdrew from the process.' });
  await taskFull('Learn Rust properly this year', 'dropped', 'p4', { notes: 'Twenty-four percent of a course is not learning Rust.' });

  const goalFull = async (
    title: string,
    horizon: string,
    status: string,
    criteria: string,
    keyResults: Array<{ name: string; current: number; target: number; unit: string; done?: boolean }>,
    targetDate?: string,
    motivation?: string,
  ) =>
    repository.createNode({
      type: 'goal',
      title,
      props: {
        horizon,
        goal_status: status,
        success_criteria: criteria,
        key_results: keyResults,
        ...(targetDate ? { target_date: targetDate } : {}),
        ...(motivation ? { motivation } : {}),
      },
      source: 'manual',
    });
  await goalFull('Ship the corpus recordings this month', 'month', 'active', 'All 400 prompts recorded and aligned.', [{ name: 'Prompts recorded', current: 268, target: 400, unit: 'prompts' }], dateAgo(-24));
  await goalFull('Close the job search this quarter', 'quarter', 'active', 'A signed offer I would take twice.', [
    { name: 'Offers in hand', current: 1, target: 2, unit: 'offers' },
    { name: 'Loops finished', current: 3, target: 5, unit: 'loops' },
  ], dateAgo(-70), 'The contract ends and the fee-free window closes at the same time.');
  await goalFull('Run a half marathon under 1:50', 'year', 'paused', 'Chip time under 1:50 on a certified course.', [{ name: 'Best time', current: 116, target: 110, unit: 'minutes' }], undefined, 'Paused during the interview loops.');
  await goalFull('Read twelve books a year, not twelve tabs', 'year', 'active', 'Twelve finished, with notes.', [{ name: 'Finished', current: 7, target: 12, unit: 'books' }], undefined);
  await goalFull('Teach one hundred students before I turn forty', 'life', 'active', 'A hundred people who wrote their first program with me in the room.', [{ name: 'Students', current: 62, target: 100, unit: 'students' }]);
  await goalFull('Finish the Data Engineering Zoomcamp', 'quarter', 'achieved', 'Certificate issued.', [{ name: 'Modules', current: 6, target: 6, unit: 'modules', done: true }], '2024-04-30');
  await goalFull('Move the family business onto the new system', 'year', 'abandoned', 'Abandoned: they were happy with the spreadsheets.', [{ name: 'Modules migrated', current: 1, target: 4, unit: 'modules' }]);

  const habitFull = async (
    title: string,
    cadence: string,
    perPeriod: number,
    scheduleDays: number[],
    active: boolean,
    startedOn: string,
    cue: string,
    why: string,
    checkedDays: number[],
  ) => {
    const h = await repository.createNode({
      type: 'habit',
      title,
      props: { cadence, target_per_period: perPeriod, schedule_days: scheduleDays, active, started_on: startedOn, cue, why },
      source: 'manual',
    });
    for (const d of checkedDays) {
      const date = dateAgo(d);
      await repository.docPut('habit_checks', `${h.id}_${date}`, { habit_id: h.id, date, created_at: nowIso() });
    }
    return h.id;
  };
  // A dot grid is only legible when the dots have gaps in them, so these
  // streaks are written with the misses left in.
  const everyOtherDay = Array.from({ length: 45 }, (_, i) => i * 2).filter((d) => d % 14 !== 6);
  const weekdays = Array.from({ length: 60 }, (_, i) => i).filter((d) => d % 7 !== 3 && d % 7 !== 4);
  await habitFull('Morning run', 'weekly', 3, [1, 3, 6], true, '2023-01-09', 'Shoes by the door', 'The only thing that reliably fixes my sleep.', everyOtherDay.slice(0, 26));
  await habitFull('Read thirty pages', 'daily', 1, [], true, '2024-02-01', 'After dinner, phone in the other room', 'Twelve books a year does not happen by accident.', weekdays.slice(0, 34));
  await habitFull('Write the day down', 'daily', 1, [], true, '2025-06-01', 'Last thing, in the notebook', 'I forget what a week contained by Friday.', weekdays.slice(0, 22));
  await habitFull('Review the pipeline board', 'weekly', 1, [0], true, dateAgo(200), 'Sunday evening', 'Applications rot quietly when nobody looks at them.', [0, 7, 14, 21, 35, 42, 56]);
  await habitFull('Kinyarwanda flashcards', 'daily', 1, [], true, dateAgo(160), 'On the bus', 'Three years here and still apologising in English.', [0, 1, 3, 4, 6, 9, 10, 13, 17, 18, 22]);
  await habitFull('Inbox to zero', 'monthly', 1, [], false, '2023-03-01', 'First Saturday', 'Abandoned: it made me answer recruiters I did not want to answer.', [90, 120, 150]);

  const journalFull = async (title: string, agoDays: number, mood: number, energy: number, body: string, gratitude?: string) =>
    repository.createNode({
      type: 'journal_entry',
      title,
      props: { entry_date: dateAgo(agoDays), mood, energy, ...(gratitude ? { gratitude } : {}) },
      notes_md: body,
      source: 'manual',
    });
  await journalFull('Offer week', 1, 5, 4, 'Zamba put the offer in writing on Tuesday. It is the team I already know, which is either the safest possible choice or the least interesting one, and I cannot yet tell which.', 'Josephine, who did the whole thing without being asked.');
  await journalFull('Two loops in one week is too many', 8, 3, 2, 'Savanna take-home on Wednesday, Tembo panel on Friday. Both of them deserve a rested version of me and neither is getting one.');
  await journalFull('The camera-ready went out', 12, 4, 3, 'Nadia carried the last two weeks of it. I should say that out loud somewhere she can hear it.');
  await journalFull('Field trial, second attempt', 34, 4, 4, 'The sensors held up in the rain this time. Ines was right about the enclosure.');
  await journalFull('A quiet week, deliberately', 47, 4, 5, 'No interviews booked. Ran three times, read the whole Kleppmann chapter, slept.');
  await journalFull('Contract ended', 62, 3, 3, 'Last standup at Zamba. Ten months of fleet data and I still think the vendor formats are a practical joke.');
  await journalFull('Rejected by Lattice, and it was the right call', 138, 2, 2, 'They needed a body in Cape Town. I spent two days being annoyed about it and one day admitting they were right.');
  await journalFull('Poster day', 160, 5, 5, 'Best poster. Fatima made me cut the claims by half and the half that survived was the true part.', "Fatima's red pen.");
  await journalFull('Started the Kinyarwanda class', 160, 4, 4, 'Three years of pointing at things. Enough.');
  await journalFull('The Sokoni design round went badly', 190, 2, 3, 'I described a feature store I had read about as though I had run one. He noticed within four minutes.');
  await journalFull('First week of the contract', 420, 4, 4, 'Four telematics vendors, four schemas, one deadline. I have missed this.');
  await journalFull('Term starts again', 360, 3, 4, 'Second year. The cohort has thinned out and the ones left are the ones who were always going to finish.');
  await journalFull('Cairo, briefly', 700, 4, 3, 'Two weeks with my parents and one afternoon at the old office. Hossam has grey hair now, which seems unfair since I do too.');
  await journalFull('Landed in Kigali', 900, 3, 2, 'One suitcase, a rented room in Kimihurura, and no idea whether this was brave or stupid.');

  const idea = async (title: string, status: string, oneLiner: string, excitement: number, problem?: string, effort?: string, next?: string) =>
    repository.createNode({
      type: 'idea',
      title,
      props: {
        status,
        one_liner: oneLiner,
        excitement,
        ...(problem ? { problem } : {}),
        ...(effort ? { effort_guess: effort } : {}),
        ...(next ? { next_experiment: next } : {}),
      },
      source: 'manual',
    });
  await idea('Vendor-agnostic telematics schema', 'shipped', 'One ingest contract that four vendors can be mapped onto.', 5, 'Every vendor invents its own timestamp convention.', 'months', 'Already shipped at Zamba; write it up publicly.');
  await idea('Reference letter tracker', 'spark', 'Know who owes you a letter, and who you owe one to, before you need it.', 3, 'I asked Yasmine four days before a deadline.', 'days');
  await idea('Sensor enclosure for two dollars', 'explored', 'A rain-proof housing printed from a single part.', 4, 'The commercial enclosures cost more than the sensor.', 'weeks', 'Print three and leave them on the roof for a month.');
  await idea('Kinyarwanda spaced repetition from real transcripts', 'building', 'Cards generated from the corpus instead of a phrasebook.', 4, 'Phrasebook sentences are not sentences anyone says.', 'weeks');
  await idea('Interview debrief template', 'shipped', 'Ten minutes of writing after every loop, in the same shape every time.', 4, 'I could not remember what went wrong at Sokoni.', 'hours');
  await idea('Public register of African tech salary bands', 'discarded', 'Crowd-sourced compensation data by city and level.', 2, 'Nobody wants to be the first entry.', 'months', 'Discarded: the trust problem is the whole problem.');
  await idea('Bus dataset as a live feed', 'explored', 'Move from a quarterly dump to a maintained feed.', 3, 'The dataset is already six months stale.', 'weeks');

  // Posts and reactions: the shape of a professional feed, which is neither an
  // interaction nor a publication and was the one node type this seed missed.
  const post = async (
    title: string,
    postKind: string,
    text: string,
    postedDaysAgo: number,
    engagement: { likes: number; comments: number; reposts: number; views: number },
    aboutId?: string,
  ) => {
    const p = await repository.createNode({
      type: 'post',
      title,
      props: { post_kind: postKind, text, posted_at: daysAgo(postedDaysAgo), lang: 'en', engagement, url: 'https://linkedin.com/in/jordan-demo/recent' },
      source: 'manual',
    });
    await repository.createEdge({ type: 'AUTHORED', src: self.id, dst: p.id, source: 'manual' });
    if (aboutId) await repository.createEdge({ type: 'ABOUT', src: p.id, dst: aboutId, source: 'manual' });
    return p.id;
  };
  const postFleet = await post('Four vendors, one ingest contract', 'article', 'Ten months of fleet telemetry taught me that the schema is the easy part and the timestamps are the hard one.', 40, { likes: 214, comments: 31, reposts: 18, views: 9_400 }, pFleet);
  const postPaper = await post('Our AFRICON paper is out', 'post', 'Sensor fusion on hardware you can actually afford. Co-authored with Felix Mugisha and Aisha Bello.', 165, { likes: 402, comments: 44, reposts: 37, views: 15_200 }, pubFleet);
  const postCorpus = await post('Looking for Kinyarwanda readers', 'post', 'We need forty more voices for the corpus. Two hours, paid, no experience needed.', 74, { likes: 128, comments: 52, reposts: 61, views: 7_800 }, pSpeech);
  await post('Deterministic beats clever', 'share', 'Sharing the long version of an argument I have made in three interviews this month.', 84, { likes: 96, comments: 12, reposts: 7, views: 3_100 }, pubBlog);
  await post('On the reconciliation rewrite, eight years on', 'article', 'The matcher is still running. Nobody has touched it since 2019, which is the highest praise a batch job can get.', 300, { likes: 173, comments: 22, reposts: 9, views: 6_600 }, pReconcile);
  await post('Re: feature stores', 'comment', 'The version I described in that interview did not exist. The one you have built clearly does. What does the write path cost you?', 188, { likes: 14, comments: 2, reposts: 0, views: 480 }, postFleet);
  await post('Saturday club, year three', 'post', 'Sixty-two students so far. Two of them are now teaching the beginners class.', 130, { likes: 311, comments: 40, reposts: 12, views: 11_000 }, pClub);

  for (const [name, postId, reaction, agoDays] of [
    ['Felix Mugisha', postFleet, 'celebrate', 39],
    ['Peter Njoroge', postFleet, 'insightful', 38],
    ['Wanjiku Kamau', postCorpus, 'support', 73],
    ['Sofia Almeida', postPaper, 'celebrate', 164],
    ['Yasmine Farouk', postPaper, 'like', 163],
    ['Chidinma Eze', postCorpus, 'love', 72],
  ] as Array<[string, string, string, number]>) {
    await repository.createEdge({
      type: 'REACTED_TO',
      src: who(name),
      dst: postId,
      props: { reaction_kind: reaction, reacted_on: dateAgo(agoDays) },
      source: 'manual',
    });
  }

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

  const hl = await repository.createNode({ type: 'highlight', title: 'On log-structured storage', props: { excerpt: 'The log is the heart of the system...', loc_ref: 'ch. 3', thought: 'Applies to my artifact-record design in the RL study.' }, source: 'manual' });
  await repository.createEdge({ type: 'ABOUT', src: hl.id, dst: book.id, source: 'manual' });
  await repository.createNode({ type: 'highlight', title: 'Reward shaping pitfalls', props: { excerpt: 'Shaped rewards leak designer assumptions...', loc_ref: '32:10', thought: 'Cited in the symposium poster.' }, source: 'manual' });

  await repository.createNode({ type: 'asset', title: 'ThinkPad T14 Gen 5', props: { category: 'electronics', vendor: 'Lenovo', model: 'T14 Gen 5', purchased_on: '2024-09-01', price: { amount: 1250, currency: 'USD' }, warranty_until: '2027-09-01', asset_status: 'owned' }, source: 'manual' });
  await repository.createNode({ type: 'asset', title: 'Saleae Logic 8 analyzer', props: { category: 'electronics', vendor: 'Saleae', purchased_on: '2025-02-10', price: { amount: 399, currency: 'USD' }, asset_status: 'owned' }, source: 'manual' });

  await repository.createNode({ type: 'health_log', title: 'Morning run: 5k along the ridge', props: { metric: 'workout', value: 5, unit: 'km', logged_at: daysAgo(1) }, sensitivity: 'sensitive', source: 'manual' });
  await repository.createNode({ type: 'health_log', title: 'Sleep: 7.5h', props: { metric: 'sleep_h', value: 7.5, unit: 'h', logged_at: daysAgo(0) }, sensitivity: 'sensitive', source: 'manual' });

  await repository.createNode({ type: 'account', title: 'Hetzner Cloud', props: { kind: 'online', service: 'Hetzner', url: 'https://console.hetzner.cloud', cost: { amount: 9, currency: 'EUR', period: 'monthly' }, account_status: 'active' }, source: 'manual' });
  await repository.createNode({ type: 'account', title: 'Bank of Kigali (savings)', props: { kind: 'financial', identifier_masked: '...7204', account_status: 'active' }, sensitivity: 'sensitive', source: 'manual' });

  // ── The long tail, at the size a real one is ────────────────────────────────
  //
  // Two of everything makes each screen render and none of them worth opening.
  // The counts below are what a person actually accumulates: a reading list
  // with a backlog in it, receipts going back years, a passport's worth of
  // trips, and health records dense enough to draw a line through.
  const linkFull = async (
    title: string,
    url: string,
    reason: string,
    readStatus: string,
    opts: { sharedBy?: string; mentions?: string; description?: string } = {},
  ) => {
    const l = await repository.createNode({
      type: 'link',
      title,
      props: {
        url,
        domain: new URL(url).hostname,
        saved_reason: reason,
        read_status: readStatus,
        ...(opts.description ? { description: opts.description } : {}),
      },
      source: 'import_bookmarks',
    });
    if (opts.sharedBy) await repository.createEdge({ type: 'SHARED_BY', src: l.id, dst: opts.sharedBy, props: { shared_on: dateAgo(30) }, source: 'manual' });
    if (opts.mentions) await repository.createEdge({ type: 'MENTIONS', src: l.id, dst: opts.mentions, source: 'manual' });
    return l.id;
  };
  await linkFull('The Log: What every software engineer should know', 'https://engineering.linkedin.com/distributed-systems/log-what-every-software-engineer-should-know', 'the piece that made the reconciliation design obvious', 'reference', { mentions: pReconcile });
  await linkFull('Airflow anti-patterns nobody warns you about', 'https://blog.example.com/airflow-antipatterns', 'read before the Zamba contract', 'read', { sharedBy: who('Felix Mugisha'), mentions: pFleet });
  await linkFull('dbt best practices guide', 'https://docs.getdbt.com/best-practices', 'the modelling conventions I copied', 'reference');
  await linkFull('Designing a low-cost sensor enclosure', 'https://hackaday.example.com/sensor-enclosure', 'for the cold-chain pilot', 'read', { mentions: pColdChain });
  await linkFull('Low-resource ASR: a practical survey', 'https://arxiv.org/abs/demo-asr', 'background for the corpus work', 'read', { sharedBy: who('Nadia Belkacem'), mentions: pSpeech });
  await linkFull('What to ask in a final-round interview', 'https://example.com/final-round-questions', 'before the Zamba values call', 'read');
  await linkFull('Negotiating an offer without burning it', 'https://example.com/negotiation', 'this week', 'unread');
  await linkFull('The Rwandan open data portal', 'https://statistics.gov.rw', 'source for the district atlas', 'reference', { mentions: pGeoAtlas });
  await linkFull('DuckDB for people who like Postgres', 'https://duckdb.org/why_duckdb', 'why the fleet models moved off Spark', 'read');
  await linkFull('A field guide to reading academic papers', 'https://example.com/reading-papers', 'gave this to the whole cohort', 'reference', { sharedBy: who('Prof. Elias Mwangi') });
  await linkFull('Kigali half marathon: the course notes', 'https://example.com/kigali-half', 'race prep', 'read', { sharedBy: who('Olivier Bizimana') });
  await linkFull('How to write a good post-mortem', 'https://example.com/postmortems', 'for the fleet ingestion write-up', 'unread');
  await linkFull('Reproducible research with content hashing', 'https://example.com/content-hashing', 'the artifact-record design came from here', 'reference', { mentions: pRlStudy });
  await linkFull('Grid demand forecasting: a baseline that is hard to beat', 'https://example.com/forecast-baseline', 'the baseline Peter made me use', 'reference', { sharedBy: who('Peter Njoroge'), mentions: pGridForecast });
  await linkFull('Why your Kubernetes bill is what it is', 'https://example.com/k8s-cost', 'saved during the Karibu application', 'unread');

  const docRecord = async (title: string, docKind: string, issuedOn: string, extracted: string, expiresOn?: string, sensitive = false) =>
    repository.createNode({
      type: 'document',
      title,
      props: { doc_kind: docKind, issued_on: issuedOn, extracted_text: extracted, ...(expiresOn ? { expires_on: expiresOn } : {}) },
      ...(sensitive ? { sensitivity: 'sensitive' as const } : {}),
      source: 'manual',
    });
  await docRecord('Zamba Logistics contractor agreement', 'contract', '2025-01-28', 'Fixed-term data engineering services, 3 February to 19 December 2025.', '2025-12-19');
  await docRecord('Zamba Logistics offer letter', 'contract', dateAgo(12), 'Data Platform Engineer, permanent, starting 5 January.', undefined, true);
  await docRecord('Sohag Technical Institute transcript', 'transcript', '2012-07-14', 'Diploma in Information Technology, second in cohort.');
  await docRecord('CMU-Africa transcript (in progress)', 'transcript', dateAgo(40), 'MSc ECE: 8 courses completed, QPA 3.71.');
  await docRecord('Certified Kubernetes Administrator certificate', 'certificate', '2024-11-04', 'CKA-9F22, valid to November 2027.', '2027-11-04');
  await docRecord('Rwanda residence permit', 'certificate', '2024-08-01', 'Student residence permit, renewable annually.', dateAgo(-14), true);
  await docRecord('Bank statement, quarter to date', 'statement', dateAgo(9), 'Three months of transactions.', undefined, true);
  await docRecord('AFRICON camera-ready manuscript', 'paper', '2026-04-30', 'Benchmarking sensor fusion on low-cost fleet telematics: final PDF.');
  await docRecord('Fleet ingestion operations runbook', 'manual', '2025-11-14', 'How to add a vendor, replay a day, and read the validation report.');
  await docRecord('Apartment lease, Kimihurura', 'contract', '2024-07-15', 'Twelve-month lease, renewable.', '2026-07-15', true);
  await docRecord('Saturday club parental consent forms', 'other', dateAgo(120), 'Signed consent for the current cohort.', undefined, true);

  const subscription = async (title: string, vendor: string, category: string, plan: string, amount: number, currency: string, period: string, renewsInDays: number, status: string) =>
    repository.createNode({
      type: 'subscription',
      title,
      props: {
        vendor,
        category,
        plan,
        cost: { amount, currency, period },
        renews_on: dateAgo(-renewsInDays),
        started_on: dateAgo(400),
        sub_status: status,
        url: `https://${vendor.toLowerCase().replace(/\s+/g, '')}.example/billing`,
      },
      source: 'manual',
    });
  await subscription('GitHub Pro', 'GitHub', 'software', 'Pro', 4, 'USD', 'monthly', 9, 'active');
  await subscription('Overleaf Standard', 'Overleaf', 'software', 'Standard', 199, 'USD', 'yearly', 64, 'active');
  await subscription('Spotify Duo', 'Spotify', 'media', 'Duo', 12_000, 'RWF', 'monthly', 4, 'active');
  await subscription('Kigali Runners club membership', 'Kigali Runners', 'membership', 'Annual', 60_000, 'RWF', 'yearly', 120, 'active');
  await subscription('JetBrains All Products Pack', 'JetBrains', 'software', 'Individual', 289, 'USD', 'yearly', 17, 'active');
  await subscription('Backblaze B2', 'Backblaze', 'cloud', 'Pay as you go', 6, 'USD', 'monthly', 21, 'active');
  await subscription('IEEE student membership', 'IEEE', 'membership', 'Student', 32, 'USD', 'yearly', 200, 'trial');
  await subscription('Kindle Unlimited', 'Amazon', 'media', 'Unlimited', 10, 'USD', 'monthly', -40, 'cancelled');

  const place = async (title: string, kind: string, lat: number, lng: number, cc: string, address?: string) =>
    (
      await repository.createNode({
        type: 'location',
        title,
        props: { kind, lat, lng, country_code: cc, city: title, ...(address ? { address } : {}) },
        source: 'manual',
      })
    ).id;
  const kimihurura = await place('Kimihurura', 'address', -1.9490, 30.0930, 'RW', 'KG 5 Ave, Kimihurura, Kigali');
  const sohag = await place('Sohag', 'city', 26.5591, 31.6957, 'EG');
  const kampala = await place('Kampala', 'city', 0.3476, 32.5825, 'UG');
  const capeTown = await place('Cape Town', 'city', -33.9249, 18.4241, 'ZA');
  const gaborone = await place('Gaborone', 'city', -24.6282, 25.9231, 'BW');
  const dakar = await place('Dakar', 'city', 14.7167, -17.4677, 'SN');
  const accra = await place('Accra', 'city', 5.6037, -0.1870, 'GH');
  const musanze = await place('Musanze', 'city', -1.4990, 29.6349, 'RW');
  const dubai = await place('Dubai', 'city', 25.2048, 55.2708, 'AE');
  const seoul = await place('Seoul', 'city', 37.5665, 126.9780, 'KR');
  const rwanda = await place('Rwanda', 'country', -1.9403, 29.8739, 'RW');
  await repository.createEdge({ type: 'LOCATED_IN', src: self.id, dst: kimihurura, props: { precision: 'exact' }, source: 'manual' });
  await repository.createEdge({ type: 'LOCATED_IN', src: kimihurura, dst: rwanda, props: { precision: 'approximate' }, source: 'manual' });
  for (const dst of [sohag, kampala, capeTown, gaborone, dakar, musanze, dubai, seoul]) {
    await repository.createEdge({ type: 'VISITED', src: self.id, dst, source: 'manual' });
  }

  const trip = async (title: string, destination: string, purpose: string, start: string, end: string, transport: string[], highlights: string, locationId?: string, nights?: number) => {
    const t = await repository.createNode({
      type: 'trip',
      title,
      props: { destination, purpose, transport, highlights, budget: { amount: 900, currency: 'USD' } },
      start_date: start,
      end_date: end,
      source: 'manual',
    });
    if (locationId) {
      await repository.createEdge({ type: 'VISITED', src: t.id, dst: locationId, ...(nights ? { props: { nights } } : {}), source: 'manual' });
    }
    return t.id;
  };
  await trip('Dakar: Indaba 2024', 'Dakar', 'conference', '2024-08-24', '2024-09-01', ['plane'], 'First Indaba. Met Tunde and Sofia in the same afternoon.', dakar, 8);
  await trip('Cape Town: the Lattice Bio loop', 'Cape Town', 'work', dateAgo(140), dateAgo(136), ['plane'], 'Four days, one onsite, one rejection, one very good hike.', capeTown, 4);
  await trip('Gaborone: contract kickoff', 'Gaborone', 'work', '2022-09-12', '2022-09-17', ['plane'], 'A week in a borrowed office learning what "open data" means to a funder.', gaborone, 5);
  await trip('Kampala: Tembo site visit', 'Kampala', 'work', dateAgo(300), dateAgo(296), ['bus'], 'Saw a vaccine fridge fail in real time, which changed the whole pilot design.', kampala, 4);
  await trip('Sohag: family, and the old workshop', 'Sohag', 'family', dateAgo(340), dateAgo(326), ['plane', 'train'], 'Ahmed still has the first server rack I built.', sohag, 14);
  await trip('Musanze: the wedding', 'Musanze', 'vacation', dateAgo(161), dateAgo(158), ['car'], 'Bruno and Sandrine, on a hill, in the rain, perfectly.', musanze, 3);
  await trip('Seoul: three weeks at home', 'Seoul', 'family', '2023-12-18', '2024-01-08', ['plane'], 'The longest stretch with my parents since I left.', seoul, 21);
  await trip('Kigali → Cairo: relocation', 'Cairo', 'relocation', '2021-01-25', '2021-02-02', ['plane'], 'One suitcase and a monitor I should have sold.', undefined);
  await trip('Accra: Indaba 2026', 'Accra', 'conference', dateAgo(-64), dateAgo(-58), ['plane'], 'Booked, not yet taken.', accra, 6);

  const media = async (
    title: string,
    kind: string,
    creator: string,
    status: string,
    opts: { rating?: number; startedDaysAgo?: number; finishedDaysAgo?: number; sharedBy?: string; takeaways?: string; url?: string } = {},
  ) => {
    const m = await repository.createNode({
      type: 'media_item',
      title,
      props: {
        media_kind: kind,
        creator,
        consumption_status: status,
        ...(opts.rating ? { rating: opts.rating } : {}),
        ...(opts.startedDaysAgo === undefined ? {} : { started_on: dateAgo(opts.startedDaysAgo) }),
        ...(opts.finishedDaysAgo === undefined ? {} : { finished_on: dateAgo(opts.finishedDaysAgo) }),
        ...(opts.takeaways ? { key_takeaways: opts.takeaways } : {}),
        ...(opts.url ? { url: opts.url } : {}),
      },
      source: 'manual',
    });
    if (opts.sharedBy) await repository.createEdge({ type: 'SHARED_BY', src: m.id, dst: opts.sharedBy, props: { channel: 'conversation' }, source: 'manual' });
    return m.id;
  };
  const mStaff = await media("The Staff Engineer's Path", 'book', 'Tanya Reilly', 'done', { rating: 5, startedDaysAgo: 250, finishedDaysAgo: 210, sharedBy: who('Yasmine Farouk'), takeaways: 'Scope is a thing you are given and a thing you take. Mostly the second.' });
  const mThinking = await media('Thinking in Systems', 'book', 'Donella Meadows', 'done', { rating: 5, startedDaysAgo: 400, finishedDaysAgo: 360 });
  await media('The Pragmatic Programmer', 'book', 'Hunt and Thomas', 'done', { rating: 4, finishedDaysAgo: 1200 });
  await media('Fundamentals of Data Engineering', 'book', 'Reis and Housley', 'in_progress', { rating: 4, startedDaysAgo: 60 });
  await media('A Philosophy of Software Design', 'book', 'John Ousterhout', 'want');
  await media('Half of a Yellow Sun', 'book', 'Chimamanda Ngozi Adichie', 'done', { rating: 5, finishedDaysAgo: 95, sharedBy: who('Chidinma Eze') });
  await media('The Emperor of All Maladies', 'book', 'Siddhartha Mukherjee', 'abandoned', { rating: 3, startedDaysAgo: 500 });
  const mAttention = await media('Attention Is All You Need', 'paper', 'Vaswani et al.', 'done', { rating: 5, finishedDaysAgo: 700, url: 'https://arxiv.org/abs/1706.03762' });
  await media('An Empirical Study of Data Pipeline Failures', 'paper', 'Various', 'in_progress', { startedDaysAgo: 25 });
  await media('The Rise of the Data Engineer', 'article', 'Maxime Beauchemin', 'done', { rating: 4, finishedDaysAgo: 800 });
  await media('Data Engineering Podcast: warehouse modelling', 'podcast', 'Tobias Macey', 'done', { rating: 4, finishedDaysAgo: 45 });
  await media('The Rest Is History: the Suez Canal', 'podcast', 'Holland and Sandbrook', 'done', { rating: 5, finishedDaysAgo: 20 });
  await media('Timbuktu', 'film', 'Abderrahmane Sissako', 'done', { rating: 5, finishedDaysAgo: 180 });
  await media('3Blue1Brown: the essence of linear algebra', 'video', 'Grant Sanderson', 'done', { rating: 5, finishedDaysAgo: 900 });
  await media('Advanced dbt: incremental models', 'course', 'dbt Labs', 'done', { rating: 4, finishedDaysAgo: 130 });

  const highlight = async (title: string, excerpt: string, locRef: string, thought: string, aboutId: string) => {
    const h = await repository.createNode({
      type: 'highlight',
      title,
      props: { excerpt, loc_ref: locRef, thought },
      source: 'manual',
    });
    await repository.createEdge({ type: 'ABOUT', src: h.id, dst: aboutId, source: 'manual' });
    return h.id;
  };
  await highlight('Glue work is work', 'The work that holds a project together is often invisible precisely because it worked.', 'p. 141', 'This is most of what I did on the fleet contract and none of what is on my résumé.', mStaff);
  await highlight('On taking scope', 'Nobody is going to hand you the interesting problem. They are going to hand you the urgent one.', 'p. 88', 'Relevant to the Zamba decision.', mStaff);
  await highlight('Leverage points', 'The least effective place to intervene in a system is at the level of numbers. The most effective is at the level of paradigms.', 'ch. 6', 'Dashboards are numbers. The validation contract is a paradigm.', mThinking);
  await highlight('Bounded rationality', 'People make reasonable decisions based on the information they have, which is never all of it.', 'ch. 4', 'Applies to every vendor whose timestamp format I have cursed.', mThinking);
  await highlight('On attention weights', 'Attention allows modelling of dependencies without regard to their distance in the input.', 'sec. 3.2', 'The sentence the last eight years of my field rests on.', mAttention);

  const asset = async (title: string, category: string, vendor: string, model: string, purchasedOn: string, amount: number, currency: string, status: string, warranty?: string, serial?: string) =>
    repository.createNode({
      type: 'asset',
      title,
      props: {
        category,
        vendor,
        model,
        purchased_on: purchasedOn,
        price: { amount, currency },
        asset_status: status,
        ...(warranty ? { warranty_until: warranty } : {}),
        ...(serial ? { serial } : {}),
      },
      source: 'manual',
    });
  await asset('Dell UltraSharp U2723QE', 'electronics', 'Dell', 'U2723QE', '2025-01-20', 620, 'USD', 'owned', '2028-01-20', 'CN0X4-2723');
  await asset('Raspberry Pi 5 cluster (4 nodes)', 'electronics', 'Raspberry Pi', 'Pi 5 8GB', '2025-03-11', 460, 'USD', 'owned');
  await asset('Prusa MK4 printer', 'electronics', 'Prusa', 'MK4', '2025-06-02', 1_100, 'USD', 'owned', '2027-06-02');
  await asset('Yamaha P-125 keyboard', 'instrument', 'Yamaha', 'P-125', '2023-04-18', 700, 'USD', 'owned');
  await asset('Toyota RAV4 (2014)', 'vehicle', 'Toyota', 'RAV4', '2024-10-05', 9_800, 'USD', 'owned', undefined, 'JTMBF-4XA-014');
  await asset('Standing desk', 'furniture', 'Flexispot', 'E7', '2024-09-14', 380, 'USD', 'owned');
  await asset('MacBook Air M1', 'electronics', 'Apple', 'MacBook Air M1', '2021-03-08', 999, 'USD', 'sold');
  await asset('Espresso machine', 'appliance', 'Gaggia', 'Classic Pro', '2023-08-20', 450, 'USD', 'broken');
  await asset('Road bike', 'vehicle', 'Giant', 'Contend 3', '2022-11-30', 700, 'USD', 'gifted');
  await asset('Field sensor kit (on loan from the lab)', 'other', 'CMU-Africa', 'Custom', dateAgo(210), 0, 'USD', 'owned');

  // Health is the one lane where a single reading says nothing: the point is
  // the series. Everything here is marked sensitive, which is also what makes
  // the sensitivity filter demonstrable.
  const healthLog = async (title: string, metric: string, value: number, unit: string, agoDays: number, note?: string) =>
    repository.createNode({
      type: 'health_log',
      title,
      props: { metric, value, unit, logged_at: daysAgo(agoDays), ...(note ? { note } : {}) },
      sensitivity: 'sensitive',
      source: 'manual',
    });
  for (const [i, hours] of [7.5, 6.2, 8.1, 7.0, 5.4, 7.8, 8.4, 6.9, 7.2, 6.1, 7.7, 8.0].entries()) {
    await healthLog(`Sleep: ${hours}h`, 'sleep_h', hours, 'h', i * 2 + 2);
  }
  for (const [i, km] of [5, 12, 5, 8, 21.1, 5, 10].entries()) {
    await healthLog(`Run: ${km}km`, 'workout', km, 'km', i * 5 + 3, km === 21.1 ? 'Kigali half. 1:56, which is not 1:50.' : undefined);
  }
  await healthLog('Weight', 'weight', 74.5, 'kg', 2);
  await healthLog('Weight', 'weight', 76.1, 'kg', 90);
  await healthLog('Weight', 'weight', 77.8, 'kg', 200);
  await healthLog('Annual check-up', 'checkup', 1, 'visit', 15, 'All clear. Advised to sleep more, which is fair.');
  await healthLog('Chest infection', 'illness', 6, 'days', 240, 'Six days off, one missed deadline.');
  await healthLog('Mood: interview week', 'mood', 2, 'score', 8);
  await healthLog('Mood: after the offer', 'mood', 5, 'score', 1);

  const account = async (title: string, kind: string, service: string, status: string, opts: { url?: string; username?: string; masked?: string; amount?: number; currency?: string; period?: string; renewalDaysAgo?: number; sensitive?: boolean } = {}) =>
    repository.createNode({
      type: 'account',
      title,
      props: {
        kind,
        service,
        account_status: status,
        ...(opts.url ? { url: opts.url } : {}),
        ...(opts.username ? { username: opts.username } : {}),
        ...(opts.masked ? { identifier_masked: opts.masked } : {}),
        ...(opts.amount ? { cost: { amount: opts.amount, currency: opts.currency ?? 'USD', period: opts.period ?? 'monthly' } } : {}),
        ...(opts.renewalDaysAgo === undefined ? {} : { renewal_on: dateAgo(opts.renewalDaysAgo) }),
      },
      ...(opts.sensitive ? { sensitivity: 'sensitive' as const } : {}),
      source: 'manual',
    });
  await account('REG electricity', 'utility', 'Rwanda Energy Group', 'active', { masked: '...4471', amount: 18_000, currency: 'RWF', renewalDaysAgo: -8 });
  await account('WASAC water', 'utility', 'WASAC', 'active', { masked: '...9930', amount: 6_500, currency: 'RWF', renewalDaysAgo: -8 });
  await account('Canal Box fibre', 'utility', 'Canal Box', 'active', { amount: 35_000, currency: 'RWF', renewalDaysAgo: -3 });
  await account('MTN Rwanda mobile', 'utility', 'MTN', 'active', { masked: '...0731', amount: 12_000, currency: 'RWF', renewalDaysAgo: -19 });
  await account('GitHub', 'online', 'GitHub', 'active', { url: 'https://github.com/jordan-demo', username: 'jordan-demo' });
  await account('ORCID', 'online', 'ORCID', 'active', { url: 'https://orcid.org/0000-0000-0000-0000', username: '0000-0000-0000-0000' });
  await account('Equity Bank (current)', 'financial', 'Equity Bank Rwanda', 'active', { masked: '...5518', sensitive: true });
  await account('Old Egyptian bank account', 'financial', 'CIB Egypt', 'closed', { masked: '...2204', sensitive: true });

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
    { emphasis: 'technical', text: "Modeled the dealership's sales, stock, and supplier data into a normalized PostgreSQL schema with migration scripts." },
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
  // Seventy-two more, one per achievement across fourteen years. The library is
  // the point of the résumé engine: selection, coverage scoring and the page
  // budget all decide between candidates, and with twenty-one candidates every
  // decision is trivially "yes". A third of these carry a leadership wording as
  // well, which is what makes the emphasis switch change the document rather
  // than redraw it.
  interface AtomSpec {
    owner: string;
    end?: string;
    metrics?: Array<{ value: number | string; unit?: string; label?: string }>;
    skills: string[];
    technical: string;
    concise: string;
    leadership?: string;
    pinned?: boolean;
    blocked?: boolean;
  }
  const atomSpecs: AtomSpec[] = [
    // IT Support Technician, 2012-2014.
    { owner: rTech, end: '2014-08-15', metrics: [{ value: 120, unit: 'sites' }], skills: [sLinux, sBash], technical: 'Maintained Linux servers and point-of-sale terminals across 120 field sites, cutting repeat call-outs by writing the first diagnostic scripts the team had.', concise: 'Maintained Linux and point-of-sale estate across 120 field sites.' },
    { owner: rTech, end: '2014-08-15', metrics: [{ value: 40, unit: '%', label: 'ticket time' }], skills: [sBash, sSql], technical: 'Replaced a paper job-sheet process with a MySQL-backed ticket log, cutting average time-to-close by 40%.', concise: 'Replaced paper job sheets with a MySQL ticket log; 40% faster closes.' },
    { owner: rTech, end: '2014-08-15', skills: [sLinux, sTechWriting], technical: 'Wrote the field-service runbook that new technicians were trained from for the next six years.', concise: 'Wrote the field-service runbook used to train new technicians.', leadership: 'Wrote the field-service runbook that every technician hired after me was trained from.' },

    // Junior Web Developer, 2014-2016.
    { owner: rJunior, end: '2016-11-30', metrics: [{ value: 14, unit: 'client sites' }], skills: [sPhp, sLaravel], technical: 'Built and shipped 14 client sites on **PHP and Laravel**, owning delivery from brief to handover on the last six.', concise: 'Built and shipped 14 Laravel client sites end to end.', leadership: 'Owned delivery on six client builds from brief to handover, and set the conventions the other eight were built to.' },
    { owner: rJunior, end: '2016-11-30', metrics: [{ value: 3.4, unit: 's', label: 'load time' }], skills: [sPhp, sSql], technical: "Rewrote the agency's shared query layer, taking median page load from 3.4s to under 900ms across every client site.", concise: 'Rewrote the shared query layer; median load 3.4s to 900ms.' },
    { owner: rJunior, end: '2016-11-30', skills: [sJs, sFigma], technical: "Built the reusable component set the agency used for every subsequent build, working directly from the designers' files.", concise: "Built the agency's reusable front-end component set." },
    { owner: rJunior, end: '2016-11-30', metrics: [{ value: 9, unit: 'invoices/min' }], skills: [sPy, sCv], technical: 'Prototyped Arabic invoice recognition that turned a stack of supplier paperwork into 9 structured records a minute.', concise: 'Prototyped Arabic invoice recognition at 9 records a minute.' },

    // Software Engineer, Sahara Fintech, 2016-2019.
    { owner: rSwe, end: '2019-05-31', metrics: [{ value: 6, unit: 'hours', label: 'nightly close' }, { value: 4, unit: 'minutes' }], skills: [sPy, sPostgres], technical: 'Rebuilt the nightly settlement close as a **deterministic Python matcher over PostgreSQL**, taking a six-hour spreadsheet process to four minutes with a full audit trail.', concise: 'Rebuilt the nightly settlement close: six hours to four minutes.', leadership: 'Led the rebuild of the nightly settlement close, taking a six-hour manual process to four minutes and training three engineers to own it.', pinned: true },
    { owner: rSwe, end: '2019-05-31', metrics: [{ value: 99.98, unit: '%', label: 'match rate' }], skills: [sPy, sDq], technical: 'Raised the automated match rate from 96.1% to 99.98% by modelling partial payments and settlement windows explicitly rather than by threshold.', concise: 'Raised automated match rate from 96.1% to 99.98%.', leadership: 'Raised the settlement match rate to 99.98% by getting the finance team to write down rules they had only ever argued about.' },
    { owner: rSwe, end: '2019-05-31', metrics: [{ value: 2.1, unit: 'M', label: 'rows/day' }], skills: [sPostgres, sRedis], technical: 'Tuned the ledger schema and Redis cache path to carry 2.1M transaction rows a day without extending the batch window.', concise: 'Tuned ledger schema and cache to carry 2.1M rows a day.' },
    { owner: rSwe, end: '2019-05-31', skills: [sPytest, sCi], technical: "Introduced the team's first automated test suite and continuous integration pipeline, ending a release process that depended on one person's laptop.", concise: "Introduced the team's first test suite and CI pipeline.", leadership: "Introduced the team's first test suite and continuous integration, and ended a release process that ran from one person's laptop." },
    { owner: rSwe, end: '2019-05-31', skills: [sPy, sTechWriting], technical: 'Wrote the replay tooling and its documentation, so a bad settlement day could be reconstructed instead of argued about.', concise: 'Built and documented settlement replay tooling.' },

    // Senior Software Engineer, Sahara Fintech, 2019-2021.
    { owner: rSenior, end: '2021-01-31', metrics: [{ value: 11, unit: 'M', label: 'events/day' }], skills: [sPy, sKafka], technical: 'Designed the streaming anomaly-screening service on **Kafka**, scoring 11M ledger events a day against rules the risk team could edit themselves.', concise: 'Designed streaming anomaly screening over 11M events a day.', leadership: "Owned the anomaly-screening programme end to end, from the risk team's requirements through to the on-call rotation that runs it.", pinned: true },
    { owner: rSenior, end: '2021-01-31', metrics: [{ value: 63, unit: '%', label: 'false positives' }], skills: [sPy, sExperiment], technical: 'Cut false positives 63% by replacing static thresholds with per-merchant baselines, measured against a held-out month rather than against intuition.', concise: 'Cut screening false positives 63% with per-merchant baselines.' },
    { owner: rSenior, end: '2021-01-31', metrics: [{ value: 4, unit: 'engineers' }], skills: [sMentoring, sStakeholder], technical: 'Mentored four engineers through their first production incidents, and handed the service over cleanly when I left the country.', concise: 'Mentored four engineers and handed the service over cleanly.', leadership: 'Grew four engineers into owners of a service I had built, which is the only reason it survived my leaving.' },
    { owner: rSenior, end: '2021-01-31', skills: [sSecurity, sPostgres], technical: 'Closed a class of privilege-escalation defects by moving authorization out of the application and into row-level policies.', concise: 'Moved authorization into row-level policies, closing a defect class.' },
    { owner: rSenior, end: '2021-01-31', metrics: [{ value: 18, unit: 'minutes', label: 'MTTR' }], skills: [sCi, sGrafana], technical: "Built the service's alerting and dashboards, bringing mean time to recovery from over two hours to 18 minutes.", concise: 'Built alerting and dashboards; MTTR from 2h to 18 minutes.' },
    { owner: rSenior, end: '2021-01-31', skills: [sTechWriting], technical: 'Ran the incident review process for two years, writing every post-mortem as a description of the system rather than of the person on call.', concise: 'Ran the incident review process and wrote every post-mortem.', blocked: true },

    // Data Engineer, Savanna Grid, 2021-2022.
    { owner: rGrid, end: '2022-01-31', metrics: [{ value: 340, unit: 'k', label: 'meters' }], skills: [sPy, sSpark], technical: 'Built the ingestion path for telemetry from 340,000 grid meters, handling late and out-of-order arrivals as a first-class case rather than as an error.', concise: 'Built telemetry ingestion for 340,000 grid meters.', leadership: 'Led the ingestion rebuild for 340,000 grid meters and set the late-arrival policy the team still works to.', pinned: true },
    { owner: rGrid, end: '2022-01-31', metrics: [{ value: 47, unit: 'DAGs' }], skills: [sAirflow, sPy], technical: 'Migrated 47 cron-driven jobs onto **Airflow** with explicit dependencies, ending a class of silent partial failures nobody had been able to reproduce.', concise: 'Migrated 47 cron jobs to Airflow with explicit dependencies.', leadership: 'Ran the migration of 47 jobs onto Airflow across two teams, including the ones nobody wanted to own.' },
    { owner: rGrid, end: '2022-01-31', metrics: [{ value: 12, unit: '%', label: 'forecast error' }], skills: [sTimeSeries, sPy], technical: 'Cut day-ahead demand forecast error from 19% to 12% MAPE, and published the error analysis alongside it so the dispatch desk knew when not to trust it.', concise: 'Cut day-ahead forecast error from 19% to 12% MAPE.' },
    { owner: rGrid, end: '2022-01-31', skills: [sGcp, sSql], technical: 'Modelled the telemetry warehouse in BigQuery so an analyst could answer a substation question without asking an engineer.', concise: 'Modelled the telemetry warehouse so analysts were self-serve.' },
    { owner: rGrid, end: '2022-01-31', skills: [sDq, sPy], technical: 'Added contract tests at every ingest boundary, which caught a meter firmware change three days before it would have corrupted a quarter of billing.', concise: 'Added ingest contract tests that caught a firmware change early.' },

    // Freelance, Okavango Data Collective, 2022-2023.
    { owner: rFreelance, end: '2023-03-31', metrics: [{ value: 3, unit: 'consultants' }], skills: [sPy, sGeo], technical: 'Delivered a district indicator atlas that three previous consultants had returned unfinished, by cutting the scope to what the boundary data could actually support.', concise: 'Delivered a district indicator atlas three consultants had abandoned.', leadership: 'Took over an atlas three consultants had returned unfinished and delivered it by renegotiating the scope with the funder.', pinned: true },
    { owner: rFreelance, end: '2023-03-31', metrics: [{ value: 62, unit: 'indicators' }], skills: [sGeo, sSql], technical: 'Joined 62 published indicators to shifting district boundaries with an explicit reconciliation table, so a number can always be traced to the boundary version it was measured under.', concise: 'Reconciled 62 indicators across changing district boundaries.' },
    { owner: rFreelance, end: '2023-03-31', skills: [sMetabase, sViz], technical: 'Shipped the partner-facing dashboards on Metabase and trained four staff to change them without me.', concise: 'Shipped partner dashboards and trained four staff to own them.', leadership: 'Shipped the partner dashboards and trained four staff to change them, so the contract could end without me in it.' },
    { owner: rFreelance, end: '2023-03-31', skills: [sStakeholder, sTechWriting], technical: 'Wrote the data-sharing agreement the collective still uses with district offices.', concise: 'Wrote the data-sharing agreement still used with district offices.' },

    // Volunteer mentor, 2023-present.
    { owner: rMentor, metrics: [{ value: 62, unit: 'students' }], skills: [sMentoring, sPy], technical: 'Taught 62 secondary students their first programs across three years of a Saturday club, and wrote the twelve-week curriculum it runs on.', concise: 'Taught 62 students their first programs; wrote the curriculum.', leadership: 'Founded and still run a Saturday coding club that has taught 62 students and now has two former students teaching the beginners class.' },
    { owner: rMentor, metrics: [{ value: 2, unit: 'students' }], skills: [sFacilitation], technical: 'Trained two former students to teach the beginners class, which is the only version of this that outlasts me.', concise: 'Trained two former students to teach the beginners class.' },
    { owner: rMentor, skills: [sPublicSpeaking, sFacilitation], technical: 'Ran teacher workshops on running a code club with no reliable electricity and no laptops per student.', concise: 'Ran teacher workshops on running a code club without laptops.' },

    // Data Engineer (contract), Zamba Logistics, 2025.
    { owner: rZamba, end: '2025-12-19', metrics: [{ value: 4, unit: 'vendors' }, { value: 1, unit: 'contract' }], skills: [sPy, sAirflow, sEtl], technical: 'Collapsed four incompatible telematics feeds into **one ingestion contract** with per-vendor validation, so adding the fifth vendor took two days instead of a quarter.', concise: 'Collapsed four telematics feeds into one validated ingestion contract.', leadership: 'Led the fleet ingestion rebuild across four vendors and two teams, and left it documented enough that the next vendor took two days.', pinned: true },
    { owner: rZamba, end: '2025-12-19', metrics: [{ value: 2.4, unit: 'M', label: 'positions/day' }], skills: [sDuck, sDbt], technical: 'Modelled 2.4M vehicle positions a day into **dbt** marts on DuckDB, replacing a Spark cluster that cost more than the data was worth.', concise: 'Modelled 2.4M positions a day into dbt marts on DuckDB.', leadership: 'Made the case for retiring a managed Spark cluster and carried the migration to DuckDB and dbt myself.' },
    { owner: rZamba, end: '2025-12-19', metrics: [{ value: 71, unit: '%', label: 'data incidents' }], skills: [sDq, sPy], technical: 'Cut data incidents 71% quarter on quarter by failing loudly at the vendor boundary instead of quietly in the marts.', concise: 'Cut data incidents 71% by validating at the vendor boundary.' },
    { owner: rZamba, end: '2025-12-19', skills: [sTerraform, sCi], technical: 'Put the whole pipeline under version control and continuous deployment, including the vendor credentials rotation nobody wanted to touch.', concise: 'Put the pipeline under version control and continuous deployment.' },
    { owner: rZamba, end: '2025-12-19', metrics: [{ value: 9, unit: 'minutes', label: 'freshness' }], skills: [sAirflow, sGrafana], technical: 'Brought end-to-end data freshness from four hours to nine minutes, which is what let dispatch use the feed at all.', concise: 'Brought data freshness from four hours to nine minutes.' },
    { owner: rZamba, end: '2025-12-19', skills: [sTechWriting, sStakeholder], technical: 'Wrote the operations runbook and ran the handover, so the contract ended without an on-call dependency on me.', concise: 'Wrote the runbook and ran a handover with no on-call tail.', leadership: 'Ran the contract handover in full, so a ten-month engagement ended with a team that did not need me on call.' },

    // Projects.
    { owner: pReconcile, end: '2018-06-30', metrics: [{ value: 8, unit: 'years' }], skills: [sPy, sPostgres], technical: 'Designed a matcher that has run untouched for eight years, because every rule it applies is stated in one place and testable on its own.', concise: 'Designed a settlement matcher still running untouched after eight years.' },
    { owner: pReconcile, end: '2018-06-30', skills: [sPy, sPytest], technical: 'Built the golden-file test corpus from three years of real settlement days, which is what made the rewrite safe to deploy.', concise: 'Built a golden-file corpus from three years of settlement data.' },
    { owner: pReconcile, end: '2018-06-30', skills: [sTechWriting], technical: 'Published the matching rules as a document the finance team could argue with, and they did, and it got better.', concise: 'Published the matching rules for the finance team to review.', leadership: 'Published the matching rules for the finance team to argue with, which is how they became correct.' },
    { owner: pOcr, end: '2016-10-28', skills: [sPy, sCv], technical: 'Built an Arabic invoice recognition prototype tolerant of skew and stamp overlap, using classical preprocessing rather than a model nobody could retrain.', concise: 'Built an Arabic invoice recognition prototype with classical preprocessing.' },
    { owner: pOcr, end: '2016-10-28', metrics: [{ value: 93, unit: '%', label: 'field accuracy' }], skills: [sPy], technical: 'Reached 93% field-level accuracy on supplier invoices, with the remaining 7% routed to a human queue rather than guessed at.', concise: 'Reached 93% field accuracy with a human queue for the rest.' },
    { owner: pFraud, end: '2020-11-30', metrics: [{ value: 240, unit: 'ms', label: 'p99' }], skills: [sPy, sKafka], technical: 'Held p99 scoring latency under 240ms on a stream that doubled twice during the project.', concise: 'Held p99 scoring latency under 240ms on a doubling stream.' },
    { owner: pFraud, end: '2020-11-30', skills: [sExperiment, sMl], technical: 'Ran the shadow-mode evaluation for six weeks before a single alert reached a human, so the first week live was boring.', concise: 'Ran six weeks of shadow-mode evaluation before going live.' },
    { owner: pFraud, end: '2020-11-30', skills: [sSecurity], technical: 'Designed the rule editor so the risk team could change thresholds without an engineer and without a deploy.', concise: 'Built a rule editor the risk team could use without a deploy.', leadership: 'Argued for and built a rule editor the risk team owns, taking a standing engineering dependency off the roadmap.' },
    { owner: pGridForecast, end: '2021-12-15', metrics: [{ value: 24, unit: 'hours', label: 'horizon' }], skills: [sTimeSeries, sPy], technical: 'Delivered 24-hour-ahead demand forecasts with calibrated intervals, so the dispatch desk could see when the model was unsure.', concise: 'Delivered 24-hour demand forecasts with calibrated intervals.' },
    { owner: pGridForecast, end: '2021-12-15', skills: [sExperiment, sNumpy], technical: 'Benchmarked against a seasonal-naive baseline first, which is the step that decided the whole design.', concise: 'Benchmarked against a seasonal-naive baseline before modelling.' },
    { owner: pGridForecast, end: '2021-12-15', skills: [sGrafana, sViz], technical: 'Built the operator view around the forecast interval rather than the point estimate, after watching dispatch ignore a number they did not trust.', concise: 'Built the operator view around forecast intervals, not point estimates.' },
    { owner: pFleet, end: '2025-11-30', metrics: [{ value: 4, unit: 'vendors' }], skills: [sPy, sEtl, sDq], technical: 'Specified one ingestion contract that four telematics vendors map onto, with per-vendor adapters that fail at their own boundary.', concise: 'Specified one ingestion contract with four per-vendor adapters.' },
    { owner: pFleet, end: '2025-11-30', metrics: [{ value: 2, unit: 'days', label: 'to onboard' }], skills: [sPy, sTechWriting], technical: 'Reduced new-vendor onboarding from a quarter to two days by making the adapter interface the only thing a new vendor needs.', concise: 'Reduced vendor onboarding from a quarter to two days.' },
    { owner: pFleet, end: '2025-11-30', skills: [sDuck, sDbt], technical: 'Replaced a managed Spark cluster with DuckDB and dbt for the modelling layer, cutting infrastructure cost by four fifths at the same freshness.', concise: 'Replaced Spark with DuckDB and dbt, cutting cost four fifths.' },
    { owner: pFleet, end: '2025-11-30', skills: [sSignals, sPy], technical: "Fused GPS with accelerometer traces to detect harsh braking without the vendor's proprietary and un-auditable score.", concise: 'Fused GPS and accelerometer traces to detect harsh braking.' },
    { owner: pColdChain, skills: [sEmbedded, sSignals], technical: 'Designed a fridge-excursion detector that runs on a sub-$10 sensor and a two-week battery, piloted across two districts.', concise: 'Designed a fridge-excursion detector on a sub-$10 sensor.' },
    { owner: pColdChain, metrics: [{ value: 2, unit: 'districts' }], skills: [sPy, sViz], technical: 'Built the district review view around what a health officer can act on in a morning, not around everything the sensor emits.', concise: 'Built the district review view around actionable excursions.' },
    { owner: pOpenBus, metrics: [{ value: 184, unit: 'stars' }], skills: [sPy, sGeo], technical: 'Published and maintain a cleaned, versioned dataset of Kigali bus routes, now used by a data journalist and two student projects.', concise: 'Publish and maintain a cleaned Kigali bus-route dataset.', leadership: 'Started and maintain an open bus-route dataset that other people now build on, including a published news piece.' },
    { owner: pOpenBus, skills: [sPy, sDq], technical: 'Wrote the validation suite that refuses a release when a route loses stops without an explanation in the changelog.', concise: 'Wrote a validation suite that blocks unexplained route changes.' },
    { owner: pOpenBus, skills: [sTechWriting, sGeo], technical: 'Documented the provenance of every route so a user can tell a surveyed stop from an inferred one.', concise: 'Documented route provenance: surveyed stops versus inferred ones.' },
    { owner: pGeoAtlas, end: '2023-03-15', skills: [sGeo, sPy], technical: 'Mapped 62 open indicators onto district boundaries that changed twice during the period covered.', concise: 'Mapped 62 open indicators onto twice-redrawn district boundaries.' },
    { owner: pGeoAtlas, end: '2023-03-15', skills: [sViz, sMetabase], technical: 'Delivered the atlas as something partners could query rather than as a PDF they would have to ask me to regenerate.', concise: 'Delivered the atlas as a queryable tool, not a static report.' },
    { owner: pSpeech, metrics: [{ value: 268, unit: 'prompts' }], skills: [sNlp, sPy], technical: 'Designed the recording protocol and alignment quality checks for a permissively licensed Kinyarwanda read-speech corpus.', concise: 'Designed the recording protocol for a Kinyarwanda speech corpus.' },
    { owner: pSpeech, skills: [sPy, sDq], technical: 'Built the alignment QA that rejects a take when the transcript and the audio disagree, rather than letting it into the corpus quietly.', concise: 'Built alignment QA that rejects mismatched takes.' },
    { owner: pSpeech, skills: [sStakeholder, sKinya], technical: 'Recruited and paid forty readers through the running club and the coding club, which is where the voices actually came from.', concise: 'Recruited and paid forty corpus readers through local networks.', leadership: 'Recruited and paid forty corpus readers through the running club and the coding club, because that is where the voices actually were.' },
    { owner: pEnergy, end: '2022-02-28', skills: [sTs, sViz], technical: 'Turned a year of hand-read meter values into a bill forecast that was within 6% every month it ran.', concise: 'Turned a year of meter readings into a 6%-accurate bill forecast.' },
    { owner: pEnergy, end: '2022-02-28', skills: [sTimeSeries, sR], technical: 'Compared four forecasting approaches on the same twelve months and shipped the simplest one that was not beaten.', concise: 'Compared four forecasting approaches and shipped the simplest.' },
    { owner: pCalibrator, skills: [sLatex, sPy], technical: 'Fits characters-per-line and lines-per-page from compiled PDFs, so a page estimate is measured from the typeset output instead of guessed from a constant.', concise: 'Fits page geometry from compiled PDFs instead of guessing constants.' },
    { owner: pCalibrator, skills: [sPy, sPytest], technical: 'Ships with a regression corpus of compiled documents, so a template change that breaks the estimate fails a test rather than a résumé.', concise: 'Ships a regression corpus so template changes fail a test first.' },
    { owner: pClub, skills: [sTechWriting, sMentoring], technical: 'Wrote twelve weeks of Python and micro:bit material, taught it twice, and rewrote the half that did not work.', concise: 'Wrote, taught and revised a twelve-week beginner curriculum.', leadership: 'Wrote and taught a twelve-week curriculum, revised the half that failed, and handed the beginners class to two former students.' },
    { owner: pClub, metrics: [{ value: 62, unit: 'students' }], skills: [sFacilitation], technical: 'Designed the sessions to run with four laptops between twenty students, because that is the room that exists.', concise: 'Designed sessions to run with four laptops between twenty students.' },

    // Written work, as bullets rather than as a citation list.
    { owner: pubFleet, end: '2026-03-12', skills: [sSignals, sEmbedded], technical: 'First-author conference paper benchmarking sensor fusion on low-cost fleet telematics, with the road-trial harness released alongside it.', concise: 'First-author paper on sensor fusion for low-cost telematics.' },
    { owner: pubSpeech, end: '2026-07-02', skills: [sNlp], technical: 'Co-authored the journal paper describing a permissively licensed Kinyarwanda read-speech corpus and its quality controls.', concise: 'Co-authored a journal paper on a Kinyarwanda speech corpus.' },
    { owner: pubCost, end: '2025-11-28', skills: [sPy, sAws], technical: 'Sole-author preprint modelling batch-pipeline cost in constrained cloud regions, with the measurement package published for replication.', concise: 'Sole-author preprint on batch-pipeline cost in constrained regions.' },
    { owner: pubThesis, skills: [sRl, sPyTorch], technical: "Master's thesis in progress on adaptive scheduling for streaming feature stores, building on the orchestration study.", concise: "Master's thesis on adaptive scheduling for streaming feature stores." },
    { owner: pubPatent, end: '2026-02-20', skills: [sLatex, sPy], technical: 'Named inventor on a filed application covering deterministic document assembly from structured records.', concise: 'Named inventor on a filed deterministic document assembly application.' },
  ];
  for (const spec of atomSpecs) {
    await atom(
      spec.owner,
      spec.end,
      spec.metrics ?? [],
      spec.skills,
      [
        { emphasis: 'technical', text: spec.technical },
        { emphasis: 'concise', text: spec.concise },
        ...(spec.leadership ? [{ emphasis: 'leadership', text: spec.leadership }] : []),
      ],
      { pinned: spec.pinned, blocked: spec.blocked },
    );
  }

  // Jordan's own skill profile, which the graph could previously only infer
  // from whichever roles happened to be tagged.
  for (const [sid, level, centrality] of [
    [sPy, 'expert', 'core'], [sSql, 'expert', 'core'], [sEtl, 'expert', 'core'],
    [sAirflow, 'proficient', 'core'], [sDbt, 'proficient', 'core'], [sDuck, 'proficient', 'supporting'],
    [sPostgres, 'expert', 'core'], [sLinux, 'expert', 'supporting'], [sBash, 'expert', 'supporting'],
    [sGit, 'expert', 'supporting'], [sPytest, 'expert', 'supporting'], [sCi, 'proficient', 'supporting'],
    [sPyTorch, 'working', 'supporting'], [sMl, 'proficient', 'core'], [sRl, 'working', 'supporting'],
    [sViz, 'proficient', 'supporting'], [sGrafana, 'proficient', 'supporting'], [sMetabase, 'proficient', 'supporting'],
    [sTechWriting, 'expert', 'core'], [sMentoring, 'expert', 'supporting'], [sStakeholder, 'proficient', 'supporting'],
    [sEnglish, 'expert', 'core'], [sArabic, 'expert', 'core'], [sFrench, 'working', 'supporting'], [sKinya, 'learning', 'supporting'],
    [sTs, 'proficient', 'supporting'], [sGo, 'working', 'supporting'], [sR, 'working', 'supporting'],
    [sK8s, 'working', 'supporting'], [sAws, 'proficient', 'supporting'], [sTerraform, 'working', 'supporting'],
    [sLatex, 'expert', 'supporting'], [sFigma, 'working', 'supporting'], [sNumpy, 'expert', 'core'],
    [sDataModeling, 'proficient', 'core'], [sExperiment, 'proficient', 'supporting'], [sDq, 'expert', 'core'],
    [sNlp, 'working', 'supporting'], [sCv, 'working', 'supporting'], [sSignals, 'proficient', 'supporting'],
    [sGeo, 'working', 'supporting'], [sTimeSeries, 'proficient', 'supporting'], [sSecurity, 'working', 'supporting'],
    [sFacilitation, 'proficient', 'supporting'], [sPublicSpeaking, 'proficient', 'supporting'],
    [sFastapi, 'proficient', 'supporting'], [sSpark, 'working', 'supporting'], [sKafka, 'working', 'supporting'],
    [sRedis, 'working', 'supporting'], [sGcp, 'working', 'supporting'], [sPhp, 'working', 'supporting'],
    [sLaravel, 'working', 'supporting'], [sEmbedded, 'proficient', 'supporting'], [sScraping, 'proficient', 'supporting'],
    [sTableau, 'working', 'supporting'], [sDjango, 'proficient', 'supporting'], [sJs, 'proficient', 'supporting'],
    [sC, 'working', 'supporting'],
  ] as Array<[string, string, string]>) {
    await repository.createEdge({ type: 'USES_SKILL', src: self.id, dst: sid, props: { level, centrality }, source: 'manual' });
  }

  void pinnedLeft;

  // ── Saved views + settings ──────────────────────────────────────────────────
  const view = async (name: string, query: string) => {
    const id = newId();
    await repository.docPut('saved_views', id, { id, name, query, created_at: nowIso() });
  };
  await view('Job hunt', 'type:application');
  await view('Research artifacts', 'type:publication');
  // One view per clause the filter grammar supports, so the saved-view list
  // doubles as documentation of what can be asked for.
  await view('People in Kigali', 'type:person city:Kigali');
  await view('Everything tagged fleet', 'tag:fleet');
  await view('Zamba Logistics, all of it', 'org:"Zamba Logistics"');
  await view('Imported, not typed', 'source:import_linkedin');
  await view('Pinned and sensitive', 'is:pinned is:sensitive');
  await view('Records with a note', 'has:note');
  await view('The Cairo years', 'after:2016-01-01 before:2021-02-01');
  await view('Shared with me by Peter', 'shared_by:"Peter Njoroge"');
  await view('Archived roles and projects', 'is:archived type:project');

  await repository.docPut('meta', 'settings', {
    profile: { name: 'Jordan Kim', headline: 'Software & Data Engineer', email: 'jordan.demo@example.com', links: ['https://github.com/jordan-demo'] },
    updated_at: nowIso(),
  });
  // Merged rather than written into the document above, so the profile keys
  // that already exist stay exactly as they were. The alias table is the JD
  // parser's dictionary: without entries here, a posting that says "data
  // pipelines" and never says "ETL" scores as a gap it is not.
  await repository.docMerge('meta', 'settings', {
    resumeDefaults: { templateKey: 'cobalt', accent: '#2563eb', emphasis: 'technical' },
    skillAliases: [
      { alias: 'k8s', canonical: 'Kubernetes' },
      { alias: 'RL', canonical: 'Reinforcement Learning' },
      { alias: 'pt', canonical: 'PyTorch' },
      { alias: 'data pipelines', canonical: 'ETL' },
      { alias: 'pipeline', canonical: 'ETL' },
      { alias: 'warehouse', canonical: 'Dimensional Modeling' },
      { alias: 'star schema', canonical: 'Dimensional Modeling' },
      { alias: 'dbt', canonical: 'dbt' },
      { alias: 'bigquery', canonical: 'Google Cloud' },
      { alias: 'gcp', canonical: 'Google Cloud' },
      { alias: 'postgres', canonical: 'PostgreSQL' },
      { alias: 'a/b testing', canonical: 'Experiment Design' },
      { alias: 'nlp', canonical: 'Natural Language Processing' },
      { alias: 'dsp', canonical: 'Signal Processing' },
      { alias: 'iac', canonical: 'Terraform' },
      { alias: 'ci/cd', canonical: 'CI/CD' },
    ],
    github: { lastSyncAt: daysAgo(1), etag: 'W/"demo-etag-9f22"' },
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

  // ── More targets, and the outputs they produced ─────────────────────────────
  //
  // "Machine Learning Engineer" is deliberately absent from every one of these.
  // Four specs open the Aurora Dynamics target by clicking the first element on
  // the page carrying that text, and a second target wearing the same role
  // title would silently open the wrong one.
  const moreTargets: Array<{ role: string; company: string; jd: string; status: string; archived?: boolean }> = [
    {
      role: 'Data Platform Engineer', company: 'Zamba Logistics', status: 'applied',
      jd: `Data Platform Engineer: Zamba Logistics (Kigali, hybrid)

What you'll do
- Own the ingestion path for telematics data from several vendors
- Model the warehouse in dbt and keep the marts trustworthy
- Share an on-call rotation for the pipelines you build

Requirements
- Strong Python and SQL
- Production experience with Airflow or an equivalent orchestrator
- dbt and warehouse modelling
- PostgreSQL, Docker, Linux, Git
- Data quality and validation as a habit, not a phase

Nice to have
- DuckDB
- Logistics or fleet telemetry background`,
    },
    {
      role: 'Lead Data Engineer', company: 'Tembo Health', status: 'applied',
      jd: `Lead Data Engineer: Tembo Health (Kampala, remote)

Requirements
- Python and SQL at depth
- Leading a small data team
- Clinical or field-collected data, and the provenance problems that come with it
- ETL design, data validation, pipeline reliability
- Clear written communication across time zones

Nice to have
- HL7 or FHIR exposure
- Geospatial analysis`,
    },
    {
      role: 'Senior Data Engineer', company: 'Savanna Grid', status: 'active',
      jd: `Senior Data Engineer: Savanna Grid (Nairobi, remote)

Requirements
- Python, SQL, and streaming telemetry at scale
- Apache Spark or an equivalent distributed engine
- Time-series forecasting and evaluation
- BigQuery or a comparable cloud warehouse
- Linux, Git, Docker

Nice to have
- Energy sector experience
- Grafana dashboards`,
    },
    {
      role: 'Applied Scientist', company: 'Amani Robotics', status: 'active',
      jd: `Applied Scientist: Amani Robotics (Kigali, onsite)

Requirements
- PyTorch and modern machine learning practice
- Reinforcement learning or control
- Simulation and field trials
- Python, Linux, Git
- Publishing or reproducible research experience

Nice to have
- Embedded systems
- Signal processing`,
    },
    {
      role: 'Platform Engineer', company: 'Karibu Cloud', status: 'saved',
      jd: `Platform Engineer: Karibu Cloud (Nairobi, hybrid)

Requirements
- Go or Python for infrastructure services
- Kubernetes in production
- Terraform and infrastructure as code
- Multi-tenant systems and their failure modes
- Linux, Git, CI/CD

Nice to have
- Cost modelling for cloud workloads`,
    },
    {
      role: 'Senior Data Engineer', company: 'Ubwenge Labs', status: 'saved',
      jd: `Senior Data Engineer: Ubwenge Labs (Kigali, onsite)

Requirements
- Python and SQL
- dbt, DuckDB, analytics engineering
- Client delivery and stakeholder management
- Data quality engineering

Nice to have
- Consulting background
- Technical writing`,
    },
    {
      role: 'Research Engineer, Pipelines', company: 'Lattice Bio', status: 'closed',
      jd: `Research Engineer, Pipelines: Lattice Bio (Cape Town, onsite)

Requirements
- Python for scientific computing
- Orchestration of long-running scientific jobs
- Reproducibility: pinned environments, content hashing
- Linux, Git

Nice to have
- Computational biology`,
    },
    {
      role: 'ML Infrastructure Engineer', company: 'Sokoni Commerce', status: 'closed',
      jd: `ML Infrastructure Engineer: Sokoni Commerce (Dar es Salaam, remote)

Requirements
- Kubernetes and model serving
- Feature stores in production
- Python, SQL
- Monitoring and alerting for model systems`,
    },
    {
      role: 'Analytics Engineer', company: 'Meridian Freight', status: 'closed', archived: true,
      jd: `Analytics Engineer: Meridian Freight (Mombasa, hybrid)

Requirements
- SQL and dbt
- Warehouse modelling for shipping operations
- Dashboarding
- Stakeholder management`,
    },
    {
      role: 'Backend Engineer', company: 'Sahara Fintech', status: 'closed', archived: true,
      jd: `Backend Engineer: Sahara Fintech (Cairo, onsite)

Requirements
- Python and PostgreSQL
- Ledger or payments systems
- Redis, Kafka
- Application security awareness`,
    },
  ];
  const targetIds = new Map<string, string>();
  for (const spec of moreTargets) {
    const t = await createTarget({ role_title: spec.role, company: spec.company, jd_raw: spec.jd });
    targetIds.set(`${spec.role}@${spec.company}`, t.id as string);
    await repository.docMerge('targets', t.id as string, {
      status: spec.status,
      ...(spec.archived ? { deleted_at: daysAgo(90) } : {}),
      updated_at: daysAgo(spec.archived ? 90 : 20),
    });
  }
  const targetFor = (role: string, company: string) => {
    const id = targetIds.get(`${role}@${company}`);
    if (!id) throw new Error(`seed-demo: no target for ${role} at ${company}`);
    return id;
  };

  // The Aurora target is touched last on purpose. The rail sorts by
  // `updated_at`, and the specs that open it click the first element carrying
  // its role title, so it has to be the one at the top.
  await repository.docMerge('targets', target1.id as string, { status: 'active', updated_at: nowIso() });

  interface ResumeSpec {
    targetId: string;
    name: string;
    template: string;
    headline: string;
    summary: string;
    status: string;
    createdDaysAgo: number;
    coverage: number;
    pages: number;
    emphasis: string;
  }
  const resumeSpecs: ResumeSpec[] = [
    { targetId: targetFor('Data Platform Engineer', 'Zamba Logistics'), name: `Zamba Logistics / Data Platform Engineer (${dateAgo(47)})`, template: 'cobalt', headline: 'Data Platform Engineer', summary: "Data engineer who has already run this team's pipelines under contract, and would rather own them properly.", status: 'sent', createdDaysAgo: 47, coverage: 0.94, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('Data Platform Engineer', 'Zamba Logistics'), name: `Zamba Logistics / Data Platform Engineer, second pass (${dateAgo(44)})`, template: 'onyx', headline: 'Data Platform Engineer', summary: 'Ten months inside this stack, four telematics vendors, one ingestion contract.', status: 'final', createdDaysAgo: 44, coverage: 0.97, pages: 1, emphasis: 'leadership' },
    { targetId: targetFor('Lead Data Engineer', 'Tembo Health'), name: `Tembo Health / Lead Data Engineer (${dateAgo(32)})`, template: 'cobalt', headline: 'Lead Data Engineer', summary: 'Fourteen years of turning field-collected mess into data a clinician can act on.', status: 'sent', createdDaysAgo: 32, coverage: 0.89, pages: 2, emphasis: 'leadership' },
    { targetId: targetFor('Senior Data Engineer', 'Savanna Grid'), name: `Savanna Grid / Senior Data Engineer (${dateAgo(23)})`, template: 'argon', headline: 'Senior Data Engineer', summary: "Built this company's first telemetry ingestion path; back to build the next one.", status: 'sent', createdDaysAgo: 23, coverage: 0.92, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('Applied Scientist', 'Amani Robotics'), name: `Amani Robotics / Applied Scientist (${dateAgo(16)})`, template: 'cobalt', headline: 'Applied Scientist', summary: 'Reproducible experiments on real hardware, with the error bars printed.', status: 'sent', createdDaysAgo: 16, coverage: 0.81, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('Platform Engineer', 'Karibu Cloud'), name: `Karibu Cloud / Platform Engineer (${dateAgo(10)})`, template: 'onyx', headline: 'Platform Engineer', summary: 'Infrastructure that fails at its own boundary instead of three layers downstream.', status: 'sent', createdDaysAgo: 10, coverage: 0.72, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('Senior Data Engineer', 'Ubwenge Labs'), name: `Ubwenge Labs / Senior Data Engineer, draft (${dateAgo(2)})`, template: 'cobalt', headline: 'Senior Data Engineer', summary: 'Analytics engineering for clients who need the answer before they need the platform.', status: 'draft', createdDaysAgo: 2, coverage: 0.68, pages: 1, emphasis: 'concise' },
    { targetId: targetFor('Research Engineer, Pipelines', 'Lattice Bio'), name: `Lattice Bio / Research Engineer (${dateAgo(153)})`, template: 'argon', headline: 'Research Engineer', summary: 'Pipelines that reproduce, on machines nobody has touched in a year.', status: 'sent', createdDaysAgo: 153, coverage: 0.86, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('ML Infrastructure Engineer', 'Sokoni Commerce'), name: `Sokoni Commerce / ML Infrastructure Engineer (${dateAgo(206)})`, template: 'cobalt', headline: 'ML Infrastructure Engineer', summary: 'Serving and monitoring, honestly scoped.', status: 'sent', createdDaysAgo: 206, coverage: 0.64, pages: 1, emphasis: 'technical' },
    { targetId: targetFor('Analytics Engineer', 'Meridian Freight'), name: `Meridian Freight / Analytics Engineer (${dateAgo(119)})`, template: 'onyx', headline: 'Analytics Engineer', summary: 'Warehouse modelling for operations teams who live in the numbers.', status: 'sent', createdDaysAgo: 119, coverage: 0.9, pages: 1, emphasis: 'concise' },
    { targetId: targetFor('Backend Engineer', 'Sahara Fintech'), name: `Sahara Fintech / Backend Engineer (${dateAgo(331)})`, template: 'argon', headline: 'Backend Engineer', summary: 'Ledger systems, from the person who rewrote this one.', status: 'draft', createdDaysAgo: 331, coverage: 0.88, pages: 1, emphasis: 'technical' },
    { targetId: target2.id as string, name: `Kivu Analytics / Data Engineer (${dateAgo(6)})`, template: 'cobalt', headline: 'Data Engineer', summary: 'Pipelines, validation, and dashboards that survive the person who built them.', status: 'draft', createdDaysAgo: 6, coverage: 0.79, pages: 1, emphasis: 'concise' },
    { targetId: target1.id as string, name: `Aurora Dynamics / applied-ML variant (${dateAgo(3)})`, template: 'onyx', headline: 'Applied ML Engineer', summary: 'The Aurora document, re-cut to lead with the reinforcement-learning study.', status: 'final', createdDaysAgo: 3, coverage: 0.93, pages: 1, emphasis: 'leadership' },
  ];
  const resumeIds = new Map<string, string>();
  for (const spec of resumeSpecs) {
    const id = newId();
    resumeIds.set(spec.name, id);
    await repository.docPut('resumes', id, {
      id,
      target_id: spec.targetId,
      template_key: spec.template,
      name: spec.name,
      config: {
        headline: spec.headline,
        summary: spec.summary,
        emphasis: spec.emphasis,
        accent: '#2563eb',
        budget_lines: 54,
        section_order: ['summary', 'skills', 'experience', 'projects', 'education'],
      },
      selection: { entries: [], totalLines: 0, weightedCoverage: spec.coverage },
      coverage: { weightedPct: spec.coverage, passesGate: spec.coverage >= 0.8, gaps: [], perKeyword: [] },
      pages: spec.pages,
      status: spec.status,
      sent_at: spec.status === 'sent' ? daysAgo(spec.createdDaysAgo - 1) : null,
      created_at: daysAgo(spec.createdDaysAgo),
      updated_at: daysAgo(spec.createdDaysAgo - 1),
      rev: 1,
      deleted_at: null,
    });
  }

  // ── Cover letters ───────────────────────────────────────────────────────────
  //
  // No artifact rows are written for any of these. An attachments row asserts a
  // blob that the export can actually fetch, and a fabricated storage key turns
  // a backup into a failure at restore time rather than at seed time. Compiled
  // artifacts are for the compile button to make.
  const letter = async (
    targetId: string,
    status: string,
    createdDaysAgo: number,
    recipient: { name?: string; title?: string; org?: string },
    blocks: Array<{ kind: string; text: string }>,
    resumeName?: string,
  ) => {
    const id = newId();
    // Named, then looked up, then thrown on. A letter that quietly loses its
    // résumé link would still seed, and the join it demonstrates would just be
    // missing from a screen nobody was checking.
    if (resumeName !== undefined && !resumeIds.has(resumeName)) {
      throw new Error(`seed-demo: letter names an output that does not exist: ${resumeName}`);
    }
    await repository.docPut('letters', id, {
      id,
      target_id: targetId,
      ...(resumeName ? { resume_id: resumeIds.get(resumeName) } : {}),
      blocks,
      status,
      recipient: { ...recipient, address: [] },
      template_key: status === 'draft' ? null : 'letter-classic',
      template_version: null,
      tex_key: null,
      pdf_key: null,
      pages: null,
      artifact_ids: {},
      artifact_hashes: {},
      source_date_epoch: null,
      rev: 1,
      deleted_at: null,
      created_at: daysAgo(createdDaysAgo),
      updated_at: daysAgo(createdDaysAgo - 1),
    });
    return id;
  };
  await letter(targetFor('Data Platform Engineer', 'Zamba Logistics'), 'sent', 47, { name: 'Miriam Kayitesi', title: 'Engineering Manager', org: 'Zamba Logistics' }, [
    { kind: 'hook', text: 'I spent ten months building the ingestion path your posting describes, as a contractor. I would like to own it properly.' },
    { kind: 'body', text: 'Four telematics vendors now map onto one ingestion contract with per-vendor validation, which took new-vendor onboarding from a quarter to two days. Data incidents fell 71% quarter on quarter, because the failures happen at the vendor boundary now instead of quietly in the marts.' },
    { kind: 'body', text: 'Before Zamba I built telemetry ingestion for 340,000 grid meters at Savanna Grid, and before that I rewrote a nightly settlement close at Sahara Fintech that has run untouched for eight years.' },
    { kind: 'closer', text: 'I know what this system does badly as well as what it does well, and I would rather fix the first list than describe the second.' },
  ], `Zamba Logistics / Data Platform Engineer (${dateAgo(47)})`);
  await letter(targetFor('Lead Data Engineer', 'Tembo Health'), 'sent', 32, { name: 'Halima Yusuf', title: 'Recruiter', org: 'Tembo Health' }, [
    { kind: 'hook', text: 'I watched a vaccine fridge fail during a site visit in Kampala, and it changed how I design field data collection.' },
    { kind: 'body', text: 'I have led a data team through a platform rebuild, mentored four engineers into owning a production service, and shipped a cold-chain excursion detector that runs on a sub-$10 sensor across two districts.' },
    { kind: 'closer', text: 'Clinical data has a provenance problem that no amount of orchestration fixes. I would like to work on the part that does.' },
  ], `Tembo Health / Lead Data Engineer (${dateAgo(32)})`);
  await letter(targetFor('Senior Data Engineer', 'Savanna Grid'), 'sent', 23, { name: 'Bernard Oduya', title: 'Talent Partner', org: 'Savanna Grid' }, [
    { kind: 'hook', text: 'I built the first version of the telemetry ingestion you are hiring to extend.' },
    { kind: 'body', text: 'Between 2021 and 2022 I moved 47 cron jobs onto Airflow with explicit dependencies, cut day-ahead forecast error from 19% to 12% MAPE, and added the ingest contract tests that caught a meter firmware change three days before it would have corrupted billing.' },
    { kind: 'closer', text: 'I left to finish a degree. The degree is nearly finished.' },
  ], `Savanna Grid / Senior Data Engineer (${dateAgo(23)})`);
  await letter(targetFor('Applied Scientist', 'Amani Robotics'), 'sent', 16, { name: 'Aisha Bello', title: 'Research Engineer', org: 'Amani Robotics' }, [
    { kind: 'hook', text: 'My last research project ran 1,000 seeded simulations across an 81-cell parameter sweep, and published the seeds.' },
    { kind: 'body', text: 'I care more about whether a result reproduces than about whether it is impressive. The orchestration study, the AFRICON sensor-fusion paper, and the cost-model preprint all ship with the code that produced their numbers.' },
    { kind: 'closer', text: 'Field robotics is where reproducibility is hardest and matters most.' },
  ]);
  await letter(targetFor('Platform Engineer', 'Karibu Cloud'), 'final', 10, { org: 'Karibu Cloud' }, [
    { kind: 'hook', text: 'Most of my infrastructure work has been in service of data pipelines, which is a good school for multi-tenant failure modes.' },
    { kind: 'body', text: 'I have run Kubernetes in production, put a whole pipeline under Terraform including the credential rotation nobody wanted to touch, and written the alerting that took mean time to recovery from two hours to eighteen minutes.' },
    { kind: 'closer', text: "I would be arriving as a platform engineer with a data engineer's instincts about cost." },
  ]);
  await letter(targetFor('Senior Data Engineer', 'Ubwenge Labs'), 'draft', 2, { name: 'Michel Habyarimana', title: 'Founder', org: 'Ubwenge Labs' }, [
    { kind: 'hook', text: 'Michel suggested I write to you directly rather than through the form.' },
    { kind: 'body', text: 'Client delivery is the part of this I have done most recently and enjoyed most: a district indicator atlas three consultants had returned unfinished, delivered by cutting the scope to what the boundary data could actually support.' },
  ]);
  await letter(targetFor('Research Engineer, Pipelines', 'Lattice Bio'), 'sent', 153, { name: 'Paulo Mendes', title: 'Engineering Director', org: 'Lattice Bio' }, [
    { kind: 'hook', text: 'Sofia Almeida suggested I apply after we talked about dependency pinning at the Indaba poster session.' },
    { kind: 'body', text: 'Reproducibility is the through-line of my work: commit-pinned, hash-verified artifact records, disjoint seed pools, and one-command reproduction on the reinforcement-learning study.' },
    { kind: 'closer', text: 'I am based in Kigali and finishing a degree here, which I should say up front.' },
  ], `Lattice Bio / Research Engineer (${dateAgo(153)})`);
  await letter(target2.id as string, 'draft', 6, { org: 'Kivu Analytics' }, [
    { kind: 'hook', text: 'Dashboarding is the visible half of this role and validation is the half that decides whether anyone trusts it.' },
    { kind: 'body', text: 'I have shipped both: Metabase dashboards four non-engineers maintain without me, sitting on ingest contract tests that fail loudly at the source.' },
  ]);

  // ── Dossiers ────────────────────────────────────────────────────────────────
  //
  // Every claim cites a record that exists in this graph. The appendix resolves
  // citations against the live graph and prints what it finds, so a dossier
  // seeded with invented ids would demonstrate the failure case and nothing
  // else.
  const dossier = async (
    audience: string,
    title: string,
    createdDaysAgo: number,
    sections: Array<{ grammar_id: string; claims: Array<{ text: string; cites: string[] }> }>,
    window?: { from: string; to: string },
  ) => {
    const id = newId();
    await repository.docPut('dossiers', id, {
      id,
      subject_node: self.id,
      audience,
      title,
      ...(window ? { window } : {}),
      sections: sections.map((section) => ({
        grammar_id: section.grammar_id,
        claims: section.claims.map((claim) => ({
          id: newId(),
          text: claim.text,
          cites: claim.cites.map((nodeId) => ({ kind: 'node', id: nodeId })),
        })),
      })),
      tex_key: null,
      pdf_key: null,
      rev: 1,
      deleted_at: null,
      created_at: daysAgo(createdDaysAgo),
      updated_at: daysAgo(createdDaysAgo),
    });
    return id;
  };
  await dossier('promotion_review', 'Senior scope, evidenced', 26, [
    { grammar_id: 'scope', claims: [
      { text: 'Owned the ledger settlement path at Sahara Fintech as its senior engineer for twenty months.', cites: [rSenior, sahara] },
      { text: 'Ran the fleet data platform at Zamba Logistics end to end under a ten-month contract.', cites: [rZamba, zamba] },
    ] },
    { grammar_id: 'impact', claims: [
      { text: 'Anomaly screening scores eleven million ledger events a day against rules the risk team maintains.', cites: [pFraud] },
      { text: 'One ingestion contract replaced four vendor-specific paths and took onboarding from a quarter to two days.', cites: [pFleet] },
      { text: 'Sensor fusion results published and independently citable.', cites: [pubFleet] },
    ] },
    { grammar_id: 'leadership', claims: [
      { text: 'Grew four engineers into owners of a service I built, then handed it over and left the country.', cites: [pFraud, rSenior] },
      { text: 'Founded a Saturday coding club that has taught sixty-two students and now runs partly without me.', cites: [pClub] },
    ] },
    { grammar_id: 'recognition', claims: [
      { text: 'Recognised internally for the reconciliation rewrite and externally for the open bus-route dataset.', cites: [pReconcile, pOpenBus] },
    ] },
  ], { from: '2016-12-01', to: dateAgo(0) });
  await dossier('petition_exhibits', 'Extraordinary ability: exhibit list', 62, [
    { grammar_id: 'exhibits', claims: [
      { text: 'Exhibit A: first-author conference paper on sensor fusion for low-cost fleet telematics.', cites: [pubFleet] },
      { text: 'Exhibit B: co-authored journal paper describing a Kinyarwanda read-speech corpus.', cites: [pubSpeech] },
      { text: 'Exhibit C: sole-author preprint on batch-pipeline cost models.', cites: [pubCost] },
      { text: 'Exhibit D: filed patent application on deterministic document assembly.', cites: [pubPatent] },
      { text: "Exhibit E: master's degree in progress at Carnegie Mellon University Africa.", cites: [msc.id] },
      { text: 'Exhibit F: international open-data prize for the bus-route dataset.', cites: [pOpenBus] },
    ] },
  ]);
  await dossier('background_history', 'Residence and employment history, 2010 onward', 5, [
    { grammar_id: 'residences', claims: [
      { text: 'Resident in Kigali, Rwanda since January 2021, currently in Kimihurura.', cites: [kimihurura, rwanda] },
      { text: 'Resident in Cairo, Egypt from September 2014 to January 2021.', cites: [cairo] },
      { text: 'Resident in Sohag, Egypt until August 2014.', cites: [sohag] },
    ] },
    { grammar_id: 'employment', claims: [
      { text: 'Nile Delta Systems, IT support technician, July 2012 to August 2014.', cites: [rTech, nileDelta] },
      { text: 'Cairo Metro Digital, junior web developer, September 2014 to November 2016.', cites: [rJunior, cairoMetro] },
      { text: 'Sahara Fintech, software engineer then senior software engineer, December 2016 to January 2021.', cites: [rSwe, rSenior, sahara] },
      { text: 'Savanna Grid, data engineer, February 2021 to January 2022.', cites: [rGrid, savanna] },
      { text: 'Zamba Logistics, data engineer under contract, February to December 2025.', cites: [rZamba, zamba] },
    ] },
    { grammar_id: 'education', claims: [
      { text: 'Sohag Technical Institute, diploma in information technology, 2010 to 2012.', cites: [diploma.id, sohagInstitute] },
      { text: 'African Leadership University, bachelor of science, 2021 to 2024.', cites: [bsc.id, alu] },
      { text: 'Carnegie Mellon University Africa, master of science in progress.', cites: [msc.id, cmu] },
    ] },
    { grammar_id: 'travel', claims: [
      { text: 'Conference travel to Dakar in 2024 and to Cairo in 2026.', cites: [dakar, cairo] },
      { text: 'Work travel to Cape Town, Gaborone and Kampala.', cites: [capeTown, gaborone, kampala] },
    ] },
  ], { from: '2010-09-15', to: dateAgo(0) });

  // ── Tags, reminders ─────────────────────────────────────────────────────────
  //
  // Nothing in this seed wrote to `tags` or `taggings` before, so every `tag:`
  // query in the filter grammar returned nothing and looked like a broken
  // feature rather than an empty one.
  const tagIds = new Map<string, string>();
  const tag = async (name: string) => {
    const id = newId();
    tagIds.set(name, id);
    await repository.docPut('tags', id, { id, name, kind: 'facet', created_at: nowIso() });
    return id;
  };
  for (const name of ['fleet', 'job-search', 'research', 'teaching', 'open-data', 'cairo-years', 'kigali', 'reference', 'reading', 'health', 'finance', 'corpus', 'offer', 'community']) {
    await tag(name);
  }
  const tagged = async (name: string, subjectIds: string[]) => {
    const tagId = tagIds.get(name);
    if (!tagId) throw new Error(`seed-demo: no tag named ${name}`);
    for (const subjectId of subjectIds) {
      const id = newId();
      await repository.docPut('taggings', id, {
        id,
        tag_id: tagId,
        subject_kind: 'node',
        subject_id: subjectId,
        created_at: nowIso(),
      });
    }
  };
  await tagged('fleet', [pFleet, rZamba, zamba, pubFleet, who('Felix Mugisha'), who('Miriam Kayitesi'), who('Josephine Uwera')]);
  await tagged('job-search', [appZamba, appTembo, appSavanna, appAmani, appLattice, appSokoni, who('Bernard Oduya'), who('Halima Yusuf'), who('Gideon Otieno')]);
  await tagged('research', [pRlStudy, pSpeech, pubRl.id, pubSpeech, pubCost, pubThesis, fatima, who('Prof. Elias Mwangi'), who('Dr. Ines Uwase')]);
  await tagged('teaching', [rMentor, pClub, brightPath, who('Prisca Nyirahabimana'), who('Lulu Chirwa')]);
  await tagged('open-data', [pOpenBus, pGeoAtlas, okavango, who('Ibrahim Toure'), who('Naledi Motsepe'), who('Yohannes Tesfaye')]);
  await tagged('cairo-years', [rTech, rJunior, rSwe, rSenior, sahara, cairoMetro, nileDelta, who('Yasmine Farouk'), who('Hossam Ragab'), who('Mina Guirguis'), who('Ahmed Sobhy')]);
  await tagged('kigali', [cmu, alu, ubwenge, amani, pydataKigali, who('Bruno Iradukunda'), who('Sandrine Mukashema'), who('Chidinma Eze')]);
  await tagged('reference', [who('Yasmine Farouk'), who('Peter Njoroge'), who('Naledi Motsepe'), priya, fatima]);
  await tagged('corpus', [pSpeech, pubSpeech, who('Nadia Belkacem')]);
  await tagged('offer', [appZamba, zamba]);
  await tagged('community', [pydataKigali, indabaOrg, ictChamber, who('Wanjiku Kamau'), who('Tunde Bakare'), who('Hakim Diallo')]);

  const reminder = async (subjectId: string, dueDaysAgo: number, reason: string, note: string, status = 'open') => {
    const id = newId();
    await repository.docPut('reminders', id, {
      id,
      subject_kind: 'node',
      subject_id: subjectId,
      due_on: dateAgo(dueDaysAgo),
      reason,
      note,
      status,
      created_from: 'capture',
      created_at: nowIso(),
      done_at: null,
    });
    return id;
  };
  await reminder(appZamba, 5, 'follow_up', 'Answer the offer. They asked for Friday and Friday was Friday.');
  await reminder(who('Halima Yusuf'), 0, 'follow_up', 'Reply about the panel date before she nudges a third time.');
  await reminder(who('Peter Njoroge'), 2, 'follow_up', 'Send the take-home with the error analysis.');
  await reminder(who('Yasmine Farouk'), -9, 'follow_up', 'Tell her how the offer landed; she asked.');
  await reminder(who('Michel Habyarimana'), -3, 'follow_up', 'Say yes or no to the Ubwenge walk-in.');
  await reminder(who('Hossam Ragab'), -30, 'reconnect', 'Fourteen months. Write something that is not a New Year message.');
  await reminder(who('Ahmed Sobhy'), -60, 'reconnect', 'Annual call is overdue by two months.');
  await reminder(msc.id, -40, 'deadline', 'Thesis proposal submission window opens.');
  await reminder(who('Bernard Oduya'), 14, 'follow_up', 'Chased already; closed.', 'done');
  await reminder(who('Gideon Otieno'), -120, 'follow_up', 'Snoozed until there is a role worth reading.', 'snoozed');

  // ── Imports ─────────────────────────────────────────────────────────────────
  //
  // A batch history with only one shape in it cannot show what the four batch
  // states mean. The second LinkedIn batch is the important one: it is staged,
  // and its rows carry update proposals against records the first batch
  // created, which is the longitudinal re-import surface. A row whose proposal
  // has no fields has converged - the file and the record already agree - and
  // that is a different fact from a row with nothing to say.
  const importBatch = async (
    id: string,
    kind: string,
    detail: string,
    filename: string | null,
    status: string,
    createdDaysAgo: number,
    stats: Record<string, number>,
    committedDaysAgo?: number,
    rolledBackDaysAgo?: number,
  ) => {
    await repository.docPut('imports', id, {
      id,
      kind,
      detail,
      filename,
      status,
      created_at: daysAgo(createdDaysAgo),
      committed_at: committedDaysAgo === undefined ? null : daysAgo(committedDaysAgo),
      rolled_back_at: rolledBackDaysAgo === undefined ? null : daysAgo(rolledBackDaysAgo),
      stats,
    });
  };
  const importRow = async (
    batchId: string,
    index: number,
    entity: string,
    title: string,
    subtitle: string | null,
    payload: Record<string, unknown>,
    opts: { decision?: string; status?: string; confidence?: number; dup?: Record<string, unknown>; proposal?: Record<string, unknown>; identityKeys?: string[] } = {},
  ) => {
    const id = newId();
    await repository.docPut(
      'import_rows',
      id,
      {
        id,
        index,
        entity,
        title,
        subtitle,
        payload,
        confidence: opts.confidence ?? 0.9,
        dup: opts.dup ?? null,
        proposal: opts.proposal ?? null,
        identity_keys: opts.identityKeys ?? [],
        ref: null,
        node_type: entity === 'graph_node' ? 'person' : null,
        decision: opts.decision ?? 'accept',
        status: opts.status ?? 'staged',
      },
      { import_id: batchId },
    );
    return id;
  };

  const linkedinFirst = newId();
  await importBatch(linkedinFirst, 'linkedin', 'Connections and positions export', 'linkedin-export-2024.zip', 'committed', 420, { rows: 214, accepted: 198, dupCandidates: 11, created: 191, updated: 7, unchanged: 0, skipped: 16, failed: 0 }, 419);
  await importRow(linkedinFirst, 0, 'person', 'Yasmine Farouk', 'Engineering manager, core banking', { emails: ['yasmine@saharafintech.example'], city: 'Cairo' }, { decision: 'accept', status: 'committed', identityKeys: ['linkedin:person:yasmine-farouk'] });
  await importRow(linkedinFirst, 1, 'person', 'Peter Njoroge', 'Senior data engineer', { emails: ['peter@savannagrid.example'], city: 'Nairobi' }, { decision: 'accept', status: 'committed', identityKeys: ['linkedin:person:peter-njoroge'] });
  await importRow(linkedinFirst, 2, 'role', 'Data Engineer', 'Savanna Grid', { start_date: '2021-02-01', end_date: '2022-01-31' }, { decision: 'accept', status: 'committed' });
  await importRow(linkedinFirst, 3, 'person', 'Adaeze N. Okonkwo', 'Data engineer', { emails: ['adaeze@sokoni.example'] }, { decision: 'accept', status: 'committed', confidence: 0.62, dup: { nodeId: adaezeA, nodeTitle: 'Adaeze Okonkwo', weight: 0.78, verdict: 'probable', evidence: ['same email domain and mailbox', 'name differs by one initial'] } });

  const linkedinSecond = newId();
  await importBatch(linkedinSecond, 'linkedin', 'Re-import: positions and headlines', 'linkedin-export-current.zip', 'staged', 1, { rows: 6, accepted: 5, dupCandidates: 0, updated: 3, unchanged: 2, skipped: 1 });
  await importRow(linkedinSecond, 0, 'person', 'Yasmine Farouk', 'VP Engineering, core banking', { headline: 'VP Engineering, core banking', city: 'Cairo' }, {
    identityKeys: ['linkedin:person:yasmine-farouk'],
    proposal: {
      identity_key: 'linkedin:person:yasmine-farouk',
      target_node_id: who('Yasmine Farouk'),
      target_title: 'Yasmine Farouk',
      target_rev: 1,
      fields: [{ key: 'props.headline', from: 'Engineering manager, core banking', to: 'VP Engineering, core banking' }],
      accepted: ['props.headline'],
    },
  });
  await importRow(linkedinSecond, 1, 'person', 'Felix Mugisha', 'Staff platform engineer', { headline: 'Staff platform engineer', city: 'Kigali' }, {
    identityKeys: ['linkedin:person:felix-mugisha'],
    proposal: {
      identity_key: 'linkedin:person:felix-mugisha',
      target_node_id: who('Felix Mugisha'),
      target_title: 'Felix Mugisha',
      target_rev: 1,
      fields: [{ key: 'props.headline', from: 'Platform engineer', to: 'Staff platform engineer' }],
      accepted: ['props.headline'],
    },
  });
  await importRow(linkedinSecond, 2, 'person', 'Thabo Nkosi', 'Backend engineer, payments', { headline: 'Backend engineer, payments', city: 'Cape Town' }, {
    identityKeys: ['linkedin:person:thabo-nkosi'],
    proposal: {
      identity_key: 'linkedin:person:thabo-nkosi',
      target_node_id: who('Thabo Nkosi'),
      target_title: 'Thabo Nkosi',
      target_rev: 1,
      fields: [{ key: 'props.city', from: 'Johannesburg', to: 'Cape Town' }],
      accepted: [],
    },
  });
  await importRow(linkedinSecond, 3, 'person', 'Peter Njoroge', 'Senior data engineer, grid telemetry', { headline: 'Senior data engineer, grid telemetry' }, {
    identityKeys: ['linkedin:person:peter-njoroge'],
    proposal: {
      identity_key: 'linkedin:person:peter-njoroge',
      target_node_id: who('Peter Njoroge'),
      target_title: 'Peter Njoroge',
      target_rev: 1,
      fields: [],
      accepted: [],
    },
  });
  await importRow(linkedinSecond, 4, 'person', 'Lilian Wanjiru', 'Analytics lead', { headline: 'Analytics lead' }, {
    identityKeys: ['linkedin:person:lilian-wanjiru'],
    proposal: {
      identity_key: 'linkedin:person:lilian-wanjiru',
      target_node_id: who('Lilian Wanjiru'),
      target_title: 'Lilian Wanjiru',
      target_rev: 1,
      fields: [],
      accepted: [],
    },
  });
  await importRow(linkedinSecond, 5, 'person', 'Somebody I do not remember', null, { headline: 'Growth hacker' }, { decision: 'skip', confidence: 0.3 });

  const githubSync = newId();
  await importBatch(githubSync, 'github', 'Repository sync', null, 'committed', 1, { rows: 12, accepted: 12, dupCandidates: 0, created: 3, updated: 9, unchanged: 0, skipped: 0, failed: 0 }, 1);
  await importRow(githubSync, 0, 'graph_node', 'jordan-demo/open-bus-routes', 'Python · 184 stars', { full_name: 'jordan-demo/open-bus-routes', stars: 184 }, { status: 'committed', identityKeys: ['github:repository:jordan-demo/open-bus-routes'] });
  await importRow(githubSync, 1, 'graph_node', 'jordan-demo/fleet-ingest', 'Python · private', { full_name: 'jordan-demo/fleet-ingest', is_private: true }, { status: 'committed', identityKeys: ['github:repository:jordan-demo/fleet-ingest'] });

  const contactsRolledBack = newId();
  await importBatch(contactsRolledBack, 'contacts', 'Phone contacts (vCard)', 'contacts.vcf', 'rolled_back', 96, { rows: 412, accepted: 380, dupCandidates: 64, created: 380, updated: 0, unchanged: 0, skipped: 32, failed: 0 }, 95, 94);
  await importRow(contactsRolledBack, 0, 'person', 'Taxi (airport)', null, { phones: ['+250 780 111 222'] }, { status: 'committed', confidence: 0.2 });
  await importRow(contactsRolledBack, 1, 'person', 'Plumber', null, { phones: ['+250 780 333 444'] }, { status: 'committed', confidence: 0.2 });

  const bookmarksDiscarded = newId();
  await importBatch(bookmarksDiscarded, 'bookmarks', 'Browser bookmarks', 'bookmarks.html', 'discarded', 58, { rows: 1_204, accepted: 0, dupCandidates: 0, skipped: 1_204 });

  const resumeParse = newId();
  await importBatch(resumeParse, 'resume', 'Parsed an old PDF résumé', 'jordan-kim-2021.pdf', 'committed', 700, { rows: 38, accepted: 31, dupCandidates: 4, created: 27, updated: 4, unchanged: 0, skipped: 7, failed: 0 }, 699);
  await importRow(resumeParse, 0, 'atom', 'Rebuilt the nightly settlement close', 'Sahara Fintech', { text: 'Rebuilt the nightly settlement close as a deterministic matcher.' }, { status: 'committed' });
  await importRow(resumeParse, 1, 'education', 'Diploma, Information Technology', 'Sohag Technical Institute', { start_date: '2010-09-15', end_date: '2012-06-30' }, { status: 'committed' });

  // ── Trash ───────────────────────────────────────────────────────────────────
  //
  // An empty trash screen cannot show that deletion is recoverable, which is
  // the only claim the screen makes.
  const binned = await Promise.all([
    repository.createNode({ type: 'link', title: 'Half-read thread about monorepos', props: { url: 'https://example.com/monorepo-thread', domain: 'example.com', read_status: 'unread' }, source: 'import_bookmarks' }),
    repository.createNode({ type: 'task', title: 'Email the conference organisers about the invoice', props: { status: 'dropped', priority: 'p4' }, source: 'manual' }),
    repository.createNode({ type: 'person', title: 'Duplicate of Bruno (scanned card)', props: { city: 'Kigali' }, source: 'import_vcard', confidence: 0.4 }),
    repository.createNode({ type: 'idea', title: 'A second bus dataset, but for motos', props: { status: 'discarded', one_liner: 'Same idea, less tractable.' }, source: 'manual' }),
    repository.createNode({ type: 'link', title: 'Broken link to a talk recording', props: { url: 'https://example.com/dead-recording', domain: 'example.com', read_status: 'unread' }, source: 'manual' }),
    repository.createNode({ type: 'media_item', title: 'A podcast I abandoned in episode one', props: { media_kind: 'podcast', consumption_status: 'abandoned' }, source: 'manual' }),
  ]);
  for (const node of binned) await repository.softDeleteNode(node.id);

  // ── Provenance: the ledger ──────────────────────────────────────────────────
  //
  // `createNode` stamps its revision with the current time and takes no
  // override, so a seed that only creates records produces a ledger where the
  // whole graph appeared in one second. Rewriting each create row's timestamp
  // and appending the changes that followed is the only way to give the Ledger
  // and the per-record history panel a real spread.
  //
  // Each chain ends where the live record actually stands. A history whose last
  // `to` disagrees with the record it describes would be worse than no history.
  const revisionRows = await repository.docList<Record<string, unknown>>('revisions');
  const createRevisionBySubject = new Map<string, Record<string, unknown>>();
  for (const row of revisionRows) {
    if (row.op === 'create') createRevisionBySubject.set(String(row.subject_id), row);
  }
  interface Change {
    agoDays: number;
    op?: string;
    source?: string;
    actor?: string;
    diff: Record<string, { from: unknown; to: unknown }>;
  }
  const history = async (subjectId: string, bornDaysAgo: number, changes: Change[]) => {
    const created = createRevisionBySubject.get(subjectId);
    if (!created) throw new Error(`seed-demo: no create revision for subject ${subjectId}`);
    await repository.docPut('revisions', String(created.id), { ...created, at: daysAgo(bornDaysAgo) });
    let rev = Number(created.rev ?? 1);
    // The snapshot on an update row is the record's identity, which is what the
    // Ledger labels the row with; the diff carries what changed.
    for (const change of [...changes].sort((a, b) => b.agoDays - a.agoDays)) {
      rev += 1;
      const id = newId();
      await repository.docPut('revisions', id, {
        id,
        subject_kind: created.subject_kind,
        subject_id: subjectId,
        rev,
        op: change.op ?? 'update',
        at: daysAgo(change.agoDays),
        actor: change.actor ?? 'owner',
        source: change.source ?? 'manual',
        snapshot: created.snapshot,
        diff: change.diff,
      });
    }
  };

  await history(appZamba, 46, [
    { agoDays: 42, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 36, diff: { 'props.status': { from: 'screening', to: 'interview' }, 'props.next_step': { from: 'Recruiter screen', to: 'Pipeline design exercise' } } },
    { agoDays: 12, diff: { 'props.status': { from: 'interview', to: 'offer' }, 'props.salary_range': { from: null, to: 'RWF 32-38M' } } },
    { agoDays: 5, diff: { 'props.next_step': { from: 'Architecture panel', to: 'Answer the offer by Friday' } } },
  ]);
  await history(appTembo, 31, [
    { agoDays: 26, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 12, diff: { 'props.status': { from: 'screening', to: 'interview' } } },
    { agoDays: 6, diff: { 'props.next_step': { from: 'Clinical data deep dive', to: 'Panel with the clinical data team' } } },
  ]);
  await history(appSavanna, 22, [
    { agoDays: 17, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 2, diff: { 'props.next_step': { from: 'Recruiter screen', to: 'Take-home due' } } },
  ]);
  await history(appSokoni, 205, [
    { agoDays: 196, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 191, diff: { 'props.status': { from: 'screening', to: 'interview' } } },
    { agoDays: 188, op: 'archive', diff: { 'props.status': { from: 'interview', to: 'rejected' } } },
  ]);
  await history(appLattice, 152, [
    { agoDays: 146, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 139, diff: { 'props.status': { from: 'screening', to: 'interview' } } },
    { agoDays: 130, op: 'archive', diff: { 'props.status': { from: 'interview', to: 'rejected' } } },
  ]);
  await history(appAt('Analytics Engineer', meridianFreight), 118, [
    { agoDays: 110, diff: { 'props.status': { from: 'applied', to: 'screening' } } },
    { agoDays: 64, op: 'archive', diff: { 'props.status': { from: 'screening', to: 'withdrawn' } } },
  ]);
  await history(rZamba, 424, [
    { agoDays: 300, diff: { 'props.seniority': { from: 'mid', to: 'senior' } } },
    { agoDays: 62, op: 'append', diff: { end_date: { from: null, to: '2025-12-19' } } },
  ]);
  await history(rSenior, 1_800, [
    { agoDays: 1_600, diff: { 'props.team': { from: 'Platform', to: 'Ledger services' } } },
    { agoDays: 900, op: 'append', diff: { end_date: { from: null, to: '2021-01-31' }, 'props.reason_left': { from: null, to: 'Relocated to Kigali; the team had no remote track.' } } },
  ]);
  await history(who('Yasmine Farouk'), 1_800, [
    { agoDays: 900, diff: { 'props.city': { from: 'Giza', to: 'Cairo' } } },
    { agoDays: 419, source: 'import_linkedin', actor: 'import', diff: { 'props.emails': { from: [], to: ['yasmine@saharafintech.example'] } } },
    { agoDays: 137, diff: { 'props.headline': { from: 'Engineering lead, core banking', to: 'Engineering manager, core banking' } } },
  ]);
  await history(who('Peter Njoroge'), 1_420, [
    { agoDays: 419, source: 'import_linkedin', actor: 'import', diff: { 'props.emails': { from: [], to: ['peter@savannagrid.example'] } } },
    { agoDays: 117, diff: { 'props.headline': { from: 'Data engineer', to: 'Senior data engineer, grid telemetry' } } },
  ]);
  await history(who('Miriam Kayitesi'), 96, [
    { agoDays: 90, diff: { 'props.emails': { from: [], to: ['miriam@zamba.example'] } } },
    { agoDays: 46, diff: { 'props.headline': { from: 'Hiring manager', to: 'Hiring manager, data platform' } } },
  ]);
  await history(pSpeech, 360, [
    { agoDays: 200, diff: { 'props.status': { from: 'paused', to: 'active' } } },
    { agoDays: 74, diff: { 'props.outcome': { from: 'Corpus design, not yet recording.', to: 'A permissively licensed read-speech corpus for low-resource recognition.' } } },
  ]);
  await history(pFleet, 424, [
    { agoDays: 200, diff: { 'props.my_role': { from: 'engineer', to: 'contractor' } } },
    { agoDays: 62, op: 'append', diff: { end_date: { from: null, to: '2025-11-30' }, 'props.status': { from: 'active', to: 'done' } } },
  ]);
  await history(pOpenBus, 800, [
    { agoDays: 400, source: 'import_github', actor: 'github-sync', diff: { 'props.url': { from: null, to: 'https://github.com/jordan-demo/open-bus-routes' } } },
    { agoDays: 60, diff: { 'props.outcome': { from: 'A dataset of Kigali bus routes.', to: 'A cleaned, versioned dataset of Kigali bus routes anyone can query.' } } },
  ]);
  await history(msc.id, 740, [
    { agoDays: 400, diff: { 'props.coursework': { from: ['Machine Learning for Engineers'], to: ['Machine Learning for Engineers', 'Real-Time Embedded Systems', 'Signal Processing'] } } },
    { agoDays: 40, diff: { 'props.degree': { from: 'M.Sc. ECE', to: 'M.Sc. ECE: Embedded Systems & Signal Processing' } } },
  ]);
  await history(target1.id as string, 42, [
    { agoDays: 30, diff: { status: { from: 'saved', to: 'applied' } } },
    { agoDays: 0, diff: { status: { from: 'applied', to: 'active' } } },
  ]);
  await history(targetFor('Data Platform Engineer', 'Zamba Logistics'), 48, [
    { agoDays: 47, diff: { status: { from: 'saved', to: 'active' } } },
    { agoDays: 46, diff: { status: { from: 'active', to: 'applied' } } },
  ]);
  await history(who('Chidinma Eze'), 400, [
    { agoDays: 120, diff: { 'props.headline': { from: 'MSc EAI candidate', to: 'MSc EAI candidate, applied NLP' } } },
  ]);
  await history(who('Hossam Ragab'), 1_800, [
    { agoDays: 1_390, diff: { 'props.headline': { from: 'Senior engineer, ledger services', to: 'Technical lead, ledger services' } } },
  ]);
  await history(pReconcile, 1_700, [
    { agoDays: 1_360, op: 'append', diff: { end_date: { from: null, to: '2018-06-30' }, 'props.status': { from: 'active', to: 'done' } } },
  ]);

  // ── The invariants, checked rather than commented ───────────────────────────
  //
  // Every rule in this file's header protects a Playwright locator that has no
  // `.first()` and would fail on strict mode the moment a second element
  // matched. A comment saying "do not add another X" cannot fail; this can. The
  // seed refusing to finish is a far cheaper way to learn that a record broke
  // an assertion than a red suite twenty minutes later with no obvious cause.
  const liveNodes = await repository.allLiveNodes();
  const liveEdges = await repository.allLiveEdges();
  const liveTargets = (await repository.docList<Record<string, unknown>>('targets')).filter((t) => !t.deleted_at);
  const liveResumes = (await repository.docList<Record<string, unknown>>('resumes')).filter((r) => !r.deleted_at);

  const failures: string[] = [];
  const check = (ok: boolean, message: string) => {
    if (!ok) failures.push(message);
  };

  // Coverage of the catalogue, asserted rather than asserted-in-a-comment. The
  // header's counts are the thing a reader checks the seed against, and the
  // last version of them was wrong by one type in a direction nobody noticed.
  const seededNodeTypes = new Set(liveNodes.map((n) => n.type));
  const missingNodeTypes = NODE_TYPES.filter((type) => !seededNodeTypes.has(type));
  check(missingNodeTypes.length === 0, `node types with no record in the demo space: ${missingNodeTypes.join(', ')}`);
  const seededEdgeTypes = new Set(liveEdges.map((e) => e.type));
  const missingEdgeTypes = EDGE_TYPES.filter((type) => !seededEdgeTypes.has(type));
  check(missingEdgeTypes.length === 0, `edge types with no record in the demo space: ${missingEdgeTypes.join(', ')}`);

  // Four specs open the Aurora target by clicking the first element carrying
  // this text, and the rail sorts by `updated_at`.
  const mlTargets = liveTargets.filter((t) => `${t.role_title ?? ''} ${t.company ?? ''}`.includes('Machine Learning Engineer'));
  check(mlTargets.length === 1, `expected exactly one target named "Machine Learning Engineer", found ${mlTargets.length}`);
  const railOrder = [...liveTargets].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')));
  check(railOrder[0]?.id === target1.id, 'the Aurora Dynamics target is no longer the most recently updated one, so it will not be first in the Tailor rail');

  // `demo-mode.spec.ts` names the chain Jean-Paul → Marc → Aurora, and the
  // warm-path score is a product of edge strengths: any further tie into either
  // person can outrank it, and a second Aurora affiliation can replace it.
  const marcAndJean = new Set([marc, jean]);
  const tiesIntoTheChain = liveEdges.filter(
    (e) => (e.type === 'KNOWS' || e.type === 'INTRODUCED') && (marcAndJean.has(e.src) || marcAndJean.has(e.dst)),
  );
  check(tiesIntoTheChain.length === 3, `expected exactly 3 ties touching Marc Uwimana or Jean-Paul Habimana (self→Marc, self→Jean-Paul, Jean-Paul→Marc), found ${tiesIntoTheChain.length}`);
  const auroraRoles = liveEdges.filter((e) => e.type === 'ROLE_AT' && e.dst === aurora);
  check(auroraRoles.length === 1, `expected exactly one role at Aurora Dynamics (Marc's), found ${auroraRoles.length}`);
  const auroraOrgs = liveNodes.filter((n) => n.type === 'organization' && String(n.title).includes('Aurora Dynamics'));
  check(auroraOrgs.length === 1, `expected exactly one organisation named "Aurora Dynamics", found ${auroraOrgs.length}`);

  // `outputs.spec.ts` asserts every row's "Details for ..." label is distinct.
  const resumeLabels = liveResumes.map((r) => `${r.name} ${String(r.created_at).slice(0, 16)}`);
  check(new Set(resumeLabels).size === resumeLabels.length, 'two outputs share a name and a creation minute, so their row labels collide');

  // Words a spec matches with no `.first()`. Each is checked against the text
  // that reaches the screen the assertion runs on, and no wider: the résumé hub
  // renders output names and nothing else a person wrote, so a bullet may say
  // "workflow" freely while an output name may not.
  const nodeText = liveNodes.map((n) => `${n.title} ${n.subtitle ?? ''}`);
  const atomText = (await repository.docList<Record<string, unknown>>('atom_variants')).map((v) => String(v.text));
  const ownerText = liveNodes.filter((n) => n.type === 'role' || n.type === 'project').map((n) => `${n.title} ${n.subtitle ?? ''}`);
  const resumeText = liveResumes.flatMap((r) => {
    const config = (r.config ?? {}) as Record<string, unknown>;
    return [String(r.name), String(config.headline ?? ''), String(config.summary ?? '')];
  });
  const targetText = liveTargets.map((t) => `${t.role_title ?? ''} ${t.company ?? ''}`);
  for (const [label, pattern, corpus, screen] of [
    ['workflow', /workflow/i, resumeText, '/resume, where the Workflow heading is asked for by text'],
    ['all atoms', /all atoms/i, [...atomText, ...ownerText], '/resume/tailor, in manual selection mode'],
    ['a count of bullets', /\d+\s+bullets/i, [...atomText, ...ownerText, ...targetText], '/resume/tailor, beside the included list'],
    ['a trailing "shown"', /shown$/, [...atomText, ...ownerText], '/resume/atoms, next to the library count'],
    ['a trailing "outputs"', /outputs$/, [...resumeText, ...targetText], '/resume/outputs, next to the archive count'],
    ['demo space', /demo space/i, [...nodeText, ...atomText, ...resumeText, ...targetText], 'every screen: the banner sign-in waits for'],
  ] as Array<[string, RegExp, string[], string]>) {
    const hit = corpus.find((text) => pattern.test(text));
    check(hit === undefined, `a record contains ${label}, which is matched with no .first() on ${screen}: ${JSON.stringify(hit)}`);
  }

  // There is deliberately no rule here about "Education" or "Technical Skills"
  // appearing in a bullet. Those were a hazard while the document editor asked
  // the paper for them as loose text; it now asks the section itself for its
  // heading, which body text cannot satisfy. Selection is free to put whatever
  // wording it likes on the page.

  if (failures.length > 0) {
    throw new Error(`demo seed broke ${failures.length} e2e invariant(s):\n  - ${failures.join('\n  - ')}`);
  }

  const counts = { nodes: (await repository.allLiveNodes()).length, edges: (await repository.allLiveEdges()).length };
  const byType = new Map<string, number>();
  for (const node of liveNodes) byType.set(node.type, (byType.get(node.type) ?? 0) + 1);
  const docCounts: Array<[string, number]> = [];
  for (const table of ['atoms', 'atom_variants', 'atom_skills', 'targets', 'resumes', 'letters', 'dossiers', 'revisions', 'tags', 'taggings', 'reminders', 'imports', 'import_rows', 'saved_views', 'habit_checks'] as const) {
    docCounts.push([table, await repository.docCount(table)]);
  }
  console.log(`\n✓ Demo seed complete: ${counts.nodes} nodes, ${counts.edges} edges (demo_* collections).`);
  console.log(`  ${[...byType.entries()].sort((a, b) => b[1] - a[1]).map(([type, n]) => `${type} ${n}`).join(' · ')}`);
  console.log(`  ${docCounts.map(([table, n]) => `${table} ${n}`).join(' · ')}`);
  console.log(`  ${failures.length === 0 ? 'e2e invariants hold' : 'e2e invariants BROKEN'}: one ML Engineer target, Aurora reachable only through Marc, output labels unique.`);
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
