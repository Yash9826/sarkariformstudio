(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, PdfEngine, Logger } = NS;
  const { ValidationError } = NS;
  const { h } = NS.dom;

  class PdfOrganizeConverter extends Converter {
    #engine = new PdfEngine();
    #log = Logger.for('PdfOrganizeConverter');

    constructor() {
      super({
        id: 'pdf-organize', title: 'Rotate, delete, reorder pages', group: 'PDF',
        description: 'Edit page rotation, remove pages, or set a new page order.',
        accepts: 'application/pdf,.pdf',
        defaults: { rotatePages: '', degrees: 90, deletePages: '', newOrder: '', name: '' },
        optionsSchema: [
          { id: 'rotatePages', label: 'Rotate pages (e.g. 1-3)', type: 'text' },
          { id: 'degrees', label: 'Rotate by', type: 'select', values: ['90', '180', '270'] },
          { id: 'deletePages', label: 'Delete pages (e.g. 2, 4)', type: 'text' },
          { id: 'newOrder', label: 'New order (e.g. 3,1,2)', type: 'text' },
          { id: 'name', label: 'Output filename', type: 'text' },
        ],
      });
    }

    async createInputView(entries, { onOptions }) {
      const container = h('section', { class: 'pdf-page-organizer', 'aria-label': 'Visual PDF page organizer' });
      if (location.protocol === 'file:') {
        container.append(h('p', { class: 'note', role: 'status' },
          'Page thumbnails need the app to be opened through a local web address. Text-based page tools below still work.'));
        return { element: container };
      }
      const status = h('p', { class: 'muted small', role: 'status' }, 'Loading page thumbnails…');
      const list = h('ol', { class: 'pdf-page-grid' });
      const applyVisual = h('input', { type: 'checkbox', 'aria-label': 'Apply visual page order and edits' });
      const applyLabel = h('label', { class: 'field' }, applyVisual, h('span', null, 'Use visual order, rotation and page removal'));
      container.append(h('h4', null, 'Visual page order'), applyLabel, status, list);
      const document = await this.#engine.loadForRender(await entries[0].file.arrayBuffer(), entries[0].file.name);
      let disposed = false;
      const pages = Array.from({ length: document.numPages }, (_, index) => ({ pageIndex: index, rotation: 0 }));
      const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((items) => {
        for (const item of items) if (item.isIntersecting) {
          observer.unobserve(item.target);
          const index = [...list.querySelectorAll('canvas')].indexOf(item.target);
          const pageSpec = pages[index];
          if (!pageSpec || disposed) continue;
          this.#engine.renderPage(document, pageSpec.pageIndex, 15, { canvas: item.target }).catch((error) => {
            status.textContent = `Could not render page ${pageSpec.pageIndex + 1}.`;
            this.#log.warn('Page thumbnail render failed', { page: pageSpec.pageIndex + 1, error });
          });
        }
      });
      const updateOptions = () => onOptions({ organizedPages: applyVisual.checked ? pages.map((page) => ({ ...page })) : null });
      applyVisual.addEventListener('change', updateOptions);
      const render = () => {
        if (observer) observer.disconnect();
        list.replaceChildren(...pages.map((item, index) => {
          const canvas = h('canvas', { class: 'pdf-page-thumb', width: 120, height: 160, 'aria-label': `Page ${item.pageIndex + 1} preview` });
          const number = h('span', { class: 'small' }, `Page ${item.pageIndex + 1}`);
          const up = h('button', { type: 'button', class: 'btn btn-ghost', disabled: index === 0, 'aria-label': `Move page ${item.pageIndex + 1} earlier`, onClick: () => move(index, -1) }, '↑');
          const down = h('button', { type: 'button', class: 'btn btn-ghost', disabled: index === pages.length - 1, 'aria-label': `Move page ${item.pageIndex + 1} later`, onClick: () => move(index, 1) }, '↓');
          const rotate = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Rotate page ${item.pageIndex + 1}`, onClick: () => { item.rotation = (item.rotation + 90) % 360; updateOptions(); } }, '↻');
          const remove = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-label': `Remove page ${item.pageIndex + 1}`, onClick: () => { pages.splice(index, 1); render(); } }, 'Remove');
          const card = h('li', { class: 'pdf-page-card', draggable: true },
            canvas, number, h('div', { class: 'pdf-page-actions' }, up, down, rotate, remove));
          card.addEventListener('dragstart', (event) => { event.dataTransfer.setData('text/plain', String(index)); });
          card.addEventListener('dragover', (event) => event.preventDefault());
          card.addEventListener('drop', (event) => {
            event.preventDefault();
            const from = Number(event.dataTransfer.getData('text/plain'));
            const [moving] = pages.splice(from, 1);
            pages.splice(index, 0, moving);
            render();
          });
          if (observer) observer.observe(canvas);
          else if (!disposed) {
            this.#engine.renderPage(document, item.pageIndex, 15, { canvas })
              .catch((error) => this.#log.warn('Page thumbnail render failed', { page: item.pageIndex + 1, error }));
          }
          return card;
        }));
        if (pages.length === 0) status.textContent = 'No pages remain. Restore at least one page to create a PDF.';
        else status.textContent = `${pages.length} page${pages.length === 1 ? '' : 's'} — drag to reorder, or use the page controls.`;
        updateOptions();
      };
      const move = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= pages.length) return;
        [pages[index], pages[target]] = [pages[target], pages[index]];
        render();
      };
      render();
      return {
        element: container,
        dispose: () => {
          disposed = true;
          if (observer) observer.disconnect();
          for (const canvas of list.querySelectorAll('canvas')) { canvas.width = 0; canvas.height = 0; }
          this.#engine.destroyRenderDocument(document);
        },
      };
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const entry = entries[0];
      const document = await this.#engine.loadForEdit(await entry.file.arrayBuffer(), entry.file.name);
      const PDFLib = await this.#engine.pdfLib();
      const originalCount = document.getPageCount();
      if (Array.isArray(options.organizedPages)) {
        const pageSpecs = options.organizedPages;
        if (!pageSpecs.length || pageSpecs.some((item) => !Number.isInteger(item.pageIndex) || item.pageIndex < 0 || item.pageIndex >= originalCount)) {
          throw new ValidationError('Visual page order must keep at least one valid page', {
            userMessage: 'Keep at least one page in the PDF.',
          });
        }
        const organized = await PDFLib.PDFDocument.create();
        for (const spec of pageSpecs) {
          ConverterUtils.assertNotAborted(context.signal);
          const [page] = await organized.copyPages(document, [spec.pageIndex]);
          if (spec.rotation) page.setRotation(PDFLib.degrees((page.getRotation().angle + Number(spec.rotation)) % 360));
          organized.addPage(page);
        }
        ConverterUtils.assertNotAborted(context.signal);
        const bytes = await this.#engine.save(organized);
        const name = `${ConverterUtils.safeBaseName(options.name || `${ConverterUtils.safeBaseName(entry.file.name)}-organized`)}.pdf`;
        this.#log.info('Visual PDF page organization finished', { originalPages: originalCount, outputPages: organized.getPageCount(), bytes: bytes.length });
        return { outputs: [ConverterUtils.output(name, new Blob([bytes], { type: 'application/pdf' }))], failures: [] };
      }
      const angle = Number(options.degrees);
      if (![90, 180, 270].includes(angle)) throw new ValidationError('Rotation must be 90, 180, or 270 degrees');
      const toRotate = options.rotatePages ? NS.PageRangeParser.parse(options.rotatePages, originalCount) : [];
      for (const index of toRotate) {
        const page = document.getPage(index);
        page.setRotation(PDFLib.degrees((page.getRotation().angle + angle) % 360));
      }
      const toDelete = options.deletePages ? NS.PageRangeParser.parse(options.deletePages, originalCount) : [];
      if (toDelete.length >= originalCount) {
        throw new ValidationError('Cannot delete every page in the document', { userMessage: 'Keep at least one page in the PDF.' });
      }
      for (const index of [...toDelete].sort((a, b) => b - a)) document.removePage(index);

      let result = document;
      if (options.newOrder.trim()) {
        const pages = options.newOrder.split(',').map((part) => Number(part.trim()));
        const remaining = document.getPageCount();
        if (pages.length !== remaining || pages.some((n) => !Number.isInteger(n) || n < 1 || n > remaining) ||
            new Set(pages).size !== remaining) {
          throw new ValidationError(`New order must list each remaining page exactly once (1–${remaining})`, {
            userMessage: `New order must list every remaining page exactly once, from 1 to ${remaining}.`,
          });
        }
        const reordered = await PDFLib.PDFDocument.create();
        for (const page of await reordered.copyPages(document, pages.map((n) => n - 1))) reordered.addPage(page);
        result = reordered;
      }
      ConverterUtils.assertNotAborted(context.signal);
      const bytes = await this.#engine.save(result);
      const name = `${ConverterUtils.safeBaseName(options.name || `${ConverterUtils.safeBaseName(entry.file.name)}-organized`)}.pdf`;
      this.#log.info('PDF page organization finished', { originalPages: originalCount, outputPages: result.getPageCount(), bytes: bytes.length });
      return { outputs: [ConverterUtils.output(name, new Blob([bytes], { type: 'application/pdf' }))], failures: [] };
    }
  }

  NS.PdfOrganizeConverter = PdfOrganizeConverter;
})(typeof window !== 'undefined' ? window : globalThis);
