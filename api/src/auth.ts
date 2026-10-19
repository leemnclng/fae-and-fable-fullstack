import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Injectable,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config.js';
import { Pg } from './pg.js';

/** `admin` is an admins row id, or 'owner' for the main account in ADMIN_EMAIL/ADMIN_PASSWORD. */
export type TokenPayload = { scope: 'admin'; admin: number | 'owner' } | { scope: 'guest'; eventId: number; name: string; device: string };
export type AdminRequest = Request & { admin?: number | 'owner' };

export function safeEqual(a: string, b: string) {
  const hash = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export function bearer(req: Request, jwt: JwtService): TokenPayload | null {
  const token = req.headers.authorization?.replace(/^Bearer /, '');
  if (!token) return null;
  try {
    return jwt.verify<TokenPayload>(token);
  } catch {
    return null;
  }
}

/** `scrypt$<salt>$<hash>`, hex; Node's built-in scrypt, so no extra dependency. */
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(password, salt, 64).toString('hex')}`;
}

export function checkPassword(password: string, stored: string) {
  const [, salt, hash] = stored.split('$');
  if (!salt || !hash) return false;
  return timingSafeEqual(scryptSync(password, Buffer.from(salt, 'hex'), 64), Buffer.from(hash, 'hex'));
}

// Checked when an email isn't found, so a wrong email takes as long as a wrong password
const DUMMY_HASH = hashPassword('not-a-real-password');

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly pg: Pg,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<AdminRequest>();
    const token = bearer(req, this.jwt);
    // Tokens from before admin accounts carry no `admin`; those log in again
    if (token?.scope === 'admin' && token.admin !== undefined) {
      // A removed admin is locked out at once, even with an unexpired token
      if (token.admin === 'owner' || (await this.pg.one('SELECT 1 FROM $s.admins WHERE id = ?', [token.admin]))) {
        req.admin = token.admin;
        return true;
      }
    }
    throw new UnauthorizedException();
  }
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwt: JwtService,
    private readonly pg: Pg,
  ) {}

  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    let admin: number | 'owner' | null = null;
    if (safeEqual(email, config.adminEmail.toLowerCase()) && safeEqual(password, config.adminPassword)) admin = 'owner';
    else {
      const row = await this.pg.one<{ id: number; password_hash: string }>('SELECT id, password_hash FROM $s.admins WHERE email = ?', [email]);
      if (checkPassword(password, row?.password_hash ?? DUMMY_HASH) && row) admin = row.id;
    }
    if (admin === null) throw new UnauthorizedException('Invalid email or password');
    const payload: TokenPayload = { scope: 'admin', admin };
    return { token: this.jwt.sign(payload, { expiresIn: '7d' }) };
  }
}
