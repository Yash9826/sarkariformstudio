'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const ORT_DIST = path.join(ROOT, 'node_modules', 'onnxruntime-web', 'dist');
const ORT_TARGET = path.join(ROOT, 'vendor', 'ort');
const MANIFEST = path.join(ROOT, 'vendor', 'models', 'manifest.json');

if (!fs.existsSync(ORT_DIST)) throw new Error(`Required package files are missing: ${ORT_DIST}. Run npm install first.`);
fs.mkdirSync(ORT_TARGET, { recursive: true });
fs.copyFileSync(path.join(ORT_DIST, 'ort.wasm.min.js'), path.join(ORT_TARGET, 'ort.min.js'));
const runtimeFiles = ['ort.min.js', 'ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm'];
for (const file of runtimeFiles.slice(1)) {
  fs.copyFileSync(path.join(ORT_DIST, file), path.join(ORT_TARGET, file));
}

const license = ['LICENSE', 'LICENSE.md']
  .map((file) => path.join(ROOT, 'node_modules', 'onnxruntime-web', file))
  .find((file) => fs.existsSync(file));
if (license) fs.copyFileSync(license, path.join(ORT_TARGET, 'onnxruntime-web.LICENSE'));

const model = path.join(ROOT, 'vendor', 'models', 'modnet.onnx');
const hashFiles = [
  ...runtimeFiles.filter((file) => /\.wasm$/.test(file)).map((file) => path.join(ORT_TARGET, file)),
  model,
].filter((file) => fs.existsSync(file));
const hashes = Object.fromEntries(hashFiles.map((file) => [
  path.relative(ROOT, file).replace(/\\/g, '/'),
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
]));
fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, `${JSON.stringify({ generatedAt: new Date().toISOString(), sha256: hashes }, null, 2)}\n`);

console.log(`Vendored ONNX Runtime Web: ${runtimeFiles.join(', ')}`);
