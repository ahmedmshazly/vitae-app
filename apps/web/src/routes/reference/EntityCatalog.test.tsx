import { forwardRef, useImperativeHandle } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityCatalog } from './EntityCatalog.js';

vi.mock('./EntityObservatoryGraph.js', () => ({
  EntityObservatoryGraph: forwardRef(function MockGraph(
    { onSelect }: { onSelect: (id: string, compare: boolean) => void },
    ref,
  ) {
    useImperativeHandle(ref, () => ({
      fit: vi.fn(),
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      focus: vi.fn(),
    }));
    return (
      <button type="button" onClick={() => onSelect('entity:person', false)}>
        Select person
      </button>
    );
  }),
}));

async function renderCatalog(route = '/reference/entities') {
  const result = render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[route]}>
      <EntityCatalog />
    </MemoryRouter>,
  );
  await screen.findByRole('button', { name: 'Select person' }, { timeout: 10_000 });
  return result;
}

describe('EntityCatalog observatory', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('restores legacy selection links into the calm Orbit lens', async () => {
    await renderCatalog('/reference/entities?select=relation:KNOWS&layout=structured');
    expect(
      screen.getByRole('heading', { name: 'Relation intelligence, without the hairball.' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Orbit/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const inspector = screen.getByLabelText('Schema details');
    expect(within(inspector).getByRole('heading', { name: 'KNOWS' })).toBeInTheDocument();
    expect(within(inspector).getByText(/Person ↔ person/)).toBeInTheDocument();
  });

  it(
    'supports graph selection and the Focus and Matrix lenses',
    async () => {
      await renderCatalog();
      fireEvent.click(screen.getByRole('button', { name: 'Select person' }));
      const inspector = screen.getByLabelText('Schema details');
      expect(within(inspector).getByRole('heading', { name: 'person' })).toBeInTheDocument();
      expect(within(inspector).getByText('Given name')).toBeInTheDocument();

      const lenses = screen.getByRole('group', { name: 'Observatory lens' });
      fireEvent.click(within(lenses).getByRole('button', { name: /Focus/ }));
      expect(screen.getByText(/routes visible/)).toBeInTheDocument();

      fireEvent.click(within(lenses).getByRole('button', { name: /Matrix/ }));
      expect(screen.getByText(/A line-free audit surface/)).toBeInTheDocument();
      expect(screen.getByLabelText(/person to person, \d+ relations?: .*KNOWS/)).toBeEnabled();
    },
    // Heavy under full-suite load (jsdom + large catalog); keep a floor above the default.
    20_000,
  );

  it('opens the printable A4 atlas with overview, matrix, and anatomy sheets', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('tab', { name: 'A4 atlas' }));
    expect(screen.getByRole('heading', { name: 'Entity and relation map' })).toBeInTheDocument();
    expect(screen.getByText('Canonical relation matrix')).toBeInTheDocument();
    expect(screen.getByText('Shared anatomy')).toBeInTheDocument();
  });

  it('opens expert controls and saves a versioned local workspace', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Controls' }));
    expect(screen.getByRole('heading', { name: 'Visual controls' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Audit view' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save current' }));
    expect(screen.getByLabelText('Saved workspace')).not.toHaveValue('');
    expect(localStorage.getItem('vitae.entity-observatory.v1')).toContain('Audit view');
  });

  it('selects workspace and canonical print modes before opening print', async () => {
    const print = vi.fn();
    Object.defineProperty(window, 'print', { configurable: true, value: print });
    let callback: FrameRequestCallback | undefined;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((next) => {
      callback = next;
      return 1;
    });
    const { container } = await renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Print current lens' }));
    expect(container.querySelector('.ec')).toHaveAttribute('data-print-mode', 'workspace');
    // The frame callback prints and then clears the print mode, so it moves
    // state and has to run inside act.
    act(() => callback?.(0));
    expect(print).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Print overview pack' }));
    expect(container.querySelector('.ec')).toHaveAttribute('data-print-mode', 'overview');
  });
});
