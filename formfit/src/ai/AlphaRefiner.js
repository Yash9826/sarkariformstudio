(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, BoxBlur } = NS;

  class AlphaRefiner {
    static refine(alpha, width, height, { edgeShift = 0, feather = 1, smooth = 30 } = {}) {
      this.#validate(alpha, width, height);
      if (!Number.isFinite(edgeShift) || edgeShift < -3 || edgeShift > 3 ||
          !Number.isFinite(feather) || feather < 0 || feather > 4 ||
          !Number.isFinite(smooth) || smooth < 0 || smooth > 100) {
        throw new ValidationError('Alpha refinement settings are out of range');
      }
      let result = new Float32Array(alpha);
      const shift = Math.round(Math.abs(edgeShift));
      if (shift) result = this.#morph(result, width, height, shift, edgeShift > 0);
      if (smooth > 0) result = this.#median3(result, width, height, smooth / 100);
      if (feather > 0) result = BoxBlur.blur(result, width, height, feather);
      for (let i = 0; i < result.length; i++) result[i] = Math.max(0, Math.min(1, result[i]));
      return result;
    }

    static decontaminate(rgba, alpha, width, height) {
      this.#validate(alpha, width, height);
      if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== alpha.length * 4) {
        throw new ValidationError('Defringe expects RGBA pixels matching the alpha matte');
      }
      const hardAlpha = new Float32Array(alpha.length);
      for (let i = 0; i < alpha.length; i++) hardAlpha[i] = alpha[i] > 0.95 ? 1 : 0;
      const channels = [new Float32Array(alpha.length), new Float32Array(alpha.length), new Float32Array(alpha.length)];
      for (let i = 0; i < alpha.length; i++) {
        const p = i * 4;
        for (let c = 0; c < 3; c++) channels[c][i] = rgba[p + c] * hardAlpha[i];
      }
      const denominator = BoxBlur.blur(hardAlpha, width, height, 4);
      const foreground = channels.map((channel) => BoxBlur.blur(channel, width, height, 4));
      const output = new Uint8ClampedArray(rgba);
      for (let i = 0; i < alpha.length; i++) {
        if (alpha[i] <= 0 || alpha[i] >= 0.95 || denominator[i] <= 1e-6) continue;
        const p = i * 4;
        for (let c = 0; c < 3; c++) output[p + c] = Math.max(0, Math.min(255, Math.round(foreground[c][i] / denominator[i])));
      }
      return output;
    }

    static #morph(alpha, width, height, radius, grow) {
      const output = new Float32Array(alpha.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let value = grow ? 0 : 1;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (dx * dx + dy * dy > radius * radius) continue;
              const nx = x + dx;
              const ny = y + dy;
              const sample = nx < 0 || ny < 0 || nx >= width || ny >= height
                ? 0
                : alpha[ny * width + nx];
              value = grow ? Math.max(value, sample) : Math.min(value, sample);
            }
          }
          output[y * width + x] = value;
        }
      }
      return output;
    }

    static #median3(alpha, width, height, amount) {
      const output = new Float32Array(alpha);
      const values = new Float32Array(9);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) values[n++] = alpha[(y + dy) * width + x + dx];
          }
          values.sort();
          const index = y * width + x;
          output[index] = alpha[index] * (1 - amount) + values[4] * amount;
        }
      }
      return output;
    }

    static #validate(alpha, width, height) {
      if (!(alpha instanceof Float32Array) || !Number.isInteger(width) || width < 1 ||
          !Number.isInteger(height) || height < 1 || alpha.length !== width * height) {
        throw new ValidationError('AlphaRefiner expects one float value per pixel');
      }
    }
  }

  NS.AlphaRefiner = AlphaRefiner;
})(typeof window !== 'undefined' ? window : globalThis);
