import {
  BadRequestException,
  Body,
  type CanActivate,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
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
import QRCode from 'qrcode';
import { AdminGuard, bearer, safeEqual, TokenPayload } from './auth.js';
import { config } from './config.js';
import { Pg } from './pg.js';
import { FILE_STORE, newKey, removeInBatches, type FileStore } from './storage/file-store.js';
import { contentTypeOf, extOf, imageUpload } from './uploads.js';

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
  expires_at: Date;
  slug: string;
  passcode: string;
  client_token: string;
  is_public: boolean;
  client_code: string | null;
  design: Design | null;
  created_at: Date;
};
/** Admin-editable look of the guest upload page, stored as JSON on the event. */
type Design = { photoLimit?: number; title?: string; dateText?: string; hideDate?: boolean; message?: string; uploadMessage?: string; thanks?: string; color?: string; background?: string; showWall?: boolean; panel?: Panel;
  /** Guests' notes show beside their photos on the wall. */
  showMessages?: boolean;
  /** Legacy form of showMessages (it once limited notes to newer ones); still means "on". */
  notesAfterId?: number };
const PANELS = ['glass', 'soft', 'solid', 'tint'] as const;
type Panel = (typeof PANELS)[number];

const parseDesign = (row: EventRow): Design => row.design ?? {};
const notesOn = (d: Design) => d.showMessages === true || d.notesAfterId !== undefined;

/** The guest page design as the web sees it; `background` is a file name in the public bucket. */
export function designDto(row: EventRow) {
  const design = parseDesign(row);
  const { background, notesAfterId: _legacy, showMessages: _on, ...text } = design;
  return { ...text, ...(notesOn(design) && { showMessages: true }), background: background ?? null };
}

const DESIGN_LIMITS = { title: 80, dateText: 80, message: 600, uploadMessage: 600, thanks: 300 } as const;

/** `file` is the photo's key in the private bucket (events/<eventId>/<uuid>.<ext>). */
type PhotoRow = { id: number; event_id: number; file: string; message_id: number | null; guest_name: string | null; created_at: Date };

/** Photos one guest (by name) may share per event when the admin hasn't set a limit. */
export const DEFAULT_PHOTO_LIMIT = 30;
const limitOf = (row: EventRow) => {
  const limit = parseDesign(row).photoLimit ?? DEFAULT_PHOTO_LIMIT;
  return limit > 0 ? limit : null; // 0 = unlimited
};
type GuestRequest = Request & { guestName?: string };
type MessageRow = { id: number; event_id: number; name: string; body: string; created_at: Date };
const isExpired = (row: EventRow) => row.expires_at.getTime() <= Date.now();

/** Sends the browser to a short-lived signed URL for a private photo; only call after the access checks. */
async function redirectToPhoto(store: FileStore, res: Response, key: string, download?: string) {
  res.set('Cache-Control', 'private, max-age=300');
  res.redirect(302, await store.signedUrl(key, { download }));
}

@Injectable()
export class EventsService {
  constructor(
    private readonly pg: Pg,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  /**
   * Deletes an event's stored files, then its rows; returns how many photos it held. Only ever triggered by the admin.
   * Files go first so a storage failure leaves the event listed (still pointing at its files) and the delete can be retried.
   */
  async remove(event: EventRow) {
    const photos = await this.photos(event.id);
    await removeInBatches(this.store, 'private', photos.map((p) => p.file));
    const background = parseDesign(event).background;
    if (background) await this.store.remove('public', [background]);
    await this.pg.exec('DELETE FROM $s.events WHERE id = ?', [event.id]);
    return photos.length;
  }

  find(id: number) {
    return this.pg.one<EventRow>('SELECT * FROM $s.events WHERE id = ?', [id]);
  }

  /** Finds a live event by a link's id/slug/token; expired ones answer 410 until the admin extends or deletes them. */
  async active(column: 'id' | 'slug' | 'client_token', value: string | number) {
    const event = await this.pg.one<EventRow>(`SELECT * FROM $s.events WHERE ${column} = ?`, [value]);
    if (!event) throw new NotFoundException('Link not found');
    if (isExpired(event)) throw new GoneException('This link has expired');
    return event;
  }

  /** Latest photo, used as a public cover. */
  coverPhoto(eventId: number) {
    return this.pg.one<PhotoRow>('SELECT * FROM $s.photos WHERE event_id = ? ORDER BY id DESC LIMIT 1', [eventId]);
  }

  /** How many photos this guest name has shared, case-insensitively, against the event's limit. */
  async quota(event: EventRow, name: string) {
    const row = await this.pg.one<{ n: number }>('SELECT COUNT(*)::int AS n FROM $s.photos WHERE event_id = ? AND lower(guest_name) = lower(?)', [event.id, name]);
    return { name, uploaded: row?.n ?? 0, limit: limitOf(event) };
  }

  messages(eventId: number) {
    return this.pg.query<MessageRow>('SELECT * FROM $s.messages WHERE event_id = ? ORDER BY id DESC', [eventId]);
  }

  photos(eventId: number) {
    return this.pg.query<PhotoRow>('SELECT * FROM $s.photos WHERE event_id = ? ORDER BY id DESC', [eventId]);
  }
}

@Injectable()
export class GuestGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly events: EventsService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const event = await this.events.active('slug', String(req.params.slug));
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
    private readonly pg: Pg,
    private readonly events: EventsService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get()
  async list() {
    const rows = await this.pg.query<EventRow & { photo_count: number }>(
      `SELECT e.*, COUNT(p.id)::int AS photo_count FROM $s.events e LEFT JOIN $s.photos p ON p.event_id = e.id
       GROUP BY e.id ORDER BY e.event_date DESC`,
    );
    return Promise.all(rows.map((row) => this.toDto(row)));
  }

