(function () {
  'use strict';

  window.__weSignalPendingAuthUrl = '';
  window.handleOpenURL = function (url) {
    if (typeof url !== 'string' || !url.trim()) return;
    window.__weSignalPendingAuthUrl = url.trim();
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('wesignal:deep-link', { detail: { url: url.trim() } }));
    }, 0);
  };
})();
