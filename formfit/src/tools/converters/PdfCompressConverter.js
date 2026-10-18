(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, PdfEngine, PdfCompressionSearch, PerfTimer, Logger } = NS;
  const { ConversionError } = NS;
  const DPI_RUNGS = Object.freeze([150, 130, 110, 96, 84, 72]);

  class PdfCompressConverter extends Converter {
    #engine = new PdfEngine();
    #log = Logger.for('PdfCompressConverter');

    constructor() {
      super({
        id: 'pdf-compress', title: 'Compress PDF to a size', group: 'PDF',
        description: 'Reduce PDF size; raster mode may make text unselectable.',
        accepts: 'application/pdf,.pdf', requiresHttp: true,
        defaults: { sizeTarget: 300, keepText: true },
        optionsSchema: [
          { id: 'sizeTarget', label: 'Maximum PDF size (KB)', type: 'select', values: ['100', '200', '300', '500', '1024'] },
          { id: 'keepText', label: 'Keep text selectable if possible', type: 'checkbox' },
        ],
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const file = entries[0].file;
      if (file.size > 50 * 1024 * 1024) {
        throw new ConversionError(`PDF size ${file.size} bytes exceeds the 50 MB limit`, {
          code: 'LIMIT_EXCEEDED',
          userMessage: `This PDF is ${NS.ByteSize.format(file.size)}. The maximum is 50 MB.`,
        });
      }
      const target = NS.ByteSize.parse(`${options.sizeTarget} KB`);
      const timer = new PerfTimer('pdf-compress');
      const data = new Uint8Array(await file.arrayBuffer());
      const original = await this.#engine.loadForEdit(data, file.name);
      const pageCount = original.getPageCount();
      if (pageCount > 60 && !window.confirm(`This PDF has ${pageCount} pages and may be slow to compress. Continue?`)) {
        throw new ConversionError('User cancelled a long PDF compression', { code: 'CANCELLED', userMessage: 'Cancelled. No files were created.' });
      }
      const PDFLib = await this.#engine.pdfLib();
      const lightDocument = await PDFLib.PDFDocument.create();
      for (const page of await lightDocument.copyPages(original, original.getPageIndices())) lightDocument.addPage(page);
      const lightBytes = await this.#engine.save(lightDocument);
      let resultBlob = new Blob([lightBytes], { type: 'application/pdf' });
      let note = 'Already within the limit; no quality lost.';
      let details = '';
      if (resultBlob.size > target) {
        const renderedPdf = await this.#engine.loadForRender(data, file.name);
        const rendered = [];
        let found;
        let renderedDpi = null;
        try {
          if (pageCount > 60) this.#log.warn('Compressing more than 60 pages', { pageCount });
          const renderRung = async (dpi) => {
            if (renderedDpi === dpi) return;
            for (const page of rendered) { page.canvas.width = 0; page.canvas.height = 0; }
            rendered.length = 0;
            renderedDpi = dpi;
            this.#log.debug('Rendering compression rung', { dpi });
            for (let i = 1; i <= pageCount; i++) {
              ConverterUtils.assertNotAborted(context.signal);
              const page = await this.#engine.renderPage(renderedPdf, i - 1, dpi);
              if (page.clamped) this.#log.warn('Compression page render was clamped', { page: i, requestedDpi: dpi });
              rendered.push({ canvas: page.canvas, width: page.widthPoints, height: page.heightPoints });
              context.onProgress(i / pageCount * 45, `Rendering page ${i} of ${pageCount} at ${dpi} DPI…`);
            }
          };
          if (pageCount > 60) this.#log.warn('Compressing more than 60 pages', { pageCount });
          found = await PdfCompressionSearch.findFirstFit(DPI_RUNGS, target, async (dpi, quality) => {
            ConverterUtils.assertNotAborted(context.signal);
            await renderRung(dpi);
            const compressed = await this.#buildRaster(PDFLib, rendered, quality);
            return new Blob([compressed], { type: 'application/pdf' });
          });
          if (found) {
            resultBlob = found.blob;
            details = `${found.rung} DPI, ${Math.round(found.quality * 100)}% JPEG quality.`;
          }
        } catch (error) {
          if (error.code !== 'TARGET_UNREACHABLE') throw error;
          throw new ConversionError(`PDF is larger than the ${NS.ByteSize.format(target)} target`, {
            code: 'TARGET_UNREACHABLE',
            userMessage: `Even at the lowest quality this document is larger than ${NS.ByteSize.format(target)}. Remove some pages or choose a larger limit.`,
          });
        } finally {
          for (const page of rendered) { page.canvas.width = 0; page.canvas.height = 0; }
          await this.#engine.destroyRenderDocument(renderedPdf);
        }
        note = 'Pages were converted to images to reach the size, so text can no longer be selected or searched.';
      }
      const outputItem = ConverterUtils.output(`${ConverterUtils.safeBaseName(file.name)}-compressed.pdf`, resultBlob, `${NS.ByteSize.format(file.size)} → ${NS.ByteSize.format(resultBlob.size)}. ${note} ${details}`.trim());
      outputItem.beforeBytes = file.size;
      this.#log.info('PDF compression finished', { durationMs: Math.round(timer.finish()), inputBytes: file.size, outputBytes: resultBlob.size, pageCount });
      return { outputs: [outputItem], failures: [] };
    }

    async #buildRaster(PDFLib, rendered, quality) {
      const document = await PDFLib.PDFDocument.create();
      for (const item of rendered) {
        const blob = await ConverterUtils.encodeCanvas(item.canvas, 'image/jpeg', quality);
        const image = await document.embedJpg(new Uint8Array(await blob.arrayBuffer()));
        const page = document.addPage([item.width, item.height]);
        page.drawImage(image, { x: 0, y: 0, width: item.width, height: item.height });
      }
      return this.#engine.save(document);
    }
  }

  NS.PdfCompressConverter = PdfCompressConverter;
})(typeof window !== 'undefined' ? window : globalThis);
