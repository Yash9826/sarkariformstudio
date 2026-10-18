(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class BoxBlur {
    static blur(values, width, height, radius) {
      if (!(values instanceof Float32Array) || width <= 0 || height <= 0 || values.length !== width * height) {
        throw new ValidationError('BoxBlur expects one float value per pixel');
      }
      const r = Math.max(0, Math.floor(radius));
      if (!r) return new Float32Array(values);
      const stride = width + 1;
      const integral = new Float64Array((width + 1) * (height + 1));
      for (let y = 1; y <= height; y++) {
        let row = 0;
        for (let x = 1; x <= width; x++) {
          row += values[(y - 1) * width + x - 1];
          integral[y * stride + x] = integral[(y - 1) * stride + x] + row;
        }
      }
      const output = new Float32Array(values.length);
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

  NS.BoxBlur = BoxBlur;
})(typeof window !== 'undefined' ? window : globalThis);
