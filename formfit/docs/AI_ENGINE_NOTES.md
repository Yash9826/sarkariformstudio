# AI engine notes

## MODNet background cut-out

- Source: `Xenova/modnet`, pinned repository revision `d73298e811956d07bafec4ce9446ea4ecaa14438`.
- Licence: Apache-2.0 as declared by the model card; source notice and immutable link are in `vendor/models/NOTICE.md`.
- The quantized ONNX model is 6,632,188 bytes and has SHA-256 `92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a`. `ModelLoader` checks the digest before use and caches the model locally.
- The model preprocessor uses RGB, NCHW float32, rescaling by 1/255, normalization with mean/std 0.5, shortest edge 512, and dimensions divisible by 32. The worker reads ONNX input/output names from the session.
- Runtime plumbing has been smoke-tested with synthetic browser input. There has been no real-portrait quality comparison; the output requires visual review.

## Runtime and limitations

- `onnxruntime-web` 1.30.0 (MIT) is pinned and vendored locally. Its runtime and WASM files are copied by `npm run vendor-ai`.
- The app requests the model from its own origin only. It does not call an image-processing API or load model assets from a CDN.
- `npm run fetch-model` downloads the pinned model at development/release preparation time and verifies its exact byte count and digest.
- AI inference requires HTTP(S) for the browser worker. Opening `index.html` directly uses the local basic fallback instead.
- The model is provisional for size/performance. No real-portrait fixture set has been validated; do not treat its output as guaranteed segmentation quality.
