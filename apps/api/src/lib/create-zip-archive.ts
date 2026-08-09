/**
 * archiver v7 (lockfile) is CJS `export = factory`; v8 is ESM with ZipArchive.
 * createRequire + shape detect keeps export working under tsx/Node for both.
 */
import { createRequire } from 'node:module';
import type { Readable, Writable } from 'node:stream';

export interface ZipArchiveLike extends Writable {
  append(data: string | Buffer | Readable, opts: { name: string }): this;
  finalize(): Promise<void>;
  abort(): void;
}

type ArchiverFactory = (
  format: string,
  opts?: { zlib?: { level: number } },
) => ZipArchiveLike;

type ArchiverModule =
  | ArchiverFactory
  | {
      default?: ArchiverFactory;
      ZipArchive?: new (opts?: { zlib?: { level: number } }) => ZipArchiveLike;
      Archiver?: new (
        format: string,
        opts?: { zlib?: { level: number } },
      ) => ZipArchiveLike;
    };

export function createZipArchive(opts?: { zlib?: { level: number } }): ZipArchiveLike {
  const mod = createRequire(import.meta.url)('archiver') as ArchiverModule;
  if (typeof mod === 'function') return mod('zip', opts);
  if (typeof mod.ZipArchive === 'function') return new mod.ZipArchive(opts);
  if (typeof mod.Archiver === 'function') return new mod.Archiver('zip', opts);
  if (typeof mod.default === 'function') return mod.default('zip', opts);
  throw new Error('Unsupported archiver module shape');
}
