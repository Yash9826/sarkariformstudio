(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ModelError, Logger } = NS;

  class ModelLoader {
    #url;
    #sha256;
    #cacheName;
    #fetch;
    #cacheStorage;
    #crypto;
    #log = Logger.for('ModelLoader');

    constructor({ url, sha256, cacheName = 'sarkariformstudio-model-v1', fetcher = (...args) => globalThis.fetch(...args), cacheStorage = globalThis.caches, cryptoApi = globalThis.crypto }) {
      if (!url || typeof fetcher !== 'function') throw new ModelError('Model URL or fetch implementation is missing', { code: 'MODEL_DOWNLOAD_FAILED' });
      this.#url = url;
      this.#sha256 = String(sha256 || '').toLowerCase();
      this.#cacheName = cacheName;
      this.#fetch = fetcher;
      this.#cacheStorage = cacheStorage;
      this.#crypto = cryptoApi;
    }

    async load({ signal, onProgress = () => {} } = {}) {
      const cache = this.#cacheStorage && await this.#cacheStorage.open(this.#cacheName);
      const cached = cache && await cache.match(this.#url);
      if (cached) {
        const bytes = await cached.arrayBuffer();
        await this.#verify(bytes);
        onProgress(100, 'AI model ready');
        return bytes;
      }

      this.#log.info('Loading local model', { url: this.#url });
      let response;
      try {
        response = await this.#fetch(this.#url, { signal });
      } catch (cause) {
        if (signal && signal.aborted) throw this.#cancelError();
        throw new ModelError(`Model request failed: ${cause && cause.message ? cause.message : cause}`, {
          code: 'MODEL_DOWNLOAD_FAILED', cause,
          userMessage: 'Could not download the AI model. Check your connection and try again, or use basic mode.',
        });
      }
      if (!response || !response.ok) {
        throw new ModelError(`Model request returned ${response ? response.status : 'no response'}`, {
          code: 'MODEL_DOWNLOAD_FAILED',
          userMessage: 'Could not download the AI model. Check your connection and try again, or use basic mode.',
        });
      }
      const total = Number(response.headers && response.headers.get('content-length')) || 0;
      const chunks = [];
      let received = 0;
      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        try {
          while (true) {
            if (signal && signal.aborted) {
              await reader.cancel();
              throw this.#cancelError();
            }
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            received += value.byteLength;
            onProgress(total ? Math.min(99, received / total * 100) : null, 'Downloading AI model…');
          }
        } finally {
          reader.releaseLock();
        }
      } else {
        const bytes = new Uint8Array(await response.arrayBuffer());
        chunks.push(bytes);
        received = bytes.byteLength;
        onProgress(99, 'Checking AI model…');
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      await this.#verify(bytes.buffer);
      if (cache) await cache.put(this.#url, new Response(bytes.slice().buffer, {
        headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
      }));
      onProgress(100, 'AI model ready');
      this.#log.info('Model loaded and verified', { bytes: bytes.length });
      return bytes.buffer;
    }

    async #verify(buffer) {
      if (!/^[a-f0-9]{64}$/.test(this.#sha256) || !this.#crypto || !this.#crypto.subtle) {
        throw new ModelError('Model integrity metadata or Web Crypto is unavailable', {
          code: 'MODEL_CORRUPT',
          userMessage: 'The AI model file looks damaged. Please reload and try again.',
        });
      }
      const digest = new Uint8Array(await this.#crypto.subtle.digest('SHA-256', buffer));
      const actual = [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
      if (actual !== this.#sha256) {
        if (this.#cacheStorage && typeof this.#cacheStorage.open === 'function') {
          const cache = await this.#cacheStorage.open(this.#cacheName);
          await cache.delete(this.#url);
        }
        throw new ModelError('Downloaded model SHA-256 does not match the pinned hash', {
          code: 'MODEL_CORRUPT',
          userMessage: 'The AI model file looks damaged. Please reload and try again.',
        });
      }
    }

    #cancelError() {
      return new ModelError('Model loading was cancelled', { code: 'CANCELLED', userMessage: 'Cancelled. Nothing was changed.' });
    }
  }

  NS.ModelLoader = ModelLoader;
})(typeof window !== 'undefined' ? window : globalThis);
