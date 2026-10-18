(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class CutoutCache {
    #entries = new Map();
    #limit;

    constructor(limit = 2) {
      this.#limit = Math.max(1, Math.floor(limit));
    }

    static key(imageData) {
      const { data, width, height } = imageData;
      let hash = 2166136261;
      const sampleStride = Math.max(4, Math.floor(Math.max(width, height) / 64) * 4);
      for (let i = 0; i < data.length; i += sampleStride) {
        hash ^= data[i];
        hash = Math.imul(hash, 16777619);
      }
      return `${width}x${height}:${(hash >>> 0).toString(16)}`;
    }

    get(imageData) {
      const key = CutoutCache.key(imageData);
      const value = this.#entries.get(key);
      if (!value) return null;
      this.#entries.delete(key);
      this.#entries.set(key, value);
      return this.#clone(value);
    }

    set(imageData, cutout) {
      const key = CutoutCache.key(imageData);
      this.#entries.delete(key);
      this.#entries.set(key, this.#clone(cutout));
      while (this.#entries.size > this.#limit) this.#entries.delete(this.#entries.keys().next().value);
    }

    clear() {
      this.#entries.clear();
    }

    #clone(value) {
      return {
        ...value,
        rgba: value.rgba && new Uint8ClampedArray(value.rgba),
        alpha: value.alpha && new Float32Array(value.alpha),
      };
    }
  }

  NS.CutoutCache = CutoutCache;
})(typeof window !== 'undefined' ? window : globalThis);
