(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, Logger, BoxBlur, MorphologyOps } = NS;

  class InkExtractor {
    #log = Logger.for('InkExtractor');

    extract(imageData, options = {}) {
      const { data, width, height } = imageData || {};
      if (!(data instanceof Uint8ClampedArray) || width <= 0 || height <= 0 || data.length !== width * height * 4) {
        throw new ValidationError('InkExtractor expects an RGBA image buffer');
      }
      const strength = Math.max(0, Math.min(100, Number(options.strength ?? 60)));
      if (!Number.isFinite(strength)) throw new ValidationError('Ink strength must be between 0 and 100');
      const length = width * height;
      const gray = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const p = i * 4;
        gray[i] = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
      }

      const illumination = BoxBlur.blur(gray, width, height, Math.max(1, Math.round(Math.max(width, height) * 0.06)));
      const normalized = new Float32Array(length);
      const histogram = new Uint32Array(256);
      for (let i = 0; i < length; i++) {
        normalized[i] = Math.max(0, Math.min(255, (gray[i] / Math.max(1, illumination[i])) * 255));
        histogram[Math.round(normalized[i])]++;
      }
      const black = this.#percentile(histogram, length * 0.02);
      const white = this.#percentile(histogram, length * 0.92);
      const poorContrast = white - black < 25;
      const span = Math.max(1, white - black);
      const levels = new Uint8Array(length);
      const levelsHistogram = new Uint32Array(256);
      for (let i = 0; i < length; i++) {
        const value = Math.max(0, Math.min(255, Math.round(((normalized[i] - black) * 255) / span)));
        levels[i] = value;
        levelsHistogram[value]++;
      }
      const threshold = this.#otsu(levelsHistogram, length);
      const shiftedThreshold = Math.max(0, Math.min(255, threshold + (-0.10 + (strength / 100) * 0.25) * 255));
      const halfWidth = 255 * (0.04 + 0.08 * (strength / 100));
      const ink = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        ink[i] = 1 - this.#smoothstep(shiftedThreshold - halfWidth, shiftedThreshold + halfWidth, levels[i]);
      }
      if (poorContrast) {
        let mean = 0;
        for (const value of gray) mean += value;
        mean /= length;
        ink.fill(mean < 127 ? 1 : 0);
      }

      if (options.removeSpecks !== false) this.#removeSpecks(ink, width, height);
      if (strength > 70) {
        const dilated = MorphologyOps.dilate(ink, width, height, 1);
        ink.set(dilated);
      }

      let inkPixels = 0;
      const output = new Uint8ClampedArray(data.length);
      const inkColor = options.inkColor === 'darkblue' ? [10, 31, 107] : [0, 0, 0];
      for (let i = 0; i < length; i++) {
        const amount = ink[i];
        if (amount > 0.5) inkPixels++;
        const p = i * 4;
        for (let channel = 0; channel < 3; channel++) {
          const color = options.inkColor === 'original' ? data[p + channel] * 0.75 : inkColor[channel];
          output[p + channel] = Math.round(255 * (1 - amount) + color * amount);
        }
        output[p + 3] = 255;
      }
      const inkRatio = inkPixels / length;
      let reason = null;
      if (inkRatio > 0.35) reason = 'The sheet looks too dark; photograph it in better light.';
      else if (poorContrast || inkRatio < 0.002) reason = 'The signature looks very faint or missing.';
      if (reason) this.#log.warn('Signature cleanup quality gate', { reason, inkRatio, black, white });

      const crop = options.autoTrim === false ? null : this.#trim(ink, width, height, Number(options.aspectRatio) || null);
      return {
        imageData: { data: output, width, height },
        ink,
        crop,
        quality: reason ? 'poor' : 'good',
        reason,
        inkRatio,
        threshold: shiftedThreshold,
      };
    }

    #percentile(histogram, target) {
      let count = 0;
      for (let value = 0; value < histogram.length; value++) {
        count += histogram[value];
        if (count >= target) return value;
      }
      return 255;
    }

    #otsu(histogram, total) {
      let sum = 0;
      for (let i = 0; i < histogram.length; i++) sum += i * histogram[i];
      let backgroundWeight = 0;
      let backgroundSum = 0;
      let maximumVariance = -1;
      let threshold = 0;
      for (let i = 0; i < histogram.length; i++) {
        backgroundWeight += histogram[i];
        if (!backgroundWeight) continue;
        const foregroundWeight = total - backgroundWeight;
        if (!foregroundWeight) break;
        backgroundSum += i * histogram[i];
        const meanBackground = backgroundSum / backgroundWeight;
        const meanForeground = (sum - backgroundSum) / foregroundWeight;
        const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
        if (variance > maximumVariance) {
          maximumVariance = variance;
          threshold = i;
        }
      }
      return threshold;
    }

    #smoothstep(edge0, edge1, value) {
      const x = Math.max(0, Math.min(1, (value - edge0) / Math.max(1e-9, edge1 - edge0)));
      return x * x * (3 - 2 * x);
    }

    #removeSpecks(ink, width, height) {
      const total = width * height;
      const minArea = Math.max(6, 0.00002 * total);
      const seen = new Uint8Array(total);
      const queue = new Uint32Array(total);
      const components = [];
      let queued = 0;
      for (let i = 0; i < total; i++) {
        if (seen[i] || ink[i] <= 0.5) continue;
        const start = queued;
        let head = start;
        let tail = start;
        let minX = width, minY = height, maxX = 0, maxY = 0;
        queue[tail++] = i;
        seen[i] = 1;
        while (head < tail) {
          const index = queue[head++];
          const x = index % width;
          const y = Math.floor(index / width);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if ((dx === 0 && dy === 0) || nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
              const next = ny * width + nx;
              if (!seen[next] && ink[next] > 0.5) {
                seen[next] = 1;
                queue[tail++] = next;
              }
            }
          }
        }
        components.push({ start, end: tail, minX, minY, maxX, maxY, large: tail - start >= minArea });
        queued = tail;
      }
      const large = components.filter((component) => component.large);
      for (const component of components) {
        if (component.large || large.some((other) => this.#near(component, other, width, height))) continue;
        for (let i = component.start; i < component.end; i++) ink[queue[i]] = 0;
      }
    }

    #near(small, large, width, height) {
      const padX = width * 0.03;
      const padY = height * 0.03;
      return small.maxX >= large.minX - padX && small.minX <= large.maxX + padX &&
        small.maxY >= large.minY - padY && small.minY <= large.maxY + padY;
    }

    #trim(ink, width, height, aspect) {
      let minX = width, minY = height, maxX = -1, maxY = -1;
      for (let i = 0; i < ink.length; i++) {
        if (ink[i] <= 0.2) continue;
        const x = i % width;
        const y = Math.floor(i / width);
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      }
      if (maxX < 0) return null;
      const padX = Math.max(4, (maxX - minX + 1) * 0.04);
      const padY = Math.max(4, (maxY - minY + 1) * 0.04);
      let w = Math.min(width, maxX - minX + 1 + padX * 2);
      let h = Math.min(height, maxY - minY + 1 + padY * 2);
      if (aspect > 0) {
        if (w / h > aspect) h = w / aspect;
        else w = h * aspect;
        const scale = Math.min(1, width / w, height / h);
        w *= scale; h *= scale;
      }
      const centerX = (minX + maxX + 1) / 2;
      const centerY = (minY + maxY + 1) / 2;
      const x = Math.max(0, Math.min(width - w, centerX - w / 2));
      const y = Math.max(0, Math.min(height - h, centerY - h / 2));
      return { x, y, w, h };
    }
  }

  NS.InkExtractor = InkExtractor;
})(typeof window !== 'undefined' ? window : globalThis);
