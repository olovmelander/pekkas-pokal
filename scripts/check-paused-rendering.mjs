/** Normal-render browser regression for idle pause, rotation and WebGL recovery.
 * GAME_URL selects a dev/preview server; GAME_YEARS selects 2019,2022,2023,2024.
 * No accelerated clock, renderer stubs or source rewriting. Existing game APIs
 * establish a live rally/flight/duel before pausing. Chromium's headless tabs
 * all remain visible, so visibility properties/events are explicitly emulated;
 * WebGL loss/restoration is real. Results do not measure physical-phone FPS.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.argv.includes('--help')) {
  console.log('GAME_URL=http://localhost:8000/ GAME_YEARS=2019,2022,2023,2024 node scripts/check-paused-rendering.mjs\nOptional PAUSE_REPORT_DIR, CHROMIUM_PATH. Normal RAF and graphics; visibility is emulated, WebGL restoration is real.');
  process.exit(0);
}
const games = {
  2019: { starts: ['[data-action="tour"]', '[data-action="play"]'], pause: '#pg-info', panel: '#pg-help', resume: '[data-action="help-close"]' },
  2022: { starts: ['[data-act="start"]'], pause: '#sk-info', panel: '#sk-help', resume: '#sk-help-close' },
  2023: { starts: ['[data-act="start"]', '[data-act="fight"]'], pause: '#fen-info', panel: '#fen-help', resume: '#fen-help-close' },
  2024: { starts: ['#fg-start'], pause: '#fg-info', panel: '#fg-help', resume: '#fg-help-close' }
};
const years = (process.env.GAME_YEARS || Object.keys(games).join(',')).split(',').map(Number);
for (const year of years) assert(games[year], `Unsupported year ${year}`);
const output = resolve(process.env.PAUSE_REPORT_DIR || 'scratchpad/paused-rendering');
mkdirSync(output, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const browser = await chromium.launch({ executablePath, headless: true, args });
const reports = [];

function snapshot(year) {
  const scalar = object => Object.fromEntries(Object.entries(object || {})
    .filter(([, value]) => value === null || ['number', 'string', 'boolean'].includes(typeof value)));
  const api = { 2019: window.__ppPingis, 2022: window.__ppSkytte, 2023: window.__ppFakt, 2024: window.__ppFiske }[year];
  const result = { state: scalar(api.state) };
  if (year === 2019) result.ball = scalar(api.ball);
  if (year === 2022) result.clays = api.clays.map(clay => ({ state: scalar(clay), position: clay.mesh.position.toArray() }));
  if (year === 2023) { result.me = scalar(api.me); result.ai = scalar(api.ai); }
  if (year === 2024) result.clock = api.clock.now;
  return result;
}

try {
  for (const year of years) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      window.__pauseQA = { calls: 0, gl: null, lost: 0, restored: 0 };
      HTMLCanvasElement.prototype.getContext = function (...args) {
        const gl = original.apply(this, args);
        if (gl && String(args[0]).includes('webgl') && !gl.__pauseCounted) {
          gl.__pauseCounted = true;
          window.__pauseQA.gl = gl;
          this.addEventListener('webglcontextlost', () => { window.__pauseQA.lost++; });
          this.addEventListener('webglcontextrestored', () => { window.__pauseQA.restored++; });
          for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
            if (typeof gl[name] !== 'function') continue;
            const draw = gl[name].bind(gl);
            gl[name] = (...values) => { window.__pauseQA.calls++; return draw(...values); };
          }
        }
        return gl;
      };
    });
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(90000);
    page.on('pageerror', error => errors.push(error.message));
    const entry = { year, checks: [], errors, visibility: 'emulated document properties and real event handlers' };
    reports.push(entry);
    const check = (name, detail = {}) => { entry.checks.push({ name, ...detail }); console.log(`PASS ${year}: ${name}`); };
    async function frames(count = 8) {
      return page.evaluate(n => new Promise(resolve => {
        requestAnimationFrame(() => {
          const start = window.__pauseQA.calls;
          let left = n;
          function next() {
            if (--left > 0) requestAnimationFrame(next);
            else resolve(window.__pauseQA.calls - start);
          }
          requestAnimationFrame(next);
        });
      }), count);
    }
    async function idle(name, expected) {
      await frames(3); // consume a permitted dirty frame before counting quiet frames
      const calls = await frames();
      assert.equal(calls, 0, `${year} ${name}: still draws while paused`);
      assert.deepEqual(await page.evaluate(snapshot, year), expected, `${year} ${name}: advanced gameplay`);
      check(name, { quietFrames: 8, drawCalls: calls });
    }
    async function picture(name, panel) {
      const hidden = [panel, '.gfx-notice'].filter(Boolean).join(',');
      await page.locator(hidden).evaluateAll(elements => elements.forEach(element => { element.style.visibility = 'hidden'; }));
      const png = await page.screenshot({ path: resolve(output, `${year}-${name}.png`), timeout: 90000 });
      await page.locator(hidden).evaluateAll(elements => elements.forEach(element => { element.style.visibility = ''; }));
      return png.toString('base64');
    }
    async function compareLighting(before, after) {
      return page.evaluate(async images => {
        async function decode(encoded) {
          const bytes = Uint8Array.from(atob(encoded), value => value.charCodeAt(0));
          const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const context = canvas.getContext('2d');
          context.drawImage(bitmap, 0, 0); bitmap.close();
          return context.getImageData(0, 0, canvas.width, canvas.height);
        }
        const [a, b] = await Promise.all(images.map(decode));
        if (a.width !== b.width || a.height !== b.height) throw new Error('Restore comparison changed viewport');
        // Compare small scene tiles: a whole-image average misses a dark gun
        // barrel or fish against a large unchanged sky/water background.
        const tile = 24;
        let maxTileChange = 0, worst = null;
        for (let y = Math.floor(a.height * 0.26); y < Math.floor(a.height * 0.95) - tile + 1; y += tile) {
          for (let x = Math.floor(a.width * 0.18); x < Math.floor(a.width * 0.82) - tile + 1; x += tile) {
            let sum = 0;
            for (let row = y; row < y + tile; row++) for (let col = x; col < x + tile; col++) {
              const at = (row * a.width + col) * 4;
              for (let channel = 0; channel < 3; channel++) sum += Math.abs(a.data[at + channel] - b.data[at + channel]);
            }
            const change = sum / (tile * tile * 3);
            if (change > maxTileChange) { maxTileChange = change; worst = { x, y }; }
          }
        }
        return { width: a.width, height: a.height, tile, maxTileChange, worst };
      }, [before, after]);
    }
    try {
      const url = new URL(process.env.GAME_URL || 'http://localhost:8000/');
      url.searchParams.set('pauseCase', String(year)); url.hash = `/spel/${year}`;
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      const config = games[year];
      await page.locator(config.starts[0]).waitFor({ state: 'visible' });
      await page.locator('#game-loading').waitFor({ state: 'hidden' });
      for (const selector of config.starts) await page.locator(selector).click();
      await page.evaluate(value => {
        if (value === 2019) { window.__ppPingis.beginMatch(); window.__ppPingis.playerServe(); }
        if (value === 2022) { window.__ppSkytte.skipIntro(); window.__ppSkytte.callPull(); window.__ppSkytte.launchNow(); }
        if (value === 2023) window.__ppFakt.goLive();
      }, year);
      await frames(3);
      await page.locator(config.pause).click();
      await page.locator(config.panel).waitFor({ state: 'visible' });
      const frozen = await page.evaluate(snapshot, year);
      await idle('pause becomes idle with frozen gameplay', frozen);
      await picture('phone-paused', config.panel);

      let landscapeImage;
      for (const [name, viewport] of [['landscape', { width: 844, height: 390 }], ['desktop', { width: 1280, height: 800 }]]) {
        const before = await page.evaluate(() => window.__pauseQA.calls);
        await page.setViewportSize(viewport);
        await frames(3);
        assert(await page.evaluate(previous => window.__pauseQA.calls > previous, before), `${year}: resize failed to draw`);
        await idle(`${name} resize redraws then rests`, frozen);
        const png = await picture(`${name}-paused`, config.panel);
        if (name === 'landscape') landscapeImage = png;
      }

      // Headless Chromium keeps every tab visible even when another is focused.
      // Emulate only those two document properties; use the real game listeners.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenBefore = await page.evaluate(() => window.__pauseQA.calls);
      await page.setViewportSize({ width: 844, height: 390 });
      await frames();
      assert.equal(await page.evaluate(() => window.__pauseQA.calls), hiddenBefore, `${year}: hidden resize drew a frame`);
      assert.deepEqual(await page.evaluate(snapshot, year), frozen);
      await page.evaluate(() => {
        delete document.hidden; delete document.visibilityState;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await frames(3);
      assert(await page.evaluate(previous => window.__pauseQA.calls > previous, hiddenBefore), `${year}: visible return did not repaint`);
      await idle('visibility handler defers hidden resize and repaints on return', frozen);

      const supported = await page.evaluate(() => !!window.__pauseQA.gl.getExtension('WEBGL_lose_context'));
      assert(supported, 'Real WebGL context restoration is unavailable; this check cannot pass');
      for (const hiddenRestore of [false, true]) {
        const events = await page.evaluate(() => ({ lost: window.__pauseQA.lost, restored: window.__pauseQA.restored }));
        await page.evaluate(() => {
          window.__pauseQA.extension = window.__pauseQA.gl.getExtension('WEBGL_lose_context');
          window.__pauseQA.extension.loseContext();
        });
        await page.waitForFunction(previous => window.__pauseQA.lost > previous && window.__pauseQA.gl.isContextLost(), events.lost);
        const lostBefore = await page.evaluate(() => window.__pauseQA.calls);
        await frames(3);
        assert.equal(await page.evaluate(() => window.__pauseQA.calls), lostBefore, `${year}: tried drawing while context lost`);
        if (hiddenRestore) await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.evaluate(() => window.__pauseQA.extension.restoreContext());
        await page.waitForFunction(previous => window.__pauseQA.restored > previous && !window.__pauseQA.gl.isContextLost(), events.restored);
        if (hiddenRestore) {
          await frames(3);
          assert.equal(await page.evaluate(() => window.__pauseQA.calls), lostBefore, `${year}: restored hidden context issued draw calls`);
          await page.evaluate(() => {
            delete document.hidden; delete document.visibilityState;
            document.dispatchEvent(new Event('visibilitychange'));
          });
        }
        await frames(3);
        assert(await page.evaluate(previous => window.__pauseQA.calls > previous, lostBefore), `${year}: restored context did not repaint`);
        const mode = hiddenRestore ? 'hidden then visible' : 'visible';
        await idle(`real WebGL restoration (${mode}) redraws then rests`, frozen);
        const restoredImage = await picture(hiddenRestore ? 'restored-hidden-paused' : 'restored-paused', config.panel);
        const lighting = await compareLighting(landscapeImage, restoredImage);
        // Before the environment repair, the worst tiles changed by 12–48 RGB
        // levels. Four levels tolerate small raster differences but catch that loss.
        assert(lighting.maxTileChange <= 4, `${year}: restored material lighting changed (${JSON.stringify(lighting)})`);
        check(`restored material lighting (${mode}) matches the frozen scene`, lighting);
      }

      await page.locator(config.resume).click();
      assert(await frames(3) > 0, `${year}: resume did not restart drawing`);
      check('resume restarts normal drawing');
      if (year === 2024) {
        await page.evaluate(() => window.__ppFiske.openBook(true));
        await page.locator('#fi-book').waitFor({ state: 'visible' });
        const bookFrozen = await page.evaluate(snapshot, year);
        await idle('catch journal also rests with frozen gameplay', bookFrozen);
        await page.locator('#fi-book-close').click();
        assert(await frames(3) > 0, 'Closing catch journal did not resume drawing');
      }
      await page.locator('#game-close').click();
      assert.equal(await frames(), 0, `${year}: rendering continued after close`);
      assert.equal(await page.locator('#game-mount canvas').count(), 0);
      assert.deepEqual(errors, []);
      check('close leaves no canvas, draw calls or page errors');
    } catch (error) {
      entry.error = error.message;
      throw error;
    } finally {
      await context.close();
      writeFileSync(resolve(output, 'report.json'), JSON.stringify(reports, null, 2));
    }
  }
} finally {
  await browser.close();
}
