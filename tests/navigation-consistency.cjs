const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/app.html'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/organa-ui.js'), 'utf8');
const mc = fs.readFileSync(path.join(root, 'public/mission-control.js'), 'utf8');

const sidebarRoutes = [...html.matchAll(/data-organa-route="([^"]+)"/g)].map(m => m[1]);
for (const route of ['overview','office','missions','team','meetings','knowledge','approvals','standup','goals','performance','settings']) {
  assert(sidebarRoutes.includes(route), `missing global sidebar route: ${route}`);
}

const dialogMarkup = html.match(/<dialog id="missionDialog"[\s\S]*?<\/dialog>/)[0];
assert(!dialogMarkup.includes('<nav'), 'Workspace popup must not repeat the app navigation.');
assert(!dialogMarkup.includes('data-mc-tab'), 'Removed popup navigation must not remain in markup.');
assert(ui.includes('window.OrganaWorkspace?.open(tab)'), 'Main navigation must use the workspace router directly.');
assert(!mc.includes('data-mc-tab'), 'Workspace actions must not depend on removed popup tabs.');

const expectedMappings = {
  overview:'company', missions:'mission', team:'team', meetings:'meetings', knowledge:'knowledge',
  approvals:'review', standup:'standup', goals:'goals', performance:'performance', settings:'settings'
};
for (const [route, tab] of Object.entries(expectedMappings)) {
  assert(ui.includes(`${route}: '${tab}'`), `incorrect or missing route mapping ${route} -> ${tab}`);
}

for (const renderer of ['renderKnowledge','renderGoals','renderPerformance']) {
  assert(mc.includes(`function ${renderer}(`), `missing dedicated renderer: ${renderer}`);
}
assert(mc.includes('knowledge:renderKnowledge'), 'Knowledge is not wired to its renderer');
assert(mc.includes('goals:renderGoals'), 'Goals is not wired to its renderer');
assert(mc.includes('performance:renderPerformance'), 'Performance is not wired to its renderer');

console.log('PASS: one global sidebar routes directly to dedicated workspace views without popup navigation');
