(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class ImageStage {
    constructor(id, label) {
      if (new.target === ImageStage) throw new TypeError('ImageStage is abstract');
      this.id = id;
      this.label = label;
    }

    isEnabled() {
      return false;
    }

    apply() {
      throw new TypeError(`${this.constructor.name}.apply must be implemented`);
    }
  }

  NS.ImageStage = ImageStage;
})(typeof window !== 'undefined' ? window : globalThis);
