(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { Converter, ConverterUtils, DependencyLoader, ImageCompressor, Logger, PerfTimer } = NS;

  class HeicToJpgConverter extends Converter {
    #dependencies = new DependencyLoader();
    #compressor = new ImageCompressor();
    #log = Logger.for('HeicToJpgConverter');

    constructor() {
      super({
        id: 'heic-to-jpg', title: 'HEIC to JPG', group: 'Images',
        description: 'Convert iPhone HEIC and HEIF photos to JPEG.',
        accepts: '.heic,.heif,image/heic,image/heif', multiple: true, maxFiles: 50,
        optionsSchema: [
          { id: 'quality', label: 'Quality (%)', type: 'number', min: 1, max: 100 },
          { id: 'sizeTarget', label: 'Maximum size (KB, optional)', type: 'number', min: 1 },
        ],
        defaults: { quality: 90, sizeTarget: '' },
      });
    }

    async convert(entries, options, context) {
      this.validateInputs(entries);
      const heic2any = await this.#dependencies.load('heic2any');
      const timer = new PerfTimer('convert-heic');
      const outputs = [];
      const failures = [];
      const used = new Set();
      this.#log.info('HEIC conversion started', { count: entries.length });
      for (let index = 0; index < entries.length; index++) {
        ConverterUtils.assertNotAborted(context.signal);
        const file = entries[index].file;
        try {
          context.onProgress(index / entries.length * 100, `Converting HEIC ${index + 1} of ${entries.length}…`);
          const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: Number(options.quality) / 100 });
          const blob = Array.isArray(converted) ? converted[0] : converted;
          let result = blob;
          if (options.sizeTarget) {
            const image = await createImageBitmap(blob);
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            canvas.getContext('2d').drawImage(image, 0, 0);
            image.close();
            result = (await this.#compressor.compress(canvas, {
              mime: 'image/jpeg',
              minBytes: 0,
              maxBytes: NS.ByteSize.parse(`${options.sizeTarget} KB`),
              allowDownscale: true,
            })).blob;
            canvas.width = 0;
            canvas.height = 0;
          }
          outputs.push(ConverterUtils.output(
            ConverterUtils.uniqueName(`${ConverterUtils.safeBaseName(file.name)}.jpg`, used),
            result
          ));
        } catch (error) {
          failures.push({
            name: file.name,
            reason: 'Could not be converted. Try opening it and saving it as JPG.',
            code: 'HEIC_DECODE_FAILED',
          });
          this.#log.warn('HEIC conversion failed', { index, extension: file.name.split('.').pop() });
        }
      }
      this.#log.info('HEIC conversion finished', { durationMs: Math.round(timer.finish()), outputs: outputs.length, failures: failures.length });
      context.onProgress(100, 'Conversion complete');
      return { outputs, failures };
    }
  }

  NS.HeicToJpgConverter = HeicToJpgConverter;
})(typeof window !== 'undefined' ? window : globalThis);
