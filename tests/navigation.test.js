const test = require('node:test');
const assert = require('node:assert/strict');
const FF = require('./helpers/load');
require('../data/site-config');
require('../data/photo-presets');
require('../data/tool-registry');
require('../src/ui/ToolRouter');

const registry = FF.ToolRegistryData;

test('tool registry has unique ids and routes with valid tool metadata', () => {
  assert.equal(new Set(registry.tools.map((entry) => entry.id)).size, registry.tools.length);
  assert.equal(new Set(registry.tools.map((entry) => entry.route)).size, registry.tools.length);
  for (const entry of registry.tools) {
    assert.ok(entry.route.startsWith('#/tools/'));
    assert.ok(entry.seo.title.includes(FF.SiteConfig.siteName));
    assert.ok(entry.seo.howTo.length > 0);
    assert.ok(entry.seo.faq.length > 0);
  }
});

test('tool router resolves direct routes and preserves old bookmarks', () => {
  for (const entry of registry.tools) {
    assert.equal(FF.ToolRouter.resolve(entry.route, registry), entry);
  }
  for (const alias of ['#exam', '#/exam']) {
    assert.equal(FF.ToolRouter.resolve(alias, registry).id, 'exam-photo-resizer');
  }
  for (const alias of ['#general', '#/general']) {
    assert.equal(FF.ToolRouter.resolve(alias, registry).id, 'custom-size-cropper');
  }
  for (const alias of ['#check', '#/check']) {
    assert.equal(FF.ToolRouter.resolve(alias, registry).id, 'check-my-file');
  }
  for (const alias of ['#tools', '#/tools']) {
    assert.equal(FF.ToolRouter.resolve(alias, registry).id, 'image-converter');
  }
  for (const alias of ['#background-studio', '#/background-studio', '#passport', '#/passport']) {
    assert.equal(FF.ToolRouter.resolve(alias, registry).id, 'photo-editor');
  }
  assert.equal(FF.ToolRouter.resolve('#/', registry), null);
  assert.equal(FF.ToolRouter.resolve('#/missing-tool', registry), null);
});

test('registry search includes titles, descriptions and aliases', () => {
  assert.equal(registry.search('heic').some((entry) => entry.id === 'heic-to-jpg'), true);
  assert.equal(registry.search('combine pages').some((entry) => entry.id === 'merge-pdf'), true);
  assert.equal(registry.search('resize pixels').some((entry) => entry.id === 'custom-size-cropper'), true);
});

test('generic photo-size presets derive output pixels from dimensions and DPI', () => {
  assert.equal(FF.PhotoPresetMath.toPixels(35, 'mm', 300), 413);
  assert.equal(FF.PhotoPresetMath.toPixels(45, 'mm', 300), 531);
  assert.equal(FF.PhotoPresetMath.toPixels(2, 'in', 300), 600);
  assert.equal(FF.PhotoPresetMath.toPixels(140, 'px', 300), 140);
  assert.throws(() => FF.PhotoPresetMath.toPixels(0, 'mm', 300), /positive dimensions/);
  assert.throws(() => FF.PhotoPresetMath.toPixels(10, 'unknown', 300), /Choose px/);
});
