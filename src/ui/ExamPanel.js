r/**
 * ExamPanel: pick an exam (merged by identical rules), then prepare each
 * required file (photo / signature / thumb / declaration) and download them
 * one by one or together as a ZIP. yash
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, clear, downloadBlob, formatBytes } = NS.dom;
  const { Workspace, ZipBuilder, RuleProfile, Logger } = NS;

  class ExamPanel {
    #root;
    #registry;
    #notifier;
    #storage;
    #log = Logger.for('ExamPanel');

    #group = null;
    #kind = null;
    #outputs = new Map(); // kind -> result from Workspace
    #workspace;
    #els = {};

    constructor({ root, registry, notifier, storage }) {
      this.#root = root;
      this.#registry = registry;
      this.#notifier = notifier;
      this.#storage = storage;
      this.#build();
      this.#renderList('');
      this.#restore();
    }

    /** Select a group/kind programmatically (used by "Fix it for me" in the checker). */
    async select(groupKey, kind = null, file = null) {
      const group = this.#registry.getGroup(groupKey);
      if (!group) {
        this.#notifier.error('That exam could not be found. Please pick it from the list.');
        return;
      }
      this.#chooseGroup(group, kind);
      if (file) await this.#workspace.loadFile(file);
    }

    setSearchQuery(query) {
      this.#els.search.value = String(query || '');
      this.#renderList(this.#els.search.value);
    }

    // ---- construction ----

    #build() {
      const e = this.#els;
      e.search = h('input', { type: 'search', class: 'search', placeholder: 'Search your exam: ssc, ibps, railway, upsc, neet…', 'aria-label': 'Search exams', autocomplete: 'off' });
      e.search.addEventListener('input', () => this.#renderList(e.search.value));
      e.list = h('div', { class: 'exam-list', role: 'listbox', 'aria-label': 'Exams' });
      e.count = h('p', { class: 'muted small' });
      const aside = h('aside', { class: 'picker' }, h('h2', null, '1. Choose your exam'), e.search, e.count, e.list);

      e.empty = h('div', { class: 'empty' }, h('h2', null, '2. Prepare your files'), h('p', null, 'Pick your exam on the left. We will show the exact size, dimensions and format your form accepts, then resize and compress your picture to match.'), h('p', { class: 'muted' }, 'Exams with identical rules are grouped together, so you only see each rule once.'));
      e.title = h('h2', { class: 'work-title' });
      e.chips = h('div', { class: 'chips' });
      e.tabs = h('div', { class: 'kind-tabs', role: 'tablist', 'aria-label': 'File type' });
      e.rule = h('div', { class: 'rule-card' });
      e.wsRoot = h('div', { class: 'ws' });
      e.bundle = h('div', { class: 'bundle' });
      e.work = h('div', { class: 'work', hidden: true }, e.title, e.chips, e.tabs, e.rule, e.wsRoot, e.bundle);
      const main = h('div', { class: 'main-col' }, e.empty, e.work);

      this.#root.append(h('div', { class: 'layout' }, aside, main));

      this.#workspace = new Workspace({
        root: e.wsRoot,
        notifier: this.#notifier,
        ruleProvider: () => (this.#group && this.#kind ? this.#group.ruleFor(this.#kind) : null),
        fileName: (rule) => rule.fileName(this.#group.slug),
        onResult: (result) => {
          this.#outputs.set(result.rule.kind, result);
          this.#renderTabs();
          this.#renderBundle();
        },
      });
    }

    #renderList(query) {
      const groups = this.#registry.search(query);
      const list = clear(this.#els.list);
      this.#els.count.textContent = groups.length
        ? `${groups.length} rule group${groups.length === 1 ? '' : 's'} · exams with identical rules are combined`
        : '';
      if (!groups.length) {
        list.append(h('p', { class: 'muted pad' },
          `No exam matches “${query}”. Try a shorter word like “ssc” or “bank”, or use the `,
          h('a', { href: '#/tools/custom-size-cropper' }, 'Custom Size Cropper'),
          ' to enter your own limits.'));
        return;
      }
      for (const g of groups) {
        const selected = this.#group && this.#group.key === g.key;
        list.append(
          h(
            'button',
            { type: 'button', class: `exam-card${selected ? ' selected' : ''}`, role: 'option', 'aria-selected': selected ? 'true' : 'false', onClick: () => this.#chooseGroup(g) },
            h('strong', null, g.label),
            h('small', null, g.kinds.map((k) => RuleProfile.KIND_LABELS[k]).join(' · '))
          )
        );
      }
    }

    #restore() {
      const saved = this.#storage.get('lastExam');
      if (saved && saved.groupKey) {
        const group = this.#registry.getGroup(saved.groupKey);
        if (group) this.#chooseGroup(group, saved.kind, { silent: true });
      }
    }

    // ---- selection ----

    #chooseGroup(group, kind = null, { silent = false } = {}) {
      const changed = !this.#group || this.#group.key !== group.key;
      this.#group = group;
      if (changed) this.#outputs.clear();
      this.#kind = kind && group.ruleFor(kind) ? kind : group.kinds[0];
      this.#workspace.reset();
      this.#storage.set('lastExam', { groupKey: group.key, kind: this.#kind });
      this.#log.info('Selected exam group', { exams: group.exams.map((x) => x.name), kind: this.#kind });

      this.#els.empty.hidden = true;
      this.#els.work.hidden = false;
      this.#renderList(this.#els.search.value);
      this.#renderHeader();
      this.#renderTabs();
      this.#renderRule();
      this.#renderBundle();
      if (!silent && changed) this.#els.work.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    #chooseKind(kind) {
      if (kind === this.#kind) return;
      this.#kind = kind;
      this.#workspace.reset();
      this.#storage.set('lastExam', { groupKey: this.#group.key, kind });
      this.#renderTabs();
      this.#renderRule();
    }

    #renderHeader() {
      this.#els.title.textContent = '2. Prepare your files';
      const chips = clear(this.#els.chips);
      chips.append(h('span', { class: 'muted small' }, 'Applies to: '));
      for (const exam of this.#group.exams) chips.append(h('span', { class: 'chip' }, exam.name));
    }

    #renderTabs() {
      const tabs = clear(this.#els.tabs);
      for (const kind of this.#group.kinds) {
        const done = this.#outputs.has(kind);
        tabs.append(
          h(
            'button',
            { type: 'button', role: 'tab', class: `kind-tab${kind === this.#kind ? ' active' : ''}${done ? ' done' : ''}`, 'aria-selected': kind === this.#kind ? 'true' : 'false', onClick: () => this.#chooseKind(kind) },
            RuleProfile.KIND_LABELS[kind],
            done ? h('span', { class: 'tick', 'aria-label': 'prepared' }, ' ✓') : null
          )
        );
      }
    }

    #renderRule() {
      const rule = this.#group.ruleFor(this.#kind);
      const g = this.#group;
      const card = clear(this.#els.rule);
      const sources = g.sources.map((url) => h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, new URL(url).hostname.replace(/^www\./, '')));
      const sourceLinks = sources.flatMap((a, i) => (i ? [', ', a] : [a]));

      card.append(
        h('h3', null, `${rule.kindLabel} requirements`),
        h(
          'dl',
          { class: 'rule-grid' },
          h('div', null, h('dt', null, 'Dimensions'), h('dd', null, rule.dimensionText())),
          h('div', null, h('dt', null, 'File size'), h('dd', null, rule.sizeText())),
          h('div', null, h('dt', null, 'Format'), h('dd', null, rule.formatText()))
        ),
        rule.notes ? h('p', { class: 'small' }, rule.notes) : null,
        h(
          'p',
          { class: 'small muted' },
          h('span', { class: `badge badge-${g.confidence}` }, g.confidence === 'official' ? 'Official source' : 'Secondary source'),
          ` Last checked ${g.lastVerified}. Official site: `,
          sourceLinks,
          '. Always confirm against your current notification.'
        )
      );
    }

    #renderBundle() {
      const box = clear(this.#els.bundle);
      const total = this.#group.kinds.length;
      const ready = this.#group.kinds.filter((kind) => {
        const output = this.#outputs.get(kind);
        return output && output.report.passed;
      });
      box.append(
        h('h3', null, 'Your bundle'),
        h(
          'ul',
          { class: 'bundle-list' },
          this.#group.kinds.map((k) => {
            const out = this.#outputs.get(k);
            return h(
              'li',
              { class: out ? (out.report.passed ? 'ok' : 'bad') : 'todo' },
              h('span', { class: 'mark', 'aria-hidden': 'true' }, out ? (out.report.passed ? '✓' : '!') : '○'),
              `${RuleProfile.KIND_LABELS[k]} `,
              h('span', { class: 'muted small' }, out ? `${formatBytes(out.blob.size)} · ${out.width} × ${out.height} px` : 'not prepared yet')
            );
          })
        ),
        h('button', { type: 'button', class: 'btn btn-secondary', disabled: ready.length === 0, onClick: () => this.#downloadZip() }, ready.length === total ? 'Download all as ZIP' : `Download ZIP (${ready.length} of ${total} ready)`)
      );
    }

    async #downloadZip() {
      try {
        const zip = new ZipBuilder();
        for (const [kind, out] of this.#outputs) {
          if (!out.report.passed) continue;
          zip.add(`${kind}.${out.rule.extension}`, new Uint8Array(await out.blob.arrayBuffer()));
        }
        const missing = this.#group.kinds.filter((kind) => {
          const output = this.#outputs.get(kind);
          return !output || !output.report.passed;
        });
        const name = `sarkariformstudio-${this.#group.slug}.zip`;
        downloadBlob(zip.toBlob(), name);
        this.#log.info('ZIP downloaded', { name, files: zip.count });
        this.#notifier.success(
          missing.length
            ? `${name} saved with ${zip.count} file(s). Still to do: ${missing.map((k) => RuleProfile.KIND_LABELS[k]).join(', ')}.`
            : `${name} saved with all ${zip.count} files.`,
          'ZIP downloaded'
        );
      } catch (error) {
        this.#notifier.fromError(error, 'Could not create the ZIP');
      }
    }
  }

  NS.ExamPanel = ExamPanel;
})(typeof window !== 'undefined' ? window : globalThis);
