import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  GoneException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Put,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomInt } from 'node:crypto';
import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';
import { AdminGuard, bearer, safeEqual, TokenPayload } from './auth.js';
import { config } from './config.js';
import { Db } from './db.js';
import { IMAGES_ONLY, removeFile, uploadOptions } from './uploads.js';

const EVENTS_DIR = join(config.uploadsDir, 'events');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I so codes are easy to read off a sign

export function randomCode(length: number, alphabet = ALPHABET) {
  return Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join('');
}

/** Links stay open through the 15th full day after the event (UTC). */
export function expiresAt(eventDate: string, retentionDays = config.retentionDays) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) {
    throw new BadRequestException('eventDate must be YYYY-MM-DD');
  }
  const d = new Date(`${eventDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + retentionDays + 1);
  return d.toISOString();
}

export type EventRow = {
  id: number;
  name: string;
  client_name: string;
  client_email: string | null;
  event_date: string;
  expires_at: string;
  slug: string;
  passcode: string;
  client_token: string;
  is_public: number;
  client_code: string | null;
  design: string | null;
  created_at: string;
};
/** Admin-editable look of the guest upload page, stored as JSON on the event. */
type Design = { photoLimit?: number; title?: string; dateText?: string; hideDate?: boolean; message?: string; uploadMessage?: string; thanks?: string; color?: string; background?: string; showWall?: boolean; panel?: Panel;
  /** Guests' notes show beside their photos on the wall. */
  showMessages?: boolean;
  /** Legacy form of showMessages (it once limited notes to newer ones); still means "on". */
  notesAfterId?: number };
const PANELS = ['glass', 'soft', 'solid', 'tint'] as const;
type Panel = (typeof PANELS)[number];

const parseDesign = (row: EventRow): Design => (row.design ? (JSON.parse(row.design) as Design) : {});
const notesOn = (d: Design) => d.showMessages === true || d.notesAfterId !== undefined;

export function designDto(row: EventRow) {
  const design = parseDesign(row);
  const { background, notesAfterId: _legacy, showMessages: _on, ...text } = design;
  // filename in the query string busts browser caches when the background changes
  return { ...text, ...(notesOn(design) && { showMessages: true }), background: background ? `/guest/${row.slug}/background?v=${background}` : null };
}

const DESIGN_LIMITS = { title: 80, dateText: 80, message: 600, uploadMessage: 600, thanks: 300 } as const;

type PhotoRow = { id: number; event_id: number; file: string; message_id: number | null; guest_name: string | null; created_at: string };

/** Photos one guest (by name) may share per event when the admin hasn't set a limit. */
export const DEFAULT_PHOTO_LIMIT = 30;
const limitOf = (row: EventRow) => {
  const limit = parseDesign(row).photoLimit ?? DEFAULT_PHOTO_LIMIT;
  return limit > 0 ? limit : null; // 0 = unlimited
};
type GuestRequest = Request & { guestName?: string };
type MessageRow = { id: number; event_id: number; name: string; body: string; created_at: string };
const isVideo = (file: string) => /\.(mp4|mov)$/.test(file);

@Injectable()
export class EventsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private readonly db: Db) {}

  onModuleInit() {
    // Backfill client codes for events created before the /events lookup existed
    const missing = this.db.sql.prepare('SELECT id FROM events WHERE client_code IS NULL').all() as { id: number }[];
    for (const { id } of missing) this.db.sql.prepare('UPDATE events SET client_code = ? WHERE id = ?').run(randomCode(6), id);
    this.purgeExpired();
    this.timer = setInterval(() => this.purgeExpired(), 60 * 60 * 1000);
    this.timer.unref();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  purgeExpired(now = new Date()) {
    const expired = this.db.sql
      .prepare('SELECT * FROM events WHERE expires_at <= ?')
      .all(now.toISOString()) as EventRow[];
    for (const event of expired) this.remove(event);
    return expired.length;
  }

  remove(event: EventRow) {
    this.db.sql.prepare('DELETE FROM events WHERE id = ?').run(event.id);
    removeFile(join(EVENTS_DIR, event.slug));
  }

  /** Finds a live event; expired ones are gone even if the hourly purge hasn't run yet. */
  active(column: 'id' | 'slug' | 'client_token', value: string | number) {
    const event = this.db.sql.prepare(`SELECT * FROM events WHERE ${column} = ?`).get(value) as EventRow | undefined;
    if (!event) throw new NotFoundException('Link not found');
    if (event.expires_at <= new Date().toISOString()) throw new GoneException('This link has expired');
    return event;
  }

  /** Latest still photo, used as a public cover; videos can't render in an <img>. */
  coverPhoto(eventId: number) {
    return this.db.sql
      .prepare("SELECT * FROM photos WHERE event_id = ? AND file NOT LIKE '%.mp4' AND file NOT LIKE '%.mov' ORDER BY id DESC LIMIT 1")
      .get(eventId) as PhotoRow | undefined;
  }

  /** How many photos this guest name has shared, case-insensitively, against the event's limit. */
  quota(event: EventRow, name: string) {
    const { n } = this.db.sql
      .prepare('SELECT COUNT(*) AS n FROM photos WHERE event_id = ? AND lower(guest_name) = lower(?)')
      .get(event.id, name) as { n: number };
    return { name, uploaded: n, limit: limitOf(event) };
  }

  messages(eventId: number) {
    return this.db.sql.prepare('SELECT * FROM messages WHERE event_id = ? ORDER BY id DESC').all(eventId) as MessageRow[];
  }

  photos(eventId: number) {
    return this.db.sql.prepare('SELECT * FROM photos WHERE event_id = ? ORDER BY id DESC').all(eventId) as PhotoRow[];
  }
}

@Injectable()
export class GuestGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly events: EventsService,
  ) {}

  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const event = this.events.active('slug', String(req.params.slug));
    const token = bearer(req, this.jwt);
    // Tokens from before names were required have no name: send those guests back to the passcode step
    if (token?.scope === 'guest' && token.eventId === event.id && token.name) {
      (req as GuestRequest).guestName = token.name;
      return true;
    }
    throw new UnauthorizedException('Enter your name and the event passcode first');
  }
}

@Controller('admin/events')
@UseGuards(AdminGuard)
export class AdminEventsController {
  constructor(
    private readonly db: Db,
    private readonly events: EventsService,
  ) {}

  @Get()
  async list() {
    const rows = this.db.sql
      .prepare(
        `SELECT e.*, COUNT(p.id) AS photo_count FROM events e LEFT JOIN photos p ON p.event_id = e.id
         GROUP BY e.id ORDER BY e.event_date DESC`,
      )
      .all() as (EventRow & { photo_count: number })[];
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  @Post()
  create(
    @Body()
    body: { name?: string; clientName?: string; clientEmail?: string; eventDate?: string; passcode?: string; isPublic?: boolean | string },
  ) {
    if (!body.name?.trim() || !body.clientName?.trim()) throw new BadRequestException('name and clientName are required');
    const passcode = body.passcode?.trim() || randomCode(6);
    if (passcode.length < 4) throw new BadRequestException('passcode must be at least 4 characters');
    const { lastInsertRowid } = this.db.sql
      .prepare(
        `INSERT INTO events (name, client_name, client_email, event_date, expires_at, slug, passcode, client_token, client_code, is_public)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        body.name.trim(),
        body.clientName.trim(),
        body.clientEmail?.trim() || null,
        String(body.eventDate),
        expiresAt(String(body.eventDate)),
        randomCode(8, 'abcdefghjkmnpqrstuvwxyz23456789'),
        passcode,
        randomCode(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
        randomCode(6),
        body.isPublic === true || body.isPublic === 'true' ? 1 : 0,
      );
    const row = this.db.sql.prepare('SELECT * FROM events WHERE id = ?').get(Number(lastInsertRowid)) as EventRow;
    return this.toDto({ ...row, photo_count: 0 });
  }

  /** Updates listing and/or reschedules; a new date moves the 15-day expiry with it. */
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: { isPublic?: boolean; eventDate?: string }) {
    if (body.isPublic === undefined && body.eventDate === undefined) throw new BadRequestException('Nothing to update');
    if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') throw new BadRequestException('isPublic must be true or false');
    const event = this.db.sql.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
    if (!event) throw new NotFoundException();
    let expires = event.expires_at;
    if (body.eventDate !== undefined) {
      expires = expiresAt(String(body.eventDate));
      // The hourly purge would delete everything for an already-expired date, so refuse instead
      if (expires <= new Date().toISOString()) {
        throw new BadRequestException(`That date is more than ${config.retentionDays} days ago, so the event and its photos would be deleted right away`);
      }
    }
    this.db.sql
      .prepare('UPDATE events SET is_public = ?, event_date = ?, expires_at = ? WHERE id = ?')
      .run(body.isPublic === undefined ? event.is_public : body.isPublic ? 1 : 0, body.eventDate ?? event.event_date, expires, id);
    return { ok: true };
  }

  /** Saves the guest page design; an optional `background` image replaces the current one. */
  @Put(':id/design')
  @UseInterceptors(FileInterceptor('background', uploadOptions(() => join(EVENTS_DIR, '_incoming'), 15)))
  saveDesign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Record<'photoLimit' | 'title' | 'dateText' | 'hideDate' | 'message' | 'uploadMessage' | 'thanks' | 'color' | 'removeBackground' | 'showWall' | 'panel' | 'showMessages', string>>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    try {
      const event = this.db.sql.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
      if (!event) throw new NotFoundException();
      if (file && /\.(mp4|mov)$/.test(file.filename)) throw new BadRequestException('Background must be an image');
      const color = body.color?.trim() || undefined;
      if (color && !/^#[0-9a-f]{6}$/i.test(color)) throw new BadRequestException('color must look like #e0457b');
      const design = parseDesign(event);
      for (const key of Object.keys(DESIGN_LIMITS) as (keyof typeof DESIGN_LIMITS)[]) {
        const value = body[key]?.trim();
        if (value && value.length > DESIGN_LIMITS[key]) throw new BadRequestException(`${key} must be at most ${DESIGN_LIMITS[key]} characters`);
        design[key] = value || undefined;
      }
      design.color = color;
      if (body.panel && !PANELS.includes(body.panel as Panel)) throw new BadRequestException(`panel must be one of ${PANELS.join(', ')}`);
      // Glass is the default look
      design.panel = body.panel && body.panel !== 'glass' ? (body.panel as Panel) : undefined;
      // Wall is on unless explicitly switched off
      design.showWall = body.showWall === 'false' ? false : undefined;
      design.hideDate = body.hideDate === 'true' ? true : undefined;
      design.showMessages = body.showMessages === 'true' ? true : undefined;
      design.notesAfterId = undefined;
      if (body.photoLimit !== undefined && body.photoLimit !== '') {
        const limit = Number(body.photoLimit);
        if (!Number.isInteger(limit) || limit < 0 || limit > 1000) throw new BadRequestException('photoLimit must be a whole number from 0 to 1000');
        design.photoLimit = limit;
      } else {
        design.photoLimit = undefined;
      }
      const eventDir = join(EVENTS_DIR, event.slug);
      if ((file || body.removeBackground === 'true') && design.background) {
        removeFile(join(eventDir, design.background));
        design.background = undefined;
      }
      if (file) {
        // Move into the event's folder so the purge after 15 days deletes it with the photos
        mkdirSync(eventDir, { recursive: true });
        renameSync(file.path, join(eventDir, file.filename));
        design.background = file.filename;
      }
      this.db.sql.prepare('UPDATE events SET design = ? WHERE id = ?').run(JSON.stringify(design), id);
      return designDto({ ...event, design: JSON.stringify(design) });
    } catch (e) {
      if (file) removeFile(file.path);
      throw e;
    }
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    const event = this.db.sql.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
    if (!event) throw new NotFoundException();
    this.events.remove(event);
    return { ok: true };
  }

  private async toDto(row: EventRow & { photo_count: number }) {
    const guestUrl = `${config.webUrl}/e/${row.slug}`;
    return {
      id: row.id,
      name: row.name,
      clientName: row.client_name,
      clientEmail: row.client_email,
      eventDate: row.event_date,
      expiresAt: row.expires_at,
      passcode: row.passcode,
      clientCode: row.client_code,
      design: designDto(row),
      isPublic: !!row.is_public,
      photoCount: row.photo_count,
      guestUrl,
      clientUrl: `${config.webUrl}/c/${row.client_token}`,
      qr: await QRCode.toDataURL(guestUrl, { width: 600, margin: 2 }),
    };
  }
}

