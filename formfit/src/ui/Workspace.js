/**
 * Workspace: the reusable "upload → crop → compress → download" widget.
 *
 * It knows nothing about exams. A `ruleProvider` callback supplies the active
 * RuleProfile, so the same class powers both Exam mode and General mode.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, clear, downloadBlob, formatBytes } = NS.dom;
  const {
    CropSession, CropperView, ImageLoader, ImageProcessor, ImageCompressor, RuleValidator,
    ProgressIndicator, Logger, EnhanceOptions, ProcessingPipeline, AdjustStage, SignatureCleanupStage,
    BackgroundStage, DateStampStage, EnhancePanel, PreviewRenderer, InkExtractor, SafeStorage,
  } = NS;

  class Workspace {
    #root;
    #ruleProvider;
    #notifier;
    #fileName;
    #onResult;
    #log = Logger.for('Workspace');
    #loader = new ImageLoader();
    #processor = new ImageProcessor();
    #compressor = new ImageCompressor();
    #validator = new RuleValidator();
    #pipeline = new ProcessingPipeline([new AdjustStage(), new BackgroundStage(), new SignatureCleanupStage(), new DateStampStage()]);
    #inkExtractor = new InkExtractor();
    #storage;
    #backgroundMask = null;
    #backgroundMaskKey = null;
    #backgroundMaskManual = false;

    #els = {};
    #progress;
    #image = null; // { source, width, height, name, bytes, mime }
    #original = null;
    #workingSource = null;
    #quarterTurns = 0;
    #options;
    #appliedStraightenDeg = 0;
    #straightenTimer = null;
    #session = null;
    #view = null;
    #enhancePanel = null;
    #preview = null;
    #busy = false;
    #previewUrl = null;
    #result = null;

    /**
     * @param {object} o
     * @param {HTMLElement} o.root
     * @param {(opts:{silent:boolean})=>NS.RuleProfile|null} o.ruleProvider
     * @param {NS.Notifier} o.notifier
     * @param {(rule:NS.RuleProfile)=>string} [o.fileName]
     * @param {(result:object)=>void} [o.onResult]
     */
    constructor({ root, ruleProvider, notifier, fileName = (rule) => rule.fileName(), onResult = () => {}, storage = new SafeStorage() }) {
      this.#root = root;
      this.#ruleProvider = ruleProvider;
      this.#notifier = notifier;
      this.#fileName = fileName;
      this.#onResult = onResult;
      this.#storage = storage;
      const rule = this.#ruleProvider({ silent: true });
      this.#options = this.#defaultOptions(rule, rule ? rule.kind : 'custom');
      this.#build();
    }

    #defaultBackground(rule) {
      return rule && typeof rule.background === 'string' && /^#[\da-f]{6}$/i.test(rule.background)
        ? rule.background.toLowerCase()
        : '#ffffff';
    }

    #defaultOptions(rule, kind) {
      return EnhanceOptions.defaults(kind, rule ? rule.stampSpec : null)
        .with({
          background: { color: this.#defaultBackground(rule) },
          stamp: { name: String(this.#storage.get('lastStampName', '') || '').slice(0, 40) },
        });
    }

    get hasImage() {
      return this.#image !== null;
    }

    /** Drop everything (image, crop, result) and return to the empty state. */
    reset() {
      clearTimeout(this.#straightenTimer);
      this.#straightenTimer = null;
      this.#clearResult();
      if (this.#view) this.#view.destroy();
      this.#view = null;
      if (this.#preview) this.#preview.clear();
      this.#session = null;
      if (this.#original && typeof this.#original.close === 'function') this.#original.close();
      this.#releaseCanvas(this.#workingSource);
      this.#backgroundMask = null;
      this.#backgroundMaskKey = null;
      this.#backgroundMaskManual = false;
      this.#image = null;
      this.#original = null;
      this.#workingSource = null;
      this.#quarterTurns = 0;
      this.#appliedStraightenDeg = 0;
      this.#els.editor.hidden = true;
      this.#els.drop.hidden = false;
      this.#els.file.value = '';
      this.#progress.hide();
    }

    /** Call when the active rule changed (e.g. user edited the General form). */
    refreshRule() {
      this.#clearResult();
      const rule = this.#ruleProvider({ silent: true });
      const kind = rule ? rule.kind : 'custom';
      if (this.#options.kind !== kind ||
          this.#options.stamp.required !== Boolean(rule && rule.stampSpec && rule.stampSpec.required) ||
          this.#options.stamp.heightRatio !== (rule && rule.stampSpec ? rule.stampSpec.heightRatio : this.#options.stamp.heightRatio) ||
          this.#options.background.color !== this.#defaultBackground(rule)) {
        this.#options = this.#defaultOptions(rule, kind);
        this.#enhancePanel.setOptions(this.#options);
      }
      this.#enhancePanel.setRule(rule);
      if (!this.#session) return;
      this.#session.setAspect(this.#effectiveAspect(rule, this.#options));
      this.#updateToolbar(rule);
      this.#view.render();
      this.#refreshPreview();
    }

    /** Public so other panels (e.g. the checker) can hand over a file. */
    async loadFile(file) {
      if (this.#busy) return;
      this.#busy = true;
      this.#setDisabled(true);
      this.#clearResult();
      try {
        const image = await this.#loader.load(file, (pct, label) => this.#progress.update(pct, `${label} ${pct}%`));
        this.#adopt(image);
        this.#notifier.success(`${image.name} loaded (${formatBytes(image.bytes)}, ${image.width} × ${image.height} px). Adjust the crop, then press “Crop & compress”.`, 'Picture ready');
      } catch (error) {
        this.#notifier.fromError(error, 'Could not use that picture');
      } finally {
        this.#progress.hide();
        this.#busy = false;
        this.#setDisabled(false);
      }
    }

    // ---- building the DOM ----

    #build() {
      const e = this.#els;
      e.file = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/bmp,image/gif', hidden: true, 'aria-label': 'Choose a picture' });
      e.drop = h(
        'label',
        { class: 'dropzone', tabindex: '0' },
        e.file,
        h('span', { class: 'drop-icon', 'aria-hidden': 'true' }, '⬆'),
        h('strong', null, 'Drop your picture here, or click to browse'),
        h('small', null, 'JPG, PNG or WebP · up to 30 MB · stays on your device')
      );
      e.progress = h('div', { class: 'progress' });
      this.#progress = new ProgressIndicator(e.progress);

      e.canvas = h('canvas', { class: 'crop-canvas', 'aria-label': 'Crop area. Drag the box to move it, drag its corners to resize.' });
      e.stage = h('div', { class: 'stage' }, e.canvas);
      e.rotL = h('button', { type: 'button', class: 'btn btn-ghost', title: 'Rotate left', onClick: () => this.#rotate(false) }, '⟲ Left');
      e.rotR = h('button', { type: 'button', class: 'btn btn-ghost', title: 'Rotate right', onClick: () => this.#rotate(true) }, '⟳ Right');
      e.zoom = h('input', { type: 'range', min: '1', max: String(CropSession.MAX_ZOOM), step: '0.05', value: '1', 'aria-label': 'Zoom' });
      e.zoom.addEventListener('input', () => {
        if (!this.#session) return;
        this.#session.setZoom(Number(e.zoom.value));
        this.#view.render();
      });
      e.guide = h('input', { type: 'checkbox' });
      e.guideLabel = h('label', { class: 'check' }, e.guide, ' Face guide');
      e.guide.addEventListener('change', () => (this.#view.showGuide = e.guide.checked));
      e.reset = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.#resetCrop() }, 'Reset crop');
      e.change = h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.reset() }, 'Change picture');
      e.toolbar = h('div', { class: 'toolbar' }, e.rotL, e.rotR, h('label', { class: 'zoom' }, 'Zoom ', e.zoom), e.guideLabel, e.reset, e.change);
      e.process = h('button', { type: 'button', class: 'btn btn-primary', onClick: () => this.#process() }, 'Crop & compress');
      e.hint = h('p', { class: 'hint' });
      e.enhance = h('div', { class: 'enhance-host' });
      e.preview = h('div', { class: 'preview-host' });
      e.editor = h('div', { class: 'editor', hidden: true }, e.toolbar, e.enhance, h('div', { class: 'crop-preview-layout' }, e.stage, e.preview), e.hint, e.process);
      e.result = h('div', { class: 'result', hidden: true, 'aria-live': 'polite' });

      this.#root.append(e.drop, e.progress, e.editor, e.result);
      this.#enhancePanel = new EnhancePanel({
        root: e.enhance,
        rule: this.#ruleProvider({ silent: true }),
        options: this.#options,
        onChange: (options, meta) => this.#handleEnhanceChange(options, meta),
        onTrim: () => this.#trimToSignature().catch((error) => this.#notifier.fromError(error, 'Could not trim the signature')),
        onBrushChange: (mode, size) => this.#preview.setBrush(mode, size),
        onUndoMask: () => this.#preview.undoMask(),
        onResetMask: () => this.#preview.resetMask(),
      });
      this.#preview = new PreviewRenderer({
        root: e.preview,
        pipeline: this.#pipeline,
        onError: (error) => this.#notifier.fromError(error, 'Could not update the preview'),
        onBackgroundMask: (mask, key, manual) => {
          this.#backgroundMask = mask;
          this.#backgroundMaskKey = key;
          this.#backgroundMaskManual = manual;
          this.#enhancePanel.setBackgroundWarning(mask.reason);
        },
      });

      e.file.addEventListener('change', () => {
        if (e.file.files && e.file.files[0]) this.loadFile(e.file.files[0]);
      });
      e.drop.addEventListener('keydown', (evt) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          e.file.click();
        }
      });
      for (const type of ['dragenter', 'dragover']) {
        e.drop.addEventListener(type, (evt) => {
          evt.preventDefault();
          e.drop.classList.add('drag');
        });
      }
      for (const type of ['dragleave', 'drop']) {
        e.drop.addEventListener(type, (evt) => {
          evt.preventDefault();
          e.drop.classList.remove('drag');
        });
      }
      e.drop.addEventListener('drop', (evt) => {
        const files = evt.dataTransfer && evt.dataTransfer.files;
        if (!files || !files.length) return this.#notifier.warn('No file was received. Please try dropping the picture again.');
        if (files.length > 1) this.#notifier.info('Several files were dropped; using the first one.');
        this.loadFile(files[0]);
      });
    }

    // ---- behaviour ----

    #adopt(image) {
      if (this.#original && typeof this.#original.close === 'function') this.#original.close();
      this.#releaseCanvas(this.#workingSource);
      this.#image = image;
      this.#original = image.source;
      this.#workingSource = image.source;
      this.#quarterTurns = 0;
      this.#appliedStraightenDeg = 0;
      const rule = this.#ruleProvider({ silent: true });
      const kind = rule ? rule.kind : 'custom';
      this.#options = this.#defaultOptions(rule, kind);
      this.#enhancePanel.setRule(rule);
      this.#enhancePanel.setOptions(this.#options);
      this.#backgroundMask = null;
      this.#backgroundMaskKey = null;
      this.#backgroundMaskManual = false;
      this.#session = new CropSession(image.width, image.height, this.#effectiveAspect(rule, this.#options));
      this.#els.drop.hidden = true;
      this.#els.editor.hidden = false;
      if (this.#view) this.#view.destroy();
      this.#view = new CropperView({
        canvas: this.#els.canvas,
        source: image.source,
        session: this.#session,
        onChange: () => {
          this.#els.zoom.value = String(this.#session.zoom);
          this.#clearResult();
          this.#refreshPreview();
        },
      });
      this.#els.zoom.value = '1';
      this.#els.guide.checked = false;
      this.#updateToolbar(rule);
      this.#refreshPreview();
      if (rule && rule.kind === 'signature' && this.#options.cleanup.enabled && this.#options.cleanup.autoTrim) {
        this.#trimToSignature().catch((error) => this.#notifier.fromError(error, 'Could not trim the signature'));
      }
    }

    #updateToolbar(rule) {
      this.#els.guideLabel.hidden = !(rule && rule.kind === 'photo');
      this.#els.hint.textContent = rule
        ? rule.hasFixedSize
          ? `Crop is locked to the required shape. Output: ${rule.summary()}.`
          : rule.aspectRatio
            ? 'Crop is locked to a square.'
            : 'Free crop: drag the corners to any shape.'
        : '';
    }

    #resetCrop() {
      if (!this.#session) return;
      this.#session.reset();
      this.#els.zoom.value = '1';
      this.#view.render();
      this.#clearResult();
      this.#refreshPreview();
    }

    #rotate(clockwise) {
      if (!this.#image || this.#busy) return;
      this.#quarterTurns = (this.#quarterTurns + (clockwise ? 1 : 3)) % 4;
      this.#rebuildWorkingSource().catch((error) => this.#notifier.fromError(error, 'Could not rotate the picture'));
      this.#log.info('Rotated image', { clockwise });
    }

    async #process() {
      if (this.#busy || !this.#image) return;
      const rule = this.#ruleProvider({ silent: false });
      if (!rule) return; // provider already told the user what is wrong
      if (rule.stampSpec && rule.stampSpec.required && !this.#options.stamp.name.trim()) {
        this.#notifier.error('Please type your name for the photo strip.', 'Name required');
        return;
      }

      this.#busy = true;
      this.#setDisabled(true);
      this.#clearResult();
      try {
        this.#progress.update(15, 'Cropping…');
        await this.#nextFrame();
        const crop = this.#session.crop;
        const [outW, outH] = this.#outputSize(rule, crop);
        const canvas = this.#processor.renderCrop(this.#workingSource, crop, outW, outH, rule.background);

        const enhanced = await this.#pipeline.run(canvas, {
          options: this.#options,
          aspectRatio: this.#effectiveAspect(rule, this.#options),
          rule,
          backgroundMask: this.#backgroundMaskKey === this.#maskKey(rule) ? this.#backgroundMask : null,
          onQuality: (message) => this.#notifier.warn(message, 'Image quality warning'),
          onWarning: (message) => this.#notifier.warn(message, 'Stamp text may be small'),
          onBackgroundMask: (mask) => {
            this.#backgroundMask = mask;
            this.#backgroundMaskKey = this.#maskKey(rule);
            this.#backgroundMaskManual = false;
            this.#enhancePanel.setBackgroundWarning(mask.reason);
          },
        }, (pct, label) => {
          this.#progress.update(pct, label);
        });

        this.#progress.update(null, 'Compressing…');
        const compressed = await this.#compressor.compress(enhanced, {
          mime: rule.mime,
          minBytes: rule.minBytes,
          maxBytes: rule.maxBytes,
          allowDownscale: !rule.hasFixedSize,
          onProgress: (msg) => this.#progress.update(null, msg),
        });

        const report = this.#validator.validate(
          { bytes: compressed.blob.size, mime: compressed.blob.type, width: compressed.width, height: compressed.height },
          rule
        );
        this.#result = {
          rule,
          blob: compressed.blob,
          width: compressed.width,
          height: compressed.height,
          quality: compressed.quality,
          padded: compressed.padded,
          downscaled: compressed.downscaled,
          report,
          filename: this.#fileName(rule),
          enhancementNotes: this.#enhancementNotes(),
        };
        this.#showResult(this.#result);
        this.#onResult(this.#result);

        const size = formatBytes(compressed.blob.size);
        if (report.passed) {
          this.#notifier.success(`${rule.kindLabel} is ready: ${compressed.width} × ${compressed.height} px, ${size}. Press Download.`, 'All requirements met');
        } else {
          const what = report.failures.map((c) => c.label.toLowerCase()).join(', ');
          this.#notifier.warn(`The file was created but its ${what} does not match the requirements. See the checklist below.`, 'Please review');
        }
      } catch (error) {
        this.#notifier.fromError(error, 'Could not process the picture');
      } finally {
        this.#progress.hide();
        this.#busy = false;
        this.#setDisabled(false);
      }
    }

    #outputSize(rule, crop) {
      if (rule.hasFixedSize) {
        if (rule.kind === 'photo' && this.#options.stamp.enabled) {
          return [rule.widthPx, rule.heightPx - Math.round(rule.heightPx * this.#options.stamp.heightRatio)];
        }
        return [rule.widthPx, rule.heightPx];
      }
      const longest = Math.max(crop.w, crop.h);
      const k = longest > rule.maxEdgePx ? rule.maxEdgePx / longest : 1;
      return [Math.max(1, Math.round(crop.w * k)), Math.max(1, Math.round(crop.h * k))];
    }

    #showResult(r) {
      const el = clear(this.#els.result);
      if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
      this.#previewUrl = URL.createObjectURL(r.blob);

      const notes = [];
      if (r.padded) notes.push('Harmless padding was added so the file reaches the required minimum size.');
      if (r.downscaled) notes.push('The picture was reduced slightly to fit the size limit.');
      if (r.enhancementNotes.length) notes.push(`Enhancements applied: ${r.enhancementNotes.join(' · ')}.`);

      el.append(
        h('h3', null, r.report.passed ? '✓ Ready to upload' : '⚠ Needs attention'),
        h(
          'div',
          { class: 'result-body' },
          h('img', { class: 'preview', src: this.#previewUrl, alt: `Preview of the processed ${r.rule.kindLabel.toLowerCase()}`, width: r.width, height: r.height }),
          h(
            'div',
            { class: 'result-info' },
            h(
              'ul',
              { class: 'checks' },
              r.report.checks.map((c) =>
                h(
                  'li',
                  { class: c.ok ? 'ok' : 'bad' },
                  h('span', { class: 'mark', 'aria-hidden': 'true' }, c.ok ? '✓' : '✕'),
                  h('span', { class: 'check-label' }, c.label),
                  h('span', { class: 'check-values' }, `${c.actual} `, h('em', null, `(needs ${c.expected})`)),
                  h('span', { class: 'sr-only' }, c.ok ? ' — passed' : ' — failed')
                )
              )
            ),
            notes.map((n) => h('p', { class: 'note' }, n)),
            h(
              'div',
              { class: 'result-actions' },
              h('button', { type: 'button', class: 'btn btn-primary', onClick: () => this.#download() }, `Download ${r.filename}`),
              h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => this.#clearResult() }, 'Adjust crop')
            )
          )
        )
      );
      el.hidden = false;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    #download() {
      if (!this.#result) return;
      try {
        downloadBlob(this.#result.blob, this.#result.filename);
        this.#log.info('Downloaded', { extension: this.#result.filename.split('.').pop(), bytes: this.#result.blob.size });
        this.#notifier.success(`${this.#result.filename} saved to your downloads.`, 'Downloaded');
      } catch (error) {
        this.#notifier.fromError(error, 'Download failed');
      }
    }

    #clearResult() {
      this.#result = null;
      if (this.#previewUrl) URL.revokeObjectURL(this.#previewUrl);
      this.#previewUrl = null;
      this.#els.result.hidden = true;
      clear(this.#els.result);
    }

    #setDisabled(disabled) {
      for (const key of ['process', 'rotL', 'rotR', 'reset', 'change', 'zoom', 'guide']) this.#els[key].disabled = disabled;
      this.#els.file.disabled = disabled;
      for (const control of this.#els.enhance.querySelectorAll('input, button, select')) control.disabled = disabled;
    }

    #handleEnhanceChange(options, { previewOnly, maskSettingsChanged = false } = {}) {
      const previous = this.#options;
      if (maskSettingsChanged && this.#backgroundMaskManual &&
          !window.confirm('Changing background sensitivity or edge softness discards your manual mask edits. Continue?')) {
        this.#enhancePanel.setOptions(previous);
        return;
      }
      if (maskSettingsChanged) {
        this.#backgroundMask = null;
        this.#backgroundMaskKey = null;
        this.#backgroundMaskManual = false;
      }
      const straightenChanged = options.straightenDeg !== this.#appliedStraightenDeg;
      this.#options = options;
      if (this.#options.stamp.name !== previous.stamp.name) this.#storage.set('lastStampName', this.#options.stamp.name);
      this.#clearResult();
      const rule = this.#ruleProvider({ silent: true });
      if (this.#session && rule) {
        this.#session.setAspect(this.#effectiveAspect(rule, options));
        this.#view.render();
      }
      if (previewOnly && straightenChanged) {
        this.#els.canvas.style.transform = `rotate(${options.straightenDeg}deg)`;
        this.#view.alignmentGrid = true;
        return;
      }
      if (straightenChanged && this.#image) {
        this.#els.canvas.style.transform = '';
        this.#view.alignmentGrid = false;
        clearTimeout(this.#straightenTimer);
        this.#straightenTimer = setTimeout(() => {
          this.#rebuildWorkingSource().catch((error) => this.#notifier.fromError(error, 'Could not straighten the picture'));
        }, 150);
        return;
      }
      if (options.kind === 'signature' && options.cleanup.enabled && options.cleanup.autoTrim &&
          (!previous.cleanup.enabled || !previous.cleanup.autoTrim)) {
        this.#trimToSignature().catch((error) => this.#notifier.fromError(error, 'Could not trim the signature'));
      }
      this.#refreshPreview();
    }

    async #trimToSignature() {
      if (!this.#workingSource || !this.#session) return;
      const rule = this.#ruleProvider({ silent: true });
      if (!rule || rule.kind !== 'signature') return;
      this.#progress.update(null, 'Finding the signature…');
      const timer = new NS.PerfTimer('signature-auto-trim');
      let sample;
      try {
        const scale = Math.min(1, 1000 / Math.max(this.#workingSource.width, this.#workingSource.height));
        const width = Math.max(1, Math.round(this.#workingSource.width * scale));
        const height = Math.max(1, Math.round(this.#workingSource.height * scale));
        sample = document.createElement('canvas');
        sample.width = width;
        sample.height = height;
        const context = sample.getContext('2d', { willReadFrequently: true });
        context.drawImage(this.#workingSource, 0, 0, width, height);
        const result = this.#inkExtractor.extract(context.getImageData(0, 0, width, height), {
          ...this.#options.cleanup,
          autoTrim: true,
          aspectRatio: rule.aspectRatio,
        });
        if (result.reason) this.#notifier.warn(result.reason, 'Signature may need attention');
        if (!result.crop) {
          if (!result.reason) this.#notifier.warn('No signature marks were found to trim around.', 'Signature not found');
          return;
        }
        this.#session.setCrop({
          x: result.crop.x / scale,
          y: result.crop.y / scale,
          w: result.crop.w / scale,
          h: result.crop.h / scale,
        });
        this.#view.render();
        this.#els.zoom.value = String(this.#session.zoom);
        this.#clearResult();
        this.#refreshPreview();
        this.#log.info('Trimmed crop to signature', { quality: result.quality, inkRatio: result.inkRatio });
      } finally {
        if (sample) this.#releaseCanvas(sample);
        timer.finish();
        if (!this.#busy) this.#progress.hide();
      }
    }

    async #rebuildWorkingSource() {
      if (!this.#original || !this.#image || this.#busy) return;
      this.#busy = true;
      this.#setDisabled(true);
      this.#progress.update(null, 'Preparing image…');
      await this.#nextFrame();
      let source = this.#original;
      let width = this.#image.width;
      let height = this.#image.height;
      const created = [];
      try {
        if (Math.max(width, height) > 4000) {
          source = this.#processor.scaleToFit(source, width, height, 4000);
          created.push(source);
          width = source.width;
          height = source.height;
          this.#log.info('Downscaled working copy before rotation', { width, height });
        }
        for (let turn = 0; turn < this.#quarterTurns; turn++) {
          const rotated = this.#processor.rotate90(source, width, height, true);
          if (created.length) this.#releaseCanvas(created.pop());
          created.push(rotated);
          source = rotated;
          width = rotated.width;
          height = rotated.height;
        }
        if (this.#options.straightenDeg !== 0) {
          const rotated = this.#processor.straighten(source, width, height, this.#options.straightenDeg, '#ffffff');
          if (created.length) this.#releaseCanvas(created.pop());
          created.push(rotated);
          source = rotated;
        }
        const previous = this.#workingSource;
        this.#workingSource = source;
        const rule = this.#ruleProvider({ silent: true });
        this.#session = new CropSession(source.width, source.height, this.#effectiveAspect(rule, this.#options));
        this.#view.setSource(source, this.#session);
        this.#els.zoom.value = '1';
        this.#appliedStraightenDeg = this.#options.straightenDeg;
        this.#els.canvas.style.transform = '';
        this.#view.alignmentGrid = false;
        if (previous !== this.#original) this.#releaseCanvas(previous);
        this.#refreshPreview();
        this.#log.info('Working image recomputed', { width: source.width, height: source.height, straightenDeg: this.#appliedStraightenDeg, quarterTurns: this.#quarterTurns });
      } catch (error) {
        for (const canvas of created) this.#releaseCanvas(canvas);
        throw error;
      } finally {
        this.#progress.hide();
        this.#busy = false;
        this.#setDisabled(false);
      }
    }

    #refreshPreview() {
      if (!this.#preview || !this.#workingSource || !this.#session) return;
      const rule = this.#ruleProvider({ silent: true });
      this.#preview.update({
        source: this.#workingSource,
        crop: this.#session.crop,
        rule,
        options: this.#options,
        maskKey: this.#maskKey(rule),
      });
    }

    #effectiveAspect(rule, options) {
      if (!rule) return null;
      if (options && options.stamp.enabled && rule.kind === 'photo' && typeof rule.effectiveAspect === 'function') {
        return rule.effectiveAspect(options.stamp.heightRatio);
      }
      return rule.aspectRatio;
    }

    #maskKey(rule) {
      const crop = this.#session && this.#session.crop;
      return crop
        ? `${this.#image && this.#image.width}:${this.#image && this.#image.height}:${this.#quarterTurns}:${this.#appliedStraightenDeg}:${crop.x}:${crop.y}:${crop.w}:${crop.h}:${rule ? rule.id : ''}`
        : null;
    }

    #enhancementNotes() {
      const notes = [];
      if (this.#options.brightness) notes.push(`Brightness ${this.#options.brightness > 0 ? '+' : ''}${this.#options.brightness}`);
      if (this.#options.contrast) notes.push(`Contrast ${this.#options.contrast > 0 ? '+' : ''}${this.#options.contrast}`);
      if (this.#options.autoLevels) notes.push('Auto-enhance');
      if (this.#appliedStraightenDeg) notes.push(`Straighten ${this.#appliedStraightenDeg}°`);
      if (this.#options.kind === 'signature' && this.#options.cleanup.enabled) notes.push('Signature cleanup');
      if (this.#options.kind === 'photo' && this.#options.background.enabled) notes.push('Background replacement');
      if (this.#options.kind === 'photo' && this.#options.stamp.enabled) notes.push('Name/date strip');
      return notes;
    }

    #releaseCanvas(canvas) {
      if (canvas && typeof canvas.getContext === 'function') {
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    #nextFrame() {
      return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
    }
  }

  NS.Workspace = Workspace;
})(typeof window !== 'undefined' ? window : globalThis);
