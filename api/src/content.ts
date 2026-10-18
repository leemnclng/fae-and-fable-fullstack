import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AdminGuard } from './auth.js';
import { config } from './config.js';
import { Db } from './db.js';
import { cleanupFiles } from './catalog/files.js';
import { IMAGES_ONLY, uploadOptions } from './uploads.js';

export const PUBLIC_DIR = join(config.uploadsDir, 'public');
// Catalog page JSON lives in settings too, but only the catalog endpoints may expose it.
export const HIDDEN_SETTINGS = ['catalogDraft', 'catalogPublished'];
const SETTING_KEYS = ['businessName', 'tagline', 'about', 'email', 'phone', 'instagram', 'location'];

@Controller()
export class ContentController {
  constructor(private readonly db: Db) {}

  @Get('content')
  list() {
    const settings = this.settings();
    if (settings.banner) settings.banner = `/files/${settings.banner}`;
    return { settings };
  }

  /** Homepage banner photo, kept in settings by file name; replaces any previous one. */
  @Put('admin/banner')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('image', uploadOptions(() => PUBLIC_DIR, 15, IMAGES_ONLY)))
  saveBanner(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('image is required');
    this.removeBanner();
    this.db.sql.prepare("INSERT INTO settings (key, value) VALUES ('banner', ?)").run(image.filename);
    return this.list().settings;
  }

  @Delete('admin/banner')
  @UseGuards(AdminGuard)
  deleteBanner() {
    this.removeBanner();
    return this.list().settings;
  }

  private settings() {
    const rows = this.db.sql.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    return Object.fromEntries(rows.filter((r) => !HIDDEN_SETTINGS.includes(r.key)).map((r) => [r.key, r.value])) as Record<string, string>;
  }

  private removeBanner() {
    const banner = this.settings().banner;
    this.db.sql.prepare("DELETE FROM settings WHERE key = 'banner'").run();
    // The catalog page may still show the old banner (its default slideshow uses it), so only delete it when unused
    if (banner) cleanupFiles(this.db, [banner]);
  }

  @Put('admin/settings')
  @UseGuards(AdminGuard)
  saveSettings(@Body() body: Record<string, unknown>) {
    const upsert = this.db.sql.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );
    for (const key of SETTING_KEYS) if (typeof body[key] === 'string') upsert.run(key, body[key]);
    return this.list().settings;
  }
}
