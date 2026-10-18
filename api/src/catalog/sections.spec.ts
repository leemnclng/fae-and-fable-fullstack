import { BadRequestException } from '@nestjs/common';
import { defaultPage, filesInPage, sanitizePage } from './sections.js';

const products = {
  id: 'a',
  type: 'products',
  productType: 'mirror',
  heading: 'Mirrors',
  layout: 'grid',
  columns: 3,
  showPrices: true,
  pick: 'all',
  background: 'white',
  backgroundImage: null,
};

it('keeps a valid page and fills defaults for missing fields', () => {
  const [s] = sanitizePage([{ id: 'a', type: 'cta' }]);
  expect(s).toEqual({ id: 'a', type: 'cta', hidden: false, heading: '', text: '', buttonLabel: 'Inquire', background: 'white', backgroundImage: null });
});

it('drops unknown section types and unknown keys', () => {
  expect(sanitizePage([{ id: 'x', type: 'iframe' }, { ...products, evil: 1 }])).toEqual([{ ...products, hidden: false }]);
});

it('rejects non-arrays, more than 30 sections, and oversized text', () => {
  expect(() => sanitizePage({})).toThrow(BadRequestException);
  expect(() => sanitizePage(Array.from({ length: 31 }, (_, i) => ({ id: `s${i}`, type: 'cta' })))).toThrow(BadRequestException);
  expect(() => sanitizePage([{ id: 'a', type: 'cta', heading: 'x'.repeat(121) }])).toThrow(BadRequestException);
});

it('only allows safe links and plain image names', () => {
  const [s] = sanitizePage([
    {
      id: 'a',
      type: 'slideshow',
      slides: [
        { image: '../etc/passwd', buttonHref: 'javascript:alert(1)' },
        { image: 'ok.jpg', buttonHref: '/catalog#mirrors' },
      ],
    },
  ]);
  expect(s.type === 'slideshow' && s.slides.map((x) => [x.image, x.buttonHref])).toEqual([
    [null, ''],
    ['ok.jpg', '/catalog#mirrors'],
  ]);
});

it('clamps numbers and enums to allowed values', () => {
  const [s] = sanitizePage([{ ...products, columns: 9, layout: 'masonry', pick: [1, 'two', 3] }]);
  expect(s).toMatchObject({ columns: 3, layout: 'grid', pick: [1, 3] });
});

it('default page uses the banner and lists its files', () => {
  const page = defaultPage('banner.jpg');
  expect(page.map((s) => s.type)).toEqual(['slideshow', 'products', 'products', 'cta']);
  expect(filesInPage(page)).toEqual(['banner.jpg']);
});
