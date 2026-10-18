(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, PdfEngine, Logger } = NS;

  class PdfSplitConverter extends Converter {
    #engine = new PdfEngine();
    #log = Logger.for('PdfSplitConverter');

    constructor() {
      super({
        id: 'pdf-split', title: 'Split / extract pages', group: 'PDF',
        description: 'Extract selected pages or split a document into smaller PDFs.',
        accepts: 'application/pdf,.pdf',
        defaults: { mode: 'extract', pages: '', everyN: 2 },
        optionsSchema: [
          { id: 'mode', label: 'Mode', type: 'select', values: ['Extract pages', 'Split into single pages', 'Split every N pages'] },
          { id: 'pages', label: 'Pages (for extract)', type: 'text' },
          { id: 'everyN', label: 'Pages per part', type: 'number', min: 1 },
        ],
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const entry = entries[0];
      const source = await this.#engine.loadForEdit(await entry.file.arrayBuffer(), entry.file.name);
      const pageCount = source.getPageCount();
      let groups;
      if (options.mode === 'Extract pages') {
        groups = [NS.PageRangeParser.parse(options.pages, pageCount)];
      } else {
        const groupSize = options.mode === 'Split into single pages' ? 1 : Math.max(1, Number(options.everyN) || 1);
        groups = [];
        for (let i = 0; i < pageCount; i += groupSize) groups.push(Array.from({ length: Math.min(groupSize, pageCount - i) }, (_, j) => i + j));
      }
      const PDFLib = await this.#engine.pdfLib();
      const outputs = [];
      for (let i = 0; i < groups.length; i++) {
        ConverterUtils.assertNotAborted(context.signal);
        const document = await PDFLib.PDFDocument.create();
        for (const page of await document.copyPages(source, groups[i])) document.addPage(page);
        const bytes = await this.#engine.save(document);
        const suffix = groups.length > 1 ? `-${String(i + 1).padStart(3, '0')}` : '';
        outputs.push(ConverterUtils.output(
          `${ConverterUtils.safeBaseName(entry.file.name)}${suffix}.pdf`,
          new Blob([bytes], { type: 'application/pdf' })
        ));
        context.onProgress((i + 1) / groups.length * 100, `Creating part ${i + 1} of ${groups.length}…`);
      }
      this.#log.info('PDF split finished', { pages: pageCount, outputs: outputs.length });
      return { outputs, failures: [] };
    }
  }

  NS.PdfSplitConverter = PdfSplitConverter;
})(typeof window !== 'undefined' ? window : globalThis);
