/** Ambition's public-information rules, independent of rendering. */
export const SUITS = ['diamonds', 'clubs', 'hearts', 'spades'];
export const SYMBOLS = { diamonds: '♦', clubs: '♣', hearts: '♥', spades: '♠' };
export const SUIT_NAMES = { diamonds: 'ruter', clubs: 'klöver', hearts: 'hjärter', spades: 'spader' };
export const rankLabel = (rank) => ({ 11: 'Kn', 12: 'D', 13: 'K', 14: 'E' }[rank] || String(rank));
export const cardName = (card) => `${SUIT_NAMES[card.suit]} ${rankLabel(card.rank)}`;

export function makeDeck() {
  return SUITS.flatMap((suit) => Array.from({ length: 13 }, (_, i) => ({ suit, rank: i + 2, id: `${suit}-${i + 2}` })));
}

export function shuffle(deck, random = Math.random) {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sortHand(hand) {
  return hand.slice().sort((a, b) => SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit) || a.rank - b.rank);
}

export function cardPoints(card) {
  if (card.suit === 'clubs') return card.rank === 13 ? 13 : 0;
  if (card.rank < 7) return 0;
  return (card.rank >= 11 ? 3 : 1) + (card.suit === 'spades' ? 2 : 0);
}

export function legalCards(hand, ledSuit) {
  const following = hand.filter((card) => card.suit === ledSuit);
  return following.length ? following : hand.slice();
}

export function winningPlay(plays, ledSuit = plays[0]?.card.suit) {
  const following = plays.filter((play) => play.card.suit === ledSuit);
  const hasHonor = following.some((play) => play.card.rank >= 11);
  return following.reduce((best, play) => {
    const strength = (card) => card.rank === 2 && hasHonor ? 15 : card.rank;
    return !best || strength(play.card) > strength(best.card) ? play : best;
  }, null);
}

export function scoreDeal(captured, tricks) {
  const slam = captured.findIndex((points) => points >= 51);
  if (slam !== -1) return captured.map((_, i) => i === slam ? 40 : 0);
  const nils = tricks.filter((count) => count === 0).length;
  const highest = Math.max(...captured);
  return captured.map((points, i) => {
    if (tricks[i] === 0) return nils === 1 ? 20 : 10;
    if (points < 10 || points === highest) return 0;
    return points;
  });
}

/** Uses only its own hand and the public trick/score; never peeks at rival hands. */
export function chooseCard(hand, plays, ledSuit, captured, tricks, player, kickoff = false) {
  const legal = legalCards(hand, ledSuit);
  const mostOther = Math.max(...captured.filter((_, i) => i !== player));
  const lowHand = hand.filter((card) => card.rank >= 11 || card.rank === 2).length <= 1;
  const nil = tricks[player] === 0 && lowHand;
  const wantsPoints = !nil && (captured[player] < 12 || captured[player] < mostOther - 7 || captured[player] >= 40);
  const value = (card) => {
    if (!plays.length || kickoff) {
      const power = card.rank === 2 ? 10 : card.rank;
      return wantsPoints ? power + cardPoints(card) * 0.25 : -power;
    }
    const winner = winningPlay([...plays, { card, player }], ledSuit);
    const wins = winner?.player === player;
    const trickValue = plays.reduce((total, play) => total + cardPoints(play.card), cardPoints(card));
    if (wins) return wantsPoints ? 20 + trickValue - card.rank * 0.2 : -40 - trickValue;
    // Discard expensive cards when ducking, but keep useful high cards while collecting.
    return wantsPoints ? -cardPoints(card) - card.rank * 0.1 : 10 + cardPoints(card) + card.rank * 0.1;
  };
  return legal.reduce((best, card) => value(card) > value(best) ? card : best, legal[0]);
}

export function passingCards(hand) {
  return hand.slice().sort((a, b) =>
    (cardPoints(b) * 2 + b.rank) - (cardPoints(a) * 2 + a.rank)
  ).slice(0, 3);
}

export function passHands(hands, selections, direction) {
  if (hands.length !== 4 || selections.length !== 4) throw new Error('Four hands required');
  selections.forEach((cards, i) => {
    if (cards.length !== 3 || new Set(cards.map((card) => card.id)).size !== 3 ||
      cards.some((card) => !hands[i].some((owned) => owned.id === card.id))) {
      throw new Error('Pass exactly three cards from each hand');
    }
  });
  return hands.map((hand, i) => sortHand([
    ...hand.filter((card) => !selections[i].some((pass) => pass.id === card.id)),
    ...selections[(i - direction + 4) % 4]
  ]));
}
