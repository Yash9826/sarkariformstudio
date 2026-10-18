(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { PassportPreset } = NS;

  class PassportPresetRegistry {
    #presets = new Map();

    constructor(specs) {
      if (!Array.isArray(specs)) throw new NS.ValidationError('Passport presets must be an array');
      for (const spec of specs) {
        const preset = spec instanceof PassportPreset ? spec : new PassportPreset(spec);
        if (this.#presets.has(preset.id)) throw new NS.ValidationError(`Duplicate passport preset "${preset.id}"`);
        this.#presets.set(preset.id, preset);
      }
    }

    get(id) {
      return this.#presets.get(id) || null;
    }

    all() {
      return [...this.#presets.values()];
    }

    deriveCustom({ width, height, unit = 'mm', dpi = 300, headRatio = 0.75 }) {
      const factors = { mm: 1, cm: 10, in: 25.4 };
      if (![width, height, dpi, headRatio].every(Number.isFinite) || width <= 0 || height <= 0 || dpi <= 0 ||
          headRatio < 0.55 || headRatio > 0.85 || !Object.hasOwn(factors, unit)) {
        throw new NS.ValidationError('Custom passport dimensions are invalid');
      }
      const widthMm = width * factors[unit];
      const heightMm = height * factors[unit];
      return new PassportPreset({
        id: 'custom-result', label: 'Custom size', group: 'Custom', widthMm, heightMm, dpi,
        outputPx: { w: Math.round(widthMm / 25.4 * dpi), h: Math.round(heightMm / 25.4 * dpi) },
        headRatio: { min: Math.max(0.55, headRatio - 0.1), target: headRatio, max: Math.min(0.85, headRatio + 0.1) },
        confidence: 'unverified',
      });
    }
  }

  NS.PassportPresetRegistry = PassportPresetRegistry;
})(typeof window !== 'undefined' ? window : globalThis);
