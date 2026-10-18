(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  const DATE_FORMATS = Object.freeze(['DD/MM/YYYY', 'DD-MM-YYYY', 'DD MMM YYYY']);
  const DEFAULTS = Object.freeze({
    straightenDeg: 0,
    brightness: 0,
    contrast: 0,
    autoLevels: false,
    background: Object.freeze({ enabled: false, color: '#ffffff', tolerance: 22, feather: 1.5 }),
    cleanup: Object.freeze({ enabled: false, inkColor: 'black', strength: 60, removeSpecks: true, autoTrim: true }),
    stamp: Object.freeze({ enabled: false, name: '', uppercase: true, date: '', dateFormat: 'DD/MM/YYYY', heightRatio: 0.14 }),
  });

  function mergeDefaults(base, input) {
    return {
      ...base,
      ...input,
      background: { ...base.background, ...(input.background || {}) },
      cleanup: { ...base.cleanup, ...(input.cleanup || {}) },
      stamp: { ...base.stamp, ...(input.stamp || {}) },
    };
  }

  class EnhanceOptions {
    static defaults(kind = 'other', stampSpec = null) {
      const values = mergeDefaults(DEFAULTS, {
        cleanup: { enabled: kind === 'signature' },
        background: { color: '#ffffff' },
        stamp: {
          enabled: Boolean(stampSpec),
          date: new Date().toISOString().slice(0, 10),
          heightRatio: stampSpec ? stampSpec.heightRatio : DEFAULTS.stamp.heightRatio,
          required: Boolean(stampSpec && stampSpec.required),
        },
      });
      return new EnhanceOptions(kind, values);
    }

    constructor(kind = 'other', values = {}) {
      if (typeof kind !== 'string' || !kind) throw new ValidationError('Enhancement kind must be a non-empty string');
      const v = mergeDefaults(DEFAULTS, values);
      this.kind = kind;
      this.straightenDeg = this.#number(v.straightenDeg, 'straightenDeg', -15, 15);
      this.brightness = this.#number(v.brightness, 'brightness', -100, 100);
      this.contrast = this.#number(v.contrast, 'contrast', -100, 100);
      this.autoLevels = Boolean(v.autoLevels);
      this.background = Object.freeze({
        enabled: Boolean(v.background.enabled),
        color: this.#color(v.background.color, 'background.color'),
        tolerance: this.#number(v.background.tolerance, 'background.tolerance', 5, 60),
        feather: this.#number(v.background.feather, 'background.feather', 0, 4),
      });
      if (!['black', 'original', 'darkblue'].includes(v.cleanup.inkColor)) throw new ValidationError('Invalid signature ink colour');
      this.cleanup = Object.freeze({
        enabled: Boolean(v.cleanup.enabled),
        inkColor: v.cleanup.inkColor,
        strength: this.#number(v.cleanup.strength, 'cleanup.strength', 0, 100),
        removeSpecks: Boolean(v.cleanup.removeSpecks),
        autoTrim: Boolean(v.cleanup.autoTrim),
      });
      const stampDate = v.stamp.date || new Date().toISOString().slice(0, 10);
      const dateParts = typeof stampDate === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(stampDate);
      const dateCheck = dateParts && new Date(0);
      if (dateCheck) dateCheck.setUTCFullYear(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]));
      if (!dateParts || dateCheck.getUTCFullYear() !== Number(dateParts[1]) ||
          dateCheck.getUTCMonth() !== Number(dateParts[2]) - 1 || dateCheck.getUTCDate() !== Number(dateParts[3])) {
        throw new ValidationError('Invalid stamp date', { userMessage: 'Enter a valid photo date.' });
      }
      if (!DATE_FORMATS.includes(v.stamp.dateFormat)) throw new ValidationError('Invalid stamp date format');
      this.stamp = Object.freeze({
        enabled: Boolean(v.stamp.enabled),
        required: Boolean(v.stamp.required),
        name: String(v.stamp.name).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40),
        uppercase: Boolean(v.stamp.uppercase),
        date: stampDate,
        dateFormat: v.stamp.dateFormat,
        heightRatio: this.#number(v.stamp.heightRatio, 'stamp.heightRatio', 0.10, 0.20),
      });
      Object.freeze(this);
    }

    with(changes = {}) {
      return new EnhanceOptions(this.kind, mergeDefaults(this.toJSON(), changes));
    }

    toJSON() {
      return {
        straightenDeg: this.straightenDeg,
        brightness: this.brightness,
        contrast: this.contrast,
        autoLevels: this.autoLevels,
        background: { ...this.background },
        cleanup: { ...this.cleanup },
        stamp: { ...this.stamp },
      };
    }

    #number(value, name, min, max) {
      const number = Number(value);
      if (!Number.isFinite(number) || number < min || number > max) {
        throw new ValidationError(`${name} must be between ${min} and ${max}`, {
          userMessage: `${name} must be between ${min} and ${max}.`,
        });
      }
      return number;
    }

    #color(value, name) {
      if (typeof value !== 'string' || !/^#[0-9a-f]{6}$/i.test(value)) {
        throw new ValidationError(`${name} must be a six-digit hex colour`);
      }
      return value.toLowerCase();
    }
  }

  NS.EnhanceOptions = EnhanceOptions;
})(typeof window !== 'undefined' ? window : globalThis);
