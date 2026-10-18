const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

const approx = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('CropSession starts centred and respects the aspect ratio', () => {
  const s = new FF.CropSession(1000, 800, 200 / 230);
  const c = s.crop;
  approx(c.w / c.h, 200 / 230);
  assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1000 + 1e-6 && c.y + c.h <= 800 + 1e-6);
  approx(c.y, 0); // height-limited, so it spans the full height
});

test('CropSession.moveBy never leaves the image', () => {
  const s = new FF.CropSession(1000, 800, 1);
  s.moveBy(-5000, -5000);
  assert.deepEqual([s.crop.x, s.crop.y], [0, 0]);
  s.moveBy(9999, 9999);
  approx(s.crop.x + s.crop.w, 1000);
  approx(s.crop.y + s.crop.h, 800);
});

test('CropSession.resizeTo keeps the aspect ratio and the opposite corner', () => {
  const s = new FF.CropSession(1000, 1000, 1);
  s.setZoom(2); // 500x500 centred at 250..750
  const before = s.crop;
  s.resizeTo('se', 900, 700);
  const c = s.crop;
  approx(c.x, before.x);
  approx(c.y, before.y);
  approx(c.w / c.h, 1);
  assert.ok(c.x + c.w <= 1000 && c.y + c.h <= 1000);

  s.resizeTo('nw', -500, -500); // far outside: must clamp
  const d = s.crop;
  assert.ok(d.x >= 0 && d.y >= 0);
  approx(d.w / d.h, 1);
});

test('CropSession free mode lets width and height differ and enforces a minimum', () => {
  const s = new FF.CropSession(1000, 500, null);
  s.resizeTo('se', 900, 100);
  assert.notEqual(Math.round(s.crop.w), Math.round(s.crop.h));
  s.resizeTo('se', s.crop.x - 50, s.crop.y - 50); // dragged past the anchor
  assert.ok(s.crop.w >= FF.CropSession.MIN_SIZE && s.crop.h >= FF.CropSession.MIN_SIZE);
});

test('CropSession zoom shrinks the crop and clamps', () => {
  const s = new FF.CropSession(1000, 1000, 1);
  s.setZoom(4);
  approx(s.crop.w, 250);
  approx(s.zoom, 4);
  s.setZoom(1000);
  approx(s.zoom, FF.CropSession.MAX_ZOOM);
  s.setZoom(0.1);
  approx(s.zoom, 1);
});

test('CropSession rejects invalid input', () => {
  assert.throws(() => new FF.CropSession(0, 10), FF.ValidationError);
  assert.throws(() => new FF.CropSession(10, 10, 1).resizeTo('zz', 1, 1), FF.ValidationError);
});

test('QualitySearch finds the highest quality that fits', async () => {
  // fake encoder: size grows linearly with quality, 100 KB at q=1
  const encode = async (q) => ({ size: Math.round(q * 100000) });
  const hit = await FF.QualitySearch.findHighest(encode, 50000);
  assert.ok(hit.blob.size <= 50000);
  assert.ok(hit.blob.size > 49000, `expected a tight fit, got ${hit.blob.size}`);

  const easy = await FF.QualitySearch.findHighest(encode, 200000);
  assert.equal(easy.quality, 1);

  const impossible = await FF.QualitySearch.findHighest(encode, 1000); // q=0.05 -> 5000
  assert.equal(impossible, null);
});

function fakeJpeg(extra = 100) {
  // SOI + JFIF APP0 (16 bytes) + payload + EOI
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  return Uint8Array.from([0xff, 0xd8, ...app0, ...new Array(extra).fill(7), 0xff, 0xd9]);
}

test('JpegPadder pads to the exact target, keeps structure', () => {
  const src = fakeJpeg();
  for (const target of [src.length + 1, src.length + 4, src.length + 10, 20000, 150000]) {
    const out = FF.JpegPadder.pad(src, target);
    assert.ok(out.length >= target && out.length <= target + 3, `target ${target} got ${out.length}`);
    assert.deepEqual([...out.slice(0, 2)], [0xff, 0xd8]);
    assert.deepEqual([...out.slice(2, 4)], [0xff, 0xe0]); // APP0 stays first
    assert.deepEqual([...out.slice(-2)], [0xff, 0xd9]);
    assert.equal(out[20], 0xff); // COM marker starts right after APP0 (2 + 18 bytes)
    assert.equal(out[21], 0xfe);
  }
});

test('JpegPadder leaves big files alone and rejects non-JPEGs', () => {
  const src = fakeJpeg(500);
  assert.equal(FF.JpegPadder.pad(src, 10), src);
  assert.throws(() => FF.JpegPadder.pad(Uint8Array.from([1, 2, 3, 4, 5]), 100), FF.CompressionError);
});

test('ZipBuilder output is a valid zip', () => {
  const zip = new FF.ZipBuilder(new Date('2026-10-13T10:00:00'));
  const a = Uint8Array.from({ length: 5000 }, (_, i) => i % 251);
  zip.add('photo.jpg', a).add('signature.jpg', Uint8Array.from([1, 2, 3])).add('ünï.txt', new Uint8Array(0));
  const bytes = zip.build();

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--;
  assert.ok(end >= 0, 'end-of-central-directory record exists');
  const entryCount = view.getUint16(end + 10, true);
  let centralOffset = view.getUint32(end + 16, true);
  const names = [];
  for (let i = 0; i < entryCount; i++) {
    assert.equal(view.getUint32(centralOffset, true), 0x02014b50);
    const crc = view.getUint32(centralOffset + 16, true);
    const size = view.getUint32(centralOffset + 24, true);
    const nameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLength));
    names.push(name);
    assert.equal(view.getUint32(localOffset, true), 0x04034b50);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const data = bytes.subarray(dataStart, dataStart + size);
    assert.equal(data.length, size);
    assert.equal(FF.ZipBuilder.crc32(data), crc, `${name} CRC matches`);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  assert.deepEqual(names.sort(), ['photo.jpg', 'signature.jpg', 'ünï.txt']);
  assert.equal(view.getUint32(end + 12, true), centralOffset - view.getUint32(end + 16, true));
});

test('ZipBuilder validates entries', () => {
  const z = new FF.ZipBuilder();
  assert.throws(() => z.build(), FF.ExportError);
  assert.throws(() => z.add('a/b.jpg', new Uint8Array(1)), FF.ExportError);
  assert.throws(() => z.add('', new Uint8Array(1)), FF.ExportError);
  assert.throws(() => z.add('a.jpg', 'text'), FF.ExportError);
  z.add('a.jpg', new Uint8Array(1));
  assert.throws(() => z.add('a.jpg', new Uint8Array(1)), FF.ExportError);
  assert.equal(FF.ZipBuilder.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});
