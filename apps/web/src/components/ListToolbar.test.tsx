/**
 * The toolbar is judged on two things: the whole view survives being copied
 * out of the address bar, and the state is readable without eyes. So these
 * cover the URL round trip (a default stays off it, an unrelated param
 * survives, junk falls back) and the accessibility the four bars it replaces
 * were missing: a named search landmark, a labelled input, a spoken count,
 * and a sort direction that says which direction it is in.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import { runAxe } from '../test/a11y.js';
import { facetParam, sortParam, textParam, useListParams, TYPING_DEBOUNCE_MS } from '../lib/list-params.js';
import { countLabel, ListToolbar } from './ListToolbar.js';

const schema = {
  q: textParam(),
  kind: facetParam(['all', 'achievement', 'skill_line'], 'all'),
  state: facetParam(['any', 'pinned', 'blocked', 'archived', 'incomplete'], 'any'),
  order: sortParam(['recent', 'title'], 'recent'),
};

const TOTAL = 12;
const NARROWED = 3;

function Harness() {
  const list = useListParams(schema);
  const location = useLocation();
  return (
    <>
      <ListToolbar
        list={list}
        label="Filter atoms"
        placeholder="Search bullet text or owner..."
        noun="atom"
        count={list.isDefault ? TOTAL : NARROWED}
        total={TOTAL}
        facets={[
          {
            name: 'kind',
            label: 'Kind',
            options: [
              { value: 'all', label: 'All kinds' },
              { value: 'achievement', label: 'Achievements' },
              { value: 'skill_line', label: 'Skill lines' },
            ],
          },
          {
            name: 'state',
            label: 'State',
            as: 'select',
            placeholder: 'All states',
            options: [
              { value: 'pinned', label: 'Pinned' },
              { value: 'blocked', label: 'Blocked' },
              { value: 'archived', label: 'Archived' },
              { value: 'incomplete', label: 'Needs attention' },
            ],
          },
        ]}
        sort={{
          name: 'order',
          label: 'Sort by',
          options: [
            { value: 'recent', label: 'Recently updated' },
            { value: 'title', label: 'Title' },
          ],
        }}
      />
      <span data-testid="search">{location.search}</span>
    </>
  );
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

describe('countLabel', () => {
  it('agrees with the number in front of it', () => {
    expect(countLabel(1, undefined, 'atom')).toBe('1 atom');
    expect(countLabel(12, undefined, 'atom')).toBe('12 atoms');
    expect(countLabel(12, 12, 'atom')).toBe('12 atoms');
    expect(countLabel(3, 12, 'atom')).toBe('3 of 12 atoms');
    expect(countLabel(1, 12, 'entry', 'entries')).toBe('1 of 12 entries');
  });
});

describe('ListToolbar accessibility', () => {
  it('puts the query input in a named search landmark and gives it a real label', () => {
    renderWithApp(<Harness />, { route: '/atoms' });

    expect(screen.getByRole('search', { name: 'Filter atoms' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Filter atoms' })).toBeInTheDocument();
  });

  it('names every facet control, including the one rendered as a select', () => {
    renderWithApp(<Harness />, { route: '/atoms' });

    expect(screen.getByRole('group', { name: 'Kind' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'State: All states' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Sort by: Recently updated' })).toBeInTheDocument();
  });

  it('says which value a select facet is on, not only which facet it is', () => {
    // Radix puts the label on the trigger as aria-label, which overrides the
    // visible value, so a name of "State" alone would leave the active filter
    // as something only a sighted user can tell.
    renderWithApp(<Harness />, { route: '/atoms?state=pinned' });

    expect(screen.getByRole('combobox', { name: 'State: Pinned' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'State: All states' })).not.toBeInTheDocument();
  });

  it('says which key the sort is on', () => {
    renderWithApp(<Harness />, { route: '/atoms?order=title' });

    expect(screen.getByRole('combobox', { name: 'Sort by: Title' })).toBeInTheDocument();
  });

  it('renders a select facet at its default as the placeholder, not as a blank trigger', () => {
    // The default is deliberately not one of the options, so handing it to
    // Radix as a value would match no item and the trigger would read empty.
    renderWithApp(<Harness />, { route: '/atoms' });

    expect(screen.getByRole('combobox', { name: /^State/ })).toHaveTextContent('All states');
  });

  it('announces the result count in a live region', () => {
    renderWithApp(<Harness />, { route: '/atoms' });

    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('12 atoms');
    expect(live).toHaveAttribute('aria-live', 'polite');
  });

  it('says the word "filtered" when the list is narrowed, rather than only marking it', () => {
    renderWithApp(<Harness />, { route: '/atoms' });

    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(screen.getByRole('status')).toHaveTextContent('Filtered: 3 of 12 atoms');
  });

  it('states which direction the sort is in, and what pressing it would do', () => {
    renderWithApp(<Harness />, { route: '/atoms' });

    const toggle = screen.getByRole('button', {
      name: 'Sort direction: descending. Activate to sort ascending.',
    });
    expect(toggle).toHaveTextContent('Descending');

    fireEvent.click(toggle);
    expect(search()).toBe('?order=recent%3Aasc');
    expect(
      screen.getByRole('button', { name: 'Sort direction: ascending. Activate to sort descending.' }),
    ).toHaveTextContent('Ascending');
  });

  it('has no axe violations, narrowed or not', async () => {
    renderWithApp(<Harness />, { route: '/atoms' });
    expect(await runAxe(screen.getByRole('search'))).toHaveNoViolations();

    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(await runAxe(screen.getByRole('search'))).toHaveNoViolations();
  });
});

describe('ListToolbar and the URL', () => {
  it('keeps a default facet value off the URL', () => {
    renderWithApp(<Harness />, { route: '/atoms' });
    expect(search()).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(search()).toBe('?kind=achievement');

    fireEvent.click(screen.getByRole('button', { name: 'All kinds' }));
    expect(search()).toBe('');
  });

  it('keeps an unrelated param when a facet changes', () => {
    renderWithApp(<Harness />, { route: '/atoms?owner=n1' });

    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    expect(search()).toContain('owner=n1');
    expect(search()).toContain('kind=achievement');
  });

  it('reads a malformed URL as the default view instead of failing', () => {
    renderWithApp(<Harness />, { route: '/atoms?kind=unicorn&order=%3Bdrop&state=' });

    expect(screen.getByRole('button', { name: 'All kinds' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Sort direction: descending/ })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('12 atoms');
  });

  it('offers the way back only when there is something to clear', () => {
    renderWithApp(<Harness />, { route: '/atoms?owner=n1' });
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Achievements' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(search()).toBe('?owner=n1');
    expect(screen.getByRole('status')).toHaveTextContent('12 atoms');
  });
});

describe('ListToolbar query box', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes the query to the URL after the typing debounce, not on every keystroke', () => {
    vi.useFakeTimers();
    renderWithApp(<Harness />, { route: '/atoms' });
    const box = screen.getByRole('searchbox', { name: 'Filter atoms' });

    fireEvent.change(box, { target: { value: 'okafor' } });
    expect(box).toHaveValue('okafor');
    expect(search()).toBe('');

    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });
    expect(search()).toBe('?q=okafor');
  });

  it('writes the query at once on Enter', () => {
    vi.useFakeTimers();
    renderWithApp(<Harness />, { route: '/atoms' });
    const box = screen.getByRole('searchbox', { name: 'Filter atoms' });

    fireEvent.change(box, { target: { value: 'okafor' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(search()).toBe('?q=okafor');
  });
});
