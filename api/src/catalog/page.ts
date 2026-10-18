import { BadRequestException, Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth.js';
import { Db } from '../db.js';
import { cleanupFiles } from './files.js';
import { publicProducts } from './products.js';
import { defaultPage, filesInPage, sanitizePage, type Section } from './sections.js';

const DRAFT = 'catalogDraft';
const PUBLISHED = 'catalogPublished';

/** The catalog page: a draft the admin edits and a published copy visitors see, both stored as JSON in settings. */
@Controller()
export class CatalogPageController {
  constructor(private readonly db: Db) {}

  @Get('catalog')
  publicPage() {
    const products = publicProducts(this.db);
    const live = new Set(products.map((p) => p.id));
    const sections = (this.read(PUBLISHED) ?? defaultPage(this.banner()))
      .filter((s) => !s.hidden)
      .map((s) => (s.type === 'products' && s.pick !== 'all' ? { ...s, pick: s.pick.filter((id) => live.has(id)) } : s));
    return { sections, products };
  }

  @Get('admin/catalog/page')
  @UseGuards(AdminGuard)
  get() {
    const draft = this.read(DRAFT) ?? defaultPage(this.banner());
    const published = this.read(PUBLISHED);
    return { draft, published, hasChanges: JSON.stringify(draft) !== JSON.stringify(published) };
  }

  @Put('admin/catalog/page')
  @UseGuards(AdminGuard)
  save(@Body() body: { sections?: unknown }) {
    const old = this.get().draft;
    this.write(DRAFT, sanitizePage(body.sections));
    cleanupFiles(this.db, filesInPage(old));
    return this.get();
  }

  @Post('admin/catalog/page/publish')
  @UseGuards(AdminGuard)
  publish() {
    const { draft, published } = this.get();
    this.write(DRAFT, draft);
    this.write(PUBLISHED, draft);
    cleanupFiles(this.db, filesInPage(published ?? []));
    return this.get();
  }

  @Post('admin/catalog/page/discard')
  @UseGuards(AdminGuard)
  discard() {
    const { draft, published } = this.get();
    if (!published) throw new BadRequestException('The catalog page has never been published');
    this.write(DRAFT, published);
    cleanupFiles(this.db, filesInPage(draft));
    return this.get();
  }

  private read(key: string): Section[] | null {
    const row = this.db.sql.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? (JSON.parse(row.value) as Section[]) : null;
  }

  private write(key: string, sections: Section[]) {
    this.db.sql
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(sections));
  }

  private banner() {
    return (this.db.sql.prepare("SELECT value FROM settings WHERE key = 'banner'").get() as { value: string } | undefined)?.value ?? null;
  }
}
