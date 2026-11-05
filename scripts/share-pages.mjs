#!/usr/bin/env node
/**
 * Delningssidor: förhandsvisningar för årssidor och profiler.
 *
 * Sidan är hash-routad (#/ar/2019, #/deltagare/viktor-jones) och det som
 * står efter # skickas aldrig till servern — så den som bygger en
 * förhandsvisning (iMessage, Slack, Messenger, Discord …) ser bara
 * startsidans titel och bild. Det här skriptet skriver därför en liten
 * statisk sida per år och per deltagare:
 *
 *   <ut>/ar/<år>/index.html
 *   <ut>/deltagare/<namn>/index.html
 *
 * Varje sida har titel, beskrivning och og:/twitter:-taggar och skickar
 * besökaren direkt vidare till vyn i appen (meta refresh + location.replace,
 * och en vanlig länk om inget av det fungerar). Knappen "Dela" i appen
 * delar de här adresserna.
 *
 * Användning:  node scripts/share-pages.mjs [utkatalog]   (standard: dist)
 *   PAGES_BASE  sökvägen sidan ligger under, som i vite.config.js (/pekkas-pokal/)
 *   SITE_URL    värden (https://olovmelander.github.io)
 *
 * Datan läses från <ut>/competition-data.csv — samma fil som publiceras —
 * och annars från competition-data.csv i repots rot. Spelen och deras
 * omslag läses ur GAMES-listan i src/scripts/app.js.
 */
import { existsSync, mkdirSync, openSync, readSync, closeSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'dist'));
const BASE = `/${(process.env.PAGES_BASE || '/pekkas-pokal/').replace(/^\/+|\/+$/g, '')}/`.replace('//', '/');
const SITE = `${(process.env.SITE_URL || 'https://olovmelander.github.io').replace(/\/+$/, '')}${BASE}`;
const FIXED_COLUMNS = ['År', 'Datum', 'Tävling', 'Plats', 'Arrangör 3:a', 'Arrangör näst sist'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

/* ---------- Hjälpare (samma regler som i app.js) ---------- */

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function slugify(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const listJoin = (items) =>
  items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} och ${items[items.length - 1]}`;

const ordinalShort = (n) => {
  const r100 = n % 100;
  const r10 = n % 10;
  return `${n}:${(r10 === 1 || r10 === 2) && r100 !== 11 && r100 !== 12 ? 'a' : 'e'}`;
};

const decimal = (n) => n.toFixed(1).replace('.', ',');

function parseCSV(text) {
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
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, values[i] == null ? '' : values[i]]));
  });
}

/** Tävlingar och deltagare, tolkade som processData() i app.js. */
function loadCompetitions(text) {
  const rows = parseCSV(text);
  const names = Object.keys(rows[0] || {}).filter((h) => h && !FIXED_COLUMNS.includes(h)).map((h) => h.trim());
  const comps = [];
  rows.forEach((row) => {
    const year = parseInt(String(row['År'] || row['Datum']).split('-')[0], 10);
    const name = (row['Tävling'] || '').trim();
    if (!year || !name || name.toLowerCase() === 'covid') return;
    const scores = {};
    Object.keys(row).forEach((col) => {
      const person = col.trim();
      if (!names.includes(person)) return;
      const pos = parseInt((row[col] || '').trim(), 10);
      if (!Number.isNaN(pos)) scores[person] = pos;
    });
    if (!Object.keys(scores).length) return;
    const date = /^\d{4}-\d{2}-\d{2}$/.test((row['Datum'] || '').trim()) ? row['Datum'].trim() : '';
    comps.push({
      year,
      name,
      date,
      location: (row['Plats'] || '').trim(),
      hosts: [row['Arrangör 3:a'], row['Arrangör näst sist']].map((h) => (h || '').trim()).filter(Boolean),
      scores
    });
  });
  return { names, comps: comps.sort((a, b) => a.year - b.year) };
}

/** Spelens år, titel och omslag ur GAMES-listan i app.js. */
function loadGames() {
  const src = readFileSync(join(ROOT, 'src/scripts/app.js'), 'utf8');
  const start = src.indexOf('const GAMES = [');
  if (start < 0) return {};
  const block = src.slice(start, src.indexOf('\n  ];', start));
  const games = {};
  block.split(/\n\s{4}\{/).slice(1).forEach((entry) => {
    const year = /year:\s*(\d{4})/.exec(entry);
    const title = /title:\s*'([^']+)'/.exec(entry);
    const cover = /cover:\s*'([^']+)'/.exec(entry);
    if (year) games[year[1]] = { title: title ? title[1] : '', cover: cover ? cover[1] : '' };
  });
  return games;
}

/** Bildens bredd och höjd ur filhuvudet (PNG och WebP) — för og:image:width/height. */
function imageSize(file) {
  if (!existsSync(file)) return null;
  const buf = Buffer.alloc(40);
  const fd = openSync(file, 'r');
  readSync(fd, buf, 0, 40, 0);
  closeSync(fd);
  if (buf.toString('ascii', 1, 4) === 'PNG') return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), type: 'image/png' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff, type: 'image/webp' };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, type: 'image/webp' };
    }
    if (chunk === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1, type: 'image/webp' };
  }
  return null;
}

/** Bilden finns i public/ (källan) och i <ut>/ efter bygget. */
function imageMeta(path) {
  const size = imageSize(join(OUT, path)) || imageSize(join(ROOT, 'public', path));
  return { url: new URL(path, SITE).href, ...(size || {}) };
}

/* ---------- Sidan ---------- */

function sharePage({ path, route, title, description, image, imageAlt, linkText }) {
  const url = new URL(path, SITE).href;
  // Relativt, så att sidan hittar hem även under en annan PAGES_BASE
  const target = `${'../'.repeat(path.split('/').filter(Boolean).length)}#${route}`;
  const imageTags = [
    `<meta property="og:image" content="${esc(image.url)}" />`,
    image.type ? `<meta property="og:image:type" content="${image.type}" />` : '',
    image.w ? `<meta property="og:image:width" content="${image.w}" />` : '',
    image.h ? `<meta property="og:image:height" content="${image.h}" />` : '',
    `<meta property="og:image:alt" content="${esc(imageAlt)}" />`
  ]
    .filter(Boolean)
    .join('\n    ');
  return `<!doctype html>
<html lang="sv">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(url)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Pekkas Pokal" />
    <meta property="og:locale" content="sv_SE" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(url)}" />
    ${imageTags}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(description)}" />
    <meta name="twitter:image" content="${esc(image.url)}" />
    <meta name="theme-color" content="#0b0c0f" />
    <link rel="icon" href="${esc(new URL('favicon.png', SITE).href)}" type="image/png" />
    <meta http-equiv="refresh" content="0; url=${esc(target)}" />
    <script>location.replace(${JSON.stringify(target).replace(/</g, '\\u003c')});</script>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0b0c0f; color: #f4efe6;
        font: 1rem/1.6 system-ui, sans-serif; text-align: center; padding: 1rem; }
      a { color: #ecc66b; }
    </style>
  </head>
  <body>
    <p>Skickar dig vidare till <a href="${esc(target)}">${esc(linkText)}</a> på Pekkas Pokal …</p>
  </body>
</html>
`;
}

