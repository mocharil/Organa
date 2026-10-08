const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {chromium} = require('playwright');
const {startServer} = require('./helpers/server.cjs');

const screenshotDir = process.env.ONBOARDING_QA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'organa-onboarding-ui-'));
fs.mkdirSync(screenshotDir, {recursive: true});
const checks = [];
const errors = [];
let runtime, browser, page;

async function check(label, run) {
  await run();
  checks.push(label);
  console.log(`PASS: ${label}`);
}

async function eventually(checkCondition, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await checkCondition()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('The expected UI state did not appear.');
}

async function newPage(options = {}) {
  const context = await browser.newContext({viewport: {width: 1440, height: 960}, ...options});
  // Product setup must work without any third-party CDN, font, or image request.
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, route => route.abort());
  const current = await context.newPage();
  current.on('pageerror', error => errors.push(error.message));
  return current;
}

const readState = () => JSON.parse(fs.readFileSync(path.join(runtime.dataDir, 'state.json'), 'utf8'));
const snapshot = name => page.screenshot({path: path.join(screenshotDir, name), animations: 'disabled'});
const approve = () => page.getByRole('button', {name: 'Approve & start organization', exact: true});
const create = () => page.getByRole('button', {name: 'Design my AI team', exact: true});

(async () => {
  runtime = await startServer();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-zygote'],
  });
  page = await newPage();
  let companyId, requestId;
  const goal = 'Prepare an evidence-backed specialty coffee launch plan for Jakarta next month.';
  const constraint = 'Marketing budget must not exceed IDR 8,000,000';

  await check('Landing Get Started opens interactive onboarding with local assets', async () => {
    await page.goto(runtime.base, {waitUntil: 'domcontentloaded'});
    await page.getByRole('link', {name: 'Get Started', exact: true}).first().click();
    await page.getByRole('button', {name: /Build from scratch/}).waitFor();
    assert.ok(page.url().includes('onboarding=1'));
    assert.equal(await page.locator('#organaBootSplash').isVisible(), false);
    await snapshot('onboarding-start-desktop.png');
  });

  await check('Both starting paths fit the mobile screen without horizontal overflow', async () => {
    await page.setViewportSize({width: 390, height: 844});
    for (const name of [/Build from scratch/, /Use a template/]) {
      const box = await page.getByRole('button', {name}).boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= 390);
      assert.ok(box.y >= 0 && box.y + box.height <= 810, 'The starting path must be visible above the status bar.');
    }
    assert.equal(await page.locator('#mcContent').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await snapshot('onboarding-start-mobile.png');
    await page.setViewportSize({width: 1440, height: 960});
  });

  await check('Required outcome, raw input persistence and demo mode are clear', async () => {
    await page.getByRole('button', {name: /Build from scratch/}).click();
    await page.getByLabel('What should this team achieve?', {exact: true}).fill('   ');
    assert.equal(await create().isDisabled(), true);
    await page.getByLabel('Company or project name', {exact: true}).fill('Nusa QA ');
    await page.getByLabel('What are you building?', {exact: true}).fill('A specialty coffee brand for Indonesian professionals.');
    await page.getByLabel('What should this team achieve?', {exact: true}).fill(goal);
    await page.getByLabel('Hard constraints', {exact: true}).fill(constraint);
    await page.getByText('You’re exploring in demo mode', {exact: true}).waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.officeScene)), false, 'Office construction should wait until setup exits.');
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByLabel('Company or project name', {exact: true}).waitFor();
    assert.equal(await page.getByLabel('Company or project name', {exact: true}).inputValue(), 'Nusa QA ');
    assert.equal(await page.getByLabel('What should this team achieve?', {exact: true}).inputValue(), goal);
    assert.equal(await page.getByLabel('Hard constraints', {exact: true}).inputValue(), constraint);
    await snapshot('onboarding-configure-desktop.png');
  });

  await check('A generation failure retains the brief and retries with the same request ID', async () => {
    let failed = false;
    const routeHandler = async route => {
      if (route.request().method() === 'POST' && !failed) {
        requestId = route.request().postDataJSON().clientRequestId;
        failed = true;
        return route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Temporary design outage. Try again.'})});
      }
      if (route.request().method() === 'POST') assert.equal(route.request().postDataJSON().clientRequestId, requestId);
      return route.continue();
    };
    await page.route('**/api/company-bootstrap/proposals', routeHandler);
    await create().click();
    await page.locator('.ob-error').waitFor();
    assert.equal(await page.getByLabel('Company or project name', {exact: true}).inputValue(), 'Nusa QA ');
    assert.equal(await page.getByLabel('What should this team achieve?', {exact: true}).inputValue(), goal);
    await create().click();
    await page.getByLabel('Company name', {exact: true}).waitFor();
    await page.unroute('**/api/company-bootstrap/proposals', routeHandler);
    const drafts = readState().bootstrapProposals;
    assert.equal(drafts.filter(draft => draft.clientRequestId === requestId).length, 1);
    assert.equal(drafts.at(-1).proposal.initialGoals[0].description, goal);
    assert.ok(drafts.at(-1).proposal.northStarDraft.hardConstraints.includes(constraint));
    await snapshot('onboarding-review-desktop.png');
  });

  await check('Review enforces a coordinator, validates unique names and records selected coworkers', async () => {
    const rows = page.locator('.ob-team-row');
    assert.equal(await rows.first().locator('input[type=checkbox]').isDisabled(), true);
    assert.equal(await rows.first().getByLabel('Role title', {exact: true}).getAttribute('readonly'), '');
    await page.getByLabel('Company name', {exact: true}).fill('Reviewed Nusa QA');
    await page.getByLabel('Mission', {exact: true}).fill('Deliver an affordable, evidence-backed launch plan.');
    await page.getByLabel('Vision', {exact: true}).fill('');
    await page.getByLabel('Hard constraints, one per line', {exact: true}).fill(constraint + '\nExternal publishing requires my approval');
    await rows.nth(1).getByLabel('Coworker name', {exact: true}).fill('Ari');
    await approve().click();
    assert.equal(await page.locator('#ob-team-name-1').getAttribute('aria-invalid'), 'true');
    assert.equal(readState().bootstrapProposals.at(-1).status, 'draft');
    await page.locator('#ob-team-name-1').fill('Maya QA');
    await rows.nth(1).getByLabel('Role title', {exact: true}).fill('Market Evidence Lead');
    await rows.last().locator('input[type=checkbox]').uncheck();
    assert.equal(await page.locator('.ob-team-count').textContent(), '4 selected');
    await rows.nth(1).scrollIntoViewIfNeeded();
    await snapshot('onboarding-team-review-desktop.png');
  });

  await check('Review edits survive Back to setup, return to review and reload', async () => {
    await page.getByRole('button', {name: 'Back to setup', exact: true}).click();
    await page.getByRole('button', {name: 'Return to my reviewed draft', exact: true}).click();
    assert.equal(await page.getByLabel('Company name', {exact: true}).inputValue(), 'Reviewed Nusa QA');
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByLabel('Company name', {exact: true}).waitFor();
    await eventually(async () => !await approve().isDisabled());
    assert.equal(await page.getByLabel('Company name', {exact: true}).inputValue(), 'Reviewed Nusa QA');
    assert.equal(await page.getByLabel('Mission', {exact: true}).inputValue(), 'Deliver an affordable, evidence-backed launch plan.');
    assert.equal(await page.getByLabel('Vision', {exact: true}).inputValue(), '');
    assert.equal(await page.locator('#ob-team-name-1').inputValue(), 'Maya QA');
    assert.equal(await page.locator('.ob-team-row').last().locator('input[type=checkbox]').isChecked(), false);
  });

  await check('An activation error preserves every review edit and excluded role', async () => {
    const handler = route => route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({error: 'Activation temporarily unavailable. Try again.'})});
    await page.route('**/api/company-bootstrap/proposals/*/activate', handler);
    await approve().click();
    await page.locator('.ob-error').waitFor();
    await page.unroute('**/api/company-bootstrap/proposals/*/activate', handler);
    assert.equal(await page.getByLabel('Company name', {exact: true}).inputValue(), 'Reviewed Nusa QA');
    assert.equal(await page.locator('#ob-team-name-1').inputValue(), 'Maya QA');
    assert.equal(await page.locator('.ob-team-row').last().locator('input[type=checkbox]').isChecked(), false);
  });

  await check('A lost activation response can be retried without creating a duplicate organization', async () => {
    const beforeCount = readState().companies.length;
    const handler = async route => {
      const response = await route.fetch();
      companyId = (await response.json()).company.id;
      await route.abort('failed');
    };
    await page.route('**/api/company-bootstrap/proposals/*/activate', handler);
    await approve().click();
    await page.locator('.ob-error').waitFor();
    await page.unroute('**/api/company-bootstrap/proposals/*/activate', handler);
    await approve().click();
    await page.getByRole('button', {name: 'Enter my office →', exact: true}).waitFor();
    const state = readState();
    assert.equal(state.companies.length, beforeCount + 1);
    assert.equal(state.activeCompanyId, companyId);
    assert.equal(state.agents.filter(agent => agent.companyId === companyId).length, 4);
    assert.equal(state.events.filter(event => event.companyId === companyId && event.type === 'company.activated').length, 1);
    assert.equal(state.northStars.find(item => item.companyId === companyId).vision, '');
    assert.ok(state.agents.some(agent => agent.companyId === companyId && agent.displayName === 'Maya QA' && agent.role === 'Market Evidence Lead'));
    await snapshot('onboarding-success-desktop.png');
  });

  await check('The completion screen survives refresh and remains usable on mobile', async () => {
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.getByRole('button', {name: 'Enter my office →', exact: true}).waitFor();
    await page.setViewportSize({width: 390, height: 844});
    assert.equal(await page.locator('#mcContent').evaluate(el => el.scrollWidth > el.clientWidth + 1), false);
    await snapshot('onboarding-success-mobile.png');
    await page.setViewportSize({width: 1440, height: 960});
  });

  await check('First mission handoff loads the new organization and the live 3D roster', async () => {
    await page.getByRole('button', {name: 'Create my first mission', exact: true}).click();
    await page.getByRole('heading', {name: 'Missions', exact: true, level: 1}).waitFor();
    assert.equal(new URL(page.url()).searchParams.has('onboarding'), false);
    assert.equal(await page.evaluate(() => sessionStorage.getItem('organa:onboarding:v1')), null);
    await page.waitForFunction(() => Boolean(window.officeScene), {timeout: 45000});
    const snapshot = await page.evaluate(() => window.officeScene.snapshot());
    assert.equal(snapshot.team.length, 4);
    assert.ok(snapshot.team.some(agent => agent.name === 'Maya QA'));
    assert.equal(await page.locator('#workspaceCompanyName').textContent(), 'Reviewed Nusa QA');
    const mission=page.getByLabel('What do you need the organization to solve?', {exact:true});
    assert.equal(await mission.inputValue(), goal);
    await mission.fill('A mission draft the user is still editing.');
    await new Promise(resolve=>setTimeout(resolve, 3200));
    assert.equal(await mission.inputValue(), 'A mission draft the user is still editing.');
  });

  await check('Template loading errors offer an immediate retry without losing customization', async () => {
    const current = await newPage();
    let fail = true;
    await current.route('**/api/company-bootstrap/templates', route => fail ? route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"Templates offline"}'}) : route.continue());
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Use a template/}).click();
    await current.getByLabel('Company or project name', {exact: true}).fill('Template recovery');
    await current.getByText('Team templates could not be loaded. Retry, or build from your own goal.', {exact: true}).waitFor();
    fail = false;
    await current.getByRole('button', {name: 'Retry templates', exact: true}).click();
    await current.getByRole('radio', {name: 'Startup Launch Team', exact: true}).waitFor();
    assert.equal(await current.getByLabel('Company or project name', {exact: true}).inputValue(), 'Template recovery');
    await current.context().close();
  });

  await check('All five templates can be customized, reviewed and activated in the browser', async () => {
    const templates = await (await fetch(runtime.base + '/api/company-bootstrap/templates')).json();
    for (const [index, template] of templates.entries()) {
      const current = await newPage();
      await current.goto(runtime.base + '/app?onboarding=1');
      await current.getByRole('button', {name: /Use a template/}).click();
      await current.getByRole('radio', {name: template.name, exact: true}).check();
      await current.getByLabel('Company or project name', {exact: true}).fill(`Template ${index + 1} QA`);
      if (index !== 0) await current.getByLabel('What should this team achieve?', {exact: true}).fill('Deliver an owner-ready operating plan.');
      await current.getByLabel('Hard constraints', {exact: true}).fill('No external action without owner approval');
      await current.getByRole('button', {name: 'Create editable draft', exact: true}).click();
      await current.getByLabel('Company name', {exact: true}).waitFor();
      assert.equal(await current.getByLabel('Company name', {exact: true}).inputValue(), `Template ${index + 1} QA`);
      const edit = await current.getByLabel('Hard constraints, one per line', {exact: true}).inputValue();
      assert.ok(edit.includes('No external action without owner approval'));
      if (index === 0) {
        page = current;
        await snapshot('onboarding-template-review-desktop.png');
      }
      await current.getByRole('button', {name: 'Approve & start organization', exact: true}).click();
      await current.getByRole('button', {name: 'Enter my office →', exact: true}).waitFor();
      await current.context().close();
    }
  });

  await check('Switching start paths preserves shared input and template choice across reloads', async () => {
    page = await newPage();
    await page.goto(runtime.base + '/app?onboarding=1');
    await page.getByRole('button', {name: /Build from scratch/}).click();
    await page.getByLabel('Company or project name', {exact: true}).fill('Switch path QA');
    await page.getByLabel('What should this team achieve?', {exact: true}).fill('Prepare a 30-day execution plan.');
    await page.getByRole('button', {name: 'Change starting point', exact: true}).click();
    await page.getByRole('button', {name: /Use a template/}).click();
    await page.getByRole('radio', {name: 'Research & Analysis Team', exact: true}).check();
    await page.reload();
    assert.equal(await page.getByLabel('Company or project name', {exact: true}).inputValue(), 'Switch path QA');
    await eventually(async () => await page.getByRole('radio', {name: 'Research & Analysis Team', exact: true}).isChecked());
    assert.equal(await page.getByLabel('What should this team achieve?', {exact: true}).inputValue(), 'Prepare a 30-day execution plan.');
    await page.getByRole('button', {name: 'Create editable draft', exact: true}).click();
    await page.getByLabel('Company name', {exact: true}).waitFor();
  });

  await check('A changed brief retried after failure generates a new draft instead of returning the old one', async () => {
    const oldId = JSON.parse(await page.evaluate(() => sessionStorage.getItem('organa:onboarding:v1'))).proposal.id;
    await page.getByRole('button', {name: 'Back to setup', exact: true}).click();
    const newGoal = 'Produce a new evidence brief for a different 60-day market-entry question.';
    await page.getByLabel('What should this team achieve?', {exact: true}).fill(newGoal);
    const handler = route => route.fulfill({status: 503, contentType: 'application/json', body: '{"error":"Temporary failure"}'});
    await page.route('**/api/company-bootstrap/templates/*/proposal', handler);
    await page.getByRole('button', {name: 'Create editable draft', exact: true}).click();
    await page.locator('.ob-error').waitFor();
    await page.unroute('**/api/company-bootstrap/templates/*/proposal', handler);
    await page.getByRole('button', {name: 'Create editable draft', exact: true}).click();
    await page.getByLabel('Company name', {exact: true}).waitFor();
    const saved = JSON.parse(await page.evaluate(() => sessionStorage.getItem('organa:onboarding:v1')));
    assert.notEqual(saved.proposal.id, oldId);
    assert.equal(saved.proposal.proposal.initialGoals[0].description, newGoal);
  });

  await check('Save and exit preserves URL parameters, and Continue setup restores the draft', async () => {
    await page.evaluate(() => history.replaceState({}, '', '/app?onboarding=1&utm_source=qa#setup'));
    await page.getByLabel('Company name', {exact: true}).fill('Resume reviewed QA');
    await page.getByRole('button', {name: 'Save & exit', exact: true}).click();
    assert.equal(new URL(page.url()).searchParams.get('utm_source'), 'qa');
    assert.equal(new URL(page.url()).hash, '#setup');
    assert.equal(new URL(page.url()).searchParams.has('onboarding'), false);
    await page.getByRole('button', {name: 'Continue setup →', exact: true}).click();
    await page.getByLabel('Company name', {exact: true}).waitFor();
    assert.equal(await page.getByLabel('Company name', {exact: true}).inputValue(), 'Resume reviewed QA');
  });

  await check('Setup and review stay within the viewport at phone, tablet and desktop widths', async () => {
    await eventually(async () => !await approve().isDisabled());
    for (const width of [320, 360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({width, height: 900});
      const overflow = await page.locator('#mcContent').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false, `Review overflows at ${width}px`);
      let button;
      await eventually(async () => { button = await approve().boundingBox(); return Boolean(button); });
      assert.ok(button.x >= 0 && button.x + button.width <= width + 1);
    }
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('#ob-team-name-1').scrollIntoViewIfNeeded();
    await snapshot('onboarding-team-review-mobile.png');
  });

  await check('Storage restrictions do not prevent setup and reduced motion stops decorative animation', async () => {
    const current = await newPage({reducedMotion: 'reduce'});
    await current.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
      Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    });
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Build from scratch/}).click();
    await current.getByLabel('What should this team achieve?', {exact: true}).fill('Prepare a useful research brief.');
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByLabel('Company name', {exact: true}).waitFor();
    assert.equal(await current.locator('.ob-orbit-node').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.ok((await current.locator('.ob-saved').textContent()).includes('Keep this tab open'));
    await current.context().close();
  });

  await check('AI Settings offers a visible return path and preserves the setup draft', async () => {
    const current = await newPage();
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Build from scratch/}).click();
    await current.getByLabel('Company or project name', {exact: true}).fill('Settings detour QA');
    await current.getByLabel('What should this team achieve?', {exact: true}).fill('Prepare a 90-day operating plan.');
    await current.getByRole('button', {name: 'AI settings', exact: true}).click();
    await current.getByRole('heading', {name: 'AI Settings', exact: true}).waitFor();
    assert.equal(await current.locator('[data-organa-route="settings"]').getAttribute('class'), 'active');
    await current.getByRole('button', {name: 'Continue organization setup', exact: true}).click();
    await current.getByLabel('Company or project name', {exact: true}).waitFor();
    assert.equal(await current.getByLabel('Company or project name', {exact: true}).inputValue(), 'Settings detour QA');
    assert.equal(await current.getByLabel('What should this team achieve?', {exact: true}).inputValue(), 'Prepare a 90-day operating plan.');
    await current.context().close();
  });

  await check('An actual request timeout keeps the brief and allows a safe draft retry', async () => {
    const current = await newPage();
    await current.addInitScript(() => {
      const original = window.setTimeout.bind(window);
      let shortened = false;
      window.setTimeout = (callback, ms, ...args) => {
        if (ms === 70000 && !shortened) { shortened = true; return original(callback, 5, ...args); }
        return original(callback, ms, ...args);
      };
    });
    let heldFirstRequest = false;
    await current.route('**/api/company-bootstrap/proposals', route => {
      if (route.request().method() === 'POST' && !heldFirstRequest) {
        heldFirstRequest = true;
        return; // Hold the request until the browser's AbortController timeout fires.
      }
      return route.continue();
    });
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Build from scratch/}).click();
    await current.getByLabel('Company or project name', {exact: true}).fill('Timeout recovery QA');
    await current.getByLabel('What should this team achieve?', {exact: true}).fill('Produce a research brief for the owner.');
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByText('This request is taking longer than expected. Please try again.', {exact: true}).first().waitFor();
    assert.equal(await current.getByLabel('Company or project name', {exact: true}).inputValue(), 'Timeout recovery QA');
    const saved = JSON.parse(await current.evaluate(() => sessionStorage.getItem('organa:onboarding:v1')));
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByLabel('Company name', {exact: true}).waitFor();
    assert.equal(readState().bootstrapProposals.filter(draft => draft.clientRequestId === saved.requestId).length, 1);
    await current.context().close();
  });

  await check('Unavailable 3D graphics never leave a blocking loading screen after onboarding', async () => {
    const current = await newPage();
    await current.addInitScript(() => { HTMLCanvasElement.prototype.getContext = function(type, ...args) { if (['webgl', 'webgl2', 'experimental-webgl'].includes(type)) return null; return null; }; });
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Use a template/}).click();
    await current.getByRole('radio', {name: 'Content & Social Team', exact: true}).check();
    await current.getByRole('button', {name: 'Create editable draft', exact: true}).click();
    await current.getByLabel('Company name', {exact: true}).waitFor();
    await current.getByRole('button', {name: 'Approve & start organization', exact: true}).click();
    await current.getByRole('button', {name: 'Enter my office →', exact: true}).click();
    await current.getByText('The 3D office needs graphics acceleration. Your workspace remains available from the navigation.', {exact: true}).waitFor();
    assert.equal(await current.locator('#organaBootSplash').isVisible(), false);
    await current.locator('[data-organa-route="overview"]').click();
    await current.getByRole('heading', {name: 'Organization Overview', exact: true}).waitFor();
    await current.context().close();
  });

  await check('A draft removed from the server can be recreated from the saved brief', async () => {
    const current = await newPage();
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Build from scratch/}).click();
    await current.getByLabel('Company or project name', {exact: true}).fill('Missing draft recovery QA');
    await current.getByLabel('What should this team achieve?', {exact: true}).fill('Prepare an evidence brief for a 30-day launch.');
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByLabel('Company name', {exact: true}).waitFor();
    const before = JSON.parse(await current.evaluate(() => sessionStorage.getItem('organa:onboarding:v1'))).proposal.id;
    const reset = await fetch(runtime.base + '/api/demo/reset', {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
    assert.ok(reset.ok);
    await current.getByRole('button', {name: 'Approve & start organization', exact: true}).click();
    await current.getByText('This draft is no longer on the server. Return to setup to recreate your team from your saved brief.', {exact: true}).first().waitFor();
    await current.getByRole('button', {name: 'Back to setup', exact: true}).click();
    assert.equal(await current.getByLabel('Company or project name', {exact: true}).inputValue(), 'Missing draft recovery QA');
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByLabel('Company name', {exact: true}).waitFor();
    const after = JSON.parse(await current.evaluate(() => sessionStorage.getItem('organa:onboarding:v1'))).proposal.id;
    assert.notEqual(after, before);
    await current.context().close();
  });

  await check('Malformed template data is recoverable and does not crash the builder', async () => {
    const current = await newPage();
    const handler = route => route.fulfill({contentType: 'application/json', body: '{"templates":[]}'});
    await current.route('**/api/company-bootstrap/templates', handler);
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Use a template/}).click();
    await current.getByText('Team templates could not be loaded. Retry, or build from your own goal.', {exact: true}).waitFor();
    await current.unroute('**/api/company-bootstrap/templates', handler);
    await current.getByRole('button', {name: 'Retry templates', exact: true}).click();
    await current.getByRole('radio', {name: 'Startup Launch Team', exact: true}).waitFor();
    await current.context().close();
  });

  await check('Live provider errors offer settings recovery while keeping the organization brief', async () => {
    const current = await newPage();
    const handler = route => route.fulfill({status: 424, contentType: 'application/json', body: JSON.stringify({error: 'The selected AI provider needs valid credentials.', code: 'AI_PROVIDER_NOT_READY'})});
    await current.route('**/api/company-bootstrap/proposals', handler);
    await current.goto(runtime.base + '/app?onboarding=1');
    await current.getByRole('button', {name: /Build from scratch/}).click();
    await current.getByLabel('Company or project name', {exact: true}).fill('Provider recovery QA');
    await current.getByLabel('What should this team achieve?', {exact: true}).fill('Build an evidence-backed 90-day plan.');
    await current.getByRole('button', {name: 'Design my AI team', exact: true}).click();
    await current.getByRole('button', {name: 'Open AI settings', exact: true}).click();
    await current.getByRole('button', {name: 'Continue organization setup', exact: true}).click();
    assert.equal(await current.getByLabel('Company or project name', {exact: true}).inputValue(), 'Provider recovery QA');
    await current.context().close();
  });

  await check('No uncaught browser errors across all onboarding scenarios', async () => {
    assert.deepEqual(errors, []);
  });
  fs.writeFileSync(path.join(screenshotDir, 'onboarding-e2e-results.json'), JSON.stringify({passed: checks.length, checks, browser: browser.version(), mode: 'deterministic', uncaughtErrors: errors}, null, 2));
  console.log(`Completed ${checks.length} onboarding browser checks.`);
})().catch(async error => {
  try { if (page && !page.isClosed()) await page.screenshot({path: path.join(screenshotDir, 'failure.png')}); } catch {}
  console.error(error.stack || error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
  await runtime?.cleanup();
});
