(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class TextFitter {
    static fit(name, date, availableWidth, measureText) {
      const clean = (text) => String(text || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
      const first = clean(name);
      const second = clean(date);
      const maxWidth = availableWidth * 0.94;
      const measure = (text, size) => measureText(text, size);
      const twoLineSize = Math.min(this.#largest(first, maxWidth, measure), this.#largest(second, maxWidth, measure));
      if (twoLineSize >= 11) return { lines: [first, second].filter(Boolean), fontSize: twoLineSize, warning: false };
      const combined = [first, second].filter(Boolean).join('  ');
      const singleLineSize = this.#largest(combined, maxWidth, measure);
      return { lines: [combined], fontSize: singleLineSize, warning: singleLineSize < 8 };
    }

    static #largest(text, width, measure) {
      if (!text) return 200;
      let low = 6;
      let high = 200;
      for (let i = 0; i < 14; i++) {
        const middle = (low + high) / 2;
        if (measure(text, middle) <= width) low = middle;
        else high = middle;
      }
      return Math.floor(low);
    }
  }

  NS.TextFitter = TextFitter;
})(typeof window !== 'undefined' ? window : globalThis);
