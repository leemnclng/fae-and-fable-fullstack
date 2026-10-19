import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AdminGuard, checkPassword, hashPassword, type AdminRequest } from './auth.js';
import { config } from './config.js';
import { Pg } from './pg.js';

const MIN_PASSWORD = 8;
type AdminRow = { id: number; email: string; password_hash: string; created_at: Date };

function validPassword(value: unknown) {
  const password = String(value ?? '');
  if (password.length < MIN_PASSWORD) throw new BadRequestException(`Password must be at least ${MIN_PASSWORD} characters`);
  if (password.length > 200) throw new BadRequestException('Password must be at most 200 characters');
  return password;
}

/** Any admin can add or remove other admins; nobody can remove themselves or the main account. */
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminsController {
  constructor(private readonly pg: Pg) {}

  @Get('admins')
  async list(@Req() req: AdminRequest) {
    const rows = await this.pg.query<AdminRow>('SELECT * FROM $s.admins ORDER BY id');
    return {
      me: req.admin,
      admins: [
        { id: 'owner', email: config.adminEmail.toLowerCase(), owner: true, createdAt: null },
        ...rows.map((r) => ({ id: r.id, email: r.email, owner: false, createdAt: r.created_at.toISOString() })),
      ],
    };
  }

  @Post('admins')
  async add(@Body() body: { email?: string; password?: string }) {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw new BadRequestException('Enter a valid email address');
    const password = validPassword(body.password);
    if (email === config.adminEmail.toLowerCase()) throw new ConflictException('That email is already an admin');
    const { rows } = await this.pg.exec('INSERT INTO $s.admins (email, password_hash) VALUES (?, ?) ON CONFLICT (email) DO NOTHING RETURNING id', [email, hashPassword(password)]);
    if (!rows.length) throw new ConflictException('That email is already an admin');
    return { id: rows[0].id, email };
  }

  @Delete('admins/:id')
  async remove(@Param('id') id: string, @Req() req: AdminRequest) {
    if (id === 'owner') throw new BadRequestException("The main admin account can't be removed");
    const adminId = Number(id);
    if (!Number.isInteger(adminId)) throw new NotFoundException();
    if (adminId === req.admin) throw new BadRequestException("You can't remove your own account");
    const { rowCount } = await this.pg.exec('DELETE FROM $s.admins WHERE id = ?', [adminId]);
    if (!rowCount) throw new NotFoundException('Admin not found');
    return { removed: adminId };
  }

  /** Changes the signed-in admin's own password; the main account's is set in the API's environment instead. */
  @Put('password')
  async changePassword(@Body() body: { current?: string; password?: string }, @Req() req: AdminRequest) {
    if (req.admin === 'owner') throw new BadRequestException("The main account's password is set in the API settings (ADMIN_PASSWORD)");
    const row = await this.pg.one<AdminRow>('SELECT * FROM $s.admins WHERE id = ?', [req.admin]);
    if (!row || !checkPassword(String(body.current ?? ''), row.password_hash)) throw new BadRequestException('Your current password is incorrect');
    await this.pg.exec('UPDATE $s.admins SET password_hash = ? WHERE id = ?', [hashPassword(validPassword(body.password)), row.id]);
    return { ok: true };
  }
}
