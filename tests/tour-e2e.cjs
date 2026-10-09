const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const {startServer} = require('./helpers/server.cjs');

let runtime, browser, page;
const checks = [];
async function check(name, run) { await run(); checks.push(name); console.log('PASS:', name); }
const card = () => page.locator('.organa-tour-card');
const done = () => page.evaluate(() => localStorage.getItem('organaTourDone'));

(async () => {
  try {
    runtime = await startServer({extraEnv: {DRY_RUN_DELAY_MS: '150'}});
    browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {}), args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
    page = await browser.newPage({viewport: {width: 1440, height: 960}});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(runtime.base + '/app');
    await page.waitForFunction(() => Boolean(window.OrganaTour) && !document.body.classList.contains('organa-loading'), null, {timeout: 60000});

    await check('Automated browsers are not interrupted by the tour', async () => {
      await page.waitForTimeout(1500);
      assert.equal(await card().count(), 0);
    });
    await check('The sidebar offers a replay button', async () => {
      await page.locator('#organaTakeTour').click();
      await card().waitFor();
      assert.match(await card().innerText(), /Welcome to Organa/);
      assert.match(await card().innerText(), /Step 1 of 10/);
    });
    await check('Next and Back move through the steps and highlight real sidebar buttons', async () => {
      await card().getByRole('button', {name: 'Next', exact: true}).click();
      assert.match(await card().innerText(), /Connect the AI/);
      const spot = await page.locator('.organa-tour-spot').boundingBox();
      const target = await page.locator('[data-organa-route="settings"]').boundingBox();
      assert.ok(spot && target && spot.x <= target.x && spot.y <= target.y + 1);
      await card().getByRole('button', {name: 'Back', exact: true}).click();
      assert.match(await card().innerText(), /Welcome to Organa/);
      assert.equal(await card().getByRole('button', {name: 'Back', exact: true}).isDisabled(), true);
    });
    await check('Skip closes the tour and it is not shown again', async () => {
      await card().getByRole('button', {name: 'Skip tour', exact: true}).click();
      assert.equal(await card().count(), 0);
      assert.equal(await done(), '1');
    });
    await check('Escape closes the tour', async () => {
      await page.locator('#organaTakeTour').click();
      await card().waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await card().count(), 0);
    });
    await check('The tour can be completed with Finish', async () => {
      await page.locator('#organaTakeTour').click();
      for (let step = 1; step < 10; step += 1) await card().getByRole('button', {name: 'Next', exact: true}).click();
      assert.match(await card().innerText(), /You are ready/);
      await card().getByRole('button', {name: 'Finish', exact: true}).click();
      assert.equal(await card().count(), 0);
    });
    await check('Hidden targets fall back to a centered card (simple menu)', async () => {
      await page.locator('#organaSimpleMenu').click();
      await page.locator('#organaTakeTour').click();
      await card().waitFor();
      await card().getByRole('button', {name: 'Next', exact: true}).click();
      assert.equal(await card().isVisible(), true);
      await page.keyboard.press('Escape');
      await page.locator('#organaSimpleMenu').click();
    });
    assert.deepEqual(errors, []);
    console.log(`Tour browser checks: ${checks.length}/${checks.length}`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await runtime?.stop?.();
  }
})();
