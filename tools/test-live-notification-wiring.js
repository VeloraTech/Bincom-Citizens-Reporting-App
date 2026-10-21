const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let subscribedName = '';
let registeredEvent = null;
let registeredFilter = null;
let handler = null;
const fakeChannel = {
  on(event, filter, callback) { registeredEvent = event; registeredFilter = filter; handler = callback; return this; },
  subscribe() { return this; }
};
const fakeClient = {
  channel(name) { subscribedName = name; return fakeChannel; },
  removeChannel(channel) { return Promise.resolve(channel); }
};
const context = {
  window: {
    BINCOM_CONFIG: { supabaseUrl: 'https://test-project.supabase.co', supabasePublishableKey: 'public-test-key' },
    supabase: { createClient: () => fakeClient }
  }
};
vm.runInNewContext(fs.readFileSync('www/js/supabase.js', 'utf8'), context, { filename: 'supabase.js' });

let received = null;
const subscription = context.window.BincomData.subscribeToPublicIncidentInserts((report) => { received = report; });
assert.ok(subscription && subscription.channel === fakeChannel);
assert.equal(subscribedName, 'wesignal-public-incident-notifications');
assert.equal(registeredEvent, 'postgres_changes');
assert.equal(registeredFilter.event, 'INSERT');
assert.equal(registeredFilter.schema, 'public');
assert.equal(registeredFilter.table, 'reports');
assert.equal(registeredFilter.filter, 'is_public=eq.true');
const publicReport = { id: 'test-public', title: 'Test road issue', is_public: true };
handler({ new: publicReport });
assert.equal(received, publicReport, 'public INSERT is passed through');
received = null;
handler({ new: { id: 'private-test', is_public: false } });
assert.equal(received, null, 'private report is ignored');

const app = fs.readFileSync('www/js/app.js', 'utf8');
const html = fs.readFileSync('www/index.html', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261018000008_public_incident_realtime_notifications.sql', 'utf8');
assert.match(app, /subscribeToPublicIncidentNotifications\(\);/);
assert.match(html, /id="new-incident-notification"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(migration, /alter publication supabase_realtime add table public\.reports/i);

console.log('Realtime notification wiring tests passed: public INSERT subscription, private-row filter, in-app alert, and publication migration.');
