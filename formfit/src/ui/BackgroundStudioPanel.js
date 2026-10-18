(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { h, downloadBlob } = NS.dom;

  class BackgroundStudioPanel {
    #root;
    #notifier;
    #service;
    #storage;
    #loader = new NS.ImageLoader();
    #progress;
    #controller = null;
    #source = null;
    #cutout = null;
    #brush = null;
    #original;
    #result;
    #resultCanvas;
    #brushCursor;
    #fileBase = 'portrait';
    #controls = {};
    #type = 'solid';
    #color = '#FFFFFF';
    #imageBackground = null;
    #edge = { edgeShift: 0, feather: 1, smooth: 30 };
    #defringe = true;
    #lastPoint = null;
    #touchupActive = false;
    #originalBackground = false;

    constructor({ root, notifier, cutoutService, storage }) {
      this.#root = root;
      this.#notifier = notifier;
      this.#service = cutoutService;
      this.#storage = storage;
      this.#build();
    }

    #setTouchup(active) {
      if (active && !this.#brush) {
        this.#controls.touchup.checked = false;
        this.#controls.touchupStatus.textContent = 'Remove the background first, then use Touch-up to fix edges.';
        this.#notifier.warn('Remove the background first, then use Touch-up to fix edges.');
        active = false;
      }
      this.#touchupActive = Boolean(active);
      this.#controls.touchup.checked = this.#touchupActive;
      this.#controls.touchupStatus.textContent = this.#touchupActive
        ? `Touch-up on · ${this.#controls.brushMode.value === 'erase' ? 'Erase mask' : 'Restore mask'} · photo colours are never painted.`
        : 'Touch-up off · the photo is not being edited by pointer drags.';
      this.#resultCanvas.classList.toggle('touchup-active', this.#touchupActive);
      this.#brushCursor.hidden = !this.#touchupActive;
      this.#updateBrushCursor();
    }

    #touchupKeydown(event) {
      if (!this.#root.contains(document.activeElement) || this.#isTextInput(document.activeElement)) return;
      if (event.key === 'Escape' && this.#touchupActive) {
        this.#setTouchup(false);
      } else if (event.key.toLowerCase() === 'e' || event.key.toLowerCase() === 'r') {
        if (!this.#brush) return;
        this.#controls.brushMode.value = event.key.toLowerCase() === 'e' ? 'erase' : 'restore';
        this.#setTouchup(true);
      } else if (event.key === '[' || event.key === ']') {
        const size = this.#controls.brushSize;
        size.value = String(Math.max(Number(size.min), Math.min(Number(size.max), Number(size.value) + (event.key === ']' ? 5 : -5))));
        this.#updateBrushCursor();
      }
    }

    #isTextInput(element) {
      return element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName));
    }

    #moveBrushCursor(event) {
      if (!this.#touchupActive) return;
      const rect = this.#brushCursor.parentElement.getBoundingClientRect();
      this.#brushCursor.style.left = `${event.clientX - rect.left}px`;
      this.#brushCursor.style.top = `${event.clientY - rect.top}px`;
    }

    #updateBrushCursor() {
      if (!this.#brushCursor || !this.#resultCanvas) return;
      const rect = this.#resultCanvas.getBoundingClientRect();
      const scale = this.#resultCanvas.width ? rect.width / this.#resultCanvas.width : 1;
      const diameter = Number(this.#controls.brushSize.value || 32) * scale;
      this.#brushCursor.style.width = `${diameter}px`;
      this.#brushCursor.style.height = `${diameter}px`;
      this.#brushCursor.classList.toggle('restore', this.#controls.brushMode.value === 'restore');
    }

    #build() {
      const c = this.#controls;
      const fileInput = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
      const progressHost = h('div', { class: 'progress', hidden: true });
      this.#progress = new NS.ProgressIndicator(progressHost);
      const cancel = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, onClick: () => this.#cancel() }, 'Cancel');
      this.#controls.cancel = cancel;
      const upload = h('label', { class: 'dropzone', tabindex: '0' },
        h('span', { class: 'drop-icon', 'aria-hidden': 'true' }, '＋'),
        h('strong', null, 'Choose or drop a portrait'),
        h('small', null, 'JPG, PNG or WebP · up to 30 MB · processed on this device'),
        fileInput);
      upload.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
      });
      upload.addEventListener('dragover', (event) => { event.preventDefault(); upload.classList.add('drag'); });
      upload.addEventListener('dragleave', () => upload.classList.remove('drag'));
      upload.addEventListener('drop', (event) => {
        event.preventDefault();
        upload.classList.remove('drag');
        this.#open(event.dataTransfer.files[0]);
      });
      fileInput.addEventListener('change', () => this.#open(fileInput.files[0]));

      this.#resultCanvas = h('canvas', { class: 'ai-preview', 'aria-label': 'Background removal preview' });
      this.#resultCanvas.hidden = true;
      c.resultCanvas = this.#resultCanvas;
      this.#brushCursor = h('span', { class: 'brush-cursor', hidden: true, 'aria-hidden': 'true' });
      const stage = h('div', { class: 'stage ai-stage' }, this.#resultCanvas, this.#brushCursor);
      const hold = h('button', { class: 'btn btn-ghost compare-button', type: 'button', disabled: true }, 'Hold to see original');
      c.hold = hold;
      hold.addEventListener('pointerdown', () => this.#showOriginal());
      for (const eventName of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(eventName, () => this.#render());
      const preview = h('div', { class: 'ai-preview-column' }, stage, hold);

      c.hex = h('input', { type: 'text', value: this.#color, maxlength: '7', 'aria-label': 'Background colour hex value' });
      c.color = h('input', { type: 'color', value: this.#color, 'aria-label': 'Choose custom background colour' });
      c.gradientFrom = h('input', { type: 'color', value: '#DCEBFA', 'aria-label': 'Gradient start colour' });
      c.gradientTo = h('input', { type: 'color', value: '#FFFFFF', 'aria-label': 'Gradient end colour' });
      c.gradientAngle = h('input', { type: 'range', min: '0', max: '360', value: '90', 'aria-label': 'Gradient angle' });
      c.blur = h('input', { type: 'range', min: '4', max: '40', value: '16', 'aria-label': 'Blur amount' });
      c.bgImage = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', hidden: true });
      c.fit = h('select', { 'aria-label': 'Background image fit' }, h('option', { value: 'cover' }, 'Cover'), h('option', { value: 'contain' }, 'Contain'));
      c.brushMode = h('select', { 'aria-label': 'Brush mode' }, h('option', { value: 'erase' }, 'Erase · remove foreground'), h('option', { value: 'restore' }, 'Restore · bring back foreground'));
      c.brushSize = h('input', { type: 'range', min: '5', max: '120', value: '32', 'aria-label': 'Brush size in image pixels' });
      c.hardness = h('input', { type: 'range', min: '0', max: '100', value: '80', 'aria-label': 'Brush hardness' });
      c.edge = h('input', { type: 'range', min: '-3', max: '3', step: '0.2', value: '0', 'aria-label': 'Edge shift' });
      c.feather = h('input', { type: 'range', min: '0', max: '4', step: '0.2', value: '1', 'aria-label': 'Edge feather' });
      c.smooth = h('input', { type: 'range', min: '0', max: '100', value: '30', 'aria-label': 'Edge smoothing' });
      c.defringe = h('input', { type: 'checkbox', checked: true });
      c.format = h('select', { 'aria-label': 'Download format' },
        h('option', { value: 'image/png' }, 'PNG · transparent ready'),
        h('option', { value: 'image/jpeg' }, 'JPEG'),
        ...(this.#webpAvailable() ? [h('option', { value: 'image/webp' }, 'WebP')] : []));
      c.size = h('select', { 'aria-label': 'Output image size' },
        h('option', { value: 'original' }, 'Original dimensions'),
        h('option', { value: '1080' }, 'Longest edge 1080 px'),
        h('option', { value: '2048' }, 'Longest edge 2048 px'));
      c.sizePreset = h('select', { 'aria-label': 'Generic output size preset' },
        ...NS.PhotoPresets.map((preset) => h('option', { value: preset.id }, preset.label)));
      c.sizeDescription = h('p', { class: 'hint' }, NS.PhotoPresets[0].description);
      c.outputWidth = h('input', { type: 'number', min: '1', step: 'any', 'aria-label': 'Output width' });
      c.outputHeight = h('input', { type: 'number', min: '1', step: 'any', 'aria-label': 'Output height' });
      c.outputUnit = h('select', { 'aria-label': 'Output dimension unit' },
        h('option', { value: 'px' }, 'px'), h('option', { value: 'mm' }, 'mm'),
        h('option', { value: 'cm' }, 'cm'), h('option', { value: 'in' }, 'in'));
      c.outputDpi = h('input', { type: 'number', min: '1', max: '2400', value: '300', 'aria-label': 'Output DPI' });
      c.download = h('button', { class: 'btn btn-primary', type: 'button', disabled: true, onClick: () => this.#download() }, 'Download image');
      c.reset = h('button', { class: 'btn btn-secondary', type: 'button', onClick: () => this.#reset() }, 'Start over');
      c.undo = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, onClick: () => { if (this.#brush && this.#brush.undo()) this.#render(); } }, 'Undo');
      c.redo = h('button', { class: 'btn btn-ghost', type: 'button', disabled: true, onClick: () => { if (this.#brush && this.#brush.redo()) this.#render(); } }, 'Redo');
      c.touchup = h('input', { type: 'checkbox', 'aria-label': 'Turn mask touch-up on or off' });
      c.touchupStatus = h('p', { class: 'hint touchup-status', role: 'status', 'aria-live': 'polite' }, 'Touch-up off · the photo is not being edited by pointer drags.');

      const swatches = NS.BackgroundColors.map((swatch) => {
        const radio = h('input', { type: 'radio', name: 'studio-swatch', value: swatch.hex, checked: swatch.hex === this.#color });
        radio.addEventListener('change', () => { this.#originalBackground = false; this.#color = swatch.hex; c.hex.value = swatch.hex; c.color.value = swatch.hex; this.#render(); });
        return h('label', { class: 'ai-swatch', title: swatch.name, style: `--swatch:${swatch.hex}` }, radio, h('span', { class: 'sr-only' }, swatch.name));
      });
      const types = [
        ['solid', 'Colour'], ['transparent', 'Transparent'], ['gradient', 'Gradient'],
        ['blur', 'Blur original'], ['image', 'My image'],
      ].map(([value, label]) => {
        const radio = h('input', { type: 'radio', name: 'studio-background', value, checked: value === 'solid' });
        radio.addEventListener('change', () => { this.#originalBackground = false; this.#type = value; this.#render(); });
        return h('label', { class: 'choice-chip' }, radio, label);
      });
      c.restoreBackground = h('button', {
        class: 'btn btn-ghost', type: 'button', disabled: true,
        onClick: () => this.#restoreOriginalBackground(),
      }, 'Restore original background');

      const sizeAndCrop = h('details', { class: 'enhance-details', open: true },
        h('summary', null, 'Size & Crop'),
        h('div', { class: 'enhance-body' },
          this.#field('Size preset', c.sizePreset),
          c.sizeDescription,
          h('div', { class: 'form-grid' },
            this.#field('Width', c.outputWidth),
            this.#field('Height', c.outputHeight),
            this.#field('Unit', c.outputUnit),
            this.#field('DPI', c.outputDpi)),
          this.#field('Maximum longest edge', c.size),
          h('p', { class: 'hint' }, 'Need the exact size for a specific exam? Use Exam Photos → Exam Photo Resizer.')
        ));

      const background = h('details', { class: 'enhance-details', open: true },
        h('summary', null, 'Background'),
        h('div', { class: 'enhance-body' },
          h('fieldset', { class: 'choice-group' }, h('legend', null, 'Background type'), types),
          h('div', { class: 'ai-swatches', role: 'radiogroup', 'aria-label': 'Background colour' }, swatches),
          h('div', { class: 'form-grid' },
            this.#field('Custom colour', h('span', { class: 'ai-colour-row' }, c.color, c.hex)),
            this.#field('Gradient colours', h('span', { class: 'ai-colour-row' }, c.gradientFrom, c.gradientTo)),
            this.#field('Gradient angle', c.gradientAngle),
            this.#field('Blur radius', c.blur),
            this.#field('Background image', h('span', null, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => c.bgImage.click() }, 'Choose image'), c.bgImage, c.fit))
          ),
          c.restoreBackground,
          h('p', { class: 'hint' }, 'Transparent backgrounds require PNG or WebP. JPEG always uses a solid background.')
        ));

      const edges = h('details', { class: 'enhance-details', open: true },
        h('summary', null, 'Edges'),
        h('div', { class: 'enhance-body' },
          this.#field('Edge shift · positive grows the subject', c.edge),
          this.#field('Feather · softens the edge', c.feather),
          this.#field('Smooth · reduces small edge noise', c.smooth),
          h('label', { class: 'check' }, c.defringe, 'Remove old background colour halo'),
          h('p', { class: 'hint' }, 'The higher-quality guided edge filter is available for careful refinement.')
        ));

      const touchup = h('details', { class: 'enhance-details' },
        h('summary', null, 'Touch-up'),
        h('div', { class: 'enhance-body' },
          h('label', { class: 'check touchup-toggle' }, c.touchup, 'Touch-up on/off'),
          c.touchupStatus,
          this.#field('Brush', c.brushMode),
          this.#field('Brush size (image pixels)', c.brushSize),
          this.#field('Hardness', c.hardness),
          h('div', { class: 'toolbar' }, c.undo, c.redo,
            h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => {
              if (this.#brush && this.#cutout && confirm('Reset all touch-up strokes?')) { this.#brush.reset(this.#cutout.alpha); this.#render(); }
            } }, 'Reset touch-up'))
        ));

      const output = h('details', { class: 'enhance-details', open: true },
        h('summary', null, 'Output'),
        h('div', { class: 'enhance-body' },
          this.#field('Format', c.format),
          h('p', { class: 'hint', 'aria-live': 'polite' }, 'No photo or edits are stored.'),
          h('div', { class: 'toolbar' }, c.download, c.reset)
        ));

      const controls = h('div', { class: 'ai-controls' }, sizeAndCrop, background, edges, touchup, output);
      const fileProtocol = root.location.protocol === 'file:';
      this.#root.append(
        h('div', { class: 'ai-page' },
          h('div', { class: 'ai-heading' },
            h('div', null, h('p', { class: 'hero-kicker' }, 'PHOTO TOOLS · LOCAL PROCESSING'), h('h2', null, 'Photo Editor'),
              h('p', { class: 'muted' }, 'Remove or replace a background, refine your photo and download an edited copy.')),
            h('div', { class: 'ai-model-status', role: 'status', 'aria-live': 'polite' },
              fileProtocol
                ? 'Needs a local web address (file:// does not support the AI worker).'
                : `AI model: ready to load locally · ${(NS.ModelManifest.bytes / 1048576).toFixed(1)} MB`)
          ),
          ...(fileProtocol ? [h('div', { class: 'authority-notice', role: 'note' }, 'AI tools need the app opened through a local web address. Run `npm run serve` in the project folder and open http://localhost:8080. Basic background removal is still available here.')] : []),
          upload,
          h('div', { class: 'ai-progress-row' }, progressHost, cancel),
          h('div', { class: 'ai-workspace' }, preview, controls)
        )
      );
      c.color.addEventListener('input', () => { this.#originalBackground = false; this.#color = c.color.value.toUpperCase(); c.hex.value = this.#color; this.#render(); });
      c.hex.addEventListener('change', () => {
        if (!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c.hex.value)) {
          this.#notifier.error('Enter a colour like #DCEBFA.', 'Invalid colour');
          c.hex.value = this.#color;
          return;
        }
        this.#originalBackground = false;
        this.#color = c.hex.value.toUpperCase();
        c.color.value = this.#color.length === 4 ? `#${[...this.#color.slice(1)].map((x) => x + x).join('')}` : this.#color;
        this.#render();
      });
      c.bgImage.addEventListener('change', () => this.#loadBackground(c.bgImage.files[0]));
      c.fit.addEventListener('change', () => this.#render());
      c.gradientFrom.addEventListener('input', () => this.#render());
      c.gradientTo.addEventListener('input', () => this.#render());
      c.gradientAngle.addEventListener('input', () => this.#render());
      c.blur.addEventListener('input', () => this.#render());
      c.edge.addEventListener('input', () => { this.#edge.edgeShift = Number(c.edge.value); this.#render(); });
      c.feather.addEventListener('input', () => { this.#edge.feather = Number(c.feather.value); this.#render(); });
      c.smooth.addEventListener('input', () => { this.#edge.smooth = Number(c.smooth.value); this.#render(); });
      c.defringe.addEventListener('change', () => { this.#defringe = c.defringe.checked; this.#render(); });
      c.format.addEventListener('change', () => { if (this.#type === 'transparent' && c.format.value === 'image/jpeg') c.format.value = 'image/png'; });
      c.touchup.addEventListener('change', () => this.#setTouchup(c.touchup.checked));
      c.resultCanvas.addEventListener('pointerdown', (event) => this.#brushStart(event));
      c.resultCanvas.addEventListener('pointermove', (event) => this.#brushMove(event));
      for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) c.resultCanvas.addEventListener(eventName, () => this.#brushEnd());
      c.brushMode.addEventListener('change', () => {
        if (this.#touchupActive) this.#setTouchup(true);
        this.#updateBrushCursor();
      });
      c.brushSize.addEventListener('input', () => this.#updateBrushCursor());
      c.sizePreset.addEventListener('change', () => this.#applySizePreset());
      for (const control of [c.outputWidth, c.outputHeight, c.outputUnit, c.outputDpi]) {
        control.addEventListener('input', () => {
          if (c.sizePreset.value !== 'custom' && c.sizePreset.value !== 'original') c.sizePreset.value = 'custom';
          if (c.sizePreset.value === 'custom') c.sizeDescription.textContent = NS.PhotoPresets.find((preset) => preset.id === 'custom').description;
        });
      }
      document.addEventListener('keydown', (event) => this.#touchupKeydown(event));
    }

    #applySizePreset() {
      const preset = NS.PhotoPresets.find((entry) => entry.id === this.#controls.sizePreset.value);
      if (!preset) return;
      this.#controls.outputWidth.value = preset.width == null ? '' : String(preset.width);
      this.#controls.outputHeight.value = preset.height == null ? '' : String(preset.height);
      this.#controls.outputUnit.value = preset.unit || 'px';
      this.#controls.outputDpi.value = String(preset.dpi || 300);
      this.#controls.sizeDescription.textContent = preset.description;
    }

    #outputDimensions() {
      const { outputWidth, outputHeight, outputUnit, outputDpi } = this.#controls;
      if (!outputWidth.value && !outputHeight.value) return null;
      if (!outputWidth.value || !outputHeight.value) {
        throw new NS.ValidationError('Enter both output width and height, or clear both to keep the original dimensions.');
      }
      const width = NS.PhotoPresetMath.toPixels(outputWidth.value, outputUnit.value, outputDpi.value);
      const height = NS.PhotoPresetMath.toPixels(outputHeight.value, outputUnit.value, outputDpi.value);
      if (width * height > 36000000) throw new NS.ValidationError('Choose output dimensions below 36 megapixels.');
      return { width, height };
    }

    #field(label, control) {
      return h('label', { class: 'field' }, h('span', null, label), control);
    }

    async #open(file) {
      if (!file) return;
      this.#cancel();
      this.#controller = new AbortController();
      this.#controls.cancel.disabled = false;
      this.#progress.update(null, 'Reading your picture…');
      this.#controls.download.disabled = true;
      try {
        const loaded = await this.#loader.load(file, (percent, label) => this.#progress.update(percent, label), { signal: this.#controller.signal });
        this.#fileBase = this.#sanitize(file.name);
        this.#original = this.#rasterize(loaded.source, loaded.width, loaded.height);
        if (loaded.source && typeof loaded.source.close === 'function') loaded.source.close();
        this.#source = { data: new Uint8ClampedArray(this.#original.data), width: this.#original.width, height: this.#original.height };
        this.#originalBackground = false;
        this.#resultCanvas.width = this.#source.width;
        this.#resultCanvas.height = this.#source.height;
        this.#resultCanvas.hidden = false;
        this.#progress.update(null, 'Removing the background… this runs on your device; nothing is uploaded.');
        const cutout = await this.#service.remove(this.#source, {
          signal: this.#controller.signal,
          allowAI: root.location.protocol !== 'file:',
          onProgress: (percent, label) => this.#progress.update(percent, label),
        });
        this.#cutout = cutout;
        this.#brush = new NS.BrushMask(cutout.alpha, cutout.width, cutout.height);
        this.#controls.download.disabled = false;
        this.#controls.hold.disabled = false;
        this.#controls.restoreBackground.disabled = false;
        this.#controls.undo.disabled = true;
        this.#controls.redo.disabled = true;
        this.#render();
        this.#setTouchup(false);
        if (cutout.mode === 'basic') this.#notifier.warn('The AI model could not be loaded, so basic mode was used. It works best on plain backgrounds.', 'Basic mode');
        else if (cutout.quality === 'poor') this.#notifier.warn(cutout.reason, 'No clear subject found');
        else this.#notifier.success('Background removed. Pick a colour on the right, then download.');
      } catch (error) {
        if (error.code === 'CANCELLED') this.#notifier.info('Cancelled. Nothing was changed.');
        else this.#notifier.fromError(error);
        this.#resultCanvas.hidden = true;
      } finally {
        this.#progress.hide();
        this.#controls.cancel.disabled = true;
        this.#controller = null;
      }
    }

    #rasterize(source, width, height) {
      const scale = Math.min(1, 1600 / Math.max(width, height), Math.sqrt(36000000 / (width * height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const data = context.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = canvas.height = 0;
      return data;
    }

    async #loadBackground(file) {
      if (!file) return;
      try {
        const loaded = await this.#loader.load(file);
        this.#imageBackground = this.#rasterize(loaded.source, loaded.width, loaded.height);
        if (loaded.source && typeof loaded.source.close === 'function') loaded.source.close();
        this.#originalBackground = false;
        this.#type = 'image';
        const radio = this.#root.querySelector('input[name="studio-background"][value="image"]');
        if (radio) radio.checked = true;
        this.#render();
      } catch (error) {
        this.#notifier.fromError(error);
      }
    }

    #background() {
      if (this.#type === 'transparent') return { type: 'transparent' };
      if (this.#type === 'gradient') return { type: 'gradient', from: this.#controls.gradientFrom.value, to: this.#controls.gradientTo.value, angle: Number(this.#controls.gradientAngle.value) };
      if (this.#type === 'blur') return { type: 'blur', imageData: this.#original, radius: Number(this.#controls.blur.value) };
      if (this.#type === 'image' && this.#imageBackground) return { type: 'image', imageData: this.#imageBackground, fit: this.#controls.fit.value };
      return { type: 'solid', color: this.#color };
    }

    #render() {
      if (!this.#cutout || !this.#brush) return;
      if (this.#originalBackground) {
        this.#result = {
          width: this.#original.width,
          height: this.#original.height,
          data: new Uint8ClampedArray(this.#original.data),
        };
      } else {
        const alpha = this.#brush.alpha;
        const refined = NS.AlphaRefiner.refine(alpha, this.#cutout.width, this.#cutout.height, this.#edge);
        this.#result = NS.Compositor.composite(this.#cutout, refined, this.#background(), { defringe: this.#defringe });
      }
      this.#resultCanvas.width = this.#result.width;
      this.#resultCanvas.height = this.#result.height;
      const context = this.#resultCanvas.getContext('2d');
      context.putImageData(new ImageData(this.#result.data, this.#result.width, this.#result.height), 0, 0);
      const jpeg = this.#controls.format.querySelector('option[value="image/jpeg"]');
      jpeg.disabled = this.#type === 'transparent';
      if (jpeg.disabled && this.#controls.format.value === 'image/jpeg') this.#controls.format.value = 'image/png';
      this.#controls.touchup.disabled = this.#originalBackground;
      this.#controls.undo.disabled = !this.#brush.canUndo;
      this.#controls.redo.disabled = !this.#brush.canRedo;
      this.#updateBrushCursor();
    }

    #showOriginal() {
      if (!this.#original) return;
      const context = this.#resultCanvas.getContext('2d');
      context.putImageData(this.#original, 0, 0);
    }

    #restoreOriginalBackground() {
      if (!this.#original) return;
      this.#originalBackground = true;
      this.#type = 'solid';
      const solidRadio = this.#root.querySelector('input[name="studio-background"][value="solid"]');
      if (solidRadio) solidRadio.checked = true;
      this.#setTouchup(false);
      this.#render();
    }

    #brushStart(event) {
      if (!this.#touchupActive || !this.#brush || event.button !== 0) return;
      event.preventDefault();
      this.#resultCanvas.setPointerCapture(event.pointerId);
      const point = this.#point(event);
      this.#brush.stroke(point, point, {
        radius: Number(this.#controls.brushSize.value),
        hardness: Number(this.#controls.hardness.value),
        mode: this.#controls.brushMode.value,
      });
      this.#lastPoint = point;
    }

    #brushMove(event) {
      this.#moveBrushCursor(event);
      if (!this.#touchupActive || !this.#brush || !this.#resultCanvas.hasPointerCapture(event.pointerId)) return;
      const current = this.#point(event);
      if (!this.#lastPoint) { this.#lastPoint = current; return; }
      this.#brush.stroke(this.#lastPoint, current, {
        radius: Number(this.#controls.brushSize.value),
        hardness: Number(this.#controls.hardness.value),
        mode: this.#controls.brushMode.value,
      });
      this.#lastPoint = current;
    }

    #brushEnd() {
      if (this.#lastPoint) this.#render();
      this.#lastPoint = null;
    }

    #point(event) {
      const rect = this.#resultCanvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left) * this.#resultCanvas.width / rect.width,
        y: (event.clientY - rect.top) * this.#resultCanvas.height / rect.height,
      };
    }

    async #download() {
      if (!this.#result) return;
      try {
        const mime = this.#type === 'transparent' && this.#controls.format.value === 'image/jpeg'
          ? 'image/png'
          : this.#controls.format.value;
        const target = this.#outputDimensions();
        const maxEdge = this.#controls.size.value === 'original' ? Infinity : Number(this.#controls.size.value);
        const scale = Math.min(1, maxEdge / Math.max(this.#result.width, this.#result.height));
        const width = target ? target.width : Math.max(1, Math.round(this.#result.width * scale));
        const height = target ? target.height : Math.max(1, Math.round(this.#result.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (this.#type !== 'transparent') {
          context.fillStyle = this.#type === 'solid' ? this.#color : '#FFFFFF';
          context.fillRect(0, 0, width, height);
        }
        const source = document.createElement('canvas');
        source.width = this.#result.width;
        source.height = this.#result.height;
        source.getContext('2d').putImageData(new ImageData(this.#result.data, this.#result.width, this.#result.height), 0, 0);
        const fit = Math.min(width / source.width, height / source.height);
        const drawWidth = source.width * fit;
        const drawHeight = source.height * fit;
        context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
        source.width = source.height = 0;
        const blob = await this.#toBlob(canvas, mime);
        canvas.width = canvas.height = 0;
        const ext = mime === 'image/jpeg' ? 'jpg' : mime.slice(6);
        const fileName = `${this.#fileBase}-edited.${ext}`;
        downloadBlob(blob, fileName);
        this.#notifier.success(`Downloaded ${fileName} (${blob.size} bytes).`);
      } catch (error) {
        this.#notifier.fromError(error);
      }
    }

    #toBlob(canvas, mime) {
      return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new NS.ExportError('Could not encode image')), mime, 0.92);
      });
    }

    #cancel() {
      if (!this.#controller) return;
      this.#controller.abort();
      this.#service.cancel();
    }

    #reset() {
      this.#cancel();
      this.#service.clear();
      this.#source = this.#cutout = this.#brush = this.#result = this.#original = null;
      this.#originalBackground = false;
      if (this.#imageBackground) this.#imageBackground = null;
      this.#resultCanvas.width = this.#resultCanvas.height = 0;
      this.#resultCanvas.hidden = true;
      this.#setTouchup(false);
      this.#controls.download.disabled = true;
      this.#controls.hold.disabled = true;
      this.#controls.restoreBackground.disabled = true;
      this.#controls.undo.disabled = true;
      this.#controls.redo.disabled = true;
      this.#progress.hide();
    }

    #sanitize(fileName) {
      return String(fileName || 'portrait').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'portrait';
    }

    #webpAvailable() {
      const canvas = document.createElement('canvas');
      const supported = canvas.toDataURL('image/webp').startsWith('data:image/webp');
      canvas.width = canvas.height = 0;
      return supported;
    }
  }

  NS.BackgroundStudioPanel = BackgroundStudioPanel;
})(typeof window !== 'undefined' ? window : globalThis);
