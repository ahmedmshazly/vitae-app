import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '@vitae/core';
import { connectionOptionsFor } from './ConnectionComposer.js';

describe('creation-form connection coverage', () => {
  it('lets every node type link to every other node type', () => {
    for (const sourceType of NODE_TYPES) {
      const relatesTo = connectionOptionsFor(sourceType).find(
        (option) => option.key === 'RELATES_TO:out',
      );
      expect(relatesTo, `${sourceType} has RELATES_TO`).toBeDefined();
      expect(relatesTo?.targetTypes, `${sourceType} can target all types`).toEqual(
        expect.arrayContaining([...NODE_TYPES]),
      );
    }
  });

  it('derives target choices from the strict endpoint matrix', () => {
    const repositoryPartOf = connectionOptionsFor('repository').find(
      (option) => option.key === 'PART_OF:out',
    );
    expect(repositoryPartOf?.targetTypes).toEqual(['project']);

    const rolePartOf = connectionOptionsFor('role').find(
      (option) => option.key === 'PART_OF:in',
    );
    expect(rolePartOf?.targetTypes).toEqual(['project']);
  });

  it('offers Studied at from a person to organization and education', () => {
    const studied = connectionOptionsFor('person').find((o) => o.key === 'STUDIED_AT:out');
    expect(studied).toBeDefined();
    expect(studied?.targetTypes).toEqual(expect.arrayContaining(['organization', 'education']));
  });
});
