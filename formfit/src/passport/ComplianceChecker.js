(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class ComplianceChecker {
    static check(input) {
      const checks = [];
      const add = (label, pass, warning = false) => checks.push({
        label,
        status: pass ? 'pass' : warning ? 'warning' : 'fail',
        symbol: pass ? '✓' : warning ? '!' : '✕',
      });
      const expected = input.expected || {};
      add('Exact pixel dimensions', input.width === expected.width && input.height === expected.height);
      add('File format', String(input.mime || '').toLowerCase() === String(expected.mime || 'image/jpeg').toLowerCase());
      if (expected.minBytes != null || expected.maxBytes != null) {
        add('File size range',
          (expected.minBytes == null || input.bytes >= expected.minBytes) &&
          (expected.maxBytes == null || input.bytes <= expected.maxBytes));
      }
      if (input.headRatio != null && expected.headRatio) {
        add('Head height ratio', input.headRatio >= expected.headRatio.min && input.headRatio <= expected.headRatio.max, true);
      }
      if (input.centerOffset != null) add('Face horizontally centred', Math.abs(input.centerOffset) < 0.03);
      if (input.tiltDeg != null) add('Head tilt', Math.abs(input.tiltDeg) <= 5, Math.abs(input.tiltDeg) <= 15);
      if (input.backgroundStdDev != null) {
        add('Background uniformity', input.backgroundStdDev.every((value) => value < 6), true);
      }
      if (input.backgroundDeltaE != null) add('Background colour', input.backgroundDeltaE <= 8, true);
      if (input.paddedRatio != null) add('Photo padding', input.paddedRatio <= 0.3, true);
      if (input.faceCount != null) add('Single face', input.faceCount === 1);
      if (input.stripFits != null) add('Name/date strip fits', input.stripFits, true);
      const failed = checks.some((check) => check.status === 'fail');
      const warnings = checks.some((check) => check.status === 'warning');
      return Object.freeze({
        summary: failed ? 'Some measurable checks need attention' : warnings ? 'Review the warnings below' : 'Meets the checks we can measure',
        checks: Object.freeze(checks.map((check) => Object.freeze(check))),
        reminders: Object.freeze(['Expression, glasses glare, shadows, and head-covering rules must be checked manually.']),
      });
    }
  }

  NS.ComplianceChecker = ComplianceChecker;
})(typeof window !== 'undefined' ? window : globalThis);
