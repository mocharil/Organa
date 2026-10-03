const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const js = fs.readFileSync(path.join(root, 'public', 'mission-control.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public', 'organa-theme.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public', 'app.html'), 'utf8');

assert.match(js, /params\.get\('onboarding'\) === '1'/, 'Deep-link onboarding must remain supported.');
assert.match(js, /ensureDialog\(false\)/, 'Onboarding should use a non-modal workspace so app navigation stays usable.');
assert.match(js, /classList\.remove\('organa-loading'\)/, 'Onboarding should not be blocked by 3D boot loading.');
assert.match(js, /AbortController/, 'API requests need a timeout / abort guard.');
assert.match(js, /location\.assign\('\/app'\)/, 'Activation must exit the onboarding URL instead of reloading onboarding again.');
assert.match(js, /Start.*Configure.*Review.*Activate/s, 'Guided onboarding steps should be present.');
assert.match(js, /Build from scratch/, 'Onboarding must offer a build-from-scratch path.');
assert.match(js, /Use a template/, 'Onboarding must offer a template path.');
assert.match(js, /onboardingPath/, 'Onboarding must persist the selected starting path in UI state.');
assert.match(css, /#missionDialog\.mc-onboarding-dialog/, 'Onboarding workspace layout must be styled.');
assert.match(css, /\.mc-onboarding-team-row/, 'Editable team review rows must be styled.');
assert.match(html, /id="missionDialog"/, 'Mission Control dialog must exist in app surface.');

console.log('PASS: onboarding deep-link remains interactive, recoverable, and exits cleanly after activation');
