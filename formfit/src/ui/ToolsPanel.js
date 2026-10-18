(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, clear, downloadBlob, formatBytes } = NS.dom;

  class ToolsPanel {
    #root;
    #registry;
    #notifier;
    #storage;
    #tool = null;
    #entries = [];
    #controller = null;
    #results = [];
    #els = {};
    #files;
    #form;
    #progress;
    #inputOptions = {};
    #inputViewToken = 0;
    #inputViewCleanup = null;

    constructor({ root: rootElement, registry, notifier, storage }) {
      this.#root = rootElement;
      this.#registry = registry;
      this.#notifier = notifier;
      this.#storage = storage;
      this.#build();
      const lastId = this.#storage.get('lastToolId');
      this.#selectTool(this.#registry.get(lastId) || this.#registry.all()[0], { silent: true });
    }

    #build() {
      const e = this.#els;
      e.picker = h('div', { class: 'tool-picker' });
      e.httpNotice = h('p', { class: 'note tool-http-notice', role: 'status', hidden: true },
        'This tool needs the app to be opened through a local web address. Run `python -m http.server 8080` in the project folder and open http://localhost:8080, or use the hosted version.');
      e.dropInput = h('input', { type: 'file', hidden: true, 'aria-label': 'Add files' });
      e.dropzone = h('button', { type: 'button', class: 'dropzone tool-dropzone', onClick: () => e.dropInput.click() },
        h('strong', null, 'Add files or drop them here'),
        h('small', null, 'Files are processed only in your browser.'));
      e.dropzone.addEventListener('dragover', (event) => { event.preventDefault(); e.dropzone.classList.add('drag'); });
      for (const type of ['dragleave', 'drop']) {
        e.dropzone.addEventListener(type, (event) => {
          event.preventDefault();
          e.dropzone.classList.remove('drag');
          if (type === 'drop') this.#addFiles([...event.dataTransfer.files]);
        });
      }
      e.dropInput.addEventListener('change', () => {
        this.#addFiles([...e.dropInput.files]);
        e.dropInput.value = '';
      });
      e.fileList = h('div', { class: 'tool-file-list', 'aria-label': 'Selected files' });
      e.inputView = h('div', { class: 'tool-input-view' });
      e.fileCount = h('p', { class: 'muted small tool-file-count' });
      e.clear = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.#clearFiles() }, 'Clear all');
      e.options = h('div', { class: 'tool-options form-grid' });
      e.convert = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => this.#run() }, 'Convert');
      e.cancel = h('button', { type: 'button', class: 'btn btn-ghost', hidden: true, onClick: () => this.#controller && this.#controller.abort() }, 'Cancel');
      e.progressEl = h('div', { class: 'progress' });
      this.#progress = new NS.ProgressIndicator(e.progressEl);
      e.results = h('div', { class: 'tool-results', 'aria-live': 'polite' });
      e.step1 = h('section', { class: 'tool-step' }, h('h3', null, '1. Add files'), e.dropInput, e.dropzone, e.fileCount, e.fileList, e.inputView, e.clear);
      e.step2 = h('section', { class: 'tool-step' }, h('h3', null, '2. Options'), e.options);
      e.step3 = h('section', { class: 'tool-step' }, h('h3', null, '3. Convert'), e.convert, e.cancel, e.progressEl, e.results);
      e.picker = this.#groupedPicker();
      e.picker.hidden = true;
      this.#root.append(
        h('div', { class: 'tools-panel' },
          h('h2', null, 'File tools'),
          h('p', { class: 'muted' }, 'Convert and organize your photos and PDFs locally. Nothing is uploaded.'),
          e.picker,
          e.httpNotice, e.step1, e.step2, e.step3)
      );
      this.#files = new NS.FileListView(e.fileList, (entries) => {
        this.#entries = entries;
        this.#sync();
        this.#refreshInputView();
      });
      this.#form = new NS.ConverterForm(e.options, () => {
        if (this.#tool && this.#tool.refreshInputViewOnChange) this.#refreshInputView();
      });
      e.clear.hidden = true;
    }

    open(id) {
      const tool = this.#registry.get(id);
      if (!tool) throw new NS.ValidationError(`Unknown converter: ${id}`);
      this.#selectTool(tool, { silent: true });
    }

    #groupedPicker() {
      const groups = this.#registry.byGroup();
      return h('div', { class: 'tool-groups' }, ...groups.map(({ group, converters }) => {
        const cards = converters.map((tool) => h('button', {
          type: 'button',
          class: 'tool-card',
          'aria-pressed': false,
          dataset: { toolId: tool.id },
          onClick: () => this.#selectTool(tool),
        }, h('strong', null, tool.title), h('small', null, tool.description)));
        const section = h('section', { class: 'tool-group' }, h('h3', null, group), h('div', { class: 'tool-card-grid' }, cards));
        section.dataset.group = group;
        return section;
      }));
    }

    #selectTool(tool, { silent = false } = {}) {
      if (!tool || tool === this.#tool || this.#controller) return;
      if (this.#entries.length && !silent && !window.confirm('Changing tools clears the selected files. Continue?')) return;
      this.#tool = tool;
      this.#clearFiles();
      this.#inputOptions = {};
      this.#results = [];
      clear(this.#els.results);
      this.#storage.set('lastToolId', tool.id);
      this.#els.dropInput.accept = tool.accepts;
      this.#els.dropInput.multiple = tool.multiple;
      this.#form.render(tool.optionsSchema, tool.defaults);
      for (const button of this.#els.picker.querySelectorAll('.tool-card')) {
        const selected = button.dataset.toolId === tool.id;
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        button.classList.toggle('selected', selected);
      }
      this.#sync();
    }

    #addFiles(files) {
      if (!files.length || !this.#tool) return;
      const nextCount = this.#entries.length + files.length;
      if (nextCount > this.#tool.maxFiles) {
        this.#notifier.error(`This tool accepts at most ${this.#tool.maxFiles} files; ${nextCount} were selected.`, 'File limit exceeded');
        return;
      }
      this.#files.addFiles(files);
      this.#sync();
    }

    #clearFiles() {
      this.#inputViewToken++;
      if (this.#inputViewCleanup) this.#inputViewCleanup();
      this.#inputViewCleanup = null;
      if (this.#els.inputView) clear(this.#els.inputView);
      this.#inputOptions = {};
      if (this.#files) this.#files.clear();
      else this.#entries = [];
      this.#results = [];
      if (this.#els && this.#els.results) clear(this.#els.results);
      this.#sync();
    }

    async #refreshInputView() {
      const token = ++this.#inputViewToken;
      if (this.#inputViewCleanup) this.#inputViewCleanup();
      this.#inputViewCleanup = null;
      clear(this.#els.inputView);
      this.#inputOptions = {};
      if (!this.#tool || typeof this.#tool.createInputView !== 'function' || !this.#entries.length) return;
      try {
        const view = await this.#tool.createInputView(this.#entries, {
          options: this.#form.values(),
          onOptions: (options) => { if (token === this.#inputViewToken) this.#inputOptions = options; },
          onError: (error) => this.#notifier.fromError(error, 'Could not prepare the page preview'),
        });
        if (token !== this.#inputViewToken) {
          if (view.dispose) view.dispose();
          return;
        }
        this.#els.inputView.replaceChildren(view.element);
        this.#inputViewCleanup = view.dispose || null;
      } catch (error) {
        if (token === this.#inputViewToken) this.#notifier.fromError(error, 'Could not prepare the page preview');
      }
    }

    #sync() {
      if (!this.#tool || !this.#els.convert) return;
      const blocked = this.#tool.requiresHttp && location.protocol === 'file:';
      this.#els.httpNotice.hidden = !blocked;
      this.#els.convert.disabled = Boolean(this.#controller) || blocked || this.#entries.length < this.#tool.minFiles;
      this.#els.clear.hidden = this.#entries.length === 0;
      this.#els.fileCount.textContent = this.#entries.length
        ? `${this.#entries.length} file${this.#entries.length === 1 ? '' : 's'} selected`
        : 'No files selected yet.';
    }

    async #run() {
      if (!this.#tool || this.#controller) return;
      try {
        this.#tool.validateInputs(this.#entries);
      } catch (error) {
        this.#notifier.fromError(error, 'Check the selected files');
        return;
      }
      const tool = this.#tool;
      const controller = new AbortController();
      this.#controller = controller;
      this.#els.cancel.hidden = false;
      this.#els.convert.disabled = true;
      this.#clearFilesDisabled(true);
      this.#progress.update(0, 'Starting…');
      clear(this.#els.results);
      try {
        const result = await tool.convert(this.#entries, { ...this.#form.values(), ...this.#inputOptions }, {
          signal: controller.signal,
          onProgress: (percent, message) => this.#progress.update(percent, message),
        });
        this.#results = result.outputs || [];
        this.#showResults(this.#results, result.failures || []);
        if (controller.signal.aborted) this.#notifier.info('Cancelled. No files were created.', 'Cancelled');
        else if (result.failures && result.failures.length) {
          const success = this.#results.length;
          this.#notifier.warn(
            `${success} of ${this.#entries.length} files converted. ${result.failures.length} failed: ${result.failures.map((failure) => `${failure.name} (${failure.reason})`).join('; ')}`,
            'Some files could not be converted'
          );
        } else this.#notifier.success(`${this.#results.length} output file${this.#results.length === 1 ? '' : 's'} ready to download.`, 'Conversion complete');
      } catch (error) {
        if (error.code === 'CANCELLED' || controller.signal.aborted) this.#notifier.info('Cancelled. No files were created.', 'Cancelled');
        else this.#notifier.fromError(error, 'Could not convert files');
      } finally {
        this.#controller = null;
        this.#els.cancel.hidden = true;
        this.#progress.hide();
        this.#clearFilesDisabled(false);
        this.#sync();
      }
    }

    #clearFilesDisabled(disabled) {
      this.#els.dropzone.disabled = disabled;
      this.#els.dropInput.disabled = disabled;
      this.#els.clear.disabled = disabled;
      this.#files.setDisabled(disabled);
      for (const field of this.#els.options.querySelectorAll('input,select')) field.disabled = disabled;
      for (const field of this.#els.inputView.querySelectorAll('input,button')) field.disabled = disabled;
    }

    #showResults(outputs, failures) {
      const host = clear(this.#els.results);
      if (!outputs.length && !failures.length) return;
      host.append(h('h3', null, 'Results'));
      if (outputs.length > 1) {
        host.append(h('button', { type: 'button', class: 'btn btn-primary', onClick: () => this.#downloadZip(outputs) }, 'Download all as ZIP'));
      }
      for (const item of outputs) {
        host.append(h('article', { class: 'tool-result' },
          h('span', null, h('strong', null, item.name), h('small', { class: 'muted' }, formatBytes(item.size))),
          item.note ? h('p', { class: 'note' }, item.note) : null,
          h('button', { type: 'button', class: 'btn btn-secondary', onClick: () => downloadBlob(item.blob, item.name) }, 'Download')));
      }
      if (failures.length) {
        host.append(h('section', { class: 'tool-failures', role: 'alert' },
          h('h4', null, 'Files that could not be converted'),
          ...failures.map((failure) => h('p', null, `${failure.name}: ${failure.reason}`))));
      }
    }

    async #downloadZip(outputs) {
      try {
        const zip = new NS.ZipBuilder();
        for (const item of outputs) zip.add(item.name, new Uint8Array(await item.blob.arrayBuffer()));
        downloadBlob(zip.toBlob(), `${this.#tool.id}-files.zip`);
      } catch (error) {
        this.#notifier.fromError(error, 'Could not prepare the ZIP');
      }
    }
  }

  NS.ToolsPanel = ToolsPanel;
})(typeof window !== 'undefined' ? window : globalThis);
