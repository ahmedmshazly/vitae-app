/**
 * The status control on an application dossier (FR-CAR-003): which moves it
 * offers, what it says when there are none, how it reports a refusal, and that
 * a correction stays a separate act with its own words on the wire.
 */
import '../../test/api-mock.js';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { ApplicationStatusControl } from './ApplicationStatusControl.js';

const writeGate = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../../lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/auth.js')>();
  return {
    ...actual,
    useCanWrite: () => writeGate.canWrite,
  };
});

beforeEach(() => {
  writeGate.canWrite = true;
  resetMockApi();
  mockApi.post.mockResolvedValue({});
});

const moves = () => within(screen.getByRole('group', { name: 'Record a status move' }));

describe('Application status control', () => {
  it('offers the moves the machine would accept and none that it would refuse', async () => {
    renderWithApp(<ApplicationStatusControl id="application-1" status="interview" />);

    expect(moves().getByRole('button', { name: 'Offer' })).toBeInTheDocument();
    expect(moves().getByRole('button', { name: 'Rejected' })).toBeInTheDocument();
    expect(moves().getByRole('button', { name: 'Withdrawn' })).toBeInTheDocument();
    expect(moves().getByRole('button', { name: 'Accepted' })).toBeInTheDocument();
    // Walking back to a stage this application has already left is not offered
    // at all. A disabled button would make the reader work out the rule from a
    // control they cannot use.
    expect(moves().queryByRole('button', { name: 'Screening' })).not.toBeInTheDocument();
    expect(moves().queryByRole('button', { name: 'Draft' })).not.toBeInTheDocument();
  });

  it('skips the stages between here and an outcome, because plenty of roles do', async () => {
    renderWithApp(<ApplicationStatusControl id="application-1" status="applied" />);

    expect(moves().getByRole('button', { name: 'Interview' })).toBeInTheDocument();
    expect(moves().getByRole('button', { name: 'Offer' })).toBeInTheDocument();
  });

  it('records the move it was clicked for', async () => {
    const user = userEvent.setup();
    renderWithApp(<ApplicationStatusControl id="application-1" status="applied" />);

    await user.click(moves().getByRole('button', { name: 'Screening' }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/applications/application-1/status', {
        status: 'screening',
      }),
    );
  });

  it('says a closed application is closed rather than offering a move that cannot happen', () => {
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    expect(screen.queryByRole('group', { name: 'Record a status move' })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing follows an outcome/)).toBeInTheDocument();
  });

  it('keeps a way out of a closed record, which is the whole point of a correction', () => {
    renderWithApp(<ApplicationStatusControl id="application-1" status="accepted" />);

    expect(screen.getByRole('button', { name: 'Correct status' })).toBeInTheDocument();
  });

  it('sends a correction as a correction, not as a move', async () => {
    const user = userEvent.setup();
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    const options = within(screen.getByRole('group', { name: 'What the status should say' }));
    await user.click(options.getByRole('button', { name: 'Screening' }));
    await user.click(screen.getByRole('button', { name: 'Record correction' }));

    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('/applications/application-1/status', {
        status: 'screening',
        correction: true,
      }),
    );
  });

  it('will not let a correction be recorded before one is chosen', async () => {
    const user = userEvent.setup();
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    await user.click(screen.getByRole('button', { name: 'Correct status' }));

    expect(screen.getByRole('button', { name: 'Record correction' })).toBeDisabled();
  });

  it('never offers the status the record already holds as something to correct to', async () => {
    const user = userEvent.setup();
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    const options = within(screen.getByRole('group', { name: 'What the status should say' }));

    expect(options.queryByRole('button', { name: 'Rejected' })).not.toBeInTheDocument();
    expect(options.getByRole('button', { name: 'Accepted' })).toBeInTheDocument();
  });

  it('repeats the refusal in the words the server used, so the rule survives the trip', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValue(
      new Error('An application at interview cannot move back to applied.'),
    );
    renderWithApp(<ApplicationStatusControl id="application-1" status="interview" />);

    await user.click(moves().getByRole('button', { name: 'Offer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An application at interview cannot move back to applied.',
    );
  });

  it('clears a refused correction when its selection changes, then leaves a fresh retry', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValueOnce(
      new Error('The recorded stage conflicts with an interview.'),
    );
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    const options = within(screen.getByRole('group', { name: 'What the status should say' }));
    await user.click(options.getByRole('button', { name: 'Screening' }));
    await user.click(screen.getByRole('button', { name: 'Record correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('conflicts with an interview');

    await user.click(options.getByRole('button', { name: 'Interview' }));
    expect(
      screen.queryByText('The recorded stage conflicts with an interview.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record correction' })).toBeEnabled();
  });

  it('does not carry a cancelled correction failure into a new correction', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValueOnce(
      new Error('The recorded stage conflicts with an interview.'),
    );
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);

    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    const options = within(screen.getByRole('group', { name: 'What the status should say' }));
    await user.click(options.getByRole('button', { name: 'Screening' }));
    await user.click(screen.getByRole('button', { name: 'Record correction' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('conflicts with an interview');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    expect(
      screen.queryByText('The recorded stage conflicts with an interview.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record correction' })).toBeDisabled();
  });

  it('hides onward moves and disables correction on a locked workspace (NFR-OPS-002)', () => {
    writeGate.canWrite = false;
    renderWithApp(<ApplicationStatusControl id="application-1" status="interview" />);
    expect(screen.queryByRole('group', { name: 'Record a status move' })).not.toBeInTheDocument();
    expect(screen.getByText(/Read-only workspace/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Correct status' })).toBeDisabled();
  });

  it('keeps an unsaved correction when dismissal is declined', async () => {
    const user = userEvent.setup();
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);
    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    await user.click(screen.getByRole('button', { name: 'Interview' }));
    await user.keyboard('{Escape}');
    await user.click(await screen.findByRole('button', { name: 'Keep editing' }));
    expect(screen.getByRole('button', { name: 'Interview' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('locks correction selection and dismissal until the submitted write resolves', async () => {
    const user = userEvent.setup();
    let finish!: (value: unknown) => void;
    mockApi.post.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);
    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    await user.click(screen.getByRole('button', { name: 'Interview' }));
    await user.click(screen.getByRole('button', { name: 'Record correction' }));
    expect(screen.getByRole('button', { name: 'Screening' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Correct the recorded status' })).toBeVisible();
    expect(mockApi.post).toHaveBeenCalledTimes(1);
    finish({});
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('prevents corrections from opening during a pending onward move', async () => {
    const user = userEvent.setup();
    mockApi.post.mockImplementation(() => new Promise(() => {}));
    renderWithApp(<ApplicationStatusControl id="application-1" status="applied" />);
    await user.click(moves().getByRole('button', { name: 'Interview' }));
    expect(screen.getByRole('button', { name: 'Correct status' })).toBeDisabled();
    expect(moves().getByRole('button', { name: 'Recording Interview…' })).toBeDisabled();
  });

  it('rechecks write access if it changes while the correction dialog is open', async () => {
    const user = userEvent.setup();
    const view = renderWithApp(<ApplicationStatusControl id="application-1" status="rejected" />);
    await user.click(screen.getByRole('button', { name: 'Correct status' }));
    await user.click(screen.getByRole('button', { name: 'Interview' }));
    writeGate.canWrite = false;
    view.rerender(<ApplicationStatusControl id="application-1" status="rejected" />);
    expect(screen.getByRole('button', { name: 'Record correction' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Screening' })).toBeDisabled();
    expect(mockApi.post).not.toHaveBeenCalled();
  });
});
