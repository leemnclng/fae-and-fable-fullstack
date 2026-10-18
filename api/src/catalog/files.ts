import type { Pg } from '../pg.js';
import type { FileStore } from '../storage/file-store.js';
import { filesInPage, IMAGE_NAME, type Section } from './sections.js';

/** Every public upload the catalog and settings still use: both catalog page versions, every product version, and the banner. */
async function usedFiles(pg: Pg): Promise<Set<string>> {
  const used = new Set<string>();
  const settings = await pg.query<{ key: string; value: string }>(
    "SELECT key, value FROM $s.settings WHERE key IN ('catalogDraft', 'catalogPublished', 'banner')",
  );
  for (const { key, value } of settings) {
    if (key === 'banner') used.add(value);
    else filesInPage(JSON.parse(value) as Section[]).forEach((f) => used.add(f));
  }
  const products = await pg.query<{ draft: { photos: string[] }; published: { photos: string[] } | null }>('SELECT draft, published FROM $s.products');
  for (const p of products) for (const version of [p.draft, p.published]) version?.photos.forEach((f) => used.add(f));
  return used;
}

/** Deletes the candidate uploads nothing refers to any more. Call after the change that dropped them is saved. */
export async function cleanupFiles(pg: Pg, store: FileStore, candidates: string[]) {
  const used = await usedFiles(pg);
  await store.remove('public', [...new Set(candidates)].filter((f) => IMAGE_NAME.test(f) && !used.has(f)));
}
