const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('www/js/app.js', 'utf8');
const html = fs.readFileSync('www/index.html', 'utf8');

const editStart = app.indexOf('async function beginEditReport');
const editEnd = app.indexOf('async function deleteOwnReport', editStart);
assert.notEqual(editStart, -1, 'report edit handler should exist');
assert.notEqual(editEnd, -1, 'report edit handler should have a clear end');
const editHandler = app.slice(editStart, editEnd);
assert.match(editHandler, /\$\('#location-label'\)\.value = item\.location_label/);
assert.doesNotMatch(editHandler, /\$\('#location_label'\)/, 'edit flow must use the actual hyphenated location input ID');

for (const id of [
  'auth-public-content', 'account-dashboard', 'account-dashboard-title', 'account-avatar',
  'account-display-name', 'account-email', 'account-stat-total', 'account-stat-active',
  'account-stat-resolved', 'account-report-count', 'account-stats-message',
  'account-refresh-reports', 'account-my-reports', 'account-new-report', 'account-explore'
]) {
  assert.match(html, new RegExp(`id="${id}"`), `dashboard should contain #${id}`);
}

assert.match(app, /async function listReports|BincomData\.listReports\(\)/);
assert.match(app, /myReports\.filter\(\(item\) => item\.status !== 'resolved'\)/);
assert.match(app, /myReports\.filter\(\(item\) => item\.status === 'resolved'\)/);
assert.match(app, /function renderAccountDashboard\(\)/);
assert.match(app, /\$\('#account-dashboard'\)\.hidden = !session/);
assert.match(app, /name === 'auth' && session\)\) loadReports\(\)/);
assert.match(app, /session \? 'account-dashboard-title' : 'auth-title'/);
const dashboardStatsStart = html.indexOf('<div class="account-profile-stats"');
const dashboardStatsEnd = html.indexOf('<button id="account-refresh-reports"', dashboardStatsStart);
assert.notEqual(dashboardStatsStart, -1);
assert.notEqual(dashboardStatsEnd, -1);
assert.doesNotMatch(html.slice(dashboardStatsStart, dashboardStatsEnd), />\d+</, 'profile dashboard must not hard-code sample statistics');

console.log('Account dashboard/edit regression test passed: edit uses the real location field ID and dashboard stats are connected to owner-scoped report data.');
