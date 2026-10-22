(function (root) {
  'use strict';

  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));

  function loadingMarkup() {
    return `<div class="detail-loading" role="status" aria-busy="true" aria-label="Loading incident details">
      <div class="detail-media-frame skeleton" aria-hidden="true"></div>
      <div class="detail-card detail-loading-card">
        <span class="skeleton detail-skeleton-line detail-skeleton-short" aria-hidden="true"></span>
        <h2 id="detail-title" class="skeleton detail-skeleton-line detail-skeleton-title">Loading incident details</h2>
        <span class="skeleton detail-skeleton-line" aria-hidden="true"></span>
      </div>
      <div class="detail-card detail-loading-card">
        <span class="skeleton detail-skeleton-line detail-skeleton-short" aria-hidden="true"></span>
        <span class="skeleton detail-skeleton-line" aria-hidden="true"></span>
        <span class="skeleton detail-skeleton-line detail-skeleton-button" aria-hidden="true"></span>
      </div>
    </div>`;
  }

  function mediaMarkup(mediaHtml, mediaState) {
    if (mediaState === 'error') {
      return `<div class="detail-media-empty detail-media-error" role="status">
        <span class="detail-media-icon" aria-hidden="true">!</span>
        <strong>Media could not be loaded</strong>
        <button class="text-button" type="button" data-refresh-detail>Try again</button>
      </div>`;
    }
    if (mediaHtml) return `<div class="detail-media-frame">${mediaHtml}</div>`;
    return `<div class="detail-media-empty" role="status">
      <span class="detail-media-icon" aria-hidden="true">▧</span>
      <strong>No image uploaded</strong>
      <span>This incident was shared without a photo or video.</span>
    </div>`;
  }

  function confirmationMarkup(incident, summary, signedIn, statusLabel) {
    if (!summary || summary.error) {
      const diagnostic = summary && summary.errorMessage
        ? `<p class="detail-error-diagnostic" role="status">${escapeHtml(summary.errorMessage)}</p>` : '';
      return `<section class="detail-card detail-confirmation" aria-labelledby="confirmation-title">
        <div class="detail-section-heading"><span class="detail-section-icon" aria-hidden="true">✓</span><div><h3 id="confirmation-title">Community confirmations</h3><p>Progress is based on saved confirmations from distinct community members.</p></div></div>
        <p class="detail-inline-error" role="alert">We couldn’t load the current confirmation count.</p>
        ${diagnostic}
        <button class="secondary-button" type="button" data-refresh-detail>Retry confirmation status</button>
      </section>`;
    }

    const count = Number(summary.confirmation_count);
    const threshold = Number(summary.threshold);
    if (!Number.isInteger(count) || count < 0 || count > 3 || threshold !== 3) {
      return `<section class="detail-card detail-confirmation" aria-labelledby="confirmation-title">
        <div class="detail-section-heading"><span class="detail-section-icon" aria-hidden="true">✓</span><div><h3 id="confirmation-title">Community confirmations</h3><p>Progress is based on saved confirmations from distinct community members.</p></div></div>
        <p class="detail-inline-error" role="alert">Confirmation progress returned an unexpected value. Please retry.</p>
        <button class="secondary-button" type="button" data-refresh-detail>Retry confirmation status</button>
      </section>`;
    }

    const progress = Math.round((count / threshold) * 100);
    const resolved = incident.status === 'resolved';
    const isReporter = summary.is_reporter === true;
    const hasConfirmed = summary.has_confirmed === true;
    let action;
    if (resolved) {
      action = `<p class="detail-confirmation-note" role="status">This incident is marked <strong>${escapeHtml(statusLabel || 'Resolved')}</strong>.</p>`;
    } else if (count === threshold) {
      action = `<p class="detail-confirmation-note" role="status">The confirmation threshold has been reached. Current status: <strong>${escapeHtml(statusLabel || incident.status)}</strong>.</p>`;
    } else if (isReporter) {
      action = `<p class="detail-confirmation-note">You reported this incident, so you can’t confirm it.</p>`;
    } else if (hasConfirmed) {
      action = `<button class="secondary-button detail-confirm-button" type="button" disabled>✓ &nbsp;You’ve confirmed this incident</button>`;
    } else {
      action = `<button class="primary-button detail-confirm-button" type="button" data-confirm-report="${escapeHtml(incident.id)}">${signedIn ? 'I can confirm this incident is resolved' : 'Sign in to confirm this incident'}</button>`;
    }

    return `<section class="detail-card detail-confirmation" aria-labelledby="confirmation-title">
      <div class="detail-section-heading"><span class="detail-section-icon" aria-hidden="true">✓</span><div><h3 id="confirmation-title">Community confirmations</h3><p>Three distinct people who didn’t report it can confirm resolution; the third confirmation marks it resolved.</p></div></div>
      <div class="detail-confirmation-count"><strong>${count}</strong><span> of ${threshold} confirmations</span></div>
      <div class="detail-progress-track" role="progressbar" aria-label="Community confirmations toward the threshold" aria-valuemin="0" aria-valuemax="${threshold}" aria-valuenow="${count}"><span style="width:${progress}%"></span></div>
      <p class="detail-confirmation-caption">${count === threshold ? 'Threshold reached' : `${threshold - count} more ${threshold - count === 1 ? 'confirmation' : 'confirmations'} needed`}</p>
      ${action}
      <p id="resolution-feedback" class="detail-confirmation-feedback" role="status" aria-live="polite" hidden></p>
    </section>`;
  }

  function render(options) {
    const incident = options.incident;
    const point = options.point;
    const categoryLabel = options.categoryLabel || incident.category || 'Incident';
    const statusLabel = options.statusLabel || incident.status || 'Published';
    const media = mediaMarkup(options.mediaHtml, options.mediaState);
    const reportWarning = options.reportWarning ? `<p class="detail-inline-warning" role="status">${escapeHtml(options.reportWarning)}</p>` : '';
    const coordinates = point ? `<span class="detail-location-coordinates">${escapeHtml(point.label)}${point.radius ? ` · within about ${point.radius >= 1000 ? `${(point.radius / 1000).toFixed(1)} km` : `${point.radius} m`}` : ''}</span>` : '';
    const locationText = incident.public_location_label || incident.location_label || (point && point.label) || '';
    const locationActions = options.locationActionHtml || '';
    const locationMarkup = `<section class="detail-card detail-location" aria-labelledby="detail-location-title">
      <div class="detail-section-heading"><span class="detail-section-icon" aria-hidden="true">⌖</span><div><h3 id="detail-location-title">Incident location</h3><p>${locationText ? escapeHtml(locationText) : 'Location not provided'}</p>${coordinates}</div></div>
      ${locationActions ? `<div class="detail-location-actions">${locationActions}</div>` : ''}
    </section>`;

    return `<article class="incident-detail" aria-busy="false">
      ${media}
      ${reportWarning}
      <header class="detail-card detail-heading-card">
        <div class="detail-heading-meta"><span class="detail-category">${escapeHtml(categoryLabel)}</span><span class="detail-status detail-status-${escapeHtml(incident.status || 'published')}">${escapeHtml(statusLabel)}</span></div>
        <h2 id="detail-title">${escapeHtml(incident.title || 'Incident details')}</h2>
        <time class="detail-date" datetime="${escapeHtml(incident.created_at || '')}">Reported ${escapeHtml(options.dateText || 'Date unavailable')}</time>
      </header>
      <section class="detail-card detail-description" aria-labelledby="detail-description-title">
        <h3 id="detail-description-title">What happened</h3>
        <p>${escapeHtml(incident.description || 'No description provided.')}</p>
      </section>
      ${locationMarkup}
      ${confirmationMarkup(incident, options.summary, options.signedIn, statusLabel)}
      ${options.mediaWarning ? `<p class="incident-media-warning" role="status">${escapeHtml(options.mediaWarning)}</p>` : ''}
    </article>`;
  }

  root.WeSignalIncidentDetailView = { loadingMarkup, render };
})(window);
