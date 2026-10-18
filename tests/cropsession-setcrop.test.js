const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

test('CropSession.setCrop clamps to the image and enforces the active aspect', () => {
  const session = new FF.CropSession(400, 300, 2);
  session.setCrop({ x: -50, y: 10, w: 500, h: 200 });
  const crop = session.crop;
  assert.ok(crop.x >= 0 && crop.y >= 0);
  assert.ok(crop.x + crop.w <= 400 && crop.y + crop.h <= 300);
  assert.ok(Math.abs(crop.w / crop.h - 2) < 1e-8);
  assert.ok(crop.w >= FF.CropSession.MIN_SIZE);
});

test('CropSession.setCrop supports free crops and rejects invalid rectangles', () => {
  const session = new FF.CropSession(400, 300);
  session.setCrop({ x: 380, y: 290, w: 100, h: 80 });
  const crop = session.crop;
  assert.ok(crop.x + crop.w <= 400 && crop.y + crop.h <= 300);
  assert.throws(() => session.setCrop({ x: 0, y: 0, w: 0, h: 10 }), FF.ValidationError);
  assert.throws(() => session.setCrop(null), FF.ValidationError);
});
