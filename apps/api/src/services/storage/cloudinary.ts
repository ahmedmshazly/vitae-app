/**
 * Cloudinary implementation of the StorageAdapter (owner-provided CLOUDINARY_URL).
 * Objects are stored under a content-hash public_id for dedup; delivery uses
 * signed, expiring URLs (private delivery type) so attachment keys are not
 * guessable (SRS T5).
 */
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../env.js';
import { currentWorkspaceId } from '../../db/space.js';
import type { StorageAdapter, StoredObject } from './adapter.js';
import { sharedMemoryStorage } from './memory.js';
import { FilesystemStorage } from './filesystem.js';

// The SDK auto-reads CLOUDINARY_URL from process.env; make it explicit + private.
let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!env.CLOUDINARY_URL) return false;
  cloudinary.config({ secure: true });
  configured = true;
  return true;
}

export class CloudinaryStorage implements StorageAdapter {
  private folder = env.CLOUDINARY_FOLDER;

  async upload(input: { data: Buffer; filename: string; mime: string; sha256: string }): Promise<StoredObject> {
    if (!ensureConfigured()) throw new Error('Cloudinary is not configured (set CLOUDINARY_URL).');
    // Content-addressed IDs may deduplicate within one owner but must never
    // cross Cloud workspaces: a shared hash is still an information leak.
    const publicId = `${this.folder}/${currentWorkspaceId()}/${input.sha256.slice(0, 2)}/${input.sha256}`;
    const isImage = input.mime.startsWith('image/');
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: isImage ? 'image' : 'raw',
          type: 'private', // not publicly accessible; requires a signed URL
          overwrite: false,
          unique_filename: false,
          use_filename: false,
        },
        (err, res) => (err ? reject(err) : resolve(res as unknown as Record<string, unknown>)),
      );
      stream.end(input.data);
    });

    return {
      key: publicId,
      url: (result.secure_url as string) ?? '',
      bytes: (result.bytes as number) ?? input.data.length,
      mime: input.mime,
      sha256: input.sha256,
      width: result.width as number | undefined,
      height: result.height as number | undefined,
    };
  }

  async signedUrl(key: string, ttlSeconds = 300, mime = 'application/octet-stream'): Promise<string> {
    if (!ensureConfigured()) throw new Error('Cloudinary is not configured.');
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const format = mime.startsWith('image/') ? mime.slice('image/'.length) : '';
    return cloudinary.utils.private_download_url(key, format, {
      expires_at: expiresAt,
      resource_type: mime.startsWith('image/') ? 'image' : 'raw',
      type: 'private',
    });
  }

  async downloadStream(key: string, mime?: string): Promise<AsyncIterable<Uint8Array>> {
    const url = await this.signedUrl(key, 300, mime);
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Cloudinary download failed (${response.status}) for ${key}`);
    if (!response.body) throw new Error(`Cloudinary returned an empty body for ${key}`);
    return response.body;
  }

  async delete(key: string, mime = 'application/octet-stream'): Promise<void> {
    if (!ensureConfigured()) throw new Error('Cloudinary is not configured.');
    const result = await cloudinary.uploader.destroy(key, {
      resource_type: mime.startsWith('image/') ? 'image' : 'raw',
      type: 'private',
      invalidate: true,
    });
    const status = String(result.result ?? '');
    if (status !== 'ok' && status !== 'not found') {
      throw new Error(`Cloudinary delete failed for ${key}: ${status || 'unknown result'}`);
    }
  }

  async healthy(): Promise<boolean> {
    return ensureConfigured();
  }
}

export const storage: StorageAdapter =
  env.NODE_ENV === 'test' || process.env.VITEST === 'true'
    ? sharedMemoryStorage()
    : env.CLOUDINARY_URL
      ? new CloudinaryStorage()
      : env.VITAE_LOCAL_INSTALL && env.VITAE_STORAGE_DIR
        ? new FilesystemStorage(env.VITAE_STORAGE_DIR, {
            folder: env.CLOUDINARY_FOLDER,
            publicOrigin: env.WEB_ORIGIN.split(',')[0]?.trim(),
            workspaceId: currentWorkspaceId,
          })
        : new CloudinaryStorage();
