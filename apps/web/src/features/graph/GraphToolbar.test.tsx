/**
 * Life-map chrome: mode, lenses, type chips.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GraphPalette } from '../../lib/graph-palette.js';
import { renderWithApp } from '../../test/render.js';
import { GraphToolbar } from './GraphToolbar.js';

const palette: GraphPalette = {
  bg: '#000',
  border: '#111',
  borderStrong: '#222',
  muted: '#888',
  faint: '#666',
  fg: '#fff',
  accent: '#eee',
  accentSoft: '#ccc',
  plate: '#000',
  dim: '#333',
  fontSans: 'sans-serif',
  slots: Array(8).fill('#0f0') as string[],
};

describe('GraphToolbar', () => {
  it('switches mode, lens, and type filters', async () => {
    const user = userEvent.setup();
    const onMode = vi.fn();
    const onLens = vi.fn();
    const onToggleType = vi.fn();
    renderWithApp(
      <GraphToolbar
        mode="explore"
        onMode={onMode}
        lens="neighborhood"
        onLens={onLens}
        typeGroups={[{ label: 'People', types: ['person'] }]}
        activeTypes={new Set(['person'])}
        onToggleType={onToggleType}
        edgeTypes={[]}
        activeEdgeTypes={new Set()}
        onToggleEdgeType={() => {}}
        depth={2}
        truncated={false}
        palette={palette}
        modeHint="Explore the map"
      />,
    );

    expect(screen.getByRole('group', { name: 'Explorer mode' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Path' }));
    expect(onMode).toHaveBeenCalledWith('path');

    await user.click(screen.getByRole('button', { name: 'Tie strength' }));
    expect(onLens).toHaveBeenCalledWith('strength');

    await user.click(screen.getByRole('button', { name: 'person' }));
    expect(onToggleType).toHaveBeenCalledWith('person');
  });
});
