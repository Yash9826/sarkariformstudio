const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');

test('UnitConverter converts cm/mm/in to pixels', () => {
  assert.equal(FF.UnitConverter.toPixels(3.5, 'cm', 200), 276);
  assert.equal(FF.UnitConverter.toPixels(4.5, 'cm', 200), 354);
  assert.equal(FF.UnitConverter.toPixels(35, 'mm', 200), 276);
  assert.equal(FF.UnitConverter.toPixels(1, 'in', 300), 300);
  assert.equal(FF.UnitConverter.toPixels(200, 'px'), 200);
});

test('UnitConverter rejects bad input with a friendly message', () => {
  assert.throws(() => FF.UnitConverter.toPixels(-1, 'px'), (e) => e instanceof FF.ValidationError && /greater than zero/.test(e.userMessage));
  assert.throws(() => FF.UnitConverter.toPixels(3, 'cm'), FF.ValidationError); // dpi missing
  assert.throws(() => FF.UnitConverter.toPixels(3, 'parsec', 100), FF.ValidationError);
});

test('RuleProfile derives pixels, bytes, labels', () => {
  const r = new FF.RuleProfile({ id: 't', kind: 'photo', width: 3.5, height: 4.5, unit: 'cm', dpi: 200, minKB: 20, maxKB: 50, formats: ['jpg'] });
  assert.equal(r.widthPx, 276);
  assert.equal(r.heightPx, 354);
  assert.equal(r.minBytes, 20 * 1024);
  assert.equal(r.maxBytes, 50 * 1000);
  assert.equal(r.mime, 'image/jpeg');
  assert.equal(r.summary(), 'Photo · 276 × 354 px · 20–50 KB · JPEG');
  assert.equal(r.fileName('ssc'), 'ssc-photo.jpg');
  assert.ok(Object.isFrozen(r));
});

test('RuleProfile validates its input', () => {
  const bad = (spec) => assert.throws(() => new FF.RuleProfile({ id: 'x', kind: 'photo', ...spec }), FF.RuleError);
  bad({ width: 100 }); // height missing
  bad({ width: 100, height: 100, minKB: 50, maxKB: 20 });
  bad({ width: 100, height: 100, formats: ['bmp'] });
  bad({ width: 5, height: 5 });
  bad({ maxKB: 0 });
  assert.throws(() => new FF.RuleProfile({ id: 'x', kind: 'nope' }), FF.RuleError);
});

test('free-size rule with only a size limit', () => {
  const r = new FF.RuleProfile({ id: 'f', kind: 'custom', maxKB: 100 });
  assert.equal(r.hasFixedSize, false);
  assert.equal(r.aspectRatio, null);
  assert.equal(r.dimensionText(), 'Free crop');
  assert.equal(r.sizeText(), 'up to 100 KB');
});

test('ExamRegistry loads the shipped data and merges identical rules', () => {
  const reg = new FF.ExamRegistry(FF.ExamData);
  assert.ok(reg.exams.length >= 25);
  const bank = reg.search('ibps').find((g) => g.exams.some((e) => e.name === 'IBPS PO'));
  const names = bank.exams.map((e) => e.name);
  assert.ok(names.includes('SBI Clerk') && names.includes('RBI Grade B'), 'banking exams share one group');
  assert.deepEqual(bank.kinds, ['photo', 'signature', 'thumb', 'declaration']);

  const ssc = reg.search('ssc cgl')[0];
  assert.ok(ssc.exams.length >= 5);
  assert.ok(!ssc.exams.some((e) => e.body === 'Railways'));

  // NEET has a thumb rule, JEE Main/CUET do not -> separate groups
  const neet = reg.search('neet')[0];
  const jee = reg.search('jee main')[0];
  assert.notEqual(neet.key, jee.key);
  assert.ok(jee.exams.some((e) => e.name === 'CUET UG'));
});

