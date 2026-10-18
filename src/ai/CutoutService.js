(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { BackgroundMasker, Logger, ModelError } = NS;

  class CutoutService {
    #modelLoader;
    #worker;
    #cache;
    #fallback;
    #log = Logger.for('CutoutService');

    constructor({ modelLoader, workerClient, cache = new NS.CutoutCache(), fallback = new BackgroundMasker() }) {
      this.#modelLoader = modelLoader;
      this.#worker = workerClient;
      this.#cache = cache;
      this.#fallback = fallback;
    }

    async remove(imageData, { signal, onProgress = () => {}, allowAI = true } = {}) {
      const keySource = { ...imageData, data: imageData.data };
      const cached = this.#cache.get(keySource);
      if (cached) return { ...cached, cached: true };
      if (signal && signal.aborted) throw this.#cancelError();

      if (allowAI && this.#modelLoader && this.#worker) {
        try {
          onProgress(null, 'Loading AI model…');
          const buffer = await this.#modelLoader.load({ signal, onProgress });
          if (signal && signal.aborted) throw this.#cancelError();
          onProgress(null, 'Finding the person…');
          const inferred = await this.#worker.infer(imageData, buffer, { onProgress });
          if (!(inferred.alpha instanceof Float32Array) || inferred.alpha.length !== imageData.width * imageData.height) {
            throw new ModelError('AI matte dimensions did not match the source image', { code: 'MODEL_CORRUPT' });
          }
          const cutout = {
            width: imageData.width,
            height: imageData.height,
            rgba: new Uint8ClampedArray(imageData.data),
            alpha: inferred.alpha,
            mode: 'ai',
            quality: inferred.quality,
            reason: inferred.reason,
          };
          this.#cache.set(keySource, cutout);
          this.#log.info('AI cut-out ready', { coverage: this.#coverage(inferred.alpha) });
          return cutout;
        } catch (error) {
          if (error && error.code === 'CANCELLED' || signal && signal.aborted) throw this.#cancelError();
          this.#log.warn('AI matte unavailable; using basic segmentation', {
            code: error && error.code,
            message: error && error.message,
          });
          onProgress(null, 'AI unavailable; using basic mode…');
          const fallback = this.#basic(imageData, error);
          this.#cache.set(keySource, fallback);
          return fallback;
        }
      }

      return this.#basic(imageData, new ModelError('AI model is not configured', { code: 'WORKER_UNAVAILABLE' }));
    }

    cancel() {
      if (this.#worker) this.#worker.cancel();
    }

    clear() {
      this.#cache.clear();
    }

    #basic(imageData, cause) {
      const result = this.#fallback.computeMask(imageData, { tolerance: 22, feather: 1 });
      const alpha = new Float32Array(result.mask.length);
      for (let i = 0; i < alpha.length; i++) alpha[i] = 1 - result.mask[i];
      this.#log.warn('Basic background segmentation used', { quality: result.quality, removedRatio: result.removedRatio });
      return {
        width: imageData.width,
        height: imageData.height,
        rgba: new Uint8ClampedArray(imageData.data),
        alpha,
        mode: 'basic',
        quality: result.quality,
        reason: result.reason || (cause && cause.userMessage) || 'AI model is not available; basic mode was used.',
      };
    }

    #coverage(alpha) {
      let sum = 0;
      for (const value of alpha) sum += value;
      return Number((sum / alpha.length).toFixed(3));
    }

    #cancelError() {
      return new ModelError('Cut-out was cancelled', { code: 'CANCELLED', userMessage: 'Cancelled. Nothing was changed.' });
    }
  }

  NS.CutoutService = CutoutService;
})(typeof window !== 'undefined' ? window : globalThis);
