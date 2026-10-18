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
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { config } from './config.js';

export type TokenPayload = { scope: 'admin' } | { scope: 'guest'; eventId: number; name: string };

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

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(ctx: ExecutionContext) {
    if (bearer(ctx.switchToHttp().getRequest(), this.jwt)?.scope === 'admin') return true;
    throw new UnauthorizedException();
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly jwt: JwtService) {}

  @Post('login')
  login(@Body() body: { email?: string; password?: string }) {
    const ok =
      safeEqual(String(body.email ?? '').toLowerCase(), config.adminEmail.toLowerCase()) &&
      safeEqual(String(body.password ?? ''), config.adminPassword);
    if (!ok) throw new UnauthorizedException('Invalid email or password');
    const payload: TokenPayload = { scope: 'admin' };
    return { token: this.jwt.sign(payload, { expiresIn: '7d' }) };
  }
}
