import { join } from 'node:path';
import { PUBLIC_DIR } from '../content.js';
import type { Db } from '../db.js';
import { removeFile } from '../uploads.js';
import { filesInPage, IMAGE_NAME, type Section } from './sections.js';

/** Every public upload still in use: both catalog page versions, every product version, the banner and showcase photos. */
function usedFiles(db: Db): Set<string> {
  const used = new Set<string>();
  const settings = db.sql
    .prepare("SELECT key, value FROM settings WHERE key IN ('catalogDraft', 'catalogPublished', 'banner')")
    .all() as { key: string; value: string }[];
  for (const { key, value } of settings) {
    if (key === 'banner') used.add(value);
    else filesInPage(JSON.parse(value) as Section[]).forEach((f) => used.add(f));
  }
  const products = db.sql.prepare('SELECT draft, published FROM products').all() as { draft: string; published: string | null }[];
  for (const p of products) {
    for (const version of [p.draft, p.published]) {
      if (version) (JSON.parse(version) as { photos: string[] }).photos.forEach((f) => used.add(f));
    }
  }
  for (const { file } of db.sql.prepare('SELECT file FROM showcase_photos').all() as { file: string }[]) used.add(file);
  return used;
}

/** Deletes the candidate uploads nothing refers to any more. Call after the change that dropped them is saved. */
export function cleanupFiles(db: Db, candidates: string[]) {
  const used = usedFiles(db);
  for (const file of new Set(candidates)) {
    if (IMAGE_NAME.test(file) && !used.has(file)) removeFile(join(PUBLIC_DIR, file));
  }
}
