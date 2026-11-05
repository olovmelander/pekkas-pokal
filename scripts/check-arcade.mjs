/** Browser smoke checks against a running dev or production preview server.
 * npm run dev, then npm run test:games. Optional GAME_URL, GAME_YEARS,
 * GAME_PROFILES=desktop,phone,landscape and CHROMIUM_PATH overrides.
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const baseURL = process.env.GAME_URL || 'http://localhost:8000/';
const years = (process.env.GAME_YEARS || '2011,2012,2013,2014,2015,2016,2017,2018').split(',').map(Number);
const profiles = {
  desktop: { viewport: { width: 1280, height: 800 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  landscape: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }
};
const selected = (process.env.GAME_PROFILES || 'desktop,phone,landscape').split(',');
const screenshots = resolve('scratchpad/arcade-checks');
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
        await page.locator('.arcade-overlay .arcade-primary').waitFor({ state: 'visible', timeout: 45000 });
        await page.locator('#game-loading').waitFor({ state: 'hidden', timeout: 45000 });
        await page.locator('.arcade-overlay .arcade-primary').click();
        // Multi-event cups show the first event's instructions after the title.
        if (await page.locator('.arcade-overlay').isVisible()) {
          await page.locator('.arcade-overlay .arcade-primary').click();
        }
        await page.waitForTimeout(900);
        const canvas = page.locator('.arcade-canvas');
        if (!await canvas.isVisible()) throw new Error('Missing visible game canvas');
        const box = await canvas.boundingBox();
        if (box.width < 300 || box.height < 250) throw new Error('Game canvas too small');
        await page.screenshot({ path: resolve(screenshots, `${year}-${profile}.png`) });
        await page.locator('[data-tool="pause"]').click();
        if (!await page.locator('.arcade-pause').isVisible()) throw new Error('Pause did not open');
        for (let tab = 0; tab < 6; tab++) await page.keyboard.press('Tab');
        const focusInside = await page.evaluate(() => !!document.activeElement.closest('.arcade') || document.activeElement.id === 'game-close');
        if (!focusInside) throw new Error('Keyboard focus escaped the game');
        await page.locator('[data-tool="resume"]').click();
        if (await page.locator('.arcade-pause').isVisible()) throw new Error('Resume did not close pause');
        await page.keyboard.press('p');
        if (!await page.locator('.arcade-pause').isVisible()) throw new Error('Keyboard pause failed');
        await page.keyboard.press('p');
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
        if (overflow) throw new Error('Horizontal document overflow');
        await page.locator('#game-close').click();
        await page.locator('.arcade').waitFor({ state: 'detached' });
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
