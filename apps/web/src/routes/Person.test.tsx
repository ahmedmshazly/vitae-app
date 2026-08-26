import './../test/api-mock.js';
import { Route, Routes } from 'react-router-dom';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Person } from './Person.js';

const record = {
  node: {
    id: 'person-1',
    title: 'Ada Lovelace',
    subtitle: 'Mathematician',
    source: 'manual',
    props: { headline: 'Analytical engine pioneer', city: 'London' },
  },
  edges: [],
  neighbors: {},
};

const summary = {
  strength: {
    strength: 0.72,
    intensity: 0.35,
    status: 'active',
    daysSinceLast: 12,
    medianGapDays: 30,
    factors: { closeness: 0.45, intensity: 0.27 },
  },
  relationship: {
    relation: 'colleague',
    closeness: 4,
    cadenceTargetDays: 60,
    metVia: 'Babbage',
    topics: ['mathematics'],
    edgeId: null,
    doNotPing: false,
    metOn: null,
    knowsProps: {},
  },
  favors: [],
};

const profile = {
  person: { id: 'person-1', title: 'Ada Lovelace', isSelf: false, isPlaceholder: false },
  sections: [],
  skills: [],
  counts: { records: 0, skills: 0 },
};

function renderPerson() {
  return renderWithApp(
    <Routes>
      <Route path="/network/people/:id" element={<Person />} />
    </Routes>,
    { route: '/network/people/person-1' },
  );
}

beforeEach(() => {
  resetMockApi();
});

describe('person relationship dossier', () => {
  it('names an unavailable secondary query instead of claiming there is no relationship signal', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.endsWith('/summary'))
        return Promise.reject(new Error('strength service unavailable'));
      if (path.endsWith('/profile')) return Promise.resolve(profile);
      if (path.endsWith('/correspondence'))
        return Promise.resolve({ profile: { coverage: { withDirection: 0, total: 0 } } });
      return Promise.resolve(record);
    });
    renderPerson();

    expect(await screen.findByRole('heading', { name: 'Ada Lovelace' })).toBeInTheDocument();
    const strength = screen.getByRole('region', { name: 'Relationship strength' });
    const alert = within(strength).getByRole('alert');
    expect(
      within(alert).getByText('Relationship strength could not be verified'),
    ).toBeInTheDocument();
    expect(within(alert).getByText('strength service unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No relationship signal yet')).not.toBeInTheDocument();
    expect(screen.getByText('Unavailable')).toBeInTheDocument();
  });

  it('gives favor capture specific pending and success feedback', async () => {
    mockApi.get.mockImplementation((path: string) => {
      if (path.endsWith('/summary')) return Promise.resolve(summary);
      if (path.endsWith('/profile')) return Promise.resolve(profile);
      if (path.endsWith('/correspondence'))
        return Promise.resolve({ profile: { coverage: { withDirection: 0, total: 0 } } });
      return Promise.resolve(record);
    });
    mockApi.post.mockResolvedValue({});
    const user = userEvent.setup();
    renderPerson();

    await user.type(
      await screen.findByRole('textbox', { name: 'Favor description' }),
      'Warm introduction',
    );
    await user.click(screen.getByRole('button', { name: 'They owe' }));
    expect(await screen.findByText('Recorded: they owe you')).toBeInTheDocument();
  });
});
