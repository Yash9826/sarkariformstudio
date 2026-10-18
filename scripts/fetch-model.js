'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const ROOT = path.join(__dirname, '..');
const ASSETS = [
  {
    label: 'MODNet quantized',
    url: 'https://huggingface.co/Xenova/modnet/resolve/d73298e811956d07bafec4ce9446ea4ecaa14438/onnx/model_quantized.onnx',
    target: path.join(ROOT, 'vendor', 'models', 'modnet.onnx'),
    bytes: 6632188,
    sha256: '92e49898c3e05a6d7a944fc67a8cb87c4aad754ffb6ebd949528c7d1105fee3a',
  },
];

async function fetchAsset(asset) {
  const temp = `${asset.target}.part`;
  fs.mkdirSync(path.dirname(asset.target), { recursive: true });
  const response = await fetch(asset.url);
  if (!response.ok || !response.body) throw new Error(`${asset.label} download failed with HTTP ${response.status}`);
  const hash = crypto.createHash('sha256');
  let received = 0;
  const meter = new Transform({
    transform(chunk, encoding, callback) {
      received += chunk.length;
      hash.update(chunk);
      if (response.headers.get('content-length')) {
        process.stdout.write(`\rDownloading ${asset.label}: ${Math.floor(received / Number(response.headers.get('content-length')) * 100)}%`);
      }
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), meter, fs.createWriteStream(temp));
    const digest = hash.digest('hex');
    if (received !== asset.bytes || digest !== asset.sha256) {
      throw new Error(`${asset.label} integrity check failed: ${received} bytes, SHA-256 ${digest}`);
    }
    fs.renameSync(temp, asset.target);
    process.stdout.write(`\nVerified ${asset.label} (${received} bytes, SHA-256 ${digest}).\n`);
  } catch (error) {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
    throw error;
  }
}

async function main() {
  for (const asset of ASSETS) await fetchAsset(asset);
}

main().catch((error) => {
  console.error(`Could not fetch AI models: ${error.message}`);
  process.exitCode = 1;
});
