(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ImageStage, DateFormatter, Logger } = NS;

  class DateStampStage extends ImageStage {
    #log = Logger.for('DateStampStage');

    constructor() {
      super('date-stamp', 'photo name and date strip');
    }

    static geometry(rule, heightRatio) {
      if (!rule || !rule.hasFixedSize) throw new NS.ValidationError('A fixed-size photo rule is required for a stamp');
      const stripHeight = Math.round(rule.heightPx * heightRatio);
      return Object.freeze({
        width: rule.widthPx,
        height: rule.heightPx,
        stripHeight,
        pictureHeight: rule.heightPx - stripHeight,
        cropAspect: rule.widthPx / (rule.heightPx - stripHeight),
      });
    }

    isEnabled(options) {
      return Boolean(options && options.kind === 'photo' && options.stamp.enabled);
    }

    apply(canvas, options, context = {}) {
      const rule = context.rule;
      if (!rule || !rule.hasFixedSize) return canvas;
      const name = String(options.stamp.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
      if (rule.stampSpec && rule.stampSpec.required && !name) {
        throw new NS.ValidationError('Required photo strip name is missing', {
          userMessage: 'Please type your name for the photo strip.',
        });
      }
      const displayName = options.stamp.uppercase ? name.toLocaleUpperCase('en-US') : name;
      const date = DateFormatter.format(options.stamp.date, options.stamp.dateFormat);
      const geometry = DateStampStage.geometry(rule, options.stamp.heightRatio);
      const { width, height, stripHeight, pictureHeight } = geometry;
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const ctx = output.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, width, pictureHeight);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, pictureHeight, width, stripHeight);

      const oneLine = stripHeight / 2 < 11;
      const lines = oneLine ? [`${displayName}  ${date}`.trim()] : [displayName, date];
      const lineHeight = oneLine ? stripHeight : stripHeight / 2;
      const maxWidth = width * 0.94;
      const fitSize = Math.min(lineHeight * 0.8, ...lines.map((line) => this.#fitFont(ctx, line, maxWidth)));
      if (fitSize < 8) {
        if (typeof context.onWarning === 'function') context.onWarning('Strip is too small for this name; shorten it or increase the strip height.');
      }
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fitSize}px Arial, "Helvetica Neue", sans-serif`;
      lines.forEach((line, index) => {
        const y = pictureHeight + lineHeight * (index + 0.5);
        ctx.fillText(line, width / 2, y, maxWidth);
      });
      this.#log.info('Photo stamp added', { width, height, stripHeight });
      return output;
    }

    #fitFont(ctx, text, maxWidth) {
      let low = 6;
      let high = 200;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        ctx.font = `700 ${mid}px Arial, "Helvetica Neue", sans-serif`;
        if (ctx.measureText(text).width <= maxWidth) low = mid;
        else high = mid - 1;
      }
      return low;
    }
  }

  NS.DateStampStage = DateStampStage;
})(typeof window !== 'undefined' ? window : globalThis);
