(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ConversionError } = NS;

  function assertNotAborted(signal) {
    if (signal && signal.aborted) {
      throw new ConversionError('User cancelled the operation', {
        code: 'CANCELLED',
        userMessage: 'Cancelled. No files were created.',
      });
    }
  }

  function safeBaseName(name) {
    return String(name || 'converted').replace(/\.[^.]*$/, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim() || 'converted';
  }

  function uniqueName(name, used) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name;
    const extension = dot > 0 ? name.slice(dot) : '';
    let candidate = name;
    let suffix = 1;
    while (used.has(candidate.toLowerCase())) candidate = `${base}-${suffix++}${extension}`;
    used.add(candidate.toLowerCase());
    return candidate;
  }

  function output(name, blob, note = '') {
    return { name, blob, size: blob.size, note };
  }

  async function encodeCanvas(canvas, mime, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new ConversionError('Canvas produced no data', {
            code: 'OUT_OF_MEMORY',
            userMessage: 'Your device ran out of memory. Close other tabs or use fewer or smaller files.',
          }));
          return;
        }
        if (blob.type !== mime) {
          reject(new ConversionError(`Browser cannot encode ${mime}`, {
            code: 'FORMAT_UNSUPPORTED',
            userMessage: 'Your browser cannot save in this format. Please choose JPEG instead.',
          }));
          return;
        }
        resolve(blob);
      }, mime, quality);
    });
  }

  NS.ConverterUtils = Object.freeze({ assertNotAborted, safeBaseName, uniqueName, output, encodeCanvas });
})(typeof window !== 'undefined' ? window : globalThis);
