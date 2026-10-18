(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class PassportPreset {
    constructor(spec) {
      if (!spec || !spec.id || !spec.label || !spec.group) throw new ValidationError('Passport preset needs an id, label, and group');
      const custom = spec.id === 'custom';
      if (!custom && (!(spec.widthMm > 0) || !(spec.heightMm > 0) || !(spec.dpi > 0))) {
        throw new ValidationError(`Passport preset "${spec.id}" needs positive dimensions and DPI`);
      }
      if (spec.dpi != null && (!Number.isFinite(spec.dpi) || spec.dpi < 0)) {
        throw new ValidationError(`Passport preset "${spec.id}" has invalid DPI`);
      }
      const ratio = spec.headRatio;
      if (ratio && (!(ratio.min > 0) || ratio.min > ratio.target || ratio.target > ratio.max || ratio.max >= 1)) {
        throw new ValidationError(`Passport preset "${spec.id}" has an invalid head ratio range`);
      }
      this.id = spec.id;
      this.label = spec.label;
      this.group = spec.group;
      this.widthMm = spec.widthMm ?? null;
      this.heightMm = spec.heightMm ?? null;
      this.dpi = spec.dpi ?? null;
      this.outputPx = Object.freeze(spec.outputPx
        ? { w: spec.outputPx.w, h: spec.outputPx.h }
        : custom ? {} : { w: Math.round(spec.widthMm / 25.4 * spec.dpi), h: Math.round(spec.heightMm / 25.4 * spec.dpi) });
      this.headRatio = ratio ? Object.freeze({ ...ratio }) : null;
      this.topMarginRatio = spec.topMarginRatio ?? null;
      this.eyeLineRatio = spec.eyeLineRatio ?? null;
      this.background = spec.background || 'white';
      this.allowedBackgrounds = Object.freeze([...(spec.allowedBackgrounds || [])]);
      this.minKB = spec.minKB ?? null;
      this.maxKB = spec.maxKB ?? null;
      this.format = spec.format || 'jpg';
      this.stampAllowed = Boolean(spec.stampAllowed);
      this.stampRequired = Boolean(spec.stampRequired);
      this.notes = spec.notes || '';
      this.source = spec.source || null;
      this.lastVerified = spec.lastVerified || null;
      this.confidence = spec.confidence || 'unverified';
      Object.freeze(this);
    }
  }

  NS.PassportPreset = PassportPreset;
})(typeof window !== 'undefined' ? window : globalThis);
