import { describe, expect, it } from 'vitest';
import { composeDraft } from './composer.js';

describe('composeDraft', () => {
  it('composes a warm intro with facts', () => {
    const draft = composeDraft({
      kind: 'intro',
      tone: 'warm',
      askerName: 'Omar El-Sayed',
      targetName: 'Yara Hassan',
      targetOrg: 'Zap Robotics',
      facts: ['You introduced me to Yara back in 2023'],
      senderName: 'Jordan',
    });
    expect(draft).toContain("Hi Omar. Hope you're doing well!");
    expect(draft).toContain('You introduced me to Yara back in 2023.');
    expect(draft).toContain('quick intro to Yara Hassan at Zap Robotics');
    expect(draft.trim().endsWith('Jordan')).toBe(true);
  });

  it('formal referral names the role', () => {
    const draft = composeDraft({
      kind: 'referral',
      tone: 'formal',
      askerName: 'Sarah Chen',
      targetOrg: 'Nile Robotics',
      roleTitle: 'Senior MLE',
    });
    expect(draft).toContain('Dear Sarah,');
    expect(draft).toContain('referring me for Senior MLE at Nile Robotics');
    expect(draft).toContain('With appreciation,');
  });

  it('is deterministic', () => {
    const input = { kind: 'reconnect', tone: 'direct', askerName: 'Lina Farouk' } as const;
    expect(composeDraft(input)).toEqual(composeDraft(input));
  });

  it('handles missing target gracefully', () => {
    const draft = composeDraft({ kind: 'intro', tone: 'direct', askerName: 'X' });
    expect(draft).toContain('introduce me to the right person at their team');
  });
});
