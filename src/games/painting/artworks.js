/**
 * Pekkas Måleri — the masterpieces in the hat, and the colour science.
 *
 * Each work is a handful of flat REGIONS: a shape plus the colour it wants.
 * That is deliberate. The 2021 competition was never about draughtsmanship
 * — you drew a slip, looked the painting up on your phone and did what you
 * could in a garden with a beer in the other hand. What actually decides
 * whether a copy reads as the original is whether you got the COLOURS
 * right, so that is what the game asks of you: mix it, then lay it down.
 *
 * A region is drawn by a path function rather than a polygon list so the
 * shapes can use curves. The same functions serve three jobs — painting
 * the reference, painting the player's canvas, and building an id-map for
 * hit-testing — which is what keeps the three from ever disagreeing.
 *
 * Every work here is in the public domain. Picasso was in the real hat but
 * is not here: his work is still in copyright.
 */

/* ------------------------------------------------------------ colour maths */

/**
 * Red-yellow-blue → RGB, the Gosset & Chen cube.
 *
 * Paint mixes subtractively and screens add. Mixing the player's pigments
 * in RGB would make blue and yellow come out grey, which is the one result
 * that would tell everyone the mixing is fake — so the pigments live in
 * RYB and only become RGB at the end.
 */
const RYB_CORNERS = [
  [1, 1, 1], // 000 · no pigment: the white of the canvas
  [1, 0, 0], // R
  [1, 1, 0], // Y
  [1, 0.5, 0], // RY  orange
  [0.163, 0.373, 0.6], // B
  [0.5, 0.0, 0.5], // RB  purple
  [0.0, 0.66, 0.2], // YB  green
  [0.2, 0.094, 0.0] // RYB dark brown
];

function rybToRgb(r, y, b) {
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const wr = i & 1 ? r : 1 - r;
      const wy = i & 2 ? y : 1 - y;
      const wb = i & 4 ? b : 1 - b;
      v += wr * wy * wb * RYB_CORNERS[i][c];
    }
    out[c] = v;
  }
  return out;
}

/**
 * The colour on the palette right now, from drops of each pigment.
 * White tints, black shades, and the three chromatics set the hue.
 */
export function mixPigments(drops) {
  const { r = 0, y = 0, b = 0, w = 0, k = 0 } = drops;
  const chroma = r + y + b;
  if (chroma + w + k <= 0) return [0.93, 0.91, 0.86];
  let base = [0.93, 0.91, 0.86];
  if (chroma > 0) {
    const m = Math.max(r, y, b);
    base = rybToRgb(r / m, y / m, b / m);
  }
  const total = chroma + w + k;
  const tint = w / total;
  const shade = k / total;
  return base.map((c, i) => {
    const lit = c + (1 - c) * tint;
    return lit * (1 - shade) + [0.07, 0.06, 0.06][i] * shade;
  });
}

