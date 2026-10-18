import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';

// Whitelisted by extension so nothing executable (html, svg) is ever stored or served back. Photos only: no videos.
export const IMAGES_ONLY = /^\.(jpe?g|png|webp|gif|heic|heif)$/;

/** Browsers resize photos before upload (≤2560 px JPEG), so anything bigger than this is refused. Also keeps requests under Vercel's ~4.5 MB body limit. */
export const MAX_UPLOAD_MB = 4;

/** Multer options for one or more images held in memory, ready to hand to the FileStore. */
export function imageUpload() {
  return {
    storage: memoryStorage(),
    fileFilter: (_req: Request, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
      const ok = IMAGES_ONLY.test(extname(file.originalname).toLowerCase());
      cb(ok ? null : new BadRequestException(`Only photos can be uploaded: ${file.originalname}`), ok);
    },
    limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  };
}

/** Lower-cased extension of an uploaded file's original name, e.g. ".jpg". */
export const extOf = (file: Express.Multer.File) => extname(file.originalname).toLowerCase();

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

/** Content type to store, from the (allow-listed) extension. Never the client's claim, which could say text/html. */
export const contentTypeOf = (file: Express.Multer.File) => MIME[extOf(file)] ?? 'application/octet-stream';
