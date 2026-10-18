(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ImageStage, InkExtractor, Logger } = NS;

  class SignatureCleanupStage extends ImageStage {
    #extractor = new InkExtractor();
    #log = Logger.for('SignatureCleanupStage');

    constructor() {
      super('signature-cleanup', 'signature cleanup');
    }

    isEnabled(options) {
      return Boolean(options && options.kind === 'signature' && options.cleanup.enabled);
    }

    apply(canvas, options, context = {}) {
      const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
      const result = this.#extractor.extract(image, { ...options.cleanup, aspectRatio: context.aspectRatio });
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      output.getContext('2d').putImageData(new ImageData(result.imageData.data, output.width, output.height), 0, 0);
      if (result.reason && typeof context.onQuality === 'function') context.onQuality(result.reason);
      this.#log.info('Signature cleanup complete', { quality: result.quality, inkRatio: result.inkRatio });
      return output;
    }
  }

  NS.SignatureCleanupStage = SignatureCleanupStage;
})(typeof window !== 'undefined' ? window : globalThis);
