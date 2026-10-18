/**
 * QualitySearch + ImageCompressor.
 *
 * The goal is "the best-looking file that still fits the size limits":
 *  1. binary-search the encoder quality for the largest file <= maxBytes
 *  2. if the result is below minBytes (JPEG only), pad it up with comment bytes
 *  3. if even the lowest quality is too big and downscaling is allowed (free-size
 *     rules only), shrink the picture a little and try again
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { CompressionError, JpegPadder, Logger } = NS;

  class QualitySearch {
    static MIN_QUALITY = 0.05;
    static MAX_QUALITY = 1;

    /**
     * @param {(quality:number)=>Promise<Blob>} encode
     * @param {number} maxBytes
     * @returns {Promise<{blob:Blob, quality:number}|null>} null when even the lowest quality is too big
     */
    static async findHighest(encode, maxBytes, iterations = 9) {
      const { MIN_QUALITY: LO, MAX_QUALITY: HI } = QualitySearch;
      const top = await encode(HI);
      if (top.size <= maxBytes) return { blob: top, quality: HI };

      const bottom = await encode(LO);
      if (bottom.size > maxBytes) return null;

      let best = { blob: bottom, quality: LO };
      let lo = LO;
      let hi = HI;
      for (let i = 0; i < iterations; i++) {
        const mid = (lo + hi) / 2;
        const blob = await encode(mid);
        if (blob.size <= maxBytes) {
          best = { blob, quality: mid };
          lo = mid;
        } else {
          hi = mid;
        }
      }
      return best;
    }
  }

  class ImageCompressor {
    static DOWNSCALE_STEP = 0.85;
    static MAX_DOWNSCALES = 12;
    static #PAD_MARGIN = 512; // land slightly above the minimum, never right on the edge

    #log;
    constructor(logger = Logger.for('ImageCompressor')) {
      this.#log = logger;
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @param {{mime:string, minBytes:number, maxBytes:number|null, allowDownscale?:boolean, onProgress?:(msg:string)=>void}} options
     * @returns {Promise<{blob:Blob, width:number, height:number, quality:number, padded:boolean, downscaled:boolean}>}
     */
    async compress(canvas, options) {
      const { mime, minBytes = 0, maxBytes = null, allowDownscale = false, onProgress = () => {} } = options;
      let current = canvas;
      let downscaled = false;
      let found = null;

      if (maxBytes === null) {
        onProgress('Encoding image…');
        found = { blob: await this.#encode(current, mime, 0.92), quality: 0.92 };
      } else {
        for (let attempt = 0; attempt <= ImageCompressor.MAX_DOWNSCALES; attempt++) {
          onProgress(attempt === 0 ? 'Finding the best quality that fits…' : `Shrinking slightly to fit (${attempt})…`);
          found = await QualitySearch.findHighest((q) => this.#encode(current, mime, q), maxBytes);
          if (found) break;
          if (!allowDownscale) {
            this.#log.warn('Cannot fit under limit at fixed dimensions', { maxBytes, w: current.width, h: current.height });
            throw new CompressionError(`Lowest quality still exceeds ${maxBytes} bytes`, {
              code: 'TOO_LARGE',
              userMessage:
                'This picture is too detailed to fit the size limit at the required dimensions. Try a simpler photo, or crop in tighter on your face.',
              details: { maxBytes, width: current.width, height: current.height },
            });
          }
          current = this.#scaled(current, ImageCompressor.DOWNSCALE_STEP);
          downscaled = true;
        }
        if (!found) {
          throw new CompressionError('Could not reach the size limit even after shrinking', {
            code: 'TOO_LARGE',
            userMessage: 'Could not make this image small enough. Please try a different image.',
          });
        }
      }

      let { blob } = found;
      let padded = false;
      if (blob.size < minBytes) {
        if (mime !== 'image/jpeg') {
          this.#log.warn('File below minimum size and padding is only possible for JPEG', { size: blob.size, minBytes });
        } else {
          onProgress('Adding padding to reach the minimum size…');
          const target = Math.min(minBytes + ImageCompressor.#PAD_MARGIN, maxBytes === null ? Infinity : maxBytes);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          blob = new Blob([JpegPadder.pad(bytes, target)], { type: mime });
          padded = true;
        }
      }

      this.#log.info('Compression finished', {
        bytes: blob.size, quality: Number(found.quality.toFixed(3)), padded, downscaled, w: current.width, h: current.height,
      });
      return { blob, width: current.width, height: current.height, quality: found.quality, padded, downscaled };
    }

    #encode(canvas, mime, quality) {
      return new Promise((resolve, reject) => {
        try {
          canvas.toBlob(
            (blob) => {
              if (!blob) return reject(new CompressionError('Canvas produced no data', { userMessage: 'Your browser could not encode the image.' }));
              if (blob.type !== mime) {
                return reject(new CompressionError(`Browser cannot encode ${mime} (got ${blob.type})`, {
                  code: 'FORMAT_UNSUPPORTED',
                  userMessage: 'Your browser cannot save in this format. Please choose JPEG instead.',
                }));
              }
              resolve(blob);
            },
            mime,
            quality
          );
        } catch (error) {
          reject(NS.SarkariFormStudioError.wrap(error, 'Could not encode the image.'));
        }
      });
    }

    #scaled(canvas, factor) {
      const out = document.createElement('canvas');
      out.width = Math.max(1, Math.round(canvas.width * factor));
      out.height = Math.max(1, Math.round(canvas.height * factor));
      const ctx = out.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, out.width, out.height);
      return out;
    }
  }

  Object.assign(NS, { QualitySearch, ImageCompressor });
})(typeof window !== 'undefined' ? window : globalThis);
