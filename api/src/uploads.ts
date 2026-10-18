import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { extname } from 'node:path';

// Whitelisted by extension so nothing executable (html, svg) is ever served back.
const ALLOWED = /^\.(jpe?g|png|webp|gif|heic|heif|mp4|mov)$/;
export const IMAGES_ONLY = /^\.(jpe?g|png|webp|gif|heic|heif)$/;

export function uploadOptions(dir: (req: Request) => string, maxMb: number, allowed = ALLOWED) {
  return {
    storage: diskStorage({
      destination: (req, _file, cb) => {
        const target = dir(req);
        mkdirSync(target, { recursive: true });
        cb(null, target);
      },
      filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
    }),
    fileFilter: (_req: Request, file: Express.Multer.File, cb: (e: Error | null, ok: boolean) => void) => {
      const ok = allowed.test(extname(file.originalname).toLowerCase());
      cb(ok ? null : new BadRequestException(`File type not allowed: ${file.originalname}`), ok);
    },
    limits: { fileSize: maxMb * 1024 * 1024 },
  };
}

export function removeFile(path: string) {
  rmSync(path, { force: true, recursive: true });
}
