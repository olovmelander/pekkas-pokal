/**
 * Browser regression of fencing's frame-time adaptation while paused.
 * Run from the repository root against a running dev/preview server.
 * GAME_URL=http://localhost:8018/ node scripts/check-fencing-paused-perf.mjs
 *
 * Uses the real factory, help button, tick and existing __ppFakt.perf/frames
 * APIs. Test-side RAF timestamps advance at 20 Hz; frame-budget zero avoids
 * spending GPU work on hundreds of policy-test frames. This is not a GPU
 * benchmark or a replacement for normal-render pause/rotation/restore checks.
 * No production test hook or extracted product callback is added.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

if (process.argv.includes('--help')) {
  console.log(`Run from the repository root. Environment:
GAME_URL         Running dev or preview URL (default http://localhost:8000/)
CHROMIUM_PATH    Optional Chromium executable
GAME_OUTPUT_DIR  Output beneath scratchpad/ (default scratchpad/fencing-paused-perf)
HTTPS_PROXY      Optional proxy, bypassed for localhost/127.0.0.1

Policy check only: actual browser callbacks with controlled RAF timestamps
and the existing zero-frame rendering budget. Exits nonzero on regressions.`);
  process.exit(0);
}
if (process.argv.length > 2) throw new Error('Unknown argument. Use --help.');
const repositoryRoot = process.cwd();
const scratchRoot = resolve(repositoryRoot, 'scratchpad');
const output = resolve(repositoryRoot, process.env.GAME_OUTPUT_DIR || 'scratchpad/fencing-paused-perf');
const outputRelative = relative(scratchRoot, output);
if (outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative)) {
  throw new Error('GAME_OUTPUT_DIR must be inside the repository scratchpad/.');
}
const baseURL = new URL(process.env.GAME_URL || 'http://localhost:8000/');
if (!['http:', 'https:'].includes(baseURL.protocol)) throw new Error('GAME_URL must be http(s).');
await mkdir(output, { recursive: true });
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true, args
});
const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 2 });
const errors = [], report = { status: 'RUNNING', errors };
page.on('pageerror', error => errors.push(error.message));
await page.route('**/src/games/fencing/index.js*', async route => {
  try {
    const response = await route.fetch(), source = await response.text();
    if (!response.ok() || !source.includes('export async function createFencing(container)') ||
        !source.includes('requestAnimationFrame(tick)') || !source.includes('cancelAnimationFrame(raf)')) {
      throw new Error('Fencing RAF instrumentation anchor missing');
    }
    const scheduler = `
let __perfQueuedFrame = null, __perfFrameId = 0, __perfTimestamp = null;
const requestAnimationFrame = callback => {
  __perfQueuedFrame = { callback, id: ++__perfFrameId };
  return __perfFrameId;
};
const cancelAnimationFrame = id => {
  if (__perfQueuedFrame?.id === id) __perfQueuedFrame = null;
};
window.__fencingPerfStep = (frames, milliseconds = 50) => {
  if (__perfTimestamp === null) __perfTimestamp = performance.now();
  let executed = 0;
  for (let frame = 0; frame < frames; frame++) {
    __perfTimestamp += milliseconds;
    const queued = __perfQueuedFrame;
    __perfQueuedFrame = null;
    if (queued) { queued.callback(__perfTimestamp); executed++; }
  }
  return executed;
};
`;
    await route.fulfill({ response, body: scheduler + source });
  } catch (error) {
    errors.push(error.message);
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: `throw new Error(${JSON.stringify(error.message)});` });
  }
});
try {
  await page.goto(new URL('#/spel/2023', baseURL).href, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__ppFakt && window.__fencingPerfStep, null, { timeout: 120000 });
  report.before = await page.evaluate(() => {
    const game = window.__ppFakt;
    game.startGame(); game.goLive(); game.frames(0);
    game.perf(true); window.__fencingPerfStep(1);
    document.querySelector('#fen-info').click();
    if (document.querySelector('#fen-help').hidden) throw new Error('Help did not pause fencing');
    return { perf: game.perf(true), phase: game.state.phase, phaseT: game.state.phaseT,
      myTouches: game.state.myTouches, foeTouches: game.state.foeTouches, me: { ...game.me }, ai: { ...game.ai } };
  });
  report.paused = await page.evaluate(() => {
    window.__fencingPerfStep(330);
    const game = window.__ppFakt;
    return { perf: game.perf(true), phase: game.state.phase, phaseT: game.state.phaseT,
      myTouches: game.state.myTouches, foeTouches: game.state.foeTouches, me: { ...game.me }, ai: { ...game.ai } };
  });
  if (JSON.stringify(report.before) !== JSON.stringify(report.paused)) throw new Error('Paused 20 Hz ticks changed quality or duel state');
  report.active = await page.evaluate(() => {
    document.querySelector('#fen-help-close').click();
    window.__fencingPerfStep(500);
    return window.__ppFakt.perf(true);
  });
  if (report.active.level !== 3 || report.active.bloom || report.active.shadowSize >= report.before.perf.shadowSize) {
    throw new Error('Active 20 Hz ticks failed to keep the existing quality adaptation');
  }
  if (report.before.perf.pixelRatio > 1.01 && report.active.pixelRatio >= report.before.perf.pixelRatio) {
    throw new Error('Active slow frames no longer lower pixel ratio');
  }
  await page.locator('#game-close').click();
  const afterClose = await page.evaluate(() => ({ queuedFrames: window.__fencingPerfStep(8), api: !!window.__ppFakt }));
  if (afterClose.queuedFrames || afterClose.api) throw new Error('Fencing frame callback remained after close');
  if (errors.length) throw new Error(errors.join('\n'));
  report.closed = afterClose;
  report.status = 'PASS';
  console.log('PASS fencing: paused 20 Hz preserves quality/state; active 20 Hz still adapts; close cancels RAF');
} catch (error) {
  report.status = 'FAIL'; report.failure = error.message;
  throw error;
} finally {
  await browser.close();
  await writeFile(resolve(output, 'fencing-paused-perf.json'), JSON.stringify(report, null, 2));
}
