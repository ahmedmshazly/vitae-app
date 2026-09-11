import { describe, expect, it } from 'vitest';
import {
  assertDedicatedDatabaseUrl,
  databaseNameFromUrl,
  isDefaultWorkspaceDatabase,
} from './isolated-database.js';

describe('isolated productivity database guard', () => {
  it('names the database from a postgres URL', () => {
    expect(databaseNameFromUrl('postgresql://vitae:vitae@127.0.0.1:5433/vitae_perf')).toBe(
      'vitae_perf',
    );
  });

  it('treats vitae and vitae_test as default workspaces', () => {
    expect(isDefaultWorkspaceDatabase('vitae')).toBe(true);
    expect(isDefaultWorkspaceDatabase('vitae_test')).toBe(true);
    expect(isDefaultWorkspaceDatabase('vitae_perf')).toBe(false);
  });

  it('refuses the default DATABASE_URL even with confirm', () => {
    expect(() =>
      assertDedicatedDatabaseUrl('postgresql://vitae:vitae@127.0.0.1:5433/vitae', {
        confirm: 'YES',
      }),
    ).toThrow(/default workspace database "vitae"/);
    expect(() =>
      assertDedicatedDatabaseUrl('postgresql://vitae:vitae@127.0.0.1:5433/vitae_test', {
        confirm: 'YES',
      }),
    ).toThrow(/vitae_test/);
  });

  it('refuses a dedicated URL without YES', () => {
    expect(() =>
      assertDedicatedDatabaseUrl('postgresql://vitae:vitae@127.0.0.1:5433/vitae_perf', {
        confirm: '',
      }),
    ).toThrow(/VITAE_PRODUCTIVITY_PERF_CONFIRM=YES/);
  });

  it('accepts a dedicated URL with YES', () => {
    expect(
      assertDedicatedDatabaseUrl('postgresql://vitae:vitae@127.0.0.1:5433/vitae_perf', {
        confirm: 'YES',
      }),
    ).toBe('vitae_perf');
  });
});
