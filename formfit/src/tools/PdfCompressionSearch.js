(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ConversionError } = NS;

  class PdfCompressionSearch {
    static async findFirstFit(rungs, targetBytes, encode, { minQuality = 0.45, maxQuality = 0.9, iterations = 5 } = {}) {
      for (const rung of rungs) {
        let best = await encode(rung, maxQuality);
        if (best.size <= targetBytes) return { rung, quality: maxQuality, blob: best };
        best = await encode(rung, minQuality);
        if (best.size > targetBytes) continue;
        let low = minQuality;
        let high = maxQuality;
        for (let i = 0; i < iterations; i++) {
          const quality = (low + high) / 2;
          const candidate = await encode(rung, quality);
          if (candidate.size <= targetBytes) {
            best = candidate;
            low = quality;
          } else high = quality;
        }
        return { rung, quality: low, blob: best };
      }
      throw new ConversionError('No PDF compression rung fits the requested size', {
        code: 'TARGET_UNREACHABLE',
        userMessage: `Even at the lowest quality the document is larger than ${NS.ByteSize.format(targetBytes)}. Remove some pages or choose a larger limit.`,
      });
    }
  }

  NS.PdfCompressionSearch = PdfCompressionSearch;
})(typeof window !== 'undefined' ? window : globalThis);
