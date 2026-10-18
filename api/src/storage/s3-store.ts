import { DeleteObjectsCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { StorageConfig } from '../config.js';
import type { Bucket, FileStore } from './file-store.js';

/**
 * Any S3-compatible service (AWS S3, Cloudflare R2, MinIO). Buckets are provisioned outside the app;
 * the public bucket must allow public reads (or sit behind S3_PUBLIC_URL, e.g. a CDN or R2 public domain).
 */
export class S3Store implements FileStore {
  private readonly client: S3Client;
  private readonly buckets: Record<Bucket, string>;

  constructor(private readonly cfg: StorageConfig) {
    const { endpoint, region, accessKeyId, secretAccessKey } = cfg.s3;
    this.client = new S3Client({
      region: region || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle: !!endpoint, // MinIO and most self-hosted endpoints need path-style URLs
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
    });
    this.buckets = { public: cfg.s3.publicBucket || cfg.publicBucket, private: cfg.s3.privateBucket || cfg.privateBucket };
  }

  async put(bucket: Bucket, key: string, body: Buffer, contentType: string) {
    await this.client.send(new PutObjectCommand({ Bucket: this.buckets[bucket], Key: key, Body: body, ContentType: contentType }));
  }

  async remove(bucket: Bucket, keys: string[]) {
    if (!keys.length) return;
    await this.client.send(new DeleteObjectsCommand({ Bucket: this.buckets[bucket], Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }));
  }

  publicUrl(key: string) {
    const { publicUrl, endpoint, region } = this.cfg.s3;
    if (publicUrl) return `${publicUrl.replace(/\/$/, '')}/${key}`;
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${this.buckets.public}/${key}`;
    return `https://${this.buckets.public}.s3.${region}.amazonaws.com/${key}`;
  }

  signedUrl(key: string, { expiresIn = 600, download }: { expiresIn?: number; download?: string } = {}) {
    const command = new GetObjectCommand({
      Bucket: this.buckets.private,
      Key: key,
      ResponseContentDisposition: download ? `attachment; filename="${download.replace(/"/g, '')}"` : undefined,
    });
    return getSignedUrl(this.client, command, { expiresIn });
  }

  async ensureBuckets() {
    // Provisioned outside the app (IaC or the provider's console)
  }
}
