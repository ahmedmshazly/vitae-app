import { describe, expect, it } from 'vitest';
import { linksWithVisibleNodes } from './GraphCanvas.js';
import type { FgLink, FgNode } from './types.js';

const node = (id: string): FgNode => ({
  id,
  title: id,
  type: 'person',
  isSelf: false,
  degree: 0,
  hop: 0,
});

describe('linksWithVisibleNodes', () => {
  it('does not send a relationship with an absent imported endpoint to ForceGraph', () => {
    const links: FgLink[] = [
      { source: 'self', target: 'github-record', type: 'RELATED' },
      { source: 'self', target: 'ext-5b04f642e943c15a8b390b62a7d1c02f568ab03b', type: 'RELATED' },
    ];

    expect(linksWithVisibleNodes([node('self'), node('github-record')], links)).toEqual([
      links[0],
    ]);
  });
});
