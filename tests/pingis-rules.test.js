import { describe, expect, it } from 'vitest';
import { canReturnBall, matchWinner, playerServes, winBonus } from '../src/games/pingis/rules.js';

describe('seven-point pingis match fairness', () => {
  it('changes serve every two points, then every point from six-all', () => {
    expect([0, 1, 2, 3, 4, 5].map(n => playerServes(n, n, 0))).toEqual([true, true, false, false, true, true]);
    expect(playerServes(12, 6, 6)).toBe(true);
    expect(playerServes(13, 7, 6)).toBe(false);
    expect(playerServes(14, 7, 7)).toBe(true);
    expect(playerServes(15, 7, 8)).toBe(false);
    expect(playerServes(38, 19, 19)).toBe(true);
  });
  it('requires two clear points even in a long deuce', () => {
    expect(matchWinner(6, 0)).toBe(0);
    expect(matchWinner(7, 6)).toBe(0);
    expect(matchWinner(20, 19)).toBe(0);
    expect(matchWinner(7, 5)).toBe(1);
    expect(matchWinner(19, 21)).toBe(-1);
  });
  it('never punishes winning a long match with a negative win bonus', () => {
    expect(winBonus(1, 0)).toBe(1700);
    expect(winBonus(1, 5)).toBe(1200);
    expect(winBonus(1, 19)).toBe(1000);
    expect(winBonus(3, 40)).toBe(3000);
  });
  it('lets a long out-ball fall untouched but returns a legal deep bounce', () => {
    expect(canReturnBall(0, 0)).toBe(false);
    expect(canReturnBall(1, 0)).toBe(true);
    expect(canReturnBall(1, 1)).toBe(false);
  });
});
