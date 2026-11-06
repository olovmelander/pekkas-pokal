/** Focused browser regressions for gameplay input guards.
 * Run from the repository root against a running server:
 * GAME_URL=http://localhost:8018/ node scripts/check-input-guards.mjs
 * No source rewriting, renderer stubs, game-state exposes or screenshot baselines.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const games = {
  2012: { action: '[data-control="throttle"]', left: '[data-control="left"]', held: 'is-held', directions: ['KeyW', 'ArrowLeft'], stages: 1 },
  2013: { action: '.field-action', left: '.field-left', held: 'held', directions: ['KeyA', 'ArrowLeft'], stages: 2, globalSpace: true },
  2014: { action: '.field-action', left: '.field-left', held: 'held', directions: ['KeyA', 'ArrowLeft'], stages: 2, globalSpace: true },
  2015: { action: '[data-input="action"]', left: '[data-input="left"]', held: 'held', directions: ['KeyA', 'ArrowLeft'], stages: 2, globalSpace: true, rifle: true },
  2016: { action: '[data-input="action"]', left: '[data-input="left"]', held: 'held', directions: ['KeyA', 'ArrowLeft'], stages: 2, globalSpace: true },
  2017: { action: '[data-control="surge"]', left: '[data-control="left"]', held: 'held', directions: ['KeyW', 'ArrowLeft'], stages: 1 }
};
if (process.argv.includes('--help')) {
  console.log('Run from the repository root. GAME_URL selects the server; GAME_YEARS defaults to 2012,2013,2014,2015,2016,2017. GAME_DESKTOP=0 skips desktop cases (enabled by default). GAME_TOUCH_YEARS defaults to 2012,2017 (empty disables touch). GAME_TOUCH_PROFILE=phone|landscape selects 390x844 (default) or 844x390 for touch cases. INPUT_REPORT_DIR and CHROMIUM_PATH are optional. One browser, sequential contexts, normal rendering.');
  process.exit(0);
}
const parseYears = value => value.split(',').filter(Boolean).map(Number);
const years = parseYears(process.env.GAME_YEARS || Object.keys(games).join(','));
const desktopYears = process.env.GAME_DESKTOP === '0' ? [] : years;
const touchYears = parseYears(process.env.GAME_TOUCH_YEARS ?? '2012,2017').filter(year => years.includes(year));
const touchProfile = process.env.GAME_TOUCH_PROFILE || 'phone';
assert(['phone', 'landscape'].includes(touchProfile), `Unsupported GAME_TOUCH_PROFILE: ${touchProfile}`);
const touchViewport = touchProfile === 'landscape' ? { width: 844, height: 390 } : { width: 390, height: 844 };
for (const year of [...years, ...touchYears]) assert(games[year], `Unsupported GAME_YEARS entry: ${year}`);
assert(years.length, 'GAME_YEARS must include at least one game');
const baseURL = process.env.GAME_URL || 'http://localhost:8018/';
const output = resolve(process.env.INPUT_REPORT_DIR || 'scratchpad/input-guards');
mkdirSync(output, { recursive: true });
// createRequire also lets this preparation copy run from outside the repository.
const { chromium } = createRequire(resolve('package.json'))('playwright');
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const report = { started: new Date().toISOString(), baseURL, checks: [], failures: [] };
let browser;
function pass(year, profile, check, details = {}) {
  report.checks.push({ year, profile, check, ...details });
  console.log(`PASS ${year} ${profile}: ${check}`);
}
async function isHeld(page, selector, name) {
  return page.locator(selector).evaluate((element, className) => element.classList.contains(className), name);
}
async function assertHeld(page, selector, name, expected, message) {
  assert.equal(await isHeld(page, selector, name), expected, message);
}
async function start(page, year) {
  const config = games[year];
  await page.goto(`${baseURL.replace(/#.*$/, '')}#/spel/${year}`, { waitUntil: 'domcontentloaded' });
  const startButton = page.locator('.arcade-overlay .arcade-primary');
  await startButton.waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#game-loading').waitFor({ state: 'hidden', timeout: 90000 });
  for (let stage = 0; stage < config.stages; stage++) await startButton.click();
  await page.locator(config.action).waitFor({ state: 'visible' });
  await page.locator(config.left).waitFor({ state: 'visible' });
  assert.equal(await page.locator('.arcade-overlay').isVisible(), false, 'Start panel still blocks gameplay');
  if (config.rifle) await page.waitForFunction(() => /0\s*\/\s*10/.test(document.querySelector('.country-readout')?.textContent || ''));
}
async function closeGame(page) {
  for (const key of ['Space', 'Enter', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'Shift', 'Control', 'Alt', 'Meta']) {
    await page.keyboard.up(key).catch(() => {});
  }
  await page.mouse.up({ button: 'left' }).catch(() => {});
  await page.mouse.up({ button: 'right' }).catch(() => {});
  await page.mouse.up({ button: 'middle' }).catch(() => {});
  await page.locator('#game-close').click();
  await page.locator('#game-stage').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#game-mount canvas').count(), 0, 'Canvas remained after closing the game');
}
async function modifiedKeys(page, year) {
  const config = games[year];
  // Native system shortcuts are dispatched synthetically on purpose: the test
  // verifies delivered DOM events without asking the OS to close its browser.
  const rows = await page.evaluate(({ action, left, held, directions, globalSpace }) => {
    const rows = [];
    const targets = [left, action, ...(globalSpace ? ['.arcade'] : [])];
    for (const selector of targets) {
      const element = document.querySelector(selector);
      element.focus({ preventScroll: true });
      const codes = selector === '.arcade' ? ['Space'] : ['Space', 'Enter', ...directions];
      for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) for (const code of codes) {
        const event = new KeyboardEvent('keydown', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true, [modifier]: true });
        const acceptedByBrowser = element.dispatchEvent(event);
        const becameHeld = [action, left].some(target => document.querySelector(target).classList.contains(held));
        // Cleanup is unconditional so a diagnosed bug cannot leave a held key.
        element.dispatchEvent(new KeyboardEvent('keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true, [modifier]: true }));
        rows.push({ selector, modifier, code, acceptedByBrowser, becameHeld });
      }
    }
    return rows;
  }, config);
  const bad = rows.filter(row => !row.acceptedByBrowser || row.becameHeld);
  assert.deepEqual(bad, [], `Modified keys entered gameplay or blocked their default action: ${JSON.stringify(bad)}`);
  pass(year, 'desktop', 'Ctrl/Meta/Alt leave focused controls and global Space inactive', { combinations: rows.length });
}
async function secondaryMouse(page, year) {
  const config = games[year];
  for (const selector of [config.left, config.action]) for (const button of ['right', 'middle']) {
    const box = await page.locator(selector).boundingBox();
    assert(box, `Missing hit area for ${selector}`);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    try {
      await page.mouse.down({ button });
      await assertHeld(page, selector, config.held, false, `${button} mouse button started ${selector}`);
    } finally {
      await page.mouse.up({ button });
    }
    await assertHeld(page, selector, config.held, false, `${button} mouse release left ${selector} held`);
  }
  pass(year, 'desktop', 'right/middle mouse do not activate direction or action');
}
async function positiveLocalKeys(page, year) {
  const config = games[year], button = page.locator(config.left);
  for (const code of ['Space', 'Enter']) {
    await button.focus();
    await page.keyboard.down(code);
    try {
      await assertHeld(page, config.left, config.held, true, `Ordinary ${code} stopped activating focused direction`);
      // The modifier arrives AFTER activation. Physical release must still win.
      await page.keyboard.down('Control');
      await page.keyboard.up(code);
      await assertHeld(page, config.left, config.held, false, `${code} stayed held when Control was added before release`);
    } finally {
      await page.keyboard.up(code);
      await page.keyboard.up('Control');
    }
    await button.focus();
    await page.keyboard.down('Shift');
    try {
      await page.keyboard.down(code);
      await assertHeld(page, config.left, config.held, true, `Shift+${code} was incorrectly blocked`);
      await page.keyboard.up(code);
      await assertHeld(page, config.left, config.held, false, `Shift+${code} did not release`);
    } finally {
      await page.keyboard.up(code);
      await page.keyboard.up('Shift');
    }
  }
  // Verify the local/global route still owns normal direction shortcuts. No
  // private keys Set or physics state is exposed solely for this assertion.
  const directions = await button.evaluate((element, codes) => {
    const rows = [];
    for (const shiftKey of [false, true]) for (const code of codes) {
      const down = new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, shiftKey });
      element.dispatchEvent(down);
      element.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true, shiftKey }));
      rows.push({ code, shiftKey, handled: down.defaultPrevented });
    }
    return rows;
  }, config.directions);
  assert(directions.every(row => row.handled), `Plain/Shift direction shortcut was lost: ${JSON.stringify(directions)}`);
  pass(year, 'desktop', 'plain/Shift keys remain owned; Control added before keyup cannot stick a hold');
}
async function globalSpace(page, year) {
  const config = games[year];
  if (!config.globalSpace) return;
  const before = config.rifle
    ? Number((await page.locator('.country-readout').innerText()).match(/(\d+)\s*\/\s*10/)[1]) : null;
  await page.locator('.arcade').focus();
  try {
    await page.keyboard.down('Space');
    await assertHeld(page, config.action, config.held, true, 'Global plain Space was lost after shared preventDefault');
    await page.keyboard.down('Control');
    await page.keyboard.up('Space');
    await assertHeld(page, config.action, config.held, false, 'Global Space did not release while Control was down');
  } finally {
    await page.keyboard.up('Space');
    await page.keyboard.up('Control');
  }
  if (config.rifle) {
    await page.waitForFunction(previous => {
      const match = document.querySelector('.country-readout')?.textContent.match(/(\d+)\s*\/\s*10/);
      return match && Number(match[1]) === previous + 1;
    }, before);
  }
  pass(year, 'desktop', 'root Space starts despite shared preventDefault and releases with Control held');
}
async function blurCleanup(page, year) {
  const config = games[year];
  await page.locator(config.left).focus();
  await page.keyboard.down('Space');
  await assertHeld(page, config.left, config.held, true, 'Could not establish hold before blur');
  // A deterministic delivered window event; OS focus transfer is not claimed.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await assertHeld(page, config.left, config.held, false, 'Window blur left a direction held');
  await page.keyboard.up('Space');
  assert.equal(await page.locator('.arcade-pause').isVisible(), true, 'Window blur did not pause');
  await page.locator('[data-tool="resume"]').click();
  await assertHeld(page, config.left, config.held, false, 'Resume restored a stale direction');
  pass(year, 'desktop', 'window blur cancels a hold and resume leaves it released');
}
async function twoThumbs(page, context, year, profile) {
  const config = games[year];
  const point = async (selector, id) => {
    const box = await page.locator(selector).boundingBox();
    assert(box, `Missing touch area for ${selector}`);
    return { id, x: box.x + box.width / 2, y: box.y + box.height / 2, radiusX: 7, radiusY: 7, force: 1 };
  };
  const action = await point(config.action, 11), left = await point(config.left, 12);
  // Test-only DOM observations, never game internals. Removed with this page.
  await page.evaluate(() => {
    window.__inputGuardTouches = [];
    document.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch') window.__inputGuardTouches.push({ primary: event.isPrimary, target: event.target.closest('button')?.getAttribute('aria-label') || event.target.textContent });
    }, { capture: true });
  });
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [action] });
    await assertHeld(page, config.action, config.held, true, 'First thumb failed to hold action');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [action, left] });
    await assertHeld(page, config.action, config.held, true, 'Second thumb cancelled first thumb');
    await assertHeld(page, config.left, config.held, true, 'Non-primary second thumb failed to steer');
    const events = await page.evaluate(() => window.__inputGuardTouches);
    assert(events.some(event => event.primary === false), 'Touch test never delivered a non-primary pointer');
    // CDP touchEnd supplies the changed (lifted) contact here.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [left] });
    await assertHeld(page, config.left, config.held, false, 'Lifted steering thumb stayed held');
    await assertHeld(page, config.action, config.held, true, 'Lifting steering thumb cancelled action thumb');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [action] });
    await assertHeld(page, config.action, config.held, false, 'Final action thumb stayed held');
    pass(year, profile, 'non-primary second thumb steers independently of held action', { pointerEvents: events });
  } finally {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }).catch(() => {});
    await cdp.detach();
  }
}
try {
  browser = await chromium.launch({ executablePath, headless: true, args });
  for (const [profile, selected] of [['desktop', desktopYears], [touchProfile, touchYears]]) {
    if (!selected.length) continue;
    const context = await browser.newContext(profile === 'desktop'
      ? { viewport: { width: 1280, height: 800 } }
      : { viewport: touchViewport, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      for (const year of selected) {
        errors.length = 0;
        try {
          await start(page, year);
          if (profile === 'desktop') {
            await modifiedKeys(page, year);
            await secondaryMouse(page, year);
            await positiveLocalKeys(page, year);
            await globalSpace(page, year);
            await blurCleanup(page, year);
          } else await twoThumbs(page, context, year, profile);
          await closeGame(page);
          assert.deepEqual(errors, [], `Browser errors: ${errors.join('; ')}`);
          pass(year, profile, 'game closes without canvas or page errors');
        } catch (error) {
          const failure = { year, profile, message: error.message, pageErrors: [...errors] };
          report.failures.push(failure);
          console.error(`FAIL ${year} ${profile}: ${error.message}`);
          await page.screenshot({ path: resolve(output, `${year}-${profile}-failure.png`) }).catch(() => {});
          // The next navigation creates a fresh document even after failure.
        }
      }
    } finally {
      await context.close();
    }
  }
} catch (error) {
  report.failures.push({ phase: 'harness', message: error.message });
  console.error(error);
} finally {
  await browser?.close();
  report.finished = new Date().toISOString();
  writeFileSync(resolve(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.checks.length} checks passed; ${report.failures.length} failures. Report: ${resolve(output, 'report.json')}`);
}
if (report.failures.length) process.exitCode = 1;
