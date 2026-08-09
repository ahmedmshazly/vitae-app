/**
 * Per-template LaTeX section renderers (SRS D10). Templates differ in macro
 * vocabulary, cobalt has \cventry/\skillrow/pts, onyx/argon use plain
 * \section + itemize, so each template key maps to a renderer; the token
 * splicing in resume.ts stays template-agnostic. Every dynamic value passes
 * escapeInline/renderInlineMarkdown (SRS §8.4); URLs pass escapeUrl; macros
 * are never escaped. The model carries disabled items (so the visual editor
 * can show them), renderers skip anything disabled, at every level.
 */
import { escapeInline, escapeUrl, isSafeHref, renderInlineMarkdown } from '@vitae/core';
import type { ContactItem, ResumeEntry, ResumeModel, ResumeSection } from './resume-model.js';

export interface TemplateRenderer {
  contactLine(model: ResumeModel): string;
  taglineBlock(model: ResumeModel): string;
  summaryBlock(model: ResumeModel): string;
  sections(model: ResumeModel): string;
}

function contactBit(c: ContactItem): string {
  const label = escapeInline(c.value);
  // An unsafe scheme degrades to plain text rather than dropping the contact.
  // the reader still sees the value, it just isn't a clickable link target.
  return c.href && isSafeHref(c.href) ? `\\href{${escapeUrl(c.href)}}{${label}}` : label;
}

function enabledContacts(model: ResumeModel): ContactItem[] {
  return model.contacts.filter((c) => !c.disabled);
}

function enabledSections(model: ResumeModel): ResumeSection[] {
  return model.sections.filter((s) => !s.disabled && sectionHasContent(s));
}

// ── Generic renderer (onyx, argon), the original \section + itemize style ───

function genericEntry(e: ResumeEntry): string {
  const header = `{\\bfseries ${escapeInline(e.role)}}${e.org ? `, ${escapeInline(e.org)}` : ''}${
    e.dates ? ` \\hfill ${escapeInline(e.dates)}` : ''
  }\\\\`;
  const enabledBullets = e.bullets.filter((b) => !b.disabled);
  const bullets = enabledBullets.length
    ? `\\begin{itemize}\n${enabledBullets.map((b) => `  \\item ${renderInlineMarkdown(b.text)}`).join('\n')}\n\\end{itemize}`
    : '';
  return `${header}\n${bullets}`;
}

const generic: TemplateRenderer = {
  contactLine: (model) => enabledContacts(model).map(contactBit).join('  \\textperiodcentered{}  '),
  taglineBlock: () => '',
  summaryBlock: (model) => (model.summary ? `${renderInlineMarkdown(model.summary)}\\par\\vspace{4pt}` : ''),
  sections: (model) =>
    enabledSections(model)
      .map((section) => {
        let body: string;
        if (section.kind === 'skillrows') {
          body = (section.skillRows ?? [])
            .filter((r) => !r.disabled && r.content)
            .map((r) => `{\\bfseries ${escapeInline(r.label)}:} ${escapeInline(r.content)}\\\\`)
            .join('\n');
        } else if (section.kind === 'lines') {
          body = `\\begin{itemize}\n${(section.lines ?? [])
            .filter((l) => !l.disabled)
            .map((l) => `  \\item ${renderInlineMarkdown(l.text)}`)
            .join('\n')}\n\\end{itemize}`;
        } else {
          body = (section.entries ?? [])
            .filter((e) => !e.disabled)
            .map(genericEntry)
            .join('\n\\vspace{3pt}\n');
        }
        return `\\section{${escapeInline(section.title)}}\n${body}`;
      })
      .join('\n'),
};

// ── Cobalt renderer, \cventry / \skillrow / pts (the navy charter design) ───

function cobaltEntry(e: ResumeEntry): string {
  const subtitleBits = [e.org, e.location].filter(Boolean) as string[];
  const subtitle = subtitleBits.map(escapeInline).join('\\,\\textbar\\,');
  const enabledBullets = e.bullets.filter((b) => !b.disabled);
  const bullets = enabledBullets.length
    ? `\n\\begin{pts}\n${enabledBullets.map((b) => `  \\item ${renderInlineMarkdown(b.text)}`).join('\n')}\n\\end{pts}`
    : '';
  return `\\cventry{${escapeInline(e.role)}}{${subtitle}}{${escapeInline(e.dates ?? '')}}${bullets}`;
}

const cobalt: TemplateRenderer = {
  contactLine: (model) => enabledContacts(model).map(contactBit).join(' \\dotsep{} '),
  // "a · b · c" taglines use the design's \dotsep separator.
  taglineBlock: (model) =>
    model.tagline
      ? `{\\small ${model.tagline
          .split('·')
          .map((t) => escapeInline(t.trim()))
          .filter(Boolean)
          .join(' \\dotsep{} ')}}\\\\[5pt]\n  `
      : '',
  summaryBlock: (model) => (model.summary ? `\\section{Summary}\n${renderInlineMarkdown(model.summary)}\n` : ''),
  sections: (model) =>
    enabledSections(model)
      .map((section) => {
        let body: string;
        if (section.kind === 'skillrows') {
          body = (section.skillRows ?? [])
            .filter((r) => !r.disabled && r.content)
            .map((r) => `\\skillrow{${escapeInline(r.label)}}{${escapeInline(r.content)}}`)
            .join('\n');
        } else if (section.kind === 'lines') {
          body = (section.lines ?? [])
            .filter((l) => !l.disabled)
            .map((l) => `\\noindent{\\small ${renderInlineMarkdown(l.text)}}\\par\\vspace{1.5pt}`)
            .join('\n');
        } else {
          body = (section.entries ?? [])
            .filter((e) => !e.disabled)
            .map(cobaltEntry)
            .join('\n\\vspace{2pt}\n');
        }
        return `\\section{${escapeInline(section.title)}}\n${body}`;
      })
      .join('\n'),
};

function sectionHasContent(s: ResumeSection): boolean {
  if (s.kind === 'skillrows') return (s.skillRows ?? []).some((r) => !r.disabled && r.content.length > 0);
  if (s.kind === 'lines') return (s.lines ?? []).some((l) => !l.disabled);
  return (s.entries ?? []).some((e) => !e.disabled);
}

const RENDERERS: Record<string, TemplateRenderer> = { cobalt, onyx: generic, argon: generic };

export function rendererFor(templateKey: string): TemplateRenderer {
  return RENDERERS[templateKey] ?? generic;
}
