(function (root) {
  'use strict';
  const NS = (root.SarkariFormStudio = root.SarkariFormStudio || {});

  class ToolRouter {
    static resolve(hash, registry) {
      const aliases = {
        '#exam': 'exam-photo-resizer',
        '#general': 'custom-size-cropper',
        '#check': 'check-my-file',
        '#tools': 'image-converter',
        '#background-studio': 'photo-editor',
        '#passport': 'photo-editor',
        '#/exam': 'exam-photo-resizer',
        '#/general': 'custom-size-cropper',
        '#/check': 'check-my-file',
        '#/tools': 'image-converter',
        '#/background-studio': 'photo-editor',
        '#/passport': 'photo-editor',
      };
      const route = String(hash || '#/').split('?')[0];
      if (!route || route === '#' || route === '#/') return null;
      const aliasId = aliases[route];
      if (aliasId) return registry.getById(aliasId);
      return registry.getByRoute(route);
    }

    static href(entry) {
      return entry ? entry.route : '#/';
    }
  }

  NS.ToolRouter = ToolRouter;
})(typeof window !== 'undefined' ? window : globalThis);
