import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OBSERVATORY_STATE,
  OBSERVATORY_GROUP_COLORS,
  OBSERVATORY_GROUP_SLOTS,
  buildFocusScene,
  buildObservatoryMatrix,
  buildOrbitScene,
  cloneObservatoryState,
  observatorySearchParams,
  observatoryStateFromSearchParams,
  parseObservatoryWorkspace,
} from './entityObservatoryModel.js';

describe('entity observatory model', () => {
  it('starts with a calm line-free orbit and reveals only selected routes', () => {
    const base = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    const calm = buildOrbitScene(base);
    expect(calm.nodes.length).toBeGreaterThan(60);
    expect(calm.edges).toHaveLength(0);

    base.selectedIds = ['entity:person'];
    const focused = buildOrbitScene(base);
    expect(focused.edges.length).toBeGreaterThan(0);
    expect(focused.edges.length).toBeLessThan(88);
    expect(focused.edges.every((edge) => focused.visibleRelationIds.has(edge.relationId))).toBe(
      true,
    );
  });

  it('aggregates route corridors in bundled overview mode', () => {
    const state = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    state.display.edgeMode = 'bundled';
    const scene = buildOrbitScene(state);
    expect(scene.edges.some((edge) => edge.bundled && edge.count > 1)).toBe(true);
    expect(scene.edges.length).toBeLessThan(88);
  });

  it('persists explicit item hiding independently from group filters', () => {
    const state = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    state.hiddenIds = ['entity:person', 'relation:KNOWS'];
    const scene = buildOrbitScene(state);
    expect(scene.nodes.some((node) => node.id === 'entity:person')).toBe(false);
    expect(scene.nodes.some((node) => node.id === 'relation:KNOWS')).toBe(false);
    const restored = observatoryStateFromSearchParams(observatorySearchParams(state));
    expect(restored.hiddenIds).toEqual(['entity:person', 'relation:KNOWS']);
  });

  it('builds bounded Focus neighborhoods for one through three hops', () => {
    const state = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    state.lens = 'focus';
    state.selectedIds = ['entity:person'];
    state.display.hopDepth = 1;
    const oneHop = buildFocusScene(state);
    state.display.hopDepth = 3;
    const threeHops = buildFocusScene(state);
    expect(oneHop.nodes.some((node) => node.id === 'entity:person' && node.selected)).toBe(true);
    expect(threeHops.nodes.length).toBeGreaterThanOrEqual(oneHop.nodes.length);
    expect(threeHops.edges.length).toBeGreaterThanOrEqual(oneHop.edges.length);
  });

  it('represents exact pairs and wildcard endpoints in the line-free matrix', () => {
    const state = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    state.lens = 'matrix';
    const matrix = buildObservatoryMatrix(state);
    // Area and Opportunity are first-class catalog entities, so the matrix
    // must grow with the schema rather than silently omitting them.
    expect(matrix.entities).toHaveLength(37);
    expect(matrix.entities.map((entity) => entity.label)).toEqual(
      expect.arrayContaining(['area', 'opportunity']),
    );
    expect(
      matrix.cells
        .get('entity:repository|entity:project')
        ?.relations.some((relation) => relation.type === 'PART_OF'),
    ).toBe(true);
    expect(
      matrix.cells
        .get('entity:interaction|any')
        ?.relations.some((relation) => relation.type === 'ABOUT'),
    ).toBe(true);
  });

  it('round-trips semantic URL state while keeping workspace files versioned', () => {
    const state = cloneObservatoryState(DEFAULT_OBSERVATORY_STATE);
    state.lens = 'focus';
    state.selectedIds = ['entity:person'];
    state.compareIds = ['entity:organization'];
    state.display.hopDepth = 2;
    state.display.edgeMode = 'bundled';
    state.display.transpose = true;
    const params = observatorySearchParams(state);
    const restored = observatoryStateFromSearchParams(params);
    expect(restored).toMatchObject({
      lens: 'focus',
      selectedIds: ['entity:person'],
      compareIds: ['entity:organization'],
      display: { hopDepth: 2, edgeMode: 'bundled', transpose: true },
    });
    expect(parseObservatoryWorkspace(JSON.stringify(state))).toMatchObject({ version: 1 });
    expect(parseObservatoryWorkspace('{}')).toBeNull();
  });

  it('pins catalog groups to Quiet viz slots (aligned with print --ec-*)', () => {
    expect(OBSERVATORY_GROUP_SLOTS).toEqual({
      Career: 1,
      Content: 2,
      Life: 3,
      'Job search': 4,
      'Long tail': 6,
    });
    // Fallbacks match tokens.css, no Aurora cyan/purple identity hues.
    expect(OBSERVATORY_GROUP_COLORS.Career).toBe('#1f9c86');
    expect(OBSERVATORY_GROUP_COLORS.Content).toBe('#b08a18');
    expect(Object.values(OBSERVATORY_GROUP_COLORS).join(' ')).not.toMatch(/26c6da|9b7bff|65ddff/i);
  });
});
