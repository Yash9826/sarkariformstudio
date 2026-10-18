/**
 * CropSession: pure geometry for a crop rectangle over an image.
 * No DOM here, so it is fully unit-testable. All values are in IMAGE pixels.
 *
 * With an aspect ratio the crop keeps that ratio at all times; without one the
 * rectangle is free-form.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  class CropSession {
    static MIN_SIZE = 24;
    static MAX_ZOOM = 8;
    static HANDLES = Object.freeze(['nw', 'ne', 'sw', 'se']);

    #imgW;
    #imgH;
    #aspect;
    #crop;

    constructor(imageWidth, imageHeight, aspect = null) {
      if (!(imageWidth > 0) || !(imageHeight > 0)) {
        throw new ValidationError(`Invalid image size ${imageWidth}×${imageHeight}`);
      }
      this.#imgW = imageWidth;
      this.#imgH = imageHeight;
      this.#aspect = aspect > 0 ? aspect : null;
      this.reset();
    }

    get imageWidth() {
      return this.#imgW;
    }
    get imageHeight() {
      return this.#imgH;
    }
    get aspect() {
      return this.#aspect;
    }
    get crop() {
      return { ...this.#crop };
    }

    /** Largest crop that fits inside the image at the current aspect ratio. */
    get maxSize() {
      if (!this.#aspect) return { w: this.#imgW, h: this.#imgH };
      const w = Math.min(this.#imgW, this.#imgH * this.#aspect);
      return { w, h: w / this.#aspect };
    }

    get zoom() {
      return this.maxSize.w / this.#crop.w;
    }

    setAspect(aspect) {
      this.#aspect = aspect > 0 ? aspect : null;
      this.reset();
    }

    /** Set a crop rectangle, clamping it to the image and preserving the active aspect ratio. */
    setCrop(rect) {
      if (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || !(rect.w > 0) || !(rect.h > 0)) {
        throw new ValidationError('Crop rectangle must have finite coordinates and positive dimensions', {
          userMessage: 'The selected crop area is invalid.',
        });
      }
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      let w = rect.w;
      let h = rect.h;
      if (this.#aspect) {
        if (w / h > this.#aspect) w = h * this.#aspect;
        else h = w / this.#aspect;
      }
      const max = this.maxSize;
      const factor = Math.min(1, max.w / w, max.h / h);
      w *= factor;
      h *= factor;
      if (this.#aspect) {
        const minW = Math.min(CropSession.MIN_SIZE, max.w);
        const minH = Math.min(CropSession.MIN_SIZE, max.h);
        if (w < minW || h < minH) {
          const minFactor = Math.max(minW / w, minH / h);
          const requiredW = w * minFactor;
          const requiredH = h * minFactor;
          if (requiredW <= max.w && requiredH <= max.h) {
            w = requiredW;
            h = requiredH;
          }
        }
      } else {
        w = Math.max(Math.min(w, this.#imgW), Math.min(CropSession.MIN_SIZE, this.#imgW));
        h = Math.max(Math.min(h, this.#imgH), Math.min(CropSession.MIN_SIZE, this.#imgH));
      }
      this.#crop = { x: cx - w / 2, y: cy - h / 2, w, h };
      this.#keepInside();
    }

    /** Centered crop: biggest possible with an aspect ratio, 80% of the image when free. */
    reset() {
      let w;
      let h;
      if (this.#aspect) {
        ({ w, h } = this.maxSize);
      } else {
        w = this.#imgW * 0.8;
        h = this.#imgH * 0.8;
      }
      this.#crop = { x: (this.#imgW - w) / 2, y: (this.#imgH - h) / 2, w, h };
    }

    /** Zoom in (z > 1) shrinks the crop around its centre. */
    setZoom(z) {
      const zoom = clamp(Number(z) || 1, 1, CropSession.MAX_ZOOM);
      const max = this.maxSize;
      const cx = this.#crop.x + this.#crop.w / 2;
      const cy = this.#crop.y + this.#crop.h / 2;
      const w = Math.max(max.w / zoom, CropSession.MIN_SIZE);
      const h = this.#aspect ? w / this.#aspect : Math.max(max.h / zoom, CropSession.MIN_SIZE);
      this.#crop = { x: cx - w / 2, y: cy - h / 2, w, h };
      this.#keepInside();
    }

    moveBy(dx, dy) {
      this.#crop.x += dx;
      this.#crop.y += dy;
      this.#keepInside();
    }

    /**
     * Drag a corner handle to the pointer position (image coordinates).
     * The opposite corner stays fixed.
     */
    resizeTo(handle, px, py) {
      if (!CropSession.HANDLES.includes(handle)) throw new ValidationError(`Unknown handle "${handle}"`);
      const MIN = CropSession.MIN_SIZE;
      const c = this.#crop;
      const west = handle.includes('w');
      const north = handle.includes('n');
      const ax = west ? c.x + c.w : c.x;
      const ay = north ? c.y + c.h : c.y;
      const sx = west ? -1 : 1;
      const sy = north ? -1 : 1;
      const maxW = sx > 0 ? this.#imgW - ax : ax;
      const maxH = sy > 0 ? this.#imgH - ay : ay;

      let w = clamp((px - ax) * sx, MIN, Math.max(maxW, MIN));
      let h = clamp((py - ay) * sy, MIN, Math.max(maxH, MIN));

      if (this.#aspect) {
        const a = this.#aspect;
        w = Math.max(w, h * a);
        h = w / a;
        if (w > maxW) {
          w = maxW;
          h = w / a;
        }
        if (h > maxH) {
          h = maxH;
          w = h * a;
        }
      }
      this.#crop = { x: sx > 0 ? ax : ax - w, y: sy > 0 ? ay : ay - h, w, h };
      this.#keepInside();
    }

    #keepInside() {
      const c = this.#crop;
      c.w = Math.min(c.w, this.#imgW);
      c.h = Math.min(c.h, this.#imgH);
      c.x = clamp(c.x, 0, this.#imgW - c.w);
      c.y = clamp(c.y, 0, this.#imgH - c.h);
    }
  }

  NS.CropSession = CropSession;
})(typeof window !== 'undefined' ? window : globalThis);
