/**
 * Utmärkelserna i Pekkas Pokal.
 *
 * Varje utmärkelse är en exakt regel som räknas fram ur resultaten. Regeln
 * står i `desc`, och `test` gör precis det som står där, varken mer eller
 * mindre. AchievementEngine (src/scripts/achievement-engine.js) kör reglerna
 * på hela historiken och på varje år för sig, så att sajten kan visa vem som
 * har en utmärkelse, vilket år den låstes upp och hur nära de andra är.
 *
 * Grundregler för alla utmärkelser:
 * - En upplaga är ett år med en tävling. Covid-året 2020 räknas inte, så 2019
 *   och 2021 är två upplagor i rad.
 * - Bara kända placeringar räknas. En tom ruta betyder att personen inte var
 *   med, utom i upplagor där resultatlistan har luckor (2014 och 2015 har bara
 *   pallen, 2023 saknar femman och sexan). Där är de tomma rutorna okända:
 *   varken starter, frånvaro eller placeringar, och de bryter en svit.
 * - ”Pallplats” är topp 3. ”Sist” är den sämsta placeringen en upplaga där
 *   hela resultatlistan är känd.
 * - Poängen följer sällsyntheten: Vanlig 10, Sällsynt 25, Episk 50,
 *   Legendarisk 100, Mytisk 250.
 * - Titlar har bara en innehavare åt gången (delas vid lika). De kan byta
 *   ägare när nya resultat kommer in.
 *
 * Fält:
 *   id, icon, name, desc, category, rarity
 *   test(p, ctx)      → true om personen p har utmärkelsen
 *   progress(p, ctx)  → [nu, mål] för ”närmast”-raden (valfri)
 *   title: true       → titel; score(p, ctx) ger ett tal (högst vinner), eller null
 *   historic: true    → kan inte längre låsas upp (visas som historisk)
 *
 * Personobjektet p (se engine): name, id, res (en post per upplaga, äldst
 * först: { year, s: 'pos' | 'unk' | 'abs', pos, field, last, host }),
 * known (bara poster med placering), starts, wins, silvers, bronzes,
 * podiums, hosts, count(pos), run(pred) (längsta svit), current(pred) (pågående
 * svit), winYears, missedSinceDebut.
 */

const POINTS = { common: 10, rare: 25, epic: 50, legendary: 100, mythic: 250 };

/** Two results in a row: consecutive editions, both with a known placing */
function pairs(p) {
  const out = [];
  for (let i = 1; i < p.res.length; i++) {
    const a = p.res[i - 1];
    const b = p.res[i];
    if (a.s === 'pos' && b.s === 'pos') out.push([a, b]);
  }
  return out;
}

/** Longest run of consecutive known results matching `pred` over a window */
function windowRun(p, len, pred) {
  for (let i = 0; i + len <= p.res.length; i++) {
    const w = p.res.slice(i, i + len);
    if (w.every((e) => e.s === 'pos') && pred(w)) return true;
  }
  return false;
}

/** Placings of p and q in every edition where both have a known placing */
function shared(p, q) {
  const out = [];
  p.res.forEach((e, i) => {
    const f = q.res[i];
    if (e.s === 'pos' && f.s === 'pos') out.push([e.pos, f.pos]);
  });
  return out;
}

/** Head-to-head [wins, losses] against everyone p has met at least five times */
function h2hRecords(p, ctx) {
  return ctx.people
    .filter((q) => q !== p)
    .map((q) => {
      const games = shared(p, q);
      return [games.filter(([a, b]) => a < b).length, games.filter(([a, b]) => a > b).length];
    })
    .filter(([w, l]) => w + l >= 5);
}

