(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class FaceFramer {
    static frame({ imageWidth, imageHeight, matte, faceMetrics, preset, photoArea = null }) {
      const warnings = [];
      const area = photoArea || preset.outputPx;
      const aspect = area.w / area.h;
      const ratio = preset.headRatio || { min: 0.55, target: 0.75, max: 0.85 };
      if (!faceMetrics || !faceMetrics.faceCount) {
        warnings.push('We could not find a face automatically; adjust the box by hand');
        return { cropRect: this.#centered(imageWidth, imageHeight, aspect), straightenDeg: 0, paddedRatio: 0, warnings, headRatioAchieved: null };
      }
      const faces = faceMetrics.faces || [faceMetrics];
      const sorted = [...faces].sort((a, b) => (b.area || 0) - (a.area || 0));
      if (sorted.length > 1 && !(sorted[0].area > 2 * sorted[1].area)) {
        throw new NS.ValidationError('Multiple faces detected in passport photo', {
          code: 'MULTIPLE_FACES', userMessage: 'Please use a photo with only one person.',
        });
      }
      const face = sorted[0];
      const roll = Number(face.rollDeg) || 0;
      const straightenDeg = Math.abs(roll) <= 15 ? -roll : 0;
      if (Math.abs(roll) > 15) warnings.push('Head is tilted; retake the photo with your head level');
      const faceCentreX = Number.isFinite(face.faceCentreX)
        ? face.faceCentreX
        : ((face.eyeLeft && face.eyeLeft.x || imageWidth / 2) + (face.eyeRight && face.eyeRight.x || imageWidth / 2) + (face.noseTip && face.noseTip.x || imageWidth / 2)) / 3;
      const faceWidth = Math.max(1, face.width || Math.abs((face.eyeRight && face.eyeRight.x || faceCentreX + 1) - (face.eyeLeft && face.eyeLeft.x || faceCentreX - 1)) * 2);
      const headTopY = this.#findHeadTop(matte, imageWidth, imageHeight, faceCentreX, faceWidth, face.headTopY);
      const chinY = Number.isFinite(face.chinY) ? face.chinY : headTopY + imageHeight * (ratio.target || 0.75);
      const headHeight = Math.max(1, chinY - headTopY);
      const lowCropHeight = headHeight / ratio.max;
      const highCropHeight = headHeight / ratio.min;
      const cropHeight = Math.max(lowCropHeight, Math.min(highCropHeight, headHeight / ratio.target));
      const cropWidth = cropHeight * aspect;
      const topMargin = Number.isFinite(preset.topMarginRatio)
        ? preset.topMarginRatio * cropHeight
        : Math.max(0, Math.min(cropHeight * 0.12, (cropHeight - headHeight) * 0.45));
      const cropRect = { x: faceCentreX - cropWidth / 2, y: headTopY - topMargin, w: cropWidth, h: cropHeight };
      const insideWidth = Math.max(0, Math.min(imageWidth, cropRect.x + cropRect.w) - Math.max(0, cropRect.x));
      const insideHeight = Math.max(0, Math.min(imageHeight, cropRect.y + cropRect.h) - Math.max(0, cropRect.y));
      const paddedRatio = Math.max(0, 1 - (insideWidth * insideHeight) / (cropWidth * cropHeight));
      if (paddedRatio > 0.3) warnings.push('The photo is cropped very tightly; retake it with more space around you');
      if (cropWidth < area.w * 0.8 || cropHeight < area.h * 0.8) warnings.push('Your photo is low resolution; the result may look soft');
      if (matte && matte.alpha) {
        const top = this.#findHeadTop(matte, imageWidth, imageHeight, faceCentreX, faceWidth, headTopY);
        if (top < headTopY) warnings.push('Head coverings: follow your authority’s rules');
      }
      return {
        cropRect, straightenDeg, paddedRatio, warnings,
        headRatioAchieved: headHeight / cropHeight,
      };
    }

    static #centered(width, height, aspect) {
      let w = width;
      let h = w / aspect;
      if (h > height) { h = height; w = h * aspect; }
      return { x: (width - w) / 2, y: (height - h) / 2, w, h };
    }

    static #findHeadTop(matte, width, height, centreX, faceWidth, fallback) {
      if (!matte || !(matte.alpha instanceof Float32Array) || matte.alpha.length !== width * height) return fallback ?? 0;
      const left = Math.max(0, Math.floor(centreX - faceWidth * 1.5));
      const right = Math.min(width, Math.ceil(centreX + faceWidth * 1.5));
      const needed = Math.max(1, Math.ceil(faceWidth * 0.01));
      for (let y = 0; y < height; y++) {
        let count = 0;
        for (let x = left; x < right; x++) if (matte.alpha[y * width + x] > 0.5) count++;
        if (count >= needed) return y;
      }
      return fallback ?? 0;
    }
  }

  NS.FaceFramer = FaceFramer;
})(typeof window !== 'undefined' ? window : globalThis);
