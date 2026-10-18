(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class ColorMath {
    static #LINEAR_SRGB = Float64Array.from({ length: 256 }, (_, value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });

    static rgbToLab(r, g, b, output = null, offset = 0) {
      const red = ColorMath.#LINEAR_SRGB[Math.max(0, Math.min(255, Math.round(r)))];
      const green = ColorMath.#LINEAR_SRGB[Math.max(0, Math.min(255, Math.round(g)))];
      const blue = ColorMath.#LINEAR_SRGB[Math.max(0, Math.min(255, Math.round(b)))];
      const x = (red * 0.4124564 + green * 0.3575761 + blue * 0.1804375) / 0.95047;
      const y = red * 0.2126729 + green * 0.7151522 + blue * 0.072175;
      const z = (red * 0.0193339 + green * 0.119192 + blue * 0.9503041) / 1.08883;
      const fx = x > 0.008856451679 ? Math.cbrt(x) : (7.787037037 * x) + 16 / 116;
      const fy = y > 0.008856451679 ? Math.cbrt(y) : (7.787037037 * y) + 16 / 116;
      const fz = z > 0.008856451679 ? Math.cbrt(z) : (7.787037037 * z) + 16 / 116;
      const lab = output || new Float32Array(offset + 3);
      lab[offset] = 116 * fy - 16;
      lab[offset + 1] = 500 * (fx - fy);
      lab[offset + 2] = 200 * (fy - fz);
      return output ? output : Array.from(lab.subarray(offset, offset + 3));
    }

    static deltaE(a, b) {
      return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    }
  }

  NS.ColorMath = ColorMath;
})(typeof window !== 'undefined' ? window : globalThis);