@Controller('guest/:slug')
export class GuestController {
  constructor(
    private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly events: EventsService,
  ) {}

  @Get()
  info(@Param('slug') slug: string) {
    const event = this.events.active('slug', slug);
    return { name: event.name, eventDate: event.event_date, design: designDto(event) };
  }

  @Get('background')
  background(@Param('slug') slug: string, @Res() res: Response) {
    const event = this.events.active('slug', slug);
    const file = parseDesign(event).background;
    if (!file) throw new NotFoundException();
    res.sendFile(file, { root: join(EVENTS_DIR, event.slug), maxAge: '7d' });
  }

  @Post('unlock')
  unlock(@Param('slug') slug: string, @Body() body: { passcode?: string; name?: string }) {
    const event = this.events.active('slug', slug);
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Please enter your name');
    if (name.length > 60) throw new BadRequestException('Name must be at most 60 characters');
    if (!safeEqual(String(body.passcode ?? '').trim().toUpperCase(), event.passcode.toUpperCase())) {
      throw new UnauthorizedException('Wrong passcode');
    }
    const payload: TokenPayload = { scope: 'guest', eventId: event.id, name };
    const ttl = Math.max(60, Math.floor((Date.parse(event.expires_at) - Date.now()) / 1000));
    return { token: this.jwt.sign(payload, { expiresIn: ttl }), ...this.events.quota(event, name) };
  }

