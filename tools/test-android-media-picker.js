const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const handlers = new Map();
  const node = () => ({
    hidden: false, disabled: false, textContent: '', innerHTML: '', className: '',
    addEventListener(type, listener) { handlers.set(`${this.id || 'node'}:${type}`, listener); }
  });
  const ids = ['#media-add-button', '#media-file-input', '#media-preview-list', '#media-empty-state', '#media-count', '#media-status'];
  const elements = Object.fromEntries(ids.map((id) => [id, { ...node(), id }]));
  const document = {
    querySelector(selector) { return elements[selector] || null; },
    dispatchEvent() {}
  };
  const originalBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x57, 0x65, 0x53, 0x69, 0x67, 0x6e, 0x61, 0x6c, 0xff, 0xd9]);
  const source = new Blob([originalBytes], { type: 'image/jpeg' });
  Object.defineProperty(source, 'name', { value: 'Modified.jpg' });
  let pickerOptions;
  let resolvedUri;
  const logs = [];
  const window = {
    cordova: { platformId: 'android' },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-000000000001' },
    Camera: { PictureSourceType: { PHOTOLIBRARY: 0 }, DestinationType: { FILE_URI: 1 }, MediaType: { ALLMEDIA: 2 } },
    navigator: { camera: { getPicture(success, _error, options) { pickerOptions = options; success('file:///cache/Modified.jpg?opaque-cache-token'); } } },
    resolveLocalFileSystemURL(uri, success) {
      resolvedUri = uri;
      success({ name: 'Modified.jpg', file(callback) { callback(source); } });
    }
  };
  const context = {
    window, document, Blob, File: globalThis.File, URL, CustomEvent: class CustomEvent {},
    console: { info(...args) { logs.push(args); }, warn() {}, error() {} }
  };
  vm.runInNewContext(fs.readFileSync('www/js/report-media.js', 'utf8'), context, { filename: 'report-media.js' });
  window.ReportMedia.init();
  handlers.get('#media-add-button:click')();
  for (let attempt = 0; attempt < 20 && window.ReportMedia.getSelected().length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  assert.equal(pickerOptions.allowEdit, false);
  assert.equal(pickerOptions.correctOrientation, false);
  assert.equal(resolvedUri, 'file:///cache/Modified.jpg?opaque-cache-token');
  const selected = window.ReportMedia.getSelected()[0];
  assert.ok(selected, 'picker file should be normalized and accepted');
  assert.equal(selected.name, 'Modified.jpg');
  assert.equal(selected.mimeType, 'image/jpeg');
  assert.equal(selected.size, originalBytes.byteLength);
  assert.deepEqual(Buffer.from(await selected.file.arrayBuffer()), originalBytes, 'image bytes must be unchanged');
  const logText = JSON.stringify(logs);
  assert.match(logText, /"uri_scheme":"file"/);
  assert.match(logText, /"filename":"Modified.jpg"/);
  assert.doesNotMatch(logText, /opaque-cache-token|file:\/\/\/cache/);
  console.log('Android picker regression test passed: options avoid re-encode, image bytes and MIME remain intact, URI logs are sanitized.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
