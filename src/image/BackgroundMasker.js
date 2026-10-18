(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, ColorMath, MorphologyOps, BoxBlur, Logger } = NS;

  class BackgroundMasker {
    #log = Logger.for('BackgroundMasker');

    computeMask(imageData, options = {}) {
      const { data, width, height } = imageData || {};
      if (!(data instanceof Uint8ClampedArray) || width <= 0 || height <= 0 || data.length !== width * height * 4) {
        throw new ValidationError('BackgroundMasker expects an RGBA image buffer');
      }
      const tolerance = Number(options.tolerance ?? 22);
      if (!Number.isFinite(tolerance) || tolerance < 5 || tolerance > 60) {
        throw new ValidationError('Background sensitivity must be between 5 and 60');
      }
      const total = width * height;
      const stripX = Math.max(1, Math.ceil(width * 0.04));
      const stripY = Math.max(1, Math.ceil(height * 0.04));
      const labPixels = new Float32Array(total * 3);
      const border = [[], [], []];
      let previousR = -1;
      let previousG = -1;
      let previousB = -1;
      let previousL = 0;
      let previousA = 0;
      let previousLabB = 0;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = y * width + x;
          const pixel = index * 4;
          const red = data[pixel];
          const green = data[pixel + 1];
          const blue = data[pixel + 2];
          const labOffset = index * 3;
          if (red === previousR && green === previousG && blue === previousB) {
            labPixels[labOffset] = previousL;
            labPixels[labOffset + 1] = previousA;
            labPixels[labOffset + 2] = previousLabB;
          } else {
            ColorMath.rgbToLab(red, green, blue, labPixels, labOffset);
            previousR = red;
            previousG = green;
            previousB = blue;
            previousL = labPixels[labOffset];
            previousA = labPixels[labOffset + 1];
            previousLabB = labPixels[labOffset + 2];
          }
          if (x < stripX || x >= width - stripX || y < stripY || y >= height - stripY) {
            border[0].push(labPixels[index * 3]);
            border[1].push(labPixels[index * 3 + 1]);
            border[2].push(labPixels[index * 3 + 2]);
          }
        }
      }
      const reference = border.map((channel) => this.#median(channel));
      let totalDelta = 0;
      for (let i = 0; i < border[0].length; i++) {
        totalDelta += Math.hypot(
          border[0][i] - reference[0],
          border[1][i] - reference[1],
          border[2][i] - reference[2]
        );
      }
      const meanDelta = totalDelta / border[0].length;
      const busyBackground = meanDelta > 18;
      const candidate = new Uint8Array(total);
      const mask = new Uint8Array(total);
      const toleranceSquared = tolerance * tolerance;
      for (let i = 0; i < total; i++) {
        const offset = i * 3;
        const deltaL = labPixels[offset] - reference[0];
        const deltaA = labPixels[offset + 1] - reference[1];
        const deltaB = labPixels[offset + 2] - reference[2];
        candidate[i] = deltaL * deltaL + deltaA * deltaA + deltaB * deltaB <= toleranceSquared ? 1 : 0;
      }

      const queue = new Uint32Array(total);
      let head = 0;
      let tail = 0;
      const add = (index) => {
        if (candidate[index] && !mask[index]) {
          mask[index] = 1;
          queue[tail++] = index;
        }
      };
      for (let x = 0; x < width; x++) {
        add(x);
        add((height - 1) * width + x);
      }
      for (let y = 0; y < height; y++) {
        add(y * width);
        add(y * width + width - 1);
      }
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = Math.floor(index / width);
        if (x > 0) add(index - 1);
        if (x + 1 < width) add(index + 1);
        if (y > 0) add(index - width);
        if (y + 1 < height) add(index + width);
      }

      let cleaned = MorphologyOps.opening(MorphologyOps.closing(mask, width, height, 1), width, height, 1);
      this.#fillSmallHoles(cleaned, width, height);
      let removed = 0;
      for (const value of cleaned) if (value > 0.5) removed++;
      const removedRatio = removed / total;
      let reason = null;
      if (busyBackground) reason = 'The background looks busy. Try a plain wall, or use the brush to fix the edges.';
      else if (removedRatio > 0.85 || removedRatio < 0.02) reason = 'The background could not be separated reliably. Try a plain wall, or use the brush to fix the edges.';
      if (reason) this.#log.warn('Background quality gate', { reason, removedRatio, meanDelta });
      cleaned = Number(options.feather) > 0
        ? BoxBlur.blur(Float32Array.from(cleaned), width, height, Number(options.feather))
        : Float32Array.from(cleaned);
      for (let i = 0; i < cleaned.length; i++) cleaned[i] = Math.max(0, Math.min(1, cleaned[i]));
      this.#log.debug('Computed background mask', { reference, meanDelta, removedRatio, busyBackground });
      return {
        mask: cleaned,
        width,
        height,
        quality: reason ? 'poor' : 'good',
        reason,
        removedRatio,
        busyBackground,
      };
    }

    composite(imageData, maskInfo, color) {
      const { data, width, height } = imageData;
      const target = this.#parseColor(color);
      const mask = this.#resizeMask(maskInfo.mask, maskInfo.width, maskInfo.height, width, height);
      const output = new Uint8ClampedArray(data.length);
      for (let i = 0; i < width * height; i++) {
        const alpha = mask[i];
        const offset = i * 4;
        for (let channel = 0; channel < 3; channel++) {
          let value = data[offset + channel] * (1 - alpha) + target[channel] * alpha;
          if (alpha > 0.05 && alpha < 0.95) value = value * 0.85 + target[channel] * 0.15;
          output[offset + channel] = Math.round(value);
        }
        output[offset + 3] = 255;
      }
      return { data: output, width, height };
    }

    paintMask(mask, width, height, x, y, radius, removeBackground) {
      if (!(mask instanceof Float32Array) || mask.length !== width * height) {
        throw new ValidationError('Brush mask dimensions do not match the image');
      }
      const cx = Math.round(x);
      const cy = Math.round(y);
      const r = Math.max(1, Number(radius));
      const x0 = Math.max(0, Math.floor(cx - r));
      const x1 = Math.min(width - 1, Math.ceil(cx + r));
      const y0 = Math.max(0, Math.floor(cy - r));
      const y1 = Math.min(height - 1, Math.ceil(cy + r));
      const target = removeBackground ? 1 : 0;
      for (let py = y0; py <= y1; py++) {
        for (let px = x0; px <= x1; px++) {
          const distance = Math.hypot(px - cx, py - cy);
          if (distance > r) continue;
          const falloff = Math.max(0, Math.min(1, (r - distance) / Math.max(1, r * 0.25)));
          const index = py * width + px;
          mask[index] = mask[index] * (1 - falloff) + target * falloff;
        }
      }
      return mask;
    }

    #median(values) {
      values.sort((a, b) => a - b);
      const middle = values.length >> 1;
      return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }

    #fillSmallHoles(mask, width, height) {
      const total = width * height;
      const seen = new Uint8Array(total);
      const queue = new Uint32Array(total);
      const threshold = Math.max(1, total * 0.002);
      for (let i = 0; i < total; i++) {
        if (seen[i] || mask[i] > 0.5) continue;
        let head = 0;
        let tail = 0;
        let touchesEdge = false;
        queue[tail++] = i;
        seen[i] = 1;
        while (head < tail) {
          const current = queue[head++];
          const x = current % width;
          const y = Math.floor(current / width);
          if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
          let next;
          if (x > 0) {
            next = current - 1;
            if (!seen[next] && mask[next] <= 0.5) { seen[next] = 1; queue[tail++] = next; }
          }
          if (x + 1 < width) {
            next = current + 1;
            if (!seen[next] && mask[next] <= 0.5) { seen[next] = 1; queue[tail++] = next; }
          }
          if (y > 0) {
            next = current - width;
            if (!seen[next] && mask[next] <= 0.5) { seen[next] = 1; queue[tail++] = next; }
          }
          if (y + 1 < height) {
            next = current + width;
            if (!seen[next] && mask[next] <= 0.5) { seen[next] = 1; queue[tail++] = next; }
          }
        }
        if (!touchesEdge && tail < threshold) {
          for (let j = 0; j < tail; j++) mask[queue[j]] = 1;
        }
      }
    }

    #resizeMask(source, sourceW, sourceH, width, height) {
      if (sourceW === width && sourceH === height) return source;
      const output = new Float32Array(width * height);
      const sx = sourceW / width;
      const sy = sourceH / height;
      for (let y = 0; y < height; y++) {
        const fy = Math.max(0, (y + 0.5) * sy - 0.5);
        const y0 = Math.floor(fy);
        const y1 = Math.min(sourceH - 1, y0 + 1);
        const ty = fy - y0;
        for (let x = 0; x < width; x++) {
          const fx = Math.max(0, (x + 0.5) * sx - 0.5);
          const x0 = Math.floor(fx);
          const x1 = Math.min(sourceW - 1, x0 + 1);
          const tx = fx - x0;
          const top = source[y0 * sourceW + x0] * (1 - tx) + source[y0 * sourceW + x1] * tx;
          const bottom = source[y1 * sourceW + x0] * (1 - tx) + source[y1 * sourceW + x1] * tx;
          output[y * width + x] = top * (1 - ty) + bottom * ty;
        }
      }
      return output;
    }

    #parseColor(color) {
      if (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color)) {
        throw new ValidationError('Background colour must be a six-digit hex value');
      }
      return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
    }
  }

  NS.BackgroundMasker = BackgroundMasker;
})(typeof window !== 'undefined' ? window : globalThis);
