import '../../test/api-mock.js';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { DocumentPane } from './DocumentPane.js';
import { defaultDraft } from './types.js';
import type { Draft, ModelResult } from './types.js';

function model(over: Partial<ModelResult['model']> = {}): ModelResult {
  return {
    model: {
      profileId: 'person-1',
      name: 'Ada Okonkwo',
      tagline: 'Systems and reliability',
      headline: 'Staff Engineer',
      summary: 'Ten years shipping **distributed** systems.',
      contacts: [
        { key: 'email', value: 'ada@example.com' },
        { key: 'city', value: 'Lagos' },
      ],
      sections: [
        {
          key: 'experience',
          title: 'Experience',
          kind: 'entries',
          entries: [
            {
              id: 'entry-1',
              role: 'Staff Engineer',
              org: 'Northstar',
              location: 'Remote',
              dates: '2022 to now',
              bullets: [{ id: 'atom-1', text: 'Cut p99 latency by *40%*.' }],
            },
          ],
        },
        {
          key: 'skills',
          title: 'Technical Skills',
          kind: 'skillrows',
          skillRows: [
            {
              id: 'row-1',
              label: 'Languages',
              content: 'Go, Rust',
              skills: [
                { id: 'skill-1', name: 'Go' },
                { id: 'skill-2', name: 'Rust', disabled: true },
              ],
            },
          ],
        },
      ],
      ...over,
    },
    pageEstimate: { lines: 30, budget: 44, pages: 1, fill: 0.68 },
    selection: {
      entries: [
        {
          atomId: 'atom-1',
          ownerId: 'entry-1',
          emphasis: 'technical',
          text: 'Cut p99 latency by 40%.',
          lines: 2,
        },
      ],
      totalLines: 30,
      weightedCoverage: 0.8,
    },
  };
}

function renderPane(draft: Partial<Draft> = {}) {
  const onDraft = vi.fn();
  return {
    onDraft,
    ...renderWithApp(
      <DocumentPane targetId="target-1" draft={{ ...defaultDraft(), ...draft }} onDraft={onDraft} />,
    ),
  };
}

describe('DocumentPane', () => {
  beforeEach(() => {
    resetMockApi();
    mockApi.post.mockResolvedValue(model());
  });

  it('holds the shape of a page while the model is assembled', () => {
    mockApi.post.mockReturnValue(new Promise(() => {}));
    renderPane();
    expect(screen.getByRole('status', { name: 'Assembling the document' })).toBeInTheDocument();
  });

  it('offers a rebuild when the model does not come back', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValueOnce(new Error('model service down'));
    renderPane();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Couldn’t assemble the document');
    expect(alert).toHaveTextContent('model service down');

    mockApi.post.mockResolvedValue(model());
    await user.click(screen.getByRole('button', { name: 'Rebuild' }));
    expect(await screen.findByTestId('resume-paper')).toBeInTheDocument();
  });

  it('renders the page with its sections and entries addressable', async () => {
    renderPane();
    const paper = await screen.findByTestId('resume-paper');
    expect(within(paper).getByText('Ada Okonkwo')).toBeInTheDocument();
    expect(paper.querySelector('[data-resume-section="experience"] [data-resume-item]')).not.toBe(
      null,
    );
    expect(within(paper).getByText('Technical Skills')).toBeInTheDocument();
  });

  it('strips markdown emphasis so the page reads as it will print', async () => {
    renderPane();
    const paper = await screen.findByTestId('resume-paper');
    expect(within(paper).getByText('Cut p99 latency by 40%.')).toBeInTheDocument();
    expect(within(paper).getByText('Ten years shipping distributed systems.')).toBeInTheDocument();
  });

  it('names each visibility toggle after what it hides', async () => {
    renderPane();
    const paper = await screen.findByTestId('resume-paper');
    expect(within(paper).getByRole('button', { name: 'Hide email' })).toBeInTheDocument();
    expect(
      within(paper).getByRole('button', { name: 'Hide Experience section' }),
    ).toBeInTheDocument();
  });

  it('reads back a hidden section as one waiting to be shown', async () => {
    renderPane({ sectionsEnabled: { experience: false } });
    const paper = await screen.findByTestId('resume-paper');
    expect(
      within(paper).getByRole('button', { name: 'Show Experience section' }),
    ).toBeInTheDocument();
  });

  it('hides a section from the draft rather than from the page', async () => {
    const user = userEvent.setup();
    const { onDraft } = renderPane();
    const paper = await screen.findByTestId('resume-paper');
    await user.click(within(paper).getByRole('button', { name: 'Hide Experience section' }));
    expect(onDraft).toHaveBeenCalledWith({
      sectionsEnabled: expect.objectContaining({ experience: false }),
    });
  });

  it('carries an excluded skill in more than its colour', async () => {
    renderPane();
    const paper = await screen.findByTestId('resume-paper');
    const rust = within(paper).getByRole('button', { name: 'Rust' });
    expect(rust).toHaveAttribute('aria-pressed', 'false');
    expect(rust.className).toContain('paper__skill--off');
    expect(within(paper).getByRole('button', { name: 'Go' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('points a missing contact field at the profile that would fill it', async () => {
    renderPane();
    const paper = await screen.findByTestId('resume-paper');
    expect(within(paper).getByRole('link', { name: '+ phone' })).toHaveAttribute(
      'href',
      '/network/people/person-1',
    );
  });

  it('says the summary is empty rather than leaving a gap', async () => {
    mockApi.post.mockResolvedValue(model({ summary: undefined }));
    renderPane();
    expect(await screen.findByText('Add a summary in the controls.')).toBeInTheDocument();
  });
});
