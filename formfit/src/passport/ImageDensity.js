(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class ImageDensity {
    static patch(input, dpi) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      if (!Number.isInteger(dpi) || dpi <= 0 || dpi > 65535) throw new ValidationError('DPI must be an integer between 1 and 65535');
      if (this.#isPng(bytes)) return this.#patchPng(bytes, dpi);
      if (this.#isJpeg(bytes)) return this.#patchJpeg(bytes, dpi);
      throw new ValidationError('ImageDensity supports JPEG and PNG files only');
    }

    static read(input) {
      const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
      if (this.#isJpeg(bytes)) {
        let offset = 2;
        while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
          const marker = bytes[offset + 1];
          const length = bytes[offset + 2] * 256 + bytes[offset + 3];
          if (marker === 0xe0 && length >= 16 && bytes[offset + 4] === 0x4a &&
              bytes[offset + 5] === 0x46 && bytes[offset + 6] === 0x49 && bytes[offset + 7] === 0x46) {
            const unit = bytes[offset + 11];
            const x = bytes[offset + 12] * 256 + bytes[offset + 13];
            const y = bytes[offset + 14] * 256 + bytes[offset + 15];
            return unit === 1 ? { x, y, unit: 'dpi' } : unit === 2 ? { x: x * 2.54, y: y * 2.54, unit: 'dpcm' } : null;
          }
          if (marker === 0xda || marker === 0xd9) break;
          offset += length + 2;
        }
        return null;
      }
      if (!this.#isPng(bytes)) return null;
      let offset = 8;
      while (offset + 12 <= bytes.length) {
        const length = this.#readU32(bytes, offset);
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        if (type === 'pHYs' && length === 9 && bytes[offset + 16] === 1) {
          return { x: this.#readU32(bytes, offset + 8) * 0.0254, y: this.#readU32(bytes, offset + 12) * 0.0254, unit: 'dpi' };
        }
        offset += 12 + length;
      }
      return null;
    }

    static #patchJpeg(bytes, dpi) {
      const app0 = new Uint8Array([
        0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1,
        (dpi >> 8) & 0xff, dpi & 0xff, (dpi >> 8) & 0xff, dpi & 0xff, 0, 0,
      ]);
      if (bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ValidationError('Invalid JPEG data');
      let offset = 2;
      while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
        const marker = bytes[offset + 1];
        if (marker !== 0xe0) break;
        const length = bytes[offset + 2] * 256 + bytes[offset + 3];
        if (length < 2 || offset + length + 2 > bytes.length) break;
        const jfif = bytes[offset + 4] === 0x4a && bytes[offset + 5] === 0x46 && bytes[offset + 6] === 0x49 && bytes[offset + 7] === 0x46;
        if (jfif) {
          const out = new Uint8Array(bytes.length - length - 2 + app0.length);
          out.set(bytes.subarray(0, offset));
          out.set(app0, offset);
          out.set(bytes.subarray(offset + length + 2), offset + app0.length);
          return out;
        }
        offset += length + 2;
      }
      const out = new Uint8Array(bytes.length + app0.length);
      out.set(bytes.subarray(0, 2));
      out.set(app0, 2);
      out.set(bytes.subarray(2), 2 + app0.length);
      return out;
    }

    static #patchPng(bytes, dpi) {
      if (!this.#isPng(bytes)) throw new ValidationError('Invalid PNG data');
      const pixelsPerMetre = Math.round(dpi / 0.0254);
      const data = new Uint8Array(9);
      this.#writeU32(data, 0, pixelsPerMetre);
      this.#writeU32(data, 4, pixelsPerMetre);
      data[8] = 1;
      const chunk = this.#pngChunk('pHYs', data);
      const chunks = [bytes.subarray(0, 8)];
      let offset = 8;
      let inserted = false;
      while (offset + 12 <= bytes.length) {
        const length = this.#readU32(bytes, offset);
        const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
        const end = offset + 12 + length;
        if (end > bytes.length) throw new ValidationError('PNG contains an invalid chunk');
        if (type === 'pHYs') {
          if (!inserted) chunks.push(chunk);
          inserted = true;
        } else {
          chunks.push(bytes.subarray(offset, end));
          if (type === 'IHDR' && !inserted) { chunks.push(chunk); inserted = true; }
        }
        offset = end;
      }
      if (offset !== bytes.length) throw new ValidationError('PNG contains truncated data');
      const size = chunks.reduce((sum, part) => sum + part.length, 0);
      const result = new Uint8Array(size);
      let cursor = 0;
      for (const part of chunks) { result.set(part, cursor); cursor += part.length; }
      return result;
    }

    static #pngChunk(type, data) {
      const name = new TextEncoder().encode(type);
      const output = new Uint8Array(12 + data.length);
      this.#writeU32(output, 0, data.length);
      output.set(name, 4);
      output.set(data, 8);
      this.#writeU32(output, 8 + data.length, this.#crc32(output.subarray(4, 8 + data.length)));
      return output;
    }

    static #crc32(bytes) {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    static #readU32(bytes, offset) {
      return bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
    }

    static #writeU32(bytes, offset, value) {
      bytes[offset] = (value >>> 24) & 255;
      bytes[offset + 1] = (value >>> 16) & 255;
      bytes[offset + 2] = (value >>> 8) & 255;
      bytes[offset + 3] = value & 255;
    }

    static #isPng(bytes) {
      return bytes.length >= 8 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 &&
        bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
    }

    static #isJpeg(bytes) {
      return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
    }
  }

  NS.ImageDensity = ImageDensity;
})(typeof window !== 'undefined' ? window : globalThis);
