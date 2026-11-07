/**
 * AchievementEngine: räknar fram utmärkelserna ur resultaten.
 *
 * Reglerna finns i src/data/achievements.js. Engine bygger en tidslinje per
 * person (en post per upplaga, Covid-året borttaget) och kör varje regel på:
 * - hela historiken: vem som har utmärkelsen nu;
 * - historiken fram till och med varje år: vilket år den låstes upp, och för
 *   titlar sedan när innehavaren har haft den;
 * - `progress` för de som inte har den: hur nära den som är närmast är.
 *
 * API (oförändrat för app.js):
 *   const engine = new AchievementEngine();
 *   const byName = engine.calculateAllAchievements(competitions, participants);
 *   // byName: { 'Viktor Jones': ['win_1', ...], ... }
 *   engine.details  // { [name]: { [id]: { year } } }
 *   engine.closest  // { [id]: { names: [...], cur, goal } } för låsta utmärkelser
 *
 * `competitions` kommer från processData i app.js: { year, name, scores,
 * blank, arranger3rd, arrangerSecondLast, isCovid }. `scores` har kända
 * placeringar och `blank` id:n med tom ruta. En tom ruta är frånvaro, utom i
 * en upplaga vars resultatlista har luckor eller bara har pallen ifylld: där
 * är de tomma rutorna okända placeringar.
 */

class AchievementEngine {
  constructor(defs) {
    this.defs = defs || window.ACHIEVEMENT_DEFINITIONS || [];
    this.details = {};
    this.closest = {};
  }

  /** One timeline entry per edition, oldest first, for every participant */
  buildPeople(editions, participants) {
    const people = participants.map((pt) => {
      const res = editions.map((ed) => {
        const pos = ed.scores[pt.id];
        const host = [ed.arranger3rd, ed.arrangerSecondLast].some((h) => (h || '').trim() === pt.name.trim());
        const base = { year: ed.year, field: ed.field, complete: ed.complete, host };
        if (pos != null) return { ...base, s: 'pos', pos, last: ed.lastPos != null && pos === ed.lastPos };
        if ((ed.unknown || []).includes(pt.id)) return { ...base, s: 'unk', pos: null, last: false };
        return { ...base, s: 'abs', pos: null, last: false };
      });
      const known = res.filter((e) => e.s === 'pos');
      const count = (n) => known.filter((e) => e.pos === n).length;
      const debut = res.findIndex((e) => e.s !== 'abs');
      return {
        id: pt.id,
        name: pt.name,
        res,
        known,
        starts: known.length,
        wins: count(1),
        silvers: count(2),
        bronzes: count(3),
        podiums: known.filter((e) => e.pos <= 3).length,
        hosts: res.filter((e) => e.host).length,
        winYears: known.filter((e) => e.pos === 1).map((e) => e.year),
        missedSinceDebut: debut >= 0 && res.slice(debut).some((e) => e.s === 'abs'),
        count,
        /** Run of consecutive known placings matching pred that is still going */
        current(pred) {
          let cur = 0;
          for (let i = res.length - 1; i >= 0 && res[i].s === 'pos' && pred(res[i]); i--) cur++;
          return cur;
        },
        /** Longest run of consecutive editions with a known placing matching pred */
        run(pred) {
          let best = 0;
          let cur = 0;
          for (const e of res) {
            cur = e.s === 'pos' && pred(e) ? cur + 1 : 0;
            best = Math.max(best, cur);
          }
          return best;
        }
      };
    });
    return people;
  }

  /** Editions oldest first, without the Covid year, with field size and last place */
  normalise(competitions) {
    return competitions
      .filter((c) => !c.isCovid && c.name !== 'Covid')
      .slice()
      .sort((a, b) => a.year - b.year)
      .map((c) => {
        const positions = Object.values(c.scores);
        // An empty cell means "not there" (as the README says), unless the
        // results have gaps or only the podium is filled in: then the empty
        // cells are unknown placings, neither starts nor absences
        const blank = c.blank || [];
        const partial = blank.length > 0 && (AchievementEngine.hasGaps(positions) || Math.max(0, ...positions) <= 3);
        const unknown = partial ? blank : [];
        const field = positions.length + unknown.length;
        const maxPos = positions.length ? Math.max(...positions) : null;
        const complete = unknown.length === 0;
        // Last place is only known when the whole list is (or the worst known
        // placing is the field size, so nobody unknown can be behind it), and
        // only counts in a field of five or more: third of three is a medal
        const lastPos = maxPos != null && (complete || maxPos === field) && field >= 5 ? maxPos : null;
        return { ...c, unknown, field, complete, lastPos };
      });
  }

  /**
   * True when known placings can't be a full ranking: some placing p has
   * fewer than p people at or ahead of it (ties like 1, 2, 2 or 1, 3, 3 are fine)
   */
  static hasGaps(positions) {
    return [...new Set(positions)].some((v) => positions.filter((x) => x <= v).length < v);
  }

  /** Evaluates every rule for one slice of history */
  evaluate(editions, participants) {
    const people = this.buildPeople(editions, participants);
    const ctx = { people, editions };
    const has = {};
    people.forEach((p) => (has[p.name] = new Set()));
    this.defs.forEach((d) => {
      if (d.title) {
        const scored = people.map((p) => [p, d.score(p, ctx)]).filter(([, s]) => s != null && Number.isFinite(s));
        if (!scored.length) return;
        const best = Math.max(...scored.map(([, s]) => s));
        scored.filter(([, s]) => Math.abs(s - best) < 1e-9).forEach(([p]) => has[p.name].add(d.id));
      } else {
        people.forEach((p) => {
          if (d.test(p, ctx)) has[p.name].add(d.id);
        });
      }
    });
    return { has, people, ctx };
  }

  calculateAllAchievements(competitions, participants) {
    const editions = this.normalise(competitions);
    const now = this.evaluate(editions, participants);

    // Unlock year: the first year from which the person has kept it to today.
    // Walk back one edition at a time while they still had it.
    const details = {};
    participants.forEach((pt) => (details[pt.name] = {}));
    const prefixes = editions.map((_, i) => this.evaluate(editions.slice(0, i + 1), participants).has);
    participants.forEach((pt) => {
      now.has[pt.name].forEach((id) => {
        let i = editions.length - 1;
        while (i > 0 && prefixes[i - 1][pt.name].has(id)) i--;
        details[pt.name][id] = { year: editions[i].year };
      });
    });

    // Closest to each locked achievement
    const closest = {};
    this.defs.forEach((d) => {
      if (!d.progress) return;
      if (participants.some((pt) => now.has[pt.name].has(d.id))) return;
      let best = null;
      now.people.forEach((p) => {
        if (p.starts === 0) return;
        const pr = d.progress(p, now.ctx);
        if (!pr || pr[0] <= 0) return;
        const [cur, goal] = pr;
        if (!best || cur > best.cur) best = { names: [p.name], cur: Math.min(cur, goal), goal };
        else if (cur === best.cur) best.names.push(p.name);
      });
      if (best) closest[d.id] = best;
    });

    this.details = details;
    this.closest = closest;
    this.editions = editions;

    const byName = {};
    participants.forEach((pt) => {
      // Definition order, so the lists read the same everywhere
      byName[pt.name] = this.defs.filter((d) => now.has[pt.name].has(d.id)).map((d) => d.id);
    });
    return byName;
  }
}

window.AchievementEngine = AchievementEngine;
