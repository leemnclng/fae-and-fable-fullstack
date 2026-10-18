import { randomBytes } from 'node:crypto';
import { MemoryStore } from '../../test/memory-store.js';
import { config } from '../config.js';
import { newKey, removeInBatches, type FileStore } from './file-store.js';
import { S3Store } from './s3-store.js';
import { SupabaseStore } from './supabase-store.js';

// The same contract for every driver. Real drivers run only when their credentials are configured.
const drivers: [string, () => FileStore, boolean][] = [
  ['memory', () => new MemoryStore(), false],
  ['supabase', () => new SupabaseStore(config.storage), !!config.storage.supabaseUrl],
  ['s3', () => new S3Store(config.storage), !!config.storage.s3.endpoint || !!config.storage.s3.region],
];

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const status = async (url: string) => (await fetch(url)).status;

describe.each(drivers)('%s store', (name, make, real) => {
  const enabled = name === 'memory' || real;
  const store = enabled ? make() : (null as unknown as FileStore);
  const prefix = `test/${randomBytes(4).toString('hex')}/`;
  const made: [('public' | 'private'), string][] = [];

  beforeAll(async () => enabled && (await store.ensureBuckets()));
  afterAll(async () => {
    if (!enabled) return;
    await store.remove('public', made.filter(([b]) => b === 'public').map(([, k]) => k));
    await store.remove('private', made.filter(([b]) => b === 'private').map(([, k]) => k));
  });

  it.runIf(enabled)('serves public files at their public URL and stops after remove', async () => {
    const key = prefix + newKey('.JPG');
    expect(key).toMatch(/\.jpg$/);
    await store.put('public', key, JPEG, 'image/jpeg');
    made.push(['public', key]);
    const url = store.publicUrl(key);
    expect(url.endsWith(`/${key}`)).toBe(true);
    if (real) expect(await status(url)).toBe(200);
    await store.remove('public', [key]);
    if (real) expect(await status(url)).not.toBe(200);
  });

  it.runIf(enabled)('serves private files only through signed URLs', async () => {
    const key = prefix + newKey('.jpg');
    await store.put('private', key, JPEG, 'image/jpeg');
    made.push(['private', key]);
    const signed = await store.signedUrl(key, { expiresIn: 60, download: 'party.jpg' });
    expect(signed).toContain(key);
    if (real) {
      expect(await status(signed)).toBe(200);
      expect(await status(store.publicUrl(key).replace(config.storage.publicBucket, config.storage.privateBucket))).not.toBe(200);
    }
  });

  it.runIf(enabled)('treats empty and missing removals as no-ops', async () => {
    await expect(store.remove('public', [])).resolves.toBeUndefined();
    await expect(store.remove('private', [prefix + 'never-uploaded.jpg'])).resolves.toBeUndefined();
  });
});

it('removes large sets of files in batches under the service cap', async () => {
  const store = new MemoryStore();
  store.maxRemoveBatch = 2;
  const keys = ['a', 'b', 'c', 'd', 'e'].map((k) => `${k}.jpg`);
  for (const k of keys) await store.put('private', k, JPEG, 'image/jpeg');
  await expect(store.remove('private', keys)).rejects.toThrow(/cap/);
  await removeInBatches(store, 'private', keys, 2);
  expect(keys.some((k) => store.has('private', k))).toBe(false);
});
