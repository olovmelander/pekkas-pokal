/**
 * Topplistan — the machine's own high-score table, kept on this device.
 *
 * A real machine remembers names, not just one number, and the names are
 * what make a table worth beating: the site passes in the friends who have
 * actually competed, so a record reads "Olov M." rather than "AAA".
 */

const KEY = 'pp-flipper-scores';
// The machine used to remember a single number under this key
const LEGACY_KEY = 'pp-flipper-highscore';
const NAME_KEY = 'pp-flipper-name';

// Kept a little longer than shown, so a score knocked off the visible five
// can climb back on when someone above it is beaten again.
export const BOARD_SIZE = 8;
export const BOARD_SHOWN = 5;

const valid = (e) => e && typeof e.n === 'string' && Number.isFinite(e.s) && e.s > 0;
const byScore = (a, b) => b.s - a.s;

/** "Olov Melander" → "Olov M." — unique among the group, and fits the DMD. */
export function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || '';
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

export function loadBoard() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(raw)) return raw.filter(valid).sort(byScore).slice(0, BOARD_SIZE);
    // Keep an old record as an unnamed entry rather than lose it
    const legacy = parseInt(localStorage.getItem(LEGACY_KEY) || '0', 10) || 0;
    return legacy > 0 ? [{ n: '???', s: legacy, d: '' }] : [];
  } catch (e) {
    return [];
  }
}

export function saveBoard(board) {
  try {
    localStorage.setItem(KEY, JSON.stringify(board));
  } catch (e) {
    /* private mode: the board lives for this visit only */
  }
}

/** Would this score make the board? */
export function qualifies(board, score) {
  return score > 0 && (board.length < BOARD_SIZE || score > board[board.length - 1].s);
}

/** 1-based place a score would take on the board */
export function rankOf(board, score) {
  const i = board.findIndex((e) => score > e.s);
  return (i < 0 ? board.length : i) + 1;
}

/** Returns the new board and the inserted entry (to highlight it). */
export function insertScore(board, name, score) {
  const entry = { n: String(name).slice(0, 14) || '???', s: score, d: new Date().toISOString().slice(0, 10) };
  const next = [...board, entry].sort(byScore).slice(0, BOARD_SIZE);
  return { board: next, entry };
}

export function lastName() {
  try {
    return localStorage.getItem(NAME_KEY) || '';
  } catch (e) {
    return '';
  }
}

export function rememberName(name) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch (e) {
    /* cosmetic */
  }
}
