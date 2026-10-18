(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class GuidedFilter {
    static apply(alpha, imageData, { radius = 8, epsilon = 1e-3 } = {}) {
      const { data, width, height } = imageData || {};
      const length = width * height;
      if (!(alpha instanceof Float32Array) || alpha.length !== length ||
          !(data instanceof Uint8ClampedArray) || data.length !== length * 4) {
        throw new ValidationError('GuidedFilter expects a float matte and RGBA guide of matching dimensions');
      }
      if (!Number.isFinite(epsilon) || epsilon <= 0 || !Number.isFinite(radius) || radius < 0) {
        throw new ValidationError('GuidedFilter radius and epsilon must be positive');
      }
      const guide = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const p = i * 4;
        guide[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
      }
      const meanI = this.#box(guide, width, height, radius);
      const meanP = this.#box(alpha, width, height, radius);
      const corrIInput = new Float32Array(length);
      const corrIpInput = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        corrIInput[i] = guide[i] * guide[i];
        corrIpInput[i] = guide[i] * alpha[i];
      }
      const corrI = this.#box(corrIInput, width, height, radius);
      const corrIp = this.#box(corrIpInput, width, height, radius);
      const a = new Float32Array(length);
      const b = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const variance = Math.max(0, corrI[i] - meanI[i] * meanI[i]);
        const covariance = corrIp[i] - meanI[i] * meanP[i];
        a[i] = covariance / (variance + epsilon);
        b[i] = meanP[i] - a[i] * meanI[i];
      }
      const meanA = this.#box(a, width, height, radius);
      const meanB = this.#box(b, width, height, radius);
      const output = new Float32Array(length);
      for (let i = 0; i < length; i++) output[i] = Math.max(0, Math.min(1, meanA[i] * guide[i] + meanB[i]));
      return output;
    }

    static #box(values, width, height, radius) {
      const length = width * height;
      const stride = width + 1;
      const integral = new Float64Array((width + 1) * (height + 1));
      for (let y = 1; y <= height; y++) {
        let row = 0;
        for (let x = 1; x <= width; x++) {
          row += values[(y - 1) * width + x - 1];
          integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
        }
      }
      const output = new Float32Array(length);
      const r = Math.floor(radius);
      for (let y = 0; y < height; y++) {
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(height, y + r + 1);
        for (let x = 0; x < width; x++) {
          const x0 = Math.max(0, x - r);
          const x1 = Math.min(width, x + r + 1);
          const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] -
            integral[y1 * stride + x0] + integral[y0 * stride + x0];
          output[y * width + x] = sum / ((x1 - x0) * (y1 - y0));
        }
      }
      return output;
    }
  }

  NS.GuidedFilter = GuidedFilter;
})(typeof window !== 'undefined' ? window : globalThis);
