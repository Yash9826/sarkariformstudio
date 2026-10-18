(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, DependencyLoader, ImageLoader, PdfBuilder, PerfTimer, Logger } = NS;
  const { ConversionError } = NS;
  const { h } = NS.dom;

  class ScanToPdfConverter extends Converter {
    #dependencies = new DependencyLoader();
    #loader = new ImageLoader();
    #levels = new NS.LevelsAdjuster();
    #ink = new NS.InkExtractor();
    #log = Logger.for('ScanToPdfConverter');

    constructor() {
      super({
        id: 'scan-to-pdf', title: 'Scan to PDF', group: 'PDF',
        description: 'Clean up certificate photos and combine them into a compact PDF.',
        accepts: '.jpg,.jpeg,.png,.webp,.bmp,.gif,image/jpeg,image/png,image/webp,image/bmp,image/gif',
        multiple: true, maxFiles: 30,
        defaults: { look: 'Clean colour', straighten: 0, pageSize: 'A4', margin: 'Normal', sizeTarget: 300, autoEnhance: true },
        optionsSchema: [
          { id: 'look', label: 'Look', type: 'select', values: ['Original', 'Clean colour', 'Grayscale', 'Black & white document'] },
          { id: 'straighten', label: 'Straighten all pages (degrees)', type: 'range', min: -15, max: 15, step: 0.1 },
          { id: 'pageSize', label: 'Page size', type: 'select', values: ['A4', 'Fit to image'] },
          { id: 'margin', label: 'Margin', type: 'select', values: ['None', 'Small 10 mm', 'Normal 20 mm'] },
          { id: 'sizeTarget', label: 'Maximum PDF size (KB)', type: 'number', min: 1 },
          { id: 'autoEnhance', label: 'Auto-enhance contrast', type: 'checkbox' },
        ],
      });
      this.refreshInputViewOnChange = true;
    }

    async createInputView(entries, { options }) {
      const status = h('p', { class: 'muted small', role: 'status' }, 'Preparing first-page preview…');
      const image = h('img', { class: 'scan-preview', alt: 'Preview of the processed first scan page' });
      const element = h('section', { class: 'scan-preview-panel', 'aria-label': 'Processed scan preview' },
        h('h4', null, 'First page preview'), status, image);
      const settings = { ...this.defaults, ...options };
      const prepared = await this.#prepare(entries[0], 900, 0.85, settings, {});
      const url = URL.createObjectURL(new Blob([prepared.bytes], { type: 'image/jpeg' }));
      image.src = url;
      status.textContent = `${settings.look} preview. The full PDF is built when you press Convert.`;
      return { element, dispose: () => URL.revokeObjectURL(url) };
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const timer = new PerfTimer('scan-to-pdf');
      this.#log.info('Scan-to-PDF started', { pages: entries.length, look: options.look });
      const PDFLib = await this.#dependencies.load('pdf-lib');
      const settings = { pageSize: options.pageSize, orientation: 'Auto', margin: options.margin };
      const target = NS.ByteSize.parse(`${options.sizeTarget} KB`);
      const bytes = await PdfBuilder.fromImagesToTarget(entries, settings, PDFLib, target,
        (entry, maxEdge, quality) => this.#prepare(entry, maxEdge, quality, options, context),
        context,
        (percent, message) => context.onProgress(percent, message));
      const blob = new Blob([bytes], { type: 'application/pdf' });
      this.#log.info('Scan-to-PDF finished', { durationMs: Math.round(timer.finish()), pages: entries.length, outputBytes: blob.size });
      context.onProgress(100, 'PDF created');
      return { outputs: [ConverterUtils.output('scan.pdf', blob)], failures: [] };
    }

    async #prepare(entry, maxEdge, quality, options, context) {
      ConverterUtils.assertNotAborted(context.signal);
      const decoded = await this.#loader.load(entry.file);
      let canvas;
      try {
        const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
        const width = Math.max(1, Math.round(decoded.width * scale));
        const height = Math.max(1, Math.round(decoded.height * scale));
        const angle = (((Number(entry.rotation) || 0) + Number(options.straighten || 0)) % 360) * Math.PI / 180;
        const outWidth = Math.max(1, Math.ceil(Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle))));
        const outHeight = Math.max(1, Math.ceil(Math.abs(height * Math.cos(angle)) + Math.abs(width * Math.sin(angle))));
        const rungScale = maxEdge ? Math.min(1, maxEdge / Math.max(outWidth, outHeight)) : 1;
        canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(outWidth * rungScale));
        canvas.height = Math.max(1, Math.round(outHeight * rungScale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingQuality = 'high';
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(angle);
        ctx.drawImage(decoded.source, -width * rungScale / 2, -height * rungScale / 2, width * rungScale, height * rungScale);

        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (options.look === 'Black & white document') {
          const extracted = this.#ink.extract(image, { strength: 58, removeSpecks: true, autoTrim: false });
          image.data.set(extracted.imageData.data);
        } else {
          if (options.look === 'Clean colour') this.#flattenLighting(image);
          if (options.look === 'Grayscale') {
            for (let i = 0; i < image.data.length; i += 4) {
              const gray = Math.round(image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114);
              image.data[i] = gray; image.data[i + 1] = gray; image.data[i + 2] = gray;
            }
          }
          if (options.autoEnhance) {
            const adjusted = this.#levels.apply(image, { autoLevels: true });
            image.data.set(adjusted.data);
          }
        }
        ctx.putImageData(image, 0, 0);
        const blob = await ConverterUtils.encodeCanvas(canvas, 'image/jpeg', quality);
        return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: 'image/jpeg' };
      } catch (error) {
        if (error instanceof RangeError) {
          throw new ConversionError('Not enough memory to process the selected scan', {
            code: 'OUT_OF_MEMORY',
            userMessage: 'Your device ran out of memory. Close other tabs or use fewer or smaller files.',
          });
        }
        throw error;
      } finally {
        if (decoded.source && typeof decoded.source.close === 'function') decoded.source.close();
        if (canvas) { canvas.width = 0; canvas.height = 0; }
      }
    }

    #flattenLighting(image) {
      const { data, width, height } = image;
      const length = width * height;
      const radius = Math.min(60, Math.max(1, Math.round(Math.max(width, height) * 0.06)));
      for (let channel = 0; channel < 3; channel++) {
        const values = new Float32Array(length);
        for (let i = 0; i < length; i++) values[i] = data[i * 4 + channel];
        const illumination = NS.BoxBlur.blur(values, width, height, radius);
        for (let i = 0; i < length; i++) {
          data[i * 4 + channel] = Math.max(0, Math.min(255, Math.round(values[i] * 128 / Math.max(20, illumination[i]))));
        }
      }
    }
  }

  NS.ScanToPdfConverter = ScanToPdfConverter;
})(typeof window !== 'undefined' ? window : globalThis);
