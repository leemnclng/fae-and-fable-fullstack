import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AdminGuard } from './auth.js';
import { PUBLIC_DIR } from './content.js';
import { Db } from './db.js';
import { removeFile, uploadOptions } from './uploads.js';

/**
 * Past events: showcase posts the admin publishes for the public.
 * Deliberately separate from live events, which (with their guest/client access) are purged 15 days after the date.
 */
type ShowcaseRow = {
  id: number;
  title: string;
  event_date: string;
  location: string;
  description: string;
};
type PhotoRow = { id: number; showcase_id: number; file: string; sort: number };
type ShowcaseBody = Partial<
  Record<'title' | 'eventDate' | 'location' | 'description', string>
>;

const MAX_PHOTOS_PER_UPLOAD = 40;
const photoDto = (p: PhotoRow) => ({
  id: p.id,
  url: `/files/${p.file}`,
  isVideo: /\.(mp4|mov)$/.test(p.file),
});

function validDate(date: string | undefined) {
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date))
  ) {
    throw new BadRequestException('eventDate must be YYYY-MM-DD');
  }
  return date;
}

/** Multer has already written uploads to disk; drop them if the request is rejected. */
function cleanupOnError<T>(files: Express.Multer.File[], fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    for (const f of files) removeFile(f.path);
    throw e;
  }
}

@Controller()
export class ShowcasesController {
  constructor(private readonly db: Db) {}

  @Get('showcases')
  list() {
    const rows = this.db.sql
      .prepare('SELECT * FROM showcases ORDER BY event_date DESC, id DESC')
      .all() as ShowcaseRow[];
    return rows.map((row) => {
      const photos = this.photos(row.id);
      return {
        ...this.toDto(row),
        cover: photos.find((p) => !p.isVideo)?.url ?? null,
        photoCount: photos.length,
      };
    });
  }

  @Get('showcases/:id')
  get(@Param('id', ParseIntPipe) id: number) {
    return { ...this.toDto(this.find(id)), photos: this.photos(id) };
  }

  @Post('admin/showcases')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FilesInterceptor(
      'photos',
      MAX_PHOTOS_PER_UPLOAD,
      uploadOptions(() => PUBLIC_DIR, 20),
    ),
  )
  create(
    @Body() body: ShowcaseBody,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return cleanupOnError(files, () => {
      if (!body.title?.trim())
        throw new BadRequestException('title is required');
      const { lastInsertRowid } = this.db.sql
        .prepare(
          'INSERT INTO showcases (title, event_date, location, description) VALUES (?, ?, ?, ?)',
        )
        .run(
          body.title.trim(),
          validDate(body.eventDate),
          body.location?.trim() ?? '',
          body.description?.trim() ?? '',
        );
      const id = Number(lastInsertRowid);
      this.addPhotos(id, files);
      return this.get(id);
    });
  }

  /** Edits fields and appends any uploaded photos. */
  @Patch('admin/showcases/:id')
  @UseGuards(AdminGuard)
  @UseInterceptors(
    FilesInterceptor(
      'photos',
      MAX_PHOTOS_PER_UPLOAD,
      uploadOptions(() => PUBLIC_DIR, 20),
    ),
  )
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ShowcaseBody,
    @UploadedFiles() files: Express.Multer.File[] = [],
  ) {
    return cleanupOnError(files, () => {
      const current = this.find(id);
      this.db.sql
        .prepare(
          'UPDATE showcases SET title = ?, event_date = ?, location = ?, description = ? WHERE id = ?',
        )
        .run(
          body.title?.trim() || current.title,
          body.eventDate ? validDate(body.eventDate) : current.event_date,
          body.location?.trim() ?? current.location,
          body.description?.trim() ?? current.description,
          id,
        );
      this.addPhotos(id, files);
      return this.get(id);
    });
  }

  @Delete('admin/showcases/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    this.find(id);
    const files = this.db.sql
      .prepare('SELECT file FROM showcase_photos WHERE showcase_id = ?')
      .all(id) as { file: string }[];
    this.db.sql.prepare('DELETE FROM showcases WHERE id = ?').run(id);
    for (const { file } of files) removeFile(join(PUBLIC_DIR, file));
    return { ok: true };
  }

  @Delete('admin/showcases/:id/photos/:photoId')
  @UseGuards(AdminGuard)
  removePhoto(
    @Param('id', ParseIntPipe) id: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ) {
    const photo = this.db.sql
      .prepare('SELECT * FROM showcase_photos WHERE id = ? AND showcase_id = ?')
      .get(photoId, id) as PhotoRow | undefined;
    if (!photo) throw new NotFoundException();
    this.db.sql
      .prepare('DELETE FROM showcase_photos WHERE id = ?')
      .run(photoId);
    removeFile(join(PUBLIC_DIR, photo.file));
    return { ok: true };
  }

  private addPhotos(id: number, files: Express.Multer.File[]) {
    const { next } = this.db.sql
      .prepare(
        'SELECT COALESCE(MAX(sort), -1) + 1 AS next FROM showcase_photos WHERE showcase_id = ?',
      )
      .get(id) as { next: number };
    const insert = this.db.sql.prepare(
      'INSERT INTO showcase_photos (showcase_id, file, sort) VALUES (?, ?, ?)',
    );
    files.forEach((f, i) => insert.run(id, f.filename, next + i));
  }

  private photos(id: number) {
    const rows = this.db.sql
      .prepare(
        'SELECT * FROM showcase_photos WHERE showcase_id = ? ORDER BY sort, id',
      )
      .all(id) as PhotoRow[];
    return rows.map(photoDto);
  }

  private find(id: number) {
    const row = this.db.sql
      .prepare('SELECT * FROM showcases WHERE id = ?')
      .get(id) as ShowcaseRow | undefined;
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }

  private toDto(row: ShowcaseRow) {
    return {
      id: row.id,
      title: row.title,
      eventDate: row.event_date,
      location: row.location,
      description: row.description,
    };
  }
}
