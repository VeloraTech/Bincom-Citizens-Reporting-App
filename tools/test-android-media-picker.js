const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function main() {
  const handlers = new Map();
  const makeNode = (id) => ({
    id, hidden: false, disabled: false, textContent: '', innerHTML: '', className: '', value: '', multiple: false,
    addEventListener(type, listener) { handlers.set(`${id}:${type}`, listener); },
    click() { this.clickCount = (this.clickCount || 0) + 1; }
  });
  const ids = ['#media-add-button', '#media-file-input', '#media-preview-list', '#media-empty-state', '#media-count', '#media-status'];
  const elements = Object.fromEntries(ids.map((id) => [id, makeNode(id)]));
  const document = {
    querySelector(selector) { return elements[selector] || null; },
    dispatchEvent() {}
  };
  const fixtures = [
    { name: 'Report.jpg', type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x57, 0x65, 0xff, 0xd9] },
    { name: 'Report.png', type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { name: 'Clip.webm', type: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42] }
  ];
  const files = fixtures.map(({ name, type, bytes }) => {
    const file = new Blob([Buffer.from(bytes)], { type });
    Object.defineProperty(file, 'name', { value: name });
    return file;
  });
  let cameraCalls = 0;
  const logs = [];
  const window = {
    cordova: { platformId: 'android' },
    crypto: { randomUUID: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })() },
    Camera: { PictureSourceType: { PHOTOLIBRARY: 0 }, DestinationType: { FILE_URI: 1 }, MediaType: { ALLMEDIA: 2 } },
    navigator: { camera: { getPicture() { cameraCalls += 1; } } },
    resolveLocalFileSystemURL() { throw new Error('Android should not route through Camera URI resolution'); }
  };
  const context = {
    window, document, Blob, File: globalThis.File, URL, CustomEvent: class CustomEvent {},
    console: { info(...args) { logs.push(args); }, warn() {}, error() {} }
  };
  vm.runInNewContext(fs.readFileSync('www/js/report-media.js', 'utf8'), context, { filename: 'report-media.js' });
  window.ReportMedia.init();
  handlers.get('#media-add-button:click')();
  assert.equal(elements['#media-file-input'].clickCount, 1, 'Android should open the original-file picker');
  assert.equal(elements['#media-file-input'].multiple, true, 'new reports should keep multi-select');
  elements['#media-file-input'].files = files;
  handlers.get('#media-file-input:change')();

  const selected = window.ReportMedia.getSelected();
  assert.equal(cameraCalls, 0, 'Android should bypass Camera plugin conversion and cache URIs');
  assert.equal(selected.length, fixtures.length);
  for (let i = 0; i < fixtures.length; i += 1) {
    assert.equal(selected[i].name, fixtures[i].name);
    assert.equal(selected[i].mimeType, fixtures[i].type);
    assert.equal(selected[i].size, fixtures[i].bytes.length);
    assert.deepEqual([...new Uint8Array(await selected[i].file.arrayBuffer())], fixtures[i].bytes, `${fixtures[i].name} bytes must remain unchanged`);
  }
  const logText = JSON.stringify(logs);
  assert.match(logText, /"picker_source":"html-file-input"/);
  assert.match(logText, /"uri_scheme":null/);
  assert.match(logText, /"filename":"Report\.jpg"/);
  assert.match(logText, /"mime_type":"image\/png"/);
  assert.match(logText, /"byte_count":6/);
  assert.doesNotMatch(logText, /file:\/\/|content:\/\//);
  console.log('Android picker regression test passed: original JPEG/PNG/video bytes, names and MIME types are preserved; Camera cache URI path is bypassed and diagnostics contain no URI.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
