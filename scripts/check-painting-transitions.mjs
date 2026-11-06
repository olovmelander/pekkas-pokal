/** Deterministic browser regression through the actual painting engine and
 * handlers. The fixture advances a 20 Hz clock and skips scene rendering;
 * use check-arcade.mjs separately for normal-render visual checks.
 * Start Vite first; GAME_URL defaults to http://localhost:8018/.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const base = process.env.GAME_URL || 'http://localhost:8018/';
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true, args
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor(...values) { super(...values); window.__paintingAudio = this; }
    };
  });
  await page.route('**/src/games/painting/index.js*', async route => {
    const response = await route.fetch();
    let source = await response.text();
    assert.ok(source.includes('const dt = Math.min(Math.max(timer.getDelta(), 0), MAX_STEP);'), 'Fixture clock hook moved');
    source = source.replaceAll('raf = requestAnimationFrame(tick);', 'raf = 0;')
      .replace('const dt = Math.min(Math.max(timer.getDelta(), 0), MAX_STEP);', 'const dt = 0.05;')
      .replaceAll('renderer.render(scene, camera);', '')
      .replace('await precompile(renderer, scene, camera);', '')
      .replace('  window.__ppMaleri = {', '  window.__paintingStep = n => { for (let i = 0; i < n; i++) tick(); };\n  window.__ppMaleri = {');
    await route.fulfill({ response, body: source });
  });
  await page.goto(new URL('?gfx=safe#/spel/2021', base).href);
  await page.locator('#game-loading').waitFor({ state: 'hidden', timeout: 60000 });
  const step = n => page.evaluate(n => window.__paintingStep(n), n);
  const state = () => page.evaluate(() => ({
    phase: __ppMaleri.state.phase, score: __ppMaleri.state.score,
    work: __ppMaleri.state.workNo, results: __ppMaleri.state.results.length,
    selected: __ppMaleri.state.selected, drops: { ...__ppMaleri.drops() }
  }));
  await page.locator('#pm-start').click();
  await step(70);
  assert.equal((await state()).phase, 'paint');

  const palette = await page.evaluate(() => __ppMaleri.wellScreen('r'));
  await page.locator('#pm-palette').dispatchEvent('pointerdown', {
    button: 2, pointerType: 'mouse', clientX: palette.x, clientY: palette.y
  });
  assert.equal((await state()).drops.r, 0, 'Secondary pointer added pigment');
  await page.locator('#pm-palette').dispatchEvent('pointerdown', {
    button: 0, pointerType: 'mouse', clientX: palette.x, clientY: palette.y
  });
  assert.equal((await state()).drops.r, 1, 'Primary palette gesture stopped working');
  const beforeKeys = await state();
  await page.locator('.pm-ui').focus();
  await page.evaluate(() => {
    for (const options of [{ key: '1', code: 'Digit1', ctrlKey: true }, { key: 'w', code: 'KeyW', metaKey: true }, { key: '2', code: 'Digit2', altKey: true }]) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }));
    }
    const editable = document.createElement('div'); editable.contentEditable = 'true';
    document.querySelector('.pm-ui').append(editable); editable.focus();
    editable.dispatchEvent(new KeyboardEvent('keydown', { key: '2', code: 'Digit2', bubbles: true, cancelable: true }));
    editable.remove();
  });
  assert.deepEqual(await state(), beforeKeys, 'Browser shortcuts or editing mutated the painting');
  console.log('PASS primary palette input, browser shortcuts and editable targets');

  for (let work = 1; work <= 3; work++) {
    await page.evaluate(() => { __ppMaleri.paintPerfect(); __ppMaleri.finishWork('done'); });
    await step(40);
    assert.equal((await state()).phase, 'reveal');
    // The first and last verdict are skipped during the count-up; the
    // second is skipped after its stars were queued but before they arrive.
    if (work === 2) await step(22);
    const score = (await state()).score;
    await page.locator('#pm-rv-next').click();
    if (work < 3) {
      const hiddenGrade = await page.locator('#pm-rv-grade').textContent();
      const hiddenStars = await page.locator('#pm-rv-stars').innerHTML();
      await step(50);
      assert.equal((await state()).phase, 'draw', 'Skipping verdict prematurely started the next work');
      assert.equal((await state()).score, score, 'Skipping verdict lost or duplicated its bonus');
      assert.equal(await page.locator('#pm-score').textContent(), score.toLocaleString('sv-SE'), 'HUD missed the banked bonus');
      assert.equal(await page.locator('#pm-rv-grade').textContent(), hiddenGrade, 'Old grade kept counting on the next work');
      assert.equal(await page.locator('#pm-rv-stars').innerHTML(), hiddenStars, 'Old stars arrived on the next work');
      assert.equal(await page.locator('.pm-confetti').count(), 0, 'Old confetti leaked into the next work');
      await step(20);
      assert.equal((await state()).phase, 'paint');
    }
  }
  assert.equal((await state()).phase, 'over');
  assert.equal((await state()).results, 3);
  const audioStarted = await page.evaluate(() => !!window.__paintingAudio);
  assert.ok(audioStarted);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => __paintingAudio.state === 'suspended');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(() => __paintingAudio.state === 'running');
  console.log('PASS result-screen ambience suspends and resumes with focus');

  await page.locator('#pm-again').click();
  assert.equal((await state()).score, 0);
  await step(50);
  assert.equal((await state()).phase, 'draw');
  assert.equal((await state()).results, 0);
  assert.equal(await page.locator('.pm-confetti').count(), 0, 'Prior evening effects survived restart');
  await step(20);
  assert.equal((await state()).phase, 'paint');
  assert.equal((await state()).score, 0);
  console.log('PASS three works, immediate and delayed verdict skips, retained bonuses, clean restart');

  await page.locator('#game-close').click();
  assert.equal(await page.locator('#game-mount canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS painting cleanup and no browser errors');
} finally {
  await browser.close();
}
