(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ModelError } = NS;

  class MatteWorkerClient {
    #workerFactory;
    #worker = null;
    #sequence = 0;
    #pending = new Map();
    #timeoutMs;

    constructor(workerFactory = (url) => new Worker(url), timeoutMs = 30000) {
      this.#workerFactory = workerFactory;
      this.#timeoutMs = timeoutMs;
    }

    async infer(imageData, modelBuffer, { onProgress = () => {} } = {}) {
      const worker = this.#getWorker();
      const id = ++this.#sequence;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => this.#timeout(id), this.#timeoutMs);
        this.#pending.set(id, { resolve, reject, onProgress, timeout });
        const pixels = new Uint8ClampedArray(imageData.data);
        worker.postMessage({
          id,
          type: 'infer',
          width: imageData.width,
          height: imageData.height,
          pixels: pixels.buffer,
          model: modelBuffer,
        }, [pixels.buffer, modelBuffer]);
      });
    }

    cancel() {
      if (!this.#worker) return;
      this.#worker.terminate();
      this.#worker = null;
      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new ModelError('Inference was cancelled', {
          code: 'CANCELLED', userMessage: 'Cancelled. Nothing was changed.',
        }));
      }
      this.#pending.clear();
    }

    #timeout(id) {
      const pending = this.#pending.get(id);
      if (!pending) return;
      this.#pending.delete(id);
      if (this.#worker) this.#worker.terminate();
      this.#worker = null;
      pending.reject(new ModelError('Matte inference timed out', {
        code: 'INFERENCE_TIMEOUT',
        userMessage: 'This is taking too long. Try a smaller picture.',
      }));
    }

    #getWorker() {
      if (this.#worker) return this.#worker;
      try {
        this.#worker = this.#workerFactory('src/ai/matte.worker.js');
      } catch (cause) {
        throw new ModelError(`Could not create the matte worker: ${cause.message}`, {
          code: 'WORKER_UNAVAILABLE',
          userMessage: 'This browser cannot run the AI tool. Basic mode was used instead.',
          cause,
        });
      }
      this.#worker.addEventListener('message', (event) => {
        const message = event.data || {};
        const pending = this.#pending.get(message.id);
        if (!pending) return;
        if (message.type === 'progress') {
          pending.onProgress(message.percent, message.label);
        } else if (message.type === 'result') {
          clearTimeout(pending.timeout);
          this.#pending.delete(message.id);
          pending.resolve({
            alpha: new Float32Array(message.alpha),
            quality: message.quality || 'good',
            reason: message.reason || null,
          });
        } else if (message.type === 'error') {
          clearTimeout(pending.timeout);
          this.#pending.delete(message.id);
          pending.reject(new ModelError(message.message || 'Matte inference failed', {
            code: message.code || 'MODEL_ERROR',
            userMessage: message.userMessage || 'The AI model is unavailable. You can continue in basic mode.',
          }));
        }
      });
      this.#worker.addEventListener('error', (event) => {
        const error = new ModelError(`Matte worker failed: ${event.message || 'unknown error'}`, {
          code: 'WORKER_UNAVAILABLE',
          userMessage: 'This browser cannot run the AI tool. Basic mode was used instead.',
        });
        for (const pending of this.#pending.values()) {
          clearTimeout(pending.timeout);
          pending.reject(error);
        }
        this.#pending.clear();
        this.#worker.terminate();
        this.#worker = null;
      });
      return this.#worker;
    }
  }

  NS.MatteWorkerClient = MatteWorkerClient;
})(typeof window !== 'undefined' ? window : globalThis);
