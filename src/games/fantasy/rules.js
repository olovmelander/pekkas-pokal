/** A compact, fictional fantasy season. All randomness is seeded before selection. */
export const BUDGET = 36;
export const ROUNDS = 5;
export const POSITIONS = ['MV', 'BACK', 'MITT', 'MITT', 'ANF'];
export const CLUBS = [
  { name: 'Northbridge', short: 'NOR', color: '#d93e46' },
  { name: 'Kingsford', short: 'KIN', color: '#5192ec' },
  { name: 'Riverside', short: 'RIV', color: '#d3a94b' },
  { name: 'Eastmoor', short: 'EAS', color: '#9a72d4' }
];
export const PLAYERS = [
  ['holt', 'Elliot Holt', 'MV', 5, 0, 0.03, 0.16, 0.62],
  ['reed', 'Oscar Reed', 'MV', 6, 1, 0.02, 0.12, 0.87],
  ['vale', 'Noah Vale', 'MV', 4, 2, 0.02, 0.13, 0.43],
  ['ward', 'Theo Ward', 'BACK', 6, 0, 0.23, 0.33, 0.71],
  ['stone', 'Leo Stone', 'BACK', 5, 2, 0.11, 0.19, 0.77],
  ['fox', 'Jude Fox', 'BACK', 7, 1, 0.34, 0.43, 0.69],
  ['lake', 'Finn Lake', 'BACK', 4, 3, 0.14, 0.24, 0.46],
  ['hart', 'Milo Hart', 'MITT', 9, 0, 0.82, 0.58, 0.65],
  ['cole', 'Arlo Cole', 'MITT', 8, 1, 0.61, 0.84, 0.59],
  ['blake', 'Rory Blake', 'MITT', 6, 2, 0.41, 0.51, 0.56],
  ['wren', 'Alex Wren', 'MITT', 5, 3, 0.39, 0.32, 0.41],
  ['king', 'Ezra King', 'MITT', 7, 3, 0.64, 0.38, 0.52],
  ['ash', 'Luca Ash', 'ANF', 10, 0, 1.16, 0.31, 0.34],
  ['brook', 'Max Brook', 'ANF', 8, 1, 0.88, 0.46, 0.31],
  ['grey', 'Owen Grey', 'ANF', 7, 2, 0.69, 0.43, 0.34],
  ['west', 'Kai West', 'ANF', 5, 3, 0.52, 0.21, 0.24]
].map(([id, name, position, price, club, attack, assist, defense]) =>
  ({ id, name, position, price, club, attack, assist, defense }));
export const RIVALS = [
  { name: 'Rickard', title: 'Mästaren 2011', squad: ['reed', 'fox', 'blake', 'wren', 'ash'], captain: 'ash' },
  { name: 'Viktor', title: 'Utmanaren', squad: ['holt', 'stone', 'hart', 'king', 'grey'], captain: 'hart' },
  { name: 'Mikael', title: 'Taktikern', squad: ['vale', 'ward', 'cole', 'king', 'brook'], captain: 'cole' }
];
export const DEFAULT_SQUAD = ['holt', 'stone', 'cole', 'blake', 'brook'];
export const playerById = (id) => PLAYERS.find((p) => p.id === id);
export const squadCost = (squad) => squad.reduce((n, id) => n + (playerById(id)?.price || 0), 0);
export function validSquad(squad) {
  return squad.length === 5 && new Set(squad).size === 5 &&
    squad.every((id, i) => playerById(id)?.position === POSITIONS[i]) && squadCost(squad) <= BUDGET;
}
export function canTransfer(squad, slot, id, baseline = null) {
  const next = squad.slice();
  next[slot] = id;
  return validSquad(next) && (!baseline || next.filter((p, i) => p !== baseline[i]).length <= 1);
}
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6D2B79F5;
    let t = s;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function difficulty(club, round, seed = 0) {
  return 1 + ((club * 2 + round + (seed % 3)) % 3);
}
export function forecast(player, round, seed) {
  const factor = [1.38, 1, 0.68][difficulty(player.club, round, seed) - 1];
  const goalValue = { MV: 10, BACK: 6, MITT: 5, ANF: 4 }[player.position];
  const expectedGoals = Math.min(1, player.attack * factor * 0.7) + Math.min(1, player.attack * factor * 0.24);
  const expectedAssists = Math.min(1, player.assist * factor * 0.85);
  const cleanChance = Math.min(1, player.defense * factor * 0.65);
  const cleanValue = { MV: 4, BACK: 4, MITT: 1, ANF: 0 }[player.position];
  const concessionPenalty = ['MV', 'BACK'].includes(player.position) ? (1 - cleanChance) * 2 / 3 : 0;
  return 2 + expectedGoals * goalValue + expectedAssists * 3 + cleanChance * cleanValue +
    (player.position === 'MV' ? 1 : 0) - concessionPenalty;
}

/** Public scouting information. No simulated result is consulted here. */
export function squadForecast(squad, captain, round, seed, triple = false) {
  return squad.reduce((sum, id) => sum + forecast(playerById(id), round, seed) *
    (id === captain ? triple ? 3 : 2 : 1), 0);
}

