(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class PdfBuilder {
    static IMAGE_SIZE_RUNGS = Object.freeze([2480, 1800, 1400, 1100, 800]);

    static PAGE_SIZES = Object.freeze({
      A4: Object.freeze([595.28, 841.89]),
      Letter: Object.freeze([612, 792]),
    });

    static async fromImages(images, options = {}, pdfLib = root.PDFLib) {
      if (!pdfLib || !pdfLib.PDFDocument) throw new NS.DependencyError('pdf-lib is not loaded');
      if (!Array.isArray(images) || !images.length) throw new ValidationError('At least one image is required');
      const { pageSize = 'A4', orientation = 'Auto', margin = 'Normal' } = options;
      const document = await pdfLib.PDFDocument.create();
      for (const image of images) {
        const embedded = image.mime === 'image/png'
          ? await document.embedPng(image.bytes)
          : await document.embedJpg(image.bytes);
        let [pageWidth, pageHeight] = pageSize === 'Fit to image'
          ? [embedded.width * 0.75, embedded.height * 0.75]
          : PdfBuilder.PAGE_SIZES[pageSize] || PdfBuilder.PAGE_SIZES.A4;
        const landscape = orientation === 'Landscape' || (orientation === 'Auto' && embedded.width > embedded.height);
        if ((landscape && pageHeight > pageWidth) || (!landscape && pageWidth > pageHeight)) {
          [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
        const marginPoints = margin === 'None' ? 0 : margin === 'Small 10 mm' ? 28.35 : 56.7;
        const page = document.addPage([pageWidth, pageHeight]);
        const scale = Math.min(
          (pageWidth - marginPoints * 2) / embedded.width,
          (pageHeight - marginPoints * 2) / embedded.height
        );
        const width = embedded.width * scale;
        const height = embedded.height * scale;
        page.drawImage(embedded, {
          x: (pageWidth - width) / 2,
          y: (pageHeight - height) / 2,
          width,
          height,
        });
      }
      return document.save({ useObjectStreams: true });
    }

    static async fromImagesToTarget(entries, options, pdfLib, targetBytes, prepare, context, onProgress = () => {}) {
      const encode = async (maxEdge, quality, progress, message) => {
        const images = [];
        for (let i = 0; i < entries.length; i++) {
          NS.ConverterUtils.assertNotAborted(context && context.signal);
          images.push(await prepare(entries[i], maxEdge, quality));
          onProgress(progress, `${message} — page ${i + 1} of ${entries.length}…`);
        }
        return new Blob([await PdfBuilder.fromImages(images, options, pdfLib)], { type: 'application/pdf' });
      };

      let result = await encode(null, 0.9, 10, 'Preparing original-quality PDF');
      if (result.size <= targetBytes) return new Uint8Array(await result.arrayBuffer());
      for (let rung = 0; rung < PdfBuilder.IMAGE_SIZE_RUNGS.length; rung++) {
        const maxEdge = PdfBuilder.IMAGE_SIZE_RUNGS[rung];
        const progressBase = 20 + rung * 70 / PdfBuilder.IMAGE_SIZE_RUNGS.length;
        onProgress(progressBase, `Reducing PDF size (${maxEdge} px)…`);
        const top = await encode(maxEdge, 0.9, progressBase + 1, `Testing ${maxEdge} px at 90% quality`);
        if (top.size <= targetBytes) return new Uint8Array(await top.arrayBuffer());
        const bottom = await encode(maxEdge, 0.4, progressBase + 2, `Testing ${maxEdge} px at 40% quality`);
        if (bottom.size > targetBytes) continue;
        let best = bottom;
        let low = 0.4;
        let high = 0.9;
        for (let iteration = 0; iteration < 5; iteration++) {
          const quality = (low + high) / 2;
          const candidate = await encode(maxEdge, quality, progressBase + 3 + iteration * 1.3, `Tuning ${maxEdge} px quality`);
          if (candidate.size <= targetBytes) {
            best = candidate;
            low = quality;
          } else high = quality;
        }
        return new Uint8Array(await best.arrayBuffer());
      }
      throw new NS.ConversionError(`PDF exceeds the ${NS.ByteSize.format(targetBytes)} size target`, {
        code: 'TARGET_UNREACHABLE',
        userMessage: `Could not reduce this PDF to ${NS.ByteSize.format(targetBytes)}. Try fewer pages or a higher limit.`,
      });
    }
  }

  NS.PdfBuilder = PdfBuilder;
})(typeof window !== 'undefined' ? window : globalThis);
