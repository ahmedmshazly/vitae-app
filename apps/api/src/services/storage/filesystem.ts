/**
 * Disk-backed StorageAdapter for a loopback personal install (no Cloudinary).
 * Keys are content-addressed and confined to `root`; signed URLs point at the
 * authenticated `/api/v1/objects` route on the same origin.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { StorageAdapter, StoredObject } from './adapter.js';

function assertSafeSegment(seg: string): string {
  if (!seg || seg === '.' || seg === '..' || !/^[A-Za-z0-9._-]+$/.test(seg)) {
    throw new Error(`invalid object key segment ${seg}`);
  }
  return seg;
}

function assertSafeSha(sha: string): string {
  if (!/^[a-f0-9]+$/i.test(sha) || sha.length < 8 || sha.length > 128) {
    throw new Error(`invalid object hash ${sha}`);
  }
  return sha.toLowerCase();
}

export class FilesystemStorage implements StorageAdapter {
  constructor(
    private readonly root: string,
    private readonly options: {
      folder?: string;
      publicOrigin?: string;
      workspaceId?: () => string;
    } = {},
  ) {
    mkdirSync(this.root, { recursive: true });
  }

  private paths(key: string): { bin: string; meta: string } {
    const parts = key.split('/').filter(Boolean).map(assertSafeSegment);
    if (parts.length < 2) throw new Error('invalid object key');
    const rel = join(...parts);
    const rootResolved = resolve(this.root);
    const bin = resolve(this.root, rel);
    if (bin !== rootResolved && !bin.startsWith(rootResolved + sep)) {
      throw new Error('object key escapes storage root');
    }
    return { bin, meta: `${bin}.mime` };
  }

  async upload(input: {
    data: Buffer;
    filename: string;
    mime: string;
    sha256: string;
  }): Promise<StoredObject> {
    const sha = assertSafeSha(input.sha256);
    const folder = assertSafeSegment(this.options.folder ?? 'vitae');
    const workspace = assertSafeSegment(this.options.workspaceId?.() ?? 'local');
    const key = `${folder}/${workspace}/${sha.slice(0, 2)}/${sha}`;
    const { bin, meta } = this.paths(key);
    mkdirSync(dirname(bin), { recursive: true });
    writeFileSync(bin, input.data);
    writeFileSync(meta, input.mime, 'utf8');
    return {
      key,
      url: await this.signedUrl(key),
      bytes: input.data.length,
      mime: input.mime,
      sha256: sha,
    };
  }

  stat(key: string): { mime: string; bytes: number } {
    const { bin, meta } = this.paths(key);
    if (!existsSync(bin)) throw new Error(`filesystem storage miss for ${key}`);
    const mime = existsSync(meta) ? readFileSync(meta, 'utf8') : 'application/octet-stream';
    return { mime, bytes: statSync(bin).size };
  }

  async downloadStream(key: string): Promise<AsyncIterable<Uint8Array>> {
    const { bin } = this.paths(key);
    if (!existsSync(bin)) throw new Error(`filesystem storage miss for ${key}`);
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
    this.stat(key);
    const origin = (this.options.publicOrigin ?? '').replace(/\/$/, '');
    const query = `key=${encodeURIComponent(key)}`;
    return origin ? `${origin}/api/v1/objects?${query}` : `/api/v1/objects?${query}`;
  }

  async healthy(): Promise<boolean> {
    try {
      mkdirSync(this.root, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
