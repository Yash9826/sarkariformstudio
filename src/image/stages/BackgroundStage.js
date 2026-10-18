(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ImageStage, BackgroundMasker, Logger, PerfTimer } = NS;

  class BackgroundStage extends ImageStage {
    #masker = new BackgroundMasker();
    #log = Logger.for('BackgroundStage');

    constructor() {
      super('background', 'background replacement');
    }

    isEnabled(options) {
      return Boolean(options && options.kind === 'photo' && options.background.enabled);
    }

    async apply(canvas, options, context = {}) {
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
      const pixelScale = Math.min(1, 1000 / Math.max(canvas.width, canvas.height));
      let sample = canvas;
      if (pixelScale < 1) {
        sample = document.createElement('canvas');
        sample.width = Math.max(1, Math.round(canvas.width * pixelScale));
        sample.height = Math.max(1, Math.round(canvas.height * pixelScale));
        const sampleContext = sample.getContext('2d');
        sampleContext.imageSmoothingQuality = 'high';
        sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
      }
      const image = sample.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, sample.width, sample.height);
      let maskInfo = context.backgroundMask || null;
      if (!maskInfo) {
        const timer = new PerfTimer('background-mask');
        maskInfo = this.#masker.computeMask(image, options.background);
        const durationMs = Math.round(timer.finish());
        if (durationMs > 2000) this.#log.warn('Background processing exceeded 2 seconds', { durationMs });
        if (typeof context.onBackgroundMask === 'function') context.onBackgroundMask(maskInfo);
      }
      if (maskInfo.reason && typeof context.onQuality === 'function') context.onQuality(maskInfo.reason);
      const composite = this.#masker.composite(image, maskInfo, options.background.color);
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      const outputContext = output.getContext('2d');
      if (sample === canvas) {
        outputContext.putImageData(new ImageData(composite.data, composite.width, composite.height), 0, 0);
      } else {
        const processed = document.createElement('canvas');
        processed.width = composite.width;
        processed.height = composite.height;
        processed.getContext('2d').putImageData(new ImageData(composite.data, composite.width, composite.height), 0, 0);
        outputContext.imageSmoothingQuality = 'high';
        outputContext.drawImage(processed, 0, 0, output.width, output.height);
        processed.width = 0;
        processed.height = 0;
        sample.width = 0;
        sample.height = 0;
      }
      this.#log.info('Background replacement complete', { quality: maskInfo.quality, removedRatio: maskInfo.removedRatio });
      return output;
    }
  }

  NS.BackgroundStage = BackgroundStage;
})(typeof window !== 'undefined' ? window : globalThis);
