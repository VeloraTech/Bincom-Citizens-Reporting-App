const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.runInNewContext(fs.readFileSync('www/js/service-errors.js', 'utf8'), context, { filename: 'service-errors.js' });
const errors = context.window.WeSignalServiceErrors;
assert.ok(errors, 'service error helpers register');

for (const error of [
  { message: 'Failed to fetch' },
  { message: 'NetworkError when attempting to fetch resource' },
  { message: 'Load failed' },
  { code: 'ERR_INTERNET_DISCONNECTED' },
  { status: 0 }
]) {
  assert.equal(errors.isOffline(error, true), true, `detect offline error: ${JSON.stringify(error)}`);
  assert.match(errors.describe(error, true), /^Internet connection not working\./);
}
assert.equal(errors.isOffline({ message: 'permission denied for table reports', code: '42501' }, true), false);
assert.match(errors.describe({ code: '42501', message: 'permission denied for table reports' }, true), /^42501 · permission denied/);
const safe = errors.describe({ code: 'PGRST202', message: 'Could not reach http://localhost:54321/rest/v1/rpc/private with sb_publishable_abcdefghijklmnopqrstuvwxyz123456' }, true);
assert.doesNotMatch(safe, /localhost|127\.0\.0\.1|sb_publishable|http:\/\//i);
assert.match(safe, /PGRST202/);

console.log('Service error tests passed: offline wording, backend diagnostics, and endpoint/credential redaction.');
