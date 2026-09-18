import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FilesystemStorage } from './filesystem.js';

describe('FilesystemStorage', () => {
  it('returns the same bytes that were uploaded, addressed by content hash', async () => {
    const storage = new FilesystemStorage(mkdtempSync(join(tmpdir(), 'vitae-fs-')), {
      folder: 'vitae',
      publicOrigin: 'http://127.0.0.1:8080',
      workspaceId: () => 'workspace-legacy-real',
    });
    const data = Buffer.from('%PDF-test');
    const stored = await storage.upload({
      data,
      filename: 'x.pdf',
      mime: 'application/pdf',
      sha256: 'abcdef0123456789',
    });
    expect(stored.key).toBe('vitae/workspace-legacy-real/ab/abcdef0123456789');
    expect(stored.url).toBe(
      'http://127.0.0.1:8080/api/v1/objects?key=vitae%2Fworkspace-legacy-real%2Fab%2Fabcdef0123456789',
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of await storage.downloadStream(stored.key)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(data)).toBe(true);
    expect(storage.stat(stored.key)).toEqual({ mime: 'application/pdf', bytes: data.length });
  });

  it('lets a second instance read what the first wrote', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vitae-fs-'));
    const first = new FilesystemStorage(dir, { workspaceId: () => 'ws' });
    const data = Buffer.from('%PDF-isolate');
    const stored = await first.upload({
      data,
      filename: 'y.pdf',
      mime: 'application/pdf',
      sha256: 'def4567890abcdef',
    });
    const second = new FilesystemStorage(dir);
    const chunks: Uint8Array[] = [];
    for await (const chunk of await second.downloadStream(stored.key)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(data)).toBe(true);
  });

  it('refuses a key that would escape the storage root', async () => {
    const storage = new FilesystemStorage(mkdtempSync(join(tmpdir(), 'vitae-fs-')));
    await expect(storage.downloadStream('../etc/passwd')).rejects.toThrow(/invalid object key segment/);
  });

  it('deletes both the bytes and the mime sidecar', async () => {
    const storage = new FilesystemStorage(mkdtempSync(join(tmpdir(), 'vitae-fs-')), {
      workspaceId: () => 'ws',
    });
    const stored = await storage.upload({
      data: Buffer.from('x'),
      filename: 'x.bin',
      mime: 'application/octet-stream',
      sha256: 'aaaaaaaaaaaaaaaa',
    });
    await storage.delete(stored.key);
    await expect(storage.downloadStream(stored.key)).rejects.toThrow(/miss/);
  });

  it('does not follow a key whose resolved path leaves the root', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vitae-fs-'));
    const storage = new FilesystemStorage(root);
    const outside = join(root, '..', 'outside-vitae-object');
    mkdirSync(join(root, 'vitae'), { recursive: true });
    writeFileSync(outside, 'nope');
    await expect(storage.downloadStream('vitae/../../outside-vitae-object')).rejects.toThrow();
  });
});
