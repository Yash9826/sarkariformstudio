const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

function solidImage(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = color[0];
    data[i * 4 + 1] = color[1];
    data[i * 4 + 2] = color[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

test('BackgroundMasker removes border-connected blue but preserves enclosed blue patches', () => {
  const image = solidImage(40, 40, [30, 100, 200]);
  for (let y = 7; y < 33; y++) {
    for (let x = 10; x < 30; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 210;
      image.data[i + 1] = 60;
      image.data[i + 2] = 50;
    }
  }
  for (let y = 16; y < 23; y++) {
    for (let x = 16; x < 23; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 30;
      image.data[i + 1] = 100;
      image.data[i + 2] = 200;
    }
  }
  const { mask, width } = new FF.BackgroundMasker().computeMask(image, { tolerance: 10, feather: 0 });
  assert.ok(mask[0] > 0.9);
  assert.ok(mask[19 * width + 19] < 0.1);
  assert.ok(mask[5 * width + 20] > 0.9);
});

test('BackgroundMasker tolerance extremes and busy-background quality gate are reported', () => {
  const image = solidImage(40, 40, [20, 120, 190]);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      image.data[i] = 20 + x * 5;
    }
  }
  const masker = new FF.BackgroundMasker();
  const narrow = masker.computeMask(image, { tolerance: 5, feather: 0 });
  const wide = masker.computeMask(image, { tolerance: 60, feather: 0 });
  assert.ok(wide.removedRatio >= narrow.removedRatio);
  assert.equal(wide.quality, 'poor');
  assert.match(wide.reason, /background looks busy/i);
  assert.throws(() => masker.computeMask(image, { tolerance: 4 }), FF.ValidationError);
});

test('BackgroundMasker brush removes and restores mask values', () => {
  const masker = new FF.BackgroundMasker();
  const mask = new Float32Array(25);
  masker.paintMask(mask, 5, 5, 2, 2, 2, true);
  assert.ok(mask[12] > 0.9);
  masker.paintMask(mask, 5, 5, 2, 2, 2, false);
  assert.ok(mask[12] < 0.1);
});

test('DateFormatter supports the three required formats and rejects invalid dates', () => {
  const format = FF.DateFormatter.format;
  assert.equal(format('2026-03-05', 'DD/MM/YYYY'), '05/03/2026');
  assert.equal(format('2026-03-05', 'DD-MM-YYYY'), '05-03-2026');
  assert.equal(format('2026-03-05', 'DD MMM YYYY'), '05 Mar 2026');
  assert.throws(() => format('2026-02-30'), FF.ValidationError);
  assert.throws(() => format('2026-03-05', 'MM/DD/YYYY'), FF.ValidationError);
});

test('photo stamp geometry preserves exact output size and locks crop to picture area', () => {
  const rule = new FF.RuleProfile({
    id: 'stamped-photo', kind: 'photo', width: 200, height: 230, unit: 'px',
    stamp: { required: true, heightRatio: 0.14 },
  });
  assert.equal(rule.stampSpec.required, true);
  assert.equal(rule.effectiveAspect(), 200 / (230 - Math.round(230 * 0.14)));
  const geometry = FF.DateStampStage.geometry(rule, 0.14);
  assert.deepEqual(
    [geometry.width, geometry.height, geometry.pictureHeight + geometry.stripHeight],
    [rule.widthPx, rule.heightPx, rule.heightPx]
  );
  assert.equal(geometry.cropAspect, geometry.width / geometry.pictureHeight);
  assert.throws(() => new FF.RuleProfile({
    id: 'bad-stamp', kind: 'photo', width: 200, height: 230, unit: 'px', stamp: { heightRatio: 0.3 },
  }), FF.RuleError);
});
