import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { renderWithApp } from '../test/render.js';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import type * as AuthModule from '../lib/auth.js';
import { Org } from './Org.js';

const permissions = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (original) => ({
  ...(await original<typeof AuthModule>()),
  useCanWrite: () => permissions.canWrite,
}));
const profile = {
  id: 'org',
  title: 'Fictional research organization',
  kind: 'community',
  city: 'Alexandria',
  domain: 'example.com',
  peopleCount: 0,
  affinity: 0,
  openRoles: 0,
  inroads: [],
  roles: [],
  relatedOrgs: [],
};
const record = {
  node: {
    id: 'org',
    type: 'organization',
    title: profile.title,
    subtitle: 'Accessible research',
    props: {
      industry: 'Research',
      size_hint: '51–200',
      website: 'https://example.com',
      linkedin_url: 'javascript:alert(1)',
    },
    notes_md: 'Saved research notes',
  },
  edges: [],
  neighbors: {},
};
function serve(over: { profile?: unknown; record?: unknown } = {}) {
  mockApi.get.mockImplementation(async (path: string) => {
    const value =
      path === '/orgs/org'
        ? 'profile' in over
          ? over.profile
          : { org: profile }
        : path === '/nodes/org'
          ? 'record' in over
            ? over.record
            : record
          : { assertions: [] };
    if (value instanceof Error) throw value;
    return value;
  });
}
function open() {
  return renderWithApp(
    <Routes>
      <Route path="/network/organizations/:id" element={<Org />} />
    </Routes>,
    { route: '/network/organizations/org' },
  );
}
beforeEach(() => {
  resetMockApi();
  permissions.canWrite = true;
  serve();
});

it('shows saved details, safe website links and operable notes', async () => {
  const user = userEvent.setup();
  open();
  const details = await screen.findByRole('region', { name: 'Details' });
  await waitFor(() => expect(within(details).getByText('Research')).toBeVisible());
  expect(within(details).getByRole('link', { name: /https:\/\/example.com/ })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  expect(within(details).getByText('javascript:alert(1)')).toBeVisible();
  expect(within(details).getAllByRole('link')).toHaveLength(1);
  await user.click(within(details).getByText('Notes', { selector: 'summary' }));
  expect(within(details).getByText('Saved research notes')).toBeVisible();
});
it('keeps the profile when saved details fail, without reporting an empty record', async () => {
  serve({ record: new Error('Record unavailable') });
  open();
  expect(await screen.findByRole('heading', { name: profile.title })).toBeVisible();
  await waitFor(() => expect(screen.getByText('Couldn’t load organization details')).toBeVisible());
  expect(screen.queryByText('No connections recorded yet.')).not.toBeInTheDocument();
});
it('rejects incomplete primary data instead of crashing or inventing empty sections', async () => {
  serve({ profile: { org: { id: 'org', title: 'Incomplete' } } });
  open();
  expect(await screen.findByText("Couldn't load this organization")).toBeVisible();
  expect(screen.getByRole('link', { name: 'Back to organizations' })).toHaveAttribute(
    'href',
    '/network/organizations',
  );
});
it('keeps cached profile data visible with actionable refresh recovery', async () => {
  const user = userEvent.setup();
  open();
  await screen.findByRole('heading', { name: profile.title });
  serve({ profile: new Error('Profile unavailable') });
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('This organization could not be refreshed')).toBeVisible();
  expect(screen.getByRole('heading', { name: profile.title })).toBeVisible();
  serve();
  await user.click(screen.getByRole('button', { name: 'Retry record' }));
  await waitFor(() =>
    expect(screen.queryByText('This organization could not be refreshed')).not.toBeInTheDocument(),
  );
});
it('bounds people, roles and related organizations independently', async () => {
  const user = userEvent.setup();
  serve({
    profile: {
      org: {
        ...profile,
        inroads: Array.from({ length: 23 }, (_, i) => ({
          rank: i + 1,
          reason: 'Recorded tie',
          person: { id: `p${i}`, title: `Person ${i}`, strength: 0.5 },
        })),
        roles: Array.from({ length: 23 }, (_, i) => ({
          id: `r${i}`,
          title: `Role ${i}`,
          holder: null,
          open: false,
        })),
        relatedOrgs: Array.from({ length: 23 }, (_, i) => ({
          id: `o${i}`,
          edgeId: `e${i}`,
          title: `Organization ${i}`,
          kind: 'partner',
          direction: 'out',
        })),
      },
    },
  });
  open();
  const people = await screen.findByRole('list', { name: 'Inroads, strongest first' });
  expect(within(people).getAllByRole('listitem')).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Show more people' }));
  expect(within(people).getAllByRole('listitem')).toHaveLength(23);
  expect(within(screen.getByRole('list', { name: 'Roles' })).getAllByRole('listitem')).toHaveLength(
    20,
  );
  await user.click(screen.getByRole('button', { name: 'Show more roles' }));
  expect(within(screen.getByRole('list', { name: 'Roles' })).getAllByRole('listitem')).toHaveLength(
    23,
  );
  await user.click(screen.getByRole('button', { name: 'Show more related organizations' }));
  expect(
    within(screen.getByRole('list', { name: 'Related organizations' })).getAllByRole('listitem'),
  ).toHaveLength(23);
});
it('keeps unknown metrics explicit and prevents writes in a read-only workspace', async () => {
  permissions.canWrite = false;
  serve({ profile: { org: { ...profile, affinity: null, peopleCount: null, openRoles: null } } });
  open();
  await screen.findByRole('heading', { name: profile.title });
  expect(screen.getAllByText('Unavailable')).toHaveLength(3);
  expect(screen.queryByRole('button', { name: 'Edit record' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add connection' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Move to trash' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Rank contacts' })).toBeVisible();
});

it('bounds typed connections while keeping every linked record discoverable', async () => {
  const user = userEvent.setup();
  const people = Array.from({ length: 23 }, (_, index) => ({
    id: `member-${index}`,
    type: 'person',
    title: `Research member ${index}`,
  }));
  serve({
    record: {
      ...record,
      edges: people.map((person, index) => ({
        id: `membership-${index}`,
        type: 'MEMBER_OF',
        src: person.id,
        dst: 'org',
        props: {},
      })),
      neighbors: Object.fromEntries(people.map((person) => [person.id, person])),
    },
  });
  open();
  const connections = await screen.findByRole('list', { name: 'Organization connections' });
  expect(within(connections).getAllByRole('listitem')).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Show more connections (3 remaining)' }));
  expect(within(connections).getAllByRole('listitem')).toHaveLength(23);
  expect(within(connections).getByRole('link', { name: 'Research member 22' })).toHaveAttribute(
    'href',
    '/network/people/member-22',
  );
  expect(screen.queryByRole('button', { name: /Show more connections/ })).not.toBeInTheDocument();
});
