/**
 * Test storage round-trips bytes the way a later Vitest file would: a second
 * instance on the same directory, not a Map that dies with the isolate.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStorage } from './memory.js';

describe('MemoryStorage', () => {
  it('returns the same bytes that were uploaded, addressed by content hash', async () => {
    const storage = new MemoryStorage(mkdtempSync(join(tmpdir(), 'vitae-memory-')));
    const data = Buffer.from('%PDF-test');
    const stored = await storage.upload({
      data,
      filename: 'x.pdf',
      mime: 'application/pdf',
      sha256: 'abc',
    });
    expect(stored.key).toBe('memory/abc');
    const chunks: Uint8Array[] = [];
    for await (const chunk of await storage.downloadStream(stored.key)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(data)).toBe(true);
    await expect(storage.signedUrl(stored.key)).resolves.toBe('memory://memory/abc');
  });

  it('lets a second instance read what the first wrote, as file isolation would', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vitae-memory-'));
    const first = new MemoryStorage(dir);
    const data = Buffer.from('%PDF-isolate');
    const stored = await first.upload({
      data,
      filename: 'y.pdf',
      mime: 'application/pdf',
      sha256: 'def',
    });
    const second = new MemoryStorage(dir);
    const chunks: Uint8Array[] = [];
    for await (const chunk of await second.downloadStream(stored.key)) chunks.push(chunk);
    expect(Buffer.concat(chunks).equals(data)).toBe(true);
  });
});
