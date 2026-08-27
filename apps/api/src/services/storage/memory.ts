/**
 * Test storage that round-trips the bytes a backup later asks for.
 *
 * Integration tests used to skip `storage.upload` under NODE_ENV=test, which
 * left attachments rows with no key and made a complete backup refuse the
 * whole workspace. Calling Cloudinary from those tests instead wrote keys
 * whose private raw objects 404 on download.
 *
 * Bytes live on disk, not in a process Map. Vitest isolates each file
 * (`isolate: true` default), which gives every file a fresh `globalThis`,
 * while `fileParallelism: false` still shares one Postgres. A résumé
 * finalized in `resumes.integration.test.ts` therefore leaves a `memory/…`
 * key the backup tests in `api.integration.test.ts` must still be able to
 * read (FR-001).
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { StorageAdapter, StoredObject } from './adapter.js';

export const TEST_STORAGE_DIR =
  process.env.VITAE_TEST_STORAGE_DIR ?? join(tmpdir(), 'vitae-vitest-storage');

function assertSafeSha(sha: string): string {
  if (!/^[a-f0-9]+$/i.test(sha)) throw new Error(`invalid memory storage key fragment ${sha}`);
  return sha;
}

export class MemoryStorage implements StorageAdapter {
  constructor(private readonly root: string = TEST_STORAGE_DIR) {
    mkdirSync(this.root, { recursive: true });
  }

  private paths(key: string): { bin: string; meta: string } {
    const sha = assertSafeSha(key.startsWith('memory/') ? key.slice('memory/'.length) : key);
    return { bin: join(this.root, sha), meta: join(this.root, `${sha}.mime`) };
  }

  async upload(input: {
    data: Buffer;
    filename: string;
    mime: string;
    sha256: string;
  }): Promise<StoredObject> {
    const key = `memory/${assertSafeSha(input.sha256)}`;
    const { bin, meta } = this.paths(key);
    writeFileSync(bin, input.data);
    writeFileSync(meta, input.mime, 'utf8');
    return {
      key,
      url: `memory://${key}`,
      bytes: input.data.length,
      mime: input.mime,
      sha256: input.sha256,
    };
  }

  async downloadStream(key: string): Promise<AsyncIterable<Uint8Array>> {
    const { bin } = this.paths(key);
    if (!existsSync(bin)) throw new Error(`memory storage miss for ${key}`);
    const data = readFileSync(bin);
    return (async function* () {
      yield data;
    })();
  }

  async delete(key: string): Promise<void> {
    const { bin, meta } = this.paths(key);
    if (existsSync(bin)) unlinkSync(bin);
    if (existsSync(meta)) unlinkSync(meta);
  }

  async signedUrl(key: string): Promise<string> {
    const { bin } = this.paths(key);
    if (!existsSync(bin)) throw new Error(`memory storage miss for ${key}`);
    return `memory://${key}`;
  }

  async healthy(): Promise<boolean> {
    return true;
  }
}

export function sharedMemoryStorage(): MemoryStorage {
  return new MemoryStorage();
}
