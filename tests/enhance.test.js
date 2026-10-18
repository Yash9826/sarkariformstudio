const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

function image(values) {
  const data = new Uint8ClampedArray(values.length * 4);
  values.forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 20;
  });
  return { data, width: values.length, height: 1 };
}

test('LevelsAdjuster uses brightness LUTs, keeps alpha opaque and clamps values', () => {
  const adjuster = new FF.LevelsAdjuster();
  const input = image([100, 250]);
  const brighter = adjuster.apply(input, { brightness: 50 });
  assert.equal(brighter.data[0], 228);
  assert.equal(brighter.data[3], 255);
  const clipped = adjuster.apply(input, { brightness: 100 });
  assert.equal(clipped.data[4], 255);
  assert.notEqual(brighter.data, input.data);
});

test('LevelsAdjuster contrast zero is identity and contrast is applied before brightness', () => {
  const adjuster = new FF.LevelsAdjuster();
  const input = image([0, 64, 128, 192, 255]);
  const identity = adjuster.apply(input, { contrast: 0, brightness: 0 });
  assert.deepEqual([...identity.data.filter((_, index) => index % 4 !== 3)], [0, 0, 0, 64, 64, 64, 128, 128, 128, 192, 192, 192, 255, 255, 255]);
  const contrasted = adjuster.apply(image([64]), { contrast: 40, brightness: 10 });
  assert.ok(contrasted.data[0] < 64 + 26);
});

test('LevelsAdjuster auto-levels stretches a synthetic gradient', () => {
  const adjuster = new FF.LevelsAdjuster();
  const input = image([40, 80, 120, 160, 200]);
  const result = adjuster.apply(input, { autoLevels: true });
  assert.equal(result.data[0], 0);
  assert.equal(result.data[16], 255);
  assert.ok(result.data[8] > 100 && result.data[8] < 160);
});

test('EnhanceOptions defaults are kind-aware, immutable and validated', () => {
  const photo = FF.EnhanceOptions.defaults('photo');
  const signature = FF.EnhanceOptions.defaults('signature');
  assert.equal(photo.cleanup.enabled, false);
  assert.equal(signature.cleanup.enabled, true);
  assert.ok(Object.isFrozen(photo) && Object.isFrozen(photo.background));
  const changed = photo.with({ brightness: 25, background: { tolerance: 35 } });
  assert.equal(changed.brightness, 25);
  assert.equal(changed.background.tolerance, 35);
  assert.equal(changed.background.color, photo.background.color);
  assert.equal(photo.brightness, 0);
  assert.throws(() => photo.with({ contrast: 101 }), FF.ValidationError);
  assert.throws(() => photo.with({ stamp: { heightRatio: 0.3 } }), FF.ValidationError);
});

test('ProcessingPipeline runs enabled stages in order and wraps failures', async () => {
  const calls = [];
  const stages = [
    { id: 'first', label: 'First', isEnabled: () => true, apply: async (value) => { calls.push('first'); return value + 1; } },
    { id: 'skip', label: 'Skip', isEnabled: () => false, apply: (value) => value },
    { id: 'last', label: 'Last', isEnabled: () => true, apply: (value) => { calls.push('last'); return value * 2; } },
  ];
  const result = await new FF.ProcessingPipeline(stages).run(2);
  assert.deepEqual(calls, ['first', 'last']);
  assert.equal(result, 6);
  const failure = new FF.ProcessingPipeline([
    { id: 'broken', label: 'Broken stage', isEnabled: () => true, apply: () => { throw new Error('boom'); } },
  ]);
  await assert.rejects(failure.run({}), (error) => error instanceof FF.ProcessingError && error.code === 'STAGE_FAILED' && error.details.stageId === 'broken');
});

test('ColorMath converts neutral RGB colours to neutral Lab values', () => {
  const lab = FF.ColorMath.rgbToLab(128, 128, 128);
  assert.ok(Math.abs(lab[1]) < 0.01);
  assert.ok(Math.abs(lab[2]) < 0.01);
});