/* --- Perceptual distance. Scoring in RGB would call a dark navy and a
   dark brown near-identical and punish two pale creams that anyone can
   tell apart, so the verdict is delivered in Lab. --- */

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]) {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  // sRGB → XYZ (D65)
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** ΔE between two 0..1 RGB triplets. Under ~6 nobody would call it wrong. */
export function colourDistance(a, b) {
  const la = rgbToLab(a);
  const lb = rgbToLab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

export function hexToRgb(hex) {
  return [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
}

export function rgbToCss([r, g, b]) {
  const c = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${c(r)},${c(g)},${c(b)})`;
}

/* ------------------------------------------------------------- the works */

// Shapes are written in a 0..1 square and scaled to whatever canvas size
// the texture happens to be, so the art is resolution-independent.
const P = (ctx, W, H, pts) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();
};

const band = (ctx, W, H, y0, y1, wob) => {
  ctx.beginPath();
  ctx.moveTo(0, y0 * H);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ctx.lineTo(t * W, (y0 + Math.sin(t * Math.PI * 2 + wob) * 0.035) * H);
  }
  ctx.lineTo(W, y1 * H);
  for (let i = 10; i >= 0; i--) {
    const t = i / 10;
    ctx.lineTo(t * W, (y1 + Math.sin(t * Math.PI * 2 + wob + 0.6) * 0.035) * H);
  }
  ctx.closePath();
};

const blob = (ctx, W, H, cx, cy, rx, ry, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(cx * W, cy * H, rx * W, ry * H, rot, 0, Math.PI * 2);
  ctx.closePath();
};

export const ARTWORKS = [
  {
    id: 'skriet',
    title: 'Skriet',
    artist: 'Edvard Munch',
    year: 1893,
    note: 'Verket som tog hem Pekkas Pokal 2021 — Olov Melanders tolkning.',
    regions: [
      { name: 'Himlen överst', color: 0xd9432a, path: (c, W, H) => band(c, W, H, -0.05, 0.16, 0) },
      { name: 'Kvällsljuset', color: 0xe8762c, path: (c, W, H) => band(c, W, H, 0.16, 0.3, 1.1) },
      { name: 'Gula strimman', color: 0xefa93f, path: (c, W, H) => band(c, W, H, 0.3, 0.42, 2.2) },
      { name: 'Fjorden', color: 0x2b4a63, path: (c, W, H) => band(c, W, H, 0.42, 0.62, 0.4) },
      { name: 'Vattnet djupt', color: 0x182f45, path: (c, W, H) => band(c, W, H, 0.62, 1.05, 1.7) },
      {
        name: 'Bron',
        color: 0x6d4526,
        path: (c, W, H) => P(c, W, H, [[0, 1.02], [0.42, 0.42], [0.62, 0.42], [0.34, 1.02]])
      },
      {
        name: 'Räcket',
        color: 0x3a2415,
        path: (c, W, H) => P(c, W, H, [[0.42, 0.42], [0.62, 0.42], [0.66, 0.47], [0.5, 0.47]])
      },
      {
        name: 'Gestalten',
        color: 0x241d17,
        path: (c, W, H) => P(c, W, H, [[0.24, 1.02], [0.2, 0.62], [0.3, 0.5], [0.42, 0.62], [0.4, 1.02]])
      },
      { name: 'Ansiktet', color: 0xd6bb8a, path: (c, W, H) => blob(c, W, H, 0.31, 0.46, 0.062, 0.085) }
    ]
  },
  {
    id: 'monalisa',
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    year: 1503,
    note: 'Låg i hatten 2021.',
    regions: [
      { name: 'Himlen', color: 0x93a89f, path: (c, W, H) => P(c, W, H, [[0, -0.02], [1, -0.02], [1, 0.34], [0, 0.34]]) },
      { name: 'Landskapet', color: 0x6d6a44, path: (c, W, H) => P(c, W, H, [[0, 0.34], [1, 0.34], [1, 0.62], [0, 0.62]]) },
      { name: 'Marken', color: 0x4a4028, path: (c, W, H) => P(c, W, H, [[0, 0.62], [1, 0.62], [1, 1.02], [0, 1.02]]) },
      {
        name: 'Klänningen',
        color: 0x2e2618,
        path: (c, W, H) => P(c, W, H, [[0.17, 1.02], [0.3, 0.58], [0.7, 0.58], [0.85, 1.02]])
      },
      { name: 'Slöjan', color: 0x35291a, path: (c, W, H) => blob(c, W, H, 0.5, 0.35, 0.2, 0.2) },
      { name: 'Ansiktet', color: 0xc8a077, path: (c, W, H) => blob(c, W, H, 0.5, 0.35, 0.135, 0.165) },
      { name: 'Halsen', color: 0xbb926a, path: (c, W, H) => P(c, W, H, [[0.42, 0.47], [0.58, 0.47], [0.6, 0.6], [0.4, 0.6]]) },
      { name: 'Ärmen', color: 0x8a6a33, path: (c, W, H) => P(c, W, H, [[0.28, 0.78], [0.72, 0.78], [0.76, 0.94], [0.24, 0.94]]) }
    ]
  },
  {
    id: 'parlorhange',
    title: 'Flicka med pärlörhänge',
    artist: 'Johannes Vermeer',
    year: 1665,
    note: 'Vermeers mest ikoniska verk — låg i hatten 2021.',
    regions: [
      { name: 'Mörkret bakom', color: 0x14110f, path: (c, W, H) => P(c, W, H, [[-0.02, -0.02], [1.02, -0.02], [1.02, 1.02], [-0.02, 1.02]]) },
      { name: 'Jackan', color: 0x6b5230, path: (c, W, H) => P(c, W, H, [[0.1, 1.02], [0.24, 0.72], [0.78, 0.72], [0.92, 1.02]]) },
      { name: 'Kragen', color: 0xe6e0d0, path: (c, W, H) => P(c, W, H, [[0.34, 0.78], [0.5, 0.68], [0.66, 0.78], [0.5, 0.86]]) },
      { name: 'Turbanen blå', color: 0x2a5f9e, path: (c, W, H) => blob(c, W, H, 0.5, 0.26, 0.21, 0.17) },
      {
        name: 'Turbansvansen gul',
        color: 0xc9a03a,
        path: (c, W, H) => P(c, W, H, [[0.62, 0.3], [0.74, 0.34], [0.72, 0.62], [0.62, 0.58]])
      },
      { name: 'Ansiktet', color: 0xd9b58d, path: (c, W, H) => blob(c, W, H, 0.48, 0.42, 0.15, 0.19) },
      { name: 'Pärlan', color: 0xcdd3d6, path: (c, W, H) => blob(c, W, H, 0.6, 0.53, 0.032, 0.04) }
    ]
  },
  {
    id: 'stjarnenatten',
    title: 'Stjärnenatten',
    artist: 'Vincent van Gogh',
    year: 1889,
    note: 'Alla vill ha den. Ingen klarar virvlarna.',
    regions: [
      { name: 'Natthimlen', color: 0x1b3a6d, path: (c, W, H) => P(c, W, H, [[-0.02, -0.02], [1.02, -0.02], [1.02, 0.74], [-0.02, 0.74]]) },
      {
        name: 'Virveln',
        color: 0x4a7ab5,
        path: (c, W, H) => blob(c, W, H, 0.46, 0.36, 0.3, 0.17, -0.2)
      },
      { name: 'Månen', color: 0xf3c642, path: (c, W, H) => blob(c, W, H, 0.83, 0.16, 0.075, 0.095) },
      { name: 'Stjärnorna', color: 0xf0d878, path: (c, W, H) => blob(c, W, H, 0.2, 0.18, 0.055, 0.07) },
      { name: 'Kullarna', color: 0x33564a, path: (c, W, H) => P(c, W, H, [[-0.02, 0.74], [0.3, 0.66], [0.7, 0.72], [1.02, 0.66], [1.02, 0.86], [-0.02, 0.86]]) },
      { name: 'Byn', color: 0x25333f, path: (c, W, H) => P(c, W, H, [[-0.02, 0.86], [1.02, 0.86], [1.02, 1.02], [-0.02, 1.02]]) },
      {
        name: 'Cypressen',
        color: 0x1b2a1c,
        path: (c, W, H) => P(c, W, H, [[0.06, 1.02], [0.02, 0.5], [0.1, 0.08], [0.19, 0.46], [0.2, 1.02]])
      },
      { name: 'Kyrktornet', color: 0x161f28, path: (c, W, H) => P(c, W, H, [[0.5, 0.98], [0.53, 0.68], [0.56, 0.98]]) }
    ]
  },
  {
    id: 'nattvarden',
    title: 'Nattvarden',
    artist: 'Leonardo da Vinci',
    year: 1495,
    note: 'Tretton figurer på tid. Lycka till.',
    regions: [
      { name: 'Salens väggar', color: 0x7d735c, path: (c, W, H) => P(c, W, H, [[-0.02, -0.02], [1.02, -0.02], [1.02, 1.02], [-0.02, 1.02]]) },
      { name: 'Taket', color: 0x554d3d, path: (c, W, H) => P(c, W, H, [[-0.02, -0.02], [1.02, -0.02], [0.78, 0.2], [0.22, 0.2]]) },
      { name: 'Fönstret', color: 0xa7bcc4, path: (c, W, H) => P(c, W, H, [[0.42, 0.24], [0.58, 0.24], [0.58, 0.5], [0.42, 0.5]]) },
      { name: 'Duken', color: 0xd9d3c1, path: (c, W, H) => P(c, W, H, [[0.02, 0.72], [0.98, 0.72], [0.98, 0.9], [0.02, 0.9]]) },
      { name: 'Kristi mantel röd', color: 0x8f3a34, path: (c, W, H) => P(c, W, H, [[0.44, 0.72], [0.47, 0.42], [0.53, 0.42], [0.5, 0.72]]) },
      { name: 'Kristi mantel blå', color: 0x39557f, path: (c, W, H) => P(c, W, H, [[0.5, 0.72], [0.53, 0.42], [0.58, 0.44], [0.56, 0.72]]) },
      { name: 'Lärjungarna vänster', color: 0x4f4334, path: (c, W, H) => P(c, W, H, [[0.02, 0.72], [0.06, 0.44], [0.4, 0.46], [0.42, 0.72]]) },
      { name: 'Lärjungarna höger', color: 0x5c4a38, path: (c, W, H) => P(c, W, H, [[0.6, 0.72], [0.62, 0.46], [0.94, 0.44], [0.98, 0.72]]) }
    ]
  }
];

/* --------------------------------------------------------------- painting */

/** The reference: every region filled with the colour it wants. */
export function paintReference(ctx, work, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#efece3';
  ctx.fillRect(0, 0, W, H);
  work.regions.forEach((rg) => {
    rg.path(ctx, W, H);
    ctx.fillStyle = rgbToCss(hexToRgb(rg.color));
    ctx.fill();
  });
}

/**
 * The player's canvas: painted regions in whatever they mixed, the rest
 * bare primed canvas with the drawing showing through.
 */
export function paintPlayer(ctx, work, W, H, painted, selected, t) {
  ctx.clearRect(0, 0, W, H);
  // Primed linen, with a little tooth
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f4f1e6');
  g.addColorStop(1, '#e6e1d2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  work.regions.forEach((rg, i) => {
    const got = painted[i];
    rg.path(ctx, W, H);
    if (got) {
      ctx.fillStyle = rgbToCss(got);
      ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, W * 0.004);
    ctx.strokeStyle = got ? 'rgba(30,24,16,0.18)' : 'rgba(60,50,36,0.5)';
    ctx.stroke();
  });

  // The region you are about to lay down pulses, so you can see the target
  if (selected >= 0 && !painted[selected]) {
    const pulse = 0.35 + Math.sin(t * 6) * 0.22;
    work.regions[selected].path(ctx, W, H);
    ctx.fillStyle = `rgba(242,193,78,${pulse * 0.5})`;
    ctx.fill();
    ctx.lineWidth = Math.max(2.5, W * 0.008);
    ctx.strokeStyle = `rgba(255,214,120,${0.5 + pulse})`;
    ctx.stroke();
  }
}

/** The id-map used to turn a tap on the canvas into a region index. */
export function paintIdMap(ctx, work, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  work.regions.forEach((rg, i) => {
    rg.path(ctx, W, H);
    ctx.fillStyle = `rgb(${i + 1},0,0)`;
    ctx.fill();
  });
}
