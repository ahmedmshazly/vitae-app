/**
 * Command palette matching: accent fold and token-AND over label + keywords.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildCommands, matchCommand, type CommandAction } from './commands.js';

const action = (over: Partial<CommandAction> = {}): CommandAction => ({
  id: 'x',
  label: 'New résumé',
  keywords: 'tailor cv',
  run: vi.fn(),
  ...over,
});

describe('matchCommand', () => {
  it('matches accent-insensitively so "resume" finds "résumé"', () => {
    expect(matchCommand(action(), 'resume')).toBe(true);
  });

  it('requires every query token to appear in label or keywords', () => {
    expect(matchCommand(action(), 'new cv')).toBe(true);
    expect(matchCommand(action(), 'new missing')).toBe(false);
  });
});

describe('buildCommands', () => {
  it('includes capture and space toggle when handlers are provided', () => {
    const openCapture = vi.fn();
    const toggleSpace = vi.fn();
    const cmds = buildCommands({
      navigate: vi.fn(),
      openCapture,
      openNew: vi.fn(),
      toggleSpace,
      space: 'demo',
    });
    expect(cmds.some((c) => c.id === 'capture')).toBe(true);
    const space = cmds.find((c) => c.id === 'toggle-space');
    expect(space?.label).toBe('Switch to my real data');
    space?.run();
    expect(toggleSpace).toHaveBeenCalledOnce();
  });
});
