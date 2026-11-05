import { describe, it, expect } from 'vitest';
import {
  BUDGET, PLAYERS, DEFAULT_SQUAD, validSquad, squadCost, canTransfer,
  pointsFor, scoreSquad, difficulty, performance, RIVALS, rankStandings, undoTransfer
} from '../src/games/fantasy/rules.js';

describe('Fantasy squad and season rules', () => {
  it('starts with a valid affordable five-player formation', () => {
    expect(validSquad(DEFAULT_SQUAD)).toBe(true);
    expect(squadCost(DEFAULT_SQUAD)).toBeLessThanOrEqual(BUDGET);
    expect(validSquad(['holt', 'stone', 'cole', 'cole', 'brook'])).toBe(false);
    expect(validSquad(['holt', 'stone', 'reed', 'blake', 'brook'])).toBe(false);
  });
  it('enforces budget, role, and one transfer after the first round', () => {
    expect(canTransfer(DEFAULT_SQUAD, 4, 'ash')).toBe(true);
    expect(canTransfer(DEFAULT_SQUAD, 0, 'ash')).toBe(false);
    const changed = [...DEFAULT_SQUAD];
    changed[4] = 'ash';
    expect(canTransfer(changed, 1, 'fox', DEFAULT_SQUAD)).toBe(false);
    expect(canTransfer(changed, 4, 'grey', DEFAULT_SQUAD)).toBe(true);
    expect(canTransfer(['reed', 'fox', 'hart', 'cole', 'west'], 4, 'ash')).toBe(false);
  });
  it('scores goals by position, assists, clean sheets, saves and conceded pairs', () => {
    const stats = { goals: 1, assists: 1, conceded: 0, saves: 6 };
    expect(pointsFor('BACK', stats)).toBe(15);
    expect(pointsFor('MITT', stats)).toBe(11);
    expect(pointsFor('ANF', stats)).toBe(9);
    expect(pointsFor('MV', { ...stats, goals: 0 })).toBe(11);
    expect(pointsFor('MV', { goals: 0, assists: 0, saves: 3, conceded: 3 })).toBe(2);
  });
  it('captain doubles one score and the single-use chip triples that score', () => {
    const normal = scoreSquad(DEFAULT_SQUAD, 'brook', 0, 1462);
    const triple = scoreSquad(DEFAULT_SQUAD, 'brook', 0, 1462, true);
    const captain = normal.rows.find((row) => row.player.id === 'brook');
    expect(captain.total).toBe(captain.points * 2);
    expect(triple.points - normal.points).toBe(captain.points);
  });
  it('shares places when a complete season ends in a tie', () => {
    const managers = [{ name: 'Du', squad: DEFAULT_SQUAD, captain: 'brook' }, ...RIVALS];
    const totals = managers.map((manager) => ({
      name: manager.name,
      points: Array.from({ length: 5 }, (_, round) =>
        scoreSquad(manager.squad, manager.captain, round, 80, round === 3).points
      ).reduce((sum, points) => sum + points, 0)
    }));
    expect(totals.map((manager) => manager.points)).toEqual([213, 190, 194, 213]);
    const ranked = rankStandings(totals);
    expect(ranked.map((manager) => [manager.name, manager.place])).toEqual([
      ['Du', 1], ['Mikael', 1], ['Viktor', 3], ['Rickard', 4]
    ]);
    expect(totals.every((manager) => manager.place === undefined)).toBe(true);
    expect(rankStandings(totals.map((manager) => ({ ...manager, points: 0 }))).map((manager) => manager.place)).toEqual([1, 1, 1, 1]);
  });
  it('restores a transferred captain by playing position, independent of market selection', () => {
    const changed = [...DEFAULT_SQUAD];
    changed[4] = 'ash';
    const undone = undoTransfer(changed, 'ash', DEFAULT_SQUAD);
    expect(undone.squad).toEqual(DEFAULT_SQUAD);
    expect(undone.captain).toBe('brook');
    expect(undone.squad).not.toBe(DEFAULT_SQUAD);
    // An intentional captain change to another player survives undo.
    expect(undoTransfer(changed, 'cole', DEFAULT_SQUAD).captain).toBe('cole');
    expect(changed[4]).toBe('ash');
  });
  it('keeps fixture and performance results stable for every manager and bounded across seasons', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (let round = 0; round < 5; round++) {
        for (const player of PLAYERS) {
          expect([1, 2, 3]).toContain(difficulty(player.club, round, seed));
          expect(performance(player, round, seed)).toEqual(performance(player, round, seed));
          expect(performance(player, round, seed).points).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });
});