test('ExamRegistry search handles empty / unmatched / multi-word queries', () => {
  const reg = new FF.ExamRegistry(FF.ExamData);
  assert.equal(reg.search('').length, reg.groups.length);
  assert.equal(reg.search('zzzz').length, 0);
  assert.ok(reg.search('railway ntpc').length >= 1);
});

test('ExamRegistry rejects broken data', () => {
  const rules = [{ id: 'r', kind: 'photo', width: 100, height: 100, maxKB: 50 }];
  const exam = { id: 'e', name: 'E', rules: { photo: 'r' } };
  assert.doesNotThrow(() => new FF.ExamRegistry({ rules, exams: [exam] }));
  assert.throws(() => new FF.ExamRegistry({ rules, exams: [{ ...exam, rules: { photo: 'missing' } }] }), FF.RuleError);
  assert.throws(() => new FF.ExamRegistry({ rules, exams: [{ ...exam, rules: { signature: 'r' } }] }), FF.RuleError);
  assert.throws(() => new FF.ExamRegistry({ rules, exams: [exam, exam] }), FF.RuleError);
  assert.throws(() => new FF.ExamRegistry({ rules: [...rules, ...rules], exams: [exam] }), FF.RuleError);
  assert.throws(() => new FF.ExamRegistry(null), FF.RuleError);
});

test('RuleValidator reports pass and fail per check', () => {
  const rule = new FF.RuleProfile({ id: 'p', kind: 'photo', width: 200, height: 230, minKB: 20, maxKB: 50, formats: ['jpg'] });
  const v = new FF.RuleValidator();
  assert.ok(v.validate({ bytes: 30000, mime: 'image/jpeg', width: 200, height: 230 }, rule).passed);

  const bad = v.validate({ bytes: 90000, mime: 'image/png', width: 201, height: 230 }, rule);
  assert.equal(bad.passed, false);
  assert.deepEqual(bad.failures.map((c) => c.id).sort(), ['dimensions', 'format', 'size']);

  const small = v.validate({ bytes: 5000, mime: 'image/jpeg', width: 200, height: 230 }, rule);
  assert.match(small.failures[0].hint, /smaller/);
});

test('RuleValidator supports pixel ranges', () => {
  const rule = new FF.RuleProfile({ id: 'u', kind: 'photo', width: 413, height: 531, widthRange: [350, 1000], heightRange: [350, 1000], minKB: 20, maxKB: 300 });
  const v = new FF.RuleValidator();
  assert.ok(v.validate({ bytes: 50000, mime: 'image/jpeg', width: 800, height: 900 }, rule).passed);
  assert.equal(v.validate({ bytes: 50000, mime: 'image/jpeg', width: 300, height: 900 }, rule).passed, false);
});

test('Logger writes scoped entries and serialises errors to the console', () => {
  const log = FF.Logger.for('test');
  const calls = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...args) => calls.push(['info', ...args]);
  console.error = (...args) => calls.push(['error', ...args]);
  FF.Logger.setSilent(false);
  try {
    log.info('hello', { a: 1 });
    log.error('boom', new FF.CompressionError('x', { code: 'C' }));
  } finally {
    console.info = originalInfo;
    console.error = originalError;
    FF.Logger.setSilent(true);
  }
  assert.equal(calls.length, 2);
  assert.match(calls[0][1], /\[SarkariFormStudio:test\] hello/);
  assert.deepEqual(calls[0][2], { a: 1 });
  assert.equal(calls[1][2].code, 'C');
});

test('SarkariFormStudioError.wrap keeps SarkariFormStudio errors and wraps others', () => {
  const own = new FF.ImageLoadError('x');
  assert.equal(FF.SarkariFormStudioError.wrap(own), own);
  const wrapped = FF.SarkariFormStudioError.wrap(new TypeError('bad'), 'friendly');
  assert.equal(wrapped.userMessage, 'friendly');
  assert.equal(wrapped.code, 'UNEXPECTED');
});
