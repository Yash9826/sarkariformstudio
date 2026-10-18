(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, DependencyLoader, ImageLoader, PdfBuilder, PerfTimer, Logger } = NS;
  const { ConversionError } = NS;
  class ImagesToPdfConverter extends Converter {
    #dependencies = new DependencyLoader();
    #loader = new ImageLoader();
    #log = Logger.for('ImagesToPdfConverter');

    constructor() {
      super({
        id: 'images-to-pdf', title: 'Images to PDF', group: 'PDF',
        description: 'Turn a reordered set of photos into a paged PDF.',
        accepts: '.jpg,.jpeg,.png,.webp,.bmp,.gif,image/jpeg,image/png,image/webp,image/bmp,image/gif', multiple: true, maxFiles: 60,
        optionsSchema: [
          { id: 'pageSize', label: 'Page size', type: 'select', values: ['A4', 'Letter', 'Fit to image'] },
          { id: 'orientation', label: 'Orientation', type: 'select', values: ['Auto', 'Portrait', 'Landscape'] },
          { id: 'margin', label: 'Margin', type: 'select', values: ['None', 'Small 10 mm', 'Normal 20 mm'] },
          { id: 'sizeTarget', label: 'Maximum PDF size (KB, optional)', type: 'number', min: 1 },
          { id: 'name', label: 'PDF filename', type: 'text' },
        ],
        defaults: { pageSize: 'A4', orientation: 'Auto', margin: 'Normal', sizeTarget: '', name: 'images.pdf' },
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const timer = new PerfTimer('images-to-pdf');
      const PDFLib = await this.#dependencies.load('pdf-lib');
      const settings = { pageSize: options.pageSize, orientation: options.orientation, margin: options.margin };
      let bytes;
      if (!options.sizeTarget) {
        const images = [];
        for (let i = 0; i < entries.length; i++) {
          ConverterUtils.assertNotAborted(context.signal);
          context.onProgress(i / entries.length * 80, `Preparing image ${i + 1} of ${entries.length}…`);
          images.push(await this.#prepare(entries[i], null, 0.9));
        }
        bytes = await PdfBuilder.fromImages(images, settings, PDFLib);
      } else {
        const target = NS.ByteSize.parse(`${options.sizeTarget} KB`);
        bytes = await PdfBuilder.fromImagesToTarget(entries, settings, PDFLib, target,
          (entry, maxEdge, quality) => this.#prepare(entry, maxEdge, quality), context,
          (percent, message) => context.onProgress(percent, message));
      }
      const filename = ConverterUtils.safeBaseName(options.name || 'images.pdf') + '.pdf';
      const blob = new Blob([bytes], { type: 'application/pdf' });
      this.#log.info('Images-to-PDF finished', { durationMs: Math.round(timer.finish()), pages: entries.length, bytes: blob.size });
      context.onProgress(100, 'PDF created');
      return { outputs: [ConverterUtils.output(filename, blob)], failures: [] };
    }

    async #prepare(entry, maxEdge, quality) {
      const file = entry.file;
      const rotation = ((Number(entry.rotation) || 0) % 360 + 360) % 360;
      if (!maxEdge && !rotation && ['image/jpeg', 'image/png'].includes(file.type)) {
        return { bytes: new Uint8Array(await file.arrayBuffer()), mime: file.type };
      }
      const decoded = await this.#loader.load(file);
      const swapped = rotation === 90 || rotation === 270;
      const width = swapped ? decoded.height : decoded.width;
      const height = swapped ? decoded.width : decoded.height;
      const scale = maxEdge ? Math.min(1, maxEdge / Math.max(width, height)) : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = 'high';
      if (rotation) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(decoded.source, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
      } else ctx.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      if (decoded.source && typeof decoded.source.close === 'function') decoded.source.close();
      const mime = !maxEdge && file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const blob = await ConverterUtils.encodeCanvas(canvas, mime, quality);
      canvas.width = 0;
      canvas.height = 0;
      return { bytes: new Uint8Array(await blob.arrayBuffer()), mime };
    }
  }

  NS.ImagesToPdfConverter = ImagesToPdfConverter;
})(typeof window !== 'undefined' ? window : globalThis);
