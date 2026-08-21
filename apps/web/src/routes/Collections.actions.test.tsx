import '../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Collections } from './Collections.js';

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockImplementation(async (path: string) => {
    if (path === '/nodes/counts') return { counts: {}, total: 0 };
    if (path === '/views') return { views: [] };
    if (path.startsWith('/nodes?q=')) return { nodes: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe('Library query actions', () => {
  it('opens Save view without submitting the pending query draft', async () => {
    const user = userEvent.setup();
    renderWithApp(<Collections />, { route: '/explore/library?q=type%3Aperson' });

    const query = screen.getByPlaceholderText('Add another clause…');
    await user.type(query, 'city:Cairo');

    const save = screen.getByRole('button', { name: 'Save view' });
    expect(save).toHaveAttribute('type', 'button');
    await user.click(save);

    expect(screen.getByRole('dialog', { name: 'Save this view' })).toBeInTheDocument();
    expect(query).toHaveValue('city:Cairo');
    expect(screen.queryByText('city:Cairo', { selector: '.coll__chip' })).not.toBeInTheDocument();
  });
});
