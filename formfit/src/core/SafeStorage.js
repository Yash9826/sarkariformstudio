/**
 * localStorage wrapper that never throws (private windows, blocked storage,
 * quota errors). The app must work fine without it.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class SafeStorage {
    constructor(prefix = 'formfit:', logger = NS.Logger.for('storage')) {
      this.prefix = prefix;
      this.logger = logger;
    }

    get(key, fallback = null) {
      try {
        const raw = root.localStorage.getItem(this.prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (error) {
        this.logger.warn(`Could not read "${key}" from storage`, error);
        return fallback;
      }
    }

    set(key, value) {
      try {
        root.localStorage.setItem(this.prefix + key, JSON.stringify(value));
        return true;
      } catch (error) {
        this.logger.warn(`Could not save "${key}" to storage`, error);
        return false;
      }
    }
  }

  NS.SafeStorage = SafeStorage;
})(typeof window !== 'undefined' ? window : globalThis);
