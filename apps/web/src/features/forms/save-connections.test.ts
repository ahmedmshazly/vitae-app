import { beforeEach, expect, it, vi } from 'vitest';
import { NODE_FORM_DESCRIPTORS } from '@vitae/core';
import { api } from '../../lib/api.js';
import { saveConnections } from './save-connections.js';
import type { ConnectionDraft } from './EdgeSubEditorRow.js';

vi.mock('../../lib/api.js', () => ({ api: { post: vi.fn(), patch: vi.fn(), del: vi.fn() } }));
const draft = (key: string, edgeId?: string): ConnectionDraft => ({
  key,
  sub: NODE_FORM_DESCRIPTORS.person.edges[0]!,
  target: { id: key, title: key, type: 'organization' },
  props: {},
  edgeId,
});
beforeEach(() => vi.resetAllMocks());

it('resumes after a failed connection without recreating successful connections', async () => {
  const journal = new Map<string, ConnectionDraft>();
  vi.mocked(api.post)
    .mockResolvedValueOnce({ edge: { id: 'e1' } })
    .mockRejectedValueOnce(new Error('offline'));
  await expect(saveConnections('n1', [draft('a'), draft('b')], journal)).rejects.toThrow('offline');
  vi.mocked(api.post).mockResolvedValueOnce({ edge: { id: 'e2' } });
  await saveConnections('n1', [draft('a'), draft('b')], journal);
  expect(api.post).toHaveBeenCalledTimes(3);
  expect(journal.size).toBe(2);
});

it('does not repeat successful removals when a later removal fails', async () => {
  const journal = new Map([
    ['e1', draft('a', 'e1')],
    ['e2', draft('b', 'e2')],
  ]);
  vi.mocked(api.del).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('offline'));
  await expect(saveConnections('n1', [], journal)).rejects.toThrow('offline');
  vi.mocked(api.del).mockResolvedValueOnce({});
  await saveConnections('n1', [], journal);
  expect(vi.mocked(api.del).mock.calls.map(([path]) => path)).toEqual([
    '/edges/e1',
    '/edges/e2',
    '/edges/e2',
  ]);
  expect(journal.size).toBe(0);
});

it('replaces a changed endpoint and preserves edits made after a partial save', async () => {
  const original = draft('a', 'e1');
  const journal = new Map([['e1', original]]);
  const changed = {
    ...original,
    target: { ...original.target, id: 'new-target' },
    props: { role: 'Lead' },
  };
  vi.mocked(api.post).mockResolvedValueOnce({ edge: { id: 'e2' } });
  vi.mocked(api.del).mockRejectedValueOnce(new Error('offline'));
  await expect(saveConnections('n1', [changed], journal)).rejects.toThrow('offline');
  vi.mocked(api.del).mockResolvedValueOnce({});
  await saveConnections('n1', [{ ...changed, props: { role: 'Director' } }], journal);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.patch).toHaveBeenCalledWith('/edges/e2', { props: { role: 'Director' } });
  expect([...journal.keys()]).toEqual(['e2']);
});
