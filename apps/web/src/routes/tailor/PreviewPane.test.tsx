import '../../test/api-mock.js';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../../test/api-mock.js';
import { renderWithApp } from '../../test/render.js';
import { PreviewPane } from './PreviewPane.js';
import { defaultDraft } from './types.js';
import type { CompileResult, Draft } from './types.js';

vi.mock('../../components/PdfPreview.js', () => ({
  PdfPreview: ({ base64 }: { base64: string }) => <div data-testid="pdf">{base64.length} bytes</div>,
}));

const templates = {
  templates: [
    { key: 'cobalt', name: 'Cobalt', version: '1', accent_options: ['#2563eb', '#0f766e'] },
    { key: 'onyx', name: 'Onyx', version: '1' },
  ],
  defaultKey: 'cobalt',
  defaultAccent: '#2563eb',
};

function compiled(over: Partial<CompileResult> = {}): CompileResult {
  return {
    ok: true,
    pages: 1,
    offline: false,
    error: null,
    logTail: null,
    pdfBase64: 'JVBERi0=',
    tex: '\\documentclass{article}',
    coverage: {
      weightedPct: 0.97,
      passesGate: true,
      gaps: [],
      perKeyword: [],
    },
    pageEstimate: { lines: 40, budget: 44, pages: 1, fill: 0.9 },
    selection: { entries: [], totalLines: 40, weightedCoverage: 0.97 },
    ...over,
  };
}

function renderPane(draft: Partial<Draft> = {}) {
  const onDraft = vi.fn();
  return {
    onDraft,
    ...renderWithApp(
      <PreviewPane targetId="target-1" draft={{ ...defaultDraft(), ...draft }} onDraft={onDraft} />,
    ),
  };
}

describe('PreviewPane', () => {
  beforeEach(() => {
    resetMockApi();
    mockApi.get.mockResolvedValue(templates);
  });

  it('offers a retry when the template list fails to load', async () => {
    const user = userEvent.setup();
    mockApi.get.mockRejectedValueOnce(new Error('no templates'));
    renderPane();

    expect(await screen.findByText("Couldn't load the templates")).toBeInTheDocument();
    mockApi.get.mockResolvedValue(templates);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Cobalt' })).toBeInTheDocument();
  });

  it('marks the chosen template as pressed', async () => {
    renderPane({ templateKey: 'onyx' });
    expect(await screen.findByRole('button', { name: 'Onyx' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Cobalt' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('offers the accents the active template declares', async () => {
    renderPane({ templateKey: 'cobalt' });
    await screen.findByRole('button', { name: 'Cobalt' });
    const group = screen.getByRole('group', { name: 'Template accent' });
    expect(group.querySelectorAll('button')).toHaveLength(2);
  });

  it('falls back to the standard accents for a template with no palette', async () => {
    renderPane({ templateKey: 'onyx' });
    await screen.findByRole('button', { name: 'Onyx' });
    const group = screen.getByRole('group', { name: 'Template accent' });
    expect(group.querySelectorAll('button')).toHaveLength(6);
  });

  it('says what is happening while LaTeX runs', async () => {
    const user = userEvent.setup();
    mockApi.post.mockReturnValue(new Promise(() => {}));
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    expect(await screen.findByText('Typesetting the PDF')).toBeInTheDocument();
    expect(screen.getByLabelText('Compiling the résumé')).toBeInTheDocument();
  });

  it('offers a retry when the build service cannot be reached', async () => {
    const user = userEvent.setup();
    mockApi.post.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    expect(await screen.findByText("Couldn't reach the build service")).toBeInTheDocument();

    mockApi.post.mockResolvedValue(compiled());
    await user.click(screen.getByRole('button', { name: 'Compile again' }));
    expect(await screen.findByTestId('pdf')).toBeInTheDocument();
  });

  it('hands over the LaTeX source when the build service is offline', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue(compiled({ ok: false, offline: true, pdfBase64: null }));
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    expect(await screen.findByText('Build service offline')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download .tex' })).toBeInTheDocument();
  });

  it('names the failing section and tucks the log behind a disclosure', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue(
      compiled({
        ok: false,
        pages: null,
        pdfBase64: null,
        coverage: null,
        error: { code: 'LATEX_ERROR', message: 'Undefined control sequence', section: 'skills' },
        logTail: '! Undefined control sequence.\nl.42 \\badmacro',
      }),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('LATEX_ERROR');
    expect(alert).toHaveTextContent('near section: skills');

    expect(screen.queryByText(/Undefined control sequence\./)).not.toBeVisible();
    await user.click(screen.getByText('LaTeX log'));
    expect(screen.getByText(/l\.42/)).toBeVisible();
  });

  it('shows the keywords the résumé still misses', async () => {
    const user = userEvent.setup();
    mockApi.post.mockResolvedValue(
      compiled({
        coverage: {
          weightedPct: 0.72,
          passesGate: false,
          gaps: [
            { term: 'kubernetes', weight: 3 },
            { term: 'terraform', weight: 2 },
          ],
          perKeyword: [],
        },
      }),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    expect(await screen.findByText('72% below 95%')).toBeInTheDocument();
    expect(screen.getByText('kubernetes')).toBeInTheDocument();
    expect(screen.getByText('terraform')).toBeInTheDocument();
  });

  it('says why finalizing did not stick', async () => {
    const user = userEvent.setup();
    mockApi.post.mockImplementation((path: string) =>
      path === '/resumes/finalize'
        ? Promise.reject(new Error('gate rejected'))
        : Promise.resolve(compiled()),
    );
    renderPane();

    await user.click(await screen.findByRole('button', { name: 'Compile PDF' }));
    await screen.findByTestId('pdf');
    await user.click(screen.getByRole('button', { name: 'Finalize' }));

    await waitFor(() => {
      expect(screen.getByText("Couldn't finalize this résumé")).toBeInTheDocument();
    });
  });
});
