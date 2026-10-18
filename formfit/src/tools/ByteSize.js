(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class ByteSize {
    static parse(value) {
      const match = /^\s*(\d+(?:\.\d+)?)\s*(B|KB|MB)?\s*$/i.exec(String(value));
      if (!match) throw new ValidationError(`Invalid byte size "${value}"`, { userMessage: 'Enter a valid size in bytes, KB, or MB.' });
      const amount = Number(match[1]);
      const unit = (match[2] || 'B').toUpperCase();
      const multiplier = unit === 'MB' ? 1048576 : unit === 'KB' ? 1024 : 1;
      const bytes = Math.round(amount * multiplier);
      if (!Number.isSafeInteger(bytes) || bytes <= 0) {
        throw new ValidationError('Byte size must be a positive safe integer', { userMessage: 'Enter a size greater than zero.' });
      }
      return bytes;
    }

    static format(bytes) {
      if (!Number.isFinite(bytes) || bytes < 0) throw new ValidationError('Byte count must be a non-negative number');
      if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
      if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${Math.round(bytes)} B`;
    }
  }

  NS.ByteSize = ByteSize;
})(typeof window !== 'undefined' ? window : globalThis);
