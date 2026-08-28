/**
 * Templates gallery: the states the catalogue used to swallow. A refresh that
 * failed replaced every layout with an error panel, an unavailable build
 * service arrived as a line of body copy, the default control shared no words
 * with its own label, and the accents were six discs of pure hue.
 */
import './../test/api-mock.js';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { createTestAuth, renderWithApp } from '../test/render.js';
import { Templates, type Template } from './Templates.js';

vi.mock('../lib/auth.js', () => ({
  useAuth: () => createTestAuth(),
  useCanWrite: () => true,
  WRITE_LOCK_HINT: 'Read-only workspace',
}));

const template = (over: Partial<Template> = {}): Template => ({
  key: 'cobalt',
  name: 'Cobalt',
  version: '1.0.0',
  ats_strict: false,
  description: 'A compact, readable layout.',
  traits: ['balanced'],
  page_size: 'A4',
  accent_options: ['#2563eb', '#0f766e'],
  line_model: { chars_per_line: 108, lines_per_page: 58, entry_overhead: 2, section_overhead: 2 },
  ...over,
});

const ONYX = template({
  key: 'onyx',
  name: 'Onyx',
  page_size: 'Letter',
  accent_options: ['#111827', '#be123c'],
});
const ARGON = template({ key: 'argon', name: 'Argon' });

function catalogue(over: Record<string, unknown> = {}) {
  return {
    templates: [template(), ONYX, ARGON],
    defaultKey: 'cobalt',
    defaultAccent: '#2563eb',
    calibration: { ok: true, templates_warmed: ['cobalt@1.0.0'] },
    ...over,
  };
}

/** A value to return, or an Error to throw. */
function serve(body: unknown) {
  mockApi.get.mockImplementation(async () => {
    if (body instanceof Error) throw body;
    return body;
  });
}

function render() {
  return renderWithApp(<Templates />, { route: '/career/resume/templates' });
}

beforeEach(() => {
  resetMockApi();
  serve(catalogue());
});

describe('Templates states', () => {
  it('reports a failed load instead of an empty catalogue', async () => {
    serve(new Error('template registry unavailable'));
    render();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load résumé templates");
    expect(alert).toHaveTextContent('template registry unavailable');
    expect(screen.queryByText('No résumé templates are available')).not.toBeInTheDocument();
  });

  it('keeps the catalogue on screen when a refresh fails', async () => {
    const { queryClient } = render();
    await screen.findByRole('article', { name: 'Cobalt' });

    // Setting the default invalidates this query and queries do not retry, so
    // one failed refetch used to replace the gallery with an error panel the
    // instant the toast said the change had landed.
    serve(new Error('template registry went away'));
    await act(async () => {
      await queryClient.refetchQueries({ queryKey: ['templates'] });
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't refresh the template catalogue",
    );
    expect(screen.getByRole('article', { name: 'Cobalt' })).toBeInTheDocument();
  });

  it('renders the layouts as a list of the count the heading states', async () => {
    render();
    await screen.findByRole('article', { name: 'Cobalt' });

    const layouts = screen.getByRole('region', { name: /^Layouts/ });
    expect(within(layouts).getAllByRole('listitem')).toHaveLength(3);
  });

  it('reports an unavailable build service as a failure, not as body copy', async () => {
    serve(catalogue({ calibration: { ok: false } }));
    render();

    const service = await screen.findByRole('region', { name: 'Build service' });
    const alert = within(service).getByRole('alert');
    expect(alert).toHaveTextContent('Build service unavailable');
    expect(alert).toHaveTextContent('Start buildsvc');
    // The chip carries the state as a word as well, so the summary is not
    // three hues of the same shape.
    expect(within(service).getByText('Unavailable')).toBeInTheDocument();
  });

  it('announces a partial warmup as partial, in a live region', async () => {
    serve(
      catalogue({
        templates: [template(), ONYX],
        calibration: { ok: true, templates_warmed: ['cobalt@1.0.0'] },
      }),
    );
    render();

    const service = await screen.findByRole('region', { name: 'Build service' });
    const live = within(service).getByRole('status');
    expect(live).toHaveTextContent('1 of 2 layouts calibrated');
    expect(live).toHaveTextContent('Only calibrated layouts can be verified');
    expect(within(service).queryByText('Calibrated')).not.toBeInTheDocument();
  });

  it('puts the visible words of each default control into its name', async () => {
    render();
    await screen.findByRole('article', { name: 'Cobalt' });

    // WCAG 2.5.3: an aria-label replaces the visible label, so "Make Onyx the
    // default" left a voice user saying "make default" with nothing to match.
    expect(screen.getByRole('button', { name: 'Current default: Cobalt' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Make default: Onyx' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Make default: Argon' })).toBeEnabled();
  });

  it('reports which layout is being made the default while the change runs', async () => {
    mockApi.patch.mockImplementation(() => new Promise(() => {}));
    render();
    await screen.findByRole('article', { name: 'Cobalt' });

    await userEvent.click(screen.getByRole('button', { name: 'Make default: Onyx' }));

    // The name has to move with the state: an aria-label replaces the content,
    // so the visible "Making default..." reached nobody listening.
    expect(await screen.findByRole('button', { name: 'Making default: Onyx' })).toBeDisabled();
    // The default is a single value, so a second click would race the first and
    // every other control locks. That is why the reason is stated out loud
    // rather than left as an unexplained grey button.
    expect(screen.getByRole('button', { name: 'Make default: Argon' })).toBeDisabled();
    const notice = screen.getByText('Setting Onyx as the default...');
    expect(notice.closest('[role="status"]')).not.toBeNull();
  });

  it('names every accent a layout offers instead of leaving it to hue', async () => {
    render();
    const onyx = await screen.findByRole('article', { name: 'Onyx' });

    // Six unnamed discs, aria-hidden on top of that, told a screen reader
    // nothing and told a sighted reader only what the eyedropper already said.
    expect(within(onyx).getByText('Ink')).toBeInTheDocument();
    expect(within(onyx).getByText('Crimson')).toBeInTheDocument();
  });

  it('shows an empty catalogue without calling it a failure', async () => {
    serve(catalogue({ templates: [] }));
    render();

    expect(await screen.findByText('No résumé templates are available')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Build service' })).not.toBeInTheDocument();
  });
});
