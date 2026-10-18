/**
 * CropperView: draws the image + crop box on a <canvas> and turns pointer
 * input (mouse, touch, pen) into CropSession calls.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class CropperView {
    static HANDLE_HIT = 16; // CSS px; generous so fingers can grab it
    static HANDLE_DRAW = 7;

    #canvas;
    #source;
    #session;
    #scale = 1;
    #drag = null;
    #showGuide = false;
      #alignmentGrid = false;
    #onChange;
    #ro;
    #resizeFrame = 0;

    constructor({ canvas, source, session, onChange = () => {} }) {
      this.#canvas = canvas;
      this.#source = source;
      this.#session = session;
      this.#onChange = onChange;
      this.#bind();
      this.refresh();
    }

    set showGuide(value) {
      this.#showGuide = Boolean(value);
      this.render();
    }

    set alignmentGrid(value) {
      this.#alignmentGrid = Boolean(value);
      this.render();
    }

    setSource(source, session) {
      this.#source = source;
      this.#session = session;
      this.refresh();
    }

    /** Recompute canvas size from the container, then redraw. */
    refresh() {
      const parent = this.#canvas.parentElement;
      const maxW = Math.max(200, (parent && parent.clientWidth) || 600);
      const maxH = Math.max(240, Math.min(window.innerHeight * 0.62, 560));
      const { imageWidth: iw, imageHeight: ih } = this.#session;
      this.#scale = Math.min(maxW / iw, maxH / ih);
      const cssW = Math.round(iw * this.#scale);
      const cssH = Math.round(ih * this.#scale);
      const dpr = window.devicePixelRatio || 1;
      if (this.#canvas.style.width !== `${cssW}px`) this.#canvas.style.width = `${cssW}px`;
      if (this.#canvas.style.height !== `${cssH}px`) this.#canvas.style.height = `${cssH}px`;
      const pixelW = Math.round(cssW * dpr);
      const pixelH = Math.round(cssH * dpr);
      if (this.#canvas.width !== pixelW) this.#canvas.width = pixelW;
      if (this.#canvas.height !== pixelH) this.#canvas.height = pixelH;
      this.render();
    }

    render() {
      const ctx = this.#canvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const s = this.#scale;
      const dw = this.#session.imageWidth * s;
      const dh = this.#session.imageHeight * s;
      const c = this.#session.crop;
      const x = c.x * s;
      const y = c.y * s;
      const w = c.w * s;
      const h = c.h * s;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, dw, dh);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.#source, 0, 0, dw, dh);

      // dim everything outside the crop
      ctx.fillStyle = 'rgba(8, 12, 20, 0.58)';
      ctx.beginPath();
      ctx.rect(0, 0, dw, dh);
      ctx.rect(x, y, w, h);
      ctx.fill('evenodd');

      // rule-of-thirds grid
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i <= 2; i++) {
        ctx.moveTo(x + (w * i) / 3, y);
        ctx.lineTo(x + (w * i) / 3, y + h);
        ctx.moveTo(x, y + (h * i) / 3);
        ctx.lineTo(x + w, y + (h * i) / 3);
      }
      ctx.stroke();

      if (this.#alignmentGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 10; i++) {
          ctx.moveTo(x + (w * i) / 10, y);
          ctx.lineTo(x + (w * i) / 10, y + h);
          ctx.moveTo(x, y + (h * i) / 10);
          ctx.lineTo(x + w, y + (h * i) / 10);
        }
        ctx.stroke();
      }

      // optional face guide (head and shoulders)
      if (this.#showGuide) {
        ctx.strokeStyle = 'rgba(199, 217, 206, 0.9)';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 0.42, w * 0.25, h * 0.27, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h * 1.02, w * 0.45, h * 0.3, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = getComputedStyle(this.#canvas).getPropertyValue('--accent').trim();
      for (const [hx, hy] of this.#handlePoints(x, y, w, h)) {
        const r = CropperView.HANDLE_DRAW;
        ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
        ctx.strokeRect(hx - r, hy - r, r * 2, r * 2);
      }
    }

    destroy() {
      this.#canvas.removeEventListener('pointerdown', this.#onDown);
      this.#canvas.removeEventListener('pointermove', this.#onMove);
      this.#canvas.removeEventListener('pointerup', this.#onUp);
      this.#canvas.removeEventListener('pointercancel', this.#onUp);
      if (this.#ro) this.#ro.disconnect();
      if (this.#resizeFrame) cancelAnimationFrame(this.#resizeFrame);
    }

    // ---- internals ----

    #handlePoints(x, y, w, h) {
      return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
    }

    #handleNames = ['nw', 'ne', 'sw', 'se'];

    #pointer(evt) {
      const rect = this.#canvas.getBoundingClientRect();
      return { cx: evt.clientX - rect.left, cy: evt.clientY - rect.top };
    }

    #hit(cx, cy) {
      const s = this.#scale;
      const c = this.#session.crop;
      const pts = this.#handlePoints(c.x * s, c.y * s, c.w * s, c.h * s);
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pts[i][0] - cx, pts[i][1] - cy) <= CropperView.HANDLE_HIT) return this.#handleNames[i];
      }
      const inside = cx >= c.x * s && cx <= (c.x + c.w) * s && cy >= c.y * s && cy <= (c.y + c.h) * s;
      return inside ? 'move' : null;
    }

    #onDown = (evt) => {
      const { cx, cy } = this.#pointer(evt);
      const mode = this.#hit(cx, cy);
      if (!mode) return;
      evt.preventDefault();
      this.#canvas.setPointerCapture(evt.pointerId);
      this.#drag = { mode, lastX: cx, lastY: cy };
    };

    #onMove = (evt) => {
      const { cx, cy } = this.#pointer(evt);
      if (!this.#drag) {
        const hover = this.#hit(cx, cy);
        this.#canvas.style.cursor = !hover ? 'default' : hover === 'move' ? 'move' : hover === 'nw' || hover === 'se' ? 'nwse-resize' : 'nesw-resize';
        return;
      }
      const s = this.#scale;
      if (this.#drag.mode === 'move') {
        this.#session.moveBy((cx - this.#drag.lastX) / s, (cy - this.#drag.lastY) / s);
      } else {
        this.#session.resizeTo(this.#drag.mode, cx / s, cy / s);
      }
      this.#drag.lastX = cx;
      this.#drag.lastY = cy;
      this.render();
      this.#onChange(this.#session.crop);
    };

    #onUp = (evt) => {
      if (this.#drag && this.#canvas.hasPointerCapture(evt.pointerId)) this.#canvas.releasePointerCapture(evt.pointerId);
      this.#drag = null;
    };

    #bind() {
      this.#canvas.style.touchAction = 'none';
      this.#canvas.addEventListener('pointerdown', this.#onDown);
      this.#canvas.addEventListener('pointermove', this.#onMove);
      this.#canvas.addEventListener('pointerup', this.#onUp);
      this.#canvas.addEventListener('pointercancel', this.#onUp);
      if (typeof ResizeObserver === 'function' && this.#canvas.parentElement) {
        this.#ro = new ResizeObserver(() => {
          if (this.#resizeFrame) cancelAnimationFrame(this.#resizeFrame);
          this.#resizeFrame = requestAnimationFrame(() => {
            this.#resizeFrame = 0;
            this.refresh();
          });
        });
        this.#ro.observe(this.#canvas.parentElement);
      }
    }
  }

  NS.CropperView = CropperView;
})(typeof window !== 'undefined' ? window : globalThis);
