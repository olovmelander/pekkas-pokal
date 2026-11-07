/**
 * Pekkas egna ikoner för utmärkelserna.
 *
 * Varje ikon är en ram och en symbol:
 * - Ramens form visar sällsyntheten, så den går att läsa även utan färg:
 *   cirkel (Vanlig), sköld (Sällsynt), hexagon (Episk), rosett
 *   (Legendarisk) och åttauddig stjärna (Mytisk).
 * - Symbolen är ritad för Pekkas Pokal: pokalen har samma form som 3D-pokalen
 *   på översikten, Grundaren är en graverad plåt som på pokalens sockel, och
 *   siffrorna är satta i Fraunces som resten av sajten.
 *
 * Symbolerna ritas på ett rutnät på 24×24 med 1,75 i linjebredd, rundade
 * ändar och hörn. Färgen kommer från CSS (--rc, sällsynthetens färg), så samma
 * ikon fungerar i mörkt och ljust tema och som låst (grå, streckad ram).
 *
 * Används via window.ppAchBadge(def, { locked }) som ger en hel <svg>.
 */
(function () {
  /* ---------- Building blocks ---------- */
  const num = (x, y, s, size) => `<text class="t" x="${x}" y="${y}" font-size="${size}">${s}</text>`;
  const knock = (x, y, s, size) => `<text class="t k" x="${x}" y="${y}" font-size="${size}">${s}</text>`;

  /** Five-pointed star, filled */
  function star(cx, cy, r) {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`);
    }
    return `<path class="f" d="M${pts.join('L')}z"/>`;
  }

  /** The Pekkas cup: two handles, a short stem and a stepped base */
  const cup = (n = '', size = 5.8) =>
    `<path d="M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0z"/>` +
    `<path d="M7.5 6H5.75a2.25 2.25 0 0 0 0 4.5H8M16.5 6h1.75a2.25 2.25 0 0 1 0 4.5H16"/>` +
    `<path d="M12 13v3.5M9 16.5h6l.7 3.5H8.3z"/>${
      n ? num(12, 10.5, n, size) : ''}`;

  /** A smaller cup for icons with two of them */
  const smallCup = (cx) =>
    `<path d="M${cx - 2.8} 6h5.6v3a2.8 2.8 0 0 1-5.6 0z"/>` +
    `<path d="M${cx - 2.8} 7.2h-.9a1.4 1.4 0 0 0 0 2.8h1.1M${cx + 2.8} 7.2h.9a1.4 1.4 0 0 1 0 2.8h-1.1"/>` +
    `<path d="M${cx} 11.8v3.2M${cx - 2} 15h4l.5 3h-5z"/>`;

  /** Medal on a V ribbon, with a number on the disc */
  const medal = (n, size = 5.6) =>
    `<path d="M8.6 2.5l2.7 6.6M15.4 2.5l-2.7 6.6M8 2.5h2.4M13.6 2.5H16"/>` +
    `<circle cx="12" cy="14.6" r="5.6"/>${
      num(12, 16.7, n, size)}`;

  /** Streak flame with a number in its belly */
  const flame = (n) =>
    `<path d="M12 2.2c1 3.3 6 5.4 6 11.1a6 6 0 0 1-12 0c0-2.8 1.4-4.6 2.8-5.8.3 1.6 1 2.6 2 3.1-.3-3.2.3-5.9 1.2-8.4z"/>${
      num(12, 17.6, n, 6.2)}`;

  /** Podium: second, first and third */
  const PODIUM = 'M9 20.5V10h6v10.5M2.5 20.5h19';
  const POD_L = 'M3.5 20.5V14H9';
  const POD_R = 'M15 20.5V16h5.5v4.5';

  /** House: roof and walls */
  const HOUSE = 'M3.5 11 12 4l8.5 7M5.5 9.5V20.5h13V9.5';

  /* ---------- The symbols, one per achievement ---------- */
  const G = {
    /* Medaljer */
    podium_1: `<path d="${PODIUM}M${POD_L.slice(1)}M${POD_R.slice(1)}"/>${star(12, 6, 2.6)}`,
    win_1: cup('1'),
    win_3: cup('3'),
    win_5: `${cup('5')}<path d="M9.4 3 8.9 1l1.7 1L12 .3l1.4 1.7 1.7-1-.5 2"/>`,
    win_7: `${cup('7')}<path d="M3.6 2.4 5 3.8M20.4 2.4 19 3.8M12 .4v1.6"/>`,
    podium_5: medal('5'),
    podium_10: medal('10', 4.9),
    silver_3: `<path d="${PODIUM}M${POD_R.slice(1)}"/><path class="f" d="M3.5 20.5V14H9v6.5z"/>${knock(6.25, 19.3, '2', 4.6)}`,
    bronze_3: `<path d="${PODIUM}M${POD_L.slice(1)}"/><path class="f" d="M15 20.5V16h5.5v4.5z"/>${knock(17.75, 19.6, '3', 3.9)}`,
    full_set:
      `<circle cx="12" cy="8" r="4.3"/><circle cx="7.4" cy="15.8" r="4.3"/><circle cx="16.6" cy="15.8" r="4.3"/>${
        num(12, 9.6, '1', 4.4)}${num(7.4, 17.4, '2', 4.4)}${num(16.6, 17.4, '3', 4.4)}`,

    /* Sviter */
    podium_streak_2: flame('2'),
    podium_streak_3: flame('3'),
    podium_streak_5: flame('5'),
    win_streak_2: `${smallCup(6.8) + smallCup(17.2)}<path d="M3.5 21h17"/>`,
    win_streak_3:
      `<path d="M3.5 17.6c2.6 1.6 14.4 1.6 17 0"/><path d="M7 17.2V8c0-1 2.2-1.8 5-1.8s5 .8 5 1.8v9.2"/>` +
      `<path d="M7 14.4c2.8.9 7.2.9 10 0"/>${star(6.5, 3.2, 1.6)}${star(12, 2.4, 1.6)}${star(17.5, 3.2, 1.6)}`,
    top_half_5:
      '<path d="M3 3.5V20.5h18"/><path class="d" d="M3 13h18"/>' +
      '<path d="M5 9.5 8.5 7.5 12 9 15.5 6 19 8"/>' +
      '<circle class="f" cx="5" cy="9.5" r="1.3"/><circle class="f" cx="8.5" cy="7.5" r="1.3"/><circle class="f" cx="12" cy="9" r="1.3"/><circle class="f" cx="15.5" cy="6" r="1.3"/><circle class="f" cx="19" cy="8" r="1.3"/>',
    climb_3: `<path d="M2.5 20.5h4.5V16h4.5v-4.5H16V7h5.5"/>${star(18.6, 3.4, 2.4)}`,

    /* Milstolpar */
    debut: '<path d="M5.5 21V3.5"/><path d="M5.5 4.2h12.5l-2.6 3.6 2.6 3.6H5.5"/>',
    starts_5:
      `<path d="M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6z"/><path class="d" d="M16 7v10"/>${num(9.8, 14.2, '5', 6)}`,
    starts_10: '<path d="M5 5.5l7 4 7-4M5 10.5l7 4 7-4M5 15.5l7 4 7-4"/>',
    starts_15:
      '<path d="M4.5 4.5h15M6 4.5v2.2h12V4.5M8 6.7v11.6M12 6.7v11.6M16 6.7v11.6M6 18.3h12v2.2H6zM4.5 20.5h15"/>',
    iron_man:
      '<path d="M2.5 7.5h13c0 2.6 2.2 3.6 6 3.6v1.6h-6.8l-1.5 2.6v2.5h3.3v2.2H7v-2.2h3v-2.5L8.6 12.2c-3.4-.2-6.1-1.6-6.1-4.7z"/>',
    founder:
      `<path d="M3 7.5h18v9H3z"/><circle class="f" cx="5" cy="9.5" r=".7"/><circle class="f" cx="19" cy="9.5" r=".7"/><circle class="f" cx="5" cy="14.5" r=".7"/><circle class="f" cx="19" cy="14.5" r=".7"/>${
        num(12, 13.9, '2011', 5.2)}`,
    debut_podium: `${star(15, 9, 5.6)}<path d="M2.5 16.5l5.5-3.2M4.5 20.5l5-4M8.5 21l3.4-4.6"/>`,
    late_bloomer:
      '<path d="M12 21v-8.5"/><path d="M12 18c-2.6 0-4.2-1.5-4.7-3.6 2.3 0 4 1 4.7 3.6zM12 16c2.6 0 4.2-1.5 4.7-3.6-2.3 0-4 1-4.7 3.6z"/>' +
      '<circle cx="12" cy="4.6" r="2.1"/><circle cx="15.6" cy="7.2" r="2.1"/><circle cx="14.3" cy="11" r="2.1"/><circle cx="9.7" cy="11" r="2.1"/><circle cx="8.4" cy="7.2" r="2.1"/>' +
      '<circle class="f" cx="12" cy="8.1" r="1.5"/>',
    comeback_5: `<path d="M19.8 13.2A8 8 0 1 1 17.5 6.3"/><path d="M18.4 2.4l-.6 4.1 4.1.6"/>${num(12, 15.4, '5', 7)}`,
    comeback_10:
      '<path d="M6.5 3h11M6.5 21h11M8 3c0 4.5 4 5.4 4 9s-4 4.5-4 9M16 3c0 4.5-4 5.4-4 9s4 4.5 4 9"/><path class="f" d="M9.3 19.6h5.4L12 16.6z"/>',
    rocket:
      '<path d="M14.3 4.6c2.6-1.3 4.6-1.4 5.2-1.1.3.6.2 2.6-1.1 5.2l-6.1 6.1-4.1-4.1z"/><circle cx="15.5" cy="8.5" r="1.3"/>' +
      '<path d="M8.4 10.6l-3.1.4-2 2 3.6.9M13.4 15.6l-.4 3.1-2 2-.9-3.6M7.2 16.8c-1 1-1.6 3.4-1.6 3.4s2.4-.6 3.4-1.6"/>',
    phoenix:
      '<path d="M2.5 17h19M6.5 20.5h11"/><path d="M7 17a5 5 0 0 1 10 0"/>' +
      '<path d="M12 6v2.2M5.6 9.3l1.5 1.5M18.4 9.3l-1.5 1.5M2.8 13.5h2M19.2 13.5h2"/>',
    bottom_to_top:
      `<path d="M3 20.5h6"/><path d="M6 17.5V12a6 6 0 0 1 6-6h4"/><path d="M13.6 3.5 16.2 6l-2.6 2.5"/>${star(19.6, 6, 2.5)}`,

    /* Arrangörer */
    host_1: `<path d="${HOUSE}"/><path d="M10 20.5v-5h4v5"/>`,
    host_3: `<path d="${HOUSE}"/>${num(12, 17.6, '3', 7)}`,
    host_5:
      '<path d="M3.5 20.5V8.5h3v2h2v-2h2.4v2h2.2v-2h2.4v2h2v-2h3v12z"/><path d="M10 20.5v-3.3a2 2 0 0 1 4 0v3.3"/>' +
      '<path d="M12 8.5V3l3.2 1.3L12 5.6"/>',
    host_back_to_back:
      '<path d="M3.5 5.5h17v15h-17zM3.5 10h17M8 3v4.5M16 3v4.5"/><path class="f" d="M6.2 12.6h3.4v3.4H6.2zM10.4 12.6h3.4v3.4h-3.4z"/>',
    home_win:
      `<path d="${HOUSE}"/>` +
      '<path class="f" d="M9 10.8h6v2.6a3 3 0 0 1-2.2 2.9v1.6h1.7l.5 2.1H9l.5-2.1h1.7v-1.6A3 3 0 0 1 9 13.4z"/>',

    /* Rivaler */
    upper_hand:
      '<path d="M4 3.5l11 11M20 3.5l-11 11M12.6 16.6l4-4M7.4 12.6l4 4M15.6 15.6l3.6 3.6M8.4 15.6l-3.6 3.6"/>' +
      '<circle cx="20" cy="20" r="1.1"/><circle cx="4" cy="20" r="1.1"/>',
    nemesis:
      '<circle cx="15.5" cy="7.5" r="3.1"/><path d="M10.4 18.6c.6-3.2 2.6-5 5.1-5s4.5 1.8 5.1 5"/>' +
      '<circle cx="8.5" cy="10" r="3.1"/><path d="M2.8 21c.6-3.4 2.8-5.3 5.7-5.3s5.1 1.9 5.7 5.3"/>',
    dominance: '<path d="M12 3l7.5 3v5.5c0 4.8-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.7-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',

    /* Roliga */
    bridesmaid:
      '<circle cx="8.6" cy="6.8" r="2.2"/><circle cx="15.4" cy="6.8" r="2.2"/><circle cx="12" cy="4.2" r="2.2"/>' +
      '<path d="M9.4 9l2.6 4.6M14.6 9 12 13.6M12 6.4v7.2M8.8 13.6h6.4L12 21z"/>',
    fourth_3: `${num(10.8, 19, '4', 15)}<path d="M19.4 2.5l-2.2 4.3H20l-2.2 4.4"/>`,
    seven_3:
      `${num(10.4, 19.2, '7', 15)
      }<circle class="f" cx="17.6" cy="4.6" r="1.5"/><circle class="f" cx="20.4" cy="4.6" r="1.5"/><circle class="f" cx="17.6" cy="7.4" r="1.5"/><circle class="f" cx="20.4" cy="7.4" r="1.5"/>`,
    jumbo:
      '<circle cx="11" cy="12.6" r="5.8"/><path d="M11 12.6a1.2 1.2 0 0 1 2.4 0a2.4 2.4 0 0 1-4.8 0a3.6 3.6 0 0 1 7.2 0"/>' +
      '<path d="M2.5 18.6h14.6c1.8 0 3.2-1.2 3.6-2.9l.5-2.4M20.8 13.4l-.6-3.6M20.8 13.4l1.4-3.2"/>' +
      '<circle class="f" cx="20.1" cy="9.4" r=".95"/><circle class="f" cx="22.3" cy="9.9" r=".95"/>',
    same_spot:
      '<path d="M3.5 6v14.5M20.5 6v14.5M2 20.5h3M19 20.5h3"/><path d="M3.5 8.5c3 7 14 7 17 0"/><path d="M3.5 8.5l2.4 1.6M20.5 8.5l-2.4 1.6"/>',
    mr_middle:
      '<path d="M12 4.6v15.9M8.5 20.5h7M4.5 7h15"/><circle class="f" cx="12" cy="3.8" r="1.2"/>' +
      '<path d="M4.5 7 2.2 12.4M4.5 7l2.3 5.4M19.5 7l-2.3 5.4M19.5 7l2.3 5.4M2 12.4a2.5 2.5 0 0 0 5 0zM17 12.4a2.5 2.5 0 0 0 5 0z"/>',
    yo_yo:
      '<path d="M12 2.5v7"/><circle cx="12" cy="15" r="5.6"/><circle cx="12" cy="15" r="2"/>' +
      '<path d="M4.6 9.5c-1.2 1.6-1.6 3.2-1.3 4.8M19.4 9.5c1.2 1.6 1.6 3.2 1.3 4.8"/>',
    free_fall:
      '<path d="M3.5 11a8.5 7 0 0 1 17 0"/><path d="M3.5 11c1.4-1 2.8-1 4.25 0 1.4-1 2.8-1 4.25 0 1.4-1 2.8-1 4.25 0 1.4-1 2.8-1 4.25 0"/>' +
      '<path d="M3.5 11l7 7.3M20.5 11l-7 7.3M12 11v7"/><path d="M10.5 18h3v3h-3z"/>',
    drought_5:
      '<path d="M10 21V6a2 2 0 0 1 4 0v15"/><path d="M10 14H7.6a2.5 2.5 0 0 1-2.5-2.5V9.5M14 11.8h2.4a2.5 2.5 0 0 0 2.5-2.5V7.6"/><path d="M4.5 21h15"/>',
    top_to_bottom:
      `<path d="M3 16.5 9 6.5l11.2 12.6"/><path d="M20.6 14.2v5.3h-5.3"/><path class="d" d="M2.5 21h19"/>${star(9, 3.3, 2.4)}`,

    /* Titlar */
    t_goat:
      '<path d="M8.6 7.2C7 4.8 7.4 2.7 9.5 2.1M15.4 7.2c1.6-2.4 1.2-4.5-.9-5.1"/>' +
      '<path d="M8 7.6c-1.5.5-3 0-4-1 .5 2 1.8 3.2 3.5 3.5L9 16c.5 2 1.5 3 3 3s2.5-1 3-3l1.5-5.9c1.7-.3 3-1.5 3.5-3.5-1 1-2.5 1.5-4 1-1.3-.8-2.5-1-4-1s-2.7.2-4 1z"/>' +
      '<path d="M11 19l1 2.5 1-2.5"/><circle class="f" cx="10.2" cy="11" r=".9"/><circle class="f" cx="13.8" cy="11" r=".9"/>',
    t_medals:
      `<path d="M9.2 6.6h5.6M9.6 6.6 8 3.4h8l-1.6 3.2"/><path d="M8.6 7.6c-3 2.5-4.6 5.5-4.6 8.5 0 3 2 4.4 8 4.4s8-1.4 8-4.4c0-3-1.6-6-4.6-8.5z"/>` +
      `<circle cx="12" cy="14.6" r="3.3"/>${star(12, 14.6, 1.7)}`,
    t_decade:
      `<path d="M7.2 19.8A8.6 8.6 0 0 1 5 6.6M16.8 19.8A8.6 8.6 0 0 0 19 6.6"/>` +
      `<path d="M5.3 16.2 3.1 16.6M4.5 12.6l-2-.8M5 9l-1.5-1.4M18.7 16.2l2.2.4M19.5 12.6l2-.8M19 9l1.5-1.4"/>${
        num(12, 14.6, '10', 6.4)}`,
    t_hosts:
      '<circle cx="7.6" cy="15.8" r="3.6"/><path d="M10.2 13.2 19 4.4M16 7.4l2 2M18 5.4l1.6 1.6"/>' +
      '<path d="M3.8 9.2 3.3 5.6l2 1.5L6.8 4.6l1.5 2.5 2-1.5-.5 3.6z"/>',
    t_consistent:
      '<rect x="2.5" y="8.5" width="19" height="7" rx="1.5"/><rect x="8.5" y="10.4" width="7" height="3.2" rx="1.6"/>' +
      '<circle class="f" cx="12" cy="12" r="1"/><path d="M6 8.5v2M18 8.5v2"/>'
  };

  /* ---------- Frames ---------- */
  function polygon(n, rOut, rIn, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? rIn : rOut;
      const a = rot + (i * Math.PI) / n;
      pts.push(`${(24 + r * Math.cos(a)).toFixed(2)} ${(24 + r * Math.sin(a)).toFixed(2)}`);
    }
    return `M${pts.join('L')}z`;
  }

  const FRAMES = {
    common: { d: 'M24 3a21 21 0 1 1 0 42a21 21 0 1 1 0-42z', g: 'translate(11 11) scale(1.0833)' },
    rare: { d: 'M24 3.5 40.5 9v13.5c0 10.5-7 18-16.5 22-9.5-4-16.5-11.5-16.5-22V9z', g: 'translate(11 9.6) scale(1.0833)' },
    epic: { d: 'M24 2.5 42.6 13.25v21.5L24 45.5 5.4 34.75v-21.5z', g: 'translate(11 11) scale(1.0833)' },
    legendary: { d: polygon(16, 23, 20.6), g: 'translate(12 12)' },
    mythic: { d: polygon(8, 23.6, 18.4), g: 'translate(12.6 12.6) scale(.95)' }
  };

  const FALLBACK = medal('★', 5);

  window.PP_ACH_ICONS = G;

  /**
   * The full badge for an achievement definition.
   * opts.locked: grey glyph and a dashed frame for achievements nobody has.
   */
  window.ppAchBadge = function (def, opts = {}) {
    const f = FRAMES[def.rarity] || FRAMES.common;
    const glyph = G[def.id] || FALLBACK;
    return (
      `<svg class="pp-badge${opts.locked ? ' is-locked' : ''}" viewBox="0 0 48 48" aria-hidden="true" focusable="false">` +
      `<path class="fr" d="${f.d}"/>` +
      `<path class="fr-in" d="${f.d}" transform="translate(24 24) scale(.86) translate(-24 -24)"/>` +
      `<g class="gl" transform="${f.g}">${glyph}</g>` +
      '</svg>'
    );
  };
})();
