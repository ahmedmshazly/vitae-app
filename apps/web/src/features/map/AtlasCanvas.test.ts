import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/features/map/AtlasCanvas.tsx'), 'utf8');

/**
 * MapLibre paints into WebGL, so a layer's colours never reach the DOM and no
 * computed style can catch a literal creeping back in. The source is the only
 * place to assert it.
 *
 * What was here: '#a5f3fc' and '#64748b' for selected/unselected corridors,
 * '#7dd3fc' for trip arcs, 'rgba(180, 200, 220, 0.45)' for stems and '#000' for
 * the hit target, five sky- and slate-blues from the palette this identity
 * replaced, on the one screen where the app draws over someone else's tiles.
 */
describe('atlas map layers', () => {
  it('names no colour of its own, every ink comes from the palette', () => {
    // Ignore the tile-style URL and the worker import, which are not colours.
    const code = source
      .split('\n')
      .filter((l) => !l.includes('://'))
      .join('\n');
    const literals = code.match(/'#[0-9a-fA-F]{3,8}'|'rgba?\([^)]*\)'/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('draws every layer from the shared graph palette', () => {
    // The same eight-slot categorical band the Life map uses, so a city and a
    // node of the same type are the same colour on both screens.
    expect(source).toContain("from '../../lib/graph-palette.js'");
    for (const layer of ['CORRIDOR_LAYER', 'ARC_LAYER', 'STEM_LAYER']) {
      expect(source, `${layer} should exist`).toContain(layer);
    }
  });

  // Hue was the only thing separating the corridor you had picked from every
  // other line on the map.
  it('gives a selected corridor weight as well as ink', () => {
    const widthSpec = source.slice(source.indexOf("'line-width': ["), source.indexOf("'line-opacity'"));
    expect(widthSpec).toContain("['get', 'selected']");
  });
});
