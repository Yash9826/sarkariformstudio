(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, PdfEngine, PerfTimer, Logger } = NS;
  const { ConversionError } = NS;

  class PdfToImagesConverter extends Converter {
    #engine = new PdfEngine();
    #compressor = new NS.ImageCompressor();
    #log = Logger.for('PdfToImagesConverter');

    constructor() {
      super({
        id: 'pdf-to-images', title: 'PDF to images', group: 'PDF',
        description: 'Render PDF pages as JPEG or PNG images.',
        accepts: 'application/pdf,.pdf', requiresHttp: true,
        defaults: { format: 'JPG', dpi: 150, pages: '', sizeTarget: '' },
        optionsSchema: [
          { id: 'format', label: 'Image format', type: 'select', values: ['JPG', 'PNG'] },
          { id: 'dpi', label: 'Resolution (DPI)', type: 'select', values: ['72', '100', '150', '200'] },
          { id: 'pages', label: 'Pages (leave blank for all)', type: 'text' },
          { id: 'sizeTarget', label: 'Maximum image size (KB, JPG only)', type: 'number', min: 1 },
        ],
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const file = entries[0].file;
      const timer = new PerfTimer('pdf-to-images');
      const bytes = new Uint8Array(await file.arrayBuffer());
      const pdf = await this.#engine.loadForRender(bytes, file.name);
      try {
        if (pdf.numPages > 100) {
          throw new ConversionError(`PDF contains ${pdf.numPages} pages`, {
            code: 'LIMIT_EXCEEDED',
            userMessage: `This tool supports up to 100 pages; this PDF has ${pdf.numPages}.`,
          });
        }
        if (pdf.numPages > 30 && !window.confirm(`This PDF has ${pdf.numPages} pages and may take a while. Continue?`)) {
          throw new ConversionError('User cancelled a long PDF render', { code: 'CANCELLED', userMessage: 'Cancelled. No files were created.' });
        }
        const pages = options.pages ? NS.PageRangeParser.parse(options.pages, pdf.numPages) : Array.from({ length: pdf.numPages }, (_, index) => index);
        if (!pages.length) throw new ConversionError('No PDF pages were selected', { code: 'INVALID_INPUT', userMessage: 'Select at least one page.' });
        const outputs = [];
        const used = new Set();
        const dpi = Number(options.dpi);
        if (![72, 100, 150, 200].includes(dpi)) throw new ConversionError('Unsupported PDF render resolution', { code: 'INVALID_INPUT', userMessage: 'Choose a supported resolution.' });
        for (let i = 0; i < pages.length; i++) {
          ConverterUtils.assertNotAborted(context.signal);
          const pageNumber = pages[i] + 1;
          const rendered = await this.#engine.renderPage(pdf, pages[i], dpi);
          const canvas = rendered.canvas;
          if (rendered.clamped) {
            this.#log.warn('PDF page render was clamped', { page: pageNumber, requestedDpi: dpi });
          }
          try {
            const mime = options.format === 'PNG' ? 'image/png' : 'image/jpeg';
            let blob = await ConverterUtils.encodeCanvas(canvas, mime, 0.92);
            if (options.sizeTarget && mime === 'image/jpeg') {
              blob = (await this.#compressor.compress(canvas, {
                mime,
                minBytes: 0,
                maxBytes: NS.ByteSize.parse(`${options.sizeTarget} KB`),
                allowDownscale: true,
              })).blob;
            }
            const suffix = String(pageNumber).padStart(3, '0');
            const name = ConverterUtils.uniqueName(`${ConverterUtils.safeBaseName(file.name)}-page-${suffix}.${mime === 'image/png' ? 'png' : 'jpg'}`, used);
            outputs.push(ConverterUtils.output(name, blob));
            context.onProgress((i + 1) / pages.length * 100, `Rendered page ${i + 1} of ${pages.length}…`);
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        this.#log.info('PDF pages rendered', { durationMs: Math.round(timer.finish()), pages: outputs.length });
        return { outputs, failures: [] };
      } finally {
        await this.#engine.destroyRenderDocument(pdf);
      }
    }
  }

  NS.PdfToImagesConverter = PdfToImagesConverter;
})(typeof window !== 'undefined' ? window : globalThis);
