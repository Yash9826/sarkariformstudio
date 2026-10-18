(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class Converter {
    constructor({ id, title, description, group, accepts, multiple = false, minFiles = 1, maxFiles = 1, requiresHttp = false, optionsSchema = [], defaults = {} }) {
      if (!id || !title || !group || typeof this.convert !== 'function') {
        throw new TypeError('A converter needs an id, title, group, and convert implementation');
      }
      this.id = id;
      this.title = title;
      this.description = description || '';
      this.group = group;
      this.accepts = accepts || '';
      this.multiple = multiple;
      this.minFiles = minFiles;
      this.maxFiles = maxFiles;
      this.requiresHttp = requiresHttp;
      this.optionsSchema = Object.freeze([...optionsSchema]);
      this.defaults = Object.freeze({ ...defaults });
    }

    validateInputs(files) {
      if (!Array.isArray(files)) throw new ValidationError('Files must be an array');
      if (files.length < this.minFiles || files.length > this.maxFiles) {
        throw new ValidationError(`${this.title} accepts ${this.minFiles}–${this.maxFiles} files (received ${files.length})`, {
          code: 'LIMIT_EXCEEDED',
          userMessage: `Choose between ${this.minFiles} and ${this.maxFiles} files; you selected ${files.length}.`,
        });
      }
      const accepted = this.accepts.split(',').map((part) => part.trim().toLowerCase()).filter(Boolean);
      for (const entry of files) {
        const file = entry && entry.file ? entry.file : entry;
        const name = String(file && file.name || 'File');
        const type = String(file && file.type || '').toLowerCase();
        const lowerName = name.toLowerCase();
        if (accepted.length && !accepted.some((rule) =>
          rule.startsWith('.') ? lowerName.endsWith(rule) : type === rule || rule.endsWith('/*') && type.startsWith(rule.slice(0, -1)))) {
          throw new ValidationError(`${name} is not supported by ${this.title}`, {
            userMessage: `${name} is not a supported file for this tool.`,
          });
        }
      }
    }

    async convert() {
      throw new TypeError(`${this.constructor.name}.convert must be implemented`);
    }
  }

  NS.Converter = Converter;
})(typeof window !== 'undefined' ? window : globalThis);
