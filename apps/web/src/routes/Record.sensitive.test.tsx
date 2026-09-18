/** Sensitive generic dossiers must not expose private values simply on navigation. */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Record } from './Record.js';

const healthRecord = {
  node: {
    id: 'health-1',
    type: 'health_log',
    title: 'Morning weigh-in',
    subtitle: 'private measurement',
    props: { metric: 'weight', value: 72.4, api_token: 'not-a-real-token' },
    notes_md: 'Discuss this at the next appointment.',
    source: 'manual',
    confidence: 1,
    pinned: false,
    created_at: '2026-09-13T08:00:00Z',
    updated_at: '2026-09-13T08:00:00Z',
    deleted_at: null,
  },
  edges: [],
  neighbors: {},
};

function renderRecord() {
  return renderWithApp(
    <Routes>
      <Route path="/records/:id" element={<Record />} />
    </Routes>,
    { route: '/records/health-1' },
  );
}

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockImplementation((path: string) => {
    if (path === '/nodes/health-1') return Promise.resolve(healthRecord);
    if (path === '/nodes/health-1/revisions') {
      return Promise.resolve({
        revisions: [
          {
            rev: 1,
            op: 'create',
            at: '2026-09-13T08:00:00Z',
            diff: { 'props.api_token': { from: null, to: 'not-a-real-token' } },
          },
        ],
      });
    }
    if (path === '/knowledge/entities/health-1/evidence')
      return Promise.resolve({ assertions: [] });
    return Promise.reject(new Error(`Unexpected request: ${path}`));
  });
});

describe('sensitive Record', () => {
  it('hides health content on entry, then reveals it deliberately without exposing credential-shaped values', async () => {
    const user = userEvent.setup();
    renderRecord();

    const reveal = await screen.findByRole('button', { name: 'Reveal sensitive details' });
    expect(reveal).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('heading', { name: 'Sensitive health log record' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sensitive details are hidden on entry.')).toBeInTheDocument();
    expect(screen.queryByText('Morning weigh-in')).not.toBeInTheDocument();
    expect(screen.queryByText('Discuss this at the next appointment.')).not.toBeInTheDocument();
    expect(screen.queryByText('72.4')).not.toBeInTheDocument();

    await user.click(reveal);

    expect(screen.getByRole('button', { name: 'Hide sensitive details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('heading', { name: 'Morning weigh-in' })).toBeInTheDocument();
    expect(screen.getByText('Discuss this at the next appointment.')).toBeInTheDocument();
    expect(screen.getByText('72.4')).toBeInTheDocument();
    expect(screen.queryByText('not-a-real-token')).not.toBeInTheDocument();
  });
});