  /** The signed-in guest's name and remaining photo allowance. */
  @Get('me')
  @UseGuards(GuestGuard)
  me(@Param('slug') slug: string, @Req() req: GuestRequest) {
    return this.events.quota(this.events.active('slug', slug), req.guestName!);
  }

  @Post('photos')
  @UseGuards(GuestGuard)
  @UseInterceptors(FilesInterceptor('photos', 20, uploadOptions((req) => join(EVENTS_DIR, String(req.params.slug)), 50, IMAGES_ONLY)))
  upload(
    @Param('slug') slug: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { messageId?: string },
    @Req() req: GuestRequest,
  ) {
    if (!files?.length) throw new BadRequestException('No photos received');
    const event = this.events.active('slug', slug);
    const quota = this.events.quota(event, req.guestName!);
    if (quota.limit !== null && quota.uploaded + files.length > quota.limit) {
      for (const f of files) removeFile(f.path);
      const left = Math.max(0, quota.limit - quota.uploaded);
      throw new BadRequestException(
        left
          ? `You can share ${left} more ${left === 1 ? 'photo' : 'photos'} at this event.`
          : `You've shared the maximum of ${quota.limit} photos for this event. Thank you!`,
      );
    }
    let messageId: number | null = null;
    if (body.messageId) {
      messageId = Number(body.messageId);
      const owned = this.db.sql.prepare('SELECT 1 FROM messages WHERE id = ? AND event_id = ?').get(messageId, event.id);
      if (!owned) {
        for (const f of files) removeFile(f.path);
        throw new BadRequestException('Unknown message');
      }
    }
    const insert = this.db.sql.prepare('INSERT INTO photos (event_id, file, message_id, guest_name) VALUES (?, ?, ?, ?)');
    for (const file of files) insert.run(event.id, file.filename, messageId, req.guestName!);
    return { ...this.events.quota(event, req.guestName!), added: files.length };
  }

