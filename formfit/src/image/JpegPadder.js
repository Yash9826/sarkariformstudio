/**
 * JpegPadder: grows a JPEG to an exact minimum size by inserting harmless
 * COM (comment) segments. Decoders ignore them, so the picture is unchanged.
 *
 * Needed because some portals reject files BELOW a minimum size (e.g. 20 KB)
 * and a small, simple image can compress to less than that even at top quality.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { CompressionError } = NS;

  const MAX_SEGMENT_DATA = 65533; // 65535 length field minus its own 2 bytes
  const SEGMENT_OVERHEAD = 4; // FF FE + 2 length bytes

  class JpegPadder {
    /**
     * @param {Uint8Array} bytes   a valid JPEG
     * @param {number} targetSize  desired total size in bytes
     * @returns {Uint8Array}       the same JPEG, padded (or untouched if already big enough)
     */
    static pad(bytes, targetSize) {
      if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
        throw new CompressionError('Not a JPEG file (missing SOI marker)', {
          userMessage: 'The compressed image was not a valid JPEG, so it could not be padded.',
        });
      }
      let remaining = targetSize - bytes.length;
      if (remaining <= 0) return bytes;
      if (remaining < SEGMENT_OVERHEAD) remaining = SEGMENT_OVERHEAD; // overshoots by at most 3 bytes

      const insertAt = JpegPadder.#insertionOffset(bytes);
      const segments = [];
      while (remaining >= SEGMENT_OVERHEAD) {
        const dataLen = Math.min(remaining - SEGMENT_OVERHEAD, MAX_SEGMENT_DATA);
        const seg = new Uint8Array(SEGMENT_OVERHEAD + dataLen); // data stays zero-filled
        seg[0] = 0xff;
        seg[1] = 0xfe;
        const len = dataLen + 2;
        seg[2] = (len >> 8) & 0xff;
        seg[3] = len & 0xff;
        segments.push(seg);
        remaining -= seg.length;
      }

      const padLength = segments.reduce((n, s) => n + s.length, 0);
      const out = new Uint8Array(bytes.length + padLength);
      out.set(bytes.subarray(0, insertAt), 0);
      let offset = insertAt;
      for (const seg of segments) {
        out.set(seg, offset);
        offset += seg.length;
      }
      out.set(bytes.subarray(insertAt), offset);
      return out;
    }

    /** Insert after SOI, and after a leading JFIF APP0 segment if there is one (keeps strict parsers happy). */
    static #insertionOffset(bytes) {
      if (bytes[2] === 0xff && bytes[3] === 0xe0 && bytes.length > 6) {
        const segLen = (bytes[4] << 8) | bytes[5];
        const end = 2 + 2 + segLen;
        if (end <= bytes.length) return end;
      }
      return 2;
    }
  }

  NS.JpegPadder = JpegPadder;
})(typeof window !== 'undefined' ? window : globalThis);
