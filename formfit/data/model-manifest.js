(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  NS.ModelManifest = Object.freeze({
    id: 'modnet-quantized',
    url: 'vendor/models/modnet.onnx',
    sha256: '92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a',
    bytes: 6632188,
    revision: 'd73298e811956d07bafec4ce9446ea4ecaa14438',
    license: 'Apache-2.0',
  });
})(typeof window !== 'undefined' ? window : globalThis);
