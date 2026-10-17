const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'www/js/map.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const configXml = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');

const locateBody = mapSource.match(/function locateCurrentPosition\(\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(locateBody, 'map GPS handler must exist');
assert.match(locateBody, /enableHighAccuracy:\s*false/, 'the Android GPS request must not require precise-location permission');
assert.match(locateBody, /maximumAge:\s*30000/);
assert.match(locateBody, /timeout:\s*30000/, 'allow the native provider time to return a location');
assert.match(mapSource, /target\.closest\('#use-location'\)[\s\S]*?openPicker\(\{ locate: true \}\)/, 'the form action must launch the map GPS picker');

assert.equal(packageJson.version, '0.1.18');
assert.equal(lockJson.version, packageJson.version);
assert.equal(lockJson.packages[''].version, packageJson.version);
assert.match(configXml, /version="0\.1\.18"/);
assert.match(configXml, /android-versionCode="10018"/);
assert.match(configXml, /WeSignal\/0\.1\.18/);

console.log('Location settings and release version checks passed.');
