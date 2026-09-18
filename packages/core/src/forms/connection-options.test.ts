import { describe, expect, it } from 'vitest';
import { EDGE_TYPES, NODE_TYPES } from '../types.js';
import { edgeEndpointsAllowed } from './edge-forms.js';
import {
  connectionOptionGroup,
  connectionOptionLabel,
  connectionOptionsFor,
  connectionOptionSelectLabel,
  edgeDisplayLabel,
  edgeTypeGroup,
  isOrgRelationKind,
  isPersonRelation,
  orgRelationKindLabel,
  personRelationLabel,
} from './connection-options.js';

describe('connectionOptionsFor', () => {
  it('offers HELD outbound for a person', () => {
    const options = connectionOptionsFor('person');
    const held = options.find((o) => o.key === 'HELD:out');
    expect(held).toBeDefined();
    expect(held!.targetTypes).toContain('role');
  });

  it('offers HELD inbound for a role so the picker can attach an owner', () => {
    const options = connectionOptionsFor('role');
    const heldIn = options.find((o) => o.key === 'HELD:in');
    expect(heldIn).toBeDefined();
    expect(heldIn!.targetTypes).toContain('person');
  });

  it('never lists an empty targetTypes array', () => {
    for (const option of connectionOptionsFor('organization')) {
      expect(option.targetTypes.length).toBeGreaterThan(0);
    }
  });

  it('sorts Career options before Social options', () => {
    const options = connectionOptionsFor('person');
    const firstCareer = options.findIndex((o) => connectionOptionGroup(o) === 'Career');
    const firstSocial = options.findIndex((o) => connectionOptionGroup(o) === 'Social');
    expect(firstCareer).toBeGreaterThanOrEqual(0);
    expect(firstSocial).toBeGreaterThan(firstCareer);
  });

  it('prefixes the select label with the option group', () => {
    const held = connectionOptionsFor('person').find((o) => o.key === 'HELD:out');
    expect(held).toBeDefined();
    expect(connectionOptionSelectLabel(held!)).toMatch(/^Career · /);
  });

  it('exposes every registered relationship through a legal, labelled picker option', () => {
    const seen = new Set<string>();

    for (const nodeType of NODE_TYPES) {
      for (const option of connectionOptionsFor(nodeType)) {
        seen.add(option.descriptor.type);
        expect(connectionOptionLabel(option), `${nodeType} ${option.key}`).not.toEqual('');
        expect(connectionOptionSelectLabel(option), `${nodeType} ${option.key}`).not.toMatch(
          /undefined/,
        );

        for (const targetType of option.targetTypes) {
          const allowed =
            option.direction === 'out'
              ? edgeEndpointsAllowed(option.descriptor.type, nodeType, targetType)
              : edgeEndpointsAllowed(option.descriptor.type, targetType, nodeType);
          expect(allowed.ok, `${nodeType} ${option.key} ${targetType}`).toBe(true);
        }
      }
    }

    expect([...seen].sort()).toEqual([...EDGE_TYPES].sort());
  });
});

describe('connection label helpers', () => {
  it('formats known and unknown person relations', () => {
    expect(personRelationLabel(null)).toBeNull();
    expect(personRelationLabel('friend')).toMatch(/Friend/i);
    expect(personRelationLabel('custom_tie')).toBe('Custom tie');
    expect(isPersonRelation('friend')).toBe(true);
    expect(isPersonRelation('not-a-relation')).toBe(false);
  });

  it('formats org relation kinds and edge display labels', () => {
    expect(orgRelationKindLabel(undefined)).toBeNull();
    expect(isOrgRelationKind('subsidiary')).toBe(true);
    expect(edgeDisplayLabel('KNOWS', 'out', { relation: 'friend' })).toMatch(/Friend/i);
    expect(edgeDisplayLabel('ORG_RELATED', 'out', { kind: 'subsidiary' })).toBeTruthy();
    expect(edgeTypeGroup('HELD')).toBe('Career');
    const heldIn = connectionOptionsFor('role').find((o) => o.key === 'HELD:in')!;
    expect(connectionOptionLabel(heldIn)).toBe('Held by');
  });
});
