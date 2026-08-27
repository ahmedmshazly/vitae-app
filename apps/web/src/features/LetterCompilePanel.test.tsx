/**
 * The letter compile panel (FR-RES-021): what it shows for each of the three
 * outcomes a compile has, and that an unreachable compiler still hands the
 * writer their source (FR-RES-013).
 */
import './../test/api-mock.js';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi, resetMockApi } from '../test/api-mock.js';
import { renderWithApp } from '../test/render.js';
import { LetterCompilePanel } from './LetterCompilePanel.js';

const writeGate = vi.hoisted(() => ({ canWrite: true }));
vi.mock('../lib/auth.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/auth.js')>();
  return {
    ...actual,
    useCanWrite: () => writeGate.canWrite,
  };
});

const TEX = '\\documentclass[11pt]{article}\\begin{document}Dear Hiring Team,\\end{document}';

function compiled(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    pages: 1,
    offline: false,
    error: null,
    logTail: null,
    pdfBase64: 'JVBERi0=',
    tex: TEX,
    template: 'letter-classic@1.0.0',
    ...over,
  };
}

function renderPanel(over: Record<string, unknown> = {}) {
  return renderWithApp(
    <LetterCompilePanel
      letterId="l1"
      letterStatus="draft"
      hasStoredArtifacts={false}
      {...over}
    />,
  );
}

beforeEach(() => {
  writeGate.canWrite = true;
  resetMockApi();
  // jsdom has no blob URLs, and the preview iframe needs one to exist.
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:letter-preview'),
    revokeObjectURL: vi.fn(),
  });
});

describe('LetterCompilePanel', () => {
  it('offers both halves of the pair before anything has been compiled', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Compile preview' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Finalize letter' })).toBeEnabled();
    expect(screen.getByText(/Compile to preview the PDF/)).toBeInTheDocument();
  });

  it('previews the PDF under a name that says it is a letter', async () => {
    mockApi.post.mockResolvedValue(compiled());
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Compile preview' }));

    expect(await screen.findByTitle('cover letter preview')).toBeInTheDocument();
    expect(screen.getByText('1 page')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith('/letters/l1/compile');
  });

  it('says the compiler is unreachable and hands over the source instead', async () => {
    mockApi.post.mockResolvedValue(
      compiled({
        ok: false,
        offline: true,
        pdfBase64: null,
        pages: null,
        error: { code: 'BUILDSVC_OFFLINE', message: 'unreachable' },
      }),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Compile preview' }));

    expect(await screen.findByText('Build service offline')).toBeInTheDocument();
    expect(screen.getByText(/The compiler is unreachable/)).toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Download .tex' });
    expect(download).toHaveAttribute('download', 'letter-l1.tex');
    expect(download.getAttribute('href')).toContain(encodeURIComponent('\\documentclass'));
  });

  it('shows the LaTeX log when the letter did not typeset', async () => {
    mockApi.post.mockResolvedValue(
      compiled({
        ok: false,
        pdfBase64: null,
        pages: null,
        error: { code: 'COMPILE_ERROR', message: 'undefined control sequence' },
        logTail: '! Undefined control sequence.',
      }),
    );
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Compile preview' }));

    expect(await screen.findByText('Compile failed')).toBeInTheDocument();
    expect(screen.getByText(/undefined control sequence/)).toBeInTheDocument();
    expect(screen.getByText('LaTeX log')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download .tex' })).toBeInTheDocument();
  });

  it('reports a letter the server refused to render at all', async () => {
    // A letter with no text never reaches the compiler, so there is no compile
    // result to read the failure out of.
    mockApi.post.mockRejectedValue(new Error('This letter has no text to compile.'));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole('button', { name: 'Compile preview' }));

    expect(await screen.findByText('This letter could not be compiled')).toBeInTheDocument();
    expect(screen.getByText('This letter has no text to compile.')).toBeInTheDocument();
  });

  it('finalizes through the finalize route and tells the screen to reload', async () => {
    mockApi.post.mockResolvedValue(compiled());
    const onFinalized = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onFinalized });

    await user.click(screen.getByRole('button', { name: 'Finalize letter' }));

    expect(await screen.findByTitle('cover letter preview')).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith('/letters/l1/finalize');
    expect(onFinalized).toHaveBeenCalledOnce();
  });

  it('does not claim a finalize succeeded when the compiler was offline', async () => {
    mockApi.post.mockResolvedValue(compiled({ ok: false, offline: true, pdfBase64: null, pages: null }));
    const onFinalized = vi.fn();
    const user = userEvent.setup();
    renderPanel({ onFinalized });

    await user.click(screen.getByRole('button', { name: 'Finalize letter' }));

    expect(await screen.findByText('Build service offline')).toBeInTheDocument();
    expect(onFinalized).not.toHaveBeenCalled();
  });

  it('names the stored pair and offers a rebuild once a letter is final', () => {
    renderPanel({ letterStatus: 'final', hasStoredArtifacts: true });
    expect(screen.getByRole('button', { name: 'Rebuild artifacts' })).toBeInTheDocument();
    expect(screen.getByText('PDF and source stored')).toBeInTheDocument();
  });

  it('disables compile and finalize on a locked workspace (NFR-OPS-002)', () => {
    writeGate.canWrite = false;
    renderPanel();
    expect(screen.getByRole('button', { name: 'Compile preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Finalize letter' })).toBeDisabled();
    expect(screen.getByText(/Read-only workspace/)).toBeInTheDocument();
  });
});
