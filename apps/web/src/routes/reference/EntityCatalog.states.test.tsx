/**
 * The reference route's reported states and its keyboard routes.
 *
 * This screen mounts outside Shell, outside AuthGate and outside the app's
 * error boundaries and toast provider, so everything it can fail at has to be
 * said inline, and the only way back into the app is the one it draws itself.
 */
import { forwardRef, useImperativeHandle } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityCatalog } from './EntityCatalog.js';

const fit = vi.fn();

interface MockGraphProps {
  state: { compareIds: string[]; selectedIds: string[] };
  onSelect: (id: string, compare: boolean) => void;
}

/** The canvas is a canvas, so the map's own select is the only way a second
 * item can be picked. This stands in for that gesture. */
vi.mock('./EntityObservatoryGraph.js', () => ({
  EntityObservatoryGraph: forwardRef(function MockGraph(props: MockGraphProps, ref) {
    useImperativeHandle(ref, () => ({ fit, zoomIn: vi.fn(), zoomOut: vi.fn(), focus: vi.fn() }));
    return (
      <div data-testid="graph">
        <button type="button" onClick={() => props.onSelect('entity:organization', true)}>
          map shift select organization
        </button>
      </div>
    );
  }),
}));

async function renderCatalog(route = '/reference/entities') {
  const result = render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[route]}
    >
      <EntityCatalog />
    </MemoryRouter>,
  );
  await screen.findByTestId('graph', undefined, { timeout: 10_000 });
  return result;
}

describe('EntityCatalog, reported states', () => {
  beforeEach(() => {
    localStorage.clear();
    fit.mockClear();
  });

  it('draws its own way back into the app', async () => {
    await renderCatalog();
    expect(screen.getByRole('link', { name: /Back to Vitae/ })).toHaveAttribute('href', '/today');
  });

  it('says why a workspace file was rejected instead of ignoring it', async () => {
    const { container } = await renderCatalog();
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).not.toBeNull();

    const payload = '{"state":{"lens":"nonsense"}}';
    const file = new File([payload], 'workspace.json', { type: 'application/json' });
    // jsdom ships no Blob.text, and the control reads the file with it.
    Object.defineProperty(file, 'text', { value: () => Promise.resolve(payload) });

    await act(async () => {
      await userEvent.upload(input, file);
    });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('That file is not an observatory workspace');
    expect(alert).toHaveTextContent('Nothing was changed');
  });

  it('names the export toolbar so its six buttons are not loose siblings', async () => {
    await renderCatalog();
    const outputs = screen.getByRole('group', { name: 'Observatory outputs' });
    expect(within(outputs).getAllByRole('button')).toHaveLength(6);
  });

  it('keeps the atlas inside the main landmark', async () => {
    await renderCatalog();
    fireEvent.click(screen.getByRole('tab', { name: 'A4 atlas' }));
    const main = screen.getByRole('main');
    expect(within(main).getByRole('heading', { name: /Entity and relation/ })).toBeInTheDocument();
  });

  it('leaves the browser its own modified keys', async () => {
    await renderCatalog();
    const lenses = screen.getByRole('group', { name: 'Observatory lens' });
    expect(within(lenses).getByRole('button', { name: /Orbit/ })).toHaveClass('is-active');

    // Ctrl+F opens the find bar, and Ctrl+2 goes to another tab. Neither is
    // addressed to this screen.
    fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
    fireEvent.keyDown(window, { key: '2', ctrlKey: true });

    expect(fit).not.toHaveBeenCalled();
    expect(within(lenses).getByRole('button', { name: /Orbit/ })).toHaveClass('is-active');

    // Bare keys are ours.
    fireEvent.keyDown(window, { key: 'f' });
    expect(fit).toHaveBeenCalledOnce();
  });

  it('offers its index as lists a screen reader can count', async () => {
    await renderCatalog();
    const inspector = screen.getByLabelText('Schema details');
    const relations = within(inspector).getByRole('list', { name: 'Relation types' });
    expect(within(relations).getAllByRole('listitem').length).toBeGreaterThan(10);
  });

  it('moves focus to the dossier that replaced the index', async () => {
    await renderCatalog();
    const inspector = screen.getByLabelText('Schema details');
    fireEvent.click(within(inspector).getByRole('button', { name: /^person/ }));
    expect(screen.getByRole('group', { name: 'person details' })).toHaveFocus();
  });

  it('holds a second pick beside the first when Shift is down', async () => {
    await renderCatalog();
    const inspector = screen.getByLabelText('Schema details');
    fireEvent.click(within(inspector).getByRole('button', { name: /^person/ }));

    fireEvent.click(screen.getByRole('button', { name: 'map shift select organization' }));
    expect(screen.getByText(/comparing organization/)).toBeInTheDocument();
  });

  it('confirms a copied share link, and reports one it could not copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    // setup() installs its own clipboard stub, so ours has to land after it.
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await renderCatalog();
    await user.click(screen.getByRole('button', { name: 'Controls' }));
    await user.click(screen.getByRole('button', { name: 'Workspace' }));

    await user.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(await screen.findByText('Share link copied')).toBeInTheDocument();

    writeText.mockRejectedValueOnce(new Error('denied'));
    await user.click(screen.getByRole('button', { name: 'Copy share link' }));
    expect(await screen.findByText('Could not copy the link')).toBeInTheDocument();
  });
});
