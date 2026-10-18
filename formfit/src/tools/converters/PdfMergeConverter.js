(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, PdfEngine, PerfTimer, Logger } = NS;

  class PdfMergeConverter extends Converter {
    #engine = new PdfEngine();
    #log = Logger.for('PdfMergeConverter');

    constructor() {
      super({
        id: 'pdf-merge', title: 'Merge PDFs', group: 'PDF',
        description: 'Join multiple PDF documents in the selected order.',
        accepts: 'application/pdf,.pdf', multiple: true, minFiles: 2, maxFiles: 30,
        defaults: { name: 'merged.pdf' },
        optionsSchema: [{ id: 'name', label: 'Output filename', type: 'text' }],
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const timer = new PerfTimer('pdf-merge');
      const PDFLib = await this.#engine.pdfLib();
      const merged = await PDFLib.PDFDocument.create();
      for (let i = 0; i < entries.length; i++) {
        ConverterUtils.assertNotAborted(context.signal);
        const file = entries[i].file;
        context.onProgress(i / entries.length * 90, `Merging document ${i + 1} of ${entries.length}…`);
        const source = await this.#engine.loadForEdit(await file.arrayBuffer(), file.name);
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const page of pages) merged.addPage(page);
      }
      const bytes = await this.#engine.save(merged);
      const blob = new Blob([bytes], { type: 'application/pdf' });
      const name = `${ConverterUtils.safeBaseName(options.name || 'merged.pdf')}.pdf`;
      this.#log.info('PDF merge finished', { durationMs: Math.round(timer.finish()), pages: merged.getPageCount(), bytes: blob.size });
      return { outputs: [ConverterUtils.output(name, blob)], failures: [] };
    }
  }

  NS.PdfMergeConverter = PdfMergeConverter;
})(typeof window !== 'undefined' ? window : globalThis);
