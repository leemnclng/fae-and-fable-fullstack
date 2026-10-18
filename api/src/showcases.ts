import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from './auth.js';
import { Pg } from './pg.js';
import { FILE_STORE, newKey, type FileStore } from './storage/file-store.js';
import { extOf, imageUpload } from './uploads.js';

/**
 * Past events: showcase posts the admin publishes for the public.
 * Deliberately separate from live events, which (with their guest/client access) expire 15 days after the date.
 * Photos only, uploaded one per request (browsers resize them first); `file` names live in the public bucket.
 */
type ShowcaseRow = { id: number; title: string; event_date: string; location: string; description: string };
type PhotoRow = { id: number; showcase_id: number; file: string; sort: number };
type ShowcaseBody = Partial<Record<'title' | 'eventDate' | 'location' | 'description', string>>;

const photoDto = (p: PhotoRow) => ({ id: p.id, file: p.file });

function validDate(date: string | undefined) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    throw new BadRequestException('eventDate must be YYYY-MM-DD');
  }
  return date;
}

@Controller()
export class ShowcasesController {
  constructor(
    private readonly pg: Pg,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get('showcases')
  async list() {
    const rows = await this.pg.query<ShowcaseRow>('SELECT * FROM $s.showcases ORDER BY event_date DESC, id DESC');
    return Promise.all(
      rows.map(async (row) => {
        const photos = await this.photos(row.id);
        return { ...this.toDto(row), cover: photos[0]?.file ?? null, photoCount: photos.length };
      }),
    );
  }

  @Get('showcases/:id')
  async get(@Param('id', ParseIntPipe) id: number) {
    return { ...this.toDto(await this.find(id)), photos: await this.photos(id) };
  }

  @Post('admin/showcases')
  @UseGuards(AdminGuard)
  async create(@Body() body: ShowcaseBody) {
    if (!body.title?.trim()) throw new BadRequestException('title is required');
    const { rows } = await this.pg.exec('INSERT INTO $s.showcases (title, event_date, location, description) VALUES (?, ?, ?, ?) RETURNING id', [
      body.title.trim(),
      validDate(body.eventDate),
      body.location?.trim() ?? '',
      body.description?.trim() ?? '',
    ]);
    return this.get(rows[0].id);
  }

  @Patch('admin/showcases/:id')
  @UseGuards(AdminGuard)
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: ShowcaseBody) {
    const current = await this.find(id);
    await this.pg.exec('UPDATE $s.showcases SET title = ?, event_date = ?, location = ?, description = ? WHERE id = ?', [
      body.title?.trim() || current.title,
      body.eventDate ? validDate(body.eventDate) : current.event_date,
      body.location?.trim() ?? current.location,
      body.description?.trim() ?? current.description,
      id,
    ]);
    return this.get(id);
  }

  /** Adds one photo to the end of the showcase. */
  @Post('admin/showcases/:id/photos')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('photo', imageUpload()))
  async addPhoto(@Param('id', ParseIntPipe) id: number, @UploadedFile() photo?: Express.Multer.File) {
    await this.find(id);
    if (!photo) throw new BadRequestException('photo is required');
    const file = newKey(extOf(photo));
    await this.store.put('public', file, photo.buffer, photo.mimetype);
    await this.pg.exec(
      'INSERT INTO $s.showcase_photos (showcase_id, file, sort) VALUES (?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM $s.showcase_photos WHERE showcase_id = ?))',
      [id, file, id],
    );
    return this.get(id);
  }

  @Delete('admin/showcases/:id')
  @UseGuards(AdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.find(id);
    const files = await this.pg.query<{ file: string }>('SELECT file FROM $s.showcase_photos WHERE showcase_id = ?', [id]);
    await this.pg.exec('DELETE FROM $s.showcases WHERE id = ?', [id]);
    await this.store.remove('public', files.map((f) => f.file));
    return { ok: true };
  }

  @Delete('admin/showcases/:id/photos/:photoId')
  @UseGuards(AdminGuard)
  async removePhoto(@Param('id', ParseIntPipe) id: number, @Param('photoId', ParseIntPipe) photoId: number) {
    const photo = await this.pg.one<PhotoRow>('SELECT * FROM $s.showcase_photos WHERE id = ? AND showcase_id = ?', [photoId, id]);
    if (!photo) throw new NotFoundException();
    await this.pg.exec('DELETE FROM $s.showcase_photos WHERE id = ?', [photoId]);
    await this.store.remove('public', [photo.file]);
    return { ok: true };
  }

  private async photos(id: number) {
    return (await this.pg.query<PhotoRow>('SELECT * FROM $s.showcase_photos WHERE showcase_id = ? ORDER BY sort, id', [id])).map(photoDto);
  }

  private async find(id: number) {
    const row = await this.pg.one<ShowcaseRow>('SELECT * FROM $s.showcases WHERE id = ?', [id]);
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }

  private toDto(row: ShowcaseRow) {
    return { id: row.id, title: row.title, eventDate: row.event_date, location: row.location, description: row.description };
  }
}
