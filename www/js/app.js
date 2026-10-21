(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const screens = [...document.querySelectorAll('.screen')];
  const labels = { waste_sanitation:'Waste & Sanitation', water_supply_leakage:'Water Supply & Leakage', electricity_power:'Electricity & Power', flooding_drainage:'Flooding & Drainage', roads_infrastructure:'Roads & Infrastructure', traffic_transportation:'Traffic & Transportation', accidents_emergencies:'Accidents & Emergencies', crime_public_safety:'Crime & Public Safety', civil_unrest_rioting:'Civil Unrest & Rioting', environmental_hazards:'Environmental Hazards', other:'Other' };
  const statuses = { submitted:'Reported', acknowledged:'Acknowledged', in_progress:'In progress', resolved:'Resolved' };
  let session = null; let activeFilter = 'all'; let incidents = []; let incidentMedia = Object.create(null); let feedRequest = 0; let detailRequest = 0; let currentDetailId = null; let searchQuery = ''; let returnScreen = 'report'; let authBusy = false;
  let myReports = []; let myReportsState = 'idle'; let reportsFilter = 'all'; let reportsRequest = 0; let editingReportId = null;
  let publicIncidentSubscription = null; let notificationHideTimer = null; const seenIncidentNotificationIds = new Set();
  let authResolved = false; let startupResolved = false; let startupBusy = false; let authSubscription = null; let pendingStartupAuth = null; let authMode = 'signin';
  const authCallbackPromises = new Map();
  let startupAuthCallbackError = '';
  let startupAuthCallbackSuccess = false;
  const escapeHtml = (v) => String(v || '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const date = (v) => v ? new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Date unavailable';
  const relativeDate = (v) => { const time = Date.parse(v); if (!Number.isFinite(time)) return 'Date unavailable'; const mins = Math.max(0, Math.floor((Date.now() - time) / 60000)); if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m ago`; const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h ago`; const days = Math.floor(hours / 24); return days < 7 ? `${days}d ago` : date(v); };
  function coordinates(latitudeValue, longitudeValue) {
    if (latitudeValue === null || latitudeValue === undefined || String(latitudeValue).trim() === ''
      || longitudeValue === null || longitudeValue === undefined || String(longitudeValue).trim() === '') return null;
    const latitude = Number(latitudeValue);
    const longitude = Number(longitudeValue);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    const lat = latitude.toFixed(5);
    const lon = longitude.toFixed(5);
    return { latitude, longitude, label: `${lat}, ${lon}` };
  }
  function mapPinLink(item) {
    const point = coordinates(item && item.latitude, item && item.longitude);
    if (!point) return '';
    const label = escapeHtml(item && item.location_label || '');
    return `<button class="location-map-link" type="button" data-map-pin data-lat="${point.latitude}" data-lon="${point.longitude}" data-map-label="${label}">View pin in app map</button>`;
  }
  function updateLocationMapLink() {
    const buttonLabel = $('#location-map-button-text');
    const point = coordinates($('#latitude').value, $('#longitude').value);
    if (buttonLabel) buttonLabel.textContent = point ? `Change pin · ${point.label}` : 'Choose location on map';
  }
  function renderMediaMarkup(media, context) {
    const items = (Array.isArray(media) ? media : []).filter((item) => item && item.signed_url);
    if (!items.length) return '';
    const visible = context === 'feed' ? items.slice(0, 1) : items;
    return `<div class="incident-media incident-media-${context}" aria-label="Incident attachments">${visible.map((item, index) => {
      const src = escapeHtml(item.signed_url);
      if (item.media_type === 'video') return `<div class="incident-media-item"><video controls playsinline preload="metadata" src="${src}" aria-label="Incident video ${index + 1}"></video></div>`;
      return `<div class="incident-media-item"><img src="${src}" alt="Photo attached to incident report ${index + 1}" loading="lazy"></div>`;
    }).join('')}</div>`;
  }
  function handleIncidentMediaError(event) {
    const element = event.target;
    if (!element || typeof element.matches !== 'function' || !element.matches('.incident-media img, .incident-media video')) return;
    const wrapper = element.closest('.incident-media-item');
    if (!wrapper || wrapper.querySelector('.incident-media-unavailable')) return;
    const notice = document.createElement('p');
    notice.className = 'incident-media-unavailable';
    notice.setAttribute('role', 'status');
    notice.textContent = 'This attachment could not be loaded or played on this device.';
    wrapper.replaceChildren(notice);
  }
  function setStartupProgress(value, text) {
    const bar = $('#initProgressBar');
    const label = $('#initStatusText');
    if (bar) { bar.setAttribute('aria-valuenow', String(value)); bar.firstElementChild.style.width = `${value}%`; }
    if (label) label.textContent = text;
  }
  function showWelcome() {
    $('#startup-splash').hidden = true;
    $('#app-shell').hidden = true;
    $('#screen-onboarding').hidden = false;
  }
  function showApplication(name) {
    $('#startup-splash').hidden = true;
    $('#screen-onboarding').hidden = true;
    $('#app-shell').hidden = false;
    showScreen(name || 'feed');
  }
  function showStartupFailure(message) {
    $('#startup-error-message').textContent = message;
    $('#startup-error').hidden = false;
    $('#startup-guest').hidden = false;
    setStartupProgress(100, 'Could not check sign-in status');
  }
  function isInvalidSessionError(error) {
    const status = Number(error && error.status);
    const detail = `${error && error.name || ''} ${error && error.code || ''} ${error && error.message || ''}`.toLowerCase();
    return status === 401 || status === 403 || /invalid[_ -]?(jwt|token|grant)|jwt[_ -]?expired|refresh token.*not found|session.*missing/.test(detail);
  }
  function completeOnboarding() { showApplication('feed'); }
  function handleAuthStateChange(event, nextSession) {
    if (event === 'INITIAL_SESSION') return;
    if (!startupResolved) { pendingStartupAuth = { event, session: nextSession || null }; return; }
    if (event === 'SIGNED_OUT') {
      authResolved = true;
      updateSession(null);
      showWelcome();
      return;
    }
    if (nextSession) {
      authResolved = true;
      updateSession(nextSession);
      if ($('#app-shell').hidden) setTimeout(() => showApplication('feed'), 0);
    }
  }
  function exchangeAuthCallback(url) {
    const key = String(url || '').trim();
    if (!key) return Promise.resolve({ data: null, error: new Error('The confirmation link is empty.') });
    if (!authCallbackPromises.has(key)) {
      const request = Promise.resolve().then(() => window.BincomData.handleAuthRedirect(key))
        .catch((error) => ({ data: null, error }));
      authCallbackPromises.set(key, request);
      window.setTimeout(() => authCallbackPromises.delete(key), 30000);
    }
    return authCallbackPromises.get(key);
  }
  function showAuthCallbackNotice(message, isError) {
    const notice = $('#auth-callback-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.className = `auth-callback-notice${isError ? ' error' : ''}`;
    notice.hidden = false;
    window.setTimeout(() => { if (notice.textContent === message) notice.hidden = true; }, 8000);
  }
  async function processIncomingAuthCallback(url) {
    const result = await exchangeAuthCallback(url);
    if (result.error) {
      if (!startupResolved) { startupAuthCallbackError = result.error.message || 'The email confirmation link could not be verified.'; return; }
      openAuth('welcome', 'signin');
      authMessage(result.error.message || 'The email confirmation link could not be verified. Request a new email and try again.', 'error');
      return;
    }
    let nextSession = result.data && result.data.session || null;
    if (!nextSession) {
      const restored = await window.BincomData.getSession();
      nextSession = restored.data && restored.data.session || null;
    }
    if (!nextSession) {
      const message = 'The email link was opened, but Supabase did not create a signed-in session. Check the link and try again.';
      if (!startupResolved) { startupAuthCallbackError = message; return; }
      openAuth('welcome', 'signin');
      authMessage(message, 'error');
      return;
    }
    if (!startupResolved) { startupAuthCallbackSuccess = true; return; }
    authResolved = true;
    updateSession(nextSession);
    showApplication('feed');
    showAuthCallbackNotice('Email confirmed. You are signed in.', false);
  }
  async function initializeStartup() {
    if (startupBusy) return;
    startupBusy = true;
    $('#startup-error').hidden = true;
    setStartupProgress(16, 'Starting WeSignal');
    try {
      if (!authSubscription) {
        const listener = window.BincomData.onAuthStateChange(handleAuthStateChange);
        authSubscription = listener && listener.data && listener.data.subscription;
      }
      if (!window.BincomData.isConfigured()) throw new Error(window.BincomData.configurationMessage());
      const callbackUrl = String(window.__weSignalPendingAuthUrl || '').trim();
      if (callbackUrl) {
        window.__weSignalPendingAuthUrl = '';
        await processIncomingAuthCallback(callbackUrl);
      }
      setStartupProgress(42, 'Restoring sign-in state');
      const restored = await window.BincomData.getSession();
      if (restored.error) throw restored.error;
      let current = restored.data && restored.data.session || null;
      if (!current && pendingStartupAuth && pendingStartupAuth.session && pendingStartupAuth.event === 'SIGNED_IN') current = pendingStartupAuth.session;
      if (pendingStartupAuth && pendingStartupAuth.event === 'SIGNED_OUT') current = null;
      if (current) {
        setStartupProgress(68, 'Verifying your account');
        const verified = await window.BincomData.getUser();
        if (verified.error) {
          if (!isInvalidSessionError(verified.error)) throw verified.error;
          await window.BincomData.clearLocalSession();
          current = null;
        } else if (!verified.data || !verified.data.user) {
          await window.BincomData.clearLocalSession();
          current = null;
        } else current = { ...current, user: verified.data.user };
      }
      if (pendingStartupAuth && pendingStartupAuth.event === 'SIGNED_OUT') current = null;
      pendingStartupAuth = null;
      authResolved = true;
      startupResolved = true;
      updateSession(current);
      setStartupProgress(92, current ? 'Opening Explore' : 'Preparing welcome');
      if (current) showApplication('feed');
      else showWelcome();
      if (startupAuthCallbackError) {
        const message = startupAuthCallbackError;
        startupAuthCallbackError = '';
        if (current) showAuthCallbackNotice(message, true);
        else { openAuth('welcome', 'signin'); authMessage(message, 'error'); }
      } else if (current && startupAuthCallbackSuccess) {
        startupAuthCallbackSuccess = false;
        showAuthCallbackNotice('Email confirmed. You are signed in.', false);
      }
    } catch (error) {
      // Keep any persisted session intact; a network or initialization failure is not proof of sign-out.
      authResolved = false;
      startupResolved = false;
      updateSession(null);
      const message = error && error.message && /not configured|could not be initialized/i.test(error.message)
        ? error.message
        : 'We couldn’t verify your sign-in. Check your connection and try again. Your saved session has not been cleared.';
      showStartupFailure(message);
    } finally {
      startupBusy = false;
      const deferredUrl = String(window.__weSignalPendingAuthUrl || '').trim();
      if (startupResolved && deferredUrl) {
        window.__weSignalPendingAuthUrl = '';
        processIncomingAuthCallback(deferredUrl);
      }
    }
  }
  function showScreen(name) {
    screens.forEach((screen) => { const active = screen.id === `screen-${name}`; screen.hidden = !active; screen.classList.toggle('is-active', active); });
    const screenTitles = { feed: 'Explore', detail: 'Incident details', auth: session ? 'Your account' : 'Authentication', report: 'Report an issue', reports: 'My Reports' };
    $('#header-screen-title').textContent = screenTitles[name] || 'WeSignal';
    document.body.classList.toggle('feed-screen-active', name === 'feed');
    document.body.classList.toggle('detail-screen-active', name === 'detail');
    document.body.classList.toggle('report-screen-active', name === 'report');
    document.body.classList.toggle('reports-screen-active', name === 'reports');
    document.body.classList.toggle('form-active', name === 'report' || name === 'auth');
    document.body.classList.toggle('auth-screen-active', name === 'auth');
    document.body.classList.remove('keyboard-open');
    document.querySelectorAll('[data-screen]').forEach((node) => node.classList.toggle('is-selected', node.dataset.screen === name));
    if (name === 'feed') loadFeed();
    if (name === 'report') updateGate();
    if (name === 'reports' || (name === 'auth' && session)) loadReports();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function state(el,title,body,retry) { const headingId=el.id==='detail-content'?' id="detail-title"':''; el.innerHTML=`<h3${headingId}>${title}</h3><p>${body}</p>${retry?'<button class="secondary-button retry-button" type="button">Try again</button>':''}`; if(retry) el.querySelector('button').addEventListener('click',retry); }
  function serviceErrorText(error) {
    const helper = window.WeSignalServiceErrors;
    return helper ? helper.describe(error, window.navigator && window.navigator.onLine) : escapeHtml(error && error.message || 'The service request failed.');
  }
  function showFeedFailure(target, error, retry) {
    const helper = window.WeSignalServiceErrors;
    const online = window.navigator && window.navigator.onLine;
    if (helper && helper.isOffline(error, online)) {
      state(target, 'Internet connection not working', 'Please check your internet connection and try again. Published incidents remain connected to real data; no sample content has been shown.', retry);
      return;
    }
    const diagnostic = escapeHtml(serviceErrorText(error));
    state(target, 'We could not load incidents', `${diagnostic || 'The service request failed.'} Published incidents have not been replaced with sample content.`, retry);
  }
  function dismissNewIncidentNotification() {
    const notice = $('#new-incident-notification');
    if (notice) notice.hidden = true;
    if (notificationHideTimer) { clearTimeout(notificationHideTimer); notificationHideTimer = null; }
  }
  function notifyNewPublicIncident(report) {
    if (!report || report.is_public !== true || !report.id || seenIncidentNotificationIds.has(report.id)) return;
    seenIncidentNotificationIds.add(report.id);
    if (seenIncidentNotificationIds.size > 100) seenIncidentNotificationIds.delete(seenIncidentNotificationIds.values().next().value);
    if (session && session.user && report.reporter_id === session.user.id) return;
    const title = $('#new-incident-notification-title');
    const notice = $('#new-incident-notification');
    if (!title || !notice) return;
    title.textContent = report.title || 'A new incident was added to Explore.';
    notice.hidden = false;
    if (notificationHideTimer) clearTimeout(notificationHideTimer);
    notificationHideTimer = setTimeout(dismissNewIncidentNotification, 12000);
    if (!$('#screen-feed').hidden) loadFeed();
  }
  function subscribeToPublicIncidentNotifications() {
    if (publicIncidentSubscription || !window.BincomData.isConfigured()) return;
    try { publicIncidentSubscription = window.BincomData.subscribeToPublicIncidentInserts(notifyNewPublicIncident); }
    catch (error) { console.warn('Live incident notifications could not start:', serviceErrorText(error)); }
  }
  function renderFilters() {
    const el = $('#category-filters');
    const filters = ['all', ...Object.keys(labels)];
    el.innerHTML = filters.map((key) => {
      const count = key === 'all' ? incidents.length : incidents.filter((item) => item.category === key).length;
      const label = key === 'all' ? 'All' : labels[key];
      return `<button class="filter-chip${activeFilter === key ? ' active' : ''}" type="button" data-filter="${key}" aria-pressed="${activeFilter === key}"><span>${label}</span><span class="feed-filter-count">${count}</span></button>`;
    }).join('');
    el.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
      activeFilter = button.dataset.filter;
      $('#reset-filter').hidden = activeFilter === 'all' && !searchQuery;
      renderFilters();
      renderIncidents();
    }));
  }
  function renderIncidents() {
    const list = $('#incident-list');
    const query = searchQuery;
    const rows = incidents.filter((item) => {
      const inCategory = activeFilter === 'all' || item.category === activeFilter;
      const haystack = [item.title, item.description, item.location_label, labels[item.category] || item.category, statuses[item.status] || item.status].join(' ').toLowerCase();
      return inCategory && (!query || haystack.includes(query));
    });
    $('#feed-result-count').textContent = incidents.length ? `${rows.length} of ${incidents.length} public ${incidents.length === 1 ? 'incident' : 'incidents'}` : '';
    list.innerHTML = rows.map((item) => {
      const category = escapeHtml(labels[item.category] || item.category || 'Incident');
      const status = escapeHtml(statuses[item.status] || item.status || 'Published');
      const point = coordinates(item.latitude, item.longitude);
      const locationText = item.location_label || (point && point.label);
      const location = locationText ? `<p class="feed-card-location"><span aria-hidden="true">⌖</span>${escapeHtml(locationText)}</p>${point ? mapPinLink(item) : ''}` : '';
      const created = escapeHtml(item.created_at || '');
      return `<li class="feed-incident-item"><article class="feed-incident-card"><div class="feed-card-meta"><span class="feed-category-chip">${category}</span><time datetime="${created}">${escapeHtml(relativeDate(item.created_at))}</time><span class="feed-status-chip">${status}</span></div><h3>${escapeHtml(item.title)}</h3>${location}<p class="feed-card-description">${escapeHtml(item.description || '')}</p>${renderMediaMarkup(incidentMedia[item.id], 'feed')}<button class="feed-details-button" type="button" data-incident="${escapeHtml(item.id)}">View details <span aria-hidden="true">→</span></button></article></li>`;
    }).join('');
    list.querySelectorAll('[data-incident]').forEach((button) => button.addEventListener('click', () => openDetail(button.dataset.incident)));
    const empty = $('#feed-state');
    if (!rows.length) {
      empty.hidden = false;
      if (incidents.length && (activeFilter !== 'all' || query)) state(empty, 'No matching incidents', 'Try another category or edit your search to see more public reports.');
      else state(empty, 'No public incidents yet', 'There are no incidents currently published to the community feed.');
    } else empty.hidden = true;
  }
  async function loadFeed() {
    const requestId = ++feedRequest;
    const st = $('#feed-state');
    const mediaState = $('#feed-media-state');
    st.hidden = false;
    st.innerHTML = '<div class="skeleton" aria-label="Loading incidents"></div>';
    $('#incident-list').innerHTML = '';
    mediaState.hidden = true;
    if (!window.BincomData.isConfigured()) { state(st, 'Public feed is not connected', window.BincomData.configurationMessage()); return; }
    try {
      const result = await window.BincomData.listPublicReports();
      if (requestId !== feedRequest) return;
      if (result.error) {
        console.error('Published incident query failed:', serviceErrorText(result.error));
        showFeedFailure(st, result.error, loadFeed);
        return;
      }
      incidents = result.data || [];
      incidentMedia = Object.create(null);
      if (incidents.length) {
        const mediaResult = await window.BincomData.listReportMedia(incidents.map((item) => item.id));
        if (requestId !== feedRequest) return;
        (mediaResult.data || []).forEach((item) => {
          if (!incidentMedia[item.report_id]) incidentMedia[item.report_id] = [];
          incidentMedia[item.report_id].push(item);
        });
        if (mediaResult.error || mediaResult.failedCount) {
          mediaState.textContent = 'Some incident photos or videos could not be loaded. Refresh the feed to try again.';
          mediaState.hidden = false;
        }
      }
      renderFilters();
      renderIncidents();
    } catch (error) {
      if (requestId !== feedRequest) return;
      console.error('Published incident query threw an exception:', serviceErrorText(error));
      showFeedFailure(st, error, loadFeed);
    }
  }
  async function openDetail(id) {
    const requestId = ++detailRequest;
    currentDetailId = id;
    showScreen('detail');
    const target = $('#detail-content');
    target.innerHTML = window.WeSignalIncidentDetailView.loadingMarkup();
    const fallback = incidents.find((item) => item.id === id);
    if (!fallback) { state(target, 'Incident unavailable', 'This published incident could not be found. Return to the feed and try again.', loadFeed); return; }
    try {
      const result = await window.BincomData.getPublicReport(id);
      if (requestId !== detailRequest) return;
      const incident = result.data || fallback;
      if (result.error && !incident) { state(target, 'Incident unavailable', 'This incident may no longer be published. Return to the feed and try again.'); return; }
      const [mediaResult, confirmationResult] = await Promise.all([
        window.BincomData.listReportMedia([id]),
        window.BincomData.getPublicReportConfirmationSummary(id)
      ]);
      if (requestId !== detailRequest) return;
      if (confirmationResult.error) console.error('Public confirmation summary query failed:', serviceErrorText(confirmationResult.error));
      const mediaHtml = renderMediaMarkup(mediaResult.data, 'detail');
      const mediaUnavailable = Boolean(mediaResult.error || (mediaResult.failedCount && !mediaHtml));
      const mediaWarning = mediaResult.failedCount && mediaHtml
        ? 'Some attachments could not be loaded. The visible attachments are still available.' : '';
      const point = coordinates(incident.latitude, incident.longitude);
      target.innerHTML = window.WeSignalIncidentDetailView.render({
        incident,
        summary: confirmationResult.error ? { error: true, errorMessage: serviceErrorText(confirmationResult.error) } : confirmationResult.data,
        signedIn: Boolean(session),
        categoryLabel: labels[incident.category] || incident.category,
        statusLabel: statuses[incident.status] || incident.status || 'Published',
        dateText: date(incident.created_at),
        point,
        locationActionHtml: point ? mapPinLink(incident) : '',
        mediaHtml,
        mediaState: mediaUnavailable ? 'error' : 'ready',
        mediaWarning,
        reportWarning: result.error ? 'Could not refresh this incident from Supabase; showing the last feed data available on this device.' : ''
      });
    } catch (_) {
      if (requestId !== detailRequest) return;
      state(target, 'Incident details are unavailable', 'Check your connection and try loading this incident again.', () => openDetail(id));
    }
  }
  async function submitResolutionConfirmation(reportId, button) {
    if (!session) { openAuth('detail', 'signin'); return; }
    button.disabled = true;
    button.textContent = 'Saving confirmation…';
    let message = '';
    let feedbackType = 'success';
    try {
      const result = await window.BincomData.confirmReportResolution(reportId);
      if (result.error) { message = result.error.message || 'Your confirmation could not be saved.'; feedbackType = 'error'; }
      else if (result.data && result.data.confirmed) message = result.data.status === 'resolved' ? 'Your confirmation was recorded. This incident is now resolved.' : 'Your confirmation was recorded.';
      else if (result.data && result.data.status === 'resolved') message = 'This incident is already resolved.';
      else message = 'You have already confirmed this incident.';
    } catch (error) {
      message = error && error.message || 'Your confirmation could not be saved.';
      feedbackType = 'error';
    }
    await openDetail(reportId);
    const feedback = $('#resolution-feedback');
    if (feedback) { feedback.textContent = message; feedback.className = `detail-confirmation-feedback${feedbackType === 'error' ? ' is-error' : ''}`; feedback.hidden = !message; }
  }

  function authMessage(text, type) {
    const node = $('#auth-message');
    node.textContent = text || '';
    node.className = type ? `auth-alert ${type}` : 'auth-alert';
    node.hidden = !text;
  }
  function renderAccountDashboard() {
    if (!session || !session.user) return;
    const user = session.user;
    const metadata = user.user_metadata || {};
    const email = String(user.email || '');
    const displayName = String(metadata.display_name || metadata.full_name || metadata.name || email.split('@')[0] || 'WeSignal member').trim();
    const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase() || email.charAt(0).toUpperCase() || 'W';
    $('#account-avatar').textContent = initials;
    $('#account-display-name').textContent = displayName;
    $('#account-email').textContent = email || 'Email unavailable';
    const loaded = myReportsState === 'ready';
    const active = myReports.filter((item) => item.status !== 'resolved').length;
    const resolved = myReports.filter((item) => item.status === 'resolved').length;
    $('#account-stat-total').textContent = loaded ? String(myReports.length) : '—';
    $('#account-stat-active').textContent = loaded ? String(active) : '—';
    $('#account-stat-resolved').textContent = loaded ? String(resolved) : '—';
    $('#account-report-count').textContent = loaded ? String(myReports.length) : '—';
    const message = $('#account-stats-message');
    message.className = `account-stats-message${myReportsState === 'error' ? ' is-error' : ''}`;
    message.textContent = myReportsState === 'loading'
      ? 'Loading your report activity…'
      : myReportsState === 'error'
      ? 'Report activity could not be loaded. Use refresh to try again.'
      : loaded && myReports.length === 0
      ? 'Your submitted reports will appear here.'
      : loaded
      ? 'Counts are based on reports submitted from this account.'
      : 'Your report activity will appear here.';
  }
  function updateSession(next) {
    const previousUserId = session && session.user && session.user.id;
    const nextUserId = next && next.user && next.user.id;
    if (previousUserId !== nextUserId) { reportsRequest += 1; myReports = []; myReportsState = 'idle'; }
    session = next || null;
    $('#auth-public-content').hidden = !!session;
    $('#account-dashboard').hidden = !session;
    $('#auth-form').hidden = !!session;
    $('#auth-title').textContent = session ? 'Your account' : 'Welcome to WeSignal';
    $('#auth-screen-heading').textContent = session ? 'Your account' : 'Authentication';
    $('#screen-auth').setAttribute('aria-labelledby', session ? 'account-dashboard-title' : 'auth-title');
    if (session) renderAccountDashboard();
    updateGate();
  }
  function updateGate() { $('#report-gate').hidden = !!session; }
  function setAuthMode(mode) {
    authMode = mode === 'signup' ? 'signup' : 'signin';
    const signup = authMode === 'signup';
    $('#tab-signin').classList.toggle('is-active', !signup);
    $('#tab-signup').classList.toggle('is-active', signup);
    $('#tab-signin').setAttribute('aria-selected', String(!signup));
    $('#tab-signup').setAttribute('aria-selected', String(signup));
    const confirmField = $('#auth-confirm-field');
    const confirm = $('#auth-confirm-password');
    confirmField.hidden = !signup;
    confirm.disabled = !signup;
    confirm.required = signup;
    if (!signup) confirm.value = '';
    $('#signup-password-hints').hidden = !signup;
    $('#forgot-password-btn').hidden = signup;
    $('#auth-password').autocomplete = signup ? 'new-password' : 'current-password';
    $('#submit-text').textContent = signup ? 'Create Account' : 'Sign In';
    $('#auth-submit').setAttribute('aria-label', signup ? 'Create account' : 'Sign in');
    authMessage('', '');
  }
  function openAuth(from, mode) {
    returnScreen = from || 'report';
    if (returnScreen === 'welcome') {
      $('#startup-splash').hidden = true;
      $('#screen-onboarding').hidden = true;
      $('#app-shell').hidden = false;
    }
    setAuthMode(mode || 'signin');
    showScreen('auth');
    if (!session) setTimeout(() => $('#auth-email').focus({ preventScroll: true }), 60);
  }
  function updatePasswordStrength(value) {
    const bar = $('#strength-bar');
    const label = $('#strength-label');
    const level = value.length < 6 ? 1 : value.length < 10 ? 2 : 3;
    bar.style.width = `${level * 33.333}%`;
    bar.dataset.level = String(level);
    label.textContent = value.length < 6 ? 'Too short' : value.length < 10 ? 'Meets minimum' : 'Longer is stronger';
  }
  function validateEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()); }
  async function authenticate() {
    if (authBusy) return;
    const action = authMode;
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const confirmPassword = $('#auth-confirm-password').value;
    $('#auth-email-error').hidden = !email || validateEmail(email);
    $('#auth-email-check').hidden = !validateEmail(email);
    if (!validateEmail(email)) { authMessage('Enter a valid email address.', 'error'); $('#auth-email').focus(); return; }
    if (password.length < 6) { authMessage('Password must be at least 6 characters.', 'error'); $('#auth-password').focus(); return; }
    if (action === 'signup' && password !== confirmPassword) { authMessage('Passwords do not match. Check both password fields.', 'error'); $('#auth-confirm-password').focus(); return; }
    if (!window.BincomData.isConfigured()) { authMessage(window.BincomData.configurationMessage(), 'error'); return; }
    authBusy = true;
    const submit = $('#auth-submit');
    submit.disabled = true;
    $('#submit-spinner').hidden = false;
    $('#submit-arrow').hidden = true;
    $('#submit-text').textContent = authMode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      const result = action === 'signup'
        ? await window.BincomData.signUp(email, password)
        : await window.BincomData.signIn(email, password);
      if (result.error) { authMessage(result.error.message || 'Authentication failed. Please try again.', 'error'); return; }
      const nextSession = result.data && result.data.session;
      if (action === 'signup' && !nextSession) {
        setAuthMode('signin');
        authMessage('Account created. Check your email to confirm it, then sign in.', 'success');
        return;
      }
      if (!nextSession) { authMessage('We could not establish a signed-in session. Please try again.', 'error'); return; }
      startupResolved = true;
      authResolved = true;
      pendingStartupAuth = null;
      updateSession(nextSession);
      authMessage('You are signed in.', 'success');
      if (returnScreen === 'welcome') showApplication('feed');
      else showScreen(returnScreen);
    } catch (error) {
      authMessage(error && error.message ? error.message : 'A network error prevented sign-in. Check your connection and try again.', 'error');
    } finally {
      authBusy = false;
      submit.disabled = false;
      $('#submit-spinner').hidden = true;
      $('#submit-arrow').hidden = false;
      $('#submit-text').textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
    }
  }
  async function requestPasswordReset() {
    const email = $('#auth-email').value.trim();
    if (!validateEmail(email)) { authMessage('Enter your email address above before requesting a reset link.', 'error'); $('#auth-email').focus(); return; }
    if (!window.BincomData.isConfigured()) { authMessage(window.BincomData.configurationMessage(), 'error'); return; }
    const button = $('#forgot-password-btn');
    button.disabled = true;
    try {
      const result = await window.BincomData.resetPassword(email);
      if (result.error) authMessage(result.error.message || 'Could not send a password reset email. Please try again.', 'error');
      else authMessage('If an account exists for this email, a password reset link will be sent.', 'success');
    } catch (error) { authMessage(error && error.message ? error.message : 'A network error prevented the reset request.', 'error'); }
    finally { button.disabled = false; }
  }
  function formMessage(text,type){const n=$('#form-message');n.textContent=text;n.className=type?`form-message ${type}`:'form-message';}
  function reportSubmissionMessage(matches) {
    const candidates = Array.isArray(matches) ? matches.slice(0, 5) : [];
    if (!candidates.length) return 'Report submitted successfully. It is now visible in Explore; any optional GPS coordinates are public too.';
    const summaries = candidates.map((item) => `“${String(item && item.title || 'Similar incident')}” (${date(item && item.created_at)})`);
    return `Report submitted successfully and remains a separate report. We found ${candidates.length} possible similar ${candidates.length === 1 ? 'incident' : 'incidents'}: ${summaries.join('; ')}. Please review them in Explore.`;
  }
  function markReportDraft() {
    $('#report-progress-state').textContent = 'Not submitted';
    if ($('#form-message').classList.contains('success')) formMessage('', '');
  }
  function setReportCategory(value) {
    const select = $('#category');
    select.value = value || '';
    document.querySelectorAll('[data-report-category]').forEach((button) => {
      const selected = button.dataset.reportCategory === value;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : (value ? -1 : (button.dataset.reportCategory === 'roads_infrastructure' ? 0 : -1));
    });
  }
  function validate(d) {
    if (!d.title || d.title.trim().length < 3) return 'Add a short title with at least 3 characters.';
    if (d.title.trim().length > 120) return 'The title must be 120 characters or fewer.';
    if (!Object.hasOwn(labels, d.category)) return 'Choose an incident category.';
    if (!d.description || d.description.trim().length < 10) return 'Add at least 10 characters describing the issue.';
    if (d.description.trim().length > 2000) return 'The description must be 2,000 characters or fewer.';
    if (d.location_label && d.location_label.trim().length > 240) return 'The location must be 240 characters or fewer.';
    const hasLatitude = String(d.latitude || '').trim() !== '';
    const hasLongitude = String(d.longitude || '').trim() !== '';
    if (hasLatitude !== hasLongitude) return 'Location coordinates must include both latitude and longitude.';
    if (hasLatitude) {
      const latitude = Number(d.latitude);
      const longitude = Number(d.longitude);
      if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return 'Enter valid location coordinates before submitting.';
    }
    return '';
  }
  function resetReportEditor() {
    editingReportId = null;
    $('#report-title').textContent = 'Report an incident';
    $('#report-submit-button').innerHTML = '<span aria-hidden="true">↑</span> Submit incident report';
    $('#report-progress-state').textContent = 'Not submitted';
    $('#report-media-heading').parentElement.querySelector('p').textContent = 'Choose up to three clear images or clips.';
    window.ReportMedia.clear();
    $('#report-form').reset();
    setReportCategory('');
    updateLocationMapLink();
  }
  async function beginEditReport(id) {
    const item = myReports.find((report) => report.id === id);
    if (!item) return;
    editingReportId = id;
    $('#report-title').textContent = 'Edit your report';
    $('#report-submit-button').innerHTML = '<span aria-hidden="true">✓</span> Save changes';
    $('#title').value = item.title || '';
    $('#description').value = item.description || '';
    $('#location-label').value = item.location_label || '';
    $('#latitude').value = item.latitude ?? '';
    $('#longitude').value = item.longitude ?? '';
    setReportCategory(item.category || '');
    $('#title-count').textContent = String($('#title').value.length);
    $('#description-count').textContent = String($('#description').value.length);
    $('#clear-location').hidden = !coordinates(item.latitude, item.longitude);
    updateLocationMapLink();
    formMessage('', '');
    window.ReportMedia.clear();
    showScreen('report');
  }
  async function deleteOwnReport(id) {
    const item = myReports.find((report) => report.id === id);
    if (!item || !window.confirm(`Delete “${item.title || 'this report'}”? This cannot be undone.`)) return;
    const result = await window.BincomData.accountAction('delete-report', id);
    if (result.error) { showReportsState('Report was not deleted', result.error.message || 'Try again.', [{ label: 'Try again', action: 'retry', className: 'secondary-button' }], 'error'); return; }
    incidents = incidents.filter((report) => report.id !== id);
    delete incidentMedia[id];
    renderIncidents();
    await loadReports();
  }
  async function deleteAccount() {
    if (!session) return;
    const confirmed = window.confirm('Delete your account permanently? This removes your profile, reports, and stored report media. This cannot be undone.');
    if (!confirmed) return;
    const button = $('#delete-account');
    button.disabled = true;
    button.textContent = 'Deleting account…';
    try {
      const result = await window.BincomData.accountAction('delete-account');
      if (result.error) { authMessage(result.error.message || 'The account could not be deleted.', 'error'); return; }
      await window.BincomData.clearLocalSession();
      authResolved = true;
      updateSession(null);
      showWelcome();
    } finally {
      button.disabled = false;
      button.textContent = 'Delete account';
    }
  }
  async function submitReport(e) {
    e.preventDefault();
    formMessage('', '');
    const form = $('#report-form');
    const data = Object.fromEntries(new FormData(form).entries());
    const validationError = validate(data);
    if (validationError) { formMessage(validationError, 'error'); if (!data.category) $('[data-report-category]').focus(); else if (!data.title || data.title.trim().length < 3) $('#title').focus(); else if (!data.description || data.description.trim().length < 10) $('#description').focus(); return; }
    if (!session) { formMessage('Sign in is required before submitting a report. No report was sent.', 'error'); openAuth('report'); return; }
    if (!window.BincomData.isConfigured()) { formMessage(window.BincomData.configurationMessage() + ' Nothing was sent.', 'error'); return; }
    const attachments = window.ReportMedia.getSelected();
    const button = $('#report-submit-button');
    button.disabled = true;
    window.ReportMedia.setBusy(true);
    $('#report-progress-state').textContent = attachments.length ? 'Uploading attachments…' : (editingReportId ? 'Saving changes…' : 'Submitting…');
    button.innerHTML = editingReportId ? 'Saving changes…' : '<span class="report-submit-spinner" aria-hidden="true"></span> Submitting report…';
    try {
      const payload = { id: editingReportId, title: data.title.trim(), category: data.category, description: data.description.trim(), location_label: data.location_label.trim() || null, latitude: data.latitude ? Number(data.latitude) : null, longitude: data.longitude ? Number(data.longitude) : null };
      let result;
      if (editingReportId) {
        result = await window.BincomData.updateReport(payload);
        if (!result.error && attachments.length) result = await window.BincomData.appendReportMedia(editingReportId, attachments, (progress) => { $('#report-progress-state').textContent = `Uploading attachment ${progress.index} of ${progress.total} · ${progress.percent}%`; });
      } else {
        result = await window.BincomData.createReport(payload, attachments, (progress) => { if (progress.stage === 'upload') { const text = `Uploading attachment ${progress.index} of ${progress.total} · ${progress.percent}%`; $('#report-progress-state').textContent = text; window.ReportMedia.setStatus(text, 'progress'); } else { $('#report-progress-state').textContent = 'Saving report…'; window.ReportMedia.setStatus('Saving report details…', 'progress'); } });
      }
      if (result.error) {
        const message = result.mayHaveSubmitted
          ? `We could not confirm whether the report was saved. Check My Reports before retrying. ${result.error.message}`
          : `Could not save changes: ${result.error.message}`;
        formMessage(message, 'error');
        $('#report-progress-state').textContent = result.mayHaveSubmitted ? 'Save outcome unknown' : 'Not saved';
        return;
      }
      const wasEditing = Boolean(editingReportId);
      if (wasEditing) {
        const feedIndex = incidents.findIndex((report) => report.id === payload.id);
        if (feedIndex >= 0) incidents[feedIndex] = { ...incidents[feedIndex], ...payload };
        renderIncidents();
      }
      resetReportEditor();
      formMessage(wasEditing ? 'Report updated successfully.' : reportSubmissionMessage(result.data && result.data.potentialDuplicates), 'success');
      $('#report-progress-state').textContent = wasEditing ? 'Changes saved' : 'Reported · public';
      if (wasEditing) showScreen('reports');
    } catch (error) { formMessage(`Could not save the report: ${error && error.message ? error.message : 'Check your connection and try again.'}`, 'error'); }
    finally { window.ReportMedia.setBusy(false); button.disabled = false; if (!editingReportId) button.innerHTML = '<span aria-hidden="true">↑</span> Submit incident report'; }
  }
  function showReportsState(title, body, actions = [], kind = 'empty') {
    const panel = $('#reports-state');
    panel.hidden = false;
    panel.className = `reports-state reports-state-${kind}`;
    $('#reports-state-title').textContent = title;
    $('#reports-state-copy').textContent = body;
    const actionBox = $('#reports-state-actions');
    actionBox.replaceChildren();
    actions.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = item.className || 'secondary-button';
      button.textContent = item.label;
      if (item.auth) button.dataset.reportsAuth = item.auth;
      if (item.action) button.dataset.reportsAction = item.action;
      actionBox.append(button);
    });
  }
  function renderMyReports() {
    const active = myReports.filter((item) => item.status !== 'resolved');
    const resolved = myReports.filter((item) => item.status === 'resolved');
    $('#reports-count-all').textContent = myReports.length;
    $('#reports-count-active').textContent = active.length;
    $('#reports-count-resolved').textContent = resolved.length;
    $('#reports-summary').textContent = `${myReports.length} report${myReports.length === 1 ? '' : 's'} on this account`;
    document.querySelectorAll('[data-reports-filter]').forEach((button) => {
      const selected = button.dataset.reportsFilter === reportsFilter;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const filtered = reportsFilter === 'active' ? active : reportsFilter === 'resolved' ? resolved : myReports;
    const list = $('#reports-list');
    if (!filtered.length) {
      list.hidden = true;
      list.replaceChildren();
      const label = reportsFilter === 'resolved' ? 'resolved' : 'active';
      showReportsState(`No ${label} reports`, reportsFilter === 'resolved' ? 'Resolved reports from your account will appear here.' : 'Reports that are still open will appear here.', reportsFilter === 'active' ? [{ label: 'Report an incident', action: 'create', className: 'primary-button' }] : []);
      return;
    }
    $('#reports-state').hidden = true;
    list.hidden = false;
    list.innerHTML = filtered.map((item) => {
      const statusKey = Object.hasOwn(statuses, item.status) ? item.status : 'unknown';
      const statusLabel = statuses[statusKey] || 'Status unavailable';
      const categoryLabel = labels[item.category] || item.category || 'Other';
      const description = typeof item.description === 'string' ? item.description.trim() : '';
      const excerpt = description.length > 180 ? `${description.slice(0, 177).trimEnd()}…` : description;
      const createdAt = item.created_at || '';
      const point = coordinates(item.latitude, item.longitude);
      const location = item.location_label || (point && point.label) || 'No location added';
      const mapLink = point ? mapPinLink(item) : '';
      return `<li class="account-report-card"><div class="account-report-top"><div class="account-report-badges"><span class="account-report-status status-${statusKey}">${escapeHtml(statusLabel)}</span><span class="account-report-category">${escapeHtml(categoryLabel)}</span></div><time datetime="${escapeHtml(createdAt)}">${escapeHtml(date(createdAt))}</time></div><h3>${escapeHtml(item.title || 'Untitled report')}</h3><p class="account-report-description">${escapeHtml(excerpt)}</p><div class="account-report-location"><span aria-hidden="true">⌖</span><span>${escapeHtml(location)}</span>${mapLink}</div><div class="account-report-actions"><button type="button" class="secondary-button report-card-action" data-report-edit="${escapeHtml(item.id)}">Edit</button><button type="button" class="danger-button report-card-action" data-report-delete="${escapeHtml(item.id)}">Delete</button></div></li>`;
    }).join('');
  }
  async function loadReports() {
    const requestId = ++reportsRequest;
    myReports = [];
    $('#reports-list').replaceChildren();
    $('#reports-list').hidden = true;
    $('#reports-filters').hidden = true;
    $('#reports-count-all').textContent = '0';
    $('#reports-count-active').textContent = '0';
    $('#reports-count-resolved').textContent = '0';
    if (!session) {
      myReportsState = 'idle';
      $('#reports-summary').textContent = 'Sign in to view your reports';
      showReportsState('Your reports are private', 'Sign in to view reports submitted from your account. Reports are not available in guest mode.', [
        { label: 'Sign in', auth: 'signin', className: 'primary-button' },
        { label: 'Create account', auth: 'signup', className: 'secondary-button' }
      ], 'access');
      return;
    }
    if (!window.BincomData.isConfigured()) {
      myReportsState = 'error';
      renderAccountDashboard();
      $('#reports-summary').textContent = 'Private reports are unavailable';
      showReportsState('Reports are not connected', window.BincomData.configurationMessage(), [], 'error');
      return;
    }
    myReportsState = 'loading';
    renderAccountDashboard();
    $('#reports-summary').textContent = 'Loading your reports…';
    showReportsState('Loading your reports', 'Fetching reports submitted from your account.', [], 'loading');
    try {
      const result = await window.BincomData.listReports();
      if (requestId !== reportsRequest) return;
      if (result.error) {
        myReportsState = 'error';
        renderAccountDashboard();
        $('#reports-summary').textContent = 'Reports could not be refreshed';
        showReportsState('We could not load your reports', 'Check your connection and try again.', [{ label: 'Try again', action: 'retry', className: 'secondary-button' }], 'error');
        return;
      }
      myReports = Array.isArray(result.data) ? result.data : [];
      myReportsState = 'ready';
      renderAccountDashboard();
      if (!myReports.length) {
        $('#reports-summary').textContent = '0 reports on this account';
        showReportsState('No reports yet', 'Reports you submit from this account will appear here.', [{ label: 'Report an incident', action: 'create', className: 'primary-button' }]);
        return;
      }
      $('#reports-filters').hidden = false;
      renderMyReports();
    } catch (_) {
      if (requestId !== reportsRequest) return;
      myReportsState = 'error';
      renderAccountDashboard();
      $('#reports-summary').textContent = 'Reports could not be refreshed';
      showReportsState('We could not load your reports', 'Check your connection and try again.', [{ label: 'Try again', action: 'retry', className: 'secondary-button' }], 'error');
    }
  }

  function configureStatusBar() {
    if (!window.cordova || window.cordova.platformId !== 'android' || !window.StatusBar) return;
    try {
      window.StatusBar.overlaysWebView(false);
      window.StatusBar.backgroundColorByHexString('#FFFFFF');
      window.StatusBar.styleDefault();
    } catch (_) { /* Keep the app usable if a platform does not expose the status bar API. */ }
  }
  document.addEventListener('deviceready', configureStatusBar, false);
  document.addEventListener('focusin',(e)=>{if(e.target.matches('input:not([type="hidden"]),textarea')){document.body.classList.add('keyboard-open');setTimeout(()=>e.target.scrollIntoView({block:'center',behavior:'smooth'}),250);}});
  document.addEventListener('focusout',(e)=>{if(e.target.matches('input,textarea'))setTimeout(()=>{if(!document.activeElement.matches('input:not([type="hidden"]),textarea'))document.body.classList.remove('keyboard-open');},100);});
  if(window.visualViewport)window.visualViewport.addEventListener('resize',()=>{if(window.visualViewport.height<window.innerHeight-140)document.body.classList.add('keyboard-open');else document.body.classList.remove('keyboard-open');});
  $('#get-started').addEventListener('click',completeOnboarding);$('#skip-onboarding').addEventListener('click',completeOnboarding);document.querySelectorAll('[data-screen]').forEach((b)=>b.addEventListener('click',()=>showScreen(b.dataset.screen)));$('#header-account').addEventListener('click',()=>openAuth('feed'));$('#detail-back').addEventListener('click',()=>showScreen('feed'));$('#auth-back').addEventListener('click',()=>{if(returnScreen==='welcome')showWelcome();else showScreen(returnScreen);});$('#report-back').addEventListener('click',()=>{resetReportEditor();showScreen('feed');});$('#reset-filter').addEventListener('click',()=>{activeFilter='all';searchQuery='';$('#incident-search').value='';$('#clear-search').hidden=true;$('#reset-filter').hidden=true;renderFilters();renderIncidents();});$('#incident-search').addEventListener('input',()=>{searchQuery=$('#incident-search').value.trim().toLowerCase();$('#clear-search').hidden=!searchQuery;$('#reset-filter').hidden=activeFilter==='all'&&!searchQuery;renderIncidents();});$('#clear-search').addEventListener('click',()=>{$('#incident-search').value='';searchQuery='';$('#clear-search').hidden=true;$('#reset-filter').hidden=activeFilter==='all';renderIncidents();$('#incident-search').focus();});$('#refresh-reports').addEventListener('click',loadReports);$('#reports-state-actions').addEventListener('click',(event)=>{const button=event.target.closest('button');if(!button)return;if(button.dataset.reportsAuth)openAuth('reports',button.dataset.reportsAuth);else if(button.dataset.reportsAction==='retry')loadReports();else if(button.dataset.reportsAction==='create')showScreen('report');});document.querySelector('#reports-list').addEventListener('click',(event)=>{const edit=event.target.closest('[data-report-edit]');if(edit){beginEditReport(edit.dataset.reportEdit);return;}const remove=event.target.closest('[data-report-delete]');if(remove)deleteOwnReport(remove.dataset.reportDelete);});document.querySelectorAll('[data-reports-filter]').forEach((button)=>button.addEventListener('click',()=>{reportsFilter=button.dataset.reportsFilter;renderMyReports();}));$('#auth-form').addEventListener('submit',(e)=>{e.preventDefault();authenticate();});document.querySelectorAll('[data-auth-mode]').forEach((b)=>b.addEventListener('click',()=>{if(!authBusy)setAuthMode(b.dataset.authMode);}));$('#auth-guest').addEventListener('click',()=>showApplication('feed'));$('#auth-guest-top').addEventListener('click',()=>showApplication('feed'));$('#forgot-password-btn').addEventListener('click',requestPasswordReset);$('#auth-email').addEventListener('input',()=>{const valid=validateEmail($('#auth-email').value);$('#auth-email-error').hidden=!$('#auth-email').value||valid;$('#auth-email-check').hidden=!valid;});$('#auth-password').addEventListener('input',()=>updatePasswordStrength($('#auth-password').value));$('#toggle-password').addEventListener('click',()=>{const field=$('#auth-password');const reveal=field.type==='password';field.type=reveal?'text':'password';$('#toggle-password').textContent=reveal?'Hide':'Show';$('#toggle-password').setAttribute('aria-label',reveal?'Hide password':'Show password');});$('#delete-account').addEventListener('click', deleteAccount);$('#sign-out').addEventListener('click',async()=>{const r=await window.BincomData.signOut();if(r.error)authMessage(r.error.message,'error');else{authResolved=true;updateSession(null);showWelcome();}});$('#gate-login').addEventListener('click',()=>openAuth('report','signin'));$('#gate-signup').addEventListener('click',()=>openAuth('report','signup'));$('#report-form').addEventListener('submit',submitReport);$('#report-form').addEventListener('input',markReportDraft);$('#report-form').addEventListener('change',markReportDraft);document.addEventListener('reportmediachange',markReportDraft);$('#title').addEventListener('input',()=>$('#title-count').textContent=$('#title').value.length);$('#description').addEventListener('input',()=>$('#description-count').textContent=$('#description').value.length);document.querySelectorAll('[data-report-category]').forEach((button)=>{button.addEventListener('click',()=>{setReportCategory(button.dataset.reportCategory);markReportDraft();});button.addEventListener('keydown',(event)=>{if(!['ArrowRight','ArrowDown','ArrowLeft','ArrowUp'].includes(event.key))return;event.preventDefault();const choices=[...document.querySelectorAll('[data-report-category]')];const index=choices.indexOf(button);const direction=['ArrowRight','ArrowDown'].includes(event.key)?1:-1;const next=choices[(index+direction+choices.length)%choices.length];setReportCategory(next.dataset.reportCategory);markReportDraft();next.focus();});});$('#use-location').addEventListener('click',()=>{if(!navigator.geolocation){$('#location-status').textContent='Location is not available on this device. You can enter a landmark instead.';return;}$('#location-status').textContent='Requesting location permission…';navigator.geolocation.getCurrentPosition((p)=>{const point=coordinates(p.coords.latitude,p.coords.longitude);if(!point){$('#location-status').textContent='The device returned invalid coordinates. You can enter a landmark instead.';return;}$('#latitude').value=point.latitude;$('#longitude').value=point.longitude;$('#clear-location').hidden=false;$('#location-status').textContent='GPS coordinates added to this report.';updateLocationMapLink();markReportDraft();},(error)=>{const messages={1:'Location permission was denied. Enable location access in device settings or enter a landmark instead.',2:'The device could not determine your location. Check GPS availability or enter a landmark instead.',3:'Location lookup timed out. Try again or enter a landmark instead.'};$('#location-status').textContent=messages[error&&error.code]||'Location could not be determined. You can enter a landmark instead.';}, {enableHighAccuracy:false,maximumAge:30000,timeout:15000});});$('#clear-location').addEventListener('click',()=>{$('#latitude').value='';$('#longitude').value='';$('#clear-location').hidden=true;$('#location-map-button-text').textContent='Choose location on map';$('#location-status').textContent='Selected coordinates removed from this report.';markReportDraft();});
  $('#account-refresh-reports').addEventListener('click', loadReports);
  $('#new-incident-notification-view').addEventListener('click', () => { dismissNewIncidentNotification(); showScreen('feed'); });
  $('#new-incident-notification-dismiss').addEventListener('click', dismissNewIncidentNotification);
  $('#account-my-reports').addEventListener('click', () => showScreen('reports'));
  $('#account-new-report').addEventListener('click', () => showScreen('report'));
  $('#account-explore').addEventListener('click', () => showScreen('feed'));
  $('#detail-content').addEventListener('click', (event) => { const button = event.target.closest('button'); if (!button) return; if (button.hasAttribute('data-refresh-detail') && currentDetailId) { openDetail(currentDetailId); return; } if (button.hasAttribute('data-confirm-report')) submitResolutionConfirmation(button.dataset.confirmReport, button); });
  $('#startup-retry').addEventListener('click', initializeStartup);
  $('#startup-guest').addEventListener('click', () => showApplication('feed'));
  $('#welcome-account').addEventListener('click', () => openAuth('welcome'));
  $('#welcome-signin').addEventListener('click', () => openAuth('welcome'));
  window.addEventListener('wesignal:deep-link', (event) => {
    const url = String(event && event.detail && event.detail.url || '').trim();
    if (!url) return;
    if (!startupResolved || startupBusy) { window.__weSignalPendingAuthUrl = url; return; }
    processIncomingAuthCallback(url);
  });
  (function init() { document.addEventListener('error', handleIncidentMediaError, true); window.ReportMedia.init(); renderFilters(); subscribeToPublicIncidentNotifications(); initializeStartup(); }());
})();
