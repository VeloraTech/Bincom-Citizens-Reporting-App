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
  const labels = { submitted: 'Submitted', acknowledged: 'Acknowledged', in_progress: 'In progress', resolved: 'Resolved' };

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
  function validate(data) {
    if (!data.title || data.title.trim().length < 3) return 'Add a short title with at least 3 characters.';
    if (!data.category) return 'Choose a category.';
    if (!data.description || data.description.trim().length < 10) return 'Add at least 10 characters describing the issue.';
    return '';
  }

  document.getElementById('use-location').addEventListener('click', () => {
    if (!navigator.geolocation) { locationStatus.textContent = 'Location is not available on this device.'; return; }
    locationStatus.textContent = 'Requesting location permission…';
    navigator.geolocation.getCurrentPosition((position) => {
      document.getElementById('latitude').value = position.coords.latitude;
      document.getElementById('longitude').value = position.coords.longitude;
      locationStatus.textContent = 'Location added to this report.';
    }, () => { locationStatus.textContent = 'Location permission was not granted. You can enter a landmark instead.'; }, { enableHighAccuracy: false, timeout: 10000 });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('', '');
    const data = Object.fromEntries(new FormData(form).entries());
    const error = validate(data);
    if (error) { setMessage(error, 'error'); return; }
    if (!window.BincomData || !window.BincomData.isConfigured()) {
      setMessage('This report is ready to review, but submission is unavailable until Supabase is configured and an account is signed in. Nothing was sent.', 'error');
      return;
    }
    const session = await window.BincomData.getSession();
    if (!session.data.session) { setMessage('Sign in is required before submitting a report. No report was sent.', 'error'); return; }
    const payload = { title: data.title.trim(), category: data.category, description: data.description.trim(), location_label: data.location_label.trim() || null, latitude: data.latitude ? Number(data.latitude) : null, longitude: data.longitude ? Number(data.longitude) : null };
    const result = await window.BincomData.createReport(payload);
    if (result.error) { setMessage(`The report was not sent: ${result.error.message}`, 'error'); return; }
    setMessage('Report submitted securely. You can find it in My reports.', 'success');
    form.reset(); count.textContent = '0'; locationStatus.textContent = '';
  });

  async function loadReports() {
    reportsList.innerHTML = '';
    if (!window.BincomData || !window.BincomData.isConfigured()) { reportsState.hidden = false; return; }
    const result = await window.BincomData.listReports();
    if (result.error || !result.data.length) { reportsState.hidden = false; return; }
    reportsState.hidden = true;
    result.data.forEach((report) => {
      const li = document.createElement('li'); li.className = 'report-card';
      const date = new Date(report.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
      li.innerHTML = `<h3></h3><div class="report-meta"><span>${date}${report.location_label ? ` · ${report.location_label}` : ''}</span><span class="chip">${labels[report.status] || report.status}</span></div>`;
      li.querySelector('h3').textContent = report.title; reportsList.appendChild(li);
    });
  }
  document.getElementById('refresh-reports').addEventListener('click', loadReports);
})();
