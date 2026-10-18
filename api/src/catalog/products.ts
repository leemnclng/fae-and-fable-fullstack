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
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from '../auth.js';
import { Pg } from '../pg.js';
import { FILE_STORE, newKey, type FileStore } from '../storage/file-store.js';
import { contentTypeOf, extOf, imageUpload } from '../uploads.js';
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

type Row = { id: number; sort: number; draft: ProductData; published: ProductData | null };

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
  // jsonb normalizes both copies the same way, so equal text means nothing changed since publishing
  const status = row.published === null ? 'draft' : JSON.stringify(row.published) === JSON.stringify(row.draft) ? 'published' : 'changed';
  return { id: row.id, sort: row.sort, draft: row.draft, published: row.published, status };
}

/** Products visitors may see: published, and visible in that published version. */
export async function publicProducts(pg: Pg): Promise<PublicProduct[]> {
  const rows = await pg.query<Row>('SELECT * FROM $s.products WHERE published IS NOT NULL ORDER BY sort, id');
  return rows.flatMap((r) => {
    const { visible, ...data } = r.published!;
    return visible ? [{ id: r.id, ...data }] : [];
  });
}

@Controller()
export class ProductsController {
  constructor(
    private readonly pg: Pg,
    @Inject(FILE_STORE) private readonly store: FileStore,
  ) {}

  @Get('catalog/products/:id')
  async publicOne(@Param('id', ParseIntPipe) id: number) {
    const product = (await publicProducts(this.pg)).find((p) => p.id === id);
    if (!product) throw new NotFoundException();
    return product;
  }

  @Get('admin/catalog/products')
  @UseGuards(AdminGuard)
  async list() {
    return (await this.pg.query<Row>('SELECT * FROM $s.products ORDER BY sort, id')).map(toAdmin);
  }

  @Post('admin/catalog/products')
  @UseGuards(AdminGuard)
  async create(@Body() body: { draft?: unknown }) {
    const draft = JSON.stringify(sanitizeProduct(body.draft));
    const { rows } = await this.pg.exec(
      'INSERT INTO $s.products (sort, draft) VALUES ((SELECT COALESCE(MAX(sort), -1) + 1 FROM $s.products), ?::jsonb) RETURNING id',
      [draft],
    );
    return toAdmin(await this.find(rows[0].id));
  }

  // Declared before ':id' so "order" is never parsed as an id
  @Put('admin/catalog/products/order')
  @UseGuards(AdminGuard)
  async reorder(@Body() body: { ids?: unknown }) {
    if (!Array.isArray(body.ids)) throw new BadRequestException('ids must be a list');
    const ids = body.ids;
    await this.pg.tx(async (q) => {
      for (const [i, id] of ids.entries()) if (Number.isInteger(id)) await q.exec('UPDATE $s.products SET sort = ? WHERE id = ?', [i, id]);
    });
    return this.list();
  }

  @Put('admin/catalog/products/:id')
  @UseGuards(AdminGuard)
  async save(@Param('id', ParseIntPipe) id: number, @Body() body: { draft?: unknown }) {
    const old = await this.find(id);
    await this.pg.exec('UPDATE $s.products SET draft = ?::jsonb WHERE id = ?', [JSON.stringify(sanitizeProduct(body.draft)), id]);
    await cleanupFiles(this.pg, this.store, old.draft.photos);
    return toAdmin(await this.find(id));
  }

  @Post('admin/catalog/products/:id/publish')
  @UseGuards(AdminGuard)
  async publish(@Param('id', ParseIntPipe) id: number) {
    const old = await this.find(id);
    await this.pg.exec('UPDATE $s.products SET published = draft WHERE id = ?', [id]);
    await cleanupFiles(this.pg, this.store, old.published?.photos ?? []);
    return toAdmin(await this.find(id));
  }

  @Post('admin/catalog/products/:id/discard')
  @UseGuards(AdminGuard)
  async discard(@Param('id', ParseIntPipe) id: number) {
    const old = await this.find(id);
    if (old.published === null) throw new BadRequestException('This product has never been published; delete it instead');
    await this.pg.exec('UPDATE $s.products SET draft = published WHERE id = ?', [id]);
    await cleanupFiles(this.pg, this.store, old.draft.photos);
    return toAdmin(await this.find(id));
  }

  /** Deletes take effect on the live site immediately (no draft step). */
  @Delete('admin/catalog/products/:id')
  @UseGuards(AdminGuard)
  async remove(@Param('id', ParseIntPipe) id: number) {
    const old = await this.find(id);
    await this.pg.exec('DELETE FROM $s.products WHERE id = ?', [id]);
    await cleanupFiles(this.pg, this.store, [...old.draft.photos, ...(old.published?.photos ?? [])]);
    return { ok: true };
  }

  /** Image upload for product photos and page sections; returns the bare file name to store. */
  @Post('admin/catalog/uploads')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('image', imageUpload()))
  async upload(@UploadedFile() image?: Express.Multer.File) {
    if (!image) throw new BadRequestException('image is required');
    const file = newKey(extOf(image));
    await this.store.put('public', file, image.buffer, contentTypeOf(image));
    return { file };
  }

  private async find(id: number) {
    const row = await this.pg.one<Row>('SELECT * FROM $s.products WHERE id = ?', [id]);
    if (!row) throw new NotFoundException();
    return row;
  }
}
