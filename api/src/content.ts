import { BadRequestException, Body, Controller, Delete, Get, Inject, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from './auth.js';
import { cleanupFiles } from './catalog/files.js';
import { Pg } from './pg.js';
import { FILE_STORE, newKey, type FileStore } from './storage/file-store.js';
import { contentTypeOf, extOf, imageUpload } from './uploads.js';

// Catalog page JSON lives in settings too, but only the catalog endpoints may expose it.
export const HIDDEN_SETTINGS = ['catalogDraft', 'catalogPublished'];
const SETTING_KEYS = ['businessName', 'tagline', 'about', 'email', 'phone', 'instagram', 'location'];

@Controller()
export class ContentController {
  constructor(
    private readonly pg: Pg,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  /** Public site settings. `banner` is a file name in the public bucket. */
  @Get('content')
  async list() {
    return { settings: await this.settings() };
  }

  /** Homepage banner photo, kept in settings by file name; replaces any previous one. */
  @Put('admin/banner')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('image', imageUpload()))
  async saveBanner(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('image is required');
    const key = newKey(extOf(image));
    await this.store.put('public', key, image.buffer, contentTypeOf(image));
    await this.removeBanner();
    await this.pg.exec("INSERT INTO $s.settings (key, value) VALUES ('banner', ?)", [key]);
    return this.settings();
  }

  @Delete('admin/banner')
  @UseGuards(AdminGuard)
  async deleteBanner() {
    await this.removeBanner();
    return this.settings();
  }

  @Put('admin/settings')
  @UseGuards(AdminGuard)
  async saveSettings(@Body() body: Record<string, unknown>) {
    for (const key of SETTING_KEYS) {
      if (typeof body[key] !== 'string') continue;
      await this.pg.exec('INSERT INTO $s.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, body[key]]);
    }
    return this.settings();
  }

  private async settings() {
    const rows = await this.pg.query<{ key: string; value: string }>('SELECT key, value FROM $s.settings');
    return Object.fromEntries(rows.filter((r) => !HIDDEN_SETTINGS.includes(r.key)).map((r) => [r.key, r.value])) as Record<string, string>;
  }

  private async removeBanner() {
    const banner = (await this.settings()).banner;
    await this.pg.exec("DELETE FROM $s.settings WHERE key = 'banner'");
    // The catalog page may still show the old banner (its default slideshow uses it), so only delete it when unused
    if (banner) await cleanupFiles(this.pg, this.store, [banner]);
  }
}
