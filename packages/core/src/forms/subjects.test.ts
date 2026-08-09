import { describe, expect, it } from 'vitest';
import {
  isSubjectBearing,
  PLACEHOLDER_IDENTITY_KEY,
  PLACEHOLDER_TITLE,
  subjectAssignment,
  subjectEdgeFor,
  SUBJECT_BEARING_TYPES,
} from './subjects.js';

describe('subjectEdgeFor', () => {
  it('returns the HELD inbound edge for roles', () => {
    const subject = subjectEdgeFor('role');
    expect(subject?.edgeType).toBe('HELD');
    expect(subject?.direction).toBe('in');
  });

  it('returns null for shared vocabulary types', () => {
    expect(subjectEdgeFor('organization')).toBeNull();
    expect(subjectEdgeFor('skill')).toBeNull();
  });
});

describe('isSubjectBearing', () => {
  it('marks role and education as owned records', () => {
    expect(isSubjectBearing('role')).toBe(true);
    expect(isSubjectBearing('education')).toBe(true);
    expect(SUBJECT_BEARING_TYPES).toContain('role');
  });

  it('does not treat organization as owned', () => {
    expect(isSubjectBearing('organization')).toBe(false);
  });
});

describe('subjectAssignment', () => {
  const types: Record<string, string> = {
    person_1: 'person',
    role_1: 'role',
    org_1: 'organization',
  };
  const typeOf = (id: string) => types[id];

  it('assigns a role to the person on a HELD edge', () => {
    expect(subjectAssignment({ type: 'HELD', src: 'person_1', dst: 'role_1' }, typeOf)).toEqual({
      recordId: 'role_1',
      personId: 'person_1',
    });
  });

  it('returns null for edges that are not subject edges', () => {
    expect(subjectAssignment({ type: 'ROLE_AT', src: 'role_1', dst: 'org_1' }, typeOf)).toBeNull();
  });

  it('exports the unattributed placeholder identity', () => {
    expect(PLACEHOLDER_IDENTITY_KEY).toBe('vitae:system:unattributed');
    expect(PLACEHOLDER_TITLE).toBe('Unattributed');
  });
});