  @Post()
  async create(
    @Body()
    body: { name?: string; clientName?: string; clientEmail?: string; eventDate?: string; passcode?: string; isPublic?: boolean | string },
  ) {
    if (!body.name?.trim() || !body.clientName?.trim()) throw new BadRequestException('name and clientName are required');
    const passcode = body.passcode?.trim() || randomCode(6);
    if (passcode.length < 4) throw new BadRequestException('passcode must be at least 4 characters');
    const { rows } = await this.pg.exec(
      `INSERT INTO $s.events (name, client_name, client_email, event_date, expires_at, slug, passcode, client_token, client_code, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        body.name.trim(),
        body.clientName.trim(),
        body.clientEmail?.trim() || null,
        String(body.eventDate),
        expiresAt(String(body.eventDate)),
        randomCode(8, 'abcdefghjkmnpqrstuvwxyz23456789'),
        passcode,
        randomCode(32, 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'),
        randomCode(6),
        body.isPublic === true || body.isPublic === 'true',
      ],
    );
    return this.toDto({ ...(await this.events.find(rows[0].id))!, photo_count: 0 });
  }

  /** Updates listing and/or reschedules. A new date moves the 15-day expiry with it, so a later date extends an expired event. */
  @Patch(':id')
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: { isPublic?: boolean; eventDate?: string }) {
    if (body.isPublic === undefined && body.eventDate === undefined) throw new BadRequestException('Nothing to update');
    if (body.isPublic !== undefined && typeof body.isPublic !== 'boolean') throw new BadRequestException('isPublic must be true or false');
    const event = await this.events.find(id);
    if (!event) throw new NotFoundException();
    // No automatic purge any more: a past date simply leaves the event expired until the admin deletes or extends it
    const expires = body.eventDate === undefined ? event.expires_at : expiresAt(String(body.eventDate));
    await this.pg.exec('UPDATE $s.events SET is_public = ?, event_date = ?, expires_at = ? WHERE id = ?', [
      body.isPublic ?? event.is_public,
      body.eventDate ?? event.event_date,
      expires,
      id,
    ]);
    return { ok: true };
  }

  /** Saves the guest page design; an optional `background` image replaces the current one. */
  @Put(':id/design')
  @UseInterceptors(FileInterceptor('background', imageUpload()))
  async saveDesign(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<Record<'photoLimit' | 'title' | 'dateText' | 'hideDate' | 'message' | 'uploadMessage' | 'thanks' | 'color' | 'removeBackground' | 'showWall' | 'panel' | 'showMessages', string>>,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const event = await this.events.find(id);
    if (!event) throw new NotFoundException();
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
    const old = design.background;
    if (file || body.removeBackground === 'true') design.background = undefined;
    if (file) {
      design.background = `backgrounds/${newKey(extOf(file))}`;
      await this.store.put('public', design.background, file.buffer, contentTypeOf(file));
    }
    await this.pg.exec('UPDATE $s.events SET design = ?::jsonb WHERE id = ?', [JSON.stringify(design), id]);
    if (old && old !== design.background) await this.store.remove('public', [old]);
    return designDto({ ...event, design });
  }

  /** Deletes every expired event with its photos and files. Declared before ':id' so "expired" is never parsed as an id. */
  @Delete('expired')
  async removeExpired() {
    const expired = await this.pg.query<EventRow>('SELECT * FROM $s.events WHERE expires_at <= now()');
    let photos = 0;
    for (const event of expired) photos += await this.events.remove(event);
    return { deleted: expired.length, photos };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const event = await this.events.find(id);
    if (!event) throw new NotFoundException();
    await this.events.remove(event);
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
      expiresAt: row.expires_at.toISOString(),
      expired: isExpired(row),
      passcode: row.passcode,
      clientCode: row.client_code,
      design: designDto(row),
      isPublic: row.is_public,
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
    private readonly pg: Pg,
    private readonly jwt: JwtService,
    private readonly events: EventsService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get()
  async info(@Param('slug') slug: string) {
    const event = await this.events.active('slug', slug);
    return { name: event.name, eventDate: event.event_date, design: designDto(event) };
  }

  @Post('unlock')
  async unlock(@Param('slug') slug: string, @Body() body: { passcode?: string; name?: string }) {
    const event = await this.events.active('slug', slug);
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Please enter your name');
    if (name.length > 60) throw new BadRequestException('Name must be at most 60 characters');
    if (!safeEqual(String(body.passcode ?? '').trim().toUpperCase(), event.passcode.toUpperCase())) {
      throw new UnauthorizedException('Wrong passcode');
    }
    const payload: TokenPayload = { scope: 'guest', eventId: event.id, name };
    const ttl = Math.max(60, Math.floor((event.expires_at.getTime() - Date.now()) / 1000));
    return { token: this.jwt.sign(payload, { expiresIn: ttl }), ...(await this.events.quota(event, name)) };
  }

  /** The signed-in guest's name and remaining photo allowance. */
  @Get('me')
  @UseGuards(GuestGuard)
  async me(@Param('slug') slug: string, @Req() req: GuestRequest) {
    return this.events.quota(await this.events.active('slug', slug), req.guestName!);
  }

  /** One photo per request: browsers resize first (≤2560 px), keeping each request under the host's body limit. */
  @Post('photos')
  @UseGuards(GuestGuard)
  @UseInterceptors(FilesInterceptor('photos', 1, imageUpload()))
  async upload(
    @Param('slug') slug: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { messageId?: string },
    @Req() req: GuestRequest,
  ) {
    if (!files?.length) throw new BadRequestException('No photos received');
    const event = await this.events.active('slug', slug);
    const quota = await this.events.quota(event, req.guestName!);
    if (quota.limit !== null && quota.uploaded + files.length > quota.limit) {
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
      const owned = await this.pg.one('SELECT 1 FROM $s.messages WHERE id = ? AND event_id = ?', [messageId, event.id]);
      if (!owned) throw new BadRequestException('Unknown message');
    }
    for (const file of files) {
      const key = `events/${event.id}/${newKey(extOf(file))}`;
      await this.store.put('private', key, file.buffer, contentTypeOf(file));
      await this.pg.exec('INSERT INTO $s.photos (event_id, file, message_id, guest_name) VALUES (?, ?, ?, ?)', [event.id, key, messageId, req.guestName!]);
    }
    return { ...(await this.events.quota(event, req.guestName!)), added: files.length };
  }

  /** A private note for the client; photos uploaded right after can reference it via messageId. */
  @Post('messages')
  @UseGuards(GuestGuard)
  async message(@Param('slug') slug: string, @Body() body: { message?: string }, @Req() req: GuestRequest) {
    const event = await this.events.active('slug', slug);
    const name = req.guestName!; // from the passcode step, so notes can't be signed as someone else
    const text = String(body.message ?? '').trim();
    if (!text) throw new BadRequestException('message is required');
    if (text.length > 1000) throw new BadRequestException('message must be at most 1000 characters');
    const { rows } = await this.pg.exec('INSERT INTO $s.messages (event_id, name, body) VALUES (?, ?, ?) RETURNING id', [event.id, name, text]);
    return { id: rows[0].id };
  }

  /** Everyone's photos for unlocked guests. Names and notes appear only while the admin allows it. */
  @Get('wall')
  @UseGuards(GuestGuard)
  async wall(@Param('slug') slug: string, @Req() req: GuestRequest) {
    const event = await this.events.active('slug', slug);
    const me = req.guestName!.toLowerCase();
    const design = parseDesign(event);
    if (design.showWall === false) return { enabled: false, photos: [] };
    const notes = new Map<number, { name: string; body: string }>();
    if (notesOn(design)) for (const m of await this.events.messages(event.id)) notes.set(m.id, { name: m.name, body: m.body });
    return {
      enabled: true,
      photos: (await this.events.photos(event.id)).slice(0, 300).map((p) => ({
        id: p.id,
        url: `/guest/${slug}/photos/${p.id}`,
        // Only "is this yours", never whose: the wall stays anonymous
        mine: p.guest_name?.toLowerCase() === me,
        createdAt: p.created_at.toISOString(),
        ...(p.message_id !== null && notes.has(p.message_id) && { note: notes.get(p.message_id) }),
      })),
    };
  }

  /** <img> can't send headers, so the guest token comes as ?t= here. */
  @Get('photos/:id')
  async wallPhoto(@Param('slug') slug: string, @Param('id', ParseIntPipe) id: number, @Query('t') t: string | undefined, @Res() res: Response) {
    const event = await this.events.active('slug', slug);
    let payload: TokenPayload | null = null;
    try {
      payload = t ? this.jwt.verify<TokenPayload>(t) : null;
    } catch {
      payload = null;
    }
    if (payload?.scope !== 'guest' || payload.eventId !== event.id) throw new UnauthorizedException();
    if (parseDesign(event).showWall === false) throw new NotFoundException();
    const photo = await this.pg.one<PhotoRow>('SELECT * FROM $s.photos WHERE id = ? AND event_id = ?', [id, event.id]);
    if (!photo) throw new NotFoundException();
    await redirectToPhoto(this.store, res, photo.file);
  }
}

@Controller('client/:token')
export class ClientController {
  constructor(
    private readonly pg: Pg,
    private readonly events: EventsService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get()
  async gallery(@Param('token') token: string) {
    const event = await this.events.active('client_token', token);
    const photos = await this.events.photos(event.id);
    return {
      name: event.name,
      clientName: event.client_name,
      eventDate: event.event_date,
      expiresAt: event.expires_at.toISOString(),
      photos: photos.map((p) => ({ id: p.id, url: `/client/${token}/photos/${p.id}`, by: p.guest_name })),
      // Guestbook: only the client ever sees these
      messages: (await this.events.messages(event.id)).map((m) => ({
        id: m.id,
        name: m.name,
        body: m.body,
        createdAt: m.created_at.toISOString(),
        photoIds: photos.filter((p) => p.message_id === m.id).map((p) => p.id),
      })),
    };
  }

  @Get('photos/:id')
  async photo(
    @Param('token') token: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('download') download: string | undefined,
    @Res() res: Response,
  ) {
    const event = await this.events.active('client_token', token);
    const photo = await this.pg.one<PhotoRow>('SELECT * FROM $s.photos WHERE id = ? AND event_id = ?', [id, event.id]);
    if (!photo) throw new NotFoundException();
    await redirectToPhoto(this.store, res, photo.file, download ? `${event.name}-${photo.id}${photo.file.slice(photo.file.lastIndexOf('.'))}` : undefined);
  }
}

@Controller('events')
export class PublicEventsController {
  constructor(
    private readonly pg: Pg,
    private readonly events: EventsService,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  /** Events the admin chose to list publicly; guests can jump to the upload page from here. */
  @Get()
  async list() {
    const rows = await this.pg.query<EventRow>('SELECT * FROM $s.events WHERE is_public AND expires_at > now() ORDER BY event_date DESC');
    return Promise.all(
      rows.map(async (e) => ({
        name: e.name,
        eventDate: e.event_date,
        slug: e.slug,
        cover: (await this.events.coverPhoto(e.id)) ? `/events/${e.slug}/cover` : null,
      })),
    );
  }

  @Get(':slug/cover')
  async cover(@Param('slug') slug: string, @Res() res: Response) {
    const event = await this.events.active('slug', slug);
    const photo = event.is_public ? await this.events.coverPhoto(event.id) : undefined;
    if (!photo) throw new NotFoundException();
    await redirectToPhoto(this.store, res, photo.file);
  }

  // shortcut: no attempt limit on lookups (6-char code ≈ 1e9 combos per email), add rate limiting if abused
  @Post('lookup')
  async lookup(@Body() body: { email?: string; code?: string }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const code = String(body.code ?? '').trim().toUpperCase();
    const rows = await this.pg.query<EventRow & { photo_count: number }>(
      `SELECT e.*, (SELECT COUNT(*)::int FROM $s.photos p WHERE p.event_id = e.id) AS photo_count
       FROM $s.events e WHERE lower(e.client_email) = ? AND e.expires_at > now() ORDER BY e.event_date DESC`,
      [email],
    );
    if (!email || !code || !rows.some((e) => e.client_code && safeEqual(code, e.client_code))) {
      throw new UnauthorizedException('No events match that email and client code');
    }
    return rows.map((e) => ({
      name: e.name,
      eventDate: e.event_date,
      expiresAt: e.expires_at.toISOString(),
      photoCount: e.photo_count,
      clientPath: `/c/${e.client_token}`,
    }));
  }
}
