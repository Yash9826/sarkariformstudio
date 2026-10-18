(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ConversionError, Logger, PerfTimer } = NS;

  class PdfEngine {
    #loader;
    #log = Logger.for('PdfEngine');

    constructor(loader = new NS.DependencyLoader()) {
      this.#loader = loader;
    }

    async pdfLib() {
      return this.#loader.load('pdf-lib');
    }

    async pdfJs() {
      return this.#loader.load('pdfjs');
    }

    async loadForRender(bytes, filename = 'PDF') {
      const pdfjs = await this.pdfJs();
      try {
        return await (await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise);
      } catch (error) {
        const encrypted = /encrypt|password/i.test(String(error && error.message));
        throw new ConversionError(`Could not render PDF: ${error.message || error}`, {
          code: encrypted ? 'PDF_ENCRYPTED' : 'PDF_INVALID',
          userMessage: encrypted
            ? `${filename} is password-protected. Remove the password first, then try again.`
            : `${filename} could not be read. It may be damaged.`,
          cause: error,
        });
      }
    }

    async pageCount(bytes, filename = 'PDF') {
      const document = await this.loadForEdit(bytes, filename);
      return document.getPageCount();
    }

    async destroyRenderDocument(document) {
      if (document && typeof document.destroy === 'function') await document.destroy();
    }

    async renderPage(document, pageIndex, dpi, { canvas = null, maxEdge = 8000, maxPixels = 36000000 } = {}) {
      if (!Number.isInteger(pageIndex) || pageIndex < 0 || !Number.isFinite(dpi) || dpi <= 0) {
        throw new ConversionError('Invalid PDF page render request', { code: 'INVALID_INPUT', userMessage: 'Choose a valid PDF page and resolution.' });
      }
      const page = await document.getPage(pageIndex + 1);
      let viewport = page.getViewport({ scale: dpi / 72 });
      const scale = Math.min(1, maxEdge / Math.max(viewport.width, viewport.height), Math.sqrt(maxPixels / (viewport.width * viewport.height)));
      const clamped = scale < 1;
      if (clamped) viewport = page.getViewport({ scale: dpi / 72 * scale });
      const output = canvas || root.document.createElement('canvas');
      output.width = Math.max(1, Math.ceil(viewport.width));
      output.height = Math.max(1, Math.ceil(viewport.height));
      try {
        await page.render({ canvasContext: output.getContext('2d'), viewport }).promise;
      } catch (error) {
        output.width = 0;
        output.height = 0;
        throw new ConversionError(`Could not render PDF page ${pageIndex + 1}: ${error.message || error}`, {
          code: 'PDF_INVALID',
          userMessage: `Page ${pageIndex + 1} could not be rendered. The PDF may be damaged.`,
          cause: error,
        });
      }
      return {
        canvas: output,
        clamped,
        widthPoints: page.view[2] - page.view[0],
        heightPoints: page.view[3] - page.view[1],
      };
    }

    async buildFromImages(images, options = {}, pdfLib) {
      return NS.PdfBuilder.fromImages(images, options, pdfLib || await this.pdfLib());
    }

    async loadForEdit(bytes, filename = 'PDF') {
      const { PDFDocument } = await this.pdfLib();
      try {
        return await PDFDocument.load(bytes, { updateMetadata: false });
      } catch (error) {
        const encrypted = /encrypt|password/i.test(String(error && error.message));
        throw new ConversionError(`Could not load PDF: ${error.message || error}`, {
          code: encrypted ? 'PDF_ENCRYPTED' : 'PDF_INVALID',
          userMessage: encrypted
            ? `${filename} is password-protected. Remove the password first, then try again.`
            : `${filename} could not be read. It may be damaged.`,
          details: { extension: String(filename).split('.').pop().toLowerCase() },
          cause: error,
        });
      }
    }

    async save(document, options = {}) {
      const timer = new PerfTimer('pdf-save');
      const bytes = await document.save({ useObjectStreams: true, addDefaultPage: false, ...options });
      this.#log.info('PDF saved', { durationMs: Math.round(timer.finish()), bytes: bytes.length });
      return bytes;
    }
  }

  NS.PdfEngine = PdfEngine;
})(typeof window !== 'undefined' ? window : globalThis);
