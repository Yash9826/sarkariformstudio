(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, formatBytes } = NS.dom;

  class FileListView {
    #root;
    #entries = [];
    #onChange;

    constructor(rootElement, onChange = () => {}) {
      this.#root = rootElement;
      this.#onChange = onChange;
    }

    setFiles(files) {
      this.clear();
      this.#entries = files.map((file) => ({ file, rotation: 0 }));
      this.#render();
      this.#onChange(this.files);
    }

    addFiles(files) {
      this.#entries.push(...files.map((file) => ({ file, rotation: 0 })));
      this.#render();
      this.#onChange(this.files);
    }

    get files() {
      return this.#entries.map((entry) => ({ ...entry }));
    }

    clear() {
      for (const entry of this.#entries) {
        if (entry.thumbnailUrl) URL.revokeObjectURL(entry.thumbnailUrl);
      }
      this.#entries = [];
      this.#root.replaceChildren();
      this.#onChange(this.files);
    }

    setDisabled(disabled) {
      if (!disabled) {
        this.#render();
        return;
      }
      for (const button of this.#root.querySelectorAll('button')) button.disabled = true;
    }

    #render() {
      for (const entry of this.#entries) {
        if (entry.thumbnailUrl) URL.revokeObjectURL(entry.thumbnailUrl);
        entry.thumbnailUrl = null;
      }
      this.#root.replaceChildren(...this.#entries.map((entry, index) => {
        const isImage = entry.file.type.startsWith('image/');
        const thumbnail = isImage
          ? h('img', { class: 'tool-file-thumb', src: URL.createObjectURL(entry.file), alt: '' })
          : h('span', { class: 'tool-file-icon', 'aria-hidden': 'true' }, 'PDF');
        if (isImage) entry.thumbnailUrl = thumbnail.src;
        const row = h('div', {
          class: 'tool-file-row',
          draggable: 'true',
          onDragstart: (event) => event.dataTransfer.setData('text/plain', String(index)),
          onDragover: (event) => event.preventDefault(),
          onDrop: (event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData('text/plain'));
            if (!Number.isInteger(from) || from === index || !this.#entries[from]) return;
            const [item] = this.#entries.splice(from, 1);
            this.#entries.splice(index, 0, item);
            this.#render();
            this.#onChange(this.files);
          },
        },
        thumbnail,
        h('span', { class: 'tool-file-details' },
          h('strong', null, entry.file.name),
          h('small', { class: 'muted' }, formatBytes(entry.file.size))),
        h('div', { class: 'tool-file-actions' },
          h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Move ${entry.file.name} up`, disabled: index === 0, onClick: () => this.#move(index, -1) }, '↑'),
          h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Move ${entry.file.name} down`, disabled: index === this.#entries.length - 1, onClick: () => this.#move(index, 1) }, '↓'),
          isImage ? h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Rotate ${entry.file.name}`, onClick: () => {
            entry.rotation = (entry.rotation + 90) % 360;
            this.#onChange(this.files);
          } }, '↻') : null,
          h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Remove ${entry.file.name}`, onClick: () => this.#remove(index) }, '×')));
        return row;
      }));
    }

    #move(index, delta) {
      const destination = index + delta;
      if (destination < 0 || destination >= this.#entries.length) return;
      [this.#entries[index], this.#entries[destination]] = [this.#entries[destination], this.#entries[index]];
      this.#render();
      this.#onChange(this.files);
    }

    #remove(index) {
      const [entry] = this.#entries.splice(index, 1);
      if (entry.thumbnailUrl) URL.revokeObjectURL(entry.thumbnailUrl);
      this.#render();
      this.#onChange(this.files);
    }
  }

  NS.FileListView = FileListView;
})(typeof window !== 'undefined' ? window : globalThis);
