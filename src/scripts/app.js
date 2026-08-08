/**
 * Pekkas Pokal — Application
 *
 * Single, dependency-light app module. Loads the competition CSV,
 * derives statistics, and renders all five views:
 * Översikt, Medaljliga, Historik, Utmärkelser, Statistik.
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
    '--gold': '#f2c14e',
    '--gold-deep': '#d99a2b',
    '--silver': '#c3cbdc',
    '--bronze': '#d29a6b',
    '--accent-2': '#7c8cf8',
    '--chart-grid': 'rgba(255,255,255,0.07)',
    '--chart-tick': '#8b93b4',
    '--surface-solid': '#141930',
    '--border-strong': 'rgba(255,255,255,0.16)',
    '--text-1': '#f2f4ff',
    '--text-2': '#a7aecb'
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

  const PALETTE = [
    '#f2c14e', '#7c8cf8', '#4fd1c5', '#f26d8d', '#8bd450',
    '#f28f4e', '#5aa2f7', '#c884e0', '#e6d05a', '#63d9a1',
    '#f0788c', '#9aa3ff', '#d4a373'
  ];

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
    currentView: 'overview',
    modalChart: null,
    lastFocus: null,
    game: null
  };

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
    } catch (e) { /* private mode */ }
    $('meta[name="theme-color"]').setAttribute('content', next === 'dark' ? '#0b0e1a' : '#f4f5fa');
    applyChartTheme();
    rebuildCharts();
    updateMapTiles();
  }

  /* ======================================================================
     Charts
     ====================================================================== */

  function applyChartTheme() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.color = cssVar('--chart-tick');
    Chart.defaults.borderColor = cssVar('--chart-grid');
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 8;
    Chart.defaults.plugins.tooltip.backgroundColor = cssVar('--surface-solid');
    Chart.defaults.plugins.tooltip.titleColor = cssVar('--text-1');
    Chart.defaults.plugins.tooltip.bodyColor = cssVar('--text-2');
    Chart.defaults.plugins.tooltip.borderColor = cssVar('--border-strong');
    Chart.defaults.plugins.tooltip.borderWidth = 1;
    Chart.defaults.plugins.tooltip.cornerRadius = 10;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
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
    g.addColorStop(1, cssVar('--gold'));
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

    $('#hero-champion').textContent = champ || 'Okänd';
    $('#hero-champion-meta').textContent = latest
      ? `Vann ${latest.name.trim()} · ${latest.location || 'okänd plats'} · ${latest.year}`
      : '';

    if (champ) {
      const p = App.data.participants.find((x) => x.name === champ);
      const s = p ? stats.per[p.id] : null;
      if (s) {
        $('#hero-champion-medals').innerHTML = `
          <span class="medal-chip"><span class="medal-dot gold"></span>${s.gold} guld</span>
          <span class="medal-chip"><span class="medal-dot silver"></span>${s.silver} silver</span>
          <span class="medal-chip"><span class="medal-dot bronze"></span>${s.bronze} brons</span>
          <span class="medal-chip">⌀ ${s.avg.toFixed(1)} i snitt</span>`;
      }
    }
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

    dots.innerHTML = App.facts.map(() => '<span></span>').join('');

    const show = (i) => {
      App.tickerIndex = i % App.facts.length;
      el.classList.add('swap');
      setTimeout(() => {
        el.textContent = App.facts[App.tickerIndex];
        el.classList.remove('swap');
        $$('#ticker-dots span').forEach((d, di) =>
          d.classList.toggle('on', di === App.tickerIndex)
        );
      }, 250);
    };

    el.textContent = App.facts[0];
    $$('#ticker-dots span')[0].classList.add('on');
    App.tickerTimer = setInterval(() => show(App.tickerIndex + 1), 6500);
  }

  function animateCounter(el, target, suffix) {
    const dur = 1100;
    const start = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
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
        <div class="kpi stagger" style="--stagger-i:${i}">
          <span class="kpi-icon">${k.icon}</span>
          <span class="kpi-value" data-count="${k.count ? k.value : ''}">${k.count ? '0' : esc(k.value)}</span>
          <span class="kpi-label">${esc(k.label)}</span>
          ${k.sub ? `<span class="kpi-sub">${esc(k.sub)}</span>` : ''}
        </div>`
      )
      .join('');

    $$('#kpi-grid .kpi-value[data-count]').forEach((el) => {
      const v = parseInt(el.getAttribute('data-count'), 10);
      if (!isNaN(v)) animateCounter(el, v);
    });

    $('#year-range').textContent = years ? `Sedan ${stats.byYearAsc[0].year}` : 'Sedan 2011';
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
      fill.addColorStop(0, `${accent2}55`);
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
      marker.bindPopup(`<div style="font-weight:700;margin-bottom:4px">${esc(name)}</div>${rows}`);
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
          `<div style="font-weight:700;margin-bottom:4px">${esc(event.location)}</div>` +
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
          ${place === 1 ? '<div class="podium-crown">👑</div>' : ''}
          <button class="podium-avatar" data-person="${s.participant.id}" aria-label="Visa profil för ${esc(s.participant.name)}">${esc(initials(s.participant.name))}</button>
          <div>
            <div class="podium-name">${personLink(s.participant.name, s.participant.id)}</div>
            <div class="podium-medals">${s.gold} guld · ${s.silver} silver · ${s.bronze} brons</div>
          </div>
          <div class="podium-block">${place}</div>
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
          <td><div class="person-cell"><span class="avatar" style="border-color:hsl(${nameHue(s.participant.name)} 60% 60% / .6)">${esc(initials(s.participant.name))}</span>${personLink(s.participant.name, s.participant.id)}</div></td>
          <td class="num-col">${s.gold}</td>
          <td class="num-col">${s.silver}</td>
          <td class="num-col">${s.bronze}</td>
          <td class="num-col">${s.total}</td>
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
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (App.medalSort.key === key) App.medalSort.dir *= -1;
        else App.medalSort = { key, dir: key === 'name' ? 1 : 1 };
        renderMedalTable();
      });
    });
  }

  /* ======================================================================
     Rendering — Historik
     ====================================================================== */

  function renderTimeline() {
    const comps = App.data.competitions; // already newest first
    const latestYear = App.stats.latest ? App.stats.latest.year : null;

    $('#timeline').innerHTML = comps
      .map((comp, idx) => {
        if (comp.isCovid || comp.participantCount === 0) {
          return `
          <div class="tl-item covid stagger" style="--stagger-i:${Math.min(idx, 10)}">
            <div class="card tl-card">
              <div class="tl-top">
                <span class="tl-year">${comp.year}</span>
                <span class="tl-name">Inställd — pandemi</span>
              </div>
              <p class="card-sub" style="margin-top:6px">Pokalen tog en paus, men traditionen överlevde.</p>
            </div>
          </div>`;
        }

        const podium = [1, 2, 3]
          .map((pos) => {
            const entry = Object.entries(comp.scores).find(([, v]) => v === pos);
            if (!entry) return '';
            const p = App.data.participants.find((x) => x.id === entry[0]);
            const cls = pos === 1 ? 'gold' : pos === 2 ? 'silver' : 'bronze';
            return `<span class="tl-medal"><span class="medal-dot ${cls}"></span>${
              p ? personLink(shortName(p.name), p.id) : '?'
            }</span>`;
          })
          .join('');

        const hosts = [comp.arranger3rd, comp.arrangerSecondLast].filter(Boolean).join(' & ');

        return `
        <div class="tl-item ${comp.year === latestYear ? 'latest' : ''} stagger" style="--stagger-i:${Math.min(idx, 10)}">
          <div class="card tl-card">
            <img class="tl-photo" data-photo-year="${comp.year}" alt="Foto från ${comp.year}" hidden />
            <div class="tl-top">
              <button class="tl-year tl-year-btn" data-year="${comp.year}" title="Visa alla resultat från ${comp.year}">${comp.year}</button>
              <span class="tl-name">${esc(comp.name.trim())}</span>
              ${comp.location ? `<span class="tl-loc">${ICONS.pin} ${esc(comp.location)}</span>` : ''}
            </div>
            <div class="tl-podium">${podium}</div>
            <div class="tl-foot">
              <span class="tl-host">${comp.participantCount} deltagare${hosts ? ` · Arrangörer: ${esc(hosts)}` : ''}</span>
              <button class="tl-more" data-year="${comp.year}">Alla resultat →</button>
            </div>
          </div>
        </div>`;
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

    $('#ach-summary').innerHTML = [
      { v: unlockedCount, l: 'Upplåsta' },
      { v: defs.length, l: 'Totalt' },
      { v: `${pct}%`, l: 'Genomfört' },
      { v: leader ? shortName(leader) : '—', l: 'Poängledare' }
    ]
      .map(
        (k, i) => `
      <div class="kpi stagger" style="--stagger-i:${i}">
        <span class="kpi-value">${esc(String(k.v))}</span>
        <span class="kpi-label">${k.l}</span>
      </div>`
      )
      .join('');

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
            <span class="avatar" style="width:42px;height:42px;font-size:.85rem;border-color:hsl(${nameHue(name)} 60% 60% / .6)">${esc(initials(name))}</span>
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
    $('#ach-category-filters').innerHTML = cats
      .map(
        (c) =>
          `<button class="chip ${c === App.achCategory ? 'active' : ''}" data-cat="${esc(c)}">${esc(catLabels[c] || c)}</button>`
      )
      .join('');

    $$('#ach-category-filters .chip').forEach((chip) =>
      chip.addEventListener('click', () => {
        App.achCategory = chip.getAttribute('data-cat');
        renderAchievementGrid(holdersByAch);
        $$('#ach-category-filters .chip').forEach((c) =>
          c.classList.toggle('active', c === chip)
        );
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
      .sort(
        (a, b) =>
          (holdersByAch[b.id].length > 0) - (holdersByAch[a.id].length > 0) ||
          rarityOrder[a.rarity] - rarityOrder[b.rarity]
      );

    $('#ach-grid').innerHTML = list
      .map((d, i) => {
        const holders = holdersByAch[d.id];
        const unlocked = holders.length > 0;
        const holderText = unlocked
          ? `<strong>${holders.map(shortName).map(esc).join(', ')}</strong>`
          : 'Ingen har låst upp denna än';
        return `
        <div class="ach-card rarity-${esc(d.rarity)} ${unlocked ? '' : 'locked'} stagger" style="--stagger-i:${Math.min(i % 12, 11)}">
          <span class="ach-icon">${unlocked ? d.icon : '🔒'}</span>
          <div class="ach-body">
            <div class="ach-name">${esc(d.name)}</div>
            <div class="ach-desc">${esc(d.desc)}</div>
            <div class="ach-holders">${holderText}</div>
          </div>
          <span class="ach-rarity">${esc(rarityLabels[d.rarity] || d.rarity)}</span>
        </div>`;
      })
      .join('');
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
            <span class="avatar" style="border-color:hsl(${nameHue(p.name)} 60% 60% / .6)">${esc(initials(p.name))}</span>
            <div>
              <div class="ccard-name">${personLink(p.name, p.id)}</div>
              <div class="ccard-medals">🥇 ${golds} · ${positions.length} starter i urvalet</div>
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
      const hue = 210 - 210 * Math.min(Math.max(t, 0), 1);
      return `style="background:hsl(${hue.toFixed(0)} 60% 50% / .26)"`;
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
      <span class="item"><span class="swatch" style="background:linear-gradient(90deg,hsl(210 60% 50% / .3),hsl(0 60% 50% / .3))"></span>Mitten → sist</span>
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
          <span class="avatar" style="border-color:hsl(${nameHue(pa.name)} 60% 60% / .6)">${esc(initials(pa.name))}</span>
          <span class="h2h-num">${winsA}</span>
        </div>
        <div class="h2h-bar" role="img" aria-label="${winsA} mot ${winsB}">
          <span class="h2h-bar-a" style="width:${pctA}%"></span>
        </div>
        <div class="h2h-side right">
          <span class="h2h-num">${winsB}</span>
          <span class="avatar" style="border-color:hsl(${nameHue(pb.name)} 60% 60% / .6)">${esc(initials(pb.name))}</span>
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

  /**
   * One game per year. Entries without a `module` render as coming soon —
   * add one here as each year's game gets built.
   */
  const GAMES = [
    {
      year: 2026,
      title: 'Pekkas Lerskulptur',
      competition: 'Lerskulptur',
      tagline: 'Dreja tre alster i Barcelona-ateljén — keramikern dömer likheten.',
      icon: '🏺',
      module: 'src/games/clay/index.js'
    },
    {
      year: 2023,
      title: 'Pekkas Fäktning',
      competition: 'Fäktning',
      tagline: 'En garde på pisten i Stockholm — parera, ripostera och stöt dig till pokalen.',
      icon: '🤺',
      module: 'src/games/fencing/index.js'
    },
    {
      year: 2024,
      title: 'Pekkas Fiske',
      competition: 'Fisketävling',
      tagline: 'Sänk draget djupt, kroka storgäddan och fånga allt på vägen upp.',
      icon: '🎣',
      module: 'src/games/fishing/index.js'
    },
    {
      year: 2025,
      title: 'Pekkas Pokal Flipper',
      competition: 'Flipper',
      tagline: 'Ett fullstort flipperspel i 3D. Tre bollar, fem mål och en pokal.',
      icon: '🎯',
      image: 'logo-pekkas-pokal.png',
      module: 'src/games/pinball/index.js'
    }
  ];

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
        <button class="song-chip ${i === 0 ? 'active' : ''}" data-song="${song.id}">
          <span class="song-chip-year">${song.year}</span>
          <span class="song-chip-title">${esc(song.title)}</span>
        </button>`
      )
      .join('');

    const show = (id) => {
      const song = songs.find((x) => x.id === id) || songs[0];
      $$('#song-picker .song-chip').forEach((b) =>
        b.classList.toggle('active', b.dataset.song === song.id)
      );
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
          ${song.melody ? `<p class="song-melody">\u266a Melodi: ${esc(song.melody)}</p>` : ''}
        </header>
        <div class="song-lyrics">${lines}</div>
        <footer class="song-foot">Sk\u00e5l! \ud83c\udf7b</footer>`;
    };

    picker.addEventListener('click', (e) => {
      const btn = e.target.closest('.song-chip');
      if (btn) show(btn.dataset.song);
    });
    show(songs[0].id);
  }

  function renderGames() {
    const byYear = {};
    GAMES.forEach((g) => (byYear[g.year] = g));

    const cards = App.data.competitions
      .filter((c) => !c.isCovid && c.participantCount > 0)
      .map((comp) => {
        const game = byYear[comp.year];
        if (game) {
          return `
          <button class="game-card playable" data-game="${comp.year}">
            <span class="game-badge">Spelbar</span>
            ${
  game.image
    ? `<img class="game-logo" src="${esc(game.image)}" alt="" loading="lazy" />`
    : `<span class="game-icon">${game.icon}</span>`
  }
            <span class="game-year">${comp.year}</span>
            <span class="game-title">${esc(game.title)}</span>
            <span class="game-tagline">${esc(game.tagline)}</span>
            <span class="game-play">Spela nu →</span>
          </button>`;
        }
        return `
        <div class="game-card soon">
          <span class="game-icon">🔒</span>
          <span class="game-year">${comp.year}</span>
          <span class="game-title">${esc(comp.name.trim())}</span>
          <span class="game-tagline">Spelet för det här året är inte byggt än.</span>
        </div>`;
      })
      .join('');

    $('#game-grid').innerHTML = cards;

    $('#game-grid').addEventListener('click', (e) => {
      const card = e.target.closest('[data-game]');
      if (card) launchGame(Number(card.getAttribute('data-game')));
    });
    $('#game-close').addEventListener('click', closeGame);
  }

  async function launchGame(year) {
    const game = GAMES.find((g) => g.year === year);
    if (!game || App.game) return;

    const stage = $('#game-stage');
    const loading = $('#game-loading');
    stage.hidden = false;
    loading.hidden = false;
    document.body.classList.add('game-open');

    try {
      const url = new URL(game.module, document.baseURI).href;
      const mod = await import(/* @vite-ignore */ url);
      const create = mod.createPinball || mod.default;
      App.game = await create($('#game-mount'), {
        participants: App.data.participants
          .filter((p) => App.stats.per[p.id].starts > 0)
          .map((p) => p.name)
      });
      loading.hidden = true;
    } catch (err) {
      console.error('Game failed to load:', err);
      $('#game-loading-text').textContent =
        'Kunde inte ladda spelet. Kontrollera nätverket och försök igen.';
      $('.game-spinner').style.display = 'none';
    }
  }

  function closeGame() {
    if (App.game) {
      App.game.destroy();
      App.game = null;
    }
    $('#game-mount').innerHTML = '';
    $('#game-stage').hidden = true;
    $('#game-loading').hidden = false;
    const spinner = $('.game-spinner');
    if (spinner) spinner.style.display = '';
    $('#game-loading-text').textContent = 'Bygger bordet…';
    document.body.classList.remove('game-open');
  }

  /* ======================================================================
     Modal — participant profiles & year details
     ====================================================================== */

  function personLink(name, id) {
    return `<button class="person-link" data-person="${esc(id)}" title="Visa profil för ${esc(name)}">${esc(name)}</button>`;
  }

  function openModal(html, onMount) {
    const modal = $('#modal');
    App.lastFocus = document.activeElement;
    $('#modal-body').innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      modal.classList.add('open');
      $('.modal-panel').focus();
      if (onMount) onMount();
    });
  }

  function closeModal() {
    const modal = $('#modal');
    if (modal.hidden) return;
    modal.classList.remove('open');
    if (App.modalChart) {
      App.modalChart.destroy();
      App.modalChart = null;
    }
    document.body.style.overflow = '';
    setTimeout(() => {
      modal.hidden = true;
      $('#modal-body').innerHTML = '';
      if (App.lastFocus && App.lastFocus.focus) App.lastFocus.focus();
    }, 200);
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
        <span class="avatar pf-avatar" style="border-color:hsl(${nameHue(p.name)} 60% 60% / .7)">${esc(initials(p.name))}</span>
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
      App.modalChart = new Chart(canvas, {
        type: 'line',
        data: {
          labels: years,
          datasets: [
            {
              data: years.map((y) => s.yearPositions[y]),
              borderColor: cssVar('--accent-2'),
              backgroundColor: `${cssVar('--accent-2')}22`,
              fill: true,
              tension: 0.32,
              borderWidth: 2.5,
              pointRadius: 4,
              pointHoverRadius: 6,
              pointBackgroundColor: years.map((y) =>
                s.yearPositions[y] <= 3 ? cssVar('--gold') : cssVar('--accent-2')
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
          <span class="avatar yd-avatar" style="border-color:hsl(${nameHue(r.participant.name)} 60% 60% / .6)">${esc(initials(r.participant.name))}</span>
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
      </div>
      ${photo ? `<img class="yd-photo" src="${esc(photo)}" alt="Foto från ${comp.year}" />` : ''}
      <ul class="yd-results">${rows}</ul>`;

    openModal(html);
  }

  function initModal() {
    $('#modal-close').addEventListener('click', closeModal);
    $('#modal').addEventListener('click', (e) => {
      if (e.target === $('#modal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (App.game) closeGame();
      else closeModal();
    });

    // Delegated: any person link or year row anywhere in the app
    document.addEventListener('click', (e) => {
      const person = e.target.closest('[data-person]');
      if (person) {
        e.preventDefault();
        renderProfile(person.getAttribute('data-person'));
        return;
      }
      const year = e.target.closest('[data-year]');
      if (year) {
        e.preventDefault();
        renderYearDetail(year.getAttribute('data-year'));
      }
    });
  }

  /* ======================================================================
     Navigation
     ====================================================================== */

  function showView(id) {
    App.currentView = id;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${id}`));
    $$('.nav-link').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    $$('.tab-item').forEach((b) => b.classList.toggle('active', b.dataset.view === id));
    positionNavIndicator();
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (history.replaceState) history.replaceState(null, '', `#${id}`);

    // Leaflet needs a size refresh when its container becomes visible
    if (id === 'overview' && App.map) setTimeout(() => App.map.invalidateSize(), 60);
    if (id !== 'games' && App.game) closeGame();

    observeReveals();
  }

  function positionNavIndicator() {
    const nav = $('.top-nav');
    const active = $('.top-nav .nav-link.active');
    const indicator = $('.nav-indicator');
    if (!nav || !active || !indicator) return;
    indicator.style.left = `${active.offsetLeft}px`;
    indicator.style.width = `${active.offsetWidth}px`;
  }

  function initNav() {
    $$('[data-view]').forEach((btn) =>
      btn.addEventListener('click', () => showView(btn.dataset.view))
    );
    $('#brand-home').addEventListener('click', (e) => {
      e.preventDefault();
      showView('overview');
    });
    window.addEventListener('resize', positionNavIndicator);

    const hash = location.hash.replace('#', '');
    if (['overview', 'medals', 'history', 'achievements', 'stats', 'songs', 'games'].includes(hash)) {
      App.currentView = hash;
    }
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
      initNav();
      initModal();

      renderHero();
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

      showView(App.currentView);
      observeReveals();

      const loader = $('#loading-screen');
      setTimeout(() => {
        loader.classList.add('hidden');
        positionNavIndicator();
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
