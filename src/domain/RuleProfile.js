/**
 * RuleProfile: an immutable description of ONE upload requirement
 * (e.g. "Photo, 200 × 230 px, 20–50 KB, JPEG").
 *
 * File-size convention: portals disagree on whether 1 KB is 1000 or 1024 bytes.
 * To be safe under both, we require  size >= minKB * 1024  and  size <= maxKB * 1000.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { RuleError, UnitConverter } = NS;

  const MIME_BY_ALIAS = Object.freeze({
    jpg: 'image/jpeg', jpeg: 'image/jpeg', 'image/jpeg': 'image/jpeg',
    png: 'image/png', 'image/png': 'image/png',
    webp: 'image/webp', 'image/webp': 'image/webp',
  });
  const EXT_BY_MIME = Object.freeze({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' });
  const LABEL_BY_MIME = Object.freeze({ 'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP' });

  class RuleProfile {
    static KINDS = Object.freeze(['photo', 'signature', 'thumb', 'declaration', 'custom']);
    static KIND_LABELS = Object.freeze({
      photo: 'Photo', signature: 'Signature', thumb: 'Thumb impression', declaration: 'Declaration', custom: 'Custom',
    });
    static DEFAULT_DPI = 200;
    static DEFAULT_MAX_EDGE_PX = 2000;

    constructor(spec) {
      if (!spec || typeof spec !== 'object') throw new RuleError('Rule spec must be an object');
      const id = spec.id;
      if (typeof id !== 'string' || !id.trim()) throw new RuleError('Rule needs a non-empty id');
      const where = `Rule "${id}"`;

      if (!RuleProfile.KINDS.includes(spec.kind)) throw new RuleError(`${where}: unknown kind "${spec.kind}"`);

      const hasW = spec.width != null;
      const hasH = spec.height != null;
      if (hasW !== hasH) {
        throw new RuleError(`${where}: width and height must be given together`, {
          userMessage: 'Enter both width and height, or leave both empty for a free crop.',
        });
      }

      const unit = spec.unit || 'px';
      const dpi = spec.dpi != null ? spec.dpi : RuleProfile.DEFAULT_DPI;
      let widthPx = null;
      let heightPx = null;
      if (hasW) {
        try {
          widthPx = UnitConverter.toPixels(spec.width, unit, dpi);
          heightPx = UnitConverter.toPixels(spec.height, unit, dpi);
        } catch (error) {
          throw new RuleError(`${where}: ${error.message}`, { userMessage: error.userMessage, cause: error });
        }
        if (widthPx < 10 || heightPx < 10) {
          throw new RuleError(`${where}: size too small (${widthPx}×${heightPx})`, {
            userMessage: 'That size is too small to be useful (minimum 10 px).',
          });
        }
        if (widthPx > 10000 || heightPx > 10000) {
          throw new RuleError(`${where}: size too large (${widthPx}×${heightPx})`, {
            userMessage: 'That size is too large (maximum 10,000 px).',
          });
        }
      }

      const minKB = spec.minKB != null ? Number(spec.minKB) : 0;
      const maxKB = spec.maxKB != null ? Number(spec.maxKB) : null;
      if (!Number.isFinite(minKB) || minKB < 0) {
        throw new RuleError(`${where}: invalid minKB`, { userMessage: 'Minimum size must be 0 KB or more.' });
      }
      if (maxKB !== null && (!Number.isFinite(maxKB) || maxKB <= 0)) {
        throw new RuleError(`${where}: invalid maxKB`, { userMessage: 'Maximum size must be greater than 0 KB.' });
      }
      if (maxKB !== null && minKB > maxKB) {
        throw new RuleError(`${where}: minKB (${minKB}) is larger than maxKB (${maxKB})`, {
          userMessage: 'Minimum size cannot be larger than maximum size.',
        });
      }

      const formats = (spec.formats && spec.formats.length ? spec.formats : ['jpg']).map((f) => {
        const mime = MIME_BY_ALIAS[String(f).toLowerCase()];
        if (!mime) throw new RuleError(`${where}: unsupported format "${f}"`, { userMessage: `Format "${f}" is not supported.` });
        return mime;
      });

      for (const [name, range] of [['widthRange', spec.widthRange], ['heightRange', spec.heightRange]]) {
        if (range == null) continue;
        if (!Array.isArray(range) || range.length !== 2 || range[0] > range[1]) {
          throw new RuleError(`${where}: ${name} must be [min, max]`);
        }
      }

      let aspect = null;
      if (hasW) aspect = widthPx / heightPx;
      else if (spec.aspect != null) {
        if (!(Number(spec.aspect) > 0)) throw new RuleError(`${where}: aspect must be positive`);
        aspect = Number(spec.aspect);
      }
      let stampSpec = null;
      if (spec.stamp != null) {
        const stamp = spec.stamp;
        if (!stamp || typeof stamp !== 'object' || Array.isArray(stamp)) {
          throw new RuleError(`${where}: stamp must be an object`);
        }
        const heightRatio = stamp.heightRatio == null ? 0.14 : Number(stamp.heightRatio);
        if (!Number.isFinite(heightRatio) || heightRatio < 0.10 || heightRatio > 0.20) {
          throw new RuleError(`${where}: stamp.heightRatio must be between 0.10 and 0.20`);
        }
        stampSpec = Object.freeze({ required: Boolean(stamp.required), heightRatio });
      }

      this.id = id;
      this.kind = spec.kind;
      this.widthPx = widthPx;
      this.heightPx = heightPx;
      this.widthRange = spec.widthRange || null;
      this.heightRange = spec.heightRange || null;
      this.minKB = minKB;
      this.maxKB = maxKB;
      this.formats = Object.freeze(formats);
      this.aspectRatio = aspect;
      this.stampSpec = stampSpec;
      this.background = spec.background || '#ffffff';
      this.maxEdgePx = spec.maxEdgePx || RuleProfile.DEFAULT_MAX_EDGE_PX;
      this.notes = spec.notes || '';
      Object.freeze(this);
    }

    get hasFixedSize() {
      return this.widthPx !== null;
    }
    get minBytes() {
      return Math.round(this.minKB * 1024);
    }
    /** null when there is no upper limit. */
    get maxBytes() {
      return this.maxKB === null ? null : Math.round(this.maxKB * 1000);
    }
    get mime() {
      return this.formats[0];
    }
    get extension() {
      return EXT_BY_MIME[this.mime];
    }
    get kindLabel() {
      return RuleProfile.KIND_LABELS[this.kind];
    }

    effectiveAspect(stampHeightRatio = this.stampSpec ? this.stampSpec.heightRatio : 0) {
      if (this.hasFixedSize && stampHeightRatio > 0) {
        const pictureHeight = this.heightPx - Math.round(this.heightPx * stampHeightRatio);
        return this.widthPx / pictureHeight;
      }
      return this.aspectRatio;
    }

    fileName(prefix = '') {
      const base = prefix ? `${prefix}-${this.kind}` : this.kind;
      return `${base}.${this.extension}`;
    }

    /** Human-readable size range, e.g. "20–50 KB", "up to 200 KB", "at least 10 KB". */
    sizeText() {
      if (this.maxKB !== null && this.minKB > 0) return `${this.minKB}–${this.maxKB} KB`;
      if (this.maxKB !== null) return `up to ${this.maxKB} KB`;
      if (this.minKB > 0) return `at least ${this.minKB} KB`;
      return 'any size';
    }

    dimensionText() {
      if (!this.hasFixedSize) return 'Free crop';
      return `${this.widthPx} × ${this.heightPx} px`;
    }

    formatText() {
      return this.formats.map((m) => LABEL_BY_MIME[m]).join(' / ');
    }

    /** One-line plain summary: "Photo · 200 × 230 px · 20–50 KB · JPEG". */
    summary() {
      return [this.kindLabel, this.dimensionText(), this.sizeText(), this.formatText()].join(' · ');
    }

    /** Stable key used to merge exams whose requirements are identical. */
    signature() {
      return [
        this.kind, this.widthPx, this.heightPx, this.minKB, this.maxKB, this.formats.join(','),
        JSON.stringify(this.widthRange), JSON.stringify(this.heightRange), this.aspectRatio, JSON.stringify(this.stampSpec),
      ].join('|');
    }
  }

  NS.RuleProfile = RuleProfile;
})(typeof window !== 'undefined' ? window : globalThis);
