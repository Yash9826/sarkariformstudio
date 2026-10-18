const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const FF = require('./helpers/load');

const root = path.resolve(__dirname, '..');

test('Core Exam Photos menu, tools, data groups and resizer route stay available', () => {
  const registry = new FF.ExamRegistry(FF.ExamData);
  const menu = FF.ToolRegistryData.categories[0];
  const coreTools = [
    ['exam-photo-resizer', 'Exam Photo Resizer | SarkariFormStudio'],
    ['custom-size-cropper', 'Custom Size Cropper | SarkariFormStudio'],
    ['check-my-file', 'Check My File | SarkariFormStudio'],
  ];

  assert.deepEqual([menu.id, menu.title], ['exam-photos', 'Exam Photos']);
  for (const [id, title] of coreTools) {
    const entry = FF.ToolRegistryData.getById(id);
    assert.ok(entry, `${id} remains registered`);
    assert.equal(entry.core, true, `${id} is marked core`);
    assert.equal(entry.category, menu.id);
    assert.equal(entry.seo.title, title);
  }

  assert.equal(FF.ExamData.exams.length, 28);
  assert.equal(registry.groups.length, 6);
  assert.equal(registry.exams.every((exam) =>
    exam.lastVerified === '2026-10-13' && exam.confidence === 'secondary' && exam.note), true);
  const allNames = registry.exams.map((exam) => exam.name);
  const expectedNames = [
    'IBPS PO', 'IBPS Clerk', 'IBPS SO', 'IBPS RRB (Officer & Assistant)', 'SBI PO', 'SBI Clerk', 'RBI Assistant', 'RBI Grade B',
    'SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD Constable', 'SSC CPO', 'SSC JE', 'SSC Stenographer',
    'RRB NTPC', 'RRB Group D', 'RRB ALP', 'RRB JE', 'RPF',
    'UPSC CSE', 'UPSC NDA', 'UPSC CDS', 'UPSC CAPF', 'UPSC ESE',
    'NEET UG', 'JEE Main', 'CUET UG',
  ];
  for (const name of expectedNames) assert.ok(allNames.includes(name), `exam data retains ${name}`);

  const bank = registry.search('ibps')[0];
  assert.equal(bank.exams.length, 8);
  assert.ok(bank.exams.some((exam) => exam.name === 'SBI Clerk'));
  assert.ok(bank.exams.some((exam) => exam.name === 'RBI Grade B'));
  assert.equal(bank.ruleFor('photo').dimensionText(), '200 × 230 px');
  assert.ok(registry.search('ssc').every((group) => !group.exams.some((exam) => exam.body === 'Railways')));
  assert.notEqual(registry.search('neet')[0].key, registry.search('jee main')[0].key);
  assert.deepEqual(
    [registry.search('ssc')[0].ruleFor('photo').widthPx, registry.search('ssc')[0].ruleFor('photo').heightPx],
    [276, 354]
  );
  assert.deepEqual(
    [registry.search('upsc')[0].ruleFor('photo').widthPx, registry.search('upsc')[0].ruleFor('photo').heightPx],
    [413, 531]
  );
  assert.deepEqual(
    [registry.search('jee main')[0].ruleFor('signature').widthPx, registry.search('jee main')[0].ruleFor('signature').heightPx],
    [413, 177]
  );

  for (const query of ['ssc', 'ibps', 'railway', 'neet']) {
    const result = FF.ToolRegistryData.search(query).find((entry) => entry.id === 'exam-photo-resizer');
    assert.equal(result && result.searchQuery, query, `${query} search opens the resizer with its query`);
  }

  const resizer = FF.ToolRegistryData.getByRoute('#/tools/exam-photo-resizer');
  assert.equal(FF.ToolRouter.resolve(resizer.route, FF.ToolRegistryData).panel, 'exam');
  assert.equal(FF.ToolRouter.resolve('#exam', FF.ToolRegistryData).id, 'exam-photo-resizer');
  assert.equal(resizer.seo.title, 'Exam Photo Resizer | SarkariFormStudio');

  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'src', 'ui', 'App.js'), 'utf8');
  const navigation = fs.readFileSync(path.join(root, 'src', 'ui', 'SiteNavigation.js'), 'utf8');
  assert.match(html, /src\/ui\/SiteNavigation\.js/);
  assert.match(app, /new NS\.SiteNavigation\(/);
  assert.match(navigation, /for \(const category of this\.#registry\.categories\)/);
  assert.match(html, /id="panel-exam"[^>]*data-app-panel="exam"/);
  assert.match(app, /new ExamPanel\(/);
  assert.match(app, /entry\.panel === 'exam'/);
});
