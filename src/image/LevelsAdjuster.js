(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, Logger } = NS;

  class LevelsAdjuster {
    #log = Logger.for('LevelsAdjuster');

    apply(imageData, options = {}) {
      const { data, width, height } = imageData || {};
      if (!(data instanceof Uint8ClampedArray) || !(width > 0) || !(height > 0) || data.length !== width * height * 4) {
        throw new ValidationError('Expected an RGBA image buffer');
      }
      const brightness = Number(options.brightness || 0);
      const contrast = Number(options.contrast || 0);
      if (!Number.isFinite(brightness) || brightness < -100 || brightness > 100 ||
          !Number.isFinite(contrast) || contrast < -100 || contrast > 100) {
        throw new ValidationError('Brightness and contrast must be between -100 and 100');
      }
      const output = new Uint8ClampedArray(data.length);
      let lo = 0;
      let hi = 255;
      if (options.autoLevels) {
        const histogram = new Uint32Array(256);
        const pixels = width * height;
        for (let i = 0; i < data.length; i += 4) {
          const luminance = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
          histogram[luminance]++;
        }
        lo = this.#percentile(histogram, pixels * 0.01);
        hi = this.#percentile(histogram, pixels * 0.99);
        if (hi - lo < 20) {
          this.#log.warn('Auto-levels skipped because the tonal range is too narrow', { lo, hi });
          lo = 0;
          hi = 255;
        }
      }

      const contrastFactor = this.#contrastFactor(contrast);
      const brightnessOffset = brightness * 2.55;
      const lut = new Uint8ClampedArray(256);
      for (let value = 0; value < 256; value++) {
        let adjusted = value;
        if (options.autoLevels && hi - lo >= 20) adjusted = ((adjusted - lo) * 255) / (hi - lo);
        adjusted = contrastFactor * (adjusted - 128) + 128;
        adjusted += brightnessOffset;
        lut[value] = Math.max(0, Math.min(255, Math.round(adjusted)));
      }
      for (let i = 0; i < data.length; i += 4) {
        output[i] = lut[data[i]];
        output[i + 1] = lut[data[i + 1]];
        output[i + 2] = lut[data[i + 2]];
        output[i + 3] = 255;
      }
      return { data: output, width, height };
    }

    #contrastFactor(contrast) {
      const k = contrast * 2.55;
      return (259 * (k + 255)) / (255 * (259 - k));
    }

    #percentile(histogram, target) {
      let count = 0;
      for (let value = 0; value < histogram.length; value++) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    }
  }

  NS.LevelsAdjuster = LevelsAdjuster;
})(typeof window !== 'undefined' ? window : globalThis);
