const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, webcrypto } = require('node:crypto');
const FF = require('./helpers/load');

function rgba(width, height, color = [0, 0, 0]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data.set([...color, 255], i * 4);
  }
  return { data, width, height };
}

test('GuidedFilter preserves a constant matte and sharpens a matte at an image edge', () => {
  const flatImage = rgba(9, 3, [100, 100, 100]);
  const constant = FF.GuidedFilter.apply(new Float32Array(27).fill(0.4), flatImage, { radius: 2 });
  assert.ok([...constant].every((value) => Math.abs(value - 0.4) < 0.01));

  const guide = rgba(9, 1);
  for (let x = 5; x < 9; x++) guide.data.fill(255, x * 4, x * 4 + 3);
  const matte = Float32Array.from([0, 0, 0.1, 0.3, 0.7, 0.9, 1, 1, 1]);
  const refined = FF.GuidedFilter.apply(matte, guide, { radius: 2, epsilon: 0.001 });
  assert.ok(refined[3] < matte[3]);
  assert.ok(refined[5] > matte[5]);
  assert.ok([...refined].every((value) => value >= 0 && value <= 1));
});

test('AlphaRefiner grows/shrinks masks monotonically and feathers within range', () => {
  const alpha = new Float32Array(49);
  alpha[24] = 1;
  const shrunk = FF.AlphaRefiner.refine(alpha, 7, 7, { edgeShift: -1, feather: 0, smooth: 0 });
  const grown = FF.AlphaRefiner.refine(alpha, 7, 7, { edgeShift: 1, feather: 0, smooth: 0 });
  assert.ok(grown.reduce((sum, value) => sum + value, 0) > alpha.reduce((sum, value) => sum + value, 0));
  assert.ok(shrunk.reduce((sum, value) => sum + value, 0) < alpha.reduce((sum, value) => sum + value, 0));
  const feathered = FF.AlphaRefiner.refine(grown, 7, 7, { feather: 2, smooth: 0 });
  assert.ok(feathered[24] < 1 && feathered[24] > 0);
  assert.ok([...feathered].every((value) => value >= 0 && value <= 1));
});

test('Compositor handles opaque, transparent and partially transparent pixels', () => {
  const source = rgba(3, 1, [200, 100, 0]);
  const cutout = { width: source.width, height: source.height, rgba: source.data, alpha: new Float32Array([1, 0, 0.5]) };
  const solid = FF.Compositor.composite(cutout, null, { type: 'solid', color: '#FFFFFF' }).data;
  assert.deepEqual([...solid.slice(0, 4)], [200, 100, 0, 255]);
  assert.deepEqual([...solid.slice(4, 8)], [255, 255, 255, 255]);
  assert.deepEqual([...solid.slice(8, 12)], [228, 178, 128, 255]);
  const transparent = FF.Compositor.composite(cutout, null, { type: 'transparent' }).data;
  assert.equal(transparent[3], 255);
  assert.equal(transparent[7], 0);
  assert.equal(transparent[11], 128);
});

test('BrushMask supports restore, erase, undo, redo, and boundary strokes', () => {
  const original = new Float32Array(25).fill(1);
  const brush = new FF.BrushMask(original, 5, 5);
  assert.equal(brush.stroke({ x: 0, y: 0 }, { x: 0, y: 0 }, { radius: 2, mode: 'erase' }), true);
  const erased = brush.alpha;
  assert.ok(erased[0] < 1);
  assert.equal(brush.undo(), true);
  assert.deepEqual([...brush.alpha], [...original]);
  assert.equal(brush.redo(), true);
  assert.deepEqual([...brush.alpha], [...erased]);
  assert.equal(brush.stroke({ x: 0, y: 0 }, { x: 0, y: 0 }, { radius: 2, mode: 'restore' }), true);
  assert.ok(brush.alpha[0] > erased[0]);
});

test('CutoutCache clones values, evicts least recently used entries, and clears', () => {
  const cache = new FF.CutoutCache(2);
  const a = rgba(2, 2, [1, 2, 3]);
  const b = rgba(2, 2, [4, 5, 6]);
  const c = rgba(2, 2, [7, 8, 9]);
  const cutout = (value) => ({ rgba: new Uint8ClampedArray([value]), alpha: new Float32Array([value]) });
  cache.set(a, cutout(1));
  cache.set(b, cutout(2));
  const copy = cache.get(a);
  copy.alpha[0] = 0;
  assert.equal(cache.get(a).alpha[0], 1);
  cache.set(c, cutout(3));
  assert.equal(cache.get(b), null);
  cache.clear();
  assert.equal(cache.get(a), null);
});

