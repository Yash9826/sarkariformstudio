/**
 * CheckPanel: "Is my existing file OK?" Pick an exam + file type, drop a file,
 * and get green/red ticks. Offers a one-click hand-off to Exam mode to fix it.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, clear, formatBytes } = NS.dom;
  const { ImageLoader, RuleValidator, RuleProfile, ProgressIndicator, Logger } = NS;

  class CheckPanel {
    #root;
    #registry;
    #notifier;
    #onFix;
    #log = Logger.for('CheckPanel');
    #loader = new ImageLoader();
    #validator = new RuleValidator();
    #els = {};
    #progress;
    #busy = false;

    /** @param {(groupKey:string, kind:string, file:File)=>void} onFix */
    constructor({ root, registry, notifier, onFix }) {
      this.#root = root;
      this.#registry = registry;
      this.#notifier = notifier;
      this.#onFix = onFix;
      this.#build();
    }

    #build() {
      const e = this.#els;
      e.group = h('select', { 'aria-label': 'Exam' }, this.#registry.groups.map((g) => h('option', { value: g.key }, g.label)));
      e.kind = h('select', { 'aria-label': 'File type' });
      e.group.addEventListener('change', () => this.#fillKinds());
      e.file = h('input', { type: 'file', accept: 'image/*', hidden: true });
      e.file.addEventListener('change', () => {
        if (e.file.files[0]) this.#check(e.file.files[0]);
        e.file.value = '';
      });
      e.pick = h('label', { class: 'dropzone small', tabindex: '0' }, e.file, h('strong', null, 'Choose the file to check'), h('small', null, 'It is only inspected in your browser'));
      e.pick.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          e.file.click();
        }
      });
      e.progress = h('div', { class: 'progress' });
      this.#progress = new ProgressIndicator(e.progress);
      e.out = h('div', { class: 'result', hidden: true, 'aria-live': 'polite' });

      this.#root.append(
        h('div', { class: 'general' },
          h('h2', null, 'Check an existing file'),
          h('p', { class: 'muted' }, 'Already have a photo or signature ready? See if it passes before you upload.'),
          h('div', { class: 'form-grid' },
            h('label', { class: 'field wide' }, h('span', null, 'Exam'), e.group),
            h('label', { class: 'field' }, h('span', null, 'File type'), e.kind)
          ),
          e.pick, e.progress, e.out
        )
      );
      this.#fillKinds();
    }

    #fillKinds() {
      const group = this.#registry.getGroup(this.#els.group.value);
      const kinds = clear(this.#els.kind);
      for (const k of group.kinds) kinds.append(h('option', { value: k }, RuleProfile.KIND_LABELS[k]));
    }

    async #check(file) {
      if (this.#busy) return;
      this.#busy = true;
      const group = this.#registry.getGroup(this.#els.group.value);
      const kind = this.#els.kind.value;
      const rule = group.ruleFor(kind);
      clear(this.#els.out).hidden = true;
      try {
        const img = await this.#loader.load(file, (pct, label) => this.#progress.update(pct, `${label} ${pct}%`));
        if (typeof img.source.close === 'function') img.source.close();
        const report = this.#validator.validate({ bytes: file.size, mime: file.type, width: img.width, height: img.height }, rule);
        this.#log.info('Checked file', { name: file.name, passed: report.passed });
        this.#render(file, group, kind, rule, report);
        if (report.passed) this.#notifier.success(`${file.name} meets every requirement for ${rule.kindLabel.toLowerCase()}.`, 'Looks good');
        else this.#notifier.warn(`${report.failures.length} requirement(s) not met. Use “Fix it for me” to correct the file automatically.`, 'File needs fixing');
      } catch (error) {
        this.#notifier.fromError(error, 'Could not check that file');
      } finally {
        this.#progress.hide();
        this.#busy = false;
      }
    }

    #render(file, group, kind, rule, report) {
      const out = clear(this.#els.out);
      out.append(
        h('h3', null, report.passed ? '✓ This file passes' : '✕ This file does not pass'),
        h('p', { class: 'muted small' }, `${file.name} · ${formatBytes(file.size)} · checked against ${rule.summary()}`),
        h('ul', { class: 'checks' }, report.checks.map((c) =>
          h('li', { class: c.ok ? 'ok' : 'bad' },
            h('span', { class: 'mark', 'aria-hidden': 'true' }, c.ok ? '✓' : '✕'),
            h('span', { class: 'check-label' }, c.label),
            h('span', { class: 'check-values' }, `${c.actual} `, h('em', null, `(needs ${c.expected})`)),
            h('span', { class: 'sr-only' }, c.ok ? ' — passed' : ' — failed')
          )
        )),
        report.passed ? null : h('div', { class: 'result-actions' },
          h('button', { type: 'button', class: 'btn btn-primary', onClick: () => this.#onFix(group.key, kind, file) }, 'Fix it for me'))
      );
      out.hidden = false;
    }
  }

  NS.CheckPanel = CheckPanel;
})(typeof window !== 'undefined' ? window : globalThis);
