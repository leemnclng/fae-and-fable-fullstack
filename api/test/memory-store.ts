import type { Bucket, FileStore } from '../src/storage/file-store.js';

/** In-memory FileStore for tests only (not a STORAGE_DRIVER option). */
export class MemoryStore implements FileStore {
  private readonly files = new Map<string, { body: Buffer; contentType: string }>();

  has(bucket: Bucket, key: string) {
    return this.files.has(`${bucket}/${key}`);
  }

  /** Content type a file was stored with. */
  contentType(bucket: Bucket, key: string) {
    return this.files.get(`${bucket}/${key}`)?.contentType;
  }

  /** Makes the next remove() call fail, to test that callers don't lose track of files. */
  failNextRemove = false;
  /** Real services cap bulk deletes (S3: 1000 keys); callers must stay under it. */
  maxRemoveBatch = 1000;

  /** Keys in a bucket starting with `prefix`. */
  keys(bucket: Bucket, prefix = '') {
    return [...this.files.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => k.slice(bucket.length + 1));
  }

  /** Real storage takes a while to accept a file; a delay lets tests overlap concurrent uploads. */
  putDelayMs = 0;

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    if (this.putDelayMs) await new Promise((r) => setTimeout(r, this.putDelayMs));
    this.files.set(`${bucket}/${key}`, { body, contentType });
  }

  async remove(bucket: Bucket, keys: string[]) {
    if (this.failNextRemove) {
      this.failNextRemove = false;
      throw new Error('storage unavailable');
    }
    if (keys.length > this.maxRemoveBatch) throw new Error(`remove() called with ${keys.length} keys; the cap is ${this.maxRemoveBatch}`);
    for (const key of keys) this.files.delete(`${bucket}/${key}`);
  }

  publicUrl(key: string) {
    return `memory://public/${key}`;
  }

  async signedUrl(key: string, { download }: { expiresIn?: number; download?: string } = {}) {
    return `memory://private/${key}${download ? `?download=${encodeURIComponent(download)}` : ''}`;
  }

  async ensureBuckets() {}
}