/** An incoming captain keeps the armband, so compare the whole team's gain. */
export function transferForecast(squad, captain, slot, incoming, round, seed, triple = false) {
  const next = squad.slice(); next[slot] = incoming;
  const nextCaptain = captain === squad[slot] ? incoming : captain;
  const expected = squadForecast(next, nextCaptain, round, seed, triple);
  return { expected, delta: expected - squadForecast(squad, captain, round, seed, triple),
    remaining: BUDGET - squadCost(next), captain: nextCaptain };
}

export function upcomingFixtures(player, round, seed, count = 3) {
  return Array.from({ length: Math.min(count, ROUNDS - round) }, (_, offset) => ({
    round: round + offset,
    difficulty: difficulty(player.club, round + offset, seed),
    expected: forecast(player, round + offset, seed)
  }));
}

/** Rival managers use the same budget, one-transfer rule and visible forecasts as you. */
export function planRival(rival, round, seed) {
  const initial = rival.squad.slice();
  let squad = initial.slice();
  const horizon = (ids) => ids.reduce((sum, id) => sum + forecast(playerById(id), round, seed) +
    (round < ROUNDS - 1 ? forecast(playerById(id), round + 1, seed) * 0.35 : 0), 0);
  let best = horizon(squad);
  if (round > 0) {
    initial.forEach((_, slot) => PLAYERS.forEach((player) => {
      if (!canTransfer(initial, slot, player.id, initial)) return;
      const next = initial.slice(); next[slot] = player.id;
      const expected = horizon(next);
      if (expected > best + 0.15) { best = expected; squad = next; }
    }));
  }
  const captain = squad.reduce((bestId, id) =>
    forecast(playerById(id), round, seed) > forecast(playerById(bestId), round, seed) ? id : bestId, squad[0]);
  const now = forecast(playerById(captain), round, seed);
  const later = Math.max(0, ...Array.from({ length: ROUNDS - round - 1 }, (_, i) =>
    Math.max(...squad.map((id) => forecast(playerById(id), round + i + 1, seed)))));
  const triple = !rival.tripleUsed && (now >= later || round === ROUNDS - 1);
  return { ...rival, squad, captain, triple, tripleUsed: rival.tripleUsed || triple };
}

export function roundVerdict(actual, expected) {
  const delta = actual - expected;
  if (delta >= 12) return { title: 'En omgång att minnas.', detail: 'Ditt lag slog prognosen med råge.', tone: 'gold' };
  if (delta >= 3) return { title: 'Dina val gav utdelning.', detail: 'Laget överträffade förväntningarna.', tone: 'gold' };
  if (delta <= -8) return { title: 'Fotboll är oförutsägbart.', detail: 'Ett tufft utfall. Läs nästa spelschema innan du byter.', tone: 'calm' };
  return { title: 'Stabilt genomfört.', detail: 'Nära prognosen. Nästa beslut kan avgöra ligan.', tone: 'calm' };
}
export function pointsFor(position, stats) {
  const goalValue = { MV: 10, BACK: 6, MITT: 5, ANF: 4 }[position];
  const clean = stats.conceded === 0 ? ({ MV: 4, BACK: 4, MITT: 1, ANF: 0 }[position]) : 0;
  const loss = position === 'MV' || position === 'BACK' ? Math.floor(stats.conceded / 2) : 0;
  return 2 + stats.goals * goalValue + stats.assists * 3 + clean +
    (position === 'MV' ? Math.floor(stats.saves / 3) : 0) - loss;
}
export function performance(player, round, seed) {
  const index = PLAYERS.indexOf(player);
  const roll = random(seed + round * 1009 + index * 9176);
  const factor = [1.38, 1, 0.68][difficulty(player.club, round, seed) - 1];
  const rate = player.attack * factor;
  const goals = Number(roll() < rate * 0.7) + Number(roll() < rate * 0.24);
  const assists = Number(roll() < player.assist * factor * 0.85);
  const conceded = roll() < player.defense * factor * 0.65 ? 0 : 1 + Math.floor(roll() * 3);
  const saves = player.position === 'MV' ? Math.floor(roll() * 7) + 1 : 0;
  const stats = { goals, assists, conceded, saves };
  return { ...stats, points: pointsFor(player.position, stats) };
}
export function scoreSquad(squad, captain, round, seed, triple = false) {
  const rows = squad.map((id) => {
    const player = playerById(id);
    const stats = performance(player, round, seed);
    const multiplier = id === captain ? (triple ? 3 : 2) : 1;
    return { player, ...stats, multiplier, total: stats.points * multiplier };
  });
  return { rows, points: rows.reduce((n, row) => n + row.total, 0) };
}

/** Competition ranking: equal scores share a place (1, 1, 3, 4). */
export function rankStandings(entries) {
  const sorted = entries.map((entry) => ({ ...entry })).sort((a, b) => b.points - a.points);
  sorted.forEach((entry, index) => {
    entry.place = index > 0 && entry.points === sorted[index - 1].points ? sorted[index - 1].place : index + 1;
  });
  return sorted;
}

/** Keep the captain's position when undoing a transfer, regardless of the selected UI slot. */
export function undoTransfer(squad, captain, baseline) {
  const captainSlot = squad.indexOf(captain);
  const restored = baseline.slice();
  return { squad: restored, captain: restored.includes(captain) ? captain : restored[Math.max(0, captainSlot)] };
}
