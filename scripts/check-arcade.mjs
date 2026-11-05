/** Browser smoke checks against a running dev or production preview server.
 * npm run dev, then npm run test:games. Optional GAME_URL, GAME_YEARS,
 * GAME_PROFILES=desktop,phone,landscape and CHROMIUM_PATH overrides.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.GAME_URL || 'http://localhost:8000/';
const years = (process.env.GAME_YEARS || '2011,2012,2013,2014,2015,2016,2017,2018,2019,2021,2022,2023,2024,2025,2026').split(',').map(Number);
const profiles = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  small: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }
};
const selected = (process.env.GAME_PROFILES || 'desktop,phone,landscape').split(',');
const screenshots = resolve('scratchpad/arcade-checks');
const classic = {
  2019: { start: ['[data-action="tour"]', '[data-action="play"]'], pause: '#pg-info', panel: '#pg-help', resume: '[data-action="help-close"]' },
  2021: { start: ['#pm-start'], pause: '#pm-pause', panel: '#pm-pause-panel', resume: '#pm-resume' },
  2022: { start: ['[data-act="start"]'], pause: '#sk-info', panel: '#sk-help', resume: '#sk-help-close' },
  2023: { start: ['[data-act="start"]', '[data-act="fight"]'], pause: '#fen-info', panel: '#fen-help', resume: '#fen-help-close' },
  2024: { start: ['#fg-start'], pause: '#fg-info', panel: '#fg-help', resume: '#fg-help-close' },
  2025: { start: ['[data-act="start"]'], pause: '#pbf-info', panel: '#pbf-help', resume: '#pbf-help-close' },
  2026: { start: ['#lr-panel .pb-btn'], pause: '#lr-pause-toggle', panel: '#lr-pause-screen', resume: '#lr-resume' }
};
mkdirSync(screenshots, { recursive: true });
const executablePath = process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const args = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'];
if (process.env.HTTPS_PROXY) args.push(`--proxy-server=${process.env.HTTPS_PROXY}`, '--proxy-bypass-list=localhost;127.0.0.1');
const browser = await chromium.launch({ executablePath, headless: true, args });
let failures = 0;
try {
  for (const profile of selected) {
    if (!profiles[profile]) throw new Error(`Unknown profile: ${profile}`);
    const context = await browser.newContext(profiles[profile]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) errors.push(message.text());
    });
    for (const year of years) {
      errors.length = 0;
      try {
        await page.goto(`${baseURL}#/spel/${year}`, { waitUntil: 'domcontentloaded' });
        const config = classic[year];
        await page.locator(config?.start[0] || '.arcade-overlay .arcade-primary').waitFor({ state: 'visible', timeout: 90000 });
        await page.locator('#game-loading').waitFor({ state: 'hidden', timeout: 90000 });
        if (config) {
          for (const selector of config.start) await page.locator(selector).click();
          if (year === 2021) await page.keyboard.press('Space');
        } else {
          await page.locator('.arcade-overlay .arcade-primary').click();
          // Multi-event cups show instructions after the title.
          if ([2013, 2014, 2015, 2016].includes(year)) await page.locator('.arcade-overlay .arcade-primary').click();
        }
        await page.waitForTimeout(900);
        if (profile === 'landscape' && [2012, 2015, 2017].includes(year)) {
          const panel = { 2012: '.kart-race-meta', 2015: '.farm-progress', 2017: '.tri-dashboard' }[year];
          const gap = await page.evaluate((selector) => document.querySelector(selector).getBoundingClientRect().top - document.querySelector('.arcade-detail').getBoundingClientRect().bottom, panel);
          if (gap < 4) throw new Error(`Landscape game status overlaps the shared HUD (${gap.toFixed(1)}px gap)`);
        }
        const canvas = page.locator(config ? '#game-mount .pb-canvas canvas' : '.arcade-canvas').first();
        if (!await canvas.isVisible()) throw new Error('Missing visible game canvas');
        const box = await canvas.boundingBox();
        if (box.width < 300 || box.height < 250) throw new Error('Game canvas too small');
        await page.screenshot({ path: resolve(screenshots, `${year}-${profile}.png`) });
        const pausePanel = config?.panel || '.arcade-pause';
        await page.locator(config?.pause || '[data-tool="pause"]').click();
        if (!await page.locator(pausePanel).isVisible()) throw new Error('Pause did not open');
        if (profile === 'phone' && [2025, 2026].includes(year)) {
          // Rotation used to clear the paused canvas until play resumed.
          // Keep the game paused and hide only the dialog for a visual check.
          const readFrozen = (gameYear) => gameYear === 2025
            ? { time: window.__pbFlipper.clock.now, phase: window.__pbFlipper.state.phase }
            : { time: window.__ppLera.state.timeLeft, phase: window.__ppLera.state.phase, spin: window.__ppLera.state.spin };
          const frozen = await page.evaluate(readFrozen, year);
          await page.setViewportSize(profiles.landscape.viewport);
          await page.waitForTimeout(500);
          await page.locator(pausePanel).evaluate((element) => { element.style.visibility = 'hidden'; });
          await page.screenshot({ path: resolve(screenshots, `${year}-rotated-paused.png`) });
          await page.locator(pausePanel).evaluate((element) => { element.style.visibility = ''; });
          await page.setViewportSize(profiles.phone.viewport);
          if (JSON.stringify(await page.evaluate(readFrozen, year)) !== JSON.stringify(frozen)) throw new Error('Paused rotation advanced the game');
        }
        if (!config) {
          for (let tab = 0; tab < 6; tab++) await page.keyboard.press('Tab');
          const focusInside = await page.evaluate(() => !!document.activeElement.closest('.arcade-pause, .arcade-tools') || document.activeElement.id === 'game-close');
          if (!focusInside) throw new Error('Keyboard focus escaped the pause controls');
        }
        await page.locator(config?.resume || '[data-tool="resume"]').click();
        if (await page.locator(pausePanel).isVisible()) throw new Error('Resume did not close pause');
        await page.keyboard.press('p');
        if (!await page.locator(pausePanel).isVisible()) throw new Error('Keyboard pause failed');
        if (config) {
          await page.keyboard.press('Escape');
          if (await page.locator(pausePanel).isVisible() || !await page.locator('#game-stage').isVisible()) throw new Error('Escape did not dismiss pause locally');
        } else await page.keyboard.press('p');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow) throw new Error('Horizontal document overflow');
        await page.locator('#game-close').click();
        await page.locator('#game-stage').waitFor({ state: 'hidden' });
        if (await page.locator('#game-mount canvas').count()) throw new Error('Canvas leaked after close');
        if (errors.length) throw new Error(errors.join('; '));
        console.log(`PASS ${year} ${profile}: start, render, pause/resume, viewport, close`);
      } catch (error) {
        failures++;
        console.error(`FAIL ${year} ${profile}: ${error.message}`);
        await page.screenshot({ path: resolve(screenshots, `${year}-${profile}-failure.png`) }).catch(() => {});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (failures) process.exitCode = 1;
