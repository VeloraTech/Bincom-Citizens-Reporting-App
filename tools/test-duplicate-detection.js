const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let rpcName = '';
let rpcArgs = null;
const fakeClient = {
  auth: { getSession: async () => ({ data: { session: { user: { id: 'user-1' }, access_token: 'access-token' } }, error: null }) },
  rpc: async (name, args) => {
    rpcName = name;
    rpcArgs = args;
    return { data: { report_id: args.p_report_id, potential_duplicates: [{ id: 'prior-1', title: 'Broken water pipe', created_at: '2026-10-20T10:00:00Z' }] }, error: null };
  }
};
const context = {
  window: {
    BINCOM_CONFIG: { supabaseUrl: 'https://test-project.supabase.co', supabasePublishableKey: 'public-test-key' },
    supabase: { createClient: () => fakeClient },
    crypto: { randomUUID: () => 'new-report-id' }
  },
  URL,
  Uint8Array,
  console,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(fs.readFileSync('www/js/supabase.js', 'utf8'), context, { filename: 'supabase.js' });

(async () => {
  const result = await context.window.BincomData.createReport({
    title: 'Another water leak',
    category: 'water_supply_leakage',
    description: 'A water leak near the same road.',
    location_label: 'Allen Avenue',
    latitude: 6.5245,
    longitude: 3.3791
  });
  assert.equal(rpcName, 'submit_report_with_duplicate_check');
  assert.equal(rpcArgs.p_report_id, 'new-report-id');
  assert.equal(result.error, null);
  assert.equal(result.data.id, 'new-report-id');
  assert.equal(result.data.potentialDuplicates[0].id, 'prior-1');

  const app = fs.readFileSync('www/js/app.js', 'utf8');
  assert.match(app, /function reportSubmissionMessage\(matches\)/);
  assert.match(app, /remains a separate report/);
  assert.match(app, /result\.data && result\.data\.potentialDuplicates/);
  assert.match(app, /We could not confirm whether the report was saved\. Check My Reports before retrying\./);
  assert.match(app, /n\.textContent=text/);

  const migration = fs.readFileSync('supabase/migrations/20261021000000_duplicate_incident_detection.sql', 'utf8');
  assert.match(migration, /pg_advisory_xact_lock\(1449025537, 1\)/);
  assert.match(migration, /create trigger reports_serialize_insert/i);
  assert.match(migration, /r\.is_public = true/);
  assert.match(migration, /extensions\.similarity/);

  console.log('Duplicate detection adapter tests passed: duplicate-aware RPC, saved ID, candidate result, text-safe feedback, and serialization/public-only SQL guards.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