const ACHIEVEMENT_DEFINITIONS = [
  /* ===================== MEDALJER ===================== */
  {
    id: 'podium_1',
    icon: '🎉',
    name: 'Första pallplatsen',
    desc: 'Ta en pallplats (topp 3) i en upplaga.',
    category: 'medals',
    rarity: 'common',
    test: (p) => p.podiums >= 1
  },
  {
    id: 'win_1',
    icon: '🥇',
    name: 'Första segern',
    desc: 'Vinn en upplaga.',
    category: 'medals',
    rarity: 'rare',
    test: (p) => p.wins >= 1
  },
  {
    id: 'win_3',
    icon: '🏆',
    name: 'Trefaldig mästare',
    desc: 'Vinn tre upplagor.',
    category: 'medals',
    rarity: 'epic',
    test: (p) => p.wins >= 3,
    progress: (p) => [p.wins, 3]
  },
  {
    id: 'win_5',
    icon: '👑',
    name: 'Guldkungen',
    desc: 'Vinn fem upplagor.',
    category: 'medals',
    rarity: 'legendary',
    test: (p) => p.wins >= 5,
    progress: (p) => [p.wins, 5]
  },
  {
    id: 'win_7',
    icon: '🌟',
    name: 'Pokalens regent',
    desc: 'Vinn sju upplagor.',
    category: 'medals',
    rarity: 'mythic',
    test: (p) => p.wins >= 7,
    progress: (p) => [p.wins, 7]
  },
  {
    id: 'podium_5',
    icon: '🏅',
    name: 'Medaljsamlaren',
    desc: 'Ta fem pallplatser.',
    category: 'medals',
    rarity: 'rare',
    test: (p) => p.podiums >= 5,
    progress: (p) => [p.podiums, 5]
  },
  {
    id: 'podium_10',
    icon: '🧲',
    name: 'Medaljmagneten',
    desc: 'Ta tio pallplatser.',
    category: 'medals',
    rarity: 'legendary',
    test: (p) => p.podiums >= 10,
    progress: (p) => [p.podiums, 10]
  },
  {
    id: 'silver_3',
    icon: '🥈',
    name: 'Eviga tvåan',
    desc: 'Kom tvåa tre gånger.',
    category: 'medals',
    rarity: 'epic',
    test: (p) => p.silvers >= 3,
    progress: (p) => [p.silvers, 3]
  },
  {
    id: 'bronze_3',
    icon: '🥉',
    name: 'Bronsbaronen',
    desc: 'Kom trea tre gånger.',
    category: 'medals',
    rarity: 'epic',
    test: (p) => p.bronzes >= 3,
    progress: (p) => [p.bronzes, 3]
  },
  {
    id: 'full_set',
    icon: '🌈',
    name: 'Hela setet',
    desc: 'Ta guld, silver och brons, i vilken ordning som helst.',
    category: 'medals',
    rarity: 'epic',
    test: (p) => p.wins >= 1 && p.silvers >= 1 && p.bronzes >= 1,
    progress: (p) => [(p.wins > 0) + (p.silvers > 0) + (p.bronzes > 0), 3]
  },

  /* ===================== SVITER ===================== */
  {
    id: 'podium_streak_2',
    icon: '🔁',
    name: 'Pallen igen',
    desc: 'Ta pallplats två upplagor i rad.',
    category: 'streaks',
    rarity: 'rare',
    test: (p) => p.run((e) => e.pos <= 3) >= 2,
    progress: (p) => [p.current((e) => e.pos <= 3), 2]
  },
  {
    id: 'podium_streak_3',
    icon: '🔥',
    name: 'Pallkonsistens',
    desc: 'Ta pallplats tre upplagor i rad.',
    category: 'streaks',
    rarity: 'epic',
    test: (p) => p.run((e) => e.pos <= 3) >= 3,
    progress: (p) => [p.current((e) => e.pos <= 3), 3]
  },
  {
    id: 'podium_streak_5',
    icon: '⭐',
    name: 'Pallplatsmästaren',
    desc: 'Ta pallplats fem upplagor i rad.',
    category: 'streaks',
    rarity: 'mythic',
    test: (p) => p.run((e) => e.pos <= 3) >= 5,
    progress: (p) => [p.current((e) => e.pos <= 3), 5]
  },
  {
    id: 'win_streak_2',
    icon: '⚡',
    name: 'Dubbelmästare',
    desc: 'Vinn två upplagor i rad.',
    category: 'streaks',
    rarity: 'legendary',
    test: (p) => p.run((e) => e.pos === 1) >= 2,
    progress: (p) => [p.current((e) => e.pos === 1), 2]
  },
  {
    id: 'win_streak_3',
    icon: '🎩',
    name: 'Hattrick',
    desc: 'Vinn tre upplagor i rad.',
    category: 'streaks',
    rarity: 'mythic',
    test: (p) => p.run((e) => e.pos === 1) >= 3,
    progress: (p) => [p.current((e) => e.pos === 1), 3]
  },
  {
    id: 'top_half_5',
    icon: '📈',
    name: 'Stabil',
    desc: 'Placera dig i övre halvan av fältet fem upplagor i rad.',
    category: 'streaks',
    rarity: 'epic',
    test: (p) => p.run((e) => e.pos <= e.field / 2) >= 5,
    progress: (p) => [p.current((e) => e.pos <= e.field / 2), 5]
  },
  {
    id: 'climb_3',
    icon: '🌠',
    name: 'Stigande stjärna',
    desc: 'Förbättra din placering tre upplagor i rad.',
    category: 'streaks',
    rarity: 'epic',
    test: (p) => windowRun(p, 4, (w) => w[1].pos < w[0].pos && w[2].pos < w[1].pos && w[3].pos < w[2].pos)
  },

  /* ===================== MILSTOLPAR ===================== */
  {
    id: 'debut',
    icon: '👋',
    name: 'Debutanten',
    desc: 'Gör din första start.',
    category: 'milestones',
    rarity: 'common',
    test: (p) => p.starts >= 1
  },
  {
    id: 'starts_5',
    icon: '🎟️',
    name: 'Stammisen',
    desc: 'Delta i fem upplagor.',
    category: 'milestones',
    rarity: 'common',
    test: (p) => p.starts >= 5,
    progress: (p) => [p.starts, 5]
  },
  {
    id: 'starts_10',
    icon: '🎖️',
    name: 'Veteranen',
    desc: 'Delta i tio upplagor.',
    category: 'milestones',
    rarity: 'rare',
    test: (p) => p.starts >= 10,
    progress: (p) => [p.starts, 10]
  },
  {
    id: 'starts_15',
    icon: '🗿',
    name: 'Inventarium',
    desc: 'Delta i femton upplagor.',
    category: 'milestones',
    rarity: 'legendary',
    test: (p) => p.starts >= 15,
    progress: (p) => [p.starts, 15]
  },
  {
    id: 'iron_man',
    icon: '🏃',
    name: 'Järnmannen',
    desc: 'Missa ingen upplaga efter din debut, och nå tolv starter.',
    category: 'milestones',
    rarity: 'legendary',
    test: (p) => p.starts >= 12 && !p.missedSinceDebut,
    progress: (p) => (p.missedSinceDebut ? null : [p.starts, 12])
  },
  {
    id: 'founder',
    icon: '🎩',
    name: 'Grundaren',
    desc: 'Var med i den allra första upplagan 2011.',
    category: 'milestones',
    rarity: 'rare',
    historic: true,
    test: (p) => p.res.length > 0 && p.res[0].year === 2011 && p.res[0].s === 'pos'
  },
  {
    id: 'debut_podium',
    icon: '🚀',
    name: 'Drömdebut',
    desc: 'Ta pallplats i din första start.',
    category: 'milestones',
    rarity: 'rare',
    test: (p) => p.known.length > 0 && p.known[0].pos <= 3
  },
  {
    id: 'late_bloomer',
    icon: '🌸',
    name: 'Senblomman',
    desc: 'Ta din första pallplats i din femte start eller senare.',
    category: 'milestones',
    rarity: 'epic',
    test: (p) => {
      const i = p.known.findIndex((e) => e.pos <= 3);
      return i >= 4;
    }
  },
  {
    id: 'comeback_5',
    icon: '💪',
    name: 'Comebacken',
    desc: 'Vinn igen minst fem år efter din förra seger.',
    category: 'milestones',
    rarity: 'epic',
    test: (p) => p.winYears.some((y, i) => i > 0 && y - p.winYears[i - 1] >= 5)
  },
  {
    id: 'comeback_10',
    icon: '⏳',
    name: 'Tio år senare',
    desc: 'Vinn igen minst tio år efter din förra seger.',
    category: 'milestones',
    rarity: 'legendary',
    test: (p) => p.winYears.some((y, i) => i > 0 && y - p.winYears[i - 1] >= 10)
  },
  {
    id: 'rocket',
    icon: '🛫',
    name: 'Raketen',
    desc: 'Klättra minst åtta placeringar från en upplaga till nästa.',
    category: 'milestones',
    rarity: 'rare',
    test: (p) => pairs(p).some(([a, b]) => a.pos - b.pos >= 8)
  },
  {
    id: 'phoenix',
    icon: '🌅',
    name: 'Fenixfågeln',
    desc: 'Kom sist, och ta pallplats i nästa upplaga.',
    category: 'milestones',
    rarity: 'epic',
    test: (p) => pairs(p).some(([a, b]) => a.last && b.pos <= 3)
  },
  {
    id: 'bottom_to_top',
    icon: '📈',
    name: 'Från botten till toppen',
    desc: 'Kom sist, och vinn nästa upplaga.',
    category: 'milestones',
    rarity: 'legendary',
    test: (p) => pairs(p).some(([a, b]) => a.last && b.pos === 1)
  },

  /* ===================== ARRANGÖRER ===================== */
  {
    id: 'host_1',
    icon: '🏠',
    name: 'Värden',
    desc: 'Arrangera en upplaga.',
    category: 'hosts',
    rarity: 'common',
    test: (p) => p.hosts >= 1
  },
  {
    id: 'host_3',
    icon: '🏡',
    name: 'Flitig värd',
    desc: 'Arrangera tre upplagor.',
    category: 'hosts',
    rarity: 'rare',
    test: (p) => p.hosts >= 3,
    progress: (p) => [p.hosts, 3]
  },
  {
    id: 'host_5',
    icon: '🏰',
    name: 'Slottsherren',
    desc: 'Arrangera fem upplagor.',
    category: 'hosts',
    rarity: 'epic',
    test: (p) => p.hosts >= 5,
    progress: (p) => [p.hosts, 5]
  },
  {
    id: 'host_back_to_back',
    icon: '🔂',
    name: 'Abonnemanget',
    desc: 'Arrangera två upplagor i rad.',
    category: 'hosts',
    rarity: 'rare',
    test: (p) => p.res.some((e, i) => i > 0 && e.host && p.res[i - 1].host)
  },
  {
    id: 'home_win',
    icon: '🏟️',
    name: 'Hemmaplan',
    desc: 'Vinn en upplaga som du själv arrangerar.',
    category: 'hosts',
    rarity: 'epic',
    test: (p) => p.res.some((e) => e.host && e.s === 'pos' && e.pos === 1)
  },

  /* ===================== RIVALER ===================== */
  {
    id: 'upper_hand',
    icon: '⚔️',
    name: 'Övertaget',
    desc: 'Placera dig före samma person sex gånger i rad, räknat på upplagorna där ni båda var med.',
    category: 'rivals',
    rarity: 'epic',
    test: (p, ctx) =>
      ctx.people.some((q) => {
        if (q === p) return false;
        let run = 0;
        for (const [a, b] of shared(p, q)) {
          run = a < b ? run + 1 : 0;
          if (run >= 6) return true;
        }
        return false;
      })
  },
  {
    id: 'nemesis',
    icon: '😤',
    name: 'Ärkefienden',
    desc: 'Sluta direkt bakom samma person tre gånger.',
    category: 'rivals',
    rarity: 'rare',
    test: (p, ctx) => ctx.people.some((q) => q !== p && shared(p, q).filter(([a, b]) => a === b + 1).length >= 3)
  },
  {
    id: 'dominance',
    icon: '🛡️',
    name: 'Herravälde',
    desc: 'Ha plusfacit i inbördes möten mot alla du mött minst fem gånger (minst fem sådana).',
    category: 'rivals',
    rarity: 'legendary',
    test: (p, ctx) => {
      const rec = h2hRecords(p, ctx);
      return rec.length >= 5 && rec.every(([w, l]) => w > l);
    },
    progress: (p, ctx) => {
      const rec = h2hRecords(p, ctx);
      return rec.length >= 5 ? [rec.filter(([w, l]) => w > l).length, rec.length] : null;
    }
  },

  /* ===================== ROLIGA ===================== */
  {
    id: 'bridesmaid',
    icon: '👰',
    name: 'Alltid tärna',
    desc: 'Kom tvåa två gånger utan att någonsin ha vunnit.',
    category: 'fun',
    rarity: 'rare',
    test: (p) => p.silvers >= 2 && p.wins === 0
  },
  {
    id: 'fourth_3',
    icon: '4️⃣',
    name: 'Fyrans förbannelse',
    desc: 'Kom fyra tre gånger.',
    category: 'fun',
    rarity: 'rare',
    test: (p) => p.count(4) >= 3,
    progress: (p) => [p.count(4), 3]
  },
  {
    id: 'seven_3',
    icon: '7️⃣',
    name: 'Lyckonummer sju',
    desc: 'Kom sjua tre gånger.',
    category: 'fun',
    rarity: 'rare',
    test: (p) => p.count(7) >= 3,
    progress: (p) => [p.count(7), 3]
  },
  {
    id: 'jumbo',
    icon: '🐌',
    name: 'Jumbon',
    desc: 'Kom sist i en upplaga.',
    category: 'fun',
    rarity: 'common',
    test: (p) => p.known.some((e) => e.last)
  },
  {
    id: 'same_spot',
    icon: '📍',
    name: 'Hängmattan',
    desc: 'Få samma placering två upplagor i rad.',
    category: 'fun',
    rarity: 'common',
    test: (p) => pairs(p).some(([a, b]) => a.pos === b.pos)
  },
  {
    id: 'mr_middle',
    icon: '😐',
    name: 'Herr Medel',
    desc: 'Hamna exakt i mitten av fältet tre gånger.',
    category: 'fun',
    rarity: 'rare',
    test: (p) =>
      p.known.filter((e) => e.complete && (e.pos === Math.ceil(e.field / 2) || e.pos === Math.floor(e.field / 2) + 1)).length >= 3,
    progress: (p) => [
      p.known.filter((e) => e.complete && (e.pos === Math.ceil(e.field / 2) || e.pos === Math.floor(e.field / 2) + 1)).length,
      3
    ]
  },
  {
    id: 'yo_yo',
    icon: '🪀',
    name: 'Jojo',
    desc: 'Växla mellan pallen och utanför pallen fyra upplagor i rad.',
    category: 'fun',
    rarity: 'epic',
    test: (p) => windowRun(p, 4, (w) => w.every((e, i) => i === 0 || (e.pos <= 3) !== (w[i - 1].pos <= 3)))
  },
  {
    id: 'free_fall',
    icon: '🪂',
    name: 'Fritt fall',
    desc: 'Rasa minst åtta placeringar från en upplaga till nästa.',
    category: 'fun',
    rarity: 'common',
    test: (p) => pairs(p).some(([a, b]) => b.pos - a.pos >= 8)
  },
  {
    id: 'drought_5',
    icon: '🏜️',
    name: 'Formsvackan',
    desc: 'Hamna utanför pallen fem upplagor i rad.',
    category: 'fun',
    rarity: 'common',
    test: (p) => p.run((e) => e.pos > 3) >= 5
  },
  {
    id: 'top_to_bottom',
    icon: '🎢',
    name: 'Berg-och-dalbanan',
    desc: 'Vinn en upplaga och kom sist i nästa.',
    category: 'fun',
    rarity: 'epic',
    test: (p) => pairs(p).some(([a, b]) => a.pos === 1 && b.last)
  },

  /* ===================== TITLAR ===================== */
  {
    id: 't_goat',
    icon: '🐐',
    name: 'The GOAT',
    desc: 'Titel: flest segrar genom tiderna (minst två).',
    category: 'titles',
    rarity: 'legendary',
    title: true,
    score: (p) => (p.wins >= 2 ? p.wins : null)
  },
  {
    id: 't_medals',
    icon: '💰',
    name: 'Medaljhamstraren',
    desc: 'Titel: flest pallplatser genom tiderna (minst tre).',
    category: 'titles',
    rarity: 'legendary',
    title: true,
    score: (p) => (p.podiums >= 3 ? p.podiums : null)
  },
  {
    id: 't_decade',
    icon: '🎯',
    name: 'Decenniets mästare',
    desc: 'Titel: flest segrar under de senaste tio upplagorna (minst två).',
    category: 'titles',
    rarity: 'legendary',
    title: true,
    score: (p) => {
      const w = p.res.slice(-10).filter((e) => e.s === 'pos' && e.pos === 1).length;
      return w >= 2 ? w : null;
    }
  },
  {
    id: 't_hosts',
    icon: '🗝️',
    name: 'Arrangörskungen',
    desc: 'Titel: flest arrangerade upplagor (minst två).',
    category: 'titles',
    rarity: 'epic',
    title: true,
    score: (p) => (p.hosts >= 2 ? p.hosts : null)
  },
  {
    id: 't_consistent',
    icon: '📊',
    name: 'Mr. Consistent',
    desc: 'Titel: jämnast placeringar, med minst åtta starter (lägst spridning i placering i förhållande till fältets storlek).',
    category: 'titles',
    rarity: 'epic',
    title: true,
    score: (p) => {
      const rel = p.known.filter((e) => e.field > 1).map((e) => (e.pos - 1) / (e.field - 1));
      if (rel.length < 8) return null;
      const mean = rel.reduce((a, b) => a + b, 0) / rel.length;
      const sd = Math.sqrt(rel.reduce((s, x) => s + (x - mean) ** 2, 0) / rel.length);
      return -sd;
    }
  }
];

ACHIEVEMENT_DEFINITIONS.forEach((d) => (d.points = POINTS[d.rarity]));

const ACHIEVEMENT_CATEGORIES = {
  medals: 'Medaljer',
  streaks: 'Sviter',
  milestones: 'Milstolpar',
  hosts: 'Arrangörer',
  rivals: 'Rivaler',
  fun: 'Roliga',
  titles: 'Titlar'
};

const ACHIEVEMENT_RARITIES = {
  common: { name: 'Vanlig', points: POINTS.common },
  rare: { name: 'Sällsynt', points: POINTS.rare },
  epic: { name: 'Episk', points: POINTS.epic },
  legendary: { name: 'Legendarisk', points: POINTS.legendary },
  mythic: { name: 'Mytisk', points: POINTS.mythic }
};

window.ACHIEVEMENT_DEFINITIONS = ACHIEVEMENT_DEFINITIONS;
window.ACHIEVEMENT_CATEGORIES = ACHIEVEMENT_CATEGORIES;
window.ACHIEVEMENT_RARITIES = ACHIEVEMENT_RARITIES;