  /** A private note for the client; photos uploaded right after can reference it via messageId. */
  @Post('messages')
  @UseGuards(GuestGuard)
  message(@Param('slug') slug: string, @Body() body: { message?: string }, @Req() req: GuestRequest) {
    const event = this.events.active('slug', slug);
    const name = req.guestName!; // from the passcode step, so notes can't be signed as someone else
    const text = String(body.message ?? '').trim();
    if (!text) throw new BadRequestException('message is required');
    if (text.length > 1000) throw new BadRequestException('message must be at most 1000 characters');
    const { lastInsertRowid } = this.db.sql.prepare('INSERT INTO messages (event_id, name, body) VALUES (?, ?, ?)').run(event.id, name, text);
    return { id: Number(lastInsertRowid) };
  }

  /** Everyone's photos for unlocked guests. Names and notes appear only while the admin allows it. */
  @Get('wall')
  @UseGuards(GuestGuard)
  wall(@Param('slug') slug: string, @Req() req: GuestRequest) {
    const event = this.events.active('slug', slug);
    const me = req.guestName!.toLowerCase();
    const design = parseDesign(event);
    if (design.showWall === false) return { enabled: false, photos: [] };
    const notes = new Map<number, { name: string; body: string }>();
    if (notesOn(design)) for (const m of this.events.messages(event.id)) notes.set(m.id, { name: m.name, body: m.body });
    return {
      enabled: true,
      photos: this.events
        .photos(event.id)
        .slice(0, 300)
        .map((p) => ({
          id: p.id,
          url: `/guest/${slug}/photos/${p.id}`,
          isVideo: isVideo(p.file),
          // Only "is this yours", never whose: the wall stays anonymous
          mine: p.guest_name?.toLowerCase() === me,
          createdAt: `${p.created_at.replace(' ', 'T')}Z`,
          ...(p.message_id !== null && notes.has(p.message_id) && { note: notes.get(p.message_id) }),
        })),
    };
  }

