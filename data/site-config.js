(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  NS.SiteConfig = Object.freeze({
    siteName: 'SarkariFormStudio',
    tagline: 'Photo, PDF & file tools for forms',
    domain: '',
    footerDisclaimer: 'Not affiliated with any government body or exam authority.',
  });
})(typeof window !== 'undefined' ? window : globalThis);
