import type { Bucket, FileStore } from '../src/storage/file-store.js';

/** In-memory FileStore for tests only (not a STORAGE_DRIVER option). */
export class MemoryStore implements FileStore {
  private readonly files = new Map<string, { body: Buffer; contentType: string }>();

  has(bucket: Bucket, key: string) {
    return this.files.has(`${bucket}/${key}`);
  }

  /** Keys in a bucket starting with `prefix`. */
  keys(bucket: Bucket, prefix = '') {
    return [...this.files.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => k.slice(bucket.length + 1));
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    this.files.set(`${bucket}/${key}`, { body, contentType });
  }

  async remove(bucket: Bucket, keys: string[]) {
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
