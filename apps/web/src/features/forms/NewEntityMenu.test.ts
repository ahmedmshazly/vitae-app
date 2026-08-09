import { describe, expect, it } from 'vitest';
import { NODE_TYPES } from '@vitae/core';
import { NEW_ENTITY_MENU_GROUPS } from './NewEntityMenu.js';

describe('+ New entity menu coverage', () => {
  it('exposes every canonical node type exactly once', () => {
    const menuTypes = NEW_ENTITY_MENU_GROUPS.flatMap((group) => group.types);

    expect(new Set(menuTypes).size, 'duplicate type in + New').toBe(menuTypes.length);
    expect([...menuTypes].sort()).toEqual([...NODE_TYPES].sort());
  });

  it('exposes posts for manual creation', () => {
    expect(NEW_ENTITY_MENU_GROUPS.some((group) => group.types.includes('post'))).toBe(true);
  });
});
