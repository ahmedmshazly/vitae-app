/**
 * Deterministic outreach composer (reference genDraft, user decision: no LLM).
 * A tone × ask-kind template matrix filled with real relationship facts.
 * Pure and snapshot-testable; the API layer supplies the facts.
 */

export type ComposerKind = 'intro' | 'referral' | 'nudge' | 'reconnect' | 'explore';
export type ComposerTone = 'warm' | 'direct' | 'formal';

export interface ComposeInput {
  kind: ComposerKind;
  tone: ComposerTone;
  /** Person being asked (the "asker" in reference terms). */
  askerName: string;
  /** Person you want to reach (for intros). */
  targetName?: string;
  targetOrg?: string;
  roleTitle?: string;
  /** Context lines, most important first, e.g. last interaction, shared history. */
  facts?: string[];
  /** Your signature name. */
  senderName?: string;
}

const OPENERS: Record<ComposerTone, (first: string) => string> = {
  warm: (f) => `Hi ${f}. Hope you're doing well!`,
  direct: (f) => `Hi ${f},`,
  formal: (f) => `Dear ${f},`,
};

const CLOSERS: Record<ComposerTone, string> = {
  warm: 'Thanks so much,',
  direct: 'Thanks,',
  formal: 'With appreciation,',
};

function asks(i: ComposeInput): Record<ComposerKind, Record<ComposerTone, string>> {
  const target = i.targetName ?? 'the right person';
  const org = i.targetOrg ?? 'their team';
  const role = i.roleTitle ?? 'the role';
  return {
    intro: {
      warm: `Would you be up for a quick intro to ${target} at ${org}? Totally fine if not.`,
      direct: `Could you introduce me to ${target} at ${org}?`,
      formal: `I would be grateful if you might introduce me to ${target} at ${org}.`,
    },
    referral: {
      warm: `If it feels right, would you be open to referring me for ${role} at ${org}?`,
      direct: `Would you refer me for ${role} at ${org}?`,
      formal: `I would appreciate it if you would consider referring me for ${role} at ${org}.`,
    },
    nudge: {
      warm: `Just a friendly nudge on my application. Happy to share anything useful.`,
      direct: `Wanted to flag my application for ${role}. Anything you need from me?`,
      formal: `I wished to respectfully flag my application for ${role} for your consideration.`,
    },
    reconnect: {
      warm: `It's been a while; would love to catch up whenever you have a moment.`,
      direct: `It's been a while. Free for a quick catch-up soon?`,
      formal: `It has been some time; I would welcome the opportunity to reconnect.`,
    },
    explore: {
      warm: `No pressure at all, but I'm curious whether there might be a path into ${org}? Any thoughts?`,
      direct: `Is there a realistic path into ${org} worth exploring?`,
      formal: `I wondered whether you might advise on a possible path into ${org}.`,
    },
  };
}

/** Compose a plain-text draft. Deterministic for identical input. */
export function composeDraft(input: ComposeInput): string {
  const first = input.askerName.trim().split(/\s+/)[0] || 'there';
  const context = (input.facts ?? [])[0];
  const askLine = asks(input)[input.kind][input.tone];
  const lines = [
    OPENERS[input.tone](first),
    '',
    ...(context ? [`${context}.`.replace(/\.\.$/, '.'), ''] : []),
    askLine,
    '',
    CLOSERS[input.tone],
    input.senderName ?? 'You',
  ];
  return lines.join('\n');
}
