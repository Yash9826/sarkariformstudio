(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;

  class ConverterForm {
    #root;
    #schema;
    #defaults;
    #fields = new Map();
    #onChange;

    constructor(rootElement, onChange = () => {}) {
      this.#root = rootElement;
      this.#onChange = onChange;
      this.#root.addEventListener('change', () => this.#onChange());
    }

    render(schema, defaults = {}) {
      this.#schema = schema;
      this.#defaults = defaults;
      this.#fields.clear();
      this.#root.replaceChildren(...schema.map((field) => {
        const value = defaults[field.id] == null ? '' : defaults[field.id];
        const attrs = { 'aria-label': field.label, value: String(value) };
        let input;
        if (field.type === 'select') {
          input = h('select', attrs, ...field.values.map((choice) =>
            h('option', { value: choice }, choice)));
          if (field.values.includes(value)) input.value = value;
        } else {
          input = h('input', {
            ...attrs,
            type: field.type === 'number' || field.type === 'range' || field.type === 'checkbox' ? field.type : field.type || 'text',
            min: field.min == null ? null : String(field.min),
            max: field.max == null ? null : String(field.max),
            step: field.type === 'range' ? String(field.step || 1) : field.type === 'number' ? 'any' : null,
          });
          if (field.type === 'checkbox') input.checked = Boolean(value);
        }
        this.#fields.set(field.id, { input, field });
        return h('label', { class: 'field converter-field' }, h('span', null, field.label), input);
      }));
    }

    values() {
      const options = {};
      for (const [id, { input, field }] of this.#fields) {
        options[id] = field.type === 'checkbox'
          ? input.checked
          : (field.type === 'number' || field.type === 'range') && input.value.trim() !== ''
            ? Number(input.value)
            : input.value;
      }
      return options;
    }
  }

  NS.ConverterForm = ConverterForm;
})(typeof window !== 'undefined' ? window : globalThis);
