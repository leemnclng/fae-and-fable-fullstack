import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StorageConfig } from '../config.js';
import type { Bucket, FileStore } from './file-store.js';

/** Supabase Storage. Uses the service-role key, so it must only ever run inside the API. */
export class SupabaseStore implements FileStore {
  private readonly client: SupabaseClient;
  private readonly buckets: Record<Bucket, string>;

  constructor(private readonly cfg: StorageConfig) {
    if (!cfg.supabaseUrl || !cfg.serviceRoleKey) throw new Error('STORAGE_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    this.client = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
    this.buckets = { public: cfg.publicBucket, private: cfg.privateBucket };
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    const { error } = await this.client.storage.from(this.buckets[bucket]).upload(key, body, { contentType, upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
  }

  async remove(bucket: Bucket, keys: string[]) {
    if (!keys.length) return;
    const { error } = await this.client.storage.from(this.buckets[bucket]).remove(keys);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  }

  publicUrl(key: string) {
    return this.client.storage.from(this.buckets.public).getPublicUrl(key).data.publicUrl;
  }

  async signedUrl(key: string, { expiresIn = 600, download }: { expiresIn?: number; download?: string } = {}) {
    const { data, error } = await this.client.storage.from(this.buckets.private).createSignedUrl(key, expiresIn, download ? { download } : undefined);
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`);
    return data.signedUrl;
  }

  async ensureBuckets() {
    const { data, error } = await this.client.storage.listBuckets();
    if (error) throw new Error(`Listing buckets failed: ${error.message}`);
    const existing = new Set(data.map((b) => b.name));
    for (const [kind, name] of Object.entries(this.buckets) as [Bucket, string][]) {
      if (existing.has(name)) continue;
      const { error: createError } = await this.client.storage.createBucket(name, { public: kind === 'public' });
      if (createError) throw new Error(`Creating bucket ${name} failed: ${createError.message}`);
    }
  }
}
