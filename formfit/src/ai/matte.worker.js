/* global importScripts, self */
'use strict';

let ortPromise;
let ortGlueUrl = null;
const send = (id, type, detail = {}) => self.postMessage({ id, type, ...detail });

self.addEventListener('message', async (event) => {
  const message = event.data || {};
  if (message.type !== 'infer') return;
  try {
    send(message.id, 'progress', { percent: null, label: 'Preparing AI model…' });
    if (!ortPromise) {
      const runtimeUrl = new URL('../../vendor/ort/ort.min.js', self.location.href).href;
      importScripts(runtimeUrl);
      ortPromise = Promise.resolve(self.ort);
    }
    const ort = await ortPromise;
    if (!ort) throw new Error('ONNX Runtime Web failed to load');
    const runtimeBase = new URL('../../vendor/ort/', self.location.href);
    if (!ortGlueUrl) {
      const glueResponse = await fetch(new URL('ort-wasm-simd-threaded.mjs', runtimeBase));
      if (!glueResponse.ok) throw new Error(`Could not load ONNX runtime glue (${glueResponse.status})`);
      ortGlueUrl = URL.createObjectURL(new Blob([await glueResponse.text()], { type: 'text/javascript' }));
    }
    ort.env.wasm.wasmPaths = {
      mjs: ortGlueUrl,
      wasm: new URL('ort-wasm-simd-threaded.wasm', runtimeBase).href,
    };
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.max(1, Math.min(4, Math.floor((self.navigator.hardwareConcurrency || 2) / 2)))
      : 1;
    ort.env.wasm.proxy = false;
    const session = await ort.InferenceSession.create(message.model, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
      executionMode: 'sequential',
    });
    send(message.id, 'progress', { percent: null, label: 'Finding the person…' });
    const width = message.width;
    const height = message.height;
    let target = 512 / Math.min(width, height);
    if (Math.max(width, height) * target > 1024) target = 1024 / Math.max(width, height);
    const inputWidth = Math.max(32, Math.ceil(width * target / 32) * 32);
    const inputHeight = Math.max(32, Math.ceil(height * target / 32) * 32);
    const pixels = new Uint8ClampedArray(message.pixels);
    const tensorData = new Float32Array(3 * inputWidth * inputHeight);
    for (let y = 0; y < inputHeight; y++) {
      const sourceY = Math.min(height - 1, Math.floor((y + 0.5) * height / inputHeight));
      for (let x = 0; x < inputWidth; x++) {
        const sourceX = Math.min(width - 1, Math.floor((x + 0.5) * width / inputWidth));
        const source = (sourceY * width + sourceX) * 4;
        const targetIndex = y * inputWidth + x;
        tensorData[targetIndex] = pixels[source] / 127.5 - 1;
        tensorData[inputWidth * inputHeight + targetIndex] = pixels[source + 1] / 127.5 - 1;
        tensorData[inputWidth * inputHeight * 2 + targetIndex] = pixels[source + 2] / 127.5 - 1;
      }
    }
    const tensor = new ort.Tensor('float32', tensorData, [1, 3, inputHeight, inputWidth]);
    const results = await session.run({ [session.inputNames[0]]: tensor });
    const matte = results[session.outputNames[0]];
    if (!matte || !matte.data || matte.data.length === 0) throw new Error('MODNet returned an empty matte');
    const dims = matte.dims;
    const matteWidth = dims[dims.length - 1];
    const matteHeight = dims[dims.length - 2];
    const sourceAlpha = matte.data;
    const alpha = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = Math.min(matteHeight - 1, Math.floor((y + 0.5) * matteHeight / height));
      for (let x = 0; x < width; x++) {
        const sx = Math.min(matteWidth - 1, Math.floor((x + 0.5) * matteWidth / width));
        alpha[y * width + x] = Math.max(0, Math.min(1, sourceAlpha[sy * matteWidth + sx]));
      }
    }
    let coverage = 0;
    for (const value of alpha) coverage += value;
    coverage /= alpha.length;
    await session.release();
    send(message.id, 'result', {
      alpha: alpha.buffer,
      width,
      height,
      quality: coverage < 0.02 || coverage > 0.98 ? 'poor' : 'good',
      reason: coverage < 0.02 || coverage > 0.98 ? 'We could not find a person in this picture. Try a clearer photo or use the brushes.' : null,
    });
  } catch (error) {
    const text = String(error && error.message || error);
    const memory = /memory|allocation/i.test(text);
    send(message.id, 'error', {
      code: memory ? 'OUT_OF_MEMORY' : 'MODEL_ERROR',
      userMessage: memory
        ? 'Your device ran out of memory. Close other tabs or use a smaller picture.'
        : 'The AI model is unavailable. You can continue in basic mode.',
      message: text,
    });
  }
});
