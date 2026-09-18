/**
 * Composer: the states a capture surface is never allowed to swallow.
 *
 * This is the only screen in the app where a silent failure costs the user
 * text they typed, so a failed send has to stay on the surface that holds the
 * draft. The rest is the same family of defect: a regenerate with no pending
 * signal reads as a dropped click, a wait that only draws a skeleton says
 * nothing at all, and a copy with no clipboard behind it used to be a
 * completely silent no-op.
 */
import './../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { Composer, type ComposerContext } from './Composer.js';

const ctx: ComposerContext = { personId: 'p1', personName: 'Ada', kind: 'reconnect' };

interface Draft {
  body: string;
  facts: string[];
}

/** A draft reply per call, so a test can hold one open or fail a later one. */
function serveDrafts(...replies: Array<Draft | Error | Promise<Draft>>) {
  let call = 0;
  mockApi.post.mockImplementation((path: string) => {
    if (path !== '/composer/draft') return Promise.resolve({});
    const reply = replies[Math.min(call++, replies.length - 1)];
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve(reply);
  });
}

/** The element the Banner or ErrorState marked as an alert, not the toast. */
function alertAround(text: string): HTMLElement {
  const node = screen.getByText(text).closest('[role="alert"]');
  if (!node) throw new Error(`"${text}" is not inside an alert`);
  return node as HTMLElement;
}

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true, writable: true });
}

beforeEach(() => {
  resetMockApi();
});

afterEach(() => {
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
  else setClipboard(undefined);
});

