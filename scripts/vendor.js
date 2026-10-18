'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const vendor = path.join(root, 'vendor');
fs.mkdirSync(vendor, { recursive: true });

const files = [
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['node_modules/pdf-lib/LICENSE.md', 'pdf-lib.LICENSE.md'],
  ['node_modules/pdfjs-dist/build/pdf.min.js', 'pdf.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.js', 'pdf.worker.min.js'],
  ['node_modules/pdfjs-dist/LICENSE', 'pdfjs-dist.LICENSE'],
  ['node_modules/heic2any/dist/heic2any.min.js', 'heic2any.min.js'],
  ['node_modules/heic2any/LICENSE.md', 'heic2any.LICENSE.md'],
];

for (const [source, destination] of files) {
  const sourcePath = path.join(root, source);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing vendor source ${sourcePath}. Run npm install before npm run vendor.`);
  }
  fs.copyFileSync(sourcePath, path.join(vendor, destination));
}

console.log(`Vendored ${files.length - 3} libraries and license files into vendor/.`);
