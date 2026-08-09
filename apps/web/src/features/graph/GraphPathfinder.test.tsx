/**
 * Pathfinder trail trim + endpoint chrome.
 */
import './../../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { GraphPathfinder, trailAfterJump } from './GraphPathfinder.js';
import type { FocusTrailHop } from './types.js';

beforeEach(() => {
  resetMockApi();
  mockApi.get.mockResolvedValue({ results: [] });
});

describe('trailAfterJump', () => {
  const a: FocusTrailHop = { id: 'a', title: 'A' };
  const b: FocusTrailHop = { id: 'b', title: 'B' };
  const c: FocusTrailHop = { id: 'c', title: 'C' };

  it('appends a new hop and trims when revisiting', () => {
    expect(trailAfterJump([], a)).toEqual([a]);
    expect(trailAfterJump([a, b], c)).toEqual([a, b, c]);
    expect(trailAfterJump([a, b, c], b)).toEqual([a, b]);
  });
});

describe('GraphPathfinder', () => {
  it('shows From title and a To picker when destination is empty', () => {
    renderWithApp(
      <GraphPathfinder
        fromId="self"
        fromTitle="Ada"
        toId={null}
        toTitle={null}
        onPickTo={() => {}}
        onClearTo={() => {}}
        selfId="self"
      />,
    );
    expect(screen.getByText('Ada')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search who or what…')).toBeInTheDocument();
  });

  it('clears a chosen destination', async () => {
    const user = userEvent.setup();
    const onClearTo = vi.fn();
    renderWithApp(
      <GraphPathfinder
        fromId="self"
        fromTitle="Ada"
        toId="p2"
        toTitle="Grace"
        onPickTo={() => {}}
        onClearTo={onClearTo}
        selfId="self"
      />,
    );
    expect(screen.getByText('Grace')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'clear' }));
    expect(onClearTo).toHaveBeenCalled();
  });
});
