/**
 * Core feature of the site. Do not remove.
 *
 * Exam requirements data.
 *
 * HOW TO ADD / CHANGE AN EXAM (no other code changes needed):
 *   1. Reuse an existing entry in `rules` if the numbers match, otherwise add a new one.
 *   2. Add the exam to `exams` and point each asset kind at a rule id.
 *   3. Exams whose rules are identical are merged automatically in the picker.
 *
 * Rule fields
 *   id, kind (photo|signature|thumb|declaration)
 *   width, height, unit (px|cm|mm|in), dpi      -> omit width/height if the notice gives no size
 *   widthRange / heightRange [min, max] px       -> optional, for notices that give a pixel range
 *   minKB, maxKB, formats ['jpg'|'png'|'webp']
 *   aspect                                       -> optional ratio lock when no fixed size is given
 *
 * DATA QUALITY: values were collected on 2026-10-13 from secondary sources
 * (coaching/exam-prep sites) because official notices are PDFs that change every
 * cycle. Where sources disagreed, the stricter range was used so the output
 * satisfies both. `confidence: "secondary"` marks these. ALWAYS confirm against
 * the current official notification, then update `lastVerified`.
 */
(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  const VERIFIED = '2026-10-13';
  const SECONDARY_NOTE =
    'Compiled from exam-prep sources and cross-checked; confirm against your official notification before submitting.';

  NS.ExamData = {
    version: VERIFIED,

    rules: [
      // ---- Banking (IBPS / SBI / RBI) ----
      { id: 'bank-photo', kind: 'photo', width: 200, height: 230, unit: 'px', minKB: 20, maxKB: 50, formats: ['jpg'], notes: 'Plain white background. About 4.5 cm × 3.5 cm.' },
      { id: 'bank-signature', kind: 'signature', width: 140, height: 60, unit: 'px', minKB: 10, maxKB: 20, formats: ['jpg'], notes: 'Black ink on white paper. About 3.5 cm × 1.5 cm.' },
      { id: 'bank-thumb', kind: 'thumb', width: 240, height: 240, unit: 'px', dpi: 200, minKB: 20, maxKB: 50, formats: ['jpg'], notes: 'Left thumb impression in black or blue ink on white paper.' },
      { id: 'bank-declaration', kind: 'declaration', width: 800, height: 400, unit: 'px', minKB: 50, maxKB: 100, formats: ['jpg'], notes: 'Handwritten declaration in English on white paper, about 10 cm × 5 cm.' },

      // ---- SSC ----
      // TODO(verify): add stampSpec only after the current official notice confirms name/date text.
      { id: 'ssc-photo', kind: 'photo', width: 3.5, height: 4.5, unit: 'cm', dpi: 200, minKB: 20, maxKB: 50, formats: ['jpg'], notes: 'Recent colour photo with a light background. Some SSC exams use live webcam capture instead of upload.' },
      { id: 'ssc-signature', kind: 'signature', width: 4, height: 2, unit: 'cm', dpi: 200, minKB: 10, maxKB: 20, formats: ['jpg'], notes: 'Black ink on white paper. One source lists 6 cm × 2 cm; the notification decides.' },

      // ---- Railways (RRB) ----
      // TODO(verify): add stampSpec only after the current official notice confirms name/date text.
      { id: 'rrb-photo', kind: 'photo', width: 3.5, height: 4.5, unit: 'cm', dpi: 200, minKB: 20, maxKB: 100, formats: ['jpg'], notes: 'White or light background, face clearly visible.' },
      { id: 'rrb-signature', kind: 'signature', width: 140, height: 60, unit: 'px', minKB: 10, maxKB: 20, formats: ['jpg'], notes: 'Black or dark blue ink on white paper. About 3.5 cm × 1.5 cm.' },

      // ---- UPSC ----
      { id: 'upsc-photo', kind: 'photo', width: 413, height: 531, unit: 'px', widthRange: [350, 1000], heightRange: [350, 1000], minKB: 20, maxKB: 300, formats: ['jpg'], notes: 'Plain white background, face covering about 75% of the frame. 413 × 531 px equals 3.5 × 4.5 cm at 300 DPI.' },
      { id: 'upsc-signature', kind: 'signature', width: 350, height: 150, unit: 'px', widthRange: [350, 500], minKB: 20, maxKB: 100, formats: ['jpg'], notes: 'Black ink on plain white paper, not rotated.' },

      // ---- NTA (NEET UG, JEE Main, CUET UG) ----
      { id: 'nta-photo', kind: 'photo', width: 3.5, height: 4.5, unit: 'cm', dpi: 300, minKB: 10, maxKB: 200, formats: ['jpg'], notes: 'Passport-size colour photo, white background. Pixel size is not fixed by NTA; 3.5 × 4.5 cm is used.' },
      { id: 'nta-signature', kind: 'signature', width: 3.5, height: 1.5, unit: 'cm', dpi: 300, minKB: 10, maxKB: 30, formats: ['jpg'], notes: 'Sources disagree (4–30 KB vs 10–100 KB), so the overlap 10–30 KB is used. Sign in black ink on white paper.' },
      { id: 'nta-thumb', kind: 'thumb', minKB: 10, maxKB: 200, formats: ['jpg'], aspect: 1, notes: 'No fixed pixel size; only the file size is limited. Square crop used.' },
    ],

    exams: [
      // Banking
      ...['IBPS PO', 'IBPS Clerk', 'IBPS SO', 'IBPS RRB (Officer & Assistant)'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'IBPS',
        keywords: ['bank', 'banking', 'ibps'], source: 'https://www.ibps.in',
        rules: { photo: 'bank-photo', signature: 'bank-signature', thumb: 'bank-thumb', declaration: 'bank-declaration' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),
      ...['SBI PO', 'SBI Clerk'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'SBI',
        keywords: ['bank', 'banking', 'state bank'], source: 'https://sbi.co.in/web/careers',
        rules: { photo: 'bank-photo', signature: 'bank-signature', thumb: 'bank-thumb', declaration: 'bank-declaration' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),
      ...['RBI Assistant', 'RBI Grade B'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'RBI',
        keywords: ['bank', 'banking', 'reserve bank'], source: 'https://opportunities.rbi.org.in',
        rules: { photo: 'bank-photo', signature: 'bank-signature', thumb: 'bank-thumb', declaration: 'bank-declaration' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),

      // SSC
      ...['SSC CGL', 'SSC CHSL', 'SSC MTS', 'SSC GD Constable', 'SSC CPO', 'SSC JE', 'SSC Stenographer'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'SSC',
        keywords: ['staff selection', 'ssc'], source: 'https://ssc.gov.in',
        rules: { photo: 'ssc-photo', signature: 'ssc-signature' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),

      // Railways
      ...['RRB NTPC', 'RRB Group D', 'RRB ALP', 'RRB JE', 'RPF'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'Railways',
        keywords: ['railway', 'railways', 'rrb', 'indian railways'], source: 'https://indianrailways.gov.in',
        rules: { photo: 'rrb-photo', signature: 'rrb-signature' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),

      // UPSC
      ...['UPSC CSE', 'UPSC NDA', 'UPSC CDS', 'UPSC CAPF', 'UPSC ESE'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'UPSC',
        keywords: ['civil services', 'upsc', 'otr'], source: 'https://upsconline.nic.in',
        rules: { photo: 'upsc-photo', signature: 'upsc-signature' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),

      // NTA
      {
        id: 'neet-ug', name: 'NEET UG', body: 'NTA', keywords: ['medical', 'nta', 'neet'],
        source: 'https://nta.ac.in', rules: { photo: 'nta-photo', signature: 'nta-signature', thumb: 'nta-thumb' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      },
      ...['JEE Main', 'CUET UG'].map((name) => ({
        id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, body: 'NTA',
        keywords: ['nta', 'engineering', 'university', 'entrance'], source: 'https://nta.ac.in',
        rules: { photo: 'nta-photo', signature: 'nta-signature' },
        lastVerified: VERIFIED, confidence: 'secondary', note: SECONDARY_NOTE,
      })),
    ],
  };
})(typeof window !== 'undefined' ? window : globalThis);
