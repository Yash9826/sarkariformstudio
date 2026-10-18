(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});
  const { ValidationError } = NS;

  class PageRangeParser {
    static parse(value, pageCount) {
      if (!Number.isInteger(pageCount) || pageCount < 1) throw new ValidationError('Page count must be positive');
      const input = String(value || '').trim();
      if (!input) throw new ValidationError('Page range is empty', { userMessage: 'Enter one or more page numbers, for example 1-3, 5.' });
      const pages = [];
      const seen = new Set();
      for (const part of input.split(',')) {
        const token = part.trim();
        const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
        if (!match) throw new ValidationError(`Invalid page range "${token}"`, { userMessage: `“${token}” is not a valid page number or range.` });
        const first = Number(match[1]);
        const last = match[2] ? Number(match[2]) : first;
        if (first > last) throw new ValidationError(`Reversed page range "${token}"`, { userMessage: `Page ranges must go from low to high: ${token}.` });
        for (let page = first; page <= last; page++) {
          if (page > pageCount) {
            throw new ValidationError(`Page ${page} exceeds page count ${pageCount}`, {
              userMessage: `Page ${page} does not exist; this PDF has ${pageCount} pages.`,
            });
          }
          if (page < 1) throw new ValidationError('Page numbers start at 1', { userMessage: 'Page numbers start at 1.' });
          if (!seen.has(page)) {
            seen.add(page);
            pages.push(page - 1);
          }
        }
      }
      return pages;
    }
  }

  NS.PageRangeParser = PageRangeParser;
})(typeof window !== 'undefined' ? window : globalThis);
