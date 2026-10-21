const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mapSource = fs.readFileSync(path.join(root, 'www/js/map.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockJson = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const configXml = fs.readFileSync(path.join(root, 'config.xml'), 'utf8');
const releaseWorkflow = fs.readFileSync(path.join(root, '.github/workflows/android-release.yml'), 'utf8');

const locateBody = mapSource.match(/function locateCurrentPosition\(\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(locateBody, 'map GPS handler must exist');
assert.match(locateBody, /enableHighAccuracy:\s*false/, 'the Android GPS request must not require precise-location permission');
assert.match(locateBody, /maximumAge:\s*30000/);
assert.match(locateBody, /timeout:\s*30000/, 'allow the native provider time to return a location');
assert.match(mapSource, /target\.closest\('#use-location'\)[\s\S]*?openPicker\(\{ locate: true \}\)/, 'the form action must launch the map GPS picker');

assert.equal(packageJson.version, '0.1.19');
assert.equal(lockJson.version, packageJson.version);
assert.equal(lockJson.packages[''].version, packageJson.version);
assert.match(configXml, /version="0\.1\.19"/);
assert.match(configXml, /android-versionCode="10019"/);
assert.match(configXml, /WeSignal\/0\.1\.19/);
const releaseCommand = releaseWorkflow.slice(releaseWorkflow.indexOf('gh release create'));
assert.ok(releaseCommand.includes('--draft'), 'tagged releases must remain drafts until explicitly published');
assert.ok(releaseCommand.includes('--verify-tag'), 'the release workflow must use the pushed version tag');
assert.match(releaseWorkflow, /git merge-base --is-ancestor/, 'only a commit already merged into main may be released');

console.log('Location settings and 0.1.19 draft release checks passed.');
