(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class DateFormatter {
    static format(isoDate, format = 'DD/MM/YYYY') {
      if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
        throw new ValidationError('Date must be in YYYY-MM-DD format', { userMessage: 'Enter a valid photo date.' });
      }
      const [year, month, day] = isoDate.split('-').map(Number);
      const date = new Date(0);
      date.setUTCFullYear(year, month - 1, day);
      if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
        throw new ValidationError(`Invalid calendar date "${isoDate}"`, { userMessage: 'Enter a valid photo date.' });
      }
      if (format === 'DD/MM/YYYY') return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      if (format === 'DD-MM-YYYY') return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
      if (format === 'DD MMM YYYY') {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${String(day).padStart(2, '0')} ${months[month - 1]} ${year}`;
      }
      throw new ValidationError(`Unsupported date format "${format}"`);
    }
  }

  NS.DateFormatter = DateFormatter;
})(typeof window !== 'undefined' ? window : globalThis);