test('CutoutService keeps successful AI inference instead of falling back', async () => {
  const image = rgba(2, 2, [100, 120, 140]);
  let fallbackCalls = 0;
  const alpha = new Float32Array([1, 1, 0.5, 0]);
  const service = new FF.CutoutService({
    modelLoader: { load: async () => new ArrayBuffer(0) },
    workerClient: { infer: async () => ({ alpha, quality: 'good', reason: null }) },
    fallback: { computeMask: () => { fallbackCalls++; throw new Error('Fallback must not run'); } },
  });
  const result = await service.remove(image);
  assert.equal(result.mode, 'ai');
  assert.deepEqual([...result.alpha], [...alpha]);
  assert.equal(fallbackCalls, 0);
});

test('CutoutService can disable AI and use the basic fallback', async () => {
  const image = rgba(2, 2, [100, 120, 140]);
  let modelLoads = 0;
  const service = new FF.CutoutService({
    modelLoader: { load: async () => { modelLoads++; return new ArrayBuffer(0); } },
    workerClient: { infer: async () => { throw new Error('AI must not run'); } },
    fallback: { computeMask: () => ({ mask: new Float32Array(4), quality: 'good', removedRatio: 0 }) },
  });
  const result = await service.remove(image, { allowAI: false });
  assert.equal(result.mode, 'basic');
  assert.equal(modelLoads, 0);
});

test('FaceFramer uses head dimensions and blocks ambiguous multiple faces', () => {
  const preset = { outputPx: { w: 2, h: 3 }, headRatio: { min: 0.6, target: 0.75, max: 0.85 }, topMarginRatio: 0.05 };
  const result = FF.FaceFramer.frame({
    imageWidth: 200, imageHeight: 300,
    faceMetrics: { faceCount: 1, faceCentreX: 100, width: 40, headTopY: 50, chinY: 170 },
    preset,
  });
  assert.equal(result.cropRect.h, 160);
  assert.ok(Math.abs(result.cropRect.w - 160 * 2 / 3) < 1e-9);
  assert.equal(result.cropRect.x, 100 - result.cropRect.w / 2);
  assert.equal(result.cropRect.y, 42);
  assert.equal(result.headRatioAchieved, 0.75);
  assert.throws(() => FF.FaceFramer.frame({
    imageWidth: 200, imageHeight: 300,
    faceMetrics: { faceCount: 2, faces: [{ area: 100 }, { area: 60 }] },
    preset,
  }), (error) => error.code === 'MULTIPLE_FACES');
});

test('FaceAnalyzer extracts pixel-space face landmarks and roll', () => {
  const landmarks = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
  landmarks[33] = { x: 0.4, y: 0.3 };
  landmarks[133] = { x: 0.42, y: 0.3 };
  landmarks[263] = { x: 0.58, y: 0.31 };
  landmarks[362] = { x: 0.6, y: 0.31 };
  landmarks[1] = { x: 0.5, y: 0.45 };
  landmarks[152] = { x: 0.5, y: 0.7 };
  landmarks[10] = { x: 0.3, y: 0.2 };
  landmarks[234] = { x: 0.3, y: 0.5 };
  landmarks[454] = { x: 0.7, y: 0.5 };
  landmarks[152] = { x: 0.5, y: 0.8 };
  const metrics = FF.FaceAnalyzer.metrics(landmarks, 100, 100);
  assert.equal(metrics.chinY, 80);
  assert.equal(metrics.headTopY, 20);
  assert.equal(metrics.width, 40);
  assert.equal(metrics.area, 2400);
  assert.deepEqual(metrics.eyeLeft, { x: 41, y: 30 });
  assert.deepEqual(metrics.eyeRight, { x: 59, y: 31 });
  assert.ok(Math.abs(metrics.rollDeg - (Math.atan2(1, 18) * 180 / Math.PI)) < 1e-9);
  assert.equal(FF.FaceAnalyzer.metrics([], 100, 100), null);
});

test('SheetLayout packs expected photo counts and stays within margins', () => {
  const strip = FF.SheetLayout.compute('4x6', { w: 35, h: 45 });
  assert.equal(strip.count, 8);
  assert.equal(strip.orientation, 'Landscape');
  const a4 = FF.SheetLayout.compute('A4', { w: 35, h: 45 });
  assert.equal(a4.count, 30);
  for (const position of a4.positions) {
    assert.ok(position.x >= 3 && position.y >= 3);
    assert.ok(position.x + position.w <= 207 && position.y + position.h <= 294);
  }
  assert.equal(FF.SheetLayout.compute({ w: 10, h: 10 }, { w: 20, h: 20 }).count, 0);
});

