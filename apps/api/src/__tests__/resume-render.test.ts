/**
 * Template rendering tests (SRS D10/§8.4). Pure disk + string work, no
 * database, so they always run. Asserts the cobalt renderer emits the
 * design's macros, every section kind renders, no «tokens» leak, and hostile
 * input arrives escaped.
 */
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../services/resume.js';
import type { ResumeModel } from '../services/resume-model.js';

const model: ResumeModel = {
  name: 'Jordan Kim',
  tagline: 'Automated pipelines · applied ML · embedded systems',
  contacts: [
    { key: 'city', value: 'Kigali' },
    { key: 'email', value: 'jordan@example.com', href: 'mailto:jordan@example.com' },
    { key: 'github', value: 'github.com/jordan-kim', href: 'https://github.com/jordan-kim?a=1&b=2' },
    { key: 'phone', value: '+250 780 000 000', disabled: true },
  ],
  headline: 'Machine Learning Engineer',
  summary: 'Engineer with a record of **reliable delivery**.',
  sections: [
    {
      key: 'skills',
      title: 'Technical Skills',
      kind: 'skillrows',
      skillRows: [
        {
          id: 'skillcat:language',
          label: 'Programming',
          content: 'Python, C, SQL',
          skills: [{ id: 'python', name: 'Python' }],
        },
        {
          id: 'skillcat:domain',
          label: 'Domains',
          content: 'ML & RL 100% #hostile_$tuff',
          skills: [{ id: 'ml', name: 'ML' }],
        },
      ],
    },
    {
      key: 'experience',
      title: 'Experience',
      kind: 'entries',
      entries: [
        {
          id: 'role-1',
          role: 'Data Engineering Intern',
          org: 'NiaDelta & Partners',
          location: 'Remote (Mauritius)',
          dates: 'Apr 2023 -- Dec 2024',
          bullets: [
            { id: 'atom-1', text: 'Built a pipeline covering **17 teams** with 30% savings.' },
            { id: 'atom-2', text: 'Injected \\evil{macro} attempt' },
          ],
        },
        { id: 'role-2', role: 'Solo Project', bullets: [{ id: 'atom-3', text: 'No org or location on this one.' }] },
      ],
    },
    {
      key: 'awards',
      title: 'Awards',
      kind: 'lines',
      lines: [{ id: 'award-1', text: '1st Place, World Robot Challenge (2019)' }],
    },
    { key: 'projects', title: 'Selected Projects', kind: 'entries', entries: [] }, // empty → dropped
  ],
};

describe('renderTemplate (cobalt)', () => {
  it('emits the design macros for every section kind', async () => {
    const tex = await renderTemplate('cobalt', model);
    expect(tex).toContain('\\cventry{Data Engineering Intern}{NiaDelta \\& Partners\\,\\textbar\\,Remote (Mauritius)}{Apr 2023 -- Dec 2024}');
    expect(tex).toContain('\\skillrow{Programming}{Python, C, SQL}');
    expect(tex).toContain('\\begin{pts}');
    expect(tex).toContain('\\section{Awards}');
    expect(tex).toContain('1st Place, World Robot Challenge (2019)');
    expect(tex).toContain('\\dotsep{}'); // contact + tagline separators
    expect(tex).toContain('\\href{mailto:jordan@example.com}{jordan@example.com}');
    expect(tex).toContain('\\href{https://github.com/jordan-kim?a=1\\&b=2}{github.com/jordan-kim}');
    expect(tex).not.toContain('+250 780 000 000');
    expect(tex).not.toContain('Selected Projects'); // empty section dropped
  });

  it('renders entries without org/location with an empty subtitle slot', async () => {
    const tex = await renderTemplate('cobalt', model);
    expect(tex).toContain('\\cventry{Solo Project}{}{}');
  });

  it('escapes hostile input and supports the markdown whitelist', async () => {
    const tex = await renderTemplate('cobalt', model);
    expect(tex).toContain('\\textbf{17 teams}');
    expect(tex).toContain('30\\%');
    expect(tex).toContain('\\#hostile\\_\\$tuff');
    expect(tex).toContain('\\textbackslash{}evil\\{macro\\}');
    expect(tex).not.toMatch(/[^\\]\\evil/);
  });

  it('leaves no unresolved «tokens»', async () => {
    const tex = await renderTemplate('cobalt', model);
    expect(tex).not.toMatch(/«[^»]*»/);
  });

  it('applies only the curated accent value supplied by the caller', async () => {
    const tex = await renderTemplate('cobalt', model, '#0f766e');
    expect(tex).toContain('\\definecolor{accent}{HTML}{0F766E}');
  });

  it('defaults to the Cobalt gallery accent when none is supplied', async () => {
    const tex = await renderTemplate('cobalt', model);
    expect(tex).toContain('\\definecolor{accent}{HTML}{2563EB}');
  });
});

describe('renderTemplate (onyx)', () => {
  it('renders all section kinds with the classic macros', async () => {
    const tex = await renderTemplate('onyx', model);
    expect(tex).toContain('\\section{Technical Skills}');
    expect(tex).toContain('{\\bfseries Programming:} Python, C, SQL');
    expect(tex).toContain('{\\bfseries Data Engineering Intern}, NiaDelta \\& Partners \\hfill Apr 2023 -- Dec 2024');
    expect(tex).toContain('\\begin{itemize}');
    expect(tex).not.toMatch(/«[^»]*»/);
  });
});
