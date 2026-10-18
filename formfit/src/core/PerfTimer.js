(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class PerfTimer {
    #started;
    #label;

    constructor(label) {
      this.#label = label;
      this.#started = performance.now();
    }

    finish() {
      const durationMs = performance.now() - this.#started;
      if (durationMs > 2000) NS.Logger.for('PerfTimer').warn('Slow operation', { label: this.#label, durationMs: Math.round(durationMs) });
      return durationMs;
    }
  }

  NS.PerfTimer = PerfTimer;
})(typeof window !== 'undefined' ? window : globalThis);
