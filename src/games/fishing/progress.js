/**
 * Pekkas Fiske — what the game remembers, and what each cast is for.
 *
 * The fångstdagbok lives in localStorage on this device: every species
 * you have landed, how many, the biggest one, and a handful of records.
 * Every access is wrapped — private mode or blocked storage just means
 * the book starts empty, never that the game breaks.
 *
 * Each cast also gets an uppdrag, one per difficulty tier (cast 1 easy,
 * cast 3 hard), so there is always a concrete reason to steer a certain
 * way on this particular drop. Completing it pays a bonus and a star.
 */

const HIGHSCORE_KEY = 'pp-fiske-highscore'; // kept from the first version
const BOOK_KEY = 'pp-fiske-dagbok';

export function loadProgress() {
  let data = {};
  let high = 0;
  try {
    data = JSON.parse(localStorage.getItem(BOOK_KEY) || '{}') || {};
    high = parseInt(localStorage.getItem(HIGHSCORE_KEY) || '0', 10) || 0;
  } catch (e) {
    data = {};
  }
  return {
    high,
    bestCast: data.bestCast || 0,
    deepest: data.deepest || 0,
    evenings: data.evenings || 0,
    stars: data.stars || 0,
    pokal: !!data.pokal,
    log: data.log && typeof data.log === 'object' ? data.log : {}
  };
}

export function saveProgress(p) {
  try {
    localStorage.setItem(HIGHSCORE_KEY, String(Math.round(p.high)));
    localStorage.setItem(BOOK_KEY, JSON.stringify({
      bestCast: Math.round(p.bestCast),
      deepest: Math.round(p.deepest),
      evenings: p.evenings,
      stars: p.stars,
      pokal: p.pokal,
      log: p.log
    }));
  } catch (e) {
    /* private mode — the book just won't survive the evening */
  }
}

/**
 * Record one landed fish. Returns { first, record } so the caller can
 * celebrate a new species or a new biggest-ever.
 */
export function logCatch(p, sp, kg) {
  const e = p.log[sp.id] || { n: 0, best: 0 };
  const first = e.n === 0;
  const record = !first && kg > e.best;
  e.n++;
  e.best = Math.max(e.best, Math.round(kg * 100) / 100);
  p.log[sp.id] = e;
  return { first, record };
}

/** Size factor → weight in kg, cubed like a real fish's mass. */
export function weighFish(sp, k) {
  const t = Math.min(1, Math.max(0, (k - 0.86) / 0.3)) ** 1.6;
  return sp.kg[0] + (sp.kg[1] - sp.kg[0]) * t;
}

export const fmtKg = (kg) => `${kg.toLocaleString('sv-SE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

/**
 * The uppdrag. `test` reads the cast record the game keeps:
 * { dodges, deepest, haul, tapped, perfect, peakMult, bottom, species{} }.
 */
export const MISSIONS = [
  { id: 'dodge4', tier: 0, text: 'Väj för 4 fiskar på vägen ner', test: (c) => c.dodges >= 4 },
  { id: 'abborre', tier: 0, text: 'Fånga en abborre', test: (c) => (c.species.abborre || 0) >= 1 },
  { id: 'haul4', tier: 0, text: 'Få upp minst 4 fiskar', test: (c) => c.haul >= 4 },
  { id: 'deep25', tier: 0, text: 'Nå 25 meters djup', test: (c) => c.deepest >= 25 },
  { id: 'sik', tier: 1, text: 'Fånga en sik', test: (c) => (c.species.sik || 0) >= 1 },
  { id: 'dodge8', tier: 1, text: 'Väj för 8 fiskar på vägen ner', test: (c) => c.dodges >= 8 },
  { id: 'gadda', tier: 1, text: 'Fånga en gädda', test: (c) => (c.species.gadda || 0) >= 1 },
  { id: 'tap4', tier: 1, text: 'Tryck in 4 fiskar i tunnan', test: (c) => c.tapped >= 4 },
  { id: 'deep40', tier: 1, text: 'Nå 40 meters djup', test: (c) => c.deepest >= 40 },
  { id: 'lax', tier: 2, text: 'Fånga en lax', test: (c) => (c.species.lax || 0) >= 1 },
  { id: 'perfect', tier: 2, text: 'Perfekt kast med minst tre fiskar', test: (c) => c.perfect && c.haul >= 3 },
  { id: 'haul8', tier: 2, text: 'Få upp minst 8 fiskar', test: (c) => c.haul >= 8 },
  { id: 'mult5', tier: 2, text: 'Samla ×5 i multiplikator', test: (c) => c.peakMult >= 5 },
  { id: 'bottom', tier: 2, text: 'Bottenkänning — nå botten utan att nudda något', test: (c) => c.bottom }
];

export const MISSION_BONUS = [800, 1500, 2500];

/**
 * One uppdrag for cast number n (1-based). A brand-new angler's first
 * cast always teaches the core rule — dodge — before anything else.
 */
export function pickMission(n, used, newcomer) {
  const tier = Math.min(2, n - 1);
  if (n === 1 && newcomer) return MISSIONS[0];
  const pool = MISSIONS.filter((m) => m.tier === tier && !used.includes(m.id));
  return pool[Math.floor(Math.random() * pool.length)] || MISSIONS[0];
}