  /** <img> can't send headers, so the guest token comes as ?t= here. */
  @Get('photos/:id')
  wallPhoto(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number, @Query('t') t: string | undefined, @Res() res: Response) {
    const event = this.events.active('slug', slug);
    let payload: TokenPayload | null = null;
    try {
      payload = t ? this.jwt.verify<TokenPayload>(t) : null;
    } catch {
      payload = null;
    }
    if (payload?.scope !== 'guest' || payload.eventId !== event.id) throw new UnauthorizedException();
    if (parseDesign(event).showWall === false) throw new NotFoundException();
    const photo = this.events.photos(event.id).find((p) => p.id === id);
    if (!photo) throw new NotFoundException();
    res.sendFile(photo.file, { root: join(EVENTS_DIR, event.slug), maxAge: '1d' });
  }
}

@Controller('client/:token')
export class ClientController {
  constructor(private readonly events: EventsService) {}

  @Get()
  gallery(@Param('token') token: string) {
    const event = this.events.active('client_token', token);
    const photos = this.events.photos(event.id);
    return {
      name: event.name,
      clientName: event.client_name,
      eventDate: event.event_date,
      expiresAt: event.expires_at,
      photos: photos.map((p) => ({
        id: p.id,
        url: `/client/${token}/photos/${p.id}`,
        isVideo: isVideo(p.file),
        by: p.guest_name,
      })),
      // Guestbook: only the client ever sees these
      messages: this.events.messages(event.id).map((m) => ({
        id: m.id,
        name: m.name,
        body: m.body,
        createdAt: m.created_at,
        photoIds: photos.filter((p) => p.message_id === m.id).map((p) => p.id),
      })),
    };
  }

  @Get('photos/:id')
  photo(
    @Param('token') token: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const event = this.events.active('client_token', token);
    const photo = this.events.photos(event.id).find((p) => p.id === id);
    if (!photo) throw new NotFoundException();
    const root = join(EVENTS_DIR, event.slug);
    if (download) res.download(photo.file, `${event.name}-${photo.id}${photo.file.slice(photo.file.lastIndexOf('.'))}`, { root });
    else res.sendFile(photo.file, { root, maxAge: '1d' });
  }
}

@Controller('events')
export class PublicEventsController {
  constructor(
    private readonly db: Db,
    private readonly events: EventsService,
  ) {}

  /** Events the admin chose to list publicly; guests can jump to the upload page from here. */
  @Get()
  list() {
    const rows = this.db.sql
      .prepare('SELECT * FROM events WHERE is_public = 1 AND expires_at > ? ORDER BY event_date DESC')
      .all(new Date().toISOString()) as EventRow[];
    return rows.map((e) => ({
      name: e.name,
      eventDate: e.event_date,
      slug: e.slug,
      cover: this.events.coverPhoto(e.id) ? `/events/${e.slug}/cover` : null,
    }));
  }

  @Get(':slug/cover')
  cover(@Param('slug') slug: string, @Res() res: Response) {
    const event = this.events.active('slug', slug);
    const photo = event.is_public ? this.events.coverPhoto(event.id) : undefined;
    if (!photo) throw new NotFoundException();
    res.sendFile(photo.file, { root: join(EVENTS_DIR, event.slug), maxAge: '1h' });
  }

  // shortcut: no attempt limit on lookups (6-char code ≈ 1e9 combos per email), add rate limiting if abused
  @Post('lookup')
  lookup(@Body() body: { email?: string; code?: string }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const code = String(body.code ?? '').trim().toUpperCase();
    const rows = this.db.sql
      .prepare('SELECT * FROM events WHERE lower(client_email) = ? AND expires_at > ? ORDER BY event_date DESC')
      .all(email, new Date().toISOString()) as EventRow[];
    if (!email || !code || !rows.some((e) => e.client_code && safeEqual(code, e.client_code))) {
      throw new UnauthorizedException('No events match that email and client code');
    }
    return rows.map((e) => ({
      name: e.name,
      eventDate: e.event_date,
      expiresAt: e.expires_at,
      photoCount: this.events.photos(e.id).length,
      clientPath: `/c/${e.client_token}`,
    }));
  }
}
