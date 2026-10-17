(function (root) {
  'use strict';

  const NETWORK_ERROR = /failed to fetch|fetch failed|network(?: request)? failed|networkerror|load failed|offline|err_(?:network|internet_disconnected|connection_(?:refused|reset|timed_out|aborted)|name_not_resolved)|econn(?:refused|reset|aborted)|enotfound|ehostunreach|etimedout|connection (?:lost|refused|timed out)|request timed out/i;

  function isOffline(error, online) {
    if (online === false) return true;
    const rawStatus = error && (error.status ?? error.statusCode ?? (error.context && error.context.status));
    const status = rawStatus === undefined || rawStatus === null ? Number.NaN : Number(rawStatus);
    const text = [error && error.name, error && error.message, error && error.details, error && error.hint, error && error.code]
      .filter(Boolean).join(' ');
    return status === 0 || NETWORK_ERROR.test(text);
  }

  function describe(error, online) {
    if (isOffline(error, online)) return 'Internet connection not working. Check your connection and try again.';
    const code = String(error && error.code || '').trim();
    const message = String(error && (error.message || error.details || error.hint) || 'The service request failed.')
      .replace(/https?:\/\/[^\s<>"']+/gi, '[service endpoint]')
      .replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?\b/gi, '[local endpoint]')
      .replace(/\b(?:sb_publishable|eyJ)[A-Za-z0-9._-]{12,}\b/g, '[redacted credential]')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 240);
    return [code, message].filter(Boolean).join(' · ') || 'The service request failed.';
  }

  root.WeSignalServiceErrors = { isOffline, describe };
})(window);
