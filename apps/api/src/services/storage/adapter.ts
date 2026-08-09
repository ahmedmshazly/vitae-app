/**
 * Storage abstraction (SRS INT-5, T5). The rest of the app talks to this
 * interface only, so Cloudinary can be swapped for R2 / Firebase Storage by
 * changing one binding. Uploads are content-addressed by SHA-256 for dedup
 * (FR-CAP-004); delivery is private with short-lived signed URLs.
 */
export interface StoredObject {
  key: string;
  url: string;
  bytes: number;
  mime: string;
  sha256: string;
  width?: number;
  height?: number;
}

export interface StorageAdapter {
  /** Upload raw bytes; returns a content-addressed stored object. */
  upload(input: {
    data: Buffer;
    filename: string;
    mime: string;
    sha256: string;
  }): Promise<StoredObject>;

  /** Stream raw bytes for backup/verification with consumer backpressure. */
  downloadStream(key: string, mime?: string): Promise<AsyncIterable<Uint8Array>>;

  /** Idempotently delete an object. */
  delete(key: string, mime?: string): Promise<void>;

  /** A time-limited signed GET URL for a stored key. */
  signedUrl(key: string, ttlSeconds?: number, mime?: string): Promise<string>;

  /** Whether the backend is configured/reachable (for /status). */
  healthy(): Promise<boolean>;
}
