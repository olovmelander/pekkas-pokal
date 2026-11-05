import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const root = resolve(__dirname, '..');
const source = readFileSync(resolve(root, 'src/scripts/app.js'), 'utf8');
const start = source.indexOf('const GAMES = [');
const end = source.indexOf('const gameRoute', start);
const context = {};
vm.createContext(context);
vm.runInContext(`${source.slice(start, end)}; this.games = GAMES;`, context);
const { games } = context;
const rows = readFileSync(resolve(root, 'competition-data.csv'), 'utf8').trim().split('\n').slice(1);
const competitionYears = rows.filter((row) => !row.includes(',Covid,')).map((row) => Number(row.split(',')[0]));

describe('the playable arcade catalogue', () => {
  it('covers every held competition exactly once, excluding the cancelled year', () => {
    expect(games.map((game) => game.year).sort()).toEqual(competitionYears.sort());
    expect(new Set(games.map((game) => game.year)).size).toBe(games.length);
  });

  it.each(games)('$year resolves to its module, styles and actual cover', (game) => {
    expect(existsSync(resolve(root, game.module))).toBe(true);
    expect(existsSync(resolve(root, game.module.replace(/index\.js$/, 'style.css')))).toBe(true);
    expect(existsSync(resolve(root, 'public', game.cover))).toBe(true);
  });
});
