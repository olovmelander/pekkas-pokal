/** Real-browser regressions for native controls, nested modals and paused
 * rendering. Uses the production shell in an isolated fixture, no QA hooks.
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
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.addStyleTag({ url: new URL('src/games/shared/arcade.css', base).href });
  await page.evaluate(async (url) => {
    const { createArcade } = await import(new URL('src/games/shared/arcade.js', url).href);
    const host = document.createElement('div'); host.id = 'shell-fixture';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#253a3a';
    document.body.append(host);
    const api = createArcade(host, { id: 'shell-regression' });
    api.hidePanel();
    const box = new api.THREE.Mesh(new api.THREE.BoxGeometry(3, 3, 3), new api.THREE.MeshStandardMaterial({ color: 0xdba949 }));
    box.position.y = 1.5; api.scene.add(box);
    const state = { renders: 0, clock: 0, resizes: 0, api };
    const render = api.renderer.render.bind(api.renderer);
    api.renderer.render = (...values) => { state.renders++; return render(...values); };
    api.onFrame((dt) => { state.clock += dt; box.rotation.y += dt * .1; });
    api.listen(api.root, 'arcaderesize', ({ detail }) => {
      state.resizes++; api.camera.fov = detail.width > detail.height ? 50 : 42;
      api.camera.updateProjectionMatrix();
    });
    window.__shellFixture = state;
  }, base);
  const snapshot = () => page.evaluate(() => ({
    renders: __shellFixture.renders, clock: __shellFixture.clock, resizes: __shellFixture.resizes,
    paused: __shellFixture.api.paused, muted: __shellFixture.api.muted,
    keys: [...__shellFixture.api.keys], aspect: __shellFixture.api.camera.aspect, fov: __shellFixture.api.camera.fov
  }));
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settle();
  const sound = page.locator('#shell-fixture [data-tool="sound"]');
  await sound.focus();
  const initialMuted = (await snapshot()).muted;
  await page.keyboard.down('Space');
  assert.equal((await snapshot()).keys.includes('Space'), false, 'Sound button sent Space into gameplay');
  await page.keyboard.up('Space');
  assert.notEqual((await snapshot()).muted, initialMuted, 'Native Space did not activate sound button');
  assert.equal(await sound.evaluate(element => element === document.activeElement), true, 'Keyboard activation moved native focus');
  console.log('PASS native sound button owns Space');

  await sound.click();
  await page.keyboard.down('ArrowUp');
  assert.equal((await snapshot()).keys.includes('ArrowUp'), true, 'Pointer sound toggle stranded keyboard steering');
  await page.keyboard.up('ArrowUp');
  await page.locator('#shell-fixture [data-tool="pause"]').click();
  await page.locator('#shell-fixture [data-tool="resume"]').click();
  await page.keyboard.down('KeyW');
  assert.equal((await snapshot()).keys.includes('KeyW'), true, 'Resume stranded keyboard steering on Pause');
  await page.keyboard.up('KeyW');
  await page.evaluate(() => {
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'w', code: 'KeyW', ctrlKey: true }));
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'p', code: 'KeyP', metaKey: true }));
  });
  assert.equal((await snapshot()).keys.includes('KeyW'), false, 'Browser shortcut leaked into gameplay');
  assert.equal((await snapshot()).paused, false, 'Browser shortcut paused gameplay');
  console.log('PASS steering resumes after pointer sound and pause controls');

  await page.evaluate(() => {
    const strip = document.createElement('div'); strip.dataset.gameControls = '';
    strip.innerHTML = '<button id="game-control-fixture">Action</button>';
    __shellFixture.api.ui.append(strip); strip.firstElementChild.focus();
  });
  await page.keyboard.down('ArrowLeft');
  assert.equal((await snapshot()).keys.includes('ArrowLeft'), true, 'Focused game control blocked direction shortcuts');
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.down('Space');
  assert.equal((await snapshot()).keys.includes('Space'), false, 'Focused game control also fired the global Space action');
  await page.keyboard.up('Space');
  console.log('PASS game controls preserve directions without duplicating Space');

  await page.locator('#shell-fixture [data-tool="pause"]').focus();
  await page.keyboard.press('Space'); await settle();
  assert.equal((await snapshot()).paused, true);
  const paused = await snapshot();
  await page.waitForTimeout(220); await settle();
  const idle = await snapshot();
  assert.equal(idle.clock, paused.clock, 'Paused simulation advanced');
  assert.equal(idle.renders, paused.renders, 'Paused scene kept rendering without changes');
  console.log('PASS paused simulation and GPU become idle');

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(old => __shellFixture.resizes > old && __shellFixture.api.camera.aspect > 2, paused.resizes);
  await settle();
  const rotated = await snapshot();
  assert.equal(rotated.clock, paused.clock, 'Paused rotation advanced simulation');
  assert.equal(rotated.fov, 50, 'Game did not receive the resize event while paused');
  assert.ok(rotated.renders > idle.renders, 'Paused resize did not redraw the scene');
  await page.waitForTimeout(160); await settle();
  assert.equal((await snapshot()).renders, rotated.renders, 'Paused resize restarted continuous rendering');
  console.log('PASS paused rotation refreshes framing once and stays frozen');

  await page.locator('#shell-fixture [data-tool="resume"]').focus();
  await page.keyboard.press('Space');
  assert.equal((await snapshot()).paused, false);
  await page.evaluate(() => {
    const { api } = __shellFixture;
    const dialog = document.createElement('section'); dialog.id = 'nested-dialog';
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = '<button id="dialog-one">One</button><button id="dialog-two">Two</button>';
    api.ui.append(dialog);
    dialog.addEventListener('keydown', event => {
      if (event.code !== 'Tab') return;
      event.preventDefault();
      dialog.querySelector(document.activeElement.id === 'dialog-one' ? '#dialog-two' : '#dialog-one').focus();
    });
    document.querySelector('#dialog-one').focus();
  });
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dialog-two', 'Shell overrode local Tab handling');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'dialog-one');
  console.log('PASS local modal owns its focus loop');

  await page.evaluate(() => { __shellFixture.api.destroy(); document.querySelector('#shell-fixture').remove(); });
  assert.equal(await page.locator('#shell-fixture canvas').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS shell cleanup and no browser errors');
} finally {
  await browser.close();
}
