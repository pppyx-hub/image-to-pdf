import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../pdf-core.js', import.meta.url), 'utf8');
vm.runInThisContext(source, { filename: 'pdf-core.js' });

const { PDFBuilder, planPages, rotatedSize, mmToPt } = globalThis.PDFMaker;

const image = (w, h, rotation = 0) => ({ w, h, rotation });

test('rotatedSize：旋转 90° / 270° 交换宽高，180° 不变', () => {
  assert.deepEqual(rotatedSize(image(1600, 900, 90)), [900, 1600]);
  assert.deepEqual(rotatedSize(image(1600, 900, 270)), [900, 1600]);
  assert.deepEqual(rotatedSize(image(1600, 900, 180)), [1600, 900]);
  assert.deepEqual(rotatedSize(image(1600, 900, -90)), [900, 1600]);
});

test('mmToPt：15 mm ≈ 42.52 pt', () => {
  assert.ok(Math.abs(mmToPt(15) - 42.5197) < 0.001);
});

test('A4 纵向单图：页面尺寸、边距、图片居中且比例不变', () => {
  const items = [image(1600, 1067), image(1000, 1500), image(1200, 1200)];
  const pages = planPages(items, {
    pageSize: 'A4',
    orientation: 'portrait',
    marginMm: 15,
    perPage: 1,
    fit: 'contain'
  });

  assert.equal(pages.length, 3);
  const margin = mmToPt(15);
  for (const page of pages) {
    assert.equal(page.width, 595.28);
    assert.equal(page.height, 841.89);
    const [placed] = page.placements;
    const item = items[pages.indexOf(page)];
    const ratio = placed.w / placed.h;
    assert.ok(Math.abs(ratio - item.w / item.h) < 1e-9);
    assert.ok(placed.x >= margin - 1e-6);
    assert.ok(placed.y >= margin - 1e-6);
    assert.ok(placed.x + placed.w <= page.width - margin + 1e-6);
    assert.ok(placed.y + placed.h <= page.height - margin + 1e-6);
    // 水平、垂直都居中
    assert.ok(Math.abs(placed.x - (page.width - placed.w) / 2) < 1e-6);
    assert.ok(Math.abs(placed.y - (page.height - placed.h) / 2) < 1e-6);
  }
});

test('每页 2 张：上下两格，最后一页只放剩余图片', () => {
  const items = [image(1600, 900), image(900, 1600), image(1000, 1000)];
  const pages = planPages(items, {
    pageSize: 'A4',
    orientation: 'portrait',
    marginMm: 15,
    perPage: 2,
    fit: 'contain'
  });

  assert.equal(pages.length, 2);
  assert.equal(pages[0].placements.length, 2);
  assert.equal(pages[1].placements.length, 1);

  const [top, bottom] = pages[0].placements;
  assert.ok(top.y > bottom.y);
  assert.ok(top.y + top.h <= 841.89);
  assert.ok(bottom.y >= mmToPt(15) - 1e-6);
});

test('cover 模式：图片尺寸严格等于格子，允许裁切', () => {
  const [page] = planPages([image(1600, 900)], {
    pageSize: 'A3',
    orientation: 'landscape',
    marginMm: 8,
    perPage: 1,
    fit: 'cover'
  });

  assert.equal(page.width, 1190.55);
  assert.equal(page.height, 841.89);
  const [placed] = page.placements;
  const margin = mmToPt(8);
  assert.ok(Math.abs(placed.w - (page.width - margin * 2)) < 1e-6);
  assert.ok(Math.abs(placed.h - (page.height - margin * 2)) < 1e-6);
  assert.equal(placed.cover, true);
});

test('自适应纸张：长边 841.89 pt，比例跟随第一张图', () => {
  const [landscape] = planPages([image(1600, 900)], {
    pageSize: 'auto',
    orientation: 'auto',
    marginMm: 15,
    perPage: 1,
    fit: 'contain'
  });
  assert.equal(landscape.width, 841.89);
  assert.ok(Math.abs(landscape.height - 841.89 * 900 / 1600) < 1e-6);

  const [portrait] = planPages([image(900, 1600)], {
    pageSize: 'auto',
    orientation: 'auto',
    marginMm: 15,
    perPage: 1,
    fit: 'contain'
  });
  assert.equal(portrait.height, 841.89);
  assert.ok(Math.abs(portrait.width - 841.89 * 900 / 1600) < 1e-6);
});

test('PDFBuilder：生成带 DCTDecode 图像、页码和合法 xref 的 PDF', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const builder = new PDFBuilder();
  builder.addPage({
    width: 595.28,
    height: 841.89,
    items: [{ jpeg, pxW: 1, pxH: 1, x: 10, y: 10, w: 100, h: 100 }],
    pageNumber: 1
  });
  builder.addPage({ width: 595.28, height: 841.89, items: [], pageNumber: 2 });
  builder.addPage({ width: 595.28, height: 841.89, items: [] });

  const bytes = builder.build({ producer: 'image-to-pdf test' });
  const text = new TextDecoder('latin1').decode(bytes);

  assert.match(text, /^%PDF-1.4/);
  assert.match(text, /\/Type \/Pages /);
  assert.match(text, /\/Count 3/);
  assert.match(text, /\/Filter \/DCTDecode/);
  assert.match(text, /\(1\) Tj/);
  assert.match(text, /\(2\) Tj/);
  assert.match(text, /%%EOF\n$/);

  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(text.slice(startxref, startxref + 4), 'xref');

  // 对象 1 是 Catalog，trailer 指向它
  assert.match(text, /\/Root 1 0 R/);
});
