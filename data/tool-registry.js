(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  const tool = (id, slug, title, category, panel, description, keywords, converterId = null, extra = {}) =>
    Object.freeze({
      id, slug, title, category, group: extra.group || toolGroups[id] || 'Tools', panel, converterId, description,
      core: extra.core === true,
      ...(extra.alsoIn ? { alsoIn: Object.freeze([...extra.alsoIn]) } : {}),
      keywords: Object.freeze(keywords.split(' ')),
      route: `#/tools/${slug}`,
      seo: Object.freeze({
        title: `${title} | ${NS.SiteConfig.siteName}`,
        description,
        h1: title,
        howTo: Object.freeze(extra.howTo || ['Choose the tool and add your file.', 'Review the available options.', 'Process locally and download the result.']),
        faq: Object.freeze(extra.faq || [
          ['Are files uploaded?', 'No. This tool processes your files in this browser.'],
          ['Is there a file limit?', 'File type and size limits are shown when you choose a file.'],
          ['Will the result always be accepted?', 'Check the requirements of the service receiving your file.'],
        ]),
        note: extra.note || 'Processing happens in this browser; nothing is uploaded.',
      }),
    });

  const toolGroups = Object.freeze({
    'exam-photo-resizer': 'Exam resizer',
    'custom-size-cropper': 'Custom crop',
    'check-my-file': 'File check',
    'photo-editor': 'Photo editing',
    'image-converter': 'Images',
    'heic-to-jpg': 'Images',
    'images-to-pdf': 'Images',
    'pdf-to-images': 'PDF',
    'scan-to-pdf': 'PDF',
    'merge-pdf': 'Organize',
    'split-pdf': 'Organize',
    'organize-pdf': 'Organize',
    'compress-pdf': 'Compress',
    'image-to-pdf': 'Images',
    'image-resize-convert': 'Resize and convert',
  });

  const categories = Object.freeze([
    Object.freeze({ id: 'exam-photos', title: 'Exam Photos', groups: Object.freeze(['Exam resizer', 'Custom crop', 'File check']) }),
    Object.freeze({ id: 'photo-editor', title: 'Photo Editor', groups: Object.freeze(['Photo editing']) }),
    Object.freeze({ id: 'convert', title: 'Convert', groups: Object.freeze(['Documents', 'Images', 'PDF', 'Other']) }),
    Object.freeze({ id: 'compress', title: 'Compress', groups: Object.freeze(['Images', 'PDF']) }),
    Object.freeze({ id: 'pdf-tools', title: 'PDF Tools', groups: Object.freeze(['Organize', 'Convert', 'Compress']) }),
    Object.freeze({ id: 'image-tools', title: 'Image Tools', groups: Object.freeze(['Resize and convert']) }),
  ]);

  // Core feature of the site. Do not remove.
  const tools = [
    tool('exam-photo-resizer', 'exam-photo-resizer', 'Exam Photo Resizer', 'exam-photos', 'exam', 'Prepare a photo or signature using the selected exam requirements.', 'exam photo signature thumb declaration resize', null, {
      core: true,
      note: 'Exam requirements can change; confirm them with the current official notice.',
      howTo: ['Search for your exam and choose its rule group.', 'Select Photo, Signature, or another required file type.', 'Upload a picture, adjust the crop, then crop, compress, and download it.'],
      faq: [
        ['Is the Exam Photo Resizer free?', 'Yes. It is free to use in your browser.'],
        ['Are my files uploaded?', 'No. Pictures are processed on this device and are not sent to a server.'],
        ['What are the file limits?', 'Pictures can be up to 30 MB and must be at least 40 × 40 pixels.'],
        ['How can I fix a file that is too large?', 'Crop more tightly around the subject, then crop and compress again.'],
        ['What if my exam is not listed?', 'Use Custom Size Cropper to enter the dimensions and file-size limits from your notification.'],
      ],
    }),
    tool('custom-size-cropper', 'custom-size-cropper', 'Custom Size Cropper', 'exam-photos', 'general', 'Crop and resize an image to dimensions and file limits you choose.', 'custom crop resize dimensions pixels cm mm inches dpi', null, {
      core: true,
      howTo: ['Enter the required dimensions, units, and file-size limits, or leave dimensions blank for a free crop.', 'Choose an image and adjust the crop.', 'Crop, compress, and download the result.'],
      faq: [
        ['Is Custom Size Cropper free?', 'Yes. It is free to use in your browser.'],
        ['Are my files uploaded?', 'No. Files are processed locally on this device.'],
        ['What are the file limits?', 'Images can be up to 30 MB and must be at least 40 × 40 pixels.'],
        ['How can I fix a file that is too large?', 'Crop more tightly, or leave dimensions blank to allow the crop to shrink to fit.'],
        ['What if my exam is not listed?', 'Enter the requirements shown in your current exam notification.'],
      ],
    }),
    tool('check-my-file', 'check-my-file', 'Check My File', 'exam-photos', 'check', 'Check a prepared image against a selected exam file requirement.', 'check validate file size format dimensions', null, {
      core: true,
      howTo: ['Choose your exam and the file type you want to check.', 'Select the existing image; it is inspected in your browser.', 'Review the checklist, and use Fix it for me if the file does not pass.'],
      faq: [
        ['Is Check My File free?', 'Yes. It is free to use in your browser.'],
        ['Are my files uploaded?', 'No. Your image is inspected locally and is not sent to a server.'],
        ['What are the file limits?', 'Images can be up to 30 MB and must be at least 40 × 40 pixels.'],
        ['How do I fix a file that is too large?', 'Use Fix it for me to crop and compress it to the selected rule.'],
        ['What if my exam is not listed?', 'Use Custom Size Cropper with the requirements in your current notification.'],
      ],
    }),
    tool('photo-editor', 'photo-editor', 'Photo Editor', 'photo-editor', 'photo-editor', 'Remove or replace a background and prepare a locally processed image export.', 'photo edit background remove resize portrait', null, { note: 'Background removal uses an on-device model. Results are editing guidance, not authority approval.' }),
    tool('image-converter', 'image-converter', 'Image Converter', 'convert', 'tools', 'Convert common image formats, with optional resize and JPEG size targeting.', 'image convert jpg jpeg png webp bmp gif compress kb resize', 'image-format', { alsoIn: ['compress'] }),
    tool('heic-to-jpg', 'heic-to-jpg', 'HEIC to JPG', 'convert', 'tools', 'Convert HEIC photos to JPEG locally.', 'heic heif jpg jpeg iphone image', 'heic-to-jpg'),
    tool('images-to-pdf', 'images-to-pdf', 'Images to PDF', 'convert', 'tools', 'Place selected images into a new PDF document.', 'image jpg png pdf convert photos', 'images-to-pdf'),
    tool('pdf-to-images', 'pdf-to-images', 'PDF to JPG or PNG', 'convert', 'tools', 'Render selected pages of a PDF as image files.', 'pdf jpg png convert pages render', 'pdf-to-images', { alsoIn: ['pdf-tools'], note: 'Needs a local web address because browser PDF rendering uses a worker.' }),
    tool('scan-to-pdf', 'scan-to-pdf', 'Scan Photos to PDF', 'convert', 'tools', 'Turn document photos into a PDF with a selectable cleanup style.', 'scan images pdf document clean grayscale', 'scan-to-pdf'),
    tool('merge-pdf', 'merge-pdf', 'Merge PDFs', 'pdf-tools', 'tools', 'Join several PDF files in the order you choose.', 'pdf merge combine join pages', 'pdf-merge', { alsoIn: ['convert'] }),
    tool('split-pdf', 'split-pdf', 'Split or Extract PDF Pages', 'pdf-tools', 'tools', 'Split a PDF into parts or extract specified page numbers.', 'pdf split extract pages ranges', 'pdf-split', { alsoIn: ['convert'] }),
    tool('organize-pdf', 'organize-pdf', 'Organize PDF Pages', 'pdf-tools', 'tools', 'Reorder, rotate, or remove pages in a PDF.', 'pdf organize reorder rotate delete pages', 'pdf-organize'),
    tool('compress-pdf', 'compress-pdf', 'Compress PDF', 'compress', 'tools', 'Reduce PDF size while keeping text when possible.', 'pdf compress reduce size kb', 'pdf-compress', { alsoIn: ['pdf-tools'] }),
    tool('image-to-pdf', 'image-to-pdf', 'Image to PDF', 'convert', 'tools', 'Create a PDF from selected images.', 'images picture pdf convert', 'images-to-pdf', { alsoIn: ['pdf-tools'] }),
    tool('image-resize-convert', 'image-resize', 'Resize an Image', 'image-tools', 'tools', 'Resize or convert an image without sending it to a server.', 'image resize dimensions pixels jpg png webp', 'image-format'),
    tool('privacy', 'privacy', 'Privacy', 'footer', 'information', 'Learn how SarkariFormStudio handles files and keeps processing local.', 'privacy local files uploads device', null, { howTo: ['Choose an on-device tool.', 'Select files from your device.', 'Download your output; source images are not saved by the app.'], faq: [['Are files uploaded?', 'No. Files are processed locally in your browser.'], ['Are photos stored?', 'The app does not save your photos. AI model files may be cached for offline use.'], ['Does the app use analytics?', 'No analytics or tracking is included.']] }),
    tool('help', 'help', 'Help and FAQ', 'footer', 'information', 'Guidance for using the photo and file tools.', 'help faq support how to', null),
    tool('about', 'about', 'About SarkariFormStudio', 'footer', 'information', 'Browser-based tools for preparing exam photos and everyday files.', 'about SarkariFormStudio tools', null),
    tool('disclaimer', 'disclaimer', 'Disclaimer', 'footer', 'information', NS.SiteConfig.footerDisclaimer, 'disclaimer official rules exam authority', null),
  ];

  NS.ToolRegistryData = Object.freeze({
    categories,
    tools: Object.freeze(tools),
    getByRoute(route) { return tools.find((entry) => entry.route === route) || null; },
    getById(id) { return tools.find((entry) => entry.id === id) || null; },
    search(query) {
      const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const results = tools.filter((entry) => words.every((word) =>
        `${entry.title} ${entry.description} ${entry.keywords.join(' ')}`.toLowerCase().includes(word)));
      const examText = (NS.ExamData && Array.isArray(NS.ExamData.exams) ? NS.ExamData.exams : [])
        .flatMap((exam) => [exam.id, exam.name, exam.body, ...(exam.keywords || [])])
        .join(' ')
        .toLowerCase();
      if (words.every((word) => examText.includes(word))) {
        const resizer = tools.find((entry) => entry.id === 'exam-photo-resizer');
        const indexed = results.findIndex((entry) => entry.id === 'exam-photo-resizer');
        const searchEntry = Object.freeze({ ...resizer, searchQuery: String(query).trim() });
        if (indexed === -1) results.unshift(searchEntry);
        else results[indexed] = searchEntry;
      }
      return results;
    },
  });
})(typeof window !== 'undefined' ? window : globalThis);
