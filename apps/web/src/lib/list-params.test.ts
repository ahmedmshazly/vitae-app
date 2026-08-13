/**
 * The URL is the list state. These lock the four rules the module exists for:
 * a default never reaches the query string, an unrelated param is never
 * clobbered, malformed input falls back instead of throwing, and typing
 * replaces the history entry while a facet change pushes one.
 *
 * The hook cases build their probe with createElement rather than JSX, because
 * the coverage map wants the test colocated as list-params.test.ts and a .ts
 * file is not compiled with the JSX transform.
 */
import { createElement as h, type ChangeEvent } from 'react';
import { act, fireEvent, screen } from '@testing-library/react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithApp } from '../test/render.js';
import {
  applyListParams,
  clearListParams,
  facetParam,
  isDefaultListParams,
  readListParams,
  sortParam,
  textParam,
  useListParams,
  TYPING_DEBOUNCE_MS,
} from './list-params.js';

const schema = {
  q: textParam(),
  kind: facetParam(['all', 'achievement', 'skill_line'], 'all'),
  order: sortParam(['recent', 'title'], 'recent'),
};

const defaults = { q: '', kind: 'all' as const, order: { key: 'recent' as const, dir: 'desc' as const } };

function params(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

describe('list-params encoding', () => {
  it('reads the declared defaults out of an empty query string', () => {
    expect(readListParams(params(''), schema)).toEqual(defaults);
  });

  it('reads a value the URL actually carries', () => {
    expect(readListParams(params('?q=okafor&kind=achievement&order=title:asc'), schema)).toEqual({
      q: 'okafor',
      kind: 'achievement',
      order: { key: 'title', dir: 'asc' },
    });
  });

  it('falls back to the default when a facet value is not one of the declared ones', () => {
    expect(readListParams(params('?kind=unicorn'), schema).kind).toBe('all');
  });

  it('falls back on each half of a malformed sort rather than throwing', () => {
    expect(readListParams(params('?order=;drop:asc'), schema).order).toEqual({
      key: 'recent',
      dir: 'asc',
    });
    expect(readListParams(params('?order=title:sideways'), schema).order).toEqual({
      key: 'title',
      dir: 'desc',
    });
    expect(readListParams(params('?order='), schema).order).toEqual(defaults.order);
  });

  it('reads a blank or whitespace-only query as no query at all', () => {
    expect(readListParams(params('?q='), schema).q).toBe('');
    expect(readListParams(params('?q=%20%20'), schema).q).toBe('');
  });

  it('leaves a declared default off the URL', () => {
    expect(applyListParams(params(''), schema, defaults).toString()).toBe('');
    expect(applyListParams(params('?kind=achievement'), schema, { kind: 'all' }).toString()).toBe('');
  });

  it('leaves a text default off the URL even when the default is not the empty string', () => {
    const scoped = { scope: textParam({ default: 'mine' }) };
    expect(readListParams(params(''), scoped).scope).toBe('mine');
    expect(applyListParams(params(''), scoped, { scope: 'mine' }).has('scope')).toBe(false);
    expect(applyListParams(params('?scope=everyone'), scoped, { scope: 'mine' }).has('scope')).toBe(false);
    expect(applyListParams(params(''), scoped, { scope: 'everyone' }).get('scope')).toBe('everyone');
  });

  it('keeps params the schema never declared', () => {
    const next = applyListParams(params('?owner=n1&new=1'), schema, { kind: 'achievement' });
    expect(next.get('owner')).toBe('n1');
    expect(next.get('new')).toBe('1');
    expect(next.get('kind')).toBe('achievement');
  });

  it('writes the sort direction only when it is not the declared one', () => {
    expect(applyListParams(params(''), schema, { order: { key: 'title', dir: 'desc' } }).get('order')).toBe('title');
    expect(applyListParams(params(''), schema, { order: { key: 'title', dir: 'asc' } }).get('order')).toBe('title:asc');
    expect(applyListParams(params(''), schema, { order: { key: 'recent', dir: 'asc' } }).get('order')).toBe('recent:asc');
  });

  it('trims a query before writing it', () => {
    expect(applyListParams(params(''), schema, { q: '  okafor  ' }).get('q')).toBe('okafor');
    expect(applyListParams(params('?q=okafor'), schema, { q: '   ' }).has('q')).toBe(false);
  });

  it('refuses to put an undeclared facet value on the URL', () => {
    const patch = { kind: 'unicorn' } as unknown as { kind: 'all' };
    expect(applyListParams(params(''), schema, patch).has('kind')).toBe(false);
  });

  it('clears every declared param and nothing else', () => {
    const next = clearListParams(params('?q=okafor&kind=achievement&owner=n1'), schema);
    expect(next.toString()).toBe('owner=n1');
  });

  it('knows a default view from a narrowed one', () => {
    expect(isDefaultListParams(schema, defaults)).toBe(true);
    expect(isDefaultListParams(schema, { ...defaults, kind: 'achievement' as const })).toBe(false);
    expect(isDefaultListParams(schema, { ...defaults, q: 'okafor' })).toBe(false);
  });
});

const scoped = { scope: textParam({ default: 'mine' }) };

/** A text param whose default is not the empty string, on its own. */
function ScopeProbe() {
  const list = useListParams(scoped);
  const location = useLocation();
  return h(
    'div',
    null,
    h('input', {
      'aria-label': 'scope',
      value: list.drafts.scope,
      onChange: (event: ChangeEvent<HTMLInputElement>) => list.set('scope', event.target.value),
    }),
    h('span', { 'data-testid': 'search' }, location.search),
    h('span', { 'data-testid': 'values' }, JSON.stringify(list.values)),
  );
}

function Probe() {
  const list = useListParams(schema);
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  return h(
    'div',
    null,
    h('input', {
      'aria-label': 'query',
      value: list.drafts.q,
      onChange: (event: ChangeEvent<HTMLInputElement>) => list.set('q', event.target.value),
    }),
    h('button', { onClick: () => list.set('kind', 'achievement') }, 'narrow kind'),
    h('button', { onClick: () => list.set('order', { key: 'title', dir: 'asc' }) }, 'sort title'),
    h('button', { onClick: () => list.commit('q') }, 'commit query'),
    h('button', { onClick: () => list.reset() }, 'reset'),
    h('button', { onClick: () => navigate('/list?q=okafor') }, 'jump'),
    h('span', { 'data-testid': 'search' }, location.search),
    h('span', { 'data-testid': 'nav' }, navigationType),
    h('span', { 'data-testid': 'values' }, JSON.stringify(list.values)),
    h('span', { 'data-testid': 'default' }, String(list.isDefault)),
  );
}

function search(): string {
  return screen.getByTestId('search').textContent ?? '';
}

describe('useListParams', () => {
  beforeEach(() => {
    // The typing debounce is the point of several of these.
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a keystroke at once and writes it to the URL after the debounce', () => {
    renderWithApp(h(Probe), { route: '/list' });
    const input = screen.getByLabelText('query') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'oka' } });
    expect(input).toHaveValue('oka');
    expect(search()).toBe('');

    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS - 1);
    });
    expect(search()).toBe('');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(search()).toBe('?q=oka');
  });

  it('replaces the history entry while typing so the back button holds no keystrokes', () => {
    renderWithApp(h(Probe), { route: '/list' });

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'o' } });
    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });
    expect(screen.getByTestId('nav')).toHaveTextContent('REPLACE');
  });

  it('restarts the debounce on each keystroke and writes only the last one', () => {
    renderWithApp(h(Probe), { route: '/list' });
    const input = screen.getByLabelText('query');

    fireEvent.change(input, { target: { value: 'ok' } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.change(input, { target: { value: 'okafor' } });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(search()).toBe('');
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(search()).toBe('?q=okafor');
  });

  it('keeps a facet change made while the typing debounce was still armed', () => {
    renderWithApp(h(Probe), { route: '/list?owner=n1' });

    // The write that fires 250ms from now is built by a callback react-router
    // created before this facet change existed, so a stale base would put the
    // kind back to its default without anybody touching the control.
    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'oka' } });
    fireEvent.click(screen.getByText('narrow kind'));
    expect(search()).toContain('kind=achievement');

    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });
    expect(search()).toContain('q=oka');
    expect(search()).toContain('kind=achievement');
    expect(search()).toContain('owner=n1');
  });

  it('keeps a sort change made while the typing debounce was still armed', () => {
    renderWithApp(h(Probe), { route: '/list' });

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'oka' } });
    fireEvent.click(screen.getByText('sort title'));

    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });
    expect(search()).toContain('order=title%3Aasc');
    expect(search()).toContain('q=oka');
  });

  it('leaves a trailing space in the field while writing the trimmed value', () => {
    renderWithApp(h(Probe), { route: '/list' });
    const input = screen.getByLabelText('query');

    fireEvent.change(input, { target: { value: 'okafor ' } });
    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });

    expect(search()).toBe('?q=okafor');
    // The URL is trimmed, the cursor is not. Pulling the trimmed value back
    // into the field would delete a character the person just typed.
    expect(input).toHaveValue('okafor ');
  });

  it('lets a text param whose default is not empty be emptied and stay empty', () => {
    renderWithApp(h(ScopeProbe), { route: '/list?scope=everyone' });
    const input = screen.getByLabelText('scope');
    expect(input).toHaveValue('everyone');

    fireEvent.change(input, { target: { value: '' } });
    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });

    expect(search()).toBe('');
    expect(input).toHaveValue('');
    expect(screen.getByTestId('values')).toHaveTextContent('"scope":"mine"');
  });

  it('commits a pending query immediately when asked', () => {
    renderWithApp(h(Probe), { route: '/list' });

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'okafor' } });
    fireEvent.click(screen.getByText('commit query'));
    expect(search()).toBe('?q=okafor');
    // And the debounce that was still armed does not write a second time.
    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS);
    });
    expect(search()).toBe('?q=okafor');
  });

  it('keeps an unrelated param when a facet changes, and pushes that step', () => {
    renderWithApp(h(Probe), { route: '/list?owner=n1' });

    fireEvent.click(screen.getByText('narrow kind'));
    expect(search()).toContain('owner=n1');
    expect(search()).toContain('kind=achievement');
    expect(screen.getByTestId('nav')).toHaveTextContent('PUSH');
  });

  it('keeps an unrelated param when the sort changes', () => {
    renderWithApp(h(Probe), { route: '/list?owner=n1' });

    fireEvent.click(screen.getByText('sort title'));
    expect(search()).toContain('owner=n1');
    expect(search()).toContain('order=title%3Aasc');
  });

  it('lands a query the URL grew elsewhere in the input', () => {
    renderWithApp(h(Probe), { route: '/list' });

    fireEvent.click(screen.getByText('jump'));
    expect(screen.getByLabelText('query')).toHaveValue('okafor');
    expect(screen.getByTestId('values')).toHaveTextContent('"q":"okafor"');
  });

  it('resets every declared param, keeps the rest, and lets go of an unwritten draft', () => {
    renderWithApp(h(Probe), { route: '/list?owner=n1&kind=achievement' });
    expect(screen.getByTestId('default')).toHaveTextContent('false');

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'never written' } });
    fireEvent.click(screen.getByText('reset'));

    expect(search()).toBe('?owner=n1');
    expect(screen.getByLabelText('query')).toHaveValue('');
    expect(screen.getByTestId('default')).toHaveTextContent('true');
  });

  it('disarms a pending debounce on reset, so the cleared query does not come back', () => {
    renderWithApp(h(Probe), { route: '/list?owner=n1&kind=achievement' });

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'never written' } });
    fireEvent.click(screen.getByText('reset'));
    act(() => {
      vi.advanceTimersByTime(TYPING_DEBOUNCE_MS * 4);
    });

    expect(search()).toBe('?owner=n1');
    expect(screen.getByLabelText('query')).toHaveValue('');
  });

  it('leaves no armed debounce behind when the screen unmounts', () => {
    const view = renderWithApp(h(Probe), { route: '/list' });
    const before = vi.getTimerCount();

    fireEvent.change(screen.getByLabelText('query'), { target: { value: 'oka' } });
    expect(vi.getTimerCount()).toBe(before + 1);

    view.unmount();
    expect(vi.getTimerCount()).toBe(before);
  });

  it('reads a malformed param as its default and touches only the param being written', () => {
    renderWithApp(h(Probe), { route: '/list?kind=unicorn' });
    // Read as the default, so the values the screen filters on are sane.
    expect(screen.getByTestId('values')).toHaveTextContent('"kind":"all"');

    // A write to a different param leaves the junk alone rather than
    // rewriting the whole query string behind the user's back.
    fireEvent.click(screen.getByText('sort title'));
    expect(search()).toContain('kind=unicorn');
    expect(search()).toContain('order=title%3Aasc');

    // Writing that param is what replaces it.
    fireEvent.click(screen.getByText('narrow kind'));
    expect(search()).toContain('kind=achievement');
    expect(search()).not.toContain('unicorn');
  });
});
