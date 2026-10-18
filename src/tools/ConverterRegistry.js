(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ConversionError } = NS;

  class ConverterRegistry {
    #converters = new Map();

    register(converter) {
      if (!converter || typeof converter.id !== 'string' || typeof converter.convert !== 'function') {
        throw new TypeError('Registered tools must implement the Converter interface');
      }
      if (this.#converters.has(converter.id)) {
        throw new ConversionError(`Duplicate converter id "${converter.id}"`, {
          userMessage: 'That file tool is already registered.',
        });
      }
      this.#converters.set(converter.id, converter);
      return converter;
    }

    get(id) {
      return this.#converters.get(id) || null;
    }

    all() {
      return [...this.#converters.values()];
    }

    byGroup() {
      const groups = new Map();
      for (const converter of this.#converters.values()) {
        if (!groups.has(converter.group)) groups.set(converter.group, []);
        groups.get(converter.group).push(converter);
      }
      return [...groups].map(([group, converters]) => ({ group, converters: [...converters] }));
    }
  }

  NS.ConverterRegistry = ConverterRegistry;
})(typeof window !== 'undefined' ? window : globalThis);
