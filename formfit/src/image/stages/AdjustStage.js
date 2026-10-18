(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ImageStage, LevelsAdjuster, Logger } = NS;

  class AdjustStage extends ImageStage {
    #adjuster = new LevelsAdjuster();
    #log = Logger.for('AdjustStage');

    constructor() {
      super('adjust', 'Image adjustments');
    }

    isEnabled(options) {
      return Boolean(options && (options.brightness || options.contrast || options.autoLevels));
    }

    apply(canvas, options) {
      const context = canvas.getContext('2d', { willReadFrequently: true });
      const source = context.getImageData(0, 0, canvas.width, canvas.height);
      const adjusted = this.#adjuster.apply(source, options);
      const output = document.createElement('canvas');
      output.width = canvas.width;
      output.height = canvas.height;
      output.getContext('2d').putImageData(new ImageData(adjusted.data, adjusted.width, adjusted.height), 0, 0);
      this.#log.debug('Applied image adjustments', { brightness: options.brightness, contrast: options.contrast, autoLevels: options.autoLevels });
      return output;
    }
  }

  NS.AdjustStage = AdjustStage;
})(typeof window !== 'undefined' ? window : globalThis);
