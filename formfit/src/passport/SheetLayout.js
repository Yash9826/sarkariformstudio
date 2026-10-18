(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class SheetLayout {
    static PAPER_MM = Object.freeze({
      '4x6': Object.freeze({ w: 101.6, h: 152.4 }),
      A4: Object.freeze({ w: 210, h: 297 }),
      '5x7': Object.freeze({ w: 127, h: 177.8 }),
    });

    static compute(paper, photoMm, { margin = 3, gutter = 2, orientation = 'Auto' } = {}) {
      const dimensions = typeof paper === 'string' ? SheetLayout.PAPER_MM[paper] : paper;
      if (!dimensions || !(dimensions.w > 0) || !(dimensions.h > 0) ||
          !photoMm || !(photoMm.w > 0) || !(photoMm.h > 0) ||
          !Number.isFinite(margin) || margin < 0 || !Number.isFinite(gutter) || gutter < 0 ||
          !['Auto', 'Portrait', 'Landscape'].includes(orientation)) {
        throw new ValidationError('Print sheet dimensions or layout options are invalid');
      }
      const choices = orientation === 'Auto' ? ['Portrait', 'Landscape'] : [orientation];
      let best = null;
      for (const direction of choices) {
        const paperW = direction === 'Portrait' ? Math.min(dimensions.w, dimensions.h) : Math.max(dimensions.w, dimensions.h);
        const paperH = direction === 'Portrait' ? Math.max(dimensions.w, dimensions.h) : Math.min(dimensions.w, dimensions.h);
        const photoW = photoMm.w;
        const photoH = photoMm.h;
        const cols = Math.max(0, Math.floor((paperW - margin * 2 + gutter) / (photoW + gutter)));
        const rows = Math.max(0, Math.floor((paperH - margin * 2 + gutter) / (photoH + gutter)));
        const count = cols * rows;
        if (!best || count > best.count) {
          const gridW = cols * photoW + Math.max(0, cols - 1) * gutter;
          const gridH = rows * photoH + Math.max(0, rows - 1) * gutter;
          const offsetX = (paperW - gridW) / 2;
          const offsetY = (paperH - gridH) / 2;
          const positions = [];
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              positions.push({ x: offsetX + col * (photoW + gutter), y: offsetY + row * (photoH + gutter), w: photoW, h: photoH });
            }
          }
          best = { orientation: direction, cols, rows, count, positions, paperMm: { w: paperW, h: paperH }, photoMm: { w: photoW, h: photoH } };
        }
      }
      return best;
    }
  }

  NS.SheetLayout = SheetLayout;
})(typeof window !== 'undefined' ? window : globalThis);
