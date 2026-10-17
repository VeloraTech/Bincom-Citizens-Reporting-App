const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('www/js/incident-detail-view.js', 'utf8'), context, { filename: 'incident-detail-view.js' });
const view = context.window.WeSignalIncidentDetailView;
assert.ok(view, 'details view is registered');

const loading = view.loadingMarkup();
assert.match(loading, /aria-busy="true"/);
assert.match(loading, /detail-media-frame skeleton/);
assert.match(loading, /id="detail-title"[^>]*>Loading incident details/);
assert.doesNotMatch(loading, /confirmations/);

const incident = {
  id: 'report-1', title: 'Blocked road', category: 'roads_infrastructure', status: 'submitted',
  description: 'A lane is blocked.', created_at: '2026-10-17T10:00:00Z',
  location_label: 'Main Street', latitude: 6.5, longitude: 3.3,
  resolution_confirmations: 0
};
const common = {
  incident, point: { label: '6.50000, 3.30000' }, categoryLabel: 'Roads & Infrastructure',
  statusLabel: 'Reported', dateText: 'Oct 17, 2026', signedIn: true,
  locationActionHtml: '<button type="button" data-map-pin>View pin in app map</button>',
  mediaHtml: '', mediaState: 'empty', mediaWarning: ''
};

const empty = view.render({ ...common, summary: { confirmation_count: 0, threshold: 3, has_confirmed: false, is_reporter: false } });
assert.match(empty, /No image uploaded/);
assert.match(empty, /Blocked road/);
assert.match(empty, /Main Street/);
assert.match(empty, /aria-valuenow="0"/);
assert.match(empty, /<strong>0<\/strong><span> of 3 confirmations<\/span>/);
assert.match(empty, /data-confirm-report="report-1"/);

const liveCount = view.render({ ...common, summary: { confirmation_count: 2, threshold: 3, has_confirmed: false, is_reporter: false } });
assert.match(liveCount, /aria-valuenow="2"/);
assert.match(liveCount, /<strong>2<\/strong><span> of 3 confirmations<\/span>/);
assert.match(liveCount, /width:67%/);
assert.match(liveCount, /1 more confirmation needed/);

const reporter = view.render({ ...common, summary: { confirmation_count: 1, threshold: 3, has_confirmed: false, is_reporter: true } });
assert.match(reporter, /You reported this incident, so you can’t confirm it/);
assert.doesNotMatch(reporter, /data-confirm-report=/);

const duplicate = view.render({ ...common, summary: { confirmation_count: 1, threshold: 3, has_confirmed: true, is_reporter: false } });
assert.match(duplicate, /You’ve confirmed this incident/);
assert.match(duplicate, /disabled/);
assert.doesNotMatch(duplicate, /data-confirm-report=/);

const resolved = view.render({ ...common, incident: { ...incident, status: 'resolved' }, statusLabel: 'Resolved', summary: { confirmation_count: 3, threshold: 3, has_confirmed: true, is_reporter: false } });
assert.match(resolved, /<strong>3<\/strong><span> of 3 confirmations<\/span>/);
assert.match(resolved, /marked <strong>Resolved<\/strong>/);
assert.doesNotMatch(resolved, /data-confirm-report=/);

const summaryError = view.render({ ...common, summary: { error: true } });
assert.match(summaryError, /couldn’t load the current confirmation count/);
assert.match(summaryError, /data-refresh-detail/);
assert.doesNotMatch(summaryError, /0 of 3 confirmations/);
const summaryDiagnostic = view.render({ ...common, summary: { error: true, errorMessage: 'PGRST202 · Function not found' } });
assert.match(summaryDiagnostic, /detail-error-diagnostic/);
assert.match(summaryDiagnostic, /PGRST202 · Function not found/);
assert.doesNotMatch(view.render({ ...common, summary: { error: true, errorMessage: '<script>alert(1)<\/script>' } }), /<script>alert/);

const staleDetail = view.render({ ...common, reportWarning: 'Could not refresh this incident from Supabase.' , summary: { confirmation_count: 0, threshold: 3, has_confirmed: false, is_reporter: false } });
assert.match(staleDetail, /role="status">Could not refresh this incident from Supabase/);

const mediaError = view.render({ ...common, mediaState: 'error', summary: { confirmation_count: 0, threshold: 3, has_confirmed: false, is_reporter: false } });
assert.match(mediaError, /Media could not be loaded/);
assert.doesNotMatch(mediaError, /No image uploaded/);

const escaped = view.render({ ...common, incident: { ...incident, title: '<img src=x onerror=alert(1)>' }, summary: { confirmation_count: 0, threshold: 3, has_confirmed: false, is_reporter: false } });
assert.match(escaped, /&lt;img src=x onerror=alert\(1\)&gt;/);
assert.doesNotMatch(escaped, /<img src=x/);

console.log('Incident detail view tests passed: loading, empty media, real-count state, reporter/duplicate controls, resolved state, errors, and escaping.');
