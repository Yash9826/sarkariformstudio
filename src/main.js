(function () {
  'use strict';
  const start = () => new window.SarkariFormStudio.SarkariFormStudioApp().start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
