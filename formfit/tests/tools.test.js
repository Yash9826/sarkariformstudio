const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');
const PDFLib = require('pdf-lib');

test('ConverterRegistry rejects duplicate ids and groups converters', () => {
  const registry = new FF.ConverterRegistry();
  const first = { id: 'one', group: 'Images', convert: async () => ({ outputs: [] }) };
  registry.register(first);
  registry.register({ id: 'two', group: 'PDF', convert: async () => ({ outputs: [] }) });
  assert.equal(registry.get('one'), first);
  assert.deepEqual(registry.byGroup().map((group) => group.group), ['Images', 'PDF']);
  assert.throws(() => registry.register(first), FF.ConversionError);
});

test('ByteSize parses bytes, KB and MB and formats output sizes', () => {
  assert.equal(FF.ByteSize.parse('100 KB'), 102400);
  assert.equal(FF.ByteSize.parse('1.5 MB'), 1572864);
  assert.equal(FF.ByteSize.parse('256'), 256);
  assert.equal(FF.ByteSize.format(2048), '2.0 KB');
  assert.throws(() => FF.ByteSize.parse('0 KB'), FF.ValidationError);
  assert.throws(() => FF.ByteSize.parse('many KB'), FF.ValidationError);
});

test('PageRangeParser expands ranges, removes duplicates and validates input', () => {
  assert.deepEqual(FF.PageRangeParser.parse('1-3, 5, 8-10', 10), [0, 1, 2, 4, 7, 8, 9]);
  assert.deepEqual(FF.PageRangeParser.parse('2, 2, 1', 3), [1, 0]);
  assert.throws(() => FF.PageRangeParser.parse('3-1', 5), /Reversed page range/);
  assert.throws(() => FF.PageRangeParser.parse('12', 9), /Page 12 exceeds page count/);
  assert.throws(() => FF.PageRangeParser.parse('', 9), /Page range is empty/);
  assert.throws(() => FF.PageRangeParser.parse('1,x', 9), /Invalid page range/);
});

test('PdfBuilder generates a readable PDF with one page per image', async () => {
  const bytes = await FF.PdfBuilder.fromImages(
    [{
      bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'),
      mime: 'image/png',
    }],
    { pageSize: 'Fit to image', margin: 'None' },
    PDFLib
  );
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), '%PDF-');
  const loaded = await PDFLib.PDFDocument.load(bytes);
  assert.equal(loaded.getPageCount(), 1);
});

test('PdfBuilder shares a target-size build path for prepared image pages', async () => {
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  const progress = [];
  const bytes = await FF.PdfBuilder.fromImagesToTarget(
    [{ file: { name: 'unused.png' } }],
    { pageSize: 'Fit to image', margin: 'None' },
    PDFLib,
    100000,
    async () => ({ bytes: image, mime: 'image/png' }),
    { signal: null },
    (percent) => progress.push(percent)
  );
  const pdf = await PDFLib.PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(progress.at(-1), 10);
});

test('PdfCompressionSearch returns the first rung that fits and rejects unreachable targets', async () => {
  const calls = [];
  const result = await FF.PdfCompressionSearch.findFirstFit([150, 110, 72], 100, async (dpi, quality) => {
    calls.push([dpi, quality]);
    const size = dpi === 150 ? 160 - quality * 10 : 80 + quality * 10;
    return new Blob([new Uint8Array(Math.ceil(size))]);
  }, { iterations: 4 });
  assert.equal(result.rung, 110);
  assert.ok(result.blob.size <= 100);
  assert.equal(calls.some(([dpi]) => dpi === 72), false);
  await assert.rejects(
    FF.PdfCompressionSearch.findFirstFit([150, 110], 1, async () => new Blob([new Uint8Array(10)])),
    (error) => error instanceof FF.ConversionError && error.code === 'TARGET_UNREACHABLE'
  );
});
