(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, ImageLoader, ImageCompressor, Logger, PerfTimer } = NS;
  const FORMATS = Object.freeze({ JPG: 'image/jpeg', PNG: 'image/png', WebP: 'image/webp' });

  class ImageFormatConverter extends Converter {
    #loader = new ImageLoader();
    #compressor = new ImageCompressor();
    #log = Logger.for('ImageFormatConverter');

    constructor() {
      super({
        id: 'image-format', title: 'Convert image format', group: 'Images',
        description: 'Convert and resize JPG, PNG, WebP, BMP or GIF images.',
        accepts: '.jpg,.jpeg,.png,.webp,.bmp,.gif,image/jpeg,image/png,image/webp,image/bmp,image/gif', multiple: true, maxFiles: 50,
        optionsSchema: [
          { id: 'format', label: 'Output format', type: 'select', values: ['JPG', 'PNG', 'WebP'] },
          { id: 'quality', label: 'Quality (%)', type: 'number', min: 1, max: 100 },
          { id: 'sizeTarget', label: 'Maximum size (KB, optional)', type: 'number', min: 1 },
          { id: 'maxWidth', label: 'Maximum width (px, optional)', type: 'number', min: 1 },
          { id: 'maxHeight', label: 'Maximum height (px, optional)', type: 'number', min: 1 },
          { id: 'background', label: 'JPEG background', type: 'color' },
        ],
        defaults: { format: 'JPG', quality: 90, sizeTarget: '', maxWidth: '', maxHeight: '', background: '#ffffff' },
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const timer = new PerfTimer('convert-image-format');
      const outputs = [];
      const failures = [];
      const used = new Set();
      this.#log.info('Image conversion started', { count: entries.length, format: options.format });
      for (let index = 0; index < entries.length; index++) {
        ConverterUtils.assertNotAborted(context.signal);
        const file = entries[index].file;
        let decoded;
        let canvas;
        try {
          context.onProgress(index / entries.length * 100, `Converting image ${index + 1} of ${entries.length}…`);
          decoded = await this.#loader.load(file);
          canvas = this.#draw(decoded.source, decoded.width, decoded.height, entries[index].rotation || 0, options);
          const mime = FORMATS[options.format];
          const blob = options.sizeTarget
            ? (await this.#compressor.compress(canvas, {
              mime,
              maxBytes: NS.ByteSize.parse(`${options.sizeTarget} KB`),
              minBytes: 0,
              allowDownscale: false,
            })).blob
            : await ConverterUtils.encodeCanvas(canvas, mime, Number(options.quality) / 100);
          const extension = options.format === 'JPG' ? 'jpg' : options.format.toLowerCase();
          const name = ConverterUtils.uniqueName(`${ConverterUtils.safeBaseName(file.name)}.${extension}`, used);
          outputs.push(ConverterUtils.output(name, blob));
          this.#log.debug('Converted image', { index, extension, bytes: file.size, outputBytes: blob.size });
        } catch (error) {
          failures.push({ name: file.name, reason: error.userMessage || error.message });
          this.#log.warn('Image conversion failed', { index, extension: file.name.split('.').pop(), error });
        } finally {
          if (decoded && decoded.source && typeof decoded.source.close === 'function') decoded.source.close();
          if (canvas) { canvas.width = 0; canvas.height = 0; }
        }
      }
      this.#log.info('Image conversion finished', { durationMs: Math.round(timer.finish()), outputs: outputs.length, failures: failures.length });
      context.onProgress(100, 'Conversion complete');
      return { outputs, failures };
    }

    #draw(source, width, height, rotation, options) {
      const rotated = Math.abs(rotation) % 180 === 90;
      const imageWidth = rotated ? height : width;
      const imageHeight = rotated ? width : height;
      const maxWidth = Number(options.maxWidth) > 0 ? Number(options.maxWidth) : imageWidth;
      const maxHeight = Number(options.maxHeight) > 0 ? Number(options.maxHeight) : imageHeight;
      const scale = Math.min(1, maxWidth / imageWidth, maxHeight / imageHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(imageWidth * scale));
      canvas.height = Math.max(1, Math.round(imageHeight * scale));
      const ctx = canvas.getContext('2d');
      if (options.format === 'JPG') {
        ctx.fillStyle = options.background || '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.imageSmoothingQuality = 'high';
      if (rotated) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rotation * Math.PI / 180);
        ctx.drawImage(source, -canvas.height / 2, -canvas.width / 2, canvas.height, canvas.width);
      } else {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      }
      return canvas;
    }
  }

  NS.ImageFormatConverter = ImageFormatConverter;
})(typeof window !== 'undefined' ? window : globalThis);
