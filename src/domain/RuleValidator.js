/** Checks a file's facts (size, type, pixels) against a RuleProfile. */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const mimeLabel = (mime) => ({ 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' }[mime] || mime || 'unknown');

  class ValidationReport {
    constructor(checks) {
      this.checks = Object.freeze(checks);
      Object.freeze(this);
    }
    get passed() {
      return this.checks.every((c) => c.ok);
    }
    get failures() {
      return this.checks.filter((c) => !c.ok);
    }
  }

  class RuleValidator {
    /**
     * @param {{bytes:number, mime:string, width:number, height:number}} file
     * @param {NS.RuleProfile} rule
     * @returns {ValidationReport}
     */
    validate(file, rule) {
      const checks = [];

      checks.push({
        id: 'format',
        label: 'File type',
        expected: rule.formatText(),
        actual: mimeLabel(file.mime),
        ok: rule.formats.includes(file.mime),
      });

      const tooSmall = rule.minBytes > 0 && file.bytes < rule.minBytes;
      const tooBig = rule.maxBytes !== null && file.bytes > rule.maxBytes;
      checks.push({
        id: 'size',
        label: 'File size',
        expected: rule.sizeText(),
        actual: kb(file.bytes),
        ok: !tooSmall && !tooBig,
        hint: tooSmall ? 'File is smaller than the minimum.' : tooBig ? 'File is larger than the maximum.' : '',
      });

      const dimCheck = this.#dimensions(file, rule);
      if (dimCheck) checks.push(dimCheck);

      return new ValidationReport(checks);
    }

    #dimensions(file, rule) {
      const { width, height } = file;
      if (rule.widthRange || rule.heightRange) {
        const [w0, w1] = rule.widthRange || [0, Infinity];
        const [h0, h1] = rule.heightRange || [0, Infinity];
        const range = (r, name) => (r ? `${name} ${r[0]}–${r[1]}` : '');
        return {
          id: 'dimensions',
          label: 'Dimensions',
          expected: [range(rule.widthRange, 'width'), range(rule.heightRange, 'height')].filter(Boolean).join(', ') + ' px',
          actual: `${width} × ${height} px`,
          ok: width >= w0 && width <= w1 && height >= h0 && height <= h1,
        };
      }
      if (rule.hasFixedSize) {
        return {
          id: 'dimensions',
          label: 'Dimensions',
          expected: rule.dimensionText(),
          actual: `${width} × ${height} px`,
          ok: width === rule.widthPx && height === rule.heightPx,
        };
      }
      return null;
    }
  }

  Object.assign(NS, { RuleValidator, ValidationReport });
})(typeof window !== 'undefined' ? window : globalThis);
