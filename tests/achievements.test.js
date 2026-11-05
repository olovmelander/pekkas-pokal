/**
 * Utmärkelserna: reglerna, poängen och några kända innehavare.
 *
 * Laddar resultaten med samma parser som sajten (parseCSV/processData ur
 * app.js) och kör achievements.js + achievement-engine.js i en låtsad window.
 * Kör med: npx vitest run tests/achievements.test.js
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import vm from 'vm';

const ROOT = resolve(__dirname, '..');
const read = (f) => readFileSync(resolve(ROOT, f), 'utf8');

/** Pulls one top-level function out of app.js by brace matching */
function extract(src, name) {
  const i = src.indexOf(`function ${name}(`);
  const j = src.indexOf('{', i);
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  throw new Error(`function ${name} not found`);
}

function load(csv = read('competition-data.csv')) {
  const app = read('src/scripts/app.js');
  const fixed = /const FIXED_COLUMNS = (\[[^\]]*\])/.exec(app)[1];
  const ctx = { csv, out: null, window: {}, console };
  vm.createContext(ctx);
  vm.runInContext(
    `const FIXED_COLUMNS = ${fixed};
     ${extract(app, 'shortName')}
     ${extract(app, 'parseCSV')}
     ${extract(app, 'processData')}
     const t = parseCSV(csv); out = processData(t.headers, t.rows);`,
    ctx
  );
  vm.runInContext(read('src/data/achievements.js'), ctx);
  vm.runInContext(read('src/scripts/achievement-engine.js'), ctx);
  const { participants, competitions } = ctx.out;
  const engine = new ctx.window.AchievementEngine();
  const byName = engine.calculateAllAchievements(competitions, participants);
  return { defs: ctx.window.ACHIEVEMENT_DEFINITIONS, engine, byName, participants, competitions };
}

const { defs, engine, byName } = load();
const holders = (id) => Object.keys(byName).filter((n) => byName[n].includes(id)).sort();

describe('definitionerna', () => {
  const POINTS = { common: 10, rare: 25, epic: 50, legendary: 100, mythic: 250 };

  it('har unika id och namn', () => {
    expect(new Set(defs.map((d) => d.id)).size).toBe(defs.length);
    expect(new Set(defs.map((d) => d.name)).size).toBe(defs.length);
  });

  it('har en regel, en beskrivning och poäng efter sällsynthet', () => {
    for (const d of defs) {
      expect(typeof (d.title ? d.score : d.test), d.id).toBe('function');
      expect(d.desc.length, d.id).toBeGreaterThan(10);
      expect(d.points, d.id).toBe(POINTS[d.rarity]);
      expect(Object.keys(loadCategories())).toContain(d.category);
    }
  });
});

describe('ikonerna', () => {
  it('har en egen ritad symbol för varje utmärkelse och en ram per sällsynthet', () => {
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(read('src/data/achievement-icons.js'), ctx);
    for (const d of defs) {
      expect(ctx.window.PP_ACH_ICONS[d.id], d.id).toBeTruthy();
      const svg = ctx.window.ppAchBadge(d);
      expect(svg, d.id).toMatch(/^<svg class="pp-badge"/);
      expect(svg, d.id).not.toMatch(/NaN|undefined/);
    }
    expect(ctx.window.ppAchBadge(defs[0], { locked: true })).toMatch(/is-locked/);
  });
});

function loadCategories() {
  const ctx = { window: {} };
  vm.createContext(ctx);
  vm.runInContext(read('src/data/achievements.js'), ctx);
  return ctx.window.ACHIEVEMENT_CATEGORIES;
}

describe('resultaten', () => {
  it('ger kända bedrifter till rätt person', () => {
    // Sist 2017, vann 2018; sist 2022, vann 2023
    expect(holders('bottom_to_top')).toEqual(['Niklas Norberg', 'Per Vikman']);
    // Vann 2013 och 2014 respektive 2025 och 2026
    expect(holders('win_streak_2')).toEqual(['Erik Vallgren', 'Viktor Jones']);
    // Vann 2014 och sedan 2024
    expect(holders('comeback_10')).toEqual(['Erik Vallgren']);
    // Arrangerade 2019 och 2025 och vann båda; Ludvig arrangerade och vann 2022
    expect(holders('home_win')).toEqual(['Ludvig Ulenius', 'Viktor Jones']);
    expect(holders('founder')).toEqual(['Mikael Hägglund', 'Rickard Nilsson', 'Viktor Jones']);
    expect(holders('t_goat')).toEqual(['Viktor Jones']);
    expect(holders('t_hosts')).toEqual(['Mikael Hägglund']);
  });

  it('räknar upplåsningsår', () => {
    expect(engine.details['Niklas Norberg'].bottom_to_top.year).toBe(2018);
    expect(engine.details['Viktor Jones'].win_streak_2.year).toBe(2026);
    expect(engine.details['Erik Vallgren'].win_3.year).toBe(2024);
  });

  it('räknar inte okända placeringar som starter eller frånvaro', () => {
    // 2014 och 2015 har bara pallen: ingen sistaplats, och de tomma rutorna
    // är varken starter eller frånvaro (Viktor har aldrig ett streck)
    const ed = (y) => engine.editions.find((e) => e.year === y);
    expect(ed(2014).lastPos).toBeNull();
    expect(ed(2015).lastPos).toBeNull();
    expect(ed(2023).lastPos).toBe(10); // två okända, men tian är hela fältet
    expect(byName['Viktor Jones']).toContain('iron_man');
    expect(engine.details['Viktor Jones'].iron_man.year).toBe(2025);
  });

  it('visar närmast för låsta utmärkelser', () => {
    expect(engine.closest.win_5).toMatchObject({ names: ['Viktor Jones'], cur: 4, goal: 5 });
    expect(engine.closest.win_streak_3).toMatchObject({ names: ['Viktor Jones'], cur: 2, goal: 3 });
  });

  it('har bara låsta utmärkelser som går att nå', () => {
    // Allt som ingen har ännu ska ha en progress-rad (en väg dit) eller vara
    // ett mönster som en vanlig upplaga kan ge (sviter, klättringar, titlar)
    const locked = defs.filter((d) => holders(d.id).length === 0);
    for (const d of locked) expect(d.historic, d.id).toBeFalsy();
  });
});

describe('framtiden', () => {
  it('låser upp Hattrick om Viktor vinner även nästa upplaga', () => {
    const csv = read('competition-data.csv').trim();
    const header = csv.split('\n')[0].split(',');
    const row = header.map((h) => {
      if (h === 'År') return '2027';
      if (h === 'Datum') return '2027-08-07';
      if (h === 'Tävling') return 'Test';
      if (['Plats', 'Arrangör 3:a', 'Arrangör näst sist'].includes(h)) return '';
      if (h === 'Viktor Jones') return '1';
      return '-';
    });
    // Two participants so the edition is a real one
    row[header.indexOf('Per Vikman')] = '2';
    const next = load(`${csv}\n${row.join(',')}`);
    expect(next.byName['Viktor Jones']).toContain('win_streak_3');
    expect(next.byName['Viktor Jones']).toContain('win_5');
    expect(next.engine.details['Viktor Jones'].win_streak_3.year).toBe(2027);
  });
});
