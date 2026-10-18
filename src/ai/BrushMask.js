(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class BrushMask {
    #alpha;
    #history = [];
    #cursor = 0;
    #maxHistory;

    constructor(alpha, width, height, maxHistory = 30) {
      if (!(alpha instanceof Float32Array) || alpha.length !== width * height ||
          !Number.isInteger(maxHistory) || maxHistory < 2) {
        throw new ValidationError('BrushMask needs a valid alpha matte and dimensions');
      }
      this.width = width;
      this.height = height;
      this.#alpha = new Float32Array(alpha);
      this.#maxHistory = maxHistory;
      this.#save();
    }

    get alpha() {
      return new Float32Array(this.#alpha);
    }

    get canUndo() {
      return this.#cursor > 0;
    }

    get canRedo() {
      return this.#cursor < this.#history.length - 1;
    }

    stroke(from, to, { radius = 20, hardness = 80, mode = 'erase' } = {}) {
      if (![from && from.x, from && from.y, to && to.x, to && to.y, radius, hardness].every(Number.isFinite) ||
          radius < 1 || hardness < 0 || hardness > 100 || !['erase', 'restore'].includes(mode)) {
        throw new ValidationError('Brush stroke parameters are invalid');
      }
      const left = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
      const right = Math.min(this.width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
      const top = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
      const bottom = Math.min(this.height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
      const hardRadius = radius * hardness / 100;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const lineLengthSquared = dx * dx + dy * dy;
      let changed = false;
      for (let y = top; y <= bottom; y++) {
        for (let x = left; x <= right; x++) {
          const t = lineLengthSquared
            ? Math.max(0, Math.min(1, ((x - from.x) * dx + (y - from.y) * dy) / lineLengthSquared))
            : 0;
          const distance = Math.hypot(x - (from.x + t * dx), y - (from.y + t * dy));
          if (distance > radius) continue;
          const falloff = distance <= hardRadius || radius === hardRadius
            ? 1
            : 1 - this.#smoothstep(hardRadius, radius, distance);
          const index = y * this.width + x;
          const next = mode === 'erase'
            ? this.#alpha[index] * (1 - falloff)
            : this.#alpha[index] + (1 - this.#alpha[index]) * falloff;
          if (next !== this.#alpha[index]) changed = true;
          this.#alpha[index] = next;
        }
      }
      if (changed) this.#save();
      return changed;
    }

    undo() {
      if (!this.canUndo) return false;
      this.#cursor--;
      this.#restore(this.#history[this.#cursor]);
      return true;
    }

    redo() {
      if (!this.canRedo) return false;
      this.#cursor++;
      this.#restore(this.#history[this.#cursor]);
      return true;
    }

    reset(alpha) {
      if (!(alpha instanceof Float32Array) || alpha.length !== this.width * this.height) {
        throw new ValidationError('Reset alpha must match the original matte');
      }
      this.#alpha = new Float32Array(alpha);
      this.#history = [];
      this.#cursor = 0;
      this.#save();
    }

    #save() {
      this.#history.splice(this.#cursor + 1);
      const snapshot = new Uint8Array(this.#alpha.length);
      for (let i = 0; i < snapshot.length; i++) snapshot[i] = Math.round(this.#alpha[i] * 255);
      this.#history.push(snapshot);
      if (this.#history.length > this.#maxHistory) this.#history.shift();
      this.#cursor = this.#history.length - 1;
    }

    #restore(snapshot) {
      for (let i = 0; i < snapshot.length; i++) this.#alpha[i] = snapshot[i] / 255;
    }

    #smoothstep(edge0, edge1, value) {
      const x = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
      return x * x * (3 - 2 * x);
    }
  }

  NS.BrushMask = BrushMask;
})(typeof window !== 'undefined' ? window : globalThis);
