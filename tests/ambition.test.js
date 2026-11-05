import { describe, it, expect } from 'vitest';
import { makeDeck, shuffle, cardPoints, legalCards, winningPlay, scoreDeal, passingCards, passHands, chooseCard } from '../src/games/ambition/rules.js';

const card = (suit, rank) => ({ suit, rank, id: `${suit}-${rank}` });
const play = (player, suit, rank) => ({ player, card: card(suit, rank) });

describe('Ambition: the two, following suit and public points', () => {
  it('has 52 unique cards and 80 points including the kickoff bonus', () => {
    const deck = makeDeck();
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.reduce((total, c) => total + cardPoints(c), 3)).toBe(80);
    expect(shuffle(deck, () => 0.5)).toHaveLength(52);
    expect(new Set(shuffle(deck).map((c) => c.id)).size).toBe(52);
  });
  it('requires following suit and allows discarding only when void', () => {
    const hand = [card('clubs', 13), card('hearts', 5), card('hearts', 14)];
    expect(legalCards(hand, 'hearts')).toEqual(hand.slice(1));
    expect(legalCards(hand, 'spades')).toEqual(hand);
    expect(legalCards(hand, null)).toEqual(hand);
  });
  it('promotes only the led two when an honor in that suit is present', () => {
    expect(winningPlay([play(0, 'hearts', 14), play(1, 'hearts', 2), play(2, 'spades', 14)]).player).toBe(1);
    expect(winningPlay([play(0, 'hearts', 10), play(1, 'hearts', 2), play(2, 'spades', 14)]).player).toBe(0);
    expect(winningPlay([play(0, 'clubs', 13), play(1, 'spades', 2), play(2, 'clubs', 14)]).player).toBe(2);
  });
  it('handles diamond kickoff even if the first player is void', () => {
    expect(winningPlay([play(0, 'spades', 14), play(1, 'diamonds', 9), play(2, 'diamonds', 3), play(3, 'clubs', 13)], 'diamonds').player).toBe(1);
  });
});

describe('Ambition: risk/reward scoring', () => {
  it('pays the middle and penalizes excessive ambition', () => {
    expect(scoreDeal([31, 26, 14, 9], [5, 4, 3, 1])).toEqual([0, 26, 14, 0]);
    expect(scoreDeal([30, 30, 10, 10], [4, 4, 3, 2])).toEqual([0, 0, 10, 10]);
  });
  it('awards slam instead of all other scores at the exact threshold', () => {
    expect(scoreDeal([51, 20, 9, 0], [7, 4, 2, 0])).toEqual([40, 0, 0, 0]);
    expect(scoreDeal([50, 20, 10, 0], [7, 4, 2, 0])).toEqual([0, 20, 10, 20]);
  });
  it('distinguishes no tricks from tricks containing zero points', () => {
    expect(scoreDeal([40, 40, 0, 0], [6, 7, 0, 0])).toEqual([0, 0, 10, 10]);
    expect(scoreDeal([40, 30, 10, 0], [5, 4, 3, 1])).toEqual([0, 30, 10, 0]);
  });
});

describe('Ambition: passing and complete hands', () => {
  it('passes simultaneously without duplicating or losing cards in either direction', () => {
    const deck = makeDeck();
    const hands = Array.from({ length: 4 }, (_, i) => deck.slice(i * 13, i * 13 + 13));
    const picks = hands.map(passingCards);
    for (const direction of [1, 3, 2]) {
      const next = passHands(hands, picks, direction);
      expect(next.map((hand) => hand.length)).toEqual([13, 13, 13, 13]);
      expect(new Set(next.flat().map((c) => c.id)).size).toBe(52);
      for (const c of picks[0]) expect(next[direction].some((x) => x.id === c.id)).toBe(true);
    }
    expect(() => passHands(hands, [picks[0].slice(0, 2), ...picks.slice(1)], 1)).toThrow();
    expect(() => passHands(hands, [[picks[0][0], picks[0][0], picks[0][0]], ...picks.slice(1)], 1)).toThrow();
  });
  it('AI completes 13 legal tricks with all 80 points conserved', () => {
    for (let round = 0; round < 30; round++) {
      const deck = shuffle(makeDeck());
      let hands = Array.from({ length: 4 }, (_, i) => deck.slice(i * 13, i * 13 + 13));
      hands = passHands(hands, hands.map(passingCards), 1);
      const captured = [0, 0, 0, 0];
      const tricks = [0, 0, 0, 0];
      let leader = 0;
      for (let t = 0; t < 13; t++) {
        const plays = [];
        let suit = t === 0 ? 'diamonds' : null;
        for (let turn = 0; turn < 4; turn++) {
          const player = (leader + turn) % 4;
          const c = chooseCard(hands[player], t === 0 ? [] : plays, suit, captured, tricks, player, t === 0);
          expect(legalCards(hands[player], suit).map((x) => x.id)).toContain(c.id);
          hands[player] = hands[player].filter((x) => x.id !== c.id);
          plays.push({ player, card: c });
          suit ||= c.suit;
        }
        leader = winningPlay(plays, suit).player;
        captured[leader] += plays.reduce((sum, p) => sum + cardPoints(p.card), t === 0 ? 3 : 0);
        tricks[leader]++;
      }
      expect(hands.flat()).toHaveLength(0);
      expect(tricks.reduce((a, b) => a + b)).toBe(13);
      expect(captured.reduce((a, b) => a + b)).toBe(80);
      expect(scoreDeal(captured, tricks).every(Number.isFinite)).toBe(true);
    }
  });
});
