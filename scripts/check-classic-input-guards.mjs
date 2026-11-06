/**
 * Real DOM input regression for the classic games, Fantasy and Ambition.
 *
 * A running dev server or production preview is required. Production copies
 * the lazy-loaded game sources to dist/src, so the same checked anchors work
 * with both servers, including deployments below /pekkas-pokal/.
 *
 * This is NOT a graphics/performance test: renderer calls, shader precompile
 * and game RAF loops are suppressed. The game factories, registered DOM input
 * handlers and physics/action functions are real. Existing test APIs establish
 * an active state fixture; read-only injected getters inspect private input
 * ownership. Positive actions ensure negative tests cannot pass in idle states.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`Usage: node scripts/check-classic-input-guards.mjs

Run against an already running dev server or production preview.

Environment:
  GAME_URL         Base URL, including any deployment path (default http://localhost:8000/)
  CHROMIUM_PATH    Chromium executable; otherwise /usr/bin/chromium or Playwright's browser
  GAME_OUTPUT_DIR  Directory beneath this repository's scratchpad/ (default scratchpad/classic-input-guards)
  FENCING_ONLY=1   Run only the native Ctrl/Space, assistive-click and Escape fencing regressions
  HTTPS_PROXY      Optional proxy, with localhost and 127.0.0.1 bypassed

Examples:
  GAME_URL=http://localhost:8018/ node scripts/check-classic-input-guards.mjs
  GAME_URL=http://localhost:8080/pekkas-pokal/ FENCING_ONLY=1 node scripts/check-classic-input-guards.mjs

Writes JSON results and exits nonzero for failed checks, page errors or missing
instrumentation anchors. Renderer/RAF are suppressed: results prove input
behavior, not graphics quality or production performance.`);
  process.exit(0);
}
if (process.argv.length > 2)
  throw new Error('Unknown argument. Use --help for supported environment options.');

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratchRoot = resolve(repositoryRoot, 'scratchpad');
const outputDir = resolve(repositoryRoot, process.env.GAME_OUTPUT_DIR || 'scratchpad/classic-input-guards');
const outputRelative = relative(scratchRoot, outputDir);
if (outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative)) {
  throw new Error('GAME_OUTPUT_DIR must be inside this repository’s scratchpad/ directory.');
}
const baseURL = new URL(process.env.GAME_URL || 'http://localhost:8000/');
if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('GAME_URL must use http or https.');
const fencingOnly = process.env.FENCING_ONLY === '1';
const reportPath = resolve(outputDir, fencingOnly ? 'fencing-native.json' : 'classic-input-guards.json');
await mkdir(outputDir, { recursive: true });
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY)
  args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const browser = await chromium.launch({ executablePath, headless: true, args });
const page = await browser.newPage({ viewport: { width: 1000, height: 760 } }),
  checks = [],
  errors = [],
  instrumentationErrors = [];
page.on('pageerror', (e) => errors.push(e.message));

function replaceRequired(source, anchor, replacement, label, all = false) {
  const count = source.split(anchor).length - 1;
  if (!count || (!all && count !== 1)) {
    throw new Error(
      `Instrumentation anchor mismatch in ${label}: expected ${all ? 'at least one' : 'one'} occurrence, found ${count}: ${anchor}`,
    );
  }
  return all ? source.replaceAll(anchor, replacement) : source.replace(anchor, replacement);
}

async function instrument(route, transform) {
  try {
    const response = await route.fetch();
    if (!response.ok())
      throw new Error(`Cannot instrument ${route.request().url()}: HTTP ${response.status()}`);
    const source = transform(await response.text());
    await route.fulfill({ response, body: source });
  } catch (error) {
    const message = String(error.message || error);
    instrumentationErrors.push(message);
    console.error(message);
    // Fail the loaded module explicitly rather than silently running an
    // uninstrumented game and reporting a misleading green negative check.
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `throw new Error(${JSON.stringify(message)});`,
    });
  }
}

await page.route('**/src/games/shared/gfx.js*', (route) =>
  instrument(route, (source) => {
    source = replaceRequired(
      source,
      'export function guardRenderer(renderer, host) {',
      'export function guardRenderer(renderer, host) { renderer.render=()=>{};',
      'gfx renderer',
    );
    return replaceRequired(
      source,
      'export async function precompile(renderer, scene, camera, { timeout = 20000, target = null } = {}) {',
      'export async function precompile(renderer, scene, camera, { timeout = 20000, target = null } = {}) { return;',
      'gfx precompile',
    );
  }),
);
await page.route('**/src/games/shared/arcade.js*', (route) =>
  instrument(route, (source) =>
    replaceRequired(source, 'frame = requestAnimationFrame(tick);', 'frame=0;', 'arcade RAF', true),
  ),
);
const hooks = {
  pingis: [
    '  window.__ppPingis = {',
    `window.__modRead=()=>({phase:state.phase,keys:{...keys},helpOpen,live:b.live});`,
  ],
  shooting: [
    '  window.__ppSkytte = {',
    `window.__modRead=()=>({phase:state.phase,keys:{...aimInput.keys},helpOpen,shells:state.shells});`,
  ],
  fencing: [
    '  window.__ppFakt = {',
    `window.__modRead=()=>({phase:state.phase,pose:meS.pose,line:meS.line,helpOpen});`,
  ],
  fishing: [
    '  window.__ppFiske = {',
    `window.__modRead=()=>({phase:state.phase,targetX:state.targetX,keys:{...keys},helpOpen,bookOpen});`,
  ],
  pinball: [
    '  window.__pbFlipper = {',
    `window.__modRead=()=>({phase:state.phase,charging:state.charging,keys:[...heldKeys],plunger:[...plungerKeys],helpOpen,nudges:state.nudges.length});`,
  ],
  clay: [
    '  window.__ppLera = {',
    `window.__modRead=()=>({phase:state.phase,keySmooth,buttonKeySmooth,smoothing,keys:[...shapingKeys],paused,helpOpen});`,
  ],
  fantasy: ['  return { destroy() {', `window.__modRead=()=>({phase,selected,captain,squad:[...squad]});`],
  ambition: [
    '  return { destroy() {',
    `window.__modRead=()=>({phase:state.phase,help:state.help,pending:state.pending,selected:[...state.selected]});`,
  ],
};
await page.route('**/src/games/*/index.js*', (route) =>
  instrument(route, (source) => {
    const game = new URL(route.request().url()).pathname.split('/').at(-2);
    if (!hooks[game]) throw new Error(`Unexpected game module in classic input suite: ${game}`);
    if (!['fantasy', 'ambition'].includes(game))
      source = replaceRequired(source, 'raf = requestAnimationFrame(tick);', 'raf=0;', `${game} RAF`, true);
    if (game === 'pingis')
      source = replaceRequired(source, 'let renderOn = true;', 'let renderOn = false;', 'pingis render flag');
    const [anchor, hook] = hooks[game];
    return replaceRequired(source, anchor, hook + '\n' + anchor, `${game} state getter`);
  }),
);
function check(name, condition, detail) {
  checks.push({ name, pass: !!condition, ...(detail ? { detail } : {}) });
  if (!condition) console.log('FAIL ' + name + ' ' + JSON.stringify(detail));
}
async function read() {
  return page.evaluate(() => window.__modRead());
}
async function event(key, code, modifiers = {}, type = 'keydown', selector = '.pb-canvas') {
  return page.evaluate(
    ({ key, code, modifiers, type, selector }) => {
      const e = new KeyboardEvent(type, { key, code, ...modifiers, bubbles: true, cancelable: true });
      const target = document.querySelector(selector);
      if (!target) throw new Error('No target ' + selector);
      target.dispatchEvent(e);
      return e.defaultPrevented;
    },
    { key, code, modifiers, type, selector },
  );
}
async function unchanged(name, key, code, selector = '.pb-canvas') {
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    const before = await read(),
      prevented = await event(key, code, { [modifier]: true }, 'keydown', selector),
      after = await read();
    check(`${name} ${modifier}`, JSON.stringify(before) === JSON.stringify(after) && !prevented, {
      before,
      after,
      prevented,
    });
    await event(key, code, { [modifier]: true }, 'keyup', selector);
  }
}
async function open(year) {
  // A different query forces full document navigation: hash-only navigation
  // could retain a previous game's getter or an older app.js Escape listener.
  const url = new URL(baseURL);
  url.searchParams.set('gfx', 'safe');
  url.searchParams.set('modifierCase', String(year));
  url.hash = `/spel/${year}`;
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 90000 });
  if (instrumentationErrors.length) throw new Error(instrumentationErrors.join('\n'));
  try {
    await page.waitForFunction(() => !!window.__modRead, null, { timeout: 30000 });
  } catch (error) {
    throw new Error(
      `Game ${year} did not expose its required input fixture. ${instrumentationErrors.join('\n') || errors.join('\n') || error.message}`,
    );
  }
}
async function close() {
  await page.locator('#game-close').click();
  check('close removes canvas', (await page.locator('#game-mount canvas').count()) === 0);
}
try {
  if (!fencingOnly) {
    await open(2019);
    await page.evaluate(() => {
      const p = window.__ppPingis;
      p.startSingle(0);
      p.state.phase = 'serve';
    });
    await unchanged('pingis print does not pause', 'p', 'KeyP');
    await unchanged('pingis save does not steer', 's', 'KeyS');
    await unchanged('pingis modified Space does not serve', ' ', 'Space');
    await event('S', 'KeyS', { shiftKey: true });
    check('pingis Shift+S still steers', (await read()).keys.down);
    await event('S', 'KeyS', { ctrlKey: true }, 'keyup');
    check('pingis physical keyup releases under Ctrl', !(await read()).keys.down);
    await event(' ', 'Space');
    check('pingis normal Space actually serves', (await read()).live);
    await close();

    await open(2022);
    await page.evaluate(() => {
      const p = window.__ppSkytte;
      p.startGame();
      p.state.phase = 'flight';
      p.state.shells = 2;
    });
    await unchanged('shooting print does not pause', 'p', 'KeyP');
    await unchanged('shooting select/back does not aim', 'ArrowLeft', 'ArrowLeft');
    await unchanged('shooting modified Enter does not fire', 'Enter', 'Enter');
    await event('Shift', 'ShiftLeft', { shiftKey: true });
    check('shooting Shift precision still holds', (await read()).keys.fine);
    await event('Shift', 'ShiftLeft', { ctrlKey: true }, 'keyup');
    check('shooting physical keyup releases under Ctrl', !(await read()).keys.fine);
    await event('Enter', 'Enter');
    check('shooting normal Enter uses one real shell', (await read()).shells === 1);
    await event('p', 'KeyP');
    check('shooting normal P pauses', (await read()).helpOpen);
    await unchanged('shooting modified Escape leaves help open', 'Escape', 'Escape');
    await event('Escape', 'Escape');
    check('shooting normal Escape closes help', !(await read()).helpOpen);
    await close();
  }

  await open(2023);
  await page.evaluate(() => {
    const p = window.__ppFakt;
    p.startGame();
    p.goLive();
  });
  await unchanged('fencing find does not feint', 'f', 'KeyF');
  await unchanged('fencing print does not pause', 'p', 'KeyP');
  await unchanged('fencing modified W does not change guard', 'w', 'KeyW');
  const lunge = page.locator('#fen-lunge');
  const native = [];
  await page.evaluate(() => {
    window.__nativeClicks = [];
    document
      .querySelector('#fen-lunge')
      .addEventListener('click', (e) =>
        window.__nativeClicks.push({ detail: e.detail, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey }),
      );
  });
  for (const order of ['Enter', 'Space', 'release-control-first']) {
    await page.evaluate(() => {
      window.__ppFakt.me.pose = 'guard';
      window.__nativeClicks = [];
    });
    await lunge.focus();
    await page.keyboard.down('Control');
    if (order === 'Enter') {
      await page.keyboard.press('Enter');
      await page.keyboard.up('Control');
    } else {
      await page.keyboard.down('Space');
      if (order === 'release-control-first') {
        await page.keyboard.up('Control');
        await page.keyboard.up('Space');
      } else {
        await page.keyboard.up('Space');
        await page.keyboard.up('Control');
      }
    }
    const state = await read(),
      clicks = await page.evaluate(() => window.__nativeClicks);
    native.push({ order, state, clicks });
    check('fencing native Ctrl chain ' + order, state.pose === 'guard', { state, clicks });
  }
  await page.evaluate(() => {
    window.__ppFakt.me.pose = 'guard';
  });
  await lunge.focus();
  await page.keyboard.press('Enter');
  check('fencing plain native Enter still lunges', (await read()).pose === 'lunge');
  await page.evaluate(() => {
    window.__ppFakt.me.pose = 'guard';
  });
  await lunge.focus();
  await page.keyboard.press('Shift+Space');
  check('fencing native Shift+Space still lunges', (await read()).pose === 'lunge');
  await page.evaluate(() => {
    window.__ppFakt.me.pose = 'guard';
  });
  await lunge.dispatchEvent('click', { detail: 0, button: 0 });
  check('fencing assistive click still lunges', (await read()).pose === 'lunge');
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    await page.evaluate(() => {
      window.__ppFakt.me.pose = 'guard';
    });
    await lunge.dispatchEvent('click', { detail: 0, button: 0, [modifier]: true });
    check('fencing modified assistive click remains inert ' + modifier, (await read()).pose === 'guard');
  }
  await page.evaluate(() => {
    window.__ppFakt.me.pose = 'guard';
  });
  await event('F', 'KeyF', { shiftKey: true });
  check('fencing Shift+F still feints', (await read()).pose === 'feint');
  await event('p', 'KeyP');
  await unchanged('fencing modified Escape leaves help and game open', 'Escape', 'Escape');
  await event('Escape', 'Escape');
  check(
    'fencing normal Escape closes only help',
    !(await read()).helpOpen && (await page.locator('#game-stage').isVisible()),
  );
  await close();

  if (!fencingOnly) {
    await open(2024);
    await page.evaluate(() => {
      const p = window.__ppFiske;
      p.startGame();
      p.state.phase = 'drop';
    });
    await unchanged('fishing modified steering keeps lure still', 'a', 'KeyA');
    await unchanged('fishing print does not pause', 'p', 'KeyP');
    const oldX = (await read()).targetX;
    await event('A', 'KeyA', { shiftKey: true });
    check('fishing Shift+A really steers', (await read()).targetX < oldX && (await read()).keys.left);
    await event('A', 'KeyA', { metaKey: true }, 'keyup');
    check('fishing physical keyup releases under Meta', !(await read()).keys.left);
    await event('p', 'KeyP');
    await unchanged('fishing modified Escape leaves help open', 'Escape', 'Escape');
    await event('Escape', 'Escape');
    check('fishing normal Escape closes help', !(await read()).helpOpen);
    await close();

    await open(2025);
    await page.evaluate(() => window.__pbFlipper.startGame());
    await unchanged('pinball modified Space does not charge', ' ', 'Space');
    await unchanged('pinball modified A does not flip', 'a', 'KeyA');
    await unchanged('pinball modified N does not nudge', 'n', 'KeyN');
    await event('Shift', 'ShiftLeft', { shiftKey: true });
    check(
      'pinball ordinary Shift flipper still works',
      (await read()).keys.some(([code]) => code === 'ShiftLeft'),
    );
    await event('Shift', 'ShiftLeft', { ctrlKey: true }, 'keyup');
    check('pinball physical Shift release clears under Ctrl', !(await read()).keys.length);
    await event(' ', 'Space');
    check('pinball normal Space charges', (await read()).charging);
    await event(' ', 'Space', { ctrlKey: true }, 'keyup');
    check(
      'pinball real held Space releases under Ctrl',
      !(await read()).charging && !(await read()).plunger.length,
    );
    await event('p', 'KeyP');
    await unchanged('pinball modified Escape leaves help open', 'Escape', 'Escape');
    await event('Escape', 'Escape');
    check('pinball normal Escape closes help', !(await read()).helpOpen);
    await close();

    await open(2026);
    await page.evaluate(() => {
      const p = window.__ppLera;
      p.startGame();
      p.state.phase = 'throw';
    });
    await unchanged('clay find-next does not smooth', 'g', 'KeyG');
    await unchanged('clay back does not shape', 'ArrowLeft', 'ArrowLeft');
    await unchanged('clay modified Enter does not finish', 'Enter', 'Enter');
    await unchanged('clay print does not pause', 'p', 'KeyP');
    await unchanged('clay local modified Space does not smooth', ' ', 'Space', '#lr-smooth');
    await event('G', 'KeyG', { shiftKey: true });
    check('clay Shift+G really smooths', (await read()).keySmooth);
    await event('G', 'KeyG', { altKey: true }, 'keyup');
    check('clay physical G release clears under Alt', !(await read()).keySmooth);
    await event('Enter', 'Enter');
    check('clay normal Enter finishes current piece', (await read()).phase === 'fire');
    await close();

    await open(2011);
    await page.locator('.arcade-overlay .arcade-primary').click();
    await event('2', 'Digit2', {}, 'keydown', '.arcade');
    await unchanged('fantasy copy does not change captain', 'c', 'KeyC', '.arcade');
    await unchanged('fantasy modified number does not change selection', '3', 'Digit3', '.arcade');
    await event('c', 'KeyC', {}, 'keydown', '.arcade');
    check('fantasy plain C changes captain', (await read()).captain === (await read()).squad[1]);
    await close();

    await open(2018);
    await page.locator('.arcade-overlay .arcade-primary').click();
    const cards = page.locator('.amb-hand button:not(:disabled)');
    await cards.nth(1).focus();
    for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
      const before = await page.evaluate(() => document.activeElement.dataset.card);
      const prevented = await event(
        'ArrowLeft',
        'ArrowLeft',
        { [modifier]: true },
        'keydown',
        '.amb-hand button:focus',
      );
      check(
        'ambition modified arrow preserves hand focus ' + modifier,
        before === (await page.evaluate(() => document.activeElement.dataset.card)) && !prevented,
      );
    }
    await event('ArrowLeft', 'ArrowLeft', {}, 'keydown', '.amb-hand button:focus');
    check(
      'ambition plain arrow still moves card focus',
      await cards.first().evaluate((el) => el === document.activeElement),
    );
    await close();
  }
  check('no page errors', errors.length === 0, errors);
  const failures = checks.filter((check) => !check.pass);
  await writeFile(
    reportPath,
    JSON.stringify(
      { baseURL: baseURL.href, fencingOnly, checks, errors, instrumentationErrors, native },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({ checks: checks.length, failed: failures, errors, report: reportPath }, null, 2),
  );
  if (failures.length || errors.length) process.exitCode = 1;
} catch (error) {
  await writeFile(
    reportPath,
    JSON.stringify(
      { baseURL: baseURL.href, fencingOnly, checks, errors, instrumentationErrors, error: error.message },
      null,
      2,
    ) + '\n',
  );
  throw error;
} finally {
  await browser.close();
}
