(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class MorphologyOps {
    static dilate(values, width, height, radius = 1) {
      return MorphologyOps.#filter(values, width, height, radius, true);
    }

    static erode(values, width, height, radius = 1) {
      return MorphologyOps.#filter(values, width, height, radius, false);
    }

    static opening(values, width, height, radius = 1) {
      return MorphologyOps.dilate(MorphologyOps.erode(values, width, height, radius), width, height, radius);
    }

    static closing(values, width, height, radius = 1) {
      return MorphologyOps.erode(MorphologyOps.dilate(values, width, height, radius), width, height, radius);
    }

    static #filter(values, width, height, radius, maximum) {
      if (!(values instanceof Float32Array || values instanceof Uint8Array) || width <= 0 || height <= 0 || values.length !== width * height) {
        throw new ValidationError('MorphologyOps expects one float value per pixel');
      }
      const r = Math.max(0, Math.floor(radius));
      const output = values instanceof Uint8Array ? new Uint8Array(values.length) : new Float32Array(values.length);
      if (values instanceof Uint8Array && r === 1) {
        for (let y = 0; y < height; y++) {
          const row = y * width;
          const up = Math.max(0, y - 1) * width;
          const down = Math.min(height - 1, y + 1) * width;
          for (let x = 0; x < width; x++) {
            const left = x > 0 ? x - 1 : x;
            const right = x + 1 < width ? x + 1 : x;
            const a = values[up + left];
            const b = values[up + x];
            const c = values[up + right];
            const d = values[row + left];
            const e = values[row + x];
            const f = values[row + right];
            const g = values[down + left];
            const h = values[down + x];
            const i = values[down + right];
            output[row + x] = maximum ? (a | b | c | d | e | f | g | h | i) : (a & b & c & d & e & f & g & h & i);
          }
        }
        return output;
      }
      if (r === 1) {
        for (let y = 0; y < height; y++) {
          const row = y * width;
          const hasUp = y > 0;
          const hasDown = y + 1 < height;
          const up = row - width;
          const down = row + width;
          for (let x = 0; x < width; x++) {
            let value = maximum ? 0 : 1;
            const left = x > 0 ? x - 1 : x;
            const right = x + 1 < width ? x + 1 : x;
            if (hasUp) {
              let sample = values[up + left];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
              sample = values[up + x];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
              sample = values[up + right];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
            }
            let sample = values[row + left];
            value = maximum ? Math.max(value, sample) : Math.min(value, sample);
            sample = values[row + x];
            value = maximum ? Math.max(value, sample) : Math.min(value, sample);
            sample = values[row + right];
            value = maximum ? Math.max(value, sample) : Math.min(value, sample);
            if (hasDown) {
              sample = values[down + left];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
              sample = values[down + x];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
              sample = values[down + right];
              value = maximum ? Math.max(value, sample) : Math.min(value, sample);
            }
            output[row + x] = value;
          }
        }
        return output;
      }
      const horizontal = new Float32Array(values.length);
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          let value = maximum ? 0 : 1;
          const start = Math.max(0, x - r);
          const end = Math.min(width - 1, x + r);
          for (let px = start; px <= end; px++) {
            const sample = values[row + px];
            value = maximum ? Math.max(value, sample) : Math.min(value, sample);
          }
          horizontal[row + x] = value;
        }
      }
      for (let y = 0; y < height; y++) {
        const start = Math.max(0, y - r) * width;
        const end = Math.min(height - 1, y + r) * width;
        for (let x = 0; x < width; x++) {
          let value = maximum ? 0 : 1;
          for (let row = start; row <= end; row += width) {
            const sample = horizontal[row + x];
            value = maximum ? Math.max(value, sample) : Math.min(value, sample);
          }
          output[y * width + x] = value;
        }
      }
      return output;
    }
  }

  NS.MorphologyOps = MorphologyOps;
})(typeof window !== 'undefined' ? window : globalThis);