function write(path, html) {
  const dir = join(OUT, path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
}

/* ---------- Kör ---------- */

const csvFile = [join(OUT, 'competition-data.csv'), join(ROOT, 'competition-data.csv')].find(existsSync);
if (!csvFile) {
  console.error('share-pages: hittar ingen competition-data.csv');
  process.exit(1);
}
const { names, comps } = loadCompetitions(readFileSync(csvFile, 'utf8'));
const games = loadGames();
const fallbackImage = imageMeta('og-image.png');

comps.forEach((c, i) => {
  const ranked = Object.entries(c.scores).sort((a, b) => a[1] - b[1]);
  const winners = ranked.filter(([, pos]) => pos === 1).map(([n]) => n);
  const podium = ranked.filter(([, pos]) => pos <= 3).map(([n, pos]) => `${pos} ${n}`);
  const [y, m, d] = c.date ? c.date.split('-').map(Number) : [];
  const when = c.date ? `den ${d} ${MONTHS[m - 1]} ${y}` : `${c.year}`;
  const game = games[c.year];
  const description = [
    winners.length ? `${listJoin(winners)} vann ${c.name}${c.location ? ` i ${c.location}` : ''} ${when}.` : '',
    `${ranked.length} deltagare, upplaga ${i + 1}.`,
    podium.length > 1 ? `Pallen: ${podium.join(' · ')}.` : '',
    game ? `Spela årets spel, ${game.title}.` : ''
  ]
    .filter(Boolean)
    .join(' ');
  write(
    `ar/${c.year}/`,
    sharePage({
      path: `ar/${c.year}/`,
      route: `/ar/${c.year}`,
      title: `${c.name} ${c.year} — Pekkas Pokal`,
      description,
      image: game && game.cover ? imageMeta(game.cover) : fallbackImage,
      imageAlt: game && game.cover ? `${game.title} — årets spel ${c.year}` : 'Pekkas Pokal',
      linkText: `${c.name} ${c.year}`
    })
  );
});

let people = 0;
names.forEach((name) => {
  const results = comps.filter((c) => c.scores[name] != null).map((c) => ({ year: c.year, pos: c.scores[name] }));
  if (!results.length) return;
  const count = (p) => results.filter((r) => r.pos === p).length;
  const avg = results.reduce((s, r) => s + r.pos, 0) / results.length;
  const best = Math.min(...results.map((r) => r.pos));
  const hosted = comps.filter((c) => c.hosts.includes(name)).length;
  const description = [
    `${results.length} ${results.length === 1 ? 'start' : 'starter'} sedan ${results[0].year}: ${count(1)} guld, ${count(2)} silver och ${count(3)} brons.`,
    `Snittplacering ${decimal(avg)}, bästa placering ${ordinalShort(best)}.`,
    hosted ? `Har arrangerat ${hosted} ${hosted === 1 ? 'gång' : 'gånger'}.` : ''
  ]
    .filter(Boolean)
    .join(' ');
  const slug = slugify(name);
  write(
    `deltagare/${slug}/`,
    sharePage({
      path: `deltagare/${slug}/`,
      route: `/deltagare/${slug}`,
      title: `${name} — Pekkas Pokal`,
      description,
      image: fallbackImage,
      imageAlt: 'Pekkas Pokal',
      linkText: name
    })
  );
  people++;
});

console.info(`share-pages: ${comps.length} år och ${people} deltagare → ${OUT} (${SITE})`);
