import { randomUUID } from 'node:crypto';

/**
 * Where uploads live. `public` holds files linked directly on the site (catalog, showcases, banner, guest-page backgrounds);
 * `private` holds guest event photos, reachable only through short-lived signed URLs after the API's access checks.
 */
export type Bucket = 'public' | 'private';

export interface FileStore {
  put(bucket: Bucket, key: string, body: Buffer, contentType: string): Promise<void>;
  /** Missing keys are not an error; an empty list does nothing. */
  remove(bucket: Bucket, keys: string[]): Promise<void>;
  /** Direct link to a file in the public bucket. */
  publicUrl(key: string): string;
  /** Short-lived link to a private file; `download` makes browsers save it under that name. Default lifetime 600 s. */
  signedUrl(key: string, opts?: { expiresIn?: number; download?: string }): Promise<string>;
  /** Creates the buckets if the driver can (Supabase); a no-op where buckets are provisioned outside the app (S3). */
  ensureBuckets(): Promise<void>;
}

export const FILE_STORE = Symbol('FILE_STORE');

/** A fresh, unguessable object name keeping the upload's (lower-cased) extension. */
export const newKey = (ext: string) => `${randomUUID()}${ext.toLowerCase()}`;
