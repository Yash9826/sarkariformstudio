const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

function signatureImage(width = 120, height = 80, { blank = false, dark = false, speck = false } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      const paper = dark ? 20 : 205 + Math.round(y * 0.25);
      const stroke = !blank && !dark && x >= 25 && x <= 90 && Math.abs(y - (35 + Math.round((x - 25) * 0.2))) <= 2;
      const pixel = stroke || speck && x === 105 && y === 10 ? 15 : paper;
      data[p] = pixel;
      data[p + 1] = pixel;
      data[p + 2] = pixel;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

test('BoxBlur uses an integral image and returns deterministic averages', () => {
  const values = Float32Array.from([0, 10, 20, 30, 40, 50, 60, 70, 80]);
  const blurred = FF.BoxBlur.blur(values, 3, 3, 1);
  assert.equal(blurred[4], 40);
  assert.equal(blurred[0], 20);
});

test('InkExtractor whitens gradient-lit paper while preserving dark signature ink', () => {
  const source = signatureImage();
  const result = new FF.InkExtractor().extract(source, { strength: 60, removeSpecks: true, autoTrim: true });
  let backgroundPixels = 0;
  let whitePixels = 0;
  let darkInkPixels = 0;
  for (let i = 0; i < source.width * source.height; i++) {
    const x = i % source.width;
    const y = Math.floor(i / source.width);
    const p = i * 4;
    if (!(x >= 25 && x <= 90 && Math.abs(y - (35 + Math.round((x - 25) * 0.2))) <= 3)) {
      backgroundPixels++;
      if (result.imageData.data[p] > 245) whitePixels++;
    } else if (result.imageData.data[p] < 80) darkInkPixels++;
  }
  assert.ok(whitePixels / backgroundPixels >= 0.95, `only ${whitePixels}/${backgroundPixels} background pixels are white`);
  assert.ok(darkInkPixels > 100, 'signature strokes remain dark');
  assert.equal(result.quality, 'good');
  assert.ok(result.crop && result.crop.w > 0);
});

test('InkExtractor removes isolated specks but preserves a large stroke', () => {
  const result = new FF.InkExtractor().extract(signatureImage(140, 90, { speck: true }), { strength: 60, removeSpecks: true });
  const speck = (10 * 140 + 105) * 4;
  assert.ok(result.imageData.data[speck] > 245);
  assert.ok(result.imageData.data[(40 * 140 + 50) * 4] < 80);
});

test('InkExtractor auto-trim respects the requested aspect ratio', () => {
  const result = new FF.InkExtractor().extract(signatureImage(), { strength: 60, autoTrim: true, aspectRatio: 2.3 });
  assert.ok(result.crop);
  assert.ok(Math.abs(result.crop.w / result.crop.h - 2.3) < 1e-8);
});

test('InkExtractor reports faint and dark quality gates', () => {
  const extractor = new FF.InkExtractor();
  const faint = extractor.extract(signatureImage(100, 80, { blank: true }), { strength: 60 });
  const dark = extractor.extract(signatureImage(100, 80, { dark: true }), { strength: 60 });
  assert.equal(faint.quality, 'poor');
  assert.match(faint.reason, /faint or missing/);
  assert.equal(dark.quality, 'poor');
  assert.match(dark.reason, /too dark/);
});
