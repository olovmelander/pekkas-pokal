/**
 * Pekkas Pokal — Application
 *
 * Single, dependency-light app module. Loads the competition CSV,
 * derives statistics, and renders every view: Översikt, Medaljliga,
 * Historik, Utmärkelser, Statistik, Sångbok och Spel.
 *
 * Navigation is hash-routed (#/medaljliga, #/deltagare/viktor-jones,
 * #/spel/2024 …) so every view, profile, year and game has a link that can
 * be shared, and the back button closes what was opened on top.
 */
(function () {
  'use strict';

  /* ======================================================================
     Utilities
     ====================================================================== */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const esc = (s) =>
    String(s == null ? '' : s).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

  const CSS_FALLBACKS = {
    '--gold': '#e9bf5c',
    '--gold-hi': '#fbe7ab',
    '--gold-deep': '#b4832a',
    '--silver': '#cfd4dc',
    '--bronze': '#d39468',
    '--accent-2': '#8fb3d9',
    '--chart-grid': 'rgba(255,236,200,0.06)',
    '--chart-tick': '#8a8377',
    '--surface-solid': '#15171d',
    '--border-strong': 'rgba(255,236,200,0.15)',
    '--text-1': '#f4efe6',
    '--text-2': '#b6ae9f'
  };

  const cssVar = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    CSS_FALLBACKS[name] ||
    '#888888';

  function shortName(fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
  }

  function initials(fullName) {
    return fullName
      .trim()
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  }

  function nameHue(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
    return h;
  }

  // Serier i diagrammen: guldet först, sedan dämpade nordiska toner som går
  // att skilja åt både i mörkt och ljust tema.
  const PALETTE = [
    '#e9bf5c', '#8fb3d9', '#7cc2a8', '#ec7a8f', '#b99be8',
    '#f0a35e', '#6fc9d1', '#d3cc6a', '#9aa6f2', '#df8cc4',
    '#a9c97c', '#d9a27a', '#b5ada0'
  ];

  /** Initialer på en rund bricka, tonad efter namnet. */
  function avatarHTML(name, cls) {
    return `<span class="avatar${cls ? ` ${cls}` : ''}" style="--hue:${nameHue(name)}" aria-hidden="true">${esc(initials(name))}</span>`;
  }

  /** "Viktor Jones" → "viktor-jones", "Hägglund" → "hagglund" */
  function slugify(str) {
    return String(str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  const prefersReducedMotion = () =>
    !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  const ORDINALS = ['', 'första', 'andra', 'tredje', 'fjärde', 'femte', 'sjätte', 'sjunde', 'åttonde', 'nionde', 'tionde'];

  function formatNumber(n) {
    return new Intl.NumberFormat('sv-SE').format(n);
  }

  /* ======================================================================
     App state
     ====================================================================== */

  const App = {
    data: null,
    stats: null,
    event: null,
    facts: [],
    elo: null, // { current: [...], history: {id: {year: rating}}, years: [] }
    h2h: { a: null, b: null },
    achievements: null, // { byName: {name: [ids]}, defs: [...] }
    charts: {},
    chartBuilders: {},
    map: null,
    mapTiles: null,
    mapMarkers: [],
    tourTimer: null,
    tickerTimer: null,
    tickerIndex: 0,
    countdownTimer: null,
    photos: null,
    medalSort: { key: 'rank', dir: 1 },
    filters: { participants: new Set(), years: new Set() },
    achCategory: 'all',
    currentView: null,
    appliedHash: null,
    modalChart: null,
    lastFocus: null,
    game: null,
    gameYear: null,
    gameLoadingYear: null,
    gameToken: 0,
    lastFocusBeforeGame: null,
    trophy: null,
    trophyLoading: false,
    booted: false,
    tickerPaused: false,
    showSong: null
  };

  /* ======================================================================
     Spelen — ett per år
     ====================================================================== */

  /**
   * One game per year. Entries without a `module` render as coming soon —
   * add one here as each year's game gets built.
   */
  /**
   * `colors` tonar affischen och laddkortet; `cover` är en stillbild ur
   * spelet (public/games/) — saknas den visas emblemet i stället.
   */
  const GAMES = [
    {
      year: 2026,
      title: 'Pekkas Lerskulptur',
      competition: 'Lerskulptur',
      tagline: 'Dreja tre alster i Barcelona-ateljén — keramikern dömer likheten.',
      icon: '🏺',
      colors: ['#7a3f22', '#170e09'],
      cover: 'games/clay.webp',
      module: 'src/games/clay/index.js'
    },
    {
      year: 2021,
      title: 'Pekkas Måleri',
      competition: 'Målning',
      tagline: 'Dra en lapp ur hatten, blanda färgen och låt Hägglund döma.',
      icon: '🎨',
      colors: ['#a8482a', '#191a2e'],
      cover: 'games/painting.webp',
      module: 'src/games/painting/index.js'
    },
    {
      year: 2019,
      title: 'Pekkas Pingis',
      competition: 'Pingis',
      tagline: 'Olympia i Bredbyn — flicka topspin och slå hela 2019 års pall.',
      icon: '🏓',
      colors: ['#8e1f28', '#150a0b'],
      cover: 'games/pingis.webp',
      module: 'src/games/pingis/index.js'
    },
    {
      year: 2022,
      title: 'Pekkas Lerduvor',
      competition: 'Skytte',
      tagline: 'PULL! 24 duvor över Arnäsvalls fält — och till sist guldduvan.',
      icon: '🥏',
      colors: ['#9a6a24', '#1a160d'],
      cover: 'games/shooting.webp',
      module: 'src/games/shooting/index.js'
    },
    {
      year: 2023,
      title: 'Pekkas Fäktning',
      competition: 'Fäktning',
      tagline: 'En garde på pisten i Stockholm — parera, ripostera och stöt dig till pokalen.',
      icon: '🤺',
      colors: ['#34446e', '#0c0e18'],
      cover: 'games/fencing.webp',
      module: 'src/games/fencing/index.js'
    },
    {
      year: 2024,
      title: 'Pekkas Fiske',
      competition: 'Fisketävling',
      tagline: 'Sänk draget djupt, kroka storgäddan och fånga allt på vägen upp.',
      icon: '🎣',
      colors: ['#245e69', '#091317'],
      cover: 'games/fishing.webp',
      module: 'src/games/fishing/index.js'
    },
    {
      year: 2025,
      title: 'Pekkas Pokal Flipper',
      competition: 'Flipper',
      tagline: 'Ett fullstort flipperspel i 3D. Tre bollar, fem mål och en pokal.',
      icon: '🎯',
      colors: ['#4e2475', '#11091a'],
      cover: 'games/pinball.webp',
      module: 'src/games/pinball/index.js'
    }
  ];

  const gameRoute = (year) => `#/spel/${year}`;

  /* ======================================================================
     Data loading & processing
     ====================================================================== */

  const FIXED_COLUMNS = ['År', 'Datum', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];

  function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    const parseLine = (line) => {
      const out = [];
      let cur = '';
      let quoted = false;
      for (const ch of line) {
        if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) {
          out.push(cur.trim());
          cur = '';
        } else cur += ch;
      }
      out.push(cur.trim());
      return out;
    };

    const headers = parseLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseLine(lines[i]);
      const row = {};
      headers.forEach((h, idx) => (row[h] = values[idx] != null ? values[idx] : ''));
      rows.push(row);
    }
    return { headers, rows };
  }

  function processData(headers, rows) {
    const participantNames = headers.filter((h) => h && !FIXED_COLUMNS.includes(h));

    const participants = participantNames.map((name, i) => ({
      id: `p${i + 1}`,
      name: name.trim(),
      nickname: shortName(name)
    }));

    const idByName = {};
    participants.forEach((p) => (idByName[p.name] = p.id));

    const competitions = [];
    rows.forEach((row) => {
      const rawYear = row['År'] || row['Datum'];
      const year = parseInt(String(rawYear).split('-')[0], 10);
      const name = (row['Tävling'] || '').trim();
      if (!year || !name) return;

      const dateStr = (row['Datum'] || '').trim();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? new Date(`${dateStr}T12:00:00`) : null;

      const isCovid = name.toLowerCase() === 'covid';
      const scores = {};
      let winner = null;
      let participantCount = 0;

      if (!isCovid) {
        participantNames.forEach((pName) => {
          const v = (row[pName] || '').trim();
          if (v && v !== '-') {
            const pos = parseInt(v, 10);
            if (!isNaN(pos)) {
              scores[idByName[pName]] = pos;
              participantCount++;
              if (pos === 1) winner = pName.trim();
            }
          }
        });
      }

      competitions.push({
        id: `c${competitions.length + 1}`,
        year,
        date,
        name: isCovid ? 'Covid' : name,
        location: (row['Plats'] || '').trim(),
        winner,
        scores,
        arranger3rd: (row['Arrangör 3:a'] || '').trim(),
        arrangerSecondLast: (row['Arrangör näst sist'] || '').trim(),
        participantCount,
        isCovid
      });
    });

    competitions.sort((a, b) => b.year - a.year);
    return { participants, competitions };
  }

  const EMBEDDED_CSV = `År,Datum,Tävling,Plats,Arrangör 3:a,Arrangör näst sist,Olov Melander,Mikael Hägglund,Viktor Jones,Per Vikman,Erik Vallgren,Henrik Lundqvist,Rickard Nilsson,Niklas Norberg,Per Olsson,Tobias Lundqvist,Lars Sandin,Ludvig Ulenius,Jonas Eriksson
2011,,Fantasy Premier League,,,,-,3,2,-,-,-,1,-,-,-,-,-,-
2012,2012-07-28,Gokart,Varggropen,Mikael Hägglund,Viktor Jones,-,7,3,4,2,7,5,-,-,-,-,7,1
2013,2013-06-29,Femkamp,Kroksta,Viktor Jones,Mikael Hägglund,-,4,6,2,1,3,5,7,-,-,-,-,-
2014,2014-07-12,Mångkamp Uppsala,Uppsala,Henrik Lundqvist,Rickard Nilsson,,,,,1,,,,,,,,-
2015,2015-06-13,Bondespelen ,Billsta,Olov Melander,Mikael Hägglund,,,,1,,,3,,,,,,2
2016,2016-08-06,Mångkamp Lundqvist,Idbyn,Rickard Nilsson,Tobias Lundqvist,7,5,9,3,10,11,4,1,-,2,-,8,6
2017,2017-08-05,Triathlon ,Lomsjön,Per Vikman,Erik Vallgren,-,3,1,2,6,8,7,9,-,4,-,5,-
2018,2018-08-04,Kortspel Ambition,Kungsholmen,Mikael Hägglund,Henrik Lundqvist,5,3,4,8,2,6,-,1,-,7,,-,-
2019,2019-08-31,Pingis,Bredbyn,Viktor Jones,Tobias Lundqvist,8,9,1,10,6,3,2,7,5,4,-,11,-
2020,,Covid,,,,,,,,,,,,,,,,-
2021,2021-08-07,Målning,Ås,Henrik Lundqvist,Per Vikman,1,-,6,5,7,9,10,8,4,2,-,3,-
2022,2022-08-06,Skytte,Arnäsvall,Ludvig Ulenius,Henrik Lundqvist,5,9,3,10,-,7,4,8,6,2,-,1,-
2023,2023-08-19,Fäkting,Stockholm,Viktor Jones,Mikael Hägglund,7,3,10,1,,,2,8,9,4,-,-,-
2024,2024-08-17,Fisketävling,Själevad,Tobias Lundqvist ,Per Olsson ,7,10,4,9,1,2,12,5,3,11,8,6,-
2025,2025-08-16,Flipper,Eskilstuna/Västerås,Viktor Jones,Mikael Hägglund,2,7,1,11,10,5,9,12,3,6,4,8,-
2026,2026-08-06,Lerskulptur,Barcelona,Per Olsson,Per Vikman,10,8,1,6,9,12,3,11,7,4,5,2,-`;

  async function loadData() {
    let text = null;
    try {
      const url = new URL('competition-data.csv', document.baseURI).toString();
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const t = await res.text();
        if (t && /(^|\n)\s*År\s*,/.test(t)) text = t;
      }
    } catch (e) {
      /* fall through to embedded data */
    }
    if (!text) text = EMBEDDED_CSV;
    const { headers, rows } = parseCSV(text);
    return processData(headers, rows);
  }

  /**
   * Fallback used only when event.json can't be read. The live announcement
   * lives in public/event.json — see README for how to update it.
   */
  const DEFAULT_EVENT = {
    date: '2026-08-06T18:00:00',
    location: 'Barcelona, Spanien',
    coords: [41.3874, 2.1686],
    hosts: ['Per Olsson', 'Per Vikman']
  };

  /**
   * Upcoming event, loaded from event.json so a new competition can be
   * announced by editing one file — no code change, no rebuild knowledge.
   * Falls back to DEFAULT_EVENT when the file is missing or malformed.
   */
  async function loadEvent() {
    try {
      const url = new URL('event.json', document.baseURI).toString();
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') {
          if (!json.date) return null; // explicitly cleared → use forecast
          const d = new Date(json.date);
          if (!isNaN(d.getTime())) return json;
        }
      }
    } catch (e) {
      /* fall through to the built-in default */
    }
    return DEFAULT_EVENT;
  }


  /* ======================================================================
     Derived statistics
     ====================================================================== */

  function computeStats(data) {
    const { participants, competitions } = data;
    const real = competitions.filter((c) => !c.isCovid && c.participantCount > 0);
    const byYearAsc = [...real].sort((a, b) => a.year - b.year);

    const per = {};
    participants.forEach((p) => {
      per[p.id] = {
        participant: p,
        starts: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        lasts: 0,
        positions: [],
        yearPositions: {},
        hostCount: 0
      };
    });

    byYearAsc.forEach((comp) => {
      const positions = Object.values(comp.scores);
      const worst = positions.length ? Math.max(...positions) : null;
      participants.forEach((p) => {
        const pos = comp.scores[p.id];
        if (pos == null) return;
        const s = per[p.id];
        s.starts++;
        s.positions.push(pos);
        s.yearPositions[comp.year] = pos;
        if (pos === 1) s.gold++;
        else if (pos === 2) s.silver++;
        else if (pos === 3) s.bronze++;
        if (worst != null && positions.length > 2 && pos === worst) s.lasts++;
      });

      [comp.arranger3rd, comp.arrangerSecondLast].forEach((host) => {
        const hostName = (host || '').trim();
        if (!hostName) return;
        const p = participants.find((x) => x.name === hostName);
        if (p) per[p.id].hostCount++;
      });
    });

    Object.values(per).forEach((s) => {
      s.total = s.gold + s.silver + s.bronze;
      s.avg = s.positions.length
        ? s.positions.reduce((a, b) => a + b, 0) / s.positions.length
        : null;
      s.best = s.positions.length ? Math.min(...s.positions) : null;
    });

    const medalRank = Object.values(per)
      .filter((s) => s.starts > 0)
      .sort(
        (a, b) =>
          b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.avg - b.avg
      );

    const latest = byYearAsc[byYearAsc.length - 1] || null;
    const champion = latest && latest.winner ? latest.winner : null;

    return { per, medalRank, real, byYearAsc, latest, champion };
  }

  /**
   * Elo ratings across every edition.
   *
   * Each competition is scored as a round-robin: every pair of starters is one
   * matchup, won by whoever placed higher. Each pair is worth K/(n-1) so a
   * 12-player year can't swing ratings more than a 3-player year.
   */
  function computeElo(data, stats) {
    // High for Elo, deliberately: with only ~14 editions a chess-sized K
    // leaves everyone bunched within a few points of 1500.
    const K = 90;
    const START = 1500;
    const ratings = {};
    const history = {};
    const played = {};
    data.participants.forEach((p) => {
      ratings[p.id] = START;
      history[p.id] = {};
      played[p.id] = 0;
    });

    const years = [];
    stats.byYearAsc.forEach((comp) => {
      const ids = Object.keys(comp.scores);
      if (ids.length < 2) return;
      years.push(comp.year);

      const delta = {};
      ids.forEach((id) => (delta[id] = 0));
      const k = K / (ids.length - 1);

      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = ids[i];
          const b = ids[j];
          const expA = 1 / (1 + 10 ** ((ratings[b] - ratings[a]) / 400));
          // Lower placement number wins; ties share the point
          const posA = comp.scores[a];
          const posB = comp.scores[b];
          const scoreA = posA === posB ? 0.5 : posA < posB ? 1 : 0;
          delta[a] += k * (scoreA - expA);
          delta[b] += k * (1 - scoreA - (1 - expA));
        }
      }

      ids.forEach((id) => {
        ratings[id] += delta[id];
        played[id]++;
      });
      // Snapshot every rated player so the chart draws continuous lines
      data.participants.forEach((p) => {
        if (played[p.id] > 0) history[p.id][comp.year] = Math.round(ratings[p.id]);
      });
    });

    const current = data.participants
      .filter((p) => played[p.id] > 0)
      .map((p) => {
        const yearsPlayed = Object.keys(history[p.id]).map(Number).sort((a, b) => a - b);
        const last = yearsPlayed[yearsPlayed.length - 1];
        const prev = yearsPlayed[yearsPlayed.length - 2];
        return {
          participant: p,
          rating: Math.round(ratings[p.id]),
          peak: Math.max(...Object.values(history[p.id])),
          change: prev != null ? history[p.id][last] - history[p.id][prev] : 0,
          starts: played[p.id]
        };
      })
      .sort((a, b) => b.rating - a.rating);

    return { current, history, years };
  }

  /**
   * Head-to-head record between two participants across every year both started.
   */
  function headToHead(idA, idB) {
    const meetings = [];
    let winsA = 0;
    let winsB = 0;
    App.stats.byYearAsc.forEach((comp) => {
      const posA = comp.scores[idA];
      const posB = comp.scores[idB];
      if (posA == null || posB == null) return;
      if (posA < posB) winsA++;
      else if (posB < posA) winsB++;
      meetings.push({ year: comp.year, name: comp.name.trim(), posA, posB });
    });
    return { meetings, winsA, winsB };
  }

  /**
   * Every opponent record for one participant, best record first.
   */
  function rivalRecords(id) {
    return App.data.participants
      .filter((p) => p.id !== id)
      .map((p) => {
        const r = headToHead(id, p.id);
        return { opponent: p, ...r, total: r.meetings.length };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.winsA - b.winsB - (a.winsA - a.winsB) || b.total - a.total);
  }

  function computeFacts(data, stats) {
    const facts = [];
    const rows = Object.values(stats.per).filter((s) => s.starts > 0);
    const by = (key, dir = 1) =>
      [...rows].sort((a, b) => (b[key] - a[key]) * dir)[0];

    const maxGold = Math.max(...rows.map((s) => s.gold));
    if (maxGold > 0) {
      const leaders = rows.filter((s) => s.gold === maxGold).map((s) => s.participant.name);
      facts.push(
        leaders.length > 1
          ? `${leaders.join(' och ')} delar rekordet med ${maxGold} segrar var.`
          : `${leaders[0]} har flest segrar — ${maxGold} stycken. Dominans.`
      );
    }

    const iron = by('starts');
    if (iron)
      facts.push(`${iron.participant.name} är järnmannen med ${iron.starts} starter av ${stats.real.length} möjliga.`);

    const eligible = rows.filter((s) => s.starts >= 5);
    if (eligible.length) {
      const bestAvg = [...eligible].sort((a, b) => a.avg - b.avg)[0];
      facts.push(`Bäst snittplacering (minst 5 starter): ${bestAvg.participant.name} med ${bestAvg.avg.toFixed(1)}.`);
    }

    const lasts = by('lasts');
    if (lasts && lasts.lasts > 1)
      facts.push(`${lasts.participant.name} har flest sistaplatser — ${lasts.lasts} stycken. Någon måste ta dem.`);

    const host = by('hostCount');
    if (host && host.hostCount > 0)
      facts.push(`Värdmästaren ${host.participant.name} har arrangerat ${host.hostCount} gånger.`);

    let bestClimb = null;
    rows.forEach((s) => {
      const years = Object.keys(s.yearPositions).map(Number).sort((a, b) => a - b);
      for (let i = 1; i < years.length; i++) {
        const diff = s.yearPositions[years[i - 1]] - s.yearPositions[years[i]];
        if (!bestClimb || diff > bestClimb.diff) {
          bestClimb = { name: s.participant.name, diff, from: s.yearPositions[years[i - 1]], to: s.yearPositions[years[i]], year: years[i] };
        }
      }
    });
    if (bestClimb && bestClimb.diff > 3)
      facts.push(`Största klättringen: ${bestClimb.name} gick från plats ${bestClimb.from} till ${bestClimb.to} år ${bestClimb.year}.`);

    const silverNoGold = rows.filter((s) => s.gold === 0 && s.silver > 0).sort((a, b) => b.silver - a.silver)[0];
    if (silverNoGold)
      facts.push(`${silverNoGold.participant.name} har ${silverNoGold.silver} silver — men guldet väntar fortfarande.`);

    const locations = new Set(stats.real.map((c) => c.location).filter(Boolean));
    facts.push(`Pokalen har avgjorts på ${locations.size} olika platser — från Höga kusten till Mälardalen.`);

    return facts;
  }


  const LOCATION_COORDS = {
    Varggropen: [63.2968, 18.7424],
    Kroksta: [63.3179, 18.6751],
    Billsta: [63.326, 18.5128],
    Idbyn: [63.2423, 18.675],
    Lomsjön: [63.3338, 18.6647],
    Kungsholmen: [59.3359, 18.0123],
    Bredbyn: [63.4447, 18.1064],
    Ås: [63.2963, 18.6995],
    Arnäsvall: [63.322, 18.816],
    Stockholm: [59.3556, 18.0993],
    Själevad: [63.2888, 18.5974],
    'Eskilstuna/Västerås': [59.6008, 16.5992],
    Uppsala: [59.8586, 17.6389],
    Barcelona: [41.3874, 2.1686],
    'Barcelona, Spanien': [41.3874, 2.1686]
  };

  /* ======================================================================
     Theme
     ====================================================================== */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function toggleTheme() {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('pp-theme', next);
    } catch (e) { /* privat läge */ }
    syncThemeChrome();
    applyChartTheme();
    rebuildCharts();
    updateMapTiles();
    if (App.trophy) App.trophy.setTheme(next);
  }

  /** Webbläsarens färg och knappens etikett följer temat. */
  function syncThemeChrome() {
    const t = currentTheme();
    $$('meta[name="theme-color"]').forEach((m) =>
      m.setAttribute('content', t === 'dark' ? '#0b0c0f' : '#f4efe5')
    );
    const btn = $('#theme-toggle');
    if (btn) btn.setAttribute('aria-label', t === 'dark' ? 'Byt till ljust tema' : 'Byt till mörkt tema');
  }

  /* ======================================================================
     Charts
     ====================================================================== */

  function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Schibsted Grotesk', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('--chart-tick');
    Chart.defaults.borderColor = cssVar('--chart-grid');
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.legend.labels.padding = 14;
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--surface-solid');
    Chart.defaults.plugins.tooltip.titleColor = cssVar('--text-1');
    Chart.defaults.plugins.tooltip.titleFont = { family: "'Fraunces', Georgia, serif", size: 14, weight: '600' };
    Chart.defaults.plugins.tooltip.bodyColor = cssVar('--text-2');
    Chart.defaults.plugins.tooltip.borderColor = cssVar('--border-strong');
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 12;
    Chart.defaults.plugins.tooltip.padding = 12;
    Chart.defaults.plugins.tooltip.displayColors = false;
    Chart.defaults.animation.duration = prefersReducedMotion() ? 0 : 900;
    Chart.defaults.animation.easing = 'easeOutQuart';
  }

  function registerChart(id, builder) {
    App.chartBuilders[id] = builder;
    buildChart(id);
  }

  function buildChart(id) {
    if (typeof Chart === 'undefined') return;
    const canvas = document.getElementById(id);
    if (!canvas) return;
    if (App.charts[id]) {
      App.charts[id].destroy();
      delete App.charts[id];
    }
    const cfg = App.chartBuilders[id](canvas);
    if (cfg) App.charts[id] = new Chart(canvas, cfg);
  }

  function rebuildCharts() {
    Object.keys(App.chartBuilders).forEach(buildChart);
  }

  function goldGradient(canvas, horizontal) {
    const ctx = canvas.getContext('2d');
    const g = horizontal
      ? ctx.createLinearGradient(0, 0, canvas.clientWidth || 400, 0)
      : ctx.createLinearGradient(0, canvas.clientHeight || 300, 0, 0);
    g.addColorStop(0, cssVar('--gold-deep'));
    g.addColorStop(0.7, cssVar('--gold'));
    g.addColorStop(1, cssVar('--gold-hi'));
    return g;
  }

  /* ======================================================================
     Rendering — Översikt
     ====================================================================== */

  const ICONS = {
    trophy: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4a2 2 0 0 0 2 4h1M17 6h3a2 2 0 0 1-2 4h-1"/></svg>',
    users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    crown: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11H2Z"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1L12 2Z"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>'
  };

  function renderHero() {
    const { stats } = App;
    const champ = stats.champion;
    const { latest } = stats;

    const nameEl = $('#hero-champion');
    if (champ) {
      // Förnamnet i förgylld kursiv, efternamnet rakt och ljust under —
      // ett tidningsuppslag snarare än en etikett.
      const parts = champ.trim().split(/\s+/);
      const last = parts.length > 1 ? parts.pop() : '';
      nameEl.innerHTML = `<span class="first">${esc(parts.join(' '))}</span>${
        last ? `<span class="last">${esc(last)}</span>` : ''
      }`;
      nameEl.setAttribute('aria-label', champ);
    } else {
      nameEl.textContent = 'Okänd';
    }
    $('#hero-year').textContent = latest ? latest.year : '';

    const p = champ ? App.data.participants.find((x) => x.name === champ) : null;
    const s = p ? stats.per[p.id] : null;

    if (latest) {
      const nth = s && ORDINALS[s.gold] ? ` — ${ORDINALS[s.gold]} segern` : '';
      $('#hero-champion-meta').innerHTML = `Vann <strong>${esc(latest.name.trim())}</strong>${
        latest.location ? ` i ${esc(latest.location)}` : ''
      } ${latest.year}${nth}.`;
    }

    if (s) {
      const item = (disc, num, label) => `
        <li class="cm-item">
          <span class="medal-disc ${disc}" aria-hidden="true">${disc ? '' : '⌀'}</span>
          <span><span class="cm-num">${num}</span><span class="cm-label">${label}</span></span>
        </li>`;
      $('#hero-champion-medals').innerHTML =
        item('gold', s.gold, 'Guld') +
        item('silver', s.silver, 'Silver') +
        item('bronze', s.bronze, 'Brons') +
        item('', s.avg.toFixed(1), 'Snitt');
    }

    // Spela-knappen pekar på årets spel om det finns, annars på arkaden
    const latestGame = latest && GAMES.find((g) => g.year === latest.year);
    const play = $('#hero-play');
    if (play) {
      play.setAttribute('href', latestGame ? gameRoute(latestGame.year) : '#/spel');
      play.textContent = latestGame ? `Spela ${latestGame.title.replace(/^Pekkas\s+/, '')}` : 'Till arkaden';
    }
  }

  /**
   * Höjdkurvor bakom pokalen: förvrängda koncentriska ringar runt en topp,
   * som en karta över ett berg vid Höga kusten — dit koordinaterna i loggan
   * pekar.
   */
  function renderHeroContours() {
    const svg = $('#hero-contours');
    if (!svg) return;
    const cx = 430;
    const cy = 400;
    let paths = '';
    for (let k = 1; k <= 20; k++) {
      const r = k * 22;
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        const wob =
          1 +
          0.1 * Math.sin(3 * a + k * 0.32) +
          0.05 * Math.sin(5 * a - k * 0.55) +
          0.025 * Math.sin(11 * a + k * 1.3);
        const x = cx + Math.cos(a) * r * wob * 1.18;
        const y = cy + Math.sin(a) * r * wob;
        d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      }
      paths += `<path d="${d}Z" opacity="${(1 - k / 24).toFixed(2)}"/>`;
    }
    svg.innerHTML = paths;
  }

  /**
   * Pokalen i 3D. Den är dekor, inte innehåll: den laddas när sidan är
   * färdig, hoppas över på sparsamma anslutningar och ersätter en SVG-pokal
   * som redan står på plats — så inget hoppar och inget saknas utan WebGL.
   */
  function initTrophy() {
    const canvas = $('#trophy-canvas');
    const stage = $('#hero-stage');
    if (!canvas || !stage || App.trophy || App.trophyLoading) return;
    const conn = navigator.connection;
    if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;

    App.trophyLoading = true;
    const winners = App.stats.byYearAsc
      .filter((c) => c.winner)
      .map((c) => ({ year: c.year, name: c.winner }));

    const load = () =>
      import(new URL('src/scripts/trophy.js', document.baseURI).href)
        .then((mod) => mod.mountTrophy(canvas, { winners, reducedMotion: prefersReducedMotion() }))
        .then((trophy) => {
          App.trophy = trophy;
          trophy.setTheme(currentTheme());
          stage.classList.add('is-3d');
          if (App.game) trophy.pause();
        })
        .catch((err) => console.warn('Pokalen i 3D kunde inte laddas:', err))
        .finally(() => {
          App.trophyLoading = false;
        });

    if ('requestIdleCallback' in window) window.requestIdleCallback(load, { timeout: 1500 });
    else setTimeout(load, 400);
  }

  function nextEventDate(stats) {
    const now = new Date();
    const { event } = App;
    const resultYears = new Set(stats.real.map((c) => c.year));

    // A confirmed event is shown from announcement until 24h after start —
    // but the moment its result is in the data the competition is decided,
    // so the card moves on to the next forecast instead of claiming that it
    // is still running next to the champion card that says who won it.
    if (event && event.date) {
      const d = new Date(event.date);
      if (
        !isNaN(d.getTime()) &&
        now - d < 24 * 3600 * 1000 &&
        !resultYears.has(d.getFullYear())
      ) {
        return {
          date: d,
          confirmed: true,
          comp: null,
          name: event.name || '',
          note: event.note || '',
          location: event.location || '',
          hosts: (event.hosts || []).join(' & ')
        };
      }
    }

    const dated = stats.byYearAsc.filter((c) => c.date);
    const last = dated[dated.length - 1];
    const year = now.getFullYear();
    if (last && last.date >= now) return { date: last.date, confirmed: true, comp: last };

    // Forecast: the tradition is a Saturday near mid-August — in the first
    // year that has neither happened nor already has a result in the data.
    const saturdayMidAugust = (y) => {
      const mid = new Date(y, 7, 15, 10, 0, 0);
      let diff = (6 - mid.getDay()) % 7;
      if (diff > 3) diff -= 7;
      return new Date(y, 7, 15 + diff, 10, 0, 0);
    };
    let target = saturdayMidAugust(year);
    if (target < now || resultYears.has(target.getFullYear())) {
      target = saturdayMidAugust(year + 1);
    }
    return { date: target, confirmed: false, comp: null, traditionHosts: traditionHosts(stats) };
  }

  /**
   * Who arranges next year, by the tradition: this year's third place
   * together with the second-to-last finisher.
   */
  function traditionHosts(stats) {
    const { latest, per } = stats;
    if (!latest) return '';
    const entries = Object.entries(latest.scores).sort((a, b) => a[1] - b[1]);
    if (entries.length < 4) return '';
    const nameOf = (id) => (per[id] ? per[id].participant.name : '');
    const third = entries.find(([, pos]) => pos === 3);
    const secondLast = entries[entries.length - 2];
    return [third && nameOf(third[0]), secondLast && nameOf(secondLast[0])]
      .filter(Boolean)
      .join(' & ');
  }

  function renderCountdown() {
    const next = nextEventDate(App.stats);
    const tag = $('#countdown-tag');

    const hosts = next.hosts || next.traditionHosts || '';

    const dateStr = next.date.toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const timeStr = next.date.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
    const where = next.location ? ` · ${next.location}` : '';
    const baseNote = `${dateStr} kl ${timeStr}${where}${
      hosts ? ` — arrangeras${next.confirmed ? '' : ' enligt traditionen'} av ${hosts}.` : ''
    }`;

    const nums = [$('#cd-days'), $('#cd-hours'), $('#cd-mins')];
    const labels = $$('#countdown .count-label');
    const setSegs = (values, labelTexts) => {
      values.forEach((v, i) => (nums[i].textContent = v));
      labelTexts.forEach((t, i) => (labels[i] && (labels[i].textContent = t)));
    };

    const tick = () => {
      const now = new Date();
      const ms = next.date - now;

      if (ms <= 0) {
        // Event has started
        tag.textContent = 'pågår';
        setSegs(['🏆', '🏆', '🏆'], ['', '', '']);
        $('#countdown-note').textContent = next.location
          ? `Tävlingen pågår just nu i ${next.location}!`
          : 'Tävlingen pågår just nu!';
        return;
      }

      const isToday = next.date.toDateString() === now.toDateString();
      tag.textContent = next.confirmed ? (isToday ? 'idag!' : 'bekräftad') : 'prognos';
      $('#countdown-note').textContent = baseNote;

      if (ms < 86400000) {
        // Final day: hours / minutes / seconds
        const hours = Math.floor(ms / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        const secs = Math.floor((ms % 60000) / 1000);
        setSegs(
          [String(hours), String(mins).padStart(2, '0'), String(secs).padStart(2, '0')],
          ['tim', 'min', 'sek']
        );
      } else {
        const days = Math.floor(ms / 86400000);
        const hours = Math.floor((ms % 86400000) / 3600000);
        const mins = Math.floor((ms % 3600000) / 60000);
        setSegs(
          [String(days), String(hours).padStart(2, '0'), String(mins).padStart(2, '0')],
          ['dagar', 'tim', 'min']
        );
      }
    };
    tick();
    if (App.countdownTimer) clearInterval(App.countdownTimer);
    App.countdownTimer = setInterval(tick, 1000);
  }

  function renderTicker() {
    const el = $('#fact-ticker');
    const dots = $('#ticker-dots');
    if (!App.facts.length) return;

    const n = App.facts.length;
    dots.innerHTML = App.facts
      .map((_, i) => `<button type="button" aria-label="Fakta ${i + 1} av ${n}"></button>`)
      .join('');

    const show = (i, instant) => {
      App.tickerIndex = (i + n) % n;
      const apply = () => {
        el.textContent = App.facts[App.tickerIndex];
        el.classList.remove('swap');
        $$('#ticker-dots button').forEach((d, di) => {
          d.classList.toggle('on', di === App.tickerIndex);
          d.setAttribute('aria-pressed', String(di === App.tickerIndex));
        });
      };
      if (instant) apply();
      else {
        el.classList.add('swap');
        setTimeout(apply, 240);
      }
    };

    const restart = () => {
      clearInterval(App.tickerTimer);
      if (prefersReducedMotion()) return;
      App.tickerTimer = setInterval(() => {
        if (App.tickerPaused || document.hidden || App.currentView !== 'overview') return;
        el.setAttribute('aria-live', 'off');
        show(App.tickerIndex + 1);
      }, 7000);
    };
    // Automatisk rotation läses inte upp — bara när man själv bläddrar.
    const manual = (i) => {
      el.setAttribute('aria-live', 'polite');
      show(i);
      restart();
    };

    dots.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) manual(Array.from(dots.children).indexOf(b));
    });
    $('#ticker-prev').addEventListener('click', () => manual(App.tickerIndex - 1));
    $('#ticker-next').addEventListener('click', () => manual(App.tickerIndex + 1));

    // Pausa medan någon läser eller har fokus i kortet
    const card = el.closest('.ticker-card');
    card.addEventListener('mouseenter', () => (App.tickerPaused = true));
    card.addEventListener('mouseleave', () => (App.tickerPaused = false));
    card.addEventListener('focusin', () => (App.tickerPaused = true));
    card.addEventListener('focusout', () => (App.tickerPaused = false));

    el.setAttribute('aria-live', 'off');
    show(0, true);
    restart();
  }

  function animateCounter(el, target, suffix) {
    if (prefersReducedMotion()) {
      el.textContent = formatNumber(target) + (suffix || '');
      return;
    }
    const dur = 1200;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = formatNumber(Math.round(target * eased)) + (suffix || '');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderKPIs() {
    const { stats, data } = App;
    const winsLeader = stats.medalRank[0];
    const hostLeader = [...Object.values(stats.per)].sort((a, b) => b.hostCount - a.hostCount)[0];
    const locations = new Set(stats.real.map((c) => c.location).filter(Boolean));
    const years = stats.byYearAsc.length
      ? `${stats.byYearAsc[0].year}–${stats.byYearAsc[stats.byYearAsc.length - 1].year}`
      : '';

    const kpis = [
      { icon: ICONS.trophy, value: stats.real.length, label: 'Tävlingar', sub: years, count: true },
      { icon: ICONS.users, value: data.participants.length, label: 'Deltagare', sub: 'genom åren', count: true },
      {
        icon: ICONS.crown,
        value: winsLeader ? shortName(winsLeader.participant.name) : '—',
        label: 'Flest segrar',
        sub: (() => {
          if (!winsLeader) return '';
          const tied = stats.medalRank.filter((s) => s.gold === winsLeader.gold && s !== winsLeader);
          return tied.length
            ? `${winsLeader.gold} vinster · delas med ${tied.map((s) => shortName(s.participant.name)).join(', ')}`
            : `${winsLeader.gold} vinster`;
        })()
      },
      { icon: ICONS.star, value: stats.champion ? shortName(stats.champion) : '—', label: 'Regerande', sub: stats.latest ? `${stats.latest.name.trim()} ${stats.latest.year}` : '' },
      { icon: ICONS.home, value: hostLeader && hostLeader.hostCount ? shortName(hostLeader.participant.name) : '—', label: 'Värdmästare', sub: hostLeader ? `${hostLeader.hostCount} arrangemang` : '' },
      { icon: ICONS.pin, value: locations.size, label: 'Platser', sub: 'besökta', count: true }
    ];

    $('#kpi-grid').innerHTML = kpis
      .map(
        (k, i) => `
        <div class="kpi stagger" role="listitem" style="--stagger-i:${i}">
          <span class="kpi-value${k.count ? '' : ' is-name'}" data-count="${k.count ? k.value : ''}">${k.count ? '0' : esc(k.value)}</span>
          <span class="kpi-label">${esc(k.label)}</span>
          ${k.sub ? `<span class="kpi-sub">${esc(k.sub)}</span>` : ''}
        </div>`
      )
      .join('');

    $$('#kpi-grid .kpi-value[data-count]').forEach((el) => {
      const v = parseInt(el.getAttribute('data-count'), 10);
      if (!isNaN(v)) animateCounter(el, v);
    });

    $('#year-range').textContent = `63.29°N 18.73°E · sedan ${stats.byYearAsc.length ? stats.byYearAsc[0].year : 2011}`;
    $('#footer-count').textContent = stats.real.length;
  }

  function renderOverviewCharts() {
    const { stats } = App;

    registerChart('wins-chart', (canvas) => {
      const winners = stats.medalRank.filter((s) => s.gold > 0);
      return {
        type: 'bar',
        data: {
          labels: winners.map((s) => shortName(s.participant.name)),
          datasets: [
            {
              data: winners.map((s) => s.gold),
              backgroundColor: goldGradient(canvas, true),
              borderRadius: 7,
              borderSkipped: false,
              maxBarThickness: 26
            }
          ]
        },
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (c) => ` ${c.parsed.x} ${c.parsed.x === 1 ? 'seger' : 'segrar'}`
              }
            }
          },
          scales: {
            x: { grid: { color: cssVar('--chart-grid') }, ticks: { precision: 0 } },
            y: { grid: { display: false }, ticks: { autoSkip: false } }
          }
        }
      };
    });

    registerChart('participation-chart', (canvas) => {
      const years = [];
      const minYear = App.stats.byYearAsc[0].year;
      const maxYear = App.stats.byYearAsc[App.stats.byYearAsc.length - 1].year;
      for (let y = minYear; y <= maxYear; y++) years.push(y);
      const counts = years.map((y) => {
        const comp = App.data.competitions.find((c) => c.year === y);
        return comp && !comp.isCovid && comp.participantCount > 0 ? comp.participantCount : null;
      });

      const ctx = canvas.getContext('2d');
      const fill = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 300);
      const accent2 = cssVar('--accent-2');
      fill.addColorStop(0, `${accent2}40`);
      fill.addColorStop(1, `${accent2}00`);

      return {
        type: 'line',
        data: {
          labels: years,
          datasets: [
            {
              data: counts,
              borderColor: accent2,
              backgroundColor: fill,
              fill: true,
              tension: 0.35,
              spanGaps: false,
              pointBackgroundColor: cssVar('--gold'),
              pointBorderColor: 'transparent',
              pointRadius: 4,
              pointHoverRadius: 6,
              borderWidth: 2.5
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items) => `År ${items[0].label}`,
                label: (c) => ` ${c.parsed.y} deltagare`
              }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: cssVar('--chart-grid') }, ticks: { precision: 0 } }
          }
        }
      };
    });
  }

  /* ======================================================================
     Map
     ====================================================================== */

  const TILE_URLS = {
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
  };

  function initMap() {
    if (typeof L === 'undefined' || App.map) return;
    const mapEl = document.getElementById('map');
    if (!mapEl) return;

    App.map = L.map('map', {
      center: [61.8, 17.4],
      zoom: 5,
      scrollWheelZoom: false,
      zoomControl: true
    });

    updateMapTiles();

    const pinIcon = L.divIcon({
      className: '',
      html: `<div class="map-pin"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Z"/></svg></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -26]
    });

    const nextIcon = L.divIcon({
      className: '',
      html: `<div class="map-pin map-pin-next"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/></svg></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -26]
    });

    const locations = {};
    App.stats.real.forEach((comp) => {
      const coords = LOCATION_COORDS[comp.location];
      if (!coords) return;
      if (!locations[comp.location]) locations[comp.location] = { coords, comps: [] };
      locations[comp.location].comps.push(comp);
    });

    Object.entries(locations).forEach(([name, loc]) => {
      const marker = L.marker(loc.coords, { icon: pinIcon }).addTo(App.map);
      const rows = loc.comps
        .sort((a, b) => a.year - b.year)
        .map(
          (c) =>
            `<div><strong>${c.year}</strong> · ${esc(c.name.trim())}${c.winner ? ` — 🏆 ${esc(shortName(c.winner))}` : ''}</div>`
        )
        .join('');
      marker.bindPopup(`<div class="pop-title">${esc(name)}</div>${rows}`);
      App.mapMarkers.push(marker);
    });

    // Pin for the confirmed upcoming event, if its location is known
    const { event } = App;
    if (event && event.location) {
      const coords = event.coords || LOCATION_COORDS[event.location];
      if (coords && !locations[event.location]) {
        const d = new Date(event.date);
        const marker = L.marker(coords, { icon: nextIcon }).addTo(App.map);
        const hosts = (event.hosts || []).join(' & ');
        marker.bindPopup(
          `<div class="pop-title">${esc(event.location)}</div>` +
            `<div><strong>${d.getFullYear()}</strong> · Nästa tävling${hosts ? ` — arrangeras av ${esc(hosts)}` : ''}</div>`
        );
        marker.getElement()?.classList.add('map-pin-next');
        App.mapMarkers.push(marker);
      }
    }

    $('#map-tour-btn').addEventListener('click', toggleMapTour);
  }

  function updateMapTiles() {
    if (!App.map) return;
    if (App.mapTiles) App.map.removeLayer(App.mapTiles);
    App.mapTiles = L.tileLayer(TILE_URLS[currentTheme()], {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(App.map);
  }

  function toggleMapTour() {
    const btn = $('#map-tour-btn');
    if (App.tourTimer) {
      clearInterval(App.tourTimer);
      App.tourTimer = null;
      btn.setAttribute('aria-pressed', 'false');
      btn.querySelector('span').textContent = 'Starta rundtur';
      App.map.closePopup();
      App.map.flyTo([61.8, 17.4], 5, { duration: 1.2 });
      return;
    }
    btn.setAttribute('aria-pressed', 'true');
    btn.querySelector('span').textContent = 'Stoppa';
    let i = 0;
    const visit = () => {
      const m = App.mapMarkers[i % App.mapMarkers.length];
      App.map.flyTo(m.getLatLng(), 11, { duration: 1.6 });
      setTimeout(() => m.openPopup(), 1400);
      i++;
    };
    visit();
    App.tourTimer = setInterval(visit, 4200);
  }

  /* ======================================================================
     Rendering — Medaljliga
     ====================================================================== */

  function renderMedals() {
    const rank = App.stats.medalRank;
    const top3 = rank.slice(0, 3);

    // Podium in visual order: 2nd, 1st, 3rd
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const places = [2, 1, 3];
    $('#podium').innerHTML = order
      .map((s, i) => {
        const place = places[i] || i + 1;
        return `
        <div class="podium-place podium-${place}">
          ${place === 1 ? `<svg class="podium-crown" viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true"><path d="m2 18 2-11 5 5 3-7 3 7 5-5 2 11H2Z"/></svg>` : ''}
          <button class="podium-avatar" type="button" data-person="${s.participant.id}" aria-label="Visa profil för ${esc(s.participant.name)}">${esc(initials(s.participant.name))}</button>
          <div>
            <div class="podium-name">${personLink(s.participant.name, s.participant.id)}</div>
            <div class="podium-medals">
              <span><span class="medal-dot gold" aria-hidden="true"></span>${s.gold}<span class="visually-hidden"> guld</span></span>
              <span><span class="medal-dot silver" aria-hidden="true"></span>${s.silver}<span class="visually-hidden"> silver</span></span>
              <span><span class="medal-dot bronze" aria-hidden="true"></span>${s.bronze}<span class="visually-hidden"> brons</span></span>
            </div>
          </div>
          <div class="podium-block" aria-hidden="true">${place}</div>
        </div>`;
      })
      .join('');

    renderMedalTable();
    initMedalSort();

    registerChart('medal-chart', () => {
      const withMedals = rank.filter((s) => s.total > 0);
      return {
        type: 'bar',
        data: {
          labels: withMedals.map((s) => shortName(s.participant.name)),
          datasets: [
            { label: 'Guld', data: withMedals.map((s) => s.gold), backgroundColor: cssVar('--gold'), borderRadius: 4, maxBarThickness: 22 },
            { label: 'Silver', data: withMedals.map((s) => s.silver), backgroundColor: cssVar('--silver'), borderRadius: 4, maxBarThickness: 22 },
            { label: 'Brons', data: withMedals.map((s) => s.bronze), backgroundColor: cssVar('--bronze'), borderRadius: 4, maxBarThickness: 22 }
          ]
        },
        options: {
          indexAxis: 'y',
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
          scales: {
            x: { stacked: true, grid: { color: cssVar('--chart-grid') }, ticks: { precision: 0 } },
            y: { stacked: true, grid: { display: false }, ticks: { autoSkip: false } }
          }
        }
      };
    });
  }

  const MEDAL_SORTERS = {
    rank: null, // Olympic order, as computed
    name: (a, b) => a.participant.name.localeCompare(b.participant.name, 'sv'),
    gold: (a, b) => b.gold - a.gold,
    silver: (a, b) => b.silver - a.silver,
    bronze: (a, b) => b.bronze - a.bronze,
    total: (a, b) => b.total - a.total
  };

  function renderMedalTable() {
    const base = App.stats.medalRank;
    const { key, dir } = App.medalSort;
    const olympicRank = new Map(base.map((s, i) => [s.participant.id, i + 1]));

    const rows = [...base];
    if (MEDAL_SORTERS[key]) {
      rows.sort((a, b) => MEDAL_SORTERS[key](a, b) * dir);
    } else if (dir === -1) {
      rows.reverse();
    }

    const maxTotal = Math.max(...base.map((s) => s.total), 1);
    $('#medal-table tbody').innerHTML = rows
      .map((s) => {
        const r = olympicRank.get(s.participant.id);
        const g = (s.gold / maxTotal) * 100;
        const sv = (s.silver / maxTotal) * 100;
        const b = (s.bronze / maxTotal) * 100;
        return `
        <tr>
          <td class="rank-col"><span class="rank-badge ${r <= 3 ? `r${r}` : ''}">${r}</span></td>
          <td><div class="person-cell">${avatarHTML(s.participant.name)}${personLink(s.participant.name, s.participant.id)}</div></td>
          <td class="num-col${s.gold ? '' : ' zero'}">${s.gold}</td>
          <td class="num-col${s.silver ? '' : ' zero'}">${s.silver}</td>
          <td class="num-col${s.bronze ? '' : ' zero'}">${s.bronze}</td>
          <td class="num-col total${s.total ? '' : ' zero'}">${s.total}</td>
          <td class="bar-col"><div class="medal-bar"><span class="g" style="width:${g}%"></span><span class="s" style="width:${sv}%"></span><span class="b" style="width:${b}%"></span></div></td>
        </tr>`;
      })
      .join('');

    $$('#medal-table thead th[data-sort]').forEach((th) => {
      const active = th.getAttribute('data-sort') === key;
      th.classList.toggle('sorted', active);
      th.setAttribute('aria-sort', active ? (dir === 1 ? 'descending' : 'ascending') : 'none');
      const arrow = th.querySelector('.sort-arrow');
      if (arrow) arrow.textContent = active ? (dir === 1 ? '↓' : '↑') : '';
    });
  }

  function initMedalSort() {
    $$('#medal-table thead th[data-sort]').forEach((th) => {
      if (th.dataset.bound) return;
      th.dataset.bound = '1';
      const sort = () => {
        const key = th.getAttribute('data-sort');
        if (App.medalSort.key === key) App.medalSort.dir *= -1;
        else App.medalSort = { key, dir: 1 };
        renderMedalTable();
      };
      th.addEventListener('click', sort);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          sort();
        }
      });
    });
  }

  /* ======================================================================
     Rendering — Historik
     ====================================================================== */

  function renderTimeline() {
    const comps = App.data.competitions; // already newest first
    const latestYear = App.stats.latest ? App.stats.latest.year : null;
    const gameYears = new Set(GAMES.map((g) => g.year));
    const first = App.stats.byYearAsc[0];
    if (first) {
      $('#history-sub').textContent = `${App.stats.real.length} upplagor sedan ${first.year} — gren, plats, pall och arrangörer.`;
    }
    const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    $('#timeline').innerHTML = comps
      .map((comp, idx) => {
        const delay = Math.min(idx, 10);
        if (comp.isCovid || comp.participantCount === 0) {
          return `
          <article class="tl-item covid stagger" style="--stagger-i:${delay}">
            <div class="tl-year-col"><span class="tl-year">${comp.year}</span></div>
            <div class="tl-card">
              <h3 class="tl-name">Inställd — pandemi</h3>
              <p class="tl-meta">Pokalen tog en paus, men traditionen överlevde.</p>
            </div>
          </article>`;
        }

        const podium = [1, 2, 3]
          .map((pos) => {
            const entry = Object.entries(comp.scores).find(([, v]) => v === pos);
            if (!entry) return '';
            const p = App.data.participants.find((x) => x.id === entry[0]);
            return `<li class="tl-medal"><span class="medal-disc ${medalClassFor(pos)}"><span class="visually-hidden">Plats </span>${pos}</span>${
              p ? personLink(p.name, p.id) : '?'
            }</li>`;
          })
          .join('');

        const hosts = [comp.arranger3rd, comp.arrangerSecondLast].filter(Boolean).join(' & ');

        return `
        <article class="tl-item ${comp.year === latestYear ? 'latest' : ''} stagger" style="--stagger-i:${delay}">
          <div class="tl-year-col">
            <button class="tl-year" type="button" data-year="${comp.year}" aria-label="Alla resultat från ${comp.year}">${comp.year}</button>
          </div>
          <div class="tl-card">
            <img class="tl-photo" data-photo-year="${comp.year}" alt="Foto från ${comp.year}" loading="lazy" hidden />
            <div class="tl-main">
              <h3 class="tl-name">${esc(comp.name.trim())}</h3>
              <p class="tl-meta">
                ${comp.location ? `<span class="tl-loc">${ICONS.pin} ${esc(comp.location)}</span>` : ''}
                <span>${comp.participantCount} deltagare</span>
                ${hosts ? `<span>Arrangörer: ${esc(hosts)}</span>` : ''}
                ${gameYears.has(comp.year) ? `<a class="tl-play" href="${gameRoute(comp.year)}">Spela årets spel</a>` : ''}
              </p>
            </div>
            <ol class="tl-podium" aria-label="Pallen ${comp.year}">${podium}</ol>
            <button class="tl-more" type="button" data-year="${comp.year}">Alla resultat ${arrow}</button>
          </div>
        </article>`;
      })
      .join('');

    loadTimelinePhotos();
  }

  /**
   * Photos are convention-based: drop <year>.jpg into public/photos/ and it
   * appears here — nothing to register. The build writes photos/index.json so
   * production needs one request; without it we fall back to probing.
   */
  async function loadTimelinePhotos() {
    try {
      const url = new URL('photos/index.json', document.baseURI).toString();
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          App.photos = {};
          list.forEach((p) => {
            App.photos[p.year] = `photos/${p.year}.${p.ext || 'jpg'}`;
          });
          Object.keys(App.photos).forEach((year) => showTimelinePhoto(year, App.photos[year]));
          return;
        }
      }
    } catch (e) {
      /* no manifest — probe instead */
    }

    $$('.tl-photo[data-photo-year]').forEach((img) => {
      const year = img.getAttribute('data-photo-year');
      probePhoto(year, (src) => showTimelinePhoto(year, src));
    });
  }

  function probePhoto(year, onFound) {
    const src = new URL(`photos/${year}.jpg`, document.baseURI).toString();
    const probe = new Image();
    probe.onload = () => onFound(src);
    probe.src = src;
  }

  function showTimelinePhoto(year, src) {
    const img = $(`.tl-photo[data-photo-year="${year}"]`);
    if (!img) return;
    img.src = new URL(src, document.baseURI).toString();
    img.hidden = false;
    const card = img.closest('.tl-card');
    if (card) card.classList.add('has-photo');
  }

  function photoFor(year) {
    if (App.photos && App.photos[year]) return App.photos[year];
    return null;
  }

  /* ======================================================================
     Rendering — Utmärkelser
     ====================================================================== */

  function computeAchievements() {
    const defs = (window.ACHIEVEMENT_DEFINITIONS || []).slice();
    const defById = {};
    defs.forEach((d) => (defById[d.id] = d));

    let byName = {};
    try {
      if (window.AchievementEngine) {
        const engine = new window.AchievementEngine();
        byName = engine.calculateAllAchievements(App.data.competitions, App.data.participants) || {};
      }
    } catch (e) {
      byName = {};
    }

    // Normalize: entries may be ids or objects
    Object.keys(byName).forEach((name) => {
      byName[name] = (byName[name] || [])
        .map((a) => (typeof a === 'string' ? a : a && a.id))
        .filter((id) => id && defById[id]);
    });

    App.achievements = { defs, defById, byName };
  }

  function renderAchievements() {
    const { defs, defById, byName } = App.achievements;
    const names = Object.keys(byName);

    const holdersByAch = {};
    defs.forEach((d) => (holdersByAch[d.id] = []));
    names.forEach((name) => {
      byName[name].forEach((id) => holdersByAch[id] && holdersByAch[id].push(name));
    });

    const unlockedCount = defs.filter((d) => holdersByAch[d.id].length > 0).length;
    const pct = defs.length ? Math.round((unlockedCount / defs.length) * 100) : 0;

    const pointsFor = (name) =>
      byName[name].reduce((sum, id) => sum + (defById[id].points || 0), 0);
    const leader = [...names].sort((a, b) => pointsFor(b) - pointsFor(a))[0];

    const summaryKpis = [
      { v: unlockedCount, l: 'Upplåsta' },
      { v: defs.length, l: 'Totalt' },
      { v: `${pct}%`, l: 'Genomfört' },
      { v: leader ? shortName(leader) : '—', l: 'Poängledare', name: true }
    ]
      .map(
        (k, i) => `
      <div class="kpi stagger" style="--stagger-i:${i}">
        <span class="kpi-value${k.name ? ' is-name' : ''}">${esc(String(k.v))}</span>
        <span class="kpi-label">${k.l}</span>
      </div>`
      )
      .join('');
    $('#ach-summary').innerHTML = `${summaryKpis}<div class="ach-progress" role="progressbar" aria-label="Andel upplåsta utmärkelser" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span style="width:${pct}%"></span></div>`;

    // Participant cards, sorted by points
    const sorted = [...names]
      .filter((n) => App.stats.per[(App.data.participants.find((p) => p.name === n) || {}).id]?.starts > 0)
      .sort((a, b) => pointsFor(b) - pointsFor(a));

    $('#participant-ach-grid').innerHTML = sorted
      .map((name, i) => {
        const ids = byName[name];
        const pts = pointsFor(name);
        const badges = ids
          .map((id) => {
            const d = defById[id];
            return `<span class="badge rarity-${esc(d.rarity)}" title="${esc(d.name)} — ${esc(d.desc)}" tabindex="0" role="img" aria-label="${esc(d.name)}">${d.icon}</span>`;
          })
          .join('');
        return `
        <div class="card pcard stagger" style="--stagger-i:${Math.min(i, 8)}">
          <div class="pcard-top">
            ${avatarHTML(name)}
            <div>
              <div class="pcard-name">${
  (App.data.participants.find((p) => p.name === name) || {}).id
    ? personLink(name, App.data.participants.find((p) => p.name === name).id)
    : esc(name)
  }</div>
              <div class="pcard-sub">${ids.length} utmärkelser</div>
            </div>
            <div class="pcard-points"><div class="val">${pts}</div><div class="lbl">poäng</div></div>
          </div>
          <div class="pcard-badges">${badges || '<span class="pcard-empty">Inga utmärkelser ännu — men året är ungt.</span>'}</div>
        </div>`;
      })
      .join('');

    // Category chips
    const catLabels = {
      all: 'Alla',
      medals: 'Medaljer',
      streaks: 'Sviter',
      special: 'Speciella',
      fun: 'Roliga',
      legendary: 'Legendariska',
      mythic: 'Mytiska'
    };
    const cats = ['all', ...new Set(defs.map((d) => d.category))];
    const countIn = (c) => defs.filter((d) => c === 'all' || d.category === c).length;
    $('#ach-category-filters').innerHTML = cats
      .map(
        (c) =>
          `<button type="button" class="chip ${c === App.achCategory ? 'active' : ''}" data-cat="${esc(c)}" aria-pressed="${c === App.achCategory}">${esc(catLabels[c] || c)} <span class="count">${countIn(c)}</span></button>`
      )
      .join('');

    $$('#ach-category-filters .chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        App.achCategory = chip.getAttribute('data-cat');
        renderAchievementGrid(holdersByAch);
        $$('#ach-category-filters .chip').forEach((c) => {
          c.classList.toggle('active', c === chip);
          c.setAttribute('aria-pressed', String(c === chip));
        });
      })
    );

    renderAchievementGrid(holdersByAch);
  }

  function renderAchievementGrid(holdersByAch) {
    const { defs } = App.achievements;
    const rarityOrder = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
    const rarityLabels = {
      mythic: 'Mytisk',
      legendary: 'Legendarisk',
      epic: 'Episk',
      rare: 'Sällsynt',
      common: 'Vanlig'
    };
    const list = defs
      .filter((d) => App.achCategory === 'all' || d.category === App.achCategory)
      .sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);

    const card = (d, i) => {
      const holders = holdersByAch[d.id];
      const unlocked = holders.length > 0;
      const holderText = unlocked
        ? `<strong>${holders.map(shortName).map(esc).join(', ')}</strong>`
        : 'Ingen har låst upp denna än';
      return `
        <div class="ach-card rarity-${esc(d.rarity)} ${unlocked ? '' : 'locked'} stagger" style="--stagger-i:${Math.min(i % 12, 11)}">
          <span class="ach-icon" aria-hidden="true">${unlocked ? d.icon : '🔒'}</span>
          <div class="ach-body">
            <div class="ach-name">${esc(d.name)}</div>
            <div class="ach-desc">${esc(d.desc)}</div>
            <div class="ach-holders">${holderText}</div>
          </div>
          <span class="ach-rarity">${esc(rarityLabels[d.rarity] || d.rarity)}</span>
        </div>`;
    };

    // Upplåsta först och synliga; de låsta ligger bakom en utfällbar rad så
    // galleriet inte drunknar i hänglås.
    const unlocked = list.filter((d) => holdersByAch[d.id].length > 0);
    const locked = list.filter((d) => holdersByAch[d.id].length === 0);

    $('#ach-grid').innerHTML = unlocked.length
      ? unlocked.map(card).join('')
      : '<p class="h2h-empty">Ingen har låst upp någon utmärkelse i den här kategorin än.</p>';
    $('#ach-locked-grid').innerHTML = locked.map(card).join('');
    $('#ach-locked').hidden = locked.length === 0;
    $('#ach-locked-label').textContent = `Ännu inte upplåsta (${locked.length})`;
    $('#ach-count').textContent = `${unlocked.length} av ${list.length} upplåsta`;
  }

  /* ======================================================================
     Rendering — Statistik
     ====================================================================== */

  function activeParticipants() {
    return App.data.participants.filter(
      (p) => App.filters.participants.size === 0 || App.filters.participants.has(p.id)
    );
  }

  function activeYears() {
    const all = App.stats.byYearAsc.map((c) => c.year);
    return all.filter((y) => App.filters.years.size === 0 || App.filters.years.has(y));
  }

  function renderFilters() {
    const parts = App.data.participants.filter((p) => App.stats.per[p.id].starts > 0);
    $('#filter-participants').innerHTML =
      `<button class="chip active" data-p="all">Alla</button>${
        parts
          .map((p) => `<button class="chip" data-p="${p.id}">${esc(shortName(p.name))}</button>`)
          .join('')}`;

    const years = App.stats.byYearAsc.map((c) => c.year);
    $('#filter-years').innerHTML =
      `<button class="chip active" data-y="all">Alla</button>${
        years.map((y) => `<button class="chip" data-y="${y}">${y}</button>`).join('')}`;

    $('#filter-participants').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const id = chip.getAttribute('data-p');
      if (id === 'all') App.filters.participants.clear();
      else {
        if (App.filters.participants.has(id)) App.filters.participants.delete(id);
        else App.filters.participants.add(id);
      }
      syncFilterChips();
      renderStatsView();
    });

    $('#filter-years').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const y = chip.getAttribute('data-y');
      if (y === 'all') App.filters.years.clear();
      else {
        const yr = parseInt(y, 10);
        if (App.filters.years.has(yr)) App.filters.years.delete(yr);
        else App.filters.years.add(yr);
      }
      syncFilterChips();
      renderStatsView();
    });

    $('#filter-reset').addEventListener('click', () => {
      App.filters.participants.clear();
      App.filters.years.clear();
      syncFilterChips();
      renderStatsView();
    });

    syncFilterChips();
  }

  function syncFilterChips() {
    $$('#filter-participants .chip').forEach((chip) => {
      const id = chip.getAttribute('data-p');
      chip.classList.toggle(
        'active',
        id === 'all' ? App.filters.participants.size === 0 : App.filters.participants.has(id)
      );
    });
    $$('#filter-years .chip').forEach((chip) => {
      const y = chip.getAttribute('data-y');
      chip.classList.toggle(
        'active',
        y === 'all' ? App.filters.years.size === 0 : App.filters.years.has(parseInt(y, 10))
      );
    });
  }

  function sparklineSVG(points, maxPos) {
    if (points.length < 2) return '<svg class="sparkline"></svg>';
    const w = 200;
    const h = 36;
    const pad = 4;
    const xs = (i) => pad + (i / (points.length - 1)) * (w - pad * 2);
    const ys = (v) => pad + ((v - 1) / Math.max(maxPos - 1, 1)) * (h - pad * 2);
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p).toFixed(1)}`).join('');
    const area = `${line}L${xs(points.length - 1).toFixed(1)},${h - 1}L${xs(0).toFixed(1)},${h - 1}Z`;
    const dots = points
      .map((p, i) => (p === 1 ? `<circle cx="${xs(i).toFixed(1)}" cy="${ys(p).toFixed(1)}" r="3"/>` : ''))
      .join('');
    return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}</svg>`;
  }

  function renderStatsView() {
    const years = activeYears();
    const parts = activeParticipants().filter((p) => {
      const s = App.stats.per[p.id];
      return years.some((y) => s.yearPositions[y] != null);
    });

    // Competitor cards
    $('#competitor-grid').innerHTML = parts
      .map((p, i) => {
        const s = App.stats.per[p.id];
        const positions = years.map((y) => s.yearPositions[y]).filter((v) => v != null);
        const avg = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;
        const best = positions.length ? Math.min(...positions) : null;
        const golds = years.filter((y) => s.yearPositions[y] === 1).length;
        const maxPos = Math.max(...App.stats.real.map((c) => c.participantCount), 4);
        const seq = years.map((y) => s.yearPositions[y]).filter((v) => v != null);
        return `
        <div class="card ccard stagger" style="--stagger-i:${Math.min(i, 8)}">
          <div class="ccard-top">
            ${avatarHTML(p.name)}
            <div>
              <div class="ccard-name">${personLink(p.name, p.id)}</div>
              <div class="ccard-medals">${golds} guld · ${positions.length} starter i urvalet</div>
            </div>
          </div>
          ${sparklineSVG(seq, maxPos)}
          <div class="ccard-stats">
            <div class="ccard-stat"><div class="val">${avg != null ? avg.toFixed(1) : '—'}</div><div class="lbl">Snitt</div></div>
            <div class="ccard-stat"><div class="val">${best != null ? best : '—'}</div><div class="lbl">Bäst</div></div>
            <div class="ccard-stat"><div class="val">${positions.length}</div><div class="lbl">Starter</div></div>
          </div>
        </div>`;
      })
      .join('');

    // Trend chart
    registerChart('trend-chart', () => {
      const maxPos = Math.max(
        ...App.stats.real
          .filter((c) => years.includes(c.year))
          .map((c) => Math.max(...Object.values(c.scores), 0)),
        4
      );
      return {
        type: 'line',
        data: {
          labels: years,
          datasets: parts.map((p, i) => {
            const s = App.stats.per[p.id];
            return {
              label: shortName(p.name),
              data: years.map((y) => (s.yearPositions[y] != null ? s.yearPositions[y] : null)),
              borderColor: PALETTE[i % PALETTE.length],
              backgroundColor: PALETTE[i % PALETTE.length],
              tension: 0.3,
              spanGaps: true,
              pointRadius: 3,
              pointHoverRadius: 6,
              borderWidth: 2
            };
          })
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              displayColors: true,
              callbacks: { label: (c) => ` ${c.dataset.label}: plats ${c.parsed.y}` }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              reverse: true,
              min: 1,
              suggestedMax: maxPos,
              grid: { color: cssVar('--chart-grid') },
              ticks: { precision: 0 }
            }
          }
        }
      };
    });

    // Average chart
    registerChart('avg-chart', (canvas) => {
      const rowsData = parts
        .map((p) => {
          const s = App.stats.per[p.id];
          const positions = years.map((y) => s.yearPositions[y]).filter((v) => v != null);
          return {
            name: shortName(p.name),
            avg: positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null
          };
        })
        .filter((r) => r.avg != null)
        .sort((a, b) => a.avg - b.avg);

      return {
        type: 'bar',
        data: {
          labels: rowsData.map((r) => r.name),
          datasets: [
            {
              data: rowsData.map((r) => +r.avg.toFixed(2)),
              backgroundColor: goldGradient(canvas, false),
              borderRadius: 7,
              borderSkipped: false,
              maxBarThickness: 34
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ` Snittplacering: ${c.parsed.y}` } }
          },
          scales: {
            x: { grid: { display: false } },
            y: { beginAtZero: true, grid: { color: cssVar('--chart-grid') } }
          }
        }
      };
    });

    renderHeatmap(parts, years);
  }

  function renderHeatmap(parts, years) {
    const worstByYear = {};
    App.stats.real.forEach((c) => {
      const v = Object.values(c.scores);
      worstByYear[c.year] = v.length ? Math.max(...v) : null;
    });

    const cellColor = (pos, year) => {
      if (pos <= 3) return '';
      const worst = worstByYear[year] || pos;
      const t = worst > 4 ? (pos - 4) / (worst - 4) : 0;
      const hue = 200 + 150 * Math.min(Math.max(t, 0), 1);
      return `style="background:hsl(${hue.toFixed(0)} 45% 55% / .2)"`;
    };

    const head =
      `<tr><th class="hm-name">Deltagare</th>${
        years.map((y) => `<th>${String(y).slice(2)}</th>`).join('')
      }</tr>`;

    const body = parts
      .map((p) => {
        const s = App.stats.per[p.id];
        const cells = years
          .map((y) => {
            const pos = s.yearPositions[y];
            if (pos == null) return '<td class="hm-cell empty">·</td>';
            const cls = pos <= 3 ? `pos-${pos}` : '';
            const comp = App.stats.real.find((c) => c.year === y);
            const title = `${p.name} — ${comp ? comp.name.trim() : y}: plats ${pos}`;
            return `<td class="hm-cell ${cls}" ${cellColor(pos, y)} title="${esc(title)}">${pos}</td>`;
          })
          .join('');
        return `<tr><th class="hm-name" title="${esc(p.name)}">${personLink(shortName(p.name), p.id)}</th>${cells}</tr>`;
      })
      .join('');

    $('#heatmap').innerHTML = `<table class="heatmap-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;

    $('#heatmap-legend').innerHTML = `
      <span class="item"><span class="swatch" style="background:linear-gradient(140deg,var(--gold),var(--gold-deep))"></span>Guld</span>
      <span class="item"><span class="swatch" style="background:linear-gradient(140deg,var(--silver),var(--silver-deep))"></span>Silver</span>
      <span class="item"><span class="swatch" style="background:linear-gradient(140deg,var(--bronze),var(--bronze-deep))"></span>Brons</span>
      <span class="item"><span class="swatch" style="background:linear-gradient(90deg,hsl(200 45% 55% / .35),hsl(350 45% 55% / .35))"></span>Mitten → sist</span>
      <span class="item">· = deltog ej</span>`;
  }

  /* ======================================================================
     Rendering — Duellen (head to head)
     ====================================================================== */

  function renderH2HControls() {
    const starters = App.data.participants.filter((p) => App.stats.per[p.id].starts > 0);
    if (starters.length < 2) return;

    // Default to the two most successful competitors
    const rank = App.stats.medalRank;
    App.h2h.a = rank[0] ? rank[0].participant.id : starters[0].id;
    App.h2h.b = rank[1] ? rank[1].participant.id : starters[1].id;

    const options = (selected) =>
      starters
        .map(
          (p) =>
            `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`
        )
        .join('');

    $('#h2h-a').innerHTML = options(App.h2h.a);
    $('#h2h-b').innerHTML = options(App.h2h.b);

    $('#h2h-a').addEventListener('change', (e) => {
      App.h2h.a = e.target.value;
      renderH2H();
    });
    $('#h2h-b').addEventListener('change', (e) => {
      App.h2h.b = e.target.value;
      renderH2H();
    });

    renderH2H();
  }

  function renderH2H() {
    const { a, b } = App.h2h;
    const pa = App.data.participants.find((p) => p.id === a);
    const pb = App.data.participants.find((p) => p.id === b);
    if (!pa || !pb) return;

    if (a === b) {
      $('#h2h-result').innerHTML =
        '<p class="h2h-empty">Välj två olika deltagare för att se duellen.</p>';
      return;
    }

    const { meetings, winsA, winsB } = headToHead(a, b);
    if (!meetings.length) {
      $('#h2h-result').innerHTML = `<p class="h2h-empty">${esc(shortName(pa.name))} och ${esc(
        shortName(pb.name)
      )} har aldrig ställt upp samma år.</p>`;
      return;
    }

    const total = winsA + winsB;
    const pctA = total ? (winsA / total) * 100 : 50;
    const leader = winsA > winsB ? pa : winsB > winsA ? pb : null;

    const rows = meetings
      .slice()
      .reverse()
      .map((m) => {
        const aWon = m.posA < m.posB;
        const tie = m.posA === m.posB;
        return `
        <li class="h2h-row">
          <span class="h2h-cell ${!tie && aWon ? 'win' : ''}">${m.posA}</span>
          <span class="h2h-year"><button class="h2h-year-btn" data-year="${m.year}">${m.year}</button><small>${esc(m.name)}</small></span>
          <span class="h2h-cell ${!tie && !aWon ? 'win' : ''}">${m.posB}</span>
        </li>`;
      })
      .join('');

    $('#h2h-result').innerHTML = `
      <div class="h2h-score">
        <div class="h2h-side">
          ${avatarHTML(pa.name)}
          <span class="h2h-num">${winsA}</span>
        </div>
        <div class="h2h-bar" role="img" aria-label="${winsA} mot ${winsB}">
          <span class="h2h-bar-a" style="width:${pctA}%"></span>
        </div>
        <div class="h2h-side right">
          <span class="h2h-num">${winsB}</span>
          ${avatarHTML(pb.name)}
        </div>
      </div>
      <p class="h2h-verdict">
        ${
  leader
    ? `<strong>${esc(shortName(leader.name))}</strong> leder duellen efter ${total} gemensamma tävlingar.`
    : `Helt jämnt efter ${total} gemensamma tävlingar.`
  }
      </p>
      <ul class="h2h-list">${rows}</ul>`;
  }

  /* ======================================================================
     Rendering — Elo
     ====================================================================== */

  function renderElo() {
    const { current, history, years } = App.elo;

    $('#elo-standings').innerHTML = current
      .map((e, i) => {
        const dir = e.change > 0 ? 'up' : e.change < 0 ? 'down' : '';
        const sign = e.change > 0 ? '+' : '';
        return `
        <div class="elo-row" title="${esc(e.participant.name)} · ${e.starts} starter · högsta ${e.peak}">
          <span class="elo-rank">${i + 1}</span>
          <span class="elo-name">${personLink(shortName(e.participant.name), e.participant.id)}</span>
          <span class="elo-rating">${e.rating}</span>
          <span class="elo-change ${dir}">${e.change ? `${sign}${e.change}` : '–'}</span>
        </div>`;
      })
      .join('');

    registerChart('elo-chart', () => {
      // Only chart the top ratings, otherwise the lines turn to spaghetti
      const shown = current.slice(0, 8);
      return {
        type: 'line',
        data: {
          labels: years,
          datasets: shown.map((e, i) => ({
            label: shortName(e.participant.name),
            data: years.map((y) => history[e.participant.id][y] ?? null),
            borderColor: PALETTE[i % PALETTE.length],
            backgroundColor: PALETTE[i % PALETTE.length],
            tension: 0.32,
            spanGaps: true,
            borderWidth: 2,
            pointRadius: 2.5,
            pointHoverRadius: 6
          }))
        },
        options: {
          maintainAspectRatio: false,
          interaction: { mode: 'nearest', intersect: false },
          plugins: {
            legend: { position: 'bottom' },
            tooltip: {
              displayColors: true,
              callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}` }
            }
          },
          scales: {
            x: { grid: { display: false } },
            y: { grid: { color: cssVar('--chart-grid') } }
          }
        }
      };
    });
  }

  /* ======================================================================
     Rendering — Spel
     ====================================================================== */


  /* ======================================================================
     Sangboken
     ====================================================================== */

  function renderSongs() {
    const picker = $('#song-picker');
    const sheet = $('#song-sheet');
    if (!picker || !sheet || typeof PEKKAS_SONGS === 'undefined') return;

    const songs = PEKKAS_SONGS;

    picker.innerHTML = songs
      .map(
        (song, i) => `
        <button type="button" class="song-chip ${i === 0 ? 'active' : ''}" data-song="${song.id}">
          <span class="song-chip-year">${song.year}</span>
          <span class="song-chip-title">${esc(song.title)}</span>
        </button>`
      )
      .join('');

    const show = (id) => {
      const song = songs.find((x) => x.id === id) || songs[0];
      $$('#song-picker .song-chip').forEach((b) => {
        const on = b.dataset.song === song.id;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'true');
        else b.removeAttribute('aria-current');
      });
      const lines = song.lines
        .map((line) => {
          if (line === '') return '<div class="song-break"></div>';
          if (typeof line === 'object') {
            return `<div class="song-line"><span>${esc(line.o)}</span><small>${esc(line.t)}</small></div>`;
          }
          return `<div class="song-line"><span>${esc(line)}</span></div>`;
        })
        .join('');
      sheet.innerHTML = `
        <header class="song-head">
          <span class="song-year-badge">${song.year}</span>
          <h2>${esc(song.title)}</h2>
          ${song.subtitle ? `<p class="song-subtitle">${esc(song.subtitle)}</p>` : ''}
          ${song.author ? `<p class="song-author">Av ${esc(song.author)}</p>` : ''}
          ${song.melody ? `<p class="song-melody">\u266a Melodi: ${esc(song.melody)}</p>` : ''}
        </header>
        <div class="song-lyrics">${lines}</div>
        <footer class="song-foot">Sk\u00e5l!</footer>`;
      return song;
    };
    App.showSong = show;

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.song-chip');
      if (!btn) return;
      const song = show(btn.dataset.song);
      // Sångvalet byter adress utan att fylla historiken — det är en flik
      history.replaceState(history.state, '', `#/sangbok/${song.id}`);
      if (window.matchMedia('(max-width: 1024px)').matches) {
        sheet.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    });
    show(songs[0].id);
  }

  function renderGames() {
    const byYear = {};
    GAMES.forEach((g) => (byYear[g.year] = g));

    const comps = App.data.competitions.filter((c) => !c.isCovid && c.participantCount > 0);
    const playable = comps.filter((c) => byYear[c.year]);
    const soon = comps.filter((c) => !byYear[c.year]);
    const arrow = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

    $('#game-grid').innerHTML = playable
      .map((comp, i) => {
        const g = byYear[comp.year];
        const cover = g.cover ? new URL(g.cover, document.baseURI).href : '';
        return `
        <a class="game-card playable${i === 0 ? ' featured' : ''}" href="${gameRoute(comp.year)}" data-game="${comp.year}"
           style="--g1:${g.colors[0]};--g2:${g.colors[1]}" aria-label="Spela ${esc(g.title)}, ${comp.year}">
          ${cover ? `<span class="game-cover"><img src="${esc(cover)}" alt="" loading="lazy" decoding="async" /></span>` : ''}
          <span class="game-emblem" aria-hidden="true">${g.icon}</span>
          <span class="game-shade" aria-hidden="true"></span>
          <span class="game-year-big" aria-hidden="true">${comp.year}</span>
          <span class="game-badge">Spelbar</span>
          <span class="game-info">
            <span class="game-comp">${esc(comp.name.trim())}${comp.location ? ` · ${esc(comp.location)}` : ''}</span>
            <span class="game-title">${esc(g.title)}</span>
            <span class="game-tagline">${esc(g.tagline)}</span>
            <span class="game-play">Spela ${arrow}</span>
          </span>
        </a>`;
      })
      .join('');

    // En affisch utan stillbild faller tillbaka på emblemet
    $$('#game-grid .game-cover img').forEach((img) =>
      img.addEventListener('error', () => img.closest('.game-cover').remove(), { once: true })
    );

    $('#game-soon-grid').innerHTML = soon
      .map(
        (comp) => `
        <div class="game-soon">
          <span class="soon-year">${comp.year}</span>
          <span class="soon-title">${esc(comp.name.trim())}</span>
          <span class="soon-sub">Inte byggt än</span>
        </div>`
      )
      .join('');
    $('#games-soon-heading').hidden = soon.length === 0;
  }

  /** Each game may ship its own stylesheet next to its module. Loaded once,
   *  after the shared HUD base, and never blocks the game on a 404. */
  function loadGameStyle(href) {
    const abs = new URL(href, document.baseURI).href;
    if (document.querySelector(`link[data-game-style="${abs}"]`)) return Promise.resolve();
    return new Promise((resolve) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = abs;
      link.dataset.gameStyle = abs;
      link.onload = link.onerror = () => resolve();
      document.head.appendChild(link);
    });
  }

  async function launchGame(year) {
    const game = GAMES.find((g) => g.year === year);
    if (!game) return;
    if (App.gameYear === year || App.gameLoadingYear === year) return;
    if (App.game || App.gameLoadingYear) closeGameNow();

    // En token per öppning: stängs scenen medan modulen laddar ska det
    // sena spelet inte monteras i en stängd scen.
    const token = ++App.gameToken;
    App.gameLoadingYear = year;

    const stage = $('#game-stage');
    const loading = $('#game-loading');
    $('#game-loading-year').textContent = year;
    $('#game-loading-title').textContent = game.title;
    $('#game-loading-tagline').textContent = game.tagline;
    loading.style.setProperty('--g1', game.colors[0]);
    loading.style.setProperty('--g2', game.colors[1]);
    $('#game-loading-text').textContent = 'Bygger scenen…';
    $('.game-spinner').style.display = '';
    stage.removeAttribute('data-layout');
    stage.hidden = false;
    loading.hidden = false;
    document.body.classList.add('game-open');
    if (!App.lastFocusBeforeGame) App.lastFocusBeforeGame = document.activeElement;
    $('#game-close').focus({ preventScroll: true });
    if (App.trophy) App.trophy.pause();

    try {
      const url = new URL(game.module, document.baseURI).href;
      const [mod] = await Promise.all([
        import(/* @vite-ignore */ url),
        loadGameStyle(game.module.replace(/index\.js$/, 'style.css'))
      ]);
      if (token !== App.gameToken) return;
      stage.dataset.layout = mod.layout === 'full' ? 'full' : 'portrait';
      const create = mod.default || mod.createPinball;
      // Varje öppning får en egen behållare: stängs scenen medan create()
      // fortfarande bygger, skriver det sena spelet i en lösryckt nod i
      // stället för i nästa spels scen.
      const host = document.createElement('div');
      host.className = 'game-instance';
      $('#game-mount').appendChild(host);
      const instance = await create(host, {
        participants: App.data.participants
          .filter((p) => App.stats.per[p.id].starts > 0)
          .map((p) => p.name)
      });
      if (token !== App.gameToken) {
        instance.destroy();
        host.remove();
        return;
      }
      App.game = instance;
      App.gameYear = year;
      loading.hidden = true;
    } catch (err) {
      if (token !== App.gameToken) return;
      console.error('Spelet kunde inte laddas:', err);
      $('#game-loading-text').textContent =
        'Kunde inte ladda spelet. Kontrollera nätverket och försök igen.';
      $('.game-spinner').style.display = 'none';
    } finally {
      if (token === App.gameToken) App.gameLoadingYear = null;
    }
  }

  function closeGameNow() {
    App.gameToken++;
    App.gameLoadingYear = null;
    if (App.game) {
      try {
        App.game.destroy();
      } catch (err) {
        console.error('Spelet kunde inte stängas rent:', err);
      }
      App.game = null;
    }
    App.gameYear = null;
    const stage = $('#game-stage');
    if (stage.hidden) return;
    $('#game-mount').innerHTML = '';
    stage.hidden = true;
    stage.removeAttribute('data-layout');
    document.body.classList.remove('game-open');
    if (App.trophy) App.trophy.resume();
    const back = App.lastFocusBeforeGame;
    App.lastFocusBeforeGame = null;
    if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
  }

  /* ======================================================================
     Modal — participant profiles & year details
     ====================================================================== */

  function personLink(name, id) {
    return `<button class="person-link" data-person="${esc(id)}" title="Visa profil för ${esc(name)}">${esc(name)}</button>`;
  }

  function openModal(html, onMount) {
    const modal = $('#modal');
    // Byter man från en modal till en annan (år → profil) ska fokus ändå
    // tillbaka dit man var innan den första öppnades.
    if (modal.hidden) App.lastFocus = document.activeElement;
    if (App.modalChart) {
      App.modalChart.destroy();
      App.modalChart = null;
    }
    clearTimeout(App.modalCloseTimer);
    $('#modal-body').innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal-panel').scrollTop = 0;
    requestAnimationFrame(() => {
      modal.classList.add('open');
      $('.modal-panel').focus({ preventScroll: true });
      if (onMount) onMount();
    });
  }

  function closeModalNow() {
    const modal = $('#modal');
    if (modal.hidden) return;
    modal.classList.remove('open');
    if (App.modalChart) {
      App.modalChart.destroy();
      App.modalChart = null;
    }
    document.body.style.overflow = '';
    App.modalCloseTimer = setTimeout(() => {
      modal.hidden = true;
      $('#modal-body').innerHTML = '';
      if (App.lastFocus && App.lastFocus.focus && document.contains(App.lastFocus)) {
        App.lastFocus.focus({ preventScroll: true });
      }
    }, 220);
  }

  function medalClassFor(pos) {
    return pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
  }

  function renderProfile(id) {
    const p = App.data.participants.find((x) => x.id === id);
    if (!p) return;
    const s = App.stats.per[id];
    if (!s || s.starts === 0) return;

    const elo = App.elo.current.find((e) => e.participant.id === id);
    const achIds = (App.achievements.byName[p.name] || []).filter(Boolean);
    const points = achIds.reduce((sum, aid) => sum + (App.achievements.defById[aid].points || 0), 0);

    const years = Object.keys(s.yearPositions).map(Number).sort((a, b) => a - b);
    const rivals = rivalRecords(id);
    const best = rivals.filter((r) => r.winsA > r.winsB).slice(0, 3);
    const worst = rivals
      .filter((r) => r.winsB > r.winsA)
      .slice(-3)
      .reverse();

    const stat = (val, label) =>
      `<div class="pf-stat"><div class="val">${esc(String(val))}</div><div class="lbl">${esc(label)}</div></div>`;

    const rivalRow = (r) => `
      <li>
        <span class="pf-rival-name">${personLink(shortName(r.opponent.name), r.opponent.id)}</span>
        <span class="pf-rival-score ${r.winsA > r.winsB ? 'up' : r.winsA < r.winsB ? 'down' : ''}">
          ${r.winsA}–${r.winsB}
        </span>
      </li>`;

    const yearRows = years
      .slice()
      .reverse()
      .map((y) => {
        const pos = s.yearPositions[y];
        const comp = App.stats.real.find((c) => c.year === y);
        const cls = medalClassFor(pos);
        return `
          <li>
            <button class="pf-year-row" data-year="${y}">
              <span class="pf-year">${y}</span>
              <span class="pf-comp">${esc(comp ? comp.name.trim() : '')}</span>
              <span class="pf-pos ${cls}">${pos}</span>
            </button>
          </li>`;
      })
      .join('');

    const badges = achIds
      .map((aid) => {
        const d = App.achievements.defById[aid];
        return `<span class="badge rarity-${esc(d.rarity)}" title="${esc(d.name)} — ${esc(d.desc)}">${d.icon}</span>`;
      })
      .join('');

    const html = `
      <div class="pf-head">
        ${avatarHTML(p.name, 'pf-avatar')}
        <div>
          <h2 id="modal-title" class="pf-name">${esc(p.name)}</h2>
          <p class="pf-sub">${s.starts} starter · ${s.gold} guld · ${s.silver} silver · ${s.bronze} brons</p>
        </div>
      </div>

      <div class="pf-stats">
        ${stat(elo ? elo.rating : '—', 'Elo')}
        ${stat(s.avg != null ? s.avg.toFixed(1) : '—', 'Snitt')}
        ${stat(s.best != null ? s.best : '—', 'Bästa')}
        ${stat(s.total, 'Medaljer')}
        ${stat(points, 'Poäng')}
        ${stat(s.hostCount, 'Värdskap')}
      </div>

      <div class="pf-section">
        <h3>Placering per år</h3>
        <div class="chart-wrap pf-chart"><canvas id="pf-chart"></canvas></div>
      </div>

      ${
  badges
    ? `<div class="pf-section">
              <h3>Utmärkelser <span class="pf-count">${achIds.length}</span></h3>
              <div class="pcard-badges">${badges}</div>
            </div>`
    : ''
  }

      ${
  best.length || worst.length
    ? `<div class="pf-section pf-rivals">
              ${best.length ? `<div><h3>Äger</h3><ul class="pf-rival-list">${best.map(rivalRow).join('')}</ul></div>` : ''}
              ${worst.length ? `<div><h3>Ägd av</h3><ul class="pf-rival-list">${worst.map(rivalRow).join('')}</ul></div>` : ''}
            </div>`
    : ''
  }

      <div class="pf-section">
        <h3>Alla resultat</h3>
        <ul class="pf-years">${yearRows}</ul>
      </div>`;

    openModal(html, () => {
      const canvas = document.getElementById('pf-chart');
      if (!canvas || typeof Chart === 'undefined') return;
      const maxPos = Math.max(...Object.values(s.yearPositions), 4);
      const fill = canvas.getContext('2d').createLinearGradient(0, 0, 0, canvas.clientHeight || 200);
      fill.addColorStop(0, `${cssVar('--gold')}38`);
      fill.addColorStop(1, `${cssVar('--gold')}00`);
      App.modalChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: years,
          datasets: [
            {
              data: years.map((y) => s.yearPositions[y]),
              borderColor: cssVar('--gold'),
              backgroundColor: fill,
              fill: true,
              tension: 0.32,
              borderWidth: 2,
              pointRadius: years.map((y) => (s.yearPositions[y] <= 3 ? 5 : 3)),
              pointHoverRadius: 7,
              pointBackgroundColor: years.map((y) =>
                s.yearPositions[y] <= 3 ? cssVar('--gold-hi') : cssVar('--chart-tick')
              ),
              pointBorderColor: 'transparent'
            }
          ]
        },
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => ` Plats ${c.parsed.y}` } }
          },
          scales: {
            x: { grid: { display: false } },
            y: {
              reverse: true,
              min: 1,
              suggestedMax: maxPos,
              grid: { color: cssVar('--chart-grid') },
              ticks: { precision: 0 }
            }
          }
        }
      });
    });
  }

  function renderYearDetail(year) {
    const comp = App.data.competitions.find((c) => c.year === Number(year));
    if (!comp) return;

    const results = Object.entries(comp.scores)
      .map(([pid, pos]) => ({
        participant: App.data.participants.find((x) => x.id === pid),
        pos
      }))
      .filter((r) => r.participant)
      .sort((a, b) => a.pos - b.pos);

    const hosts = [comp.arranger3rd, comp.arrangerSecondLast].filter(Boolean).join(' & ');
    const photo = photoFor(comp.year);

    const rows = results
      .map(
        (r) => `
        <li class="yd-row">
          <span class="yd-pos ${medalClassFor(r.pos)}">${r.pos}</span>
          ${avatarHTML(r.participant.name, 'yd-avatar')}
          <span class="yd-name">${personLink(r.participant.name, r.participant.id)}</span>
        </li>`
      )
      .join('');

    const html = `
      <div class="yd-head">
        <span class="yd-year">${comp.year}</span>
        <h2 id="modal-title" class="yd-title">${esc(comp.name.trim())}</h2>
        <p class="yd-meta">
          ${comp.location ? `${ICONS.pin} ${esc(comp.location)} · ` : ''}${comp.participantCount} deltagare${
    hosts ? ` · Arrangörer: ${esc(hosts)}` : ''
  }
        </p>
        ${
  GAMES.some((g) => g.year === comp.year)
    ? `<div class="yd-actions"><a class="btn small" href="${gameRoute(comp.year)}">Spela årets spel</a></div>`
    : ''
  }
      </div>
      ${photo ? `<img class="yd-photo" src="${esc(photo)}" alt="Foto från ${comp.year}" />` : ''}
      <ol class="yd-results">${rows}</ol>`;

    openModal(html);
  }

  function initModal() {
    $('#modal-close').addEventListener('click', closeOverlay);
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) closeOverlay();
    });
    $('#game-close').addEventListener('click', closeOverlay);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('#game-stage').hidden || !$('#modal').hidden) {
          e.preventDefault();
          closeOverlay();
        }
        return;
      }
      // Håll tabbningen inne i den öppna dialogen
      if (e.key === 'Tab' && !$('#modal').hidden) {
        const focusables = $$(
          '.modal-panel button, .modal-panel a[href], .modal-panel select, .modal-panel [tabindex]:not([tabindex="-1"])'
        ).filter((el) => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.modal-panel'))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  /* ======================================================================
     Navigation
     ====================================================================== */

  const VIEW_ROUTES = {
    overview: '',
    medals: 'medaljliga',
    history: 'historik',
    achievements: 'utmarkelser',
    stats: 'statistik',
    songs: 'sangbok',
    games: 'spel'
  };
  const ROUTE_VIEWS = Object.fromEntries(Object.entries(VIEW_ROUTES).map(([v, r]) => [r, v]));
  const VIEW_IDS = Object.keys(VIEW_ROUTES);
  const VIEW_TITLES = {
    overview: 'Pekkas Pokal — Tävlingen sedan 2011',
    medals: 'Medaljliga — Pekkas Pokal',
    history: 'Krönikan — Pekkas Pokal',
    achievements: 'Utmärkelser — Pekkas Pokal',
    stats: 'Statistik — Pekkas Pokal',
    songs: 'Sångbok — Pekkas Pokal',
    games: 'Arkaden — Pekkas Pokal'
  };

  const viewHash = (view) => `#/${VIEW_ROUTES[view] || ''}`;

  function showView(id, { focus = false } = {}) {
    if (!VIEW_IDS.includes(id)) id = 'overview';
    const changed = App.currentView !== id;
    App.currentView = id;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${id}`));
    $$('.nav-link[data-view], .tab-item[data-view]').forEach((b) => {
      const on = b.dataset.view === id;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    positionNavIndicator();
    document.title = VIEW_TITLES[id];
    if (changed) window.scrollTo({ top: 0, behavior: 'instant' });

    // Leaflet needs a size refresh when its container becomes visible
    if (id === 'overview' && App.map) setTimeout(() => App.map.invalidateSize(), 60);
    // Pokalen byggs först när översikten faktiskt visas — en djuplänk till
    // ett spel ska inte betala för den
    if (id === 'overview' && App.booted) initTrophy();

    // Flytta fokus till vyns rubrik så skärmläsare hör att sidan bytts
    if (focus) {
      const h = $(`#view-${id} h1`);
      if (h) {
        h.setAttribute('tabindex', '-1');
        h.focus({ preventScroll: true });
      }
    }

    observeReveals();
  }

  /**
   * #/                     översikt
   * #/medaljliga …         vyer
   * #/sangbok/<id>         en sång
   * #/spel/<år>            ett spel, ovanpå arkaden
   * #/deltagare/<namn>     profil, ovanpå aktuell vy
   * #/ar/<år>              årets resultat, ovanpå aktuell vy
   * Äldre länkar (#medals, #stats …) leder fortfarande rätt.
   */
  function parseHash(hash) {
    let raw = '';
    try {
      raw = decodeURIComponent((hash || '').replace(/^#/, ''));
    } catch (e) {
      return null;
    }
    if (!raw || raw === '/') return { view: 'overview' };
    if (!raw.startsWith('/')) return VIEW_IDS.includes(raw) ? { view: raw, legacy: true } : null;
    const [head, arg] = raw.slice(1).split('/');
    if (head === 'deltagare' && arg) return { modal: 'person', id: arg };
    if (head === 'ar' && arg) return { modal: 'year', year: Number(arg) };
    const view = ROUTE_VIEWS[head];
    if (!view) return null;
    const route = { view };
    if (view === 'games' && arg) route.game = Number(arg);
    if (view === 'songs' && arg) route.song = arg;
    return route;
  }

  const personHash = (id) => {
    const p = App.data.participants.find((x) => x.id === id);
    return `#/deltagare/${p ? slugify(p.name) : id}`;
  };

  function personFromSlug(slug) {
    return App.data.participants.find((p) => slugify(p.name) === slug || p.id === slug);
  }

  /** Hur många lager (profil, år, spel) vi själva lagt ovanpå vyn. */
  const overlayDepth = () => (history.state && history.state.pp) || 0;

  /** Navigera inom appen. Vyer ersätter varandra; profiler, årsdetaljer och
   *  spel läggs ovanpå i historiken så att bakåt stänger dem. */
  function navigate(hash, { replace = false } = {}) {
    const route = parseHash(hash);
    if (!route) return;
    const overlay = !!(route.modal || route.game);
    const depth = overlay ? overlayDepth() + 1 : 0;
    if (replace) history.replaceState({ pp: overlay ? Math.max(overlayDepth(), 1) : 0 }, '', hash);
    else history.pushState({ pp: depth }, '', hash);
    applyRoute(route, { user: true });
  }

  /** Stäng profil/år/spel: gå tillbaka förbi allt vi lagt ovanpå — eller,
   *  om sidan öppnades direkt på en sådan länk, ersätt med vyn under. */
  function closeOverlay() {
    const d = overlayDepth();
    if (d > 0) history.go(-d);
    else navigate(viewHash(App.currentView || 'overview'), { replace: true });
  }

  function applyRoute(route, { user = false } = {}) {
    App.appliedHash = location.hash;
    if (!route) return;
    if (route.legacy) history.replaceState({ pp: 0 }, '', viewHash(route.view));

    if (route.view) showView(route.view, { focus: user && !route.game && !route.song });
    else if (!App.currentView) showView('overview');

    if (route.game) launchGame(route.game);
    else closeGameNow();

    if (route.modal === 'person') {
      const p = personFromSlug(route.id);
      if (p) renderProfile(p.id);
    } else if (route.modal === 'year') {
      renderYearDetail(route.year);
    } else {
      closeModalNow();
    }

    if (route.song && App.showSong) App.showSong(route.song);
  }

  function initRouter() {
    // Alla interna länkar går genom routern; profil- och årsknappar likaså
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target.closest('a[href^="#/"]');
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        const current = location.hash || '#/';
        if (href === current) {
          window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
          return;
        }
        navigate(href);
        return;
      }
      const person = e.target.closest('[data-person]');
      if (person) {
        e.preventDefault();
        navigate(personHash(person.getAttribute('data-person')));
        return;
      }
      const year = e.target.closest('[data-year]');
      if (year) {
        e.preventDefault();
        navigate(`#/ar/${year.getAttribute('data-year')}`);
      }
    });

    const onHistory = () => {
      if (location.hash !== App.appliedHash) applyRoute(parseHash(location.hash));
    };
    window.addEventListener('popstate', onHistory);
    window.addEventListener('hashchange', onHistory);

    $('#skip-link').addEventListener('click', (e) => {
      e.preventDefault();
      $('#main').focus();
    });

    const header = $('#site-header');
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    window.addEventListener('resize', positionNavIndicator);
  }

  function positionNavIndicator() {
    const active = $('.top-nav .nav-link.active');
    const indicator = $('.nav-indicator');
    if (!active || !indicator) return;
    const pad = parseFloat(getComputedStyle(active).paddingLeft) || 0;
    indicator.style.left = `${active.offsetLeft + pad}px`;
    indicator.style.width = `${Math.max(0, active.offsetWidth - pad * 2)}px`;
  }

  /* ======================================================================
     Scroll reveal
     ====================================================================== */

  let revealObserver = null;

  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((el) => el.classList.add('in'));
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in');
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.08 }
      );
    }
    $$('.reveal:not(.in)').forEach((el) => revealObserver.observe(el));
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  function setLoadingStatus(msg) {
    const el = $('#loading-status');
    if (el) el.textContent = msg;
  }

  async function init() {
    try {
      setLoadingStatus('Hämtar resultat…');
      const [data, event] = await Promise.all([loadData(), loadEvent()]);
      App.data = data;
      App.event = event;

      setLoadingStatus('Beräknar statistik…');
      App.stats = computeStats(App.data);
      App.elo = computeElo(App.data, App.stats);
      App.facts = computeFacts(App.data, App.stats);
      computeAchievements();

      setLoadingStatus('Bygger vyer…');
      applyChartTheme();
      syncThemeChrome();
      initRouter();
      initModal();

      renderHero();
      renderHeroContours();
      renderCountdown();
      renderTicker();
      renderKPIs();
      renderOverviewCharts();
      renderMedals();
      renderTimeline();
      renderAchievements();
      renderFilters();
      renderStatsView();
      renderH2HControls();
      renderElo();
      renderSongs();
      renderGames();
      initMap();

      $('#theme-toggle').addEventListener('click', toggleTheme);

      // Startadressen kan vara en djuplänk: en vy, en profil eller ett spel.
      // Ett spel öppnas ovanpå arkaden, en profil ovanpå översikten.
      history.replaceState({ pp: 0 }, '', location.href);
      applyRoute(parseHash(location.hash) || { view: 'overview' });
      observeReveals();

      // Diagram och menylinjen mäter text — gör om när typsnitten är på plats
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          positionNavIndicator();
          rebuildCharts();
        });
      }

      const loader = $('#loading-screen');
      setTimeout(() => {
        loader.classList.add('hidden');
        positionNavIndicator();
        App.booted = true;
        if (App.currentView === 'overview') initTrophy();
      }, 350);
    } catch (err) {
      console.error('Init failed:', err);
      setLoadingStatus(`Något gick fel: ${err.message}`);
      const loader = $('#loading-screen');
      const retry = document.createElement('button');
      retry.className = 'btn';
      retry.textContent = 'Ladda om';
      retry.style.marginTop = '1rem';
      retry.addEventListener('click', () => location.reload());
      loader.appendChild(retry);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
