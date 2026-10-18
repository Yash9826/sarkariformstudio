(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  const presets = [
    { id: 'original', label: 'Original dimensions', description: 'Keep the loaded image dimensions.' },
    { id: '35x45mm', label: '35 × 45 mm · 300 DPI', description: 'Generic portrait print size.', unit: 'mm', width: 35, height: 45, dpi: 300 },
    { id: '2x2in', label: '2 × 2 in · 300 DPI', description: 'Generic square print size.', unit: 'in', width: 2, height: 2, dpi: 300 },
    { id: '20x25mm', label: '20 × 25 mm · 300 DPI', description: 'Generic small print size.', unit: 'mm', width: 20, height: 25, dpi: 300 },
    { id: '200x230px', label: '200 × 230 px', description: 'Generic small digital image.', unit: 'px', width: 200, height: 230, dpi: 300 },
    { id: '35x45mm-200dpi', label: '3.5 × 4.5 cm · 200 DPI', description: 'Generic digital portrait size.', unit: 'cm', width: 3.5, height: 4.5, dpi: 200 },
    { id: '140x60px', label: '140 × 60 px', description: 'Generic signature image size.', unit: 'px', width: 140, height: 60, dpi: 300 },
    { id: '500x500px', label: '500 × 500 px', description: 'Generic square profile image.', unit: 'px', width: 500, height: 500, dpi: 300 },
    { id: 'custom', label: 'Custom dimensions', description: 'Enter dimensions, units, and DPI.', unit: 'px', width: '', height: '', dpi: 300 },
  ].map((preset) => Object.freeze(preset));

  NS.PhotoPresets = Object.freeze(presets);
  NS.PhotoPresetMath = Object.freeze({
    toPixels(value, unit, dpi) {
      const amount = Number(value);
      const resolution = Number(dpi);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(resolution) || resolution <= 0) {
        throw new NS.ValidationError('Enter positive dimensions and a positive DPI value.');
      }
      const inches = { px: amount / resolution, in: amount, mm: amount / 25.4, cm: amount / 2.54 }[unit];
      if (inches == null) throw new NS.ValidationError('Choose px, mm, cm, or inches for the dimensions.');
      return Math.max(1, Math.round(inches * resolution));
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
