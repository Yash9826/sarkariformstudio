(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError, BoxBlur, AlphaRefiner } = NS;

  class Compositor {
    static composite(cutout, alphaOverride, background = { type: 'solid', color: '#FFFFFF' }, { defringe = false } = {}) {
      const { width, height, rgba } = cutout || {};
      const alpha = alphaOverride || cutout.alpha;
      if (!Number.isInteger(width) || !Number.isInteger(height) ||
          !(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4 ||
          !(alpha instanceof Float32Array) || alpha.length !== width * height) {
        throw new ValidationError('Compositor expects matching RGBA pixels and alpha matte');
      }
      const pixels = defringe ? AlphaRefiner.decontaminate(rgba, alpha, width, height) : rgba;
      const bg = this.#background(background, width, height);
      const data = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < alpha.length; i++) {
        const p = i * 4;
        const a = Math.max(0, Math.min(1, alpha[i]));
        if (background.type === 'transparent') {
          data[p] = pixels[p];
          data[p + 1] = pixels[p + 1];
          data[p + 2] = pixels[p + 2];
          data[p + 3] = Math.round(255 * a);
        } else {
          data[p] = Math.round(pixels[p] * a + bg[p] * (1 - a));
          data[p + 1] = Math.round(pixels[p + 1] * a + bg[p + 1] * (1 - a));
          data[p + 2] = Math.round(pixels[p + 2] * a + bg[p + 2] * (1 - a));
          data[p + 3] = 255;
        }
      }
      return { data, width, height };
    }

    static #background(background, width, height) {
      if (!background || background.type === 'transparent') return new Uint8ClampedArray(width * height * 4);
      if (background.type === 'solid') {
        const color = this.#parseColor(background.color);
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i++) {
          const p = i * 4;
          data[p] = color[0];
          data[p + 1] = color[1];
          data[p + 2] = color[2];
          data[p + 3] = 255;
        }
        return data;
      }
      if (background.type === 'gradient') {
        const from = this.#parseColor(background.from);
        const to = this.#parseColor(background.to);
        const angle = ((Number(background.angle) || 0) * Math.PI) / 180;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const extent = Math.abs(dx) * width + Math.abs(dy) * height || 1;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const t = Math.max(0, Math.min(1, 0.5 + ((x - width / 2) * dx + (y - height / 2) * dy) / extent));
            const p = (y * width + x) * 4;
            for (let c = 0; c < 3; c++) data[p + c] = Math.round(from[c] * (1 - t) + to[c] * t);
            data[p + 3] = 255;
          }
        }
        return data;
      }
      if (background.type === 'blur') {
        const source = background.imageData;
        if (!source || !(source.data instanceof Uint8ClampedArray) || source.width !== width || source.height !== height) {
          throw new ValidationError('Blur background requires matching source pixels');
        }
        const data = new Uint8ClampedArray(source.data);
        for (let channel = 0; channel < 3; channel++) {
          const values = new Float32Array(width * height);
          for (let i = 0; i < values.length; i++) values[i] = source.data[i * 4 + channel];
          const blurred = BoxBlur.blur(values, width, height, background.radius || 8);
          for (let i = 0; i < values.length; i++) data[i * 4 + channel] = blurred[i];
        }
        return data;
      }
      if (background.type === 'image') {
        return this.#imageBackground(background, width, height);
      }
      throw new ValidationError(`Unsupported background type "${background.type}"`);
    }

    static #imageBackground(background, width, height) {
      const image = background.imageData;
      if (!image || !(image.data instanceof Uint8ClampedArray) || image.data.length !== image.width * image.height * 4) {
        throw new ValidationError('Image background requires valid RGBA pixels');
      }
      const fit = background.fit === 'contain' ? Math.min(width / image.width, height / image.height) : Math.max(width / image.width, height / image.height);
      const drawWidth = image.width * fit;
      const drawHeight = image.height * fit;
      const offsetX = (width - drawWidth) / 2;
      const offsetY = (height - drawHeight) / 2;
      const data = new Uint8ClampedArray(width * height * 4);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const srcX = Math.floor((x - offsetX) / fit);
          const srcY = Math.floor((y - offsetY) / fit);
          const p = (y * width + x) * 4;
          if (srcX < 0 || srcY < 0 || srcX >= image.width || srcY >= image.height) {
            data[p] = data[p + 1] = data[p + 2] = 255;
            data[p + 3] = 255;
          } else {
            const sp = (srcY * image.width + srcX) * 4;
            data.set(image.data.subarray(sp, sp + 4), p);
          }
        }
      }
      return data;
    }

    static #parseColor(value) {
      const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value || ''));
      if (!match) throw new ValidationError('Invalid background colour', { userMessage: 'Enter a colour like #DCEBFA.' });
      const hex = match[1].length === 3 ? [...match[1]].map((part) => part + part).join('') : match[1];
      return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
    }
  }

  NS.Compositor = Compositor;
})(typeof window !== 'undefined' ? window : globalThis);
