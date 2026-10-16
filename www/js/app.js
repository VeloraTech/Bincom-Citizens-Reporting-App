(function () {
  'use strict';
  const screens = [...document.querySelectorAll('.screen')];
  const navItems = [...document.querySelectorAll('[data-screen]')];
  const form = document.getElementById('report-form');
  const message = document.getElementById('form-message');
  const description = document.getElementById('description');
  const count = document.getElementById('description-count');
  const locationStatus = document.getElementById('location-status');
  const reportsState = document.getElementById('reports-state');
  const reportsList = document.getElementById('reports-list');
  const authForm = document.getElementById('auth-form');
  const authMessage = document.getElementById('auth-message');
  const accountState = document.getElementById('account-state');
  const signOut = document.getElementById('sign-out');
  const labels = { submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved' };
  let session = null;

  function showScreen(name) {
    screens.forEach((screen) => {
      const active = screen.id === `screen-${name}`;
      screen.hidden = !active;
      screen.classList.toggle('is-active', active);
    });
    document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-selected', item.dataset.screen === name));
    if (name === 'reports') loadReports();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  navItems.forEach((item) => item.addEventListener('click', () => showScreen(item.dataset.screen)));
  description.addEventListener('input', () => { count.textContent = description.value.length; });

  function setMessage(text, type) { message.textContent = text; message.className = type ? `form-message ${type}` : 'form-message'; }
  function setAuthMessage(text, type) { authMessage.textContent = text; authMessage.className = type ? `form-message ${type}` : 'form-message'; }
  function validate(data) {
    if (!data.title || data.title.trim().length < 3) return 'Add a short title with at least 3 characters.';
    if (!data.category) return 'Choose a category.';
    if (!data.description || data.description.trim().length < 10) return 'Add at least 10 characters describing the issue.';
    return '';
  }
  function updateSession(nextSession) {
    session = nextSession;
    if (session) {
      accountState.className = 'account-state signed-in';
      accountState.textContent = `Signed in as ${session.user.email}`;
      signOut.hidden = false;
      authForm.hidden = true;
    } else {
      accountState.className = 'account-state';
      accountState.textContent = window.BincomData.isConfigured() ? 'Sign in before submitting or viewing private reports.' : window.BincomData.configurationMessage();
      signOut.hidden = true;
      authForm.hidden = false;
    }
  }
  accountState.addEventListener('click', () => showScreen('auth'));

  document.getElementById('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { locationStatus.textContent = 'Location is not available on this device.'; return; }
    locationStatus.textContent = 'Requesting location permission…';
    navigator.geolocation.getCurrentPosition((position) => {
      document.getElementById('latitude').value = position.coords.latitude;
      document.getElementById('longitude').value = position.coords.longitude;
      locationStatus.textContent = 'Location added to this report.';
    }, () => { locationStatus.textContent = 'Location permission was not granted. You can enter a landmark instead.'; }, { enableHighAccuracy: false, timeout: 10000 });
  });

  async function authenticate(action) {
    setAuthMessage('', '');
    const data = Object.fromEntries(new FormData(authForm).entries());
    if (!data.email || !data.password || data.password.length < 6) { setAuthMessage('Enter a valid email and a password with at least 6 characters.', 'error'); return; }
    const result = action === 'signup' ? await window.BincomData.signUp(data.email.trim(), data.password) : await window.BincomData.signIn(data.email.trim(), data.password);
    if (result.error) { setAuthMessage(result.error.message, 'error'); return; }
    if (action === 'signup' && !result.data.session) setAuthMessage('Account created. Check your email to confirm it, then sign in.', 'success');
    else { updateSession(result.data.session); setAuthMessage('You are signed in.', 'success'); showScreen('home'); }
  }
  authForm.addEventListener('submit', (event) => { event.preventDefault(); authenticate('signin'); });
  document.querySelector('[data-auth-action="signup"]').addEventListener('click', () => authenticate('signup'));
  signOut.addEventListener('click', async () => { const result = await window.BincomData.signOut(); if (result.error) setAuthMessage(result.error.message, 'error'); else { updateSession(null); showScreen('home'); } });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('', '');
    const data = Object.fromEntries(new FormData(form).entries());
    const error = validate(data);
    if (error) { setMessage(error, 'error'); return; }
    if (!window.BincomData.isConfigured()) { setMessage(window.BincomData.configurationMessage() + ' Nothing was sent.', 'error'); return; }
    if (!session) { setMessage('Sign in is required before submitting a report. No report was sent.', 'error'); showScreen('auth'); return; }
    const payload = { title: data.title.trim(), category: data.category, description: data.description.trim(), location_label: data.location_label.trim() || null, latitude: data.latitude ? Number(data.latitude) : null, longitude: data.longitude ? Number(data.longitude) : null };
    const result = await window.BincomData.createReport(payload);
    if (result.error) { setMessage(`The report was not sent: ${result.error.message}`, 'error'); return; }
    setMessage('Report submitted securely. You can find it in My reports.', 'success');
    form.reset(); count.textContent = '0'; locationStatus.textContent = '';
  });

  async function loadReports() {
    reportsList.innerHTML = '';
    if (!window.BincomData.isConfigured()) { reportsState.hidden = false; reportsState.querySelector('p').textContent = window.BincomData.configurationMessage(); return; }
    if (!session) { reportsState.hidden = false; reportsState.querySelector('p').textContent = 'Sign in to securely view reports submitted from this account.'; return; }
    const result = await window.BincomData.listReports();
    if (result.error || !result.data.length) { reportsState.hidden = false; return; }
    reportsState.hidden = true;
    result.data.forEach((report) => {
      const li = document.createElement('li'); li.className = 'report-card';
      const title = document.createElement('h3'); title.textContent = report.title;
      const meta = document.createElement('div'); meta.className = 'report-meta';
      const date = new Date(report.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      const location = document.createElement('span'); location.textContent = `${date}${report.location_label ? ` · ${report.location_label}` : ''}`;
      const chip = document.createElement('span'); chip.className = 'chip'; chip.textContent = labels[report.status] || report.status;
      meta.append(location, chip); li.append(title, meta); reportsList.appendChild(li);
    });
  }
  document.getElementById('refresh-reports').addEventListener('click', loadReports);

  (async function init() {
    if (window.BincomData.isConfigured()) {
      const result = await window.BincomData.getSession();
      updateSession(result.data.session);
      window.BincomData.onAuthStateChange((_event, nextSession) => updateSession(nextSession));
    } else updateSession(null);
  }());
})();
