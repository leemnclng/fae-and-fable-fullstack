import { BadRequestException, Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth.js';
import { Pg } from '../pg.js';
import { FILE_STORE, type FileStore } from '../storage/file-store.js';
import { cleanupFiles } from './files.js';
import { publicProducts } from './products.js';
import { defaultPage, filesInPage, sanitizePage, type Section } from './sections.js';

const DRAFT = 'catalogDraft';
const PUBLISHED = 'catalogPublished';

/** The catalog page: a draft the admin edits and a published copy visitors see, both stored as JSON in settings. */
@Controller()
export class CatalogPageController {
  constructor(
    private readonly pg: Pg,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get('catalog')
  async publicPage() {
    const products = await publicProducts(this.pg);
    const live = new Set(products.map((p) => p.id));
    const sections = ((await this.read(PUBLISHED)) ?? defaultPage(await this.banner()))
      .filter((s) => !s.hidden)
      .map((s) => (s.type === 'products' && s.pick !== 'all' ? { ...s, pick: s.pick.filter((id) => live.has(id)) } : s));
    return { sections, products };
  }

  @Get('admin/catalog/page')
  @UseGuards(AdminGuard)
  async get() {
    const draft = (await this.read(DRAFT)) ?? defaultPage(await this.banner());
    const published = await this.read(PUBLISHED);
    return { draft, published, hasChanges: JSON.stringify(draft) !== JSON.stringify(published) };
  }

  @Put('admin/catalog/page')
  @UseGuards(AdminGuard)
  async save(@Body() body: { sections?: unknown }) {
    const old = (await this.get()).draft;
    await this.write(DRAFT, sanitizePage(body.sections));
    await cleanupFiles(this.pg, this.store, filesInPage(old));
    return this.get();
  }

  @Post('admin/catalog/page/publish')
  @UseGuards(AdminGuard)
  async publish() {
    const { draft, published } = await this.get();
    await this.write(DRAFT, draft);
    await this.write(PUBLISHED, draft);
    await cleanupFiles(this.pg, this.store, filesInPage(published ?? []));
    return this.get();
  }

  @Post('admin/catalog/page/discard')
  @UseGuards(AdminGuard)
  async discard() {
    const { draft, published } = await this.get();
    if (!published) throw new BadRequestException('The catalog page has never been published');
    await this.write(DRAFT, published);
    await cleanupFiles(this.pg, this.store, filesInPage(draft));
    return this.get();
  }

  private async read(key: string): Promise<Section[] | null> {
    const row = await this.pg.one<{ value: string }>('SELECT value FROM $s.settings WHERE key = ?', [key]);
    return row ? (JSON.parse(row.value) as Section[]) : null;
  }

  private async write(key: string, sections: Section[]) {
    await this.pg.exec('INSERT INTO $s.settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(sections)]);
  }

  private async banner() {
    return (await this.pg.one<{ value: string }>("SELECT value FROM $s.settings WHERE key = 'banner'"))?.value ?? null;
  }
}
