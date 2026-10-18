(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h } = NS.dom;

  class PreviewRenderer {
    #root;
    #canvas;
    #before;
    #compare;
    #processor = new NS.ImageProcessor();
    #pipeline;
    #timer = null;
    #generation = 0;
    #onError;
    #masker = new NS.BackgroundMasker();
    #maskInfo = null;
    #automaticMask = null;
    #maskKey = null;
    #manualMask = false;
    #editGeneration = 0;
    #onBackgroundMask;
    #brushMode = null;
    #brushSize = 24;
    #strokeActive = false;
    #undo = [];
    #state = null;

    constructor({ root, pipeline, onError = () => {}, onBackgroundMask = () => {} }) {
      this.#root = root;
      this.#pipeline = pipeline;
      this.#onError = onError;
      this.#onBackgroundMask = onBackgroundMask;
      this.#canvas = h('canvas', { class: 'preview-renderer-canvas', 'aria-label': 'Enhanced crop preview' });
      this.#canvas.hidden = true;
      this.#before = h('canvas', { class: 'preview-renderer-before', 'aria-hidden': 'true' });
      this.#compare = h('button', { type: 'button', class: 'btn btn-ghost compare-button', 'aria-label': 'Hold to compare with original' }, 'Hold to compare');
      this.#compare.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.#showBefore(true);
      });
      for (const type of ['pointerup', 'pointercancel', 'pointerleave', 'blur']) {
        this.#compare.addEventListener(type, () => this.#showBefore(false));
      }
      this.#canvas.addEventListener('pointerdown', (event) => this.#startBrush(event));
      this.#canvas.addEventListener('pointermove', (event) => this.#continueBrush(event));
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        this.#canvas.addEventListener(type, () => { this.#strokeActive = false; });
      }
      this.#root.replaceChildren(
        h('div', { class: 'preview-renderer' },
          h('p', { class: 'preview-renderer-title' }, 'Live preview'),
          this.#canvas,
          this.#compare,
          h('p', { class: 'muted small' }, 'Preview is a guide; final export uses the exact required dimensions.')
        )
      );
    }

    update({ source, crop, rule, options, maskKey = null }) {
      const key = maskKey || `${crop.x}:${crop.y}:${crop.w}:${crop.h}`;
      if (this.#maskKey !== key || !this.#state ||
          this.#state.options.background.tolerance !== options.background.tolerance ||
          this.#state.options.background.feather !== options.background.feather) {
        this.#maskInfo = null;
        this.#automaticMask = null;
        this.#manualMask = false;
        this.#undo = [];
      }
      this.#maskKey = key;
      this.#state = { source, crop, rule, options, maskKey: key };
      this.#editGeneration++;
      const generation = ++this.#generation;
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => this.#render({ ...this.#state, generation }), 120);
    }

    setBrush(mode, size) {
      this.#brushMode = mode;
      this.#brushSize = size;
      this.#canvas.style.cursor = mode ? 'crosshair' : '';
    }

    undoMask() {
      if (!this.#maskInfo || !this.#undo.length) return;
      const snapshot = this.#undo.pop();
      this.#maskInfo.mask = Float32Array.from(snapshot, (value) => value / 255);
      this.#manualMask = this.#undo.length > 0;
      this.#emitMask();
      this.#renderEdited();
    }

    resetMask() {
      if (!this.#automaticMask || !this.#maskInfo) return;
      this.#maskInfo.mask = this.#automaticMask.slice();
      this.#manualMask = false;
      this.#undo = [];
      this.#emitMask();
      this.#renderEdited();
    }

    destroy() {
      clearTimeout(this.#timer);
      this.#generation++;
      this.#root.replaceChildren();
    }

    clear() {
      clearTimeout(this.#timer);
      this.#generation++;
      this.#canvas.width = 0;
      this.#canvas.height = 0;
      this.#before.width = 0;
      this.#before.height = 0;
      this.#canvas.hidden = true;
      this.#before.hidden = true;
      this.#maskInfo = null;
      this.#automaticMask = null;
      this.#undo = [];
      this.#manualMask = false;
      this.#state = null;
    }

    async #render({ source, crop, rule, options, generation }) {
      let before;
      let after;
      try {
        const scale = Math.min(1, 360 / Math.max(crop.w, crop.h));
        before = this.#processor.renderCrop(source, crop, Math.max(1, Math.round(crop.w * scale)), Math.max(1, Math.round(crop.h * scale)), rule ? rule.background : '#ffffff');
        this.#copyCanvas(before, this.#before);
        const context = this.#pipelineContext(options, rule);
        after = await this.#pipeline.run(before, context);
        if (generation !== this.#generation) return;
        this.#copyCanvas(after, this.#canvas);
        this.#canvas.hidden = false;
      } catch (error) {
        if (generation === this.#generation) this.#onError(error);
      } finally {
        if (before) { before.width = 0; before.height = 0; }
        if (after && after !== before) { after.width = 0; after.height = 0; }
      }
    }

    #pipelineContext(options, rule, maskKey = this.#maskKey) {
      return {
        options,
        rule,
        aspectRatio: rule && typeof rule.effectiveAspect === 'function' && options.stamp.enabled
          ? rule.effectiveAspect(options.stamp.heightRatio)
          : rule ? rule.aspectRatio : null,
        backgroundMask: this.#maskInfo,
        onBackgroundMask: (maskInfo) => {
          if (!this.#state || this.#state.maskKey !== maskKey) return;
          this.#maskInfo = maskInfo;
          this.#automaticMask = maskInfo.mask.slice();
          this.#manualMask = false;
          this.#emitMask();
        },
      };
    }

      #startBrush(event) {
        if (!this.#brushMode || !this.#maskInfo || !this.#state || !this.#state.options.background.enabled) return;
        event.preventDefault();
        this.#strokeActive = true;
        this.#canvas.setPointerCapture(event.pointerId);
        this.#undo.push(Uint8Array.from(this.#maskInfo.mask, (value) => Math.round(value * 255)));
        if (this.#undo.length > 10) this.#undo.shift();
        this.#paint(event);
      }

      #continueBrush(event) {
        if (!this.#strokeActive) return;
        this.#paint(event);
      }

      #paint(event) {
        const rect = this.#canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const pictureRatio = this.#state.options.stamp.enabled ? 1 - this.#state.options.stamp.heightRatio : 1;
        const imageY = (event.clientY - rect.top) / rect.height;
        if (imageY >= pictureRatio) return;
        const x = (event.clientX - rect.left) / rect.width * this.#maskInfo.width;
        const y = imageY / pictureRatio * this.#maskInfo.height;
        const radius = this.#brushSize * this.#maskInfo.width / this.#canvas.width;
        this.#masker.paintMask(this.#maskInfo.mask, this.#maskInfo.width, this.#maskInfo.height, x, y, radius, this.#brushMode === 'remove');
        this.#manualMask = true;
        this.#emitMask();
        this.#renderEdited();
      }

      #emitMask() {
        this.#onBackgroundMask(this.#maskInfo, this.#maskKey, this.#manualMask);
      }

      async #renderEdited() {
        if (!this.#state || !this.#before.width) return;
        let source;
        let after;
        try {
          const { options, rule } = this.#state;
          source = document.createElement('canvas');
          source.width = this.#before.width;
          source.height = this.#before.height;
          source.getContext('2d').drawImage(this.#before, 0, 0);
          const generation = ++this.#editGeneration;
          after = await this.#pipeline.run(source, this.#pipelineContext(options, rule, this.#state.maskKey));
          if (generation !== this.#editGeneration) return;
          this.#copyCanvas(after, this.#canvas);
          this.#canvas.hidden = false;
        } catch (error) {
          this.#onError(error);
        } finally {
          if (source) { source.width = 0; source.height = 0; }
          if (after && after !== source) { after.width = 0; after.height = 0; }
        }
    }

    #copyCanvas(source, target) {
      target.width = source.width;
      target.height = source.height;
      const context = target.getContext('2d');
      context.clearRect(0, 0, target.width, target.height);
      context.drawImage(source, 0, 0);
    }

    #showBefore(show) {
      if (!this.#canvas.width) return;
      this.#canvas.hidden = show;
      if (show) {
        this.#before.hidden = false;
        this.#canvas.parentElement.insertBefore(this.#before, this.#compare);
      } else {
        this.#before.hidden = true;
        this.#canvas.hidden = false;
      }
    }
  }

  NS.PreviewRenderer = PreviewRenderer;
})(typeof window !== 'undefined' ? window : globalThis);
