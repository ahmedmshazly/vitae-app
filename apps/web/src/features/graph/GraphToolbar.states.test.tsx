/**
 * The life-map trace and the control bands it sits above.
 *
 * The trace used to have no failure branch, so a graph request that died still
 * announced "Map assembled from your records" and "0 records, 0 connections"
 * into a polite live region. Three of the four bands carried an aria-label on
 * a div with no role, which drops the label entirely.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@vitae/ui';
import type { GraphPalette } from '../../lib/graph-palette.js';
import { renderWithApp } from '../../test/render.js';
import { GraphToolbar, type GraphToolbarProps } from './GraphToolbar.js';

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
  fontMono: 'mono',
  slots: Array(8).fill('#0f0') as string[],
};

const base: GraphToolbarProps = {
  mode: 'explore',
  onMode: () => {},
  lens: 'neighborhood',
  onLens: () => {},
  typeGroups: [
    { label: 'People', types: ['person'] },
    { label: 'Career', types: ['organization', 'role'] },
  ],
  activeTypes: new Set(['person']),
  onToggleType: () => {},
  edgeTypes: ['KNOWS', 'WORKED_AT'],
  activeEdgeTypes: new Set(['KNOWS']),
  onToggleEdgeType: () => {},
  depth: 2,
  truncated: false,
  palette,
  modeHint: 'Explore the map',
};

function renderToolbar(over: Partial<GraphToolbarProps> = {}) {
  return renderWithApp(<GraphToolbar {...base} {...over} />, {
    wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
  });
}

describe('GraphToolbar trace', () => {
  it('reports the wait while the map is being drawn', () => {
    renderToolbar({ busy: true });
    const trace = screen.getByRole('status');
    expect(trace).toHaveTextContent('Connecting records');
    expect(trace).toHaveTextContent('Reading nodes and relationships');
  });

  it('counts what it drew once the map is there', () => {
    renderToolbar({ nodeCount: 1, connectionCount: 4, focusTitle: 'Ada' });
    const trace = screen.getByRole('status');
    expect(trace).toHaveTextContent('Map assembled from your records');
    expect(trace).toHaveTextContent('1 record');
    expect(trace).toHaveTextContent('4 connections');
    expect(trace).toHaveTextContent('focus Ada');
  });

  it('says the map did not load rather than reporting zero of everything', () => {
    renderToolbar({ failed: true, errorMessage: 'the graph service is down' });
    expect(screen.getByText("Couldn't draw the map")).toBeInTheDocument();
    expect(screen.getByText('the graph service is down')).toBeInTheDocument();
    expect(screen.queryByText(/0 records/)).not.toBeInTheDocument();
  });

  it('treats a finished load with no counts as a failed one', () => {
    renderToolbar({ busy: false });
    expect(screen.getByText("Couldn't draw the map")).toBeInTheDocument();
  });

  it('leaves the assertive alert to the canvas so the failure is spoken once', () => {
    renderToolbar({ failed: true });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('warns when the map is bounded and still gives the counts', () => {
    renderToolbar({ truncated: true, nodeCount: 1500, connectionCount: 3000 });
    const trace = screen.getByRole('status');
    expect(trace).toHaveTextContent('Showing a bounded map');
    expect(trace).toHaveTextContent('limit 1,500');
  });
});

describe('GraphToolbar control bands', () => {
  it('gives every band a group its label can attach to', () => {
    renderToolbar({ nodeCount: 2, connectionCount: 1, lens: 'edgeKinds' });
    expect(screen.getByRole('group', { name: 'Explorer mode' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Entity filters' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Discovery lenses' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Edge kinds' })).toBeInTheDocument();
  });

  it('names the People and Career runs of chips', () => {
    renderToolbar({ nodeCount: 2, connectionCount: 1 });
    const people = screen.getByRole('group', { name: 'People' });
    expect(within(people).getByRole('button', { name: 'person' })).toBeInTheDocument();
    const career = screen.getByRole('group', { name: 'Career' });
    expect(within(career).getByRole('button', { name: 'org' })).toBeInTheDocument();
  });

  it('keeps the lens hint off a mouse-only title attribute', () => {
    renderToolbar({ nodeCount: 2, connectionCount: 1 });
    const lens = screen.getByRole('button', { name: 'Tie strength' });
    expect(lens).not.toHaveAttribute('title');
    expect(lens).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports which types are on without relying on the chip border', () => {
    renderToolbar({ nodeCount: 2, connectionCount: 1 });
    expect(screen.getByRole('button', { name: 'person' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'role' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'person' })).not.toHaveAttribute('style');
  });
});
