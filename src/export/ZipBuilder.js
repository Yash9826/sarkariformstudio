/**
 * ZipBuilder: creates a standard .zip (stored/uncompressed - images are already
 * compressed) without any library.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ExportError } = NS;

  class ZipBuilder {
    static #crcTable = (() => {
      const table = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
      }
      return table;
    })();

    static crc32(bytes) {
      let crc = 0xffffffff;
      for (let i = 0; i < bytes.length; i++) crc = ZipBuilder.#crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
      return (crc ^ 0xffffffff) >>> 0;
    }

    #entries = [];
    #names = new Set();
    #now;

    constructor(now = new Date()) {
      this.#now = now;
    }

    get count() {
      return this.#entries.length;
    }

    /** @param {string} name  file name inside the zip  @param {Uint8Array} data */
    add(name, data) {
      if (typeof name !== 'string' || !name.trim() || /[\\/]/.test(name)) {
        throw new ExportError(`Invalid zip entry name "${name}"`);
      }
      if (!(data instanceof Uint8Array)) throw new ExportError(`Entry "${name}" must be a Uint8Array`);
      if (this.#names.has(name)) throw new ExportError(`Duplicate zip entry "${name}"`);
      this.#names.add(name);
      this.#entries.push({ name, data, nameBytes: new TextEncoder().encode(name), crc: ZipBuilder.crc32(data) });
      return this;
    }

    /** @returns {Uint8Array} */
    build() {
      if (!this.#entries.length) throw new ExportError('Zip has no files', { userMessage: 'There is nothing to download yet.' });
      const { dosTime, dosDate } = this.#dosDateTime(this.#now);
      const parts = [];
      const central = [];
      let offset = 0;

      for (const e of this.#entries) {
        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true); // UTF-8 names
        local.setUint16(8, 0, true); // stored
        local.setUint16(10, dosTime, true);
        local.setUint16(12, dosDate, true);
        local.setUint32(14, e.crc, true);
        local.setUint32(18, e.data.length, true);
        local.setUint32(22, e.data.length, true);
        local.setUint16(26, e.nameBytes.length, true);
        local.setUint16(28, 0, true);
        parts.push(new Uint8Array(local.buffer), e.nameBytes, e.data);

        const cd = new DataView(new ArrayBuffer(46));
        cd.setUint32(0, 0x02014b50, true);
        cd.setUint16(4, 20, true);
        cd.setUint16(6, 20, true);
        cd.setUint16(8, 0x0800, true);
        cd.setUint16(10, 0, true);
        cd.setUint16(12, dosTime, true);
        cd.setUint16(14, dosDate, true);
        cd.setUint32(16, e.crc, true);
        cd.setUint32(20, e.data.length, true);
        cd.setUint32(24, e.data.length, true);
        cd.setUint16(28, e.nameBytes.length, true);
        cd.setUint32(42, offset, true);
        central.push(new Uint8Array(cd.buffer), e.nameBytes);

        offset += 30 + e.nameBytes.length + e.data.length;
      }

      const cdSize = central.reduce((n, p) => n + p.length, 0);
      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);
      end.setUint16(8, this.#entries.length, true);
      end.setUint16(10, this.#entries.length, true);
      end.setUint32(12, cdSize, true);
      end.setUint32(16, offset, true);

      const all = [...parts, ...central, new Uint8Array(end.buffer)];
      const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
      let pos = 0;
      for (const p of all) {
        out.set(p, pos);
        pos += p.length;
      }
      return out;
    }

    toBlob() {
      return new Blob([this.build()], { type: 'application/zip' });
    }

    #dosDateTime(d) {
      const year = Math.max(d.getFullYear(), 1980);
      return {
        dosTime: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
        dosDate: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
      };
    }
  }

  NS.ZipBuilder = ZipBuilder;
})(typeof window !== 'undefined' ? window : globalThis);
