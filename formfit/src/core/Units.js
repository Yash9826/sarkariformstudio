/** Length conversions between physical units and pixels. */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class UnitConverter {
    static UNITS = Object.freeze(['px', 'cm', 'mm', 'in']);
    static #CM_PER_INCH = 2.54;

    /**
     * Convert a length to whole pixels.
     * @param {number} value  positive length
     * @param {'px'|'cm'|'mm'|'in'} unit
     * @param {number} [dpi]  required for every unit except px
     */
    static toPixels(value, unit, dpi) {
      UnitConverter.#assertUnit(unit);
      UnitConverter.#assertPositive(value, 'Length');
      if (unit === 'px') return Math.round(value);
      UnitConverter.#assertPositive(dpi, 'DPI');

      let inches;
      if (unit === 'in') inches = value;
      else if (unit === 'cm') inches = value / UnitConverter.#CM_PER_INCH;
      else inches = value / 10 / UnitConverter.#CM_PER_INCH; // mm
      return Math.round(inches * dpi);
    }

    static fromPixels(px, unit, dpi) {
      UnitConverter.#assertUnit(unit);
      UnitConverter.#assertPositive(px, 'Pixels');
      if (unit === 'px') return px;
      UnitConverter.#assertPositive(dpi, 'DPI');
      const inches = px / dpi;
      if (unit === 'in') return inches;
      const cm = inches * UnitConverter.#CM_PER_INCH;
      return unit === 'cm' ? cm : cm * 10;
    }

    static #assertUnit(unit) {
      if (!UnitConverter.UNITS.includes(unit)) {
        throw new ValidationError(`Unsupported unit "${unit}"`, {
          userMessage: 'Please choose px, cm, mm or inches as the unit.',
        });
      }
    }

    static #assertPositive(n, label) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
        throw new ValidationError(`${label} must be a positive number, got ${n}`, {
          userMessage: `${label} must be a number greater than zero.`,
        });
      }
    }
  }

  NS.UnitConverter = UnitConverter;
})(typeof window !== 'undefined' ? window : globalThis);
