(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ModelError } = NS;

  class OrtRuntimeConfig {
    static configure(ort, { wasmPath = '../../vendor/ort/', isolated = false, hardwareConcurrency = 1 } = {}) {
      if (!ort || !ort.env || !ort.env.wasm) {
        throw new ModelError('ONNX Runtime Web is not available', {
          code: 'WORKER_UNAVAILABLE',
          userMessage: 'This browser cannot run the AI tool. Basic mode was used instead.',
        });
      }
      ort.env.wasm.wasmPaths = wasmPath;
      ort.env.wasm.numThreads = isolated ? Math.max(1, Math.min(4, Math.floor(hardwareConcurrency / 2))) : 1;
      ort.env.wasm.proxy = false;
      ort.env.logLevel = 'warning';
      return Object.freeze({ provider: 'wasm', numThreads: ort.env.wasm.numThreads });
    }
  }

  NS.OrtRuntimeConfig = OrtRuntimeConfig;
})(typeof window !== 'undefined' ? window : globalThis);