test('TextFitter uses two lines when each fits and warns when text is too small', () => {
  const measure = (text, size) => text.length * size * 0.5;
  const fit = FF.TextFitter.fit('NAME', '01/01/2025', 100, measure);
  assert.equal(fit.lines.length, 2);
  assert.ok(measure(fit.lines[0], fit.fontSize) <= 94);
  const tiny = FF.TextFitter.fit('A'.repeat(200), '', 20, measure);
  assert.equal(tiny.warning, true);
});

test('ComplianceChecker reports measurable failures without claiming approval', () => {
  const result = FF.ComplianceChecker.check({
    width: 600, height: 600, mime: 'image/jpeg', bytes: 1000, headRatio: 0.8,
    centerOffset: 0, tiltDeg: 0, faceCount: 1,
    expected: { width: 600, height: 600, mime: 'image/jpeg', minBytes: 500, maxBytes: 2000, headRatio: { min: 0.5, max: 0.9 } },
  });
  assert.equal(result.checks.every((check) => check.status === 'pass'), true);
  assert.ok(!result.summary.toLowerCase().includes('approved'));
  const failed = FF.ComplianceChecker.check({ width: 1, height: 1, expected: { width: 10, height: 10 } });
  assert.equal(failed.checks[0].status, 'fail');
});

test('ImageDensity patches/read JPEG and PNG density metadata', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const jpegWithDpi = FF.ImageDensity.patch(jpeg, 300);
  assert.deepEqual(FF.ImageDensity.read(jpegWithDpi), { x: 300, y: 300, unit: 'dpi' });
  assert.deepEqual([...jpeg], [0xff, 0xd8, 0xff, 0xd9]);

  const png = Uint8Array.from([
    137, 80, 78, 71, 13, 10, 26, 10,
    0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0,
  ]);
  const pngWithDpi = FF.ImageDensity.patch(png, 300);
  const density = FF.ImageDensity.read(pngWithDpi);
  assert.equal(density.unit, 'dpi');
  assert.ok(Math.abs(density.x - 300) < 0.1);
  assert.ok(Math.abs(density.y - 300) < 0.1);
});

test('PassportPresetRegistry derives custom dimensions at the requested DPI', () => {
  const registry = new FF.PassportPresetRegistry([{ id: 'custom', label: 'Custom', group: 'Custom' }]);
  const preset = registry.deriveCustom({ width: 35, height: 45, unit: 'mm', dpi: 300 });
  assert.equal(preset.outputPx.w, 413);
  assert.equal(preset.outputPx.h, 531);
  assert.throws(() => registry.deriveCustom({ width: 35, height: 45, dpi: -1 }), FF.ValidationError);
});

test('ModelLoader verifies, reports progress, caches only the model, and reuses cache', async () => {
  const payload = new Uint8Array([1, 2, 3, 4, 5]);
  const sha256 = createHash('sha256').update(payload).digest('hex');
  let requests = 0;
  const stores = new Map();
  const cacheStorage = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        match: async (key) => entries.get(key) || null,
        put: async (key, value) => entries.set(key, value),
        delete: async (key) => entries.delete(key),
      };
    },
  };
  const loader = new FF.ModelLoader({
    url: 'vendor/models/test.onnx',
    sha256,
    cacheStorage,
    cryptoApi: webcrypto,
    fetcher: async () => { requests++; return new Response(payload); },
  });
  const progress = [];
  const first = await loader.load({ onProgress: (percent) => progress.push(percent) });
  assert.deepEqual([...new Uint8Array(first)], [...payload]);
  assert.equal(progress.at(-1), 100);
  const second = await loader.load();
  assert.deepEqual([...new Uint8Array(second)], [...payload]);
  assert.equal(requests, 1);
});

test('ModelLoader surfaces a failed request and permits a later retry', async () => {
  const payload = new Uint8Array([8, 9]);
  const sha256 = createHash('sha256').update(payload).digest('hex');
  let requests = 0;
  const loader = new FF.ModelLoader({
    url: 'model.onnx', sha256, cacheStorage: null, cryptoApi: webcrypto,
    fetcher: async () => {
      requests++;
      if (requests === 1) throw new Error('offline');
      return new Response(payload);
    },
  });
  await assert.rejects(loader.load(), (error) => error.code === 'MODEL_DOWNLOAD_FAILED');
  assert.deepEqual([...new Uint8Array(await loader.load())], [...payload]);
  assert.equal(requests, 2);
});

test('ModelLoader rejects a model with an incorrect SHA-256 digest', async () => {
  const loader = new FF.ModelLoader({
    url: 'model.onnx', sha256: '0'.repeat(64), cacheStorage: null, cryptoApi: webcrypto,
    fetcher: async () => new Response(new Uint8Array([1, 2, 3])),
  });
  await assert.rejects(loader.load(), (error) => error.code === 'MODEL_CORRUPT');
});
