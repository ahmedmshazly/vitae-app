/**
 * Add connection: Create link stays disabled until relationship + target set.
 * (Radix Select option picking is flaky in jsdom; create happy-path stays in e2e.)
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { AddConnection } from './AddConnection.js';

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ results: [] });
  mockApi.post.mockResolvedValue({ edge: { id: 'e-new' } });
});

describe('AddConnection', () => {
  it('keeps Create link disabled until a relationship is chosen', async () => {
    renderWithApp(
      <AddConnection
        open
        onOpenChange={() => {}}
        nodeId="p1"
        nodeType="person"
        nodeTitle="Ada"
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Add connection' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create link' })).toBeDisabled();
  });
});