describe('Composer states', () => {
  it('keeps the draft and reports uncertainty when logging fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mockApi.post.mockImplementation((path: string) =>
      path === '/composer/draft'
        ? Promise.resolve({ body: 'Hello Ada, catching up.', facts: [] })
        : Promise.reject(new Error('the mail relay refused it')),
    );

    renderWithApp(<Composer ctx={ctx} onClose={onClose} />);
    await screen.findByLabelText('Draft message');
    await user.click(
      screen.getByRole('checkbox', { name: 'I have sent this message outside Vitae' }),
    );
    await user.click(screen.getByRole('button', { name: 'Log outreach & follow-up' }));

    const banner = alertAround('Outreach logging was not confirmed');
    expect(within(banner).getByText(/the mail relay refused it/)).toBeInTheDocument();
    expect(screen.getByLabelText('Draft message')).toHaveValue('Hello Ada, catching up.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does not claim that an unconfirmed logging request saved nothing', async () => {
    const user = userEvent.setup();
    mockApi.post.mockImplementation((path: string) =>
      path === '/composer/draft'
        ? Promise.resolve({ body: 'Hello Ada.', facts: [] })
        : Promise.reject(new Error('')),
    );
    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    await screen.findByLabelText('Draft message');
    await user.click(
      screen.getByRole('checkbox', { name: 'I have sent this message outside Vitae' }),
    );
    await user.click(screen.getByRole('button', { name: 'Log outreach & follow-up' }));
    const banner = alertAround('Outreach logging was not confirmed');
    expect(within(banner).getByText(/may already be logged/)).toBeInTheDocument();
    expect(within(banner).getByRole('link', { name: 'Check profile' })).toHaveAttribute(
      'href',
      '/network/people/p1',
    );
    expect(screen.queryByText(/nothing was logged/)).not.toBeInTheDocument();
  });

  it('allows an explicit retry after warning about possible duplicate logging', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    let sends = 0;
    mockApi.post.mockImplementation((path: string) => {
      if (path === '/composer/draft') return Promise.resolve({ body: 'Hello Ada.', facts: [] });
      return sends++ === 0 ? Promise.reject(new Error('relay down')) : Promise.resolve({});
    });

    renderWithApp(<Composer ctx={ctx} onClose={onClose} />);
    await screen.findByLabelText('Draft message');
    await user.click(
      screen.getByRole('checkbox', { name: 'I have sent this message outside Vitae' }),
    );
    await user.click(screen.getByRole('button', { name: 'Log outreach & follow-up' }));

    await screen.findByText('Outreach logging was not confirmed');
    await user.click(screen.getByRole('button', { name: 'Retry logging' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it('says out loud that the draft is being assembled instead of only drawing a skeleton', async () => {
    serveDrafts(new Promise<Draft>(() => {}));
    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);

    const trace = await screen.findByText('Assembling the draft');
    expect(trace.closest('[role="status"]')).not.toBeNull();
    expect(trace.closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('reports the regenerate it received, and refuses a second press', async () => {
    const user = userEvent.setup();
    let release: (draft: Draft) => void = () => {};
    serveDrafts(
      { body: 'First draft.', facts: [] },
      new Promise<Draft>((resolve) => {
        release = resolve;
      }),
    );

    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    await screen.findByLabelText('Draft message');

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    const busy = await screen.findByRole('button', { name: 'Regenerating...' });
    expect(busy).toBeDisabled();

    release({ body: 'Second draft.', facts: [] });
    await waitFor(() =>
      expect(screen.getByLabelText('Draft message')).toHaveValue('Second draft.'),
    );
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeEnabled();
  });

  it('lets the tone the user picked last win the race', async () => {
    const user = userEvent.setup();
    let releaseWarm: (draft: Draft) => void = () => {};
    let releaseFormal: (draft: Draft) => void = () => {};
    serveDrafts(
      new Promise<Draft>((resolve) => {
        releaseWarm = resolve;
      }),
      new Promise<Draft>((resolve) => {
        releaseFormal = resolve;
      }),
    );

    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    const tones = await screen.findByRole('group', { name: 'Tone' });
    await user.click(within(tones).getByRole('button', { name: 'formal' }));

    // The formal request was asked for second and answers first; the warm one
    // it replaced must not land on top of it afterwards.
    releaseFormal({ body: 'Formal draft.', facts: [] });
    expect(await screen.findByLabelText('Draft message')).toHaveValue('Formal draft.');

    releaseWarm({ body: 'Warm draft.', facts: [] });
    await waitFor(() =>
      expect(within(tones).getByRole('button', { name: 'formal' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(screen.getByLabelText('Draft message')).toHaveValue('Formal draft.');
  });

  it('preserves a usable previous draft after failed regeneration', async () => {
    const user = userEvent.setup();
    serveDrafts({ body: 'First draft.', facts: [] }, new Error('upstream 502'));

    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    await screen.findByLabelText('Draft message');
    await user.click(screen.getByRole('button', { name: 'Regenerate' }));

    // Copy used to stay live over the error panel and report a success for
    // text the user could no longer read.
    expect(await screen.findByText("Couldn't regenerate the draft")).toBeInTheDocument();
    expect(screen.getByLabelText('Draft message')).toHaveValue('First draft.');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Log outreach & follow-up' })).toBeDisabled();
  });

  it('says so when there is no clipboard to copy into', async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    serveDrafts({ body: 'Hello Ada.', facts: [] });

    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    await screen.findByLabelText('Draft message');
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    // The optional chain short-circuited the whole expression, so neither
    // handler ever attached and the press did nothing whatsoever.
    expect(await screen.findByText(/Clipboard is not available here/)).toBeInTheDocument();
  });

  it('keeps the current draft and its evidence while generating a replacement', async () => {
    const user = userEvent.setup();
    let release: (draft: Draft) => void = () => {};
    serveDrafts(
      { body: 'First draft.', facts: ['met at NeurIPS 2024'] },
      new Promise<Draft>((resolve) => {
        release = resolve;
      }),
    );

    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);
    expect(await screen.findByText('met at NeurIPS 2024')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Regenerate' }));
    // Citations that belong to a draft that is gone must not stand above the
    // skeleton of the one arriving.
    expect(screen.getByText('met at NeurIPS 2024')).toBeInTheDocument();
    expect(screen.getByLabelText('Draft message')).toHaveValue('First draft.');

    release({ body: 'Second draft.', facts: ['shared the Kestrel project'] });
    expect(await screen.findByText('shared the Kestrel project')).toBeInTheDocument();
  });

  it('names the draft editor with the shared field wiring', async () => {
    serveDrafts({ body: 'Hello Ada.', facts: [] });
    renderWithApp(<Composer ctx={ctx} onClose={vi.fn()} />);

    const body = await screen.findByRole('textbox', { name: 'Draft message' });
    expect(body).toHaveClass('vt-inp');
  });
});
