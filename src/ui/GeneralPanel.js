/**
 * GeneralPanel: a flexible cropper where the user types their own limits.
 * Leave width/height empty for a free crop that only respects the file size.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;
  const { Workspace, RuleProfile, UnitConverter, ValidationError, RuleError, Logger } = NS;

  class GeneralPanel {
    #root;
    #notifier;
    #storage;
    #log = Logger.for('GeneralPanel');
    #workspace;
    #f = {};

    constructor({ root, notifier, storage }) {
      this.#root = root;
      this.#notifier = notifier;
      this.#storage = storage;
      this.#build();
    }

    #field(label, input, hint) {
      return h('label', { class: 'field' }, h('span', null, label), input, hint ? h('small', { class: 'muted' }, hint) : null);
    }

    #build() {
      const f = this.#f;
      const num = (name, ph, extra = {}) => h('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: ph, name, ...extra });
      f.width = num('width', 'e.g. 200');
      f.height = num('height', 'e.g. 230');
      f.unit = h('select', { name: 'unit' }, UnitConverter.UNITS.map((u) => h('option', { value: u }, u === 'in' ? 'inches' : u)));
      f.dpi = num('dpi', '200', { value: '200', min: '1' });
      f.minKB = num('minKB', 'optional');
      f.maxKB = num('maxKB', 'e.g. 50');
      f.format = h('select', { name: 'format' }, h('option', { value: 'jpg' }, 'JPEG'), h('option', { value: 'png' }, 'PNG'), h('option', { value: 'webp' }, 'WebP'));
      f.dpiField = this.#field('DPI', f.dpi, 'Needed for cm / mm / inches');
      f.dpiField.hidden = true;

      const form = h(
        'form',
        { class: 'general-form', novalidate: true },
        h('div', { class: 'form-grid' },
          this.#field('Width', f.width),
          this.#field('Height', f.height),
          this.#field('Unit', f.unit),
          f.dpiField,
          this.#field('Min size (KB)', f.minKB),
          this.#field('Max size (KB)', f.maxKB),
          this.#field('Format', f.format)
        ),
        h('p', { class: 'muted small' }, 'Leave width and height empty for a free-shape crop. With both filled, the crop is locked to that shape and the output is exactly that size.')
      );
      form.addEventListener('submit', (e) => e.preventDefault());
      form.addEventListener('change', () => {
        f.dpiField.hidden = f.unit.value === 'px';
        this.#workspace.refreshRule();
      });

      const wsRoot = h('div', { class: 'ws' });
      this.#root.append(
        h('div', { class: 'general' },
          h('h2', null, 'Custom Size Cropper'),
          h('p', { class: 'muted' }, 'Set any size, dimensions and format, for forms that are not in the exam list.'),
          form,
          wsRoot
        )
      );

      this.#workspace = new Workspace({
        root: wsRoot,
        notifier: this.#notifier,
        ruleProvider: (opts) => this.#readRule(opts),
        fileName: (rule) => `custom-image.${rule.extension}`,
        storage: this.#storage,
      });
    }

    #number(input, label, { required = false } = {}) {
      const raw = input.value.trim();
      if (raw === '') {
        if (required) throw new ValidationError(`${label} is required`, { userMessage: `${label} is required.` });
        return null;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        throw new ValidationError(`${label} invalid: "${raw}"`, { userMessage: `${label} must be a positive number.` });
      }
      return n;
    }

    /** Builds a RuleProfile from the form, or tells the user what is wrong and returns null. */
    #readRule({ silent }) {
      try {
        const f = this.#f;
        const width = this.#number(f.width, 'Width');
        const height = this.#number(f.height, 'Height');
        if ((width === null) !== (height === null)) {
          throw new ValidationError('Only one of width/height given', { userMessage: 'Enter both width and height, or leave both empty for a free crop.' });
        }
        const minKB = this.#number(f.minKB, 'Minimum size');
        const maxKB = this.#number(f.maxKB, 'Maximum size');
        if (maxKB === 0) throw new ValidationError('maxKB is zero', { userMessage: 'Maximum size must be greater than 0 KB.' });

        return new RuleProfile({
          id: 'custom',
          kind: 'custom',
          width,
          height,
          unit: f.unit.value,
          dpi: Number(f.dpi.value) || undefined,
          minKB: minKB || 0,
          maxKB: maxKB || null,
          formats: [f.format.value],
        });
      } catch (error) {
        if (error instanceof ValidationError || error instanceof RuleError) {
          this.#log.warn('Custom rule rejected', error);
          if (!silent) this.#notifier.error(error.userMessage, 'Check your settings');
          return null;
        }
        this.#notifier.fromError(error);
        return null;
      }
    }
  }

  NS.GeneralPanel = GeneralPanel;
})(typeof window !== 'undefined' ? window : globalThis);
