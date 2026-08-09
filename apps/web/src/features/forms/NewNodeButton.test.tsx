/**
 * NewNodeButton opens the node form dialog.
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { NewNodeButton } from './NewNodeButton.js';

beforeEach(() => {
  resetMockApi();
  // Dialog mounts SuggestTextInput / auth lookups; keep every get a resolved promise.
  mockApi.get.mockResolvedValue({
    user: null,
    node: null,
    edges: [],
    neighbors: {},
    values: [],
    results: [],
  });
  mockApi.post.mockResolvedValue({ fingerprint: 'f', candidates: [] });
});

describe('NewNodeButton', () => {
  it('opens the create dialog for a valid type', async () => {
    const user = userEvent.setup();
    renderWithApp(<NewNodeButton type="person" />);
    await user.click(screen.getByRole('button', { name: /New person/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('renders nothing for an unknown type', () => {
    const { container } = renderWithApp(<NewNodeButton type="not_a_type" />);
    expect(container).toBeEmptyDOMElement();
  });
});
