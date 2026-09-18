/**
 * Authenticated download for the filesystem storage adapter. Cloudinary
 * installs keep using provider signed URLs and never hit this route.
 */
import { Router } from 'express';
import { asyncHandler, HttpError } from '../../middleware/error.js';
import { storage } from '../../services/storage/cloudinary.js';
import { FilesystemStorage } from '../../services/storage/filesystem.js';

export const objectsRouter: Router = Router();

export function parseObjectKey(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 512) {
    throw new HttpError(400, 'INVALID_OBJECT_KEY', 'Object key is required.');
  }
  return raw;
}

objectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!(storage instanceof FilesystemStorage)) {
      throw new HttpError(404, 'NOT_FOUND', 'Not found.');
    }
    const key = parseObjectKey(req.query.key);
    let mime = 'application/octet-stream';
    let bytes = 0;
    try {
      const stat = storage.stat(key);
      mime = stat.mime;
      bytes = stat.bytes;
    } catch {
      throw new HttpError(404, 'NOT_FOUND', 'Object not found.');
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of await storage.downloadStream(key)) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(bytes || body.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(body);
  }),
);
