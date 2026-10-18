/**
 * Small structured logger that writes to the browser console.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });

  class Logger {
    static #minLevel = 'debug';
    static #silent = false;

    static for(scope) {
      return new Logger(scope);
    }

    static setLevel(level) {
      if (!(level in LEVELS)) throw new RangeError(`Unknown log level: ${level}`);
      Logger.#minLevel = level;
    }

    static setSilent(silent) {
      Logger.#silent = Boolean(silent);
    }

    static #normalise(data) {
      if (data instanceof Error) {
        return { name: data.name, message: data.message, code: data.code, stack: data.stack };
      }
      return data;
    }

    constructor(scope = 'app') {
      this.scope = scope;
    }

    debug(message, data) {
      this.#write('debug', message, data);
    }
    info(message, data) {
      this.#write('info', message, data);
    }
    warn(message, data) {
      this.#write('warn', message, data);
    }
    error(message, data) {
      this.#write('error', message, data);
    }

    #write(level, message, data) {
      if (LEVELS[level] < LEVELS[Logger.#minLevel]) return;
      if (!Logger.#silent && typeof console !== 'undefined') {
        const fn = level === 'debug' ? 'log' : level;
        const details = Logger.#normalise(data);
        console[fn](`[SarkariFormStudio:${this.scope}] ${String(message)}`, ...(details !== undefined ? [details] : []));
      }
    }
  }

  NS.Logger = Logger;
})(typeof window !== 'undefined' ? window : globalThis);
