import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';

Object.assign(process.env, {
  JWT_SECRET: 'test-secret',
  // Several web origins (e.g. production + a preview deployment); the first is used in generated links
  WEB_URL: 'http://a.test,http://b.test',
  ADMIN_EMAIL: 'admin@test.dev',
  ADMIN_PASSWORD: 'pw',
});

const { AppModule } = await import('../src/app.module.js');
const { FILE_STORE } = await import('../src/storage/file-store.js');
const { MemoryStore } = await import('./memory-store.js');
const { freshSchema } = await import('./pg-harness.js');
const { setup } = await import('../src/main.js');
const { expiresAt } = await import('../src/events.js');

// smallest valid JPEG header is enough; the API only checks the extension
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

describe('Fae&Fable API', () => {
  let app: NestExpressApplication;
  let admin: string;
  let schema: Awaited<ReturnType<typeof freshSchema>>;
  const store = new MemoryStore();

  beforeAll(async () => {
    // A throwaway Postgres schema for this run, and files kept in memory
    schema = await freshSchema();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(FILE_STORE).useValue(store).compile();
    app = setup(moduleRef.createNestApplication<NestExpressApplication>());
    await app.init();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'ADMIN@test.dev', password: 'pw' })
      .expect(201);
    admin = `Bearer ${res.body.token}`;
  });

  afterAll(async () => {
    await app.close();
    await schema.drop();
  });

  it('expiresAt keeps links open through the 15th day after the event', () => {
    expect(expiresAt('2026-01-01')).toBe('2026-01-17T00:00:00.000Z');
    expect(() => expiresAt('01/01/2026')).toThrow();
  });

  it('CORS allows each configured web origin and nothing else', async () => {
    const http = request(app.getHttpServer());
    expect((await http.get('/content').set('Origin', 'http://b.test')).headers['access-control-allow-origin']).toBe('http://b.test');
    expect((await http.get('/content').set('Origin', 'http://c.test')).headers['access-control-allow-origin']).toBeUndefined();
    expect((await http.get('/').expect(200)).body).toEqual({ ok: true });
  });

  it('rejects bad logins and unauthenticated admin calls', async () => {
    const http = request(app.getHttpServer());
    await http.post('/auth/login').send({ email: 'admin@test.dev', password: 'nope' }).expect(401);
    await http.get('/admin/events').expect(401);
  });

  it('manages public content and settings', async () => {
    const http = request(app.getHttpServer());
    await http.put('/admin/settings').set('Authorization', admin).send({ businessName: 'Fae&Fable', hacked: 'x' }).expect(200);
    const pub = await http.get('/content').expect(200);
    expect(pub.body).toEqual({ settings: { businessName: 'Fae&Fable' } });
    // Catalog drafts live in settings but are never writable or readable through it
    await http.put('/admin/settings').set('Authorization', admin).send({ catalogDraft: 'x' }).expect(200);
    expect((await http.get('/content').expect(200)).body.settings).not.toHaveProperty('catalogDraft');

    // Banner: replacing deletes the old file, removing clears it; settings PUT can't set it
    const first = (await http.put('/admin/banner').set('Authorization', admin).attach('image', JPEG, 'a.jpg').expect(200)).body.banner;
    expect(first).toMatch(/^[\w-]+\.jpg$/);
    expect(store.has('public', first)).toBe(true);
    const second = (await http.put('/admin/banner').set('Authorization', admin).attach('image', JPEG, 'b.jpg').expect(200)).body.banner;
    expect(store.has('public', first)).toBe(false);
    await http.put('/admin/banner').set('Authorization', admin).attach('image', JPEG, 'clip.mp4').expect(400);
    // Uploads are resized in the browser; anything over 4 MB is refused
    const big = (await http.put('/admin/banner').set('Authorization', admin).attach('image', Buffer.alloc(5 * 1024 * 1024), 'big.jpg')).status;
    expect([400, 413]).toContain(big);
    await http.put('/admin/settings').set('Authorization', admin).send({ banner: 'x.jpg' }).expect(200);
    expect((await http.get('/content').expect(200)).body.settings.banner).toBe(second);
    await http.delete('/admin/banner').set('Authorization', admin).expect(200);
    expect(store.has('public', second)).toBe(false);
    expect((await http.get('/content').expect(200)).body.settings).not.toHaveProperty('banner');
    await http.put('/admin/banner').expect(401);
  });

  it('stores the Facebook page the Inquire now button opens, only as a web link', async () => {
    const http = request(app.getHttpServer());
    await http.put('/admin/settings').set('Authorization', admin).send({ facebook: 'javascript:alert(1)' }).expect(400);
    await http.put('/admin/settings').set('Authorization', admin).send({ facebook: ' https://facebook.com/faeandfable ' }).expect(200);
    expect((await http.get('/content').expect(200)).body.settings.facebook).toBe('https://facebook.com/faeandfable');
    await http.put('/admin/settings').set('Authorization', admin).send({ facebook: '' }).expect(200);
    expect((await http.get('/content').expect(200)).body.settings.facebook).toBe('');
  });

  describe('catalog products', () => {
    const products = '/admin/catalog/products';
    const create = (draft: object) => request(app.getHttpServer()).post(products).set('Authorization', admin).send({ draft });
    const save = (id: number, draft: object) => request(app.getHttpServer()).put(`${products}/${id}`).set('Authorization', admin).send({ draft });
    const act = (id: number, action: 'publish' | 'discard') => request(app.getHttpServer()).post(`${products}/${id}/${action}`).set('Authorization', admin);
    const upload = async () => (await request(app.getHttpServer()).post('/admin/catalog/uploads').set('Authorization', admin).attach('image', JPEG, 'a.jpg').expect(201)).body.file as string;

    it('products stay draft until published', async () => {
      const http = request(app.getHttpServer());
      const created = (await create({ name: 'Rose Arch', type: 'mirror', price: '₱18,000' }).expect(201)).body;
      expect(created).toMatchObject({ status: 'draft', published: null, draft: { name: 'Rose Arch', visible: true, inclusions: [], photos: [] } });
      await http.get(`/catalog/products/${created.id}`).expect(404);

      expect((await act(created.id, 'publish').expect(201)).body.status).toBe('published');
      const live = (await http.get(`/catalog/products/${created.id}`).expect(200)).body;
      expect(live).toMatchObject({ id: created.id, name: 'Rose Arch', price: '₱18,000' });
      expect(live).not.toHaveProperty('visible');

      const hidden = { name: 'Rose Arch', type: 'mirror', price: '₱20,000', visible: false };
      expect((await save(created.id, hidden).expect(200)).body.status).toBe('changed');
      expect((await http.get(`/catalog/products/${created.id}`).expect(200)).body.price).toBe('₱18,000');
      await act(created.id, 'publish').expect(201);
      await http.get(`/catalog/products/${created.id}`).expect(404);

      await save(created.id, { ...hidden, name: 'Typo' }).expect(200);
      const discarded = (await act(created.id, 'discard').expect(201)).body;
      expect(discarded.status).toBe('published');
      expect(discarded.draft).toEqual(discarded.published);
    });

    it('validates products', async () => {
      const http = request(app.getHttpServer());
      await create({ name: '' }).expect(400);
      expect((await create({ name: 'Ok', photos: ['../x.jpg'] }).expect(201)).body.draft.photos).toEqual([]);
      await http.post(products).send({ draft: { name: 'X' } }).expect(401);
      await http.post('/admin/catalog/uploads').set('Authorization', admin).attach('image', JPEG, 'clip.mp4').expect(400);
      expect(await upload()).toMatch(/\.jpg$/);
      const fresh = (await create({ name: 'Never live' }).expect(201)).body;
      await act(fresh.id, 'discard').expect(400);
      await save(999999, { name: 'Ghost' }).expect(404);
    });

    it('keeps photos the published version still uses', async () => {
      const http = request(app.getHttpServer());
      const file = await upload();
      const p = (await create({ name: 'Photo mirror', photos: [file] }).expect(201)).body;
      await act(p.id, 'publish').expect(201);
      await save(p.id, { name: 'Photo mirror', photos: [] }).expect(200);
      expect(store.has('public', file)).toBe(true);
      await act(p.id, 'publish').expect(201);
      expect(store.has('public', file)).toBe(false);
    });

    it('orders and deletes products', async () => {
      const http = request(app.getHttpServer());
      const ids = (await http.get(products).set('Authorization', admin).expect(200)).body.map((p: { id: number }) => p.id);
      const reversed = [...ids].reverse();
      const ordered = (await http.put(`${products}/order`).set('Authorization', admin).send({ ids: reversed }).expect(200)).body;
      expect(ordered.map((p: { id: number }) => p.id)).toEqual(reversed);

      const first = reversed[0];
      await act(first, 'publish').expect(201);
      await http.delete(`${products}/${first}`).set('Authorization', admin).expect(200);
      expect((await http.get(products).set('Authorization', admin).expect(200)).body).toHaveLength(ids.length - 1);
      await http.get(`/catalog/products/${first}`).expect(404);
    });
  });

  describe('catalog page', () => {
    const page = '/admin/catalog/page';
    const savePage = (sections: object[]) => request(app.getHttpServer()).put(page).set('Authorization', admin).send({ sections });
    const publishPage = () => request(app.getHttpServer()).post(`${page}/publish`).set('Authorization', admin).expect(201);

    it('page edits stay draft until published', async () => {
      const http = request(app.getHttpServer());
      const types = (body: { sections: { type: string }[] }) => body.sections.map((s) => s.type);
      expect(types((await http.get('/catalog').expect(200)).body)).toEqual(['slideshow', 'products', 'products', 'cta']);
      await http.post(`${page}/discard`).set('Authorization', admin).expect(400);

      expect((await savePage([{ id: 'c', type: 'cta', heading: 'Book us' }]).expect(200)).body.hasChanges).toBe(true);
      expect(types((await http.get('/catalog').expect(200)).body)).toEqual(['slideshow', 'products', 'products', 'cta']);

      expect((await publishPage()).body.hasChanges).toBe(false);
      expect((await http.get('/catalog').expect(200)).body.sections).toEqual([
        { id: 'c', type: 'cta', hidden: false, heading: 'Book us', text: '', buttonLabel: 'Inquire', background: 'white', backgroundImage: null },
      ]);

      await savePage([{ id: 'c', type: 'cta', heading: 'Book us' }, { id: 'h', type: 'text', hidden: true }]).expect(200);
      await publishPage();
      expect((await http.get('/catalog').expect(200)).body.sections.map((s: { id: string }) => s.id)).toEqual(['c']);

      await savePage([{ type: 'cta', heading: 'x'.repeat(121) }]).expect(400);
      await http.put(page).send({ sections: [] }).expect(401);

      await savePage([]).expect(200);
      const discarded = (await http.post(`${page}/discard`).set('Authorization', admin).expect(201)).body;
      expect(discarded.draft).toEqual(discarded.published);
    });

    it('public catalog skips products that are not live', async () => {
      const http = request(app.getHttpServer());
      const make = async (name: string, publish: boolean, visible = true) => {
        const p = (await http.post('/admin/catalog/products').set('Authorization', admin).send({ draft: { name, visible } }).expect(201)).body;
        if (publish) await http.post(`/admin/catalog/products/${p.id}/publish`).set('Authorization', admin).expect(201);
        return p.id as number;
      };
      const live = await make('Live', true);
      const draft = await make('Draft only', false);
      const hidden = await make('Hidden', true, false);
      await savePage([{ id: 'm', type: 'products', pick: [live, draft, hidden, 999999] }]).expect(200);
      await publishPage();

      const body = (await http.get('/catalog').expect(200)).body;
      expect(body.sections[0].pick).toEqual([live]);
      const ids = body.products.map((p: { id: number }) => p.id);
      expect(ids).toContain(live);
      expect(ids).not.toContain(draft);
      expect(ids).not.toContain(hidden);
    });

    it('never leaks the draft through /content', async () => {
      const http = request(app.getHttpServer());
      await savePage([{ id: 'secret', type: 'text', heading: 'Unreleased' }]).expect(200);
      const { settings } = (await http.get('/content').expect(200)).body;
      expect(settings).not.toHaveProperty('catalogDraft');
      expect(settings).not.toHaveProperty('catalogPublished');
    });

    it('keeps an old banner photo the catalog page still shows', async () => {
      const http = request(app.getHttpServer());
      // The default page's slideshow uses the banner, so a published page can hold the banner's file name
      const file = (await http.put('/admin/banner').set('Authorization', admin).attach('image', JPEG, 'old.jpg').expect(200)).body.banner as string;
      await savePage([{ id: 's', type: 'slideshow', slides: [{ image: file }] }]).expect(200);
      await publishPage();
      await http.put('/admin/banner').set('Authorization', admin).attach('image', JPEG, 'new.jpg').expect(200);
      expect(store.has('public', file)).toBe(true);
      await http.delete('/admin/banner').set('Authorization', admin).expect(200);
    });

    it('deletes a section photo once neither version uses it', async () => {
      const http = request(app.getHttpServer());
      const file = (await http.post('/admin/catalog/uploads').set('Authorization', admin).attach('image', JPEG, 'bg.jpg').expect(201)).body.file;
      await savePage([{ id: 't', type: 'text', image: file }]).expect(200);
      await publishPage();
      await savePage([]).expect(200);
      expect(store.has('public', file)).toBe(true);
      await publishPage();
      expect(store.has('public', file)).toBe(false);
    });
  });

  it('runs the event flow: QR + passcode upload, client gallery, expiry', async () => {
    const http = request(app.getHttpServer());
    const event = (
      await http
        .post('/admin/events')
        .set('Authorization', admin)
        .send({ name: 'Ana & Ben', clientName: 'Ana', eventDate: new Date().toISOString().slice(0, 10), passcode: 'abcd' })
        .expect(201)
    ).body;
    expect(event.qr).toMatch(/^data:image\/png;base64,/);
    const slug = event.guestUrl.split('/e/')[1];
    // Several photos from one guest here; the per-device limit has its own test
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    const clientToken = event.clientUrl.split('/c/')[1];

    await http.get(`/guest/${slug}`).expect(200);
    await http.post(`/guest/${slug}/photos`).attach('photos', JPEG, 'a.jpg').expect(401);
    await http.post(`/guest/${slug}/unlock`).send({ name: 'Guest', passcode: 'wrong' }).expect(401);
    const guest = `Bearer ${(await http.post(`/guest/${slug}/unlock`).send({ name: 'Guest', passcode: 'ABCD' }).expect(201)).body.token}`;
    await http.post(`/guest/${slug}/photos`).set('Authorization', admin).attach('photos', JPEG, 'a.jpg').expect(401);
    // One photo per request (browsers resize first), so a request can't exceed the host's body limit
    await http.post(`/guest/${slug}/photos`).set('Authorization', guest).attach('photos', JPEG, 'a.jpg').attach('photos', JPEG, 'b.png').expect(400);
    await http.post(`/guest/${slug}/photos`).set('Authorization', guest).attach('photos', JPEG, 'a.jpg').expect(201);
    await http.post(`/guest/${slug}/photos`).set('Authorization', guest).attach('photos', JPEG, 'b.png').expect(201);

    // Private photos: the API checks access, then redirects to a short-lived signed URL
    const gallery = (await http.get(`/client/${clientToken}`).expect(200)).body;
    expect(gallery.photos).toHaveLength(2);
    expect(gallery.photos[0]).not.toHaveProperty('isVideo');
    expect((await http.get(gallery.photos[0].url).expect(302)).headers.location).toMatch(/^memory:\/\/private\/events\/\d+\//);
    expect((await http.get(`${gallery.photos[0].url}?download=1`).expect(302)).headers.location).toMatch(/download=Ana%20%26%20Ben-\d+\.(jpg|png)/);

    // Expired links return 410; nothing is deleted until the admin says so
    await http.patch(`/admin/events/${event.id}`).set('Authorization', admin).send({ eventDate: '2000-01-01' }).expect(200);
    await http.get(`/client/${clientToken}`).expect(410);
    await http.post(`/guest/${slug}/photos`).set('Authorization', guest).attach('photos', JPEG, 'c.jpg').expect(410);
    const keys = store.keys('private', `events/${event.id}/`);
    expect(keys).toHaveLength(2);
    expect((await http.delete('/admin/events/expired').set('Authorization', admin).expect(200)).body).toEqual({ deleted: 1, photos: 2 });
    await http.get(`/client/${clientToken}`).expect(404);
    expect(keys.some((k) => store.has('private', k))).toBe(false);
  });

  it('serves the public events page: opt-in listing, covers, client lookup', async () => {
    const http = request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);
    const create = (body: object) =>
      http.post('/admin/events').set('Authorization', admin).send({ clientName: 'Cy', eventDate: today, ...body }).expect(201).then((r) => r.body);
    const priv = await create({ name: 'Private Party', clientEmail: 'cy@test.dev' });
    const pub = await create({ name: 'Open Gala', clientEmail: 'Cy@Test.dev', isPublic: 'true', passcode: 'gala' });
    expect(priv.isPublic).toBe(false);
    expect(pub.clientCode).toMatch(/^[A-Z2-9]{6}$/);

    let list = (await http.get('/events').expect(200)).body;
    expect(list.map((e: { name: string }) => e.name)).toEqual(['Open Gala']);
    expect(list[0].cover).toBeNull();

    // A guest upload gives the public event a cover; the private event never exposes one
    const slug = pub.guestUrl.split('/e/')[1];
    const guest = `Bearer ${(await http.post(`/guest/${slug}/unlock`).send({ name: 'Guest', passcode: 'gala' })).body.token}`;
    await http.post(`/guest/${slug}/photos`).set('Authorization', guest).attach('photos', JPEG, 'a.jpg').expect(201);
    list = (await http.get('/events').expect(200)).body;
    expect((await http.get(list[0].cover).expect(302)).headers.location).toMatch(/^memory:\/\/private\/events\/\d+\//);
    await http.get(`/events/${priv.guestUrl.split('/e/')[1]}/cover`).expect(404);

    // Lookup: email is case-insensitive, guest passcode must NOT work, client code returns all of that client's events
    await http.post('/events/lookup').send({ email: 'cy@test.dev', code: 'GALA' }).expect(401);
    await http.post('/events/lookup').send({ email: 'other@test.dev', code: pub.clientCode }).expect(401);
    const found = (await http.post('/events/lookup').send({ email: ' CY@test.dev ', code: pub.clientCode.toLowerCase() }).expect(201)).body;
    expect(found.map((e: { name: string }) => e.name).sort()).toEqual(['Open Gala', 'Private Party']);
    expect(found.find((e: { name: string }) => e.name === 'Open Gala')).toMatchObject({ photoCount: 1, clientPath: pub.clientUrl.replace(/^.*(?=\/c\/)/, '') });

    // Admin can unlist it again
    await http.patch(`/admin/events/${pub.id}`).set('Authorization', admin).send({ isPublic: false }).expect(200);
    expect((await http.get('/events').expect(200)).body).toEqual([]);
  });

  it('publishes past-event showcases, photos only, one photo per upload', async () => {
    const http = request(app.getHttpServer());
    await http.post('/admin/showcases').send({ title: 'X', eventDate: '2026-01-01' }).expect(401);
    await http.post('/admin/showcases').set('Authorization', admin).send({ title: 'X', eventDate: 'nope' }).expect(400);

    const created = (
      await http
        .post('/admin/showcases')
        .set('Authorization', admin)
        .send({ title: 'Gala Night', eventDate: '2026-03-14', location: 'Manila Hotel', description: 'A night to remember.' })
        .expect(201)
    ).body;
    expect(created.photos).toEqual([]);
    const addPhoto = (name: string) => http.post(`/admin/showcases/${created.id}/photos`).set('Authorization', admin).attach('photo', JPEG, name);
    await addPhoto('clip.mp4').expect(400);
    await addPhoto('a.jpg').expect(201);
    const withPhotos = (await addPhoto('b.png').expect(201)).body;
    expect(withPhotos.photos).toHaveLength(2);
    expect(Object.keys(withPhotos.photos[0]).sort()).toEqual(['file', 'id']);
    const [first, second] = withPhotos.photos as { id: number; file: string }[];
    expect(store.has('public', first.file) && store.has('public', second.file)).toBe(true);

    const list = (await http.get('/showcases').expect(200)).body;
    expect(list).toEqual([expect.objectContaining({ title: 'Gala Night', location: 'Manila Hotel', photoCount: 2, cover: first.file })]);

    // Edit fields, then remove one photo
    expect((await http.patch(`/admin/showcases/${created.id}`).set('Authorization', admin).send({ title: 'Gala Night 2026' }).expect(200)).body).toMatchObject({
      title: 'Gala Night 2026',
      location: 'Manila Hotel',
    });
    await http.delete(`/admin/showcases/${created.id}/photos/${first.id}`).set('Authorization', admin).expect(200);
    expect(store.has('public', first.file)).toBe(false);
    expect((await http.get(`/showcases/${created.id}`).expect(200)).body.photos).toHaveLength(1);

    // Deleting the showcase removes its remaining files
    await http.delete(`/admin/showcases/${created.id}`).set('Authorization', admin).expect(200);
    await http.get(`/showcases/${created.id}`).expect(404);
    expect(store.has('public', second.file)).toBe(false);
  });

  it('lets the admin design the guest upload page per event', async () => {
    const http = request(app.getHttpServer());
    const event = (
      await http.post('/admin/events').set('Authorization', admin).send({ name: 'Rose Gala', clientName: 'R', eventDate: new Date().toISOString().slice(0, 10) }).expect(201)
    ).body;
    const slug = event.guestUrl.split('/e/')[1];
    expect((await http.get(`/guest/${slug}`).expect(200)).body.design).toEqual({ background: null });

    await http.put(`/admin/events/${event.id}/design`).field('title', 'x').expect(401);
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('color', 'pink').expect(400);
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('panel', 'neon').expect(400);
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).attach('background', JPEG, 'clip.mp4').expect(400);
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('title', 'x'.repeat(81)).expect(400);

    const saved = (
      await http
        .put(`/admin/events/${event.id}/design`)
        .set('Authorization', admin)
        .field('title', 'Welcome to the Gala')
        .field('message', 'Share your mirror moments!')
        .field('uploadMessage', 'Pick your favourites')
        .field('dateText', 'Saturday, 23 October · Manila Hotel')
        .field('hideDate', 'false')
        .field('thanks', 'Thank you, darling')
        .field('color', '#B5546F')
        .field('panel', 'tint')
        .attach('background', JPEG, 'bg.jpg')
        .expect(200)
    ).body;
    expect(saved).toMatchObject({ title: 'Welcome to the Gala', uploadMessage: 'Pick your favourites', dateText: 'Saturday, 23 October · Manila Hotel', color: '#B5546F', panel: 'tint', background: expect.stringMatching(/^backgrounds\/[\w-]+\.jpg$/) });
    expect((await http.get(`/guest/${slug}`).expect(200)).body.design).toEqual(saved);
    expect(store.has('public', saved.background)).toBe(true);

    // PUT replaces the design: fields left out are cleared, and the background can be removed
    const cleared = (
      await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('message', 'Smile!').field('hideDate', 'true').field('removeBackground', 'true').expect(200)
    ).body;
    expect(cleared).toEqual({ message: 'Smile!', hideDate: true, background: null });
    expect(store.has('public', saved.background)).toBe(false);
  });

  it('lets the admin pick the note card template and the message and headline fonts', async () => {
    const http = request(app.getHttpServer());
    const ev = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Fonts', clientName: 'F', eventDate: new Date().toISOString().slice(0, 10) }).expect(201)).body;
    const slug = ev.guestUrl.split('/e/')[1];
    const design = (fields: Record<string, string>) => {
      const req = http.put(`/admin/events/${ev.id}/design`).set('Authorization', admin);
      for (const [k, v] of Object.entries(fields)) req.field(k, v);
      return req;
    };
    await design({ noteTemplate: 'neon' }).expect(400);
    await design({ noteFont: 'comic-sans' }).expect(400);
    await design({ headlineFont: 'papyrus' }).expect(400);

    const saved = (await design({ noteTemplate: 'midnight', noteFont: 'great-vibes', headlineFont: 'cinzel' }).expect(200)).body;
    expect(saved).toMatchObject({ noteTemplate: 'midnight', noteFont: 'great-vibes', headlineFont: 'cinzel' });
    expect((await http.get(`/guest/${slug}`).expect(200)).body.design).toMatchObject({ noteTemplate: 'midnight', noteFont: 'great-vibes', headlineFont: 'cinzel' });

    // The defaults (classic cream, Caveat, Playfair) are stored as "unset", so existing events keep today's look
    const reset = (await design({ noteTemplate: 'cream', noteFont: 'caveat', headlineFont: 'playfair' }).expect(200)).body;
    expect(reset).not.toHaveProperty('noteTemplate');
    expect(reset).not.toHaveProperty('noteFont');
    expect(reset).not.toHaveProperty('headlineFont');
  });

  it('shows guests every note beside its photo only while the admin allows it', async () => {
    const http = request(app.getHttpServer());
    const event = (
      await http.post('/admin/events').set('Authorization', admin).send({ name: 'Notes Party', clientName: 'N', eventDate: new Date().toISOString().slice(0, 10), passcode: 'notes' }).expect(201)
    ).body;
    const slug = event.guestUrl.split('/e/')[1];
    // Several photos from one guest here; the per-device limit has its own test
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    const unlock = async (name: string) => (await http.post(`/guest/${slug}/unlock`).send({ name, passcode: 'notes' }).expect(201)).body.token as string;
    const share = async (token: string, message: string) => {
      const note = (await http.post(`/guest/${slug}/messages`).set('Authorization', `Bearer ${token}`).send({ message }).expect(201)).body;
      await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${token}`).field('messageId', String(note.id)).attach('photos', JPEG, 'p.jpg').expect(201);
    };
    const wall = async (token: string) => (await http.get(`/guest/${slug}/wall`).set('Authorization', `Bearer ${token}`).expect(200)).body.photos;
    const setNotes = (on: boolean) => http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '0').field('showMessages', String(on)).expect(200);
    const [ana, ben] = [await unlock('Tita Ana'), await unlock('Ben')];

    await share(ana, 'Written before the switch');
    expect((await setNotes(true)).body.showMessages).toBe(true);
    await share(ana, 'Congrats, you two!');
    await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${ben}`).attach('photos', JPEG, 'c.jpg').expect(201);

    const photos = await wall(ben);
    expect(photos.map((p: { note?: unknown }) => p.note ?? null)).toEqual([
      null,
      { name: 'Tita Ana', body: 'Congrats, you two!' },
      { name: 'Tita Ana', body: 'Written before the switch' },
    ]);
    expect((await http.get(`/guest/${slug}`).expect(200)).body.design.showMessages).toBe(true);

    // Switching off hides every note again
    expect((await setNotes(false)).body).not.toHaveProperty('showMessages');
    expect(JSON.stringify(await wall(ben))).not.toMatch(/Congrats|Written before/);
  });

  it('shows guests a photo-only wall and keeps messages private to the client', async () => {
    const http = request(app.getHttpServer());
    const event = (
      await http.post('/admin/events').set('Authorization', admin).send({ name: 'Wall Party', clientName: 'W', eventDate: new Date().toISOString().slice(0, 10), passcode: 'wall' }).expect(201)
    ).body;
    const slug = event.guestUrl.split('/e/')[1];
    // Several photos from one guest here; the per-device limit has its own test
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    const clientToken = event.clientUrl.split('/c/')[1];
    const unlock = async (name: string) => (await http.post(`/guest/${slug}/unlock`).send({ name, passcode: 'wall' }).expect(201)).body.token as string;
    const [ana, ben] = [await unlock('Tita Ana'), await unlock('Ben')];

    await http.get(`/guest/${slug}/wall`).expect(401);
    await http.post(`/guest/${slug}/messages`).send({ message: 'hi' }).expect(401);
    await http.post(`/guest/${slug}/messages`).set('Authorization', `Bearer ${ana}`).send({ message: '  ' }).expect(400);

    // Ana leaves a note with two photos; Ben uploads one photo, no note
    const note = (await http.post(`/guest/${slug}/messages`).set('Authorization', `Bearer ${ana}`).send({ name: 'Someone Else', message: 'Congrats, you two!' }).expect(201)).body;
    for (const name of ['a.jpg', 'b.jpg']) {
      await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${ana}`).field('messageId', String(note.id)).attach('photos', JPEG, name).expect(201);
    }
    await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${ben}`).field('messageId', '999999').attach('photos', JPEG, 'x.jpg').expect(400);
    await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${ben}`).attach('photos', JPEG, 'c.jpg').expect(201);

    // Ben sees all three photos, and nothing but photos
    const wall = (await http.get(`/guest/${slug}/wall`).set('Authorization', `Bearer ${ben}`).expect(200)).body;
    expect(wall.enabled).toBe(true);
    expect(wall.photos).toHaveLength(3);
    expect(JSON.stringify(wall)).not.toMatch(/Ana|Ben|Congrats/);
    expect(Object.keys(wall.photos[0]).sort()).toEqual(['createdAt', 'id', 'mine', 'url']);
    expect(wall.photos.map((p: { mine: boolean }) => p.mine)).toEqual([true, false, false]); // Ben's photo is newest
    await http.get(wall.photos[0].url).expect(401);
    expect((await http.get(`${wall.photos[0].url}?t=${ben}`).expect(302)).headers.location).toMatch(/^memory:\/\/private\/events\/\d+\//);
    // A token for another event can't read this wall's files
    const other = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Other', clientName: 'O', eventDate: new Date().toISOString().slice(0, 10), passcode: 'other' })).body;
    const otherToken = (await http.post(`/guest/${other.guestUrl.split('/e/')[1]}/unlock`).send({ name: 'Guest', passcode: 'other' })).body.token;
    await http.get(`${wall.photos[0].url}?t=${otherToken}`).expect(401);

    // The client sees the guestbook, with Ana's photos attached to her note
    const gallery = (await http.get(`/client/${clientToken}`).expect(200)).body;
    expect(gallery.messages).toEqual([expect.objectContaining({ name: 'Tita Ana', body: 'Congrats, you two!', photoIds: expect.arrayContaining([expect.any(Number)]) })]);
    expect(gallery.messages[0].photoIds).toHaveLength(2);

    // Admin can switch the wall off for privacy-minded clients
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('showWall', 'false').expect(200);
    expect((await http.get(`/guest/${slug}/wall`).set('Authorization', `Bearer ${ben}`).expect(200)).body).toEqual({ enabled: false, photos: [] });
    await http.get(`${wall.photos[0].url}?t=${ben}`).expect(404);
    expect((await http.get(`/guest/${slug}`).expect(200)).body.design.showWall).toBe(false);
  });

  it('reschedules or extends an event by moving its expiry with the date', async () => {
    const http = request(app.getHttpServer());
    const event = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Moved', clientName: 'M', eventDate: '2099-01-10' }).expect(201)).body;
    const patch = (body: object) => http.patch(`/admin/events/${event.id}`).set('Authorization', admin).send(body);

    await patch({}).expect(400);
    await patch({ eventDate: 'soon' }).expect(400);
    // A past date just leaves it expired (nothing is deleted); a later date brings its links back
    await patch({ eventDate: '2000-01-01' }).expect(200);
    const slug = event.guestUrl.split('/e/')[1];
    expect((await http.get('/admin/events').set('Authorization', admin)).body.find((e: { id: number }) => e.id === event.id)).toMatchObject({ expired: true });
    await http.get(`/guest/${slug}`).expect(410);
    await patch({ eventDate: '2099-02-20' }).expect(200);
    await http.get(`/guest/${slug}`).expect(200);

    const updated = (await http.get('/admin/events').set('Authorization', admin)).body.find((e: { id: number }) => e.id === event.id);
    expect(updated).toMatchObject({ eventDate: '2099-02-20', expiresAt: '2099-03-08T00:00:00.000Z', isPublic: false });
    await patch({ isPublic: true }).expect(200); // listing toggle still works and keeps the date
    expect((await http.get('/admin/events').set('Authorization', admin)).body.find((e: { id: number }) => e.id === event.id)).toMatchObject({ eventDate: '2099-02-20', isPublic: true });
  });

  it('private photo routes redirect only after access checks', async () => {
    const http = request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);
    const make = async (passcode: string) => {
      const e = (await http.post('/admin/events').set('Authorization', admin).send({ name: `Ev ${passcode}`, clientName: 'C', eventDate: today, passcode }).expect(201)).body;
      const slug = e.guestUrl.split('/e/')[1];
      const token = (await http.post(`/guest/${slug}/unlock`).send({ name: 'G', passcode }).expect(201)).body.token as string;
      await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', JPEG, 'p.jpg').expect(201);
      const wall = (await http.get(`/guest/${slug}/wall`).set('Authorization', `Bearer ${token}`).expect(200)).body.photos;
      return { e, slug, token, clientToken: e.clientUrl.split('/c/')[1] as string, photoUrl: wall[0].url as string, photoId: wall[0].id as number };
    };
    const a = await make('aaaa');
    const b = await make('bbbb');

    await http.get(a.photoUrl).expect(401);
    await http.get(`${a.photoUrl}?t=${b.token}`).expect(401); // another event's guest
    await http.get(`/guest/${b.slug}/photos/${a.photoId}?t=${b.token}`).expect(404); // another event's photo id
    await http.get(`/client/${b.clientToken}/photos/${a.photoId}`).expect(404);
    expect((await http.get(`${a.photoUrl}?t=${a.token}`).expect(302)).headers['cache-control']).toMatch(/private/);

    await http.patch(`/admin/events/${a.e.id}`).set('Authorization', admin).send({ eventDate: '2000-01-01' }).expect(200);
    await http.get(`${a.photoUrl}?t=${a.token}`).expect(410);
    await http.get(`/client/${a.clientToken}/photos/${a.photoId}`).expect(410);
    await http.delete('/admin/events/expired').set('Authorization', admin).expect(200);
  });

  it('deleting expired events removes their files and leaves live events alone', async () => {
    const http = request(app.getHttpServer());
    const today = new Date().toISOString().slice(0, 10);
    const old = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Old', clientName: 'O', eventDate: today, passcode: 'oldy' }).expect(201)).body;
    const live = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Live', clientName: 'L', eventDate: today, passcode: 'live' }).expect(201)).body;
    const slug = old.guestUrl.split('/e/')[1];
    // Several photos from one guest here; the per-device limit has its own test
    await http.put(`/admin/events/${old.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    const background = (await http.put(`/admin/events/${old.id}/design`).set('Authorization', admin).field('photoLimit', '0').attach('background', JPEG, 'bg.jpg').expect(200)).body.background as string;
    const token = (await http.post(`/guest/${slug}/unlock`).send({ name: 'G', passcode: 'oldy' }).expect(201)).body.token;
    for (const n of ['1.jpg', '2.jpg']) await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', JPEG, n).expect(201);
    const photoKeys = store.keys('private', `events/${old.id}/`);
    expect(photoKeys).toHaveLength(2);

    await http.delete('/admin/events/expired').expect(401);
    await http.patch(`/admin/events/${old.id}`).set('Authorization', admin).send({ eventDate: '2000-01-01' }).expect(200);
    expect((await http.delete('/admin/events/expired').set('Authorization', admin).expect(200)).body).toEqual({ deleted: 1, photos: 2 });
    expect(photoKeys.some((k) => store.has('private', k))).toBe(false);
    expect(store.has('public', background)).toBe(false);
    await http.get(`/guest/${live.guestUrl.split('/e/')[1]}`).expect(200);
    expect((await http.delete('/admin/events/expired').set('Authorization', admin).expect(200)).body).toEqual({ deleted: 0, photos: 0 });
  });

  it('keeps an event listed when its files could not be deleted, so the delete can be retried', async () => {
    const http = request(app.getHttpServer());
    const ev = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Retry', clientName: 'R', eventDate: new Date().toISOString().slice(0, 10), passcode: 'rtry' }).expect(201)).body;
    const slug = ev.guestUrl.split('/e/')[1];
    // Several photos from one guest here; the per-device limit has its own test
    await http.put(`/admin/events/${ev.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    const token = (await http.post(`/guest/${slug}/unlock`).send({ name: 'G', passcode: 'rtry' }).expect(201)).body.token;
    for (const n of ['1.jpg', '2.jpg', '3.jpg']) await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', JPEG, n).expect(201);
    const keys = store.keys('private', `events/${ev.id}/`);

    store.failNextRemove = true;
    await http.delete(`/admin/events/${ev.id}`).set('Authorization', admin).expect(500);
    await http.get(`/guest/${slug}`).expect(200); // still there, files still referenced
    expect(keys.every((k) => store.has('private', k))).toBe(true);

    await http.delete(`/admin/events/${ev.id}`).set('Authorization', admin).expect(200);
    expect(keys.some((k) => store.has('private', k))).toBe(false);
  });

  it('stores uploads with the content type of their extension, never the one the client claims', async () => {
    const http = request(app.getHttpServer());
    const ev = (await http.post('/admin/events').set('Authorization', admin).send({ name: 'Mime', clientName: 'M', eventDate: new Date().toISOString().slice(0, 10), passcode: 'mime' }).expect(201)).body;
    const slug = ev.guestUrl.split('/e/')[1];
    const token = (await http.post(`/guest/${slug}/unlock`).send({ name: 'G', passcode: 'mime' }).expect(201)).body.token;
    await http.post(`/guest/${slug}/photos`).set('Authorization', `Bearer ${token}`).attach('photos', JPEG, { filename: 'evil.jpg', contentType: 'text/html' }).expect(201);
    const [key] = store.keys('private', `events/${ev.id}/`);
    expect(store.contentType('private', key)).toBe('image/jpeg');
    const file = (await http.post('/admin/catalog/uploads').set('Authorization', admin).attach('image', JPEG, { filename: 'x.png', contentType: 'image/svg+xml' }).expect(201)).body.file;
    expect(store.contentType('public', file)).toBe('image/png');
    await http.delete(`/admin/events/${ev.id}`).set('Authorization', admin).expect(200);
  });

  it('requires a guest name and limits photos per device, one by default', async () => {
    const http = request(app.getHttpServer());
    const event = (
      await http.post('/admin/events').set('Authorization', admin).send({ name: 'Limit Party', clientName: 'L', eventDate: new Date().toISOString().slice(0, 10), passcode: 'snap' }).expect(201)
    ).body;
    const slug = event.guestUrl.split('/e/')[1];
    const clientToken = event.clientUrl.split('/c/')[1];
    const unlock = async (name: string, device?: string) => (await http.post(`/guest/${slug}/unlock`).send({ name, passcode: 'snap', device }).expect(201)).body;
    const up = (auth: string) => http.post(`/guest/${slug}/photos`).set('Authorization', auth).attach('photos', JPEG, 'p.jpg');

    await http.post(`/guest/${slug}/unlock`).send({ passcode: 'snap' }).expect(400);
    await http.post(`/guest/${slug}/unlock`).send({ name: '   ', passcode: 'snap' }).expect(400);

    // Default: one photo per device, and a new name on the same phone doesn't reset it
    const first = await unlock('  Mia   Cruz ', 'phone-mia-0001');
    expect(first).toMatchObject({ name: 'Mia Cruz', uploaded: 0, limit: 1, device: 'phone-mia-0001' });
    await up(`Bearer ${first.token}`).expect(201);
    expect((await up(`Bearer ${first.token}`).expect(400)).body.message).toMatch(/maximum of 1 photo for/);
    const renamed = await unlock('Not Mia', 'phone-mia-0001');
    expect(renamed).toMatchObject({ uploaded: 1, limit: 1 });
    await up(`Bearer ${renamed.token}`).expect(400);

    // Same name on another phone is another guest; a missing or malformed device id gets a fresh one from the server
    const otherPhone = await unlock('Mia Cruz', 'phone-other-0002');
    expect(otherPhone).toMatchObject({ uploaded: 0 });
    await up(`Bearer ${otherPhone.token}`).expect(201);
    const noDevice = await unlock('Leo', '<script>');
    expect(noDevice.device).toMatch(/^[\w-]{8,64}$/);
    expect(noDevice.device).not.toBe('<script>');

    // Uploads fired at once can't slip past the limit, and the refused ones leave no files behind
    const racer = await unlock('Racer', 'phone-race-0003');
    store.putDelayMs = 50;
    const results = await Promise.all(Array.from({ length: 5 }, () => up(`Bearer ${racer.token}`))).finally(() => (store.putDelayMs = 0));
    expect(results.map((r) => r.status).sort()).toEqual([201, 400, 400, 400, 400]);
    expect((await unlock('Racer', 'phone-race-0003')).uploaded).toBe(1);
    expect(store.keys('private', `events/${event.id}/`)).toHaveLength(3);

    // The admin can raise the limit per event; 0 means unlimited
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', 'many').expect(400);
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '3').expect(200);
    const mia = `Bearer ${first.token}`;
    await up(mia).expect(201);
    expect((await up(mia).expect(201)).body).toMatchObject({ uploaded: 3, limit: 3, added: 1 });
    expect((await up(mia).expect(400)).body.message).toMatch(/maximum of 3 photos/);
    expect((await http.get(`/guest/${slug}/me`).set('Authorization', mia).expect(200)).body).toEqual({ name: 'Mia Cruz', uploaded: 3, limit: 3 });
    const leo = `Bearer ${noDevice.token}`;
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('photoLimit', '0').expect(200);
    for (let i = 0; i < 4; i++) await up(leo).expect(201);
    expect((await up(leo).expect(201)).body).toMatchObject({ uploaded: 5, limit: null });

    // Wall marks a guest's own photos by device
    await http.put(`/admin/events/${event.id}/design`).set('Authorization', admin).field('showWall', 'true').expect(200);
    const wall = (await http.get(`/guest/${slug}/wall`).set('Authorization', `Bearer ${otherPhone.token}`).expect(200)).body;
    expect(wall.photos.filter((p: { mine: boolean }) => p.mine)).toHaveLength(1);

    // The client sees who shared each photo
    const gallery = (await http.get(`/client/${clientToken}`).expect(200)).body;
    expect(gallery.photos.map((p: { by: string }) => p.by).sort()).toEqual(['Leo', 'Leo', 'Leo', 'Leo', 'Leo', 'Mia Cruz', 'Mia Cruz', 'Mia Cruz', 'Mia Cruz', 'Racer']);
  });
});
