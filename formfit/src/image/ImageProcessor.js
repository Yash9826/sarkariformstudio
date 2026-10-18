/** Canvas helpers: rotate and crop/resize with decent downscaling quality. */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, Logger } = NS;

  class ImageProcessor {
    #log = Logger.for('ImageProcessor');

    /** @returns {HTMLCanvasElement} a new canvas holding the image turned by 90 degrees. */
    rotate90(source, width, height, clockwise = true) {
      const canvas = this.#canvas(height, width);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      if (clockwise) {
        ctx.translate(height, 0);
        ctx.rotate(Math.PI / 2);
      } else {
        ctx.translate(0, width);
        ctx.rotate(-Math.PI / 2);
      }
      ctx.drawImage(source, 0, 0);
      return canvas;
    }

    /** Rotate an image around its centre, expanding the canvas to retain the full image. */
    straighten(source, width, height, degrees, background = '#ffffff') {
      const radians = (degrees * Math.PI) / 180;
      const outW = Math.ceil(Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians)));
      const outH = Math.ceil(Math.abs(height * Math.cos(radians)) + Math.abs(width * Math.sin(radians)));
      const canvas = this.#canvas(outW, outH);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate(radians);
      ctx.drawImage(source, -width / 2, -height / 2, width, height);
      return canvas;
    }

    /** Downscale an image so its longest edge does not exceed `maxEdge`. */
    scaleToFit(source, width, height, maxEdge) {
      const scale = Math.min(1, maxEdge / Math.max(width, height));
      if (scale === 1) return source;
      const canvas = this.#canvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    /**
     * Cut `crop` out of `source` and scale it to outW × outH.
     * Large reductions are done in halving steps, which avoids jagged/aliased results.
     */
    renderCrop(source, crop, outW, outH, background = '#ffffff') {
      if (!(outW > 0) || !(outH > 0) || !(crop.w > 0) || !(crop.h > 0)) {
        throw new ValidationError(`Bad crop/output size: ${JSON.stringify({ crop, outW, outH })}`, {
          userMessage: 'Please select an area of the picture to crop.',
        });
      }
      let w = Math.max(1, Math.round(crop.w));
      let h = Math.max(1, Math.round(crop.h));

      let stage = this.#canvas(w, h);
      let ctx = stage.getContext('2d');
      ctx.fillStyle = background; // JPEG has no transparency
      ctx.fillRect(0, 0, w, h);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);

      while (w / 2 >= outW && h / 2 >= outH) {
        const nw = Math.floor(w / 2);
        const nh = Math.floor(h / 2);
        const next = this.#canvas(nw, nh);
        const nctx = next.getContext('2d');
        nctx.imageSmoothingQuality = 'high';
        nctx.drawImage(stage, 0, 0, nw, nh);
        stage = next;
        w = nw;
        h = nh;
      }

      const out = this.#canvas(outW, outH);
      ctx = out.getContext('2d');
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, outW, outH);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(stage, 0, 0, outW, outH);
      this.#log.debug('Rendered crop', { from: `${Math.round(crop.w)}×${Math.round(crop.h)}`, to: `${outW}×${outH}` });
      return out;
    }

    #canvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
  }

  NS.ImageProcessor = ImageProcessor;
})(typeof window !== 'undefined' ? window : globalThis);
