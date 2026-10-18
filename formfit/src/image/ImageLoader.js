/**
 * ImageLoader: validates and decodes a user-selected file, reporting progress
 * while the file is being read so the UI can show "Uploading… 63%".
 * (Nothing leaves the device: "upload" here means "read into the browser".)
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ImageLoadError, Logger } = NS;

  class ImageLoader {
    static ACCEPTED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/bmp', 'image/gif']);
    static MAX_BYTES = 30 * 1024 * 1024;
    static MIN_EDGE = 40;

    #log;
    constructor(logger = Logger.for('ImageLoader')) {
      this.#log = logger;
    }

    /**
     * @param {File} file
     * @param {(percent:number, label:string)=>void} [onProgress]
     * @returns {Promise<{source:ImageBitmap|HTMLImageElement, width:number, height:number, name:string, bytes:number, mime:string}>}
     */
    async load(file, onProgress = () => {}, { signal } = {}) {
      this.#assertUsable(file);
      if (signal && signal.aborted) throw this.#cancelled();
      this.#log.info('Loading file', { type: file.type, bytes: file.size });

      const buffer = await this.#read(file, (pct) => onProgress(Math.round(pct * 0.8), 'Uploading…'), signal);
      onProgress(85, 'Reading your picture…');

      const blob = new Blob([buffer], { type: file.type });
      const source = await this.#decode(blob);
      if (signal && signal.aborted) {
        this.#release(source);
        throw this.#cancelled();
      }
      const width = source.width;
      const height = source.height;

      if (width < ImageLoader.MIN_EDGE || height < ImageLoader.MIN_EDGE) {
        this.#release(source);
        throw new ImageLoadError(`Image too small: ${width}×${height}`, {
          code: 'IMAGE_TOO_SMALL',
          userMessage: `This picture is too small (${width} × ${height} px). Please use a larger one.`,
        });
      }
      onProgress(100, 'Done');
      this.#log.info('File decoded', { width, height });
      return { source, width, height, name: file.name, bytes: file.size, mime: file.type };
    }

    #assertUsable(file) {
      if (!file) {
        throw new ImageLoadError('No file provided', { code: 'NO_FILE', userMessage: 'Please choose a picture first.' });
      }
      const lowerName = String(file.name || '').toLowerCase();
      if (/\.(heic|heif)$/.test(lowerName) || /heic|heif/.test(file.type)) {
        throw new ImageLoadError('HEIC is not supported', {
          code: 'HEIC_UNSUPPORTED',
          userMessage: 'HEIC/HEIF pictures are not supported by browsers. Please save the picture as JPG first (on iPhone: Settings → Camera → Formats → Most Compatible), or use our HEIC to JPG tool.',
        });
      }
      if (!ImageLoader.ACCEPTED_TYPES.includes(file.type)) {
        throw new ImageLoadError(`Unsupported type "${file.type}"`, {
          code: 'UNSUPPORTED_TYPE',
          userMessage: 'Please choose a JPG, PNG or WebP picture. PDFs and other files cannot be used.',
        });
      }
      if (file.size === 0) {
        throw new ImageLoadError('File is empty', { code: 'EMPTY_FILE', userMessage: 'That file is empty. Please choose another picture.' });
      }
      if (file.size > ImageLoader.MAX_BYTES) {
        const mb = (file.size / 1048576).toFixed(1);
        throw new ImageLoadError(`File too large: ${file.size}`, {
          code: 'FILE_TOO_LARGE',
          userMessage: `This file is ${mb} MB. Please choose a picture under ${ImageLoader.MAX_BYTES / 1048576} MB.`,
        });
      }
    }

    #read(file, onPercent, signal) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const abort = () => reader.abort();
        if (signal) signal.addEventListener('abort', abort, { once: true });
        reader.onprogress = (e) => {
          if (e.lengthComputable) onPercent((e.loaded / e.total) * 100);
        };
        reader.onload = () => { if (signal) signal.removeEventListener('abort', abort); resolve(reader.result); };
        reader.onerror = () => {
          if (signal) signal.removeEventListener('abort', abort);
          reject(new ImageLoadError('FileReader failed', {
            code: 'READ_FAILED',
            userMessage: 'Could not read that file. Please try again or choose another picture.',
            cause: reader.error,
          }));
        };
        reader.onabort = () => {
          if (signal) signal.removeEventListener('abort', abort);
          reject(this.#cancelled());
        };
        reader.readAsArrayBuffer(file);
      });
    }

    #cancelled() {
      return new ImageLoadError('Image read was cancelled', { code: 'CANCELLED', userMessage: 'Cancelled. Nothing was changed.' });
    }

    async #decode(blob) {
      try {
        if (typeof createImageBitmap === 'function') {
          return await createImageBitmap(blob, { imageOrientation: 'from-image' });
        }
      } catch (error) {
        this.#log.warn('createImageBitmap failed, falling back to <img>', error);
      }
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new ImageLoadError('Could not decode image file', {
            code: 'DECODE_FAILED',
            userMessage: 'This picture looks damaged or is not a real image. Please choose another one.',
          }));
        };
        img.src = url;
      });
    }

    #release(source) {
      if (source && typeof source.close === 'function') source.close();
    }
  }

  NS.ImageLoader = ImageLoader;
})(typeof window !== 'undefined' ? window : globalThis);
