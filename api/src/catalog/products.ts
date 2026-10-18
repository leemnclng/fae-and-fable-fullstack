import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../auth.js';
import { PUBLIC_DIR } from '../content.js';
import { Db } from '../db.js';
import { IMAGES_ONLY, uploadOptions } from '../uploads.js';
import { cleanupFiles } from './files.js';
import { IMAGE_NAME, isObj, str } from './sections.js';

/**
 * Mirrors and packages. Each row keeps a draft the admin edits and the published copy visitors see;
 * Publish copies draft → published, Discard copies it back.
 */
export type ProductData = {
  name: string;
  type: 'mirror' | 'package';
  price: string;
  description: string;
  inclusions: string[];
  photos: string[];
  visible: boolean;
};
export type AdminProduct = { id: number; sort: number; draft: ProductData; published: ProductData | null; status: 'draft' | 'published' | 'changed' };
export type PublicProduct = { id: number } & Omit<ProductData, 'visible'>;

type Row = { id: number; sort: number; draft: string; published: string | null };

export function sanitizeProduct(input: unknown): ProductData {
  if (!isObj(input)) throw new BadRequestException('draft is required');
  const name = str(input.name, 120, 'name');
  if (!name) throw new BadRequestException('name is required');
  const inclusions = Array.isArray(input.inclusions) ? input.inclusions.map((i) => str(i, 200, 'inclusion')).filter(Boolean) : [];
  if (inclusions.length > 30) throw new BadRequestException('A product can list at most 30 inclusions');
  const photos = Array.isArray(input.photos) ? input.photos.filter((f): f is string => typeof f === 'string' && IMAGE_NAME.test(f)) : [];
  if (photos.length > 20) throw new BadRequestException('A product can have at most 20 photos');
  return {
    name,
    type: input.type === 'package' ? 'package' : 'mirror',
    price: str(input.price, 60, 'price'),
    description: str(input.description, 3000, 'description'),
    inclusions,
    photos,
    visible: input.visible !== false,
  };
}

function toAdmin(row: Row): AdminProduct {
  const status = row.published === null ? 'draft' : row.published === row.draft ? 'published' : 'changed';
  return { id: row.id, sort: row.sort, draft: JSON.parse(row.draft), published: row.published && JSON.parse(row.published), status };
}

/** Products visitors may see: published, and visible in that published version. */
export function publicProducts(db: Db): PublicProduct[] {
  const rows = db.sql.prepare('SELECT * FROM products WHERE published IS NOT NULL ORDER BY sort, id').all() as Row[];
  return rows.flatMap((r) => {
    const { visible, ...data } = JSON.parse(r.published!) as ProductData;
    return visible ? [{ id: r.id, ...data }] : [];
  });
}

@Controller()
export class ProductsController {
  constructor(private readonly db: Db) {}

  @Get('catalog/products/:id')
  publicOne(@Param('id', ParseIntPipe) id: number) {
    const product = publicProducts(this.db).find((p) => p.id === id);
    if (!product) throw new NotFoundException();
    return product;
  }

  @Get('admin/catalog/products')
  @UseGuards(AdminGuard)
  list() {
    return (this.db.sql.prepare('SELECT * FROM products ORDER BY sort, id').all() as Row[]).map(toAdmin);
  }

  @Post('admin/catalog/products')
  @UseGuards(AdminGuard)
  create(@Body() body: { draft?: unknown }) {
    const draft = JSON.stringify(sanitizeProduct(body.draft));
    const { m } = this.db.sql.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS m FROM products').get() as { m: number };
    const { lastInsertRowid } = this.db.sql.prepare('INSERT INTO products (sort, draft) VALUES (?, ?)').run(m, draft);
    return toAdmin(this.find(Number(lastInsertRowid)));
  }

  // Declared before ':id' so "order" is never parsed as an id
  @Put('admin/catalog/products/order')
  @UseGuards(AdminGuard)
  reorder(@Body() body: { ids?: unknown }) {
    if (!Array.isArray(body.ids)) throw new BadRequestException('ids must be a list');
    const update = this.db.sql.prepare('UPDATE products SET sort = ? WHERE id = ?');
    body.ids.forEach((id, i) => Number.isInteger(id) && update.run(i, id as number));
    return this.list();
  }

  @Put('admin/catalog/products/:id')
  @UseGuards(AdminGuard)
  save(@Param('id', ParseIntPipe) id: number, @Body() body: { draft?: unknown }) {
    const old = this.find(id);
    this.db.sql.prepare('UPDATE products SET draft = ? WHERE id = ?').run(JSON.stringify(sanitizeProduct(body.draft)), id);
    cleanupFiles(this.db, photosOf(old.draft));
    return toAdmin(this.find(id));
  }

  @Post('admin/catalog/products/:id/publish')
  @UseGuards(AdminGuard)
  publish(@Param('id', ParseIntPipe) id: number) {
    const old = this.find(id);
    this.db.sql.prepare('UPDATE products SET published = draft WHERE id = ?').run(id);
    cleanupFiles(this.db, photosOf(old.published));
    return toAdmin(this.find(id));
  }

  @Post('admin/catalog/products/:id/discard')
  @UseGuards(AdminGuard)
  discard(@Param('id', ParseIntPipe) id: number) {
    const old = this.find(id);
    if (old.published === null) throw new BadRequestException('This product has never been published; delete it instead');
    this.db.sql.prepare('UPDATE products SET draft = published WHERE id = ?').run(id);
    cleanupFiles(this.db, photosOf(old.draft));
    return toAdmin(this.find(id));
  }

  /** Deletes take effect on the live site immediately (no draft step). */
  @Delete('admin/catalog/products/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    const old = this.find(id);
    this.db.sql.prepare('DELETE FROM products WHERE id = ?').run(id);
    cleanupFiles(this.db, [...photosOf(old.draft), ...photosOf(old.published)]);
    return { ok: true };
  }

  /** Image upload for product photos and page sections; returns the bare file name to store. */
  @Post('admin/catalog/uploads')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('image', uploadOptions(() => PUBLIC_DIR, 15, IMAGES_ONLY)))
  upload(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('image is required');
    return { file: image.filename };
  }

  private find(id: number) {
    const row = this.db.sql.prepare('SELECT * FROM products WHERE id = ?').get(id) as Row | undefined;
    if (!row) throw new NotFoundException();
    return row;
  }
}

const photosOf = (json: string | null): string[] => (json ? (JSON.parse(json) as ProductData).photos : []);
