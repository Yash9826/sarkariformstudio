(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;
  let nextId = 0;

  class EnhancePanel {
    #root;
    #rule;
    #options;
    #onChange;
    #onTrim;
    #onBrushChange;
    #onUndoMask;
    #onResetMask;
    #id = `enhance-${++nextId}`;
    #controls = {};

    constructor({
      root, rule, options, onChange, onTrim = () => {},
      onBrushChange = () => {}, onUndoMask = () => {}, onResetMask = () => {},
    }) {
      this.#root = root;
      this.#rule = rule;
      this.#options = options;
      this.#onChange = onChange;
      this.#onTrim = onTrim;
      this.#onBrushChange = onBrushChange;
      this.#onUndoMask = onUndoMask;
      this.#onResetMask = onResetMask;
      this.#build();
    }

    setOptions(options) {
      this.#options = options;
      this.#sync();
    }

    setRule(rule) {
      this.#rule = rule;
      this.#root.replaceChildren();
      this.#controls = {};
      this.#build();
    }

    setBackgroundWarning(message) {
      const warning = this.#controls.backgroundWarning;
      if (!warning) return;
      warning.textContent = message || '';
      warning.hidden = !message;
    }

    #build() {
      const c = this.#controls;
      const slider = (key, label, min, max, step, value, unit = '') => {
        const id = `${this.#id}-${key}`;
        const input = h('input', { id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
        const readout = h('output', { for: id, class: 'enhance-value' }, `${value}${unit}`);
        input.addEventListener('input', () => {
          readout.value = `${input.value}${unit}`;
          this.#change({ [key]: Number(input.value) }, key === 'straightenDeg');
        });
        input.addEventListener('change', () => {
          if (key === 'straightenDeg') this.#change({ [key]: Number(input.value) }, false);
        });
        input.addEventListener('dblclick', () => {
          input.value = '0';
          readout.value = `0${unit}`;
          this.#change({ [key]: 0 }, false);
        });
        return { input, readout };
      };
      const row = (label, key, min, max, step, value, unit = '') => {
        const parts = slider(key, label, min, max, step, value, unit);
        c[key] = parts.input;
        c[`${key}Readout`] = parts.readout;
        const reset = h('button', {
          type: 'button', class: 'enhance-reset', 'aria-label': `Reset ${label.toLowerCase()}`, title: `Reset ${label.toLowerCase()}`,
          onClick: () => {
            parts.input.value = '0';
            parts.readout.value = `0${unit}`;
            this.#change({ [key]: 0 }, false);
          },
        }, '↺');
        return h('div', { class: 'enhance-control' },
          h('label', { class: 'enhance-control-label', for: `${this.#id}-${key}` }, label),
          parts.input, parts.readout, reset);
      };

      c.auto = h('input', { type: 'checkbox', 'aria-label': 'Auto-enhance' });
      c.auto.addEventListener('change', () => this.#change({ autoLevels: c.auto.checked }, false));
      const autoLabel = h('label', { class: 'check enhance-check' }, c.auto, ' Auto-enhance');
      const autoButton = h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => {
        c.auto.checked = true;
        this.#change({ autoLevels: true }, false);
      } }, 'Auto-enhance');
      const resetAll = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => {
        this.#options = NS.EnhanceOptions.defaults(this.#rule ? this.#rule.kind : 'other', this.#rule ? this.#rule.stampSpec : null)
          .with({ stamp: { name: this.#options.stamp.name } });
        this.#sync();
        this.#onChange(this.#options, { previewOnly: false });
      } }, 'Reset all');

      const sections = [
        h('p', { class: 'muted small' }, 'Adjust your image before cropping and compressing. Changes are applied locally.'),
        h('div', { class: 'enhance-controls' },
          row('Straighten', 'straightenDeg', -15, 15, 0.1, this.#options.straightenDeg, '°'),
          row('Brightness', 'brightness', -100, 100, 1, this.#options.brightness),
          row('Contrast', 'contrast', -100, 100, 1, this.#options.contrast)
        ),
        h('div', { class: 'enhance-actions' }, autoLabel, autoButton, resetAll),
      ];
      if (this.#rule && this.#rule.kind === 'signature') sections.push(this.#buildCleanup());
      if (this.#rule && this.#rule.kind === 'photo') {
        sections.push(this.#buildBackground());
        sections.push(this.#buildStamp());
      }

      this.#root.replaceChildren(
        h('details', { class: 'enhance-details' },
          h('summary', null, h('span', null, 'Enhance'), h('span', { class: 'enhance-summary-note' }, 'Brightness · contrast · straighten')),
          h('div', { class: 'enhance-body' }, sections)
        )
      );
      this.#sync();
    }

    #buildBackground() {
      const c = this.#controls;
      c.backgroundEnabled = h('input', { type: 'checkbox', 'aria-label': 'Replace background' });
      c.backgroundEnabled.addEventListener('change', () => this.#change({ background: { enabled: c.backgroundEnabled.checked } }, false));
      const choices = [
        ['#ffffff', 'White'],
        ['#dcebfa', 'Light blue'],
      ].map(([color, label]) => {
        const id = `${this.#id}-background-${color.slice(1)}`;
        const input = h('input', { id, type: 'radio', name: `${this.#id}-background-colour`, value: color, 'aria-label': `${label} background` });
        input.addEventListener('change', () => {
          if (input.checked) this.#change({ background: { color } }, false);
        });
        (c.backgroundRadios || (c.backgroundRadios = {}))[color] = input;
        return h('label', { class: 'choice-chip', for: id }, input, label);
      });
      c.customBackground = h('input', { type: 'radio', name: `${this.#id}-background-colour`, value: 'custom', 'aria-label': 'Custom background colour' });
      c.customBackground.addEventListener('change', () => {
        if (c.customBackground.checked) this.#change({ background: { color: c.customColor.value } }, false);
      });
      c.customColor = h('input', { type: 'color', value: '#ffffff', 'aria-label': 'Choose custom background colour' });
      c.customColor.addEventListener('input', () => {
        c.customBackground.checked = true;
        this.#change({ background: { color: c.customColor.value } }, false);
      });
      c.tolerance = h('input', { type: 'range', min: '5', max: '60', step: '1', 'aria-label': 'Background sensitivity' });
      c.toleranceValue = h('output', { class: 'enhance-value' });
      c.tolerance.addEventListener('input', () => {
        c.toleranceValue.value = c.tolerance.value;
      });
      c.tolerance.addEventListener('change', () =>
        this.#change({ background: { tolerance: Number(c.tolerance.value) } }, false, { maskSettingsChanged: true }));
      c.feather = h('input', { type: 'range', min: '0', max: '4', step: '0.1', 'aria-label': 'Edge softness' });
      c.featherValue = h('output', { class: 'enhance-value' });
      c.feather.addEventListener('input', () => {
        c.featherValue.value = c.feather.value;
      });
      c.feather.addEventListener('change', () =>
        this.#change({ background: { feather: Number(c.feather.value) } }, false, { maskSettingsChanged: true }));
      c.brushMode = h('select', { 'aria-label': 'Background brush mode' },
        h('option', { value: '' }, 'Brush off'),
        h('option', { value: 'remove' }, 'Remove background'),
        h('option', { value: 'restore' }, 'Restore picture'));
      c.brushMode.addEventListener('change', () => this.#onBrushChange(c.brushMode.value, Number(c.brushSize.value)));
      c.brushSize = h('input', { type: 'range', min: '5', max: '80', step: '1', value: '24', 'aria-label': 'Brush size' });
      c.brushSizeValue = h('output', { class: 'enhance-value' }, '24 px');
      c.brushSize.addEventListener('input', () => {
        c.brushSizeValue.value = `${c.brushSize.value} px`;
        this.#onBrushChange(c.brushMode.value, Number(c.brushSize.value));
      });
      const enabled = h('label', { class: 'check' }, c.backgroundEnabled, ' Replace background');
      c.backgroundWarning = h('p', { class: 'note background-warning', role: 'status', hidden: true });
      return h('section', { class: 'enhance-feature background-feature' },
        h('h3', null, 'Photo background'),
        enabled,
        h('fieldset', { class: 'choice-group' }, h('legend', null, 'Replacement colour'),
          [...choices, h('label', { class: 'choice-chip' }, c.customBackground, 'Custom'), c.customColor]),
        h('label', { class: 'enhance-control' }, h('span', { class: 'enhance-control-label' }, 'Background sensitivity'), c.tolerance, c.toleranceValue),
        h('label', { class: 'enhance-control' }, h('span', { class: 'enhance-control-label' }, 'Edge softness'), c.feather, c.featherValue),
        h('div', { class: 'enhance-actions' },
          c.brushMode, h('label', { class: 'enhance-control' }, h('span', { class: 'enhance-control-label' }, 'Brush size'), c.brushSize, c.brushSizeValue),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.#onUndoMask() }, 'Undo'),
          h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.#onResetMask() }, 'Reset mask')),
        c.backgroundWarning,
        h('p', { class: 'muted small' }, 'Best with a plain, evenly lit background. Brush over the preview to fix edges.')
      );
    }

    #buildStamp() {
      const c = this.#controls;
      c.stampEnabled = h('input', { type: 'checkbox', 'aria-label': 'Add name and date strip' });
      c.stampEnabled.addEventListener('change', () => this.#change({ stamp: { enabled: c.stampEnabled.checked } }, false));
      c.stampName = h('input', { type: 'text', maxlength: '40', autocomplete: 'name', 'aria-label': 'Name for photo strip' });
      c.stampName.addEventListener('input', () => this.#change({ stamp: { name: c.stampName.value } }, false));
      c.stampDate = h('input', { type: 'date', 'aria-label': 'Date for photo strip' });
      c.stampDate.addEventListener('change', () => this.#change({ stamp: { date: c.stampDate.value } }, false));
      c.stampFormat = h('select', { 'aria-label': 'Date format' },
        ...['DD/MM/YYYY', 'DD-MM-YYYY', 'DD MMM YYYY'].map((format) => h('option', { value: format }, format)));
      c.stampFormat.addEventListener('change', () => this.#change({ stamp: { dateFormat: c.stampFormat.value } }, false));
      c.stampRatio = h('input', { type: 'range', min: '10', max: '20', step: '1', 'aria-label': 'Name and date strip height' });
      c.stampRatioValue = h('output', { class: 'enhance-value' });
      c.stampRatio.addEventListener('input', () => {
        c.stampRatioValue.value = `${c.stampRatio.value}%`;
        this.#change({ stamp: { heightRatio: Number(c.stampRatio.value) / 100 } }, false);
      });
      return h('section', { class: 'enhance-feature stamp-feature' },
        h('h3', null, 'Name and date strip'),
        h('label', { class: 'check' }, c.stampEnabled, ' Add a name/date strip'),
        h('label', { class: 'field' }, h('span', null, 'Name'), c.stampName),
        h('div', { class: 'form-grid' },
          h('label', { class: 'field' }, h('span', null, 'Photo date'), c.stampDate),
          h('label', { class: 'field' }, h('span', null, 'Date format'), c.stampFormat)),
        h('label', { class: 'enhance-control' }, h('span', { class: 'enhance-control-label' }, 'Strip height'), c.stampRatio, c.stampRatioValue)
      );
    }

    #buildCleanup() {
      const c = this.#controls;
      c.cleanupEnabled = h('input', { type: 'checkbox', 'aria-label': 'Clean up signature' });
      c.cleanupEnabled.addEventListener('change', () => this.#change({ cleanup: { enabled: c.cleanupEnabled.checked } }, false));
      c.inkColor = {};
      const radios = ['black', 'original', 'darkblue'].map((value) => {
        const id = `${this.#id}-ink-${value}`;
        const input = h('input', { id, type: 'radio', name: `${this.#id}-ink-color`, value, 'aria-label': value === 'black' ? 'Black ink' : value === 'original' ? 'Keep original ink colour' : 'Dark blue ink' });
        input.addEventListener('change', () => {
          if (input.checked) this.#change({ cleanup: { inkColor: value } }, false);
        });
        c.inkColor[value] = input;
        const label = value === 'black' ? 'Black' : value === 'original' ? 'Keep original' : 'Dark blue';
        return h('label', { class: 'choice-chip', for: id }, input, label);
      });
      c.strength = h('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Ink strength' });
      c.strengthValue = h('output', { class: 'enhance-value' });
      c.strength.addEventListener('input', () => {
        c.strengthValue.value = c.strength.value;
        this.#change({ cleanup: { strength: Number(c.strength.value) } }, false);
      });
      c.removeSpecks = h('input', { type: 'checkbox', 'aria-label': 'Remove specks' });
      c.removeSpecks.addEventListener('change', () => this.#change({ cleanup: { removeSpecks: c.removeSpecks.checked } }, false));
      c.autoTrim = h('input', { type: 'checkbox', 'aria-label': 'Auto-trim to signature' });
      c.autoTrim.addEventListener('change', () => this.#change({ cleanup: { autoTrim: c.autoTrim.checked } }, false));
      const cleanupToggle = h('label', { class: 'check' }, c.cleanupEnabled, ' Clean up signature');
      const removeLabel = h('label', { class: 'check' }, c.removeSpecks, ' Remove specks');
      const trimLabel = h('label', { class: 'check' }, c.autoTrim, ' Auto-trim to signature');
      const trimNow = h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => this.#onTrim() }, 'Trim to signature now');
      return h('section', { class: 'enhance-feature cleanup-feature' },
        h('h3', null, 'Signature clean-up'),
        cleanupToggle,
        h('fieldset', { class: 'choice-group' }, h('legend', null, 'Ink colour'), radios),
        h('label', { class: 'enhance-control' },
          h('span', { class: 'enhance-control-label' }, 'Ink strength'),
          c.strength, c.strengthValue),
        h('div', { class: 'enhance-actions' }, removeLabel, trimLabel, trimNow),
        h('p', { class: 'muted small' }, 'Sign with a black or blue pen on plain white paper, in good light.')
      );
    }

    #change(changes, previewOnly, metadata = {}) {
      const previous = this.#options;
      this.#options = this.#options.with(changes);
      this.#sync();
      this.#onChange(this.#options, {
        previewOnly,
        ...metadata,
        autoTrimEnabled: !previous.cleanup.enabled && this.#options.cleanup.enabled && this.#options.cleanup.autoTrim ||
          !previous.cleanup.autoTrim && this.#options.cleanup.autoTrim,
      });
    }

    #sync() {
      const c = this.#controls;
      if (!c.straightenDeg) return;
      for (const [name, value, unit] of [
        ['straightenDeg', this.#options.straightenDeg, '°'],
        ['brightness', this.#options.brightness, ''],
        ['contrast', this.#options.contrast, ''],
      ]) {
        c[name].value = String(value);
        c[`${name}Readout`].value = `${value}${unit}`;
      }
      c.auto.checked = this.#options.autoLevels;
      if (c.cleanupEnabled) {
        c.cleanupEnabled.checked = this.#options.cleanup.enabled;
        c.strength.value = String(this.#options.cleanup.strength);
        c.strengthValue.value = String(this.#options.cleanup.strength);
        c.removeSpecks.checked = this.#options.cleanup.removeSpecks;
        c.autoTrim.checked = this.#options.cleanup.autoTrim;
        for (const [value, input] of Object.entries(c.inkColor)) input.checked = value === this.#options.cleanup.inkColor;
      }
      if (c.backgroundEnabled) {
        c.backgroundEnabled.checked = this.#options.background.enabled;
        c.tolerance.value = String(this.#options.background.tolerance);
        c.toleranceValue.value = String(this.#options.background.tolerance);
        c.feather.value = String(this.#options.background.feather);
        c.featherValue.value = String(this.#options.background.feather);
        for (const [color, input] of Object.entries(c.backgroundRadios)) input.checked = color === this.#options.background.color;
        const isPreset = Object.hasOwn(c.backgroundRadios, this.#options.background.color);
        c.customBackground.checked = !isPreset;
        c.customColor.value = this.#options.background.color;
      }
      if (c.stampEnabled) {
        c.stampEnabled.checked = this.#options.stamp.enabled;
        c.stampName.value = this.#options.stamp.name;
        c.stampDate.value = this.#options.stamp.date;
        c.stampFormat.value = this.#options.stamp.dateFormat;
        c.stampRatio.value = String(Math.round(this.#options.stamp.heightRatio * 100));
        c.stampRatioValue.value = `${Math.round(this.#options.stamp.heightRatio * 100)}%`;
      }
    }
  }

  NS.EnhancePanel = EnhancePanel;
})(typeof window !== 'undefined' ? window : globalThis);
