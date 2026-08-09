/**
 * Pekkas Måleri — the masterpieces in the hat, and the colour science.
 *
 * Each work is a set of REGIONS: a shape plus the colour it wants. That is
 * deliberate. The 2021 competition was never about draughtsmanship — you
 * drew a slip, looked the painting up on your phone and did what you could
 * in a garden with a beer in the other hand. What actually decides whether
 * a copy reads as the original is whether you got the COLOURS right, so
 * that is what the game asks of you: mix it, then lay it down.
 *
 * The drawing is therefore already on the canvas when you start, the way it
 * would be if someone had sketched it up for you: every work carries an INK
 * pass — contours, faces, window bars, brush direction — drawn over the
 * regions in both the reference and the player's canvas. That is what lets
 * a motif read as Vermeer rather than as a pile of ellipses without asking
 * the player to paint sixty separate fields.
 *
 * Shapes are Catmull-Rom splines through control points rather than polygon
 * lists, because almost nothing in a painting is straight. All coordinates
 * live in a 0..1 square and are scaled to whatever canvas is being drawn, so
 * the same functions serve three jobs — the reference, the player's canvas
 * and the id-map used for hit-testing — which is what keeps the three from
 * ever disagreeing about where a region is.
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

/** Same colour, pushed toward white (k > 0) or black (k < 0). */
function shiftCss([r, g, b], k, alpha) {
  const f = (v) => {
    const x = k > 0 ? v + (1 - v) * k : v * (1 + k);
    return Math.round(Math.max(0, Math.min(1, x)) * 255);
  };
  return `rgba(${f(r)},${f(g)},${f(b)},${alpha})`;
}

/* ------------------------------------------------------- shape primitives */

/*
 * None of these call beginPath(). The renderer opens the path and the region
 * adds one or more subpaths to it, so a region like "the two figures on the
 * bridge" or "the six windows" is still a single fill and therefore still a
 * single id in the hit-test map.
 */

/** Closed or open Catmull-Rom spline through points given in 0..1 space. */
const S = (ctx, W, H, pts, closed = true, tension = 1) => {
  const n = pts.length;
  const at = (i) => {
    const j = closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
    return [pts[j][0] * W, pts[j][1] * H];
  };
  const start = at(0);
  ctx.moveTo(start[0], start[1]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    ctx.bezierCurveTo(
      p1[0] + ((p2[0] - p0[0]) / 6) * tension,
      p1[1] + ((p2[1] - p0[1]) / 6) * tension,
      p2[0] - ((p3[0] - p1[0]) / 6) * tension,
      p2[1] - ((p3[1] - p1[1]) / 6) * tension,
      p2[0],
      p2[1]
    );
  }
  if (closed) ctx.closePath();
};

/** Straight-sided polygon, for the things that really are built: walls, beams. */
const P = (ctx, W, H, pts) => {
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
  ctx.closePath();
};

const blob = (ctx, W, H, cx, cy, rx, ry, rot = 0) => {
  ctx.moveTo((cx + rx * Math.cos(rot)) * W, (cy + rx * Math.sin(rot)) * H);
  ctx.ellipse(cx * W, cy * H, rx * W, ry * H, rot, 0, Math.PI * 2);
  ctx.closePath();
};

/** A wobbling horizontal edge, as a list of spline points running off both sides. */
const wave = (y, amp = 0.03, freq = 1.2, phase = 0, n = 6) => {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([-0.09 + t * 1.18, y + Math.sin(t * Math.PI * 2 * freq + phase) * amp]);
  }
  return out;
};

/** The band between two wavy edges. Munch's whole sky is six of these. */
const ribbon = (ctx, W, H, top, bot) => S(ctx, W, H, top.concat(bot.slice().reverse()), true, 0.8);

/**
 * A tapering spiral arm. Van Gogh's sky is the only reason this exists, and
 * it is the one shape that makes Stjärnenatten read as Stjärnenatten.
 */
const swirl = (ctx, W, H, cx, cy, r0, r1, turns, w0, w1, rot, dir = 1) => {
  const N = 54;
  const outer = [];
  const inner = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = rot + dir * t * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * t;
    const hw = (w0 + (w1 - w0) * t) / 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    outer.push([(cx + ca * (r + hw)) * W, (cy + sa * (r + hw)) * H]);
    inner.push([(cx + ca * (r - hw)) * W, (cy + sa * (r - hw)) * H]);
  }
  ctx.moveTo(outer[0][0], outer[0][1]);
  for (let i = 1; i <= N; i++) ctx.lineTo(outer[i][0], outer[i][1]);
  for (let i = N; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
  ctx.closePath();
};

/* --------------------------------------------------------------- ink pass */

const INK = 'rgba(30,23,17,';

/** One drawn line, in the same 0..1 space as the regions. */
function ink(ctx, W, H, pts, width = 0.005, alpha = 0.55, closed = false) {
  ctx.beginPath();
  S(ctx, W, H, pts, closed);
  ctx.lineWidth = Math.max(0.8, width * W);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `${INK}${alpha})`;
  ctx.stroke();
}

/** A filled ink mark — pupils, mouths, the dark of a doorway. */
function mark(ctx, W, H, cx, cy, rx, ry, rot = 0, alpha = 0.7) {
  ctx.beginPath();
  blob(ctx, W, H, cx, cy, rx, ry, rot);
  ctx.fillStyle = `${INK}${alpha})`;
  ctx.fill();
}

/* ------------------------------------------------------------- the works */

/* Van Gogh's stars, kept in one place: the halo, the star and the ink ring
   that circles it all have to sit on the same centres. Positions read off
   the painting — the big one is low and left of centre, not up in the
   corner where a tidy mind would put it. */
const STARS = [
  [0.115, 0.045, 0.02],
  [0.36, 0.035, 0.02],
  [0.615, 0.09, 0.028],
  [0.7, 0.225, 0.026],
  [0.125, 0.47, 0.026],
  [0.345, 0.53, 0.04]
];

/* The twelve apostles' heads. The faces, the pairs of eyes and the shoulders
   under them all key off this one list. */
const APOSTLES = [
  [0.062, 0.545], [0.118, 0.512], [0.176, 0.552], [0.278, 0.542], [0.332, 0.5],
  [0.392, 0.54], [0.61, 0.542], [0.664, 0.498], [0.722, 0.542], [0.825, 0.555],
  [0.881, 0.512], [0.938, 0.552]
];

/*
 * Munch's walkway is strict one-point perspective, and EVERYTHING on it —
 * the deck's near edge, both rails, the posts between them, the two figures
 * further along — runs to the same vanishing point. Letting the deck
 * converge somewhere of its own is what left the railing hanging over open
 * water instead of standing on the boards.
 */
/* Munch's walkway runs away to the UPPER LEFT, which puts the fjord on the
   right and the boards under the bottom-left corner. Run it the other way
   and the picture is a mirror image of the one everybody knows. */
const BRIDGE_VP = [0.03, 0.455];
const BRIDGE_NEAR = 1.06;
/** A point t of the way from the near edge of the frame to the vanishing point. */
const alongBridge = (y, t) => [
  BRIDGE_NEAR + (BRIDGE_VP[0] - BRIDGE_NEAR) * t,
  y + (BRIDGE_VP[1] - y) * t
];
/** The deck edge, the rails: a triangle closing on the vanishing point. */
const bridgeRail = (c, W, H, y0, y1) => P(c, W, H, [[BRIDGE_NEAR, y0], BRIDGE_VP, [BRIDGE_NEAR, y1]]);
/* Where the boards meet the railing at the near edge of the frame. The rails
   stand ON this line, so it has to sit just under the lower rail — put it off
   the bottom of the canvas instead and a wedge of fjord opens up underneath
   the railing, which is the one place water cannot be.
   The rail is shallower than the deck edge because it is higher off the
   ground; both still run to the same point. Set them too high and the
   railing crosses the screamer's face instead of passing under his hands. */
const DECK_EDGE_Y = 0.93;
const RAIL_TOP_Y = 0.745;

export const ARTWORKS = [
  {
    id: 'skriet',
    title: 'Skriet',
    artist: 'Edvard Munch',
    year: 1893,
    note: 'Verket som tog hem Pekkas Pokal 2021 — Olov Melanders tolkning.',
    regions: [
      {
        name: 'Himlens glöd',
        color: 0xc4392a,
        path: (c, W, H) => ribbon(c, W, H, wave(-0.09, 0, 0), wave(0.115, 0.03, 1.1, 0.4))
      },
      {
        name: 'Brinnande bandet',
        color: 0xdc6029,
        path: (c, W, H) => ribbon(c, W, H, wave(0.115, 0.03, 1.1, 0.4), wave(0.2, 0.032, 0.9, 1.5))
      },
      {
        name: 'Orange strimman',
        color: 0xee8b34,
        path: (c, W, H) => ribbon(c, W, H, wave(0.2, 0.032, 0.9, 1.5), wave(0.288, 0.028, 1.15, 2.7))
      },
      {
        name: 'Gula ljuset',
        color: 0xf2b648,
        path: (c, W, H) => ribbon(c, W, H, wave(0.288, 0.028, 1.15, 2.7), wave(0.362, 0.024, 1, 3.9))
      },
      {
        name: 'Himlen ljusnar',
        color: 0xe0bd7e,
        path: (c, W, H) => ribbon(c, W, H, wave(0.362, 0.024, 1, 3.9), wave(0.44, 0.018, 1.3, 5))
      },
      {
        name: 'Fjorden',
        color: 0x35708c,
        path: (c, W, H) => ribbon(c, W, H, wave(0.44, 0.018, 1.3, 5), wave(0.55, 0.03, 0.8, 0.9))
      },
      {
        name: 'Vattnet djupt',
        color: 0x1c3b5a,
        path: (c, W, H) => ribbon(c, W, H, wave(0.55, 0.03, 0.8, 0.9), wave(1.08, 0, 0))
      },
      {
        name: 'Landtungan',
        color: 0x2e4a4c,
        path: (c, W, H) => S(c, W, H, [
          [1.09, 0.475], [0.92, 0.44], [0.76, 0.452], [0.67, 0.487],
          [0.8, 0.52], [1.09, 0.53]
        ])
      },
      {
        name: 'Bron',
        color: 0x7d4a22,
        // We are standing ON the walkway, so its far edge is off frame to
        // the right and the only boundary we see is the railed near edge.
        // Running both edges to the vanishing point instead draws a brown
        // triangle with a needle apex, which reads as a mountain.
        path: (c, W, H) => P(c, W, H, [
          [BRIDGE_NEAR, DECK_EDGE_Y], BRIDGE_VP, [-0.06, 0.5], [-0.06, 1.06], [BRIDGE_NEAR, 1.06]
        ])
      },
      {
        name: 'Räcket',
        color: 0x452812,
        path: (c, W, H) => {
          bridgeRail(c, W, H, RAIL_TOP_Y, 0.79);
          bridgeRail(c, W, H, 0.855, 0.9);
        }
      },
      {
        // Standing ON the boards: their feet sit on the deck edge line at
        // the point along the walkway where each of them is.
        name: 'Gestalterna på bron',
        color: 0x241c18,
        path: (c, W, H) => {
          [[0.85, 0.02, 0.1], [0.93, 0.015, 0.075]].forEach(([t, hw, tall]) => {
            const [x, y] = alongBridge(DECK_EDGE_Y, t);
            const cx = x + hw;
            S(c, W, H, [
              [cx, y - tall], [cx + hw, y - tall * 0.86], [cx + hw, y - tall * 0.28],
              [cx + hw * 0.55, y], [cx - hw * 0.55, y],
              [cx - hw, y - tall * 0.28], [cx - hw, y - tall * 0.86]
            ]);
          });
        }
      },
      {
        // He stands mid-frame on the boards, the railing running away behind
        // his shoulders to the vanishing point.
        name: 'Skriets rock',
        color: 0x1f2229,
        path: (c, W, H) => S(c, W, H, [
          [0.465, 0.452], [0.522, 0.512], [0.552, 0.66], [0.592, 0.86], [0.622, 1.06],
          [0.324, 1.06], [0.352, 0.83], [0.384, 0.63], [0.412, 0.5]
        ], true, 0.85)
      },
      {
        name: 'Händerna',
        color: 0xc8a678,
        path: (c, W, H) => {
          S(c, W, H, [[0.395, 0.5], [0.422, 0.53], [0.416, 0.586], [0.384, 0.6], [0.362, 0.565], [0.366, 0.515]]);
          S(c, W, H, [[0.55, 0.498], [0.578, 0.512], [0.582, 0.568], [0.556, 0.592], [0.529, 0.575], [0.525, 0.522]]);
        }
      },
      {
        name: 'Ansiktet',
        color: 0xd9bc8c,
        path: (c, W, H) => S(c, W, H, [
          [0.47, 0.378], [0.525, 0.42], [0.536, 0.5], [0.506, 0.566],
          [0.47, 0.588], [0.434, 0.566], [0.404, 0.5], [0.415, 0.42]
        ])
      }
    ],
    detail(ctx, W, H) {
      // The sky is a set of long parallel strokes; Munch never blended them
      for (let i = 0; i < 5; i++) {
        const y = 0.05 + i * 0.082;
        ink(ctx, W, H, wave(y, 0.03, 1.05, 0.4 + i * 0.9, 8), 0.004, 0.13);
      }
      // Posts standing between the top rail and the deck, spaced so they
      // crowd toward the vanishing point the way real ones do
      for (let i = 0; i < 8; i++) {
        const t = 1 - (1 - i / 8) ** 1.6;
        const top = alongBridge(RAIL_TOP_Y, t);
        const foot = alongBridge(DECK_EDGE_Y, t);
        ink(ctx, W, H, [top, foot], 0.005 * (1 - t) + 0.001, 0.32);
      }
      // The rails themselves, drawn on top so the run of the bridge reads
      ink(ctx, W, H, [[BRIDGE_NEAR, RAIL_TOP_Y], BRIDGE_VP], 0.0035, 0.3);
      ink(ctx, W, H, [[BRIDGE_NEAR, 0.9], BRIDGE_VP], 0.003, 0.24);
      ink(ctx, W, H, [[BRIDGE_NEAR, DECK_EDGE_Y], BRIDGE_VP], 0.0035, 0.26);
      // Planks. Every one starts below the deck edge and ends at the same
      // vanishing point, so it can never stray off the boards onto water.
      [0.12, 0.4, 0.68, 0.94].forEach((x) => {
        ink(ctx, W, H, [[x, 1.06], BRIDGE_VP], 0.0032, 0.2);
      });
      // The head: hollow eyes, the open mouth, the hands pressed to the skull
      mark(ctx, W, H, 0.45, 0.462, 0.021, 0.014, -0.1, 0.55);
      mark(ctx, W, H, 0.496, 0.462, 0.021, 0.014, 0.1, 0.55);
      mark(ctx, W, H, 0.472, 0.529, 0.019, 0.036, 0, 0.72);
      ink(ctx, W, H, [[0.453, 0.494], [0.472, 0.508], [0.491, 0.494]], 0.0035, 0.4);
      ink(ctx, W, H, [
        [0.415, 0.42], [0.47, 0.378], [0.525, 0.42]
      ], 0.005, 0.35);
      // The robe folds
      ink(ctx, W, H, [[0.45, 0.6], [0.468, 0.78], [0.48, 1.0]], 0.005, 0.28);
      ink(ctx, W, H, [[0.395, 0.66], [0.388, 0.83], [0.393, 1.02]], 0.004, 0.22);
      ink(ctx, W, H, [[0.532, 0.66], [0.55, 0.83], [0.565, 1.02]], 0.004, 0.22);
    }
  },
  {
    id: 'monalisa',
    title: 'Mona Lisa',
    artist: 'Leonardo da Vinci',
    year: 1503,
    note: 'Låg i hatten 2021. Och nej — hon har inga ögonbryn.',
    regions: [
      {
        name: 'Himlen',
        color: 0xa9c0c1,
        path: (c, W, H) => P(c, W, H, [[-0.04, -0.04], [1.04, -0.04], [1.04, 0.24], [-0.04, 0.24]])
      },
      {
        name: 'Dimmiga bergen',
        color: 0x8ba2ac,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.22], [0.08, 0.155], [0.2, 0.2], [0.34, 0.17], [0.5, 0.21],
          [0.66, 0.16], [0.82, 0.195], [1.04, 0.145], [1.04, 0.34], [-0.04, 0.34]
        ], true, 0.7)
      },
      {
        // Every band overlaps the one behind it. Butting two splines against
        // a shared y leaves a hairline of bare canvas that reads as snow.
        name: 'Sjön',
        color: 0x8fa79c,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.28], [0.2, 0.32], [0.5, 0.285], [0.78, 0.325], [1.04, 0.29],
          [1.04, 0.54], [-0.04, 0.54]
        ], true, 0.7)
      },
      {
        // Leonardo puts a winding road and a gorge on her left and green
        // rock on her right; the two halves of the landscape do not even
        // meet at the same horizon, which is half of why it feels dreamt.
        name: 'Klipporna vänster',
        color: 0x6f7248,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.3], [0.12, 0.335], [0.28, 0.4], [0.34, 0.5], [0.2, 0.56], [-0.04, 0.54]
        ], true, 0.8)
      },
      {
        name: 'Vägen höger',
        color: 0xa08a56,
        path: (c, W, H) => S(c, W, H, [
          [1.04, 0.27], [1.04, 0.58], [0.82, 0.56], [0.66, 0.47], [0.7, 0.36], [0.88, 0.29]
        ], true, 0.8)
      },
      {
        name: 'Röda jorden',
        color: 0x7c5236,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.5], [0.24, 0.545], [0.5, 0.52], [0.76, 0.56], [1.04, 0.53],
          [1.04, 1.06], [-0.04, 1.06]
        ], true, 0.7)
      },
      {
        // TWO falls of hair with the lit chest between them, not one dark
        // mass with a point in the middle — a hair shape that crosses the
        // sternum turns her into a nun. The loop runs down the outside of
        // the right fall, back up its inside, over the brow, and mirrors.
        name: 'Slöjan och håret',
        color: 0x2e2318,
        path: (c, W, H) => S(c, W, H, [
          [0.48, 0.09], [0.558, 0.126], [0.6, 0.222], [0.612, 0.335], [0.652, 0.46],
          [0.648, 0.6], [0.586, 0.586], [0.59, 0.45], [0.566, 0.33], [0.548, 0.22],
          [0.48, 0.158], [0.412, 0.22], [0.394, 0.33], [0.37, 0.45], [0.374, 0.586],
          [0.312, 0.6], [0.308, 0.46], [0.348, 0.335], [0.36, 0.222], [0.402, 0.126]
        ], true, 0.85)
      },
      {
        name: 'Ansiktet',
        color: 0xd8b183,
        path: (c, W, H) => S(c, W, H, [
          [0.48, 0.115], [0.538, 0.155], [0.558, 0.235], [0.542, 0.312],
          [0.48, 0.362], [0.418, 0.312], [0.402, 0.235], [0.422, 0.155]
        ])
      },
      {
        name: 'Halsen och bröstet',
        color: 0xcfa877,
        path: (c, W, H) => S(c, W, H, [
          [0.45, 0.33], [0.515, 0.33], [0.578, 0.45], [0.605, 0.56],
          [0.52, 0.648], [0.44, 0.648], [0.355, 0.56], [0.382, 0.45]
        ], true, 0.8)
      },
      {
        name: 'Klänningen',
        color: 0x2b2418,
        path: (c, W, H) => S(c, W, H, [
          [0.25, 0.52], [0.37, 0.588], [0.48, 0.604], [0.59, 0.588], [0.71, 0.52],
          [0.86, 0.65], [0.96, 1.06], [0.0, 1.06], [0.1, 0.65]
        ], true, 0.7)
      },
      {
        name: 'Ärmen',
        color: 0x93712f,
        path: (c, W, H) => {
          S(c, W, H, [
            [0.02, 1.06], [0.06, 0.88], [0.16, 0.785], [0.3, 0.79], [0.37, 0.86],
            [0.3, 0.955], [0.18, 1.02], [0.14, 1.06]
          ], true, 0.8);
          S(c, W, H, [[0.56, 0.855], [0.66, 0.862], [0.705, 0.95], [0.62, 1.0], [0.55, 0.945]], true, 0.8);
        }
      },
      {
        name: 'Händerna',
        color: 0xd9b287,
        path: (c, W, H) => S(c, W, H, [
          [0.3, 0.858], [0.4, 0.812], [0.53, 0.832], [0.588, 0.892],
          [0.52, 0.955], [0.39, 0.945], [0.3, 0.905]
        ], true, 0.85)
      },
      {
        name: 'Läpparna',
        color: 0xa86a58,
        path: (c, W, H) => S(c, W, H, [
          [0.448, 0.303], [0.48, 0.294], [0.512, 0.303], [0.482, 0.324]
        ], true, 0.9)
      }
    ],
    detail(ctx, W, H) {
      // The road on her left and the bridge on her right — the two bits of
      // the landscape anyone can actually point to
      ink(ctx, W, H, [[0.72, 0.55], [0.79, 0.47], [0.83, 0.39], [0.93, 0.34]], 0.005, 0.28);
      ink(ctx, W, H, [[0.02, 0.44], [0.13, 0.42], [0.24, 0.43], [0.3, 0.4]], 0.004, 0.22);
      ink(ctx, W, H, [[0.63, 0.49], [0.71, 0.48], [0.79, 0.495]], 0.006, 0.3);
      // Eyes — heavy lids, no brows. That is the thing everyone knows.
      ink(ctx, W, H, [[0.428, 0.225], [0.449, 0.211], [0.47, 0.223]], 0.005, 0.5);
      ink(ctx, W, H, [[0.491, 0.222], [0.512, 0.208], [0.533, 0.22]], 0.005, 0.5);
      mark(ctx, W, H, 0.449, 0.227, 0.009, 0.008, 0, 0.55);
      mark(ctx, W, H, 0.512, 0.224, 0.009, 0.008, 0, 0.55);
      // Nose, and the corner of the mouth that does all the work
      ink(ctx, W, H, [[0.483, 0.228], [0.491, 0.268], [0.475, 0.28]], 0.004, 0.34);
      ink(ctx, W, H, [[0.446, 0.306], [0.48, 0.313], [0.514, 0.305]], 0.0042, 0.42);
      ink(ctx, W, H, [[0.432, 0.297], [0.446, 0.306]], 0.004, 0.4);
      ink(ctx, W, H, [[0.528, 0.295], [0.514, 0.304]], 0.004, 0.4);
      // The veil's edge across her forehead, and the fall of hair in front
      // of each shoulder
      ink(ctx, W, H, [[0.412, 0.146], [0.48, 0.108], [0.548, 0.146]], 0.005, 0.28);
      ink(ctx, W, H, [[0.374, 0.28], [0.352, 0.42], [0.362, 0.57]], 0.004, 0.22);
      ink(ctx, W, H, [[0.586, 0.28], [0.608, 0.42], [0.598, 0.57]], 0.004, 0.22);
      // The embroidered neckline, and the folded hands
      ink(ctx, W, H, [[0.29, 0.534], [0.48, 0.602], [0.67, 0.534]], 0.005, 0.3);
      ink(ctx, W, H, [[0.345, 0.862], [0.42, 0.836], [0.51, 0.856]], 0.004, 0.3);
      ink(ctx, W, H, [[0.36, 0.9], [0.44, 0.882], [0.53, 0.896]], 0.004, 0.26);
      ink(ctx, W, H, [[0.18, 0.79], [0.26, 0.83], [0.31, 0.9]], 0.004, 0.22);
    }
  },
  {
    id: 'parlorhange',
    title: 'Flicka med pärlörhänge',
    artist: 'Johannes Vermeer',
    year: 1665,
    note: 'Vermeers mest ikoniska verk — låg i hatten 2021.',
    regions: [
      {
        name: 'Mörkret bakom',
        color: 0x0f0d0c,
        path: (c, W, H) => P(c, W, H, [[-0.04, -0.04], [1.04, -0.04], [1.04, 1.04], [-0.04, 1.04]])
      },
      {
        // She is turned away from us and looking back over her shoulder, so
        // the jacket climbs to the right and her back fills the right-hand
        // corner. Facing her square on loses the whole gesture of the thing.
        name: 'Jackan',
        color: 0x7d6634,
        path: (c, W, H) => S(c, W, H, [
          [0.2, 1.06], [0.3, 0.86], [0.45, 0.71], [0.6, 0.665], [0.73, 0.71],
          [0.82, 0.85], [0.97, 1.06]
        ], true, 0.75)
      },
      {
        name: 'Ryggen i skugga',
        color: 0x3a3a40,
        path: (c, W, H) => S(c, W, H, [
          [0.7, 0.66], [0.84, 0.74], [0.93, 1.06], [0.76, 1.06], [0.71, 0.84]
        ], true, 0.8)
      },
      {
        name: 'Turbanen blå',
        color: 0x4a7ab0,
        path: (c, W, H) => S(c, W, H, [
          [0.48, 0.1], [0.62, 0.145], [0.71, 0.26], [0.735, 0.4], [0.7, 0.51],
          [0.6, 0.585], [0.46, 0.6], [0.35, 0.545], [0.295, 0.42], [0.295, 0.27],
          [0.37, 0.145]
        ], true, 0.85)
      },
      {
        name: 'Turbanens veck',
        color: 0x22456f,
        path: (c, W, H) => S(c, W, H, [
          [0.6, 0.3], [0.7, 0.36], [0.722, 0.46], [0.66, 0.545], [0.575, 0.575], [0.6, 0.46]
        ], true, 0.85)
      },
      {
        name: 'Turbansvansen gul',
        color: 0xdcc98f,
        path: (c, W, H) => S(c, W, H, [
          [0.55, 0.125], [0.665, 0.16], [0.755, 0.3], [0.83, 0.5], [0.875, 0.7],
          [0.878, 0.82], [0.8, 0.83], [0.775, 0.66], [0.72, 0.46], [0.655, 0.29],
          [0.6, 0.19]
        ], true, 0.85)
      },
      {
        name: 'Ansiktet',
        color: 0xe0bd97,
        path: (c, W, H) => S(c, W, H, [
          [0.41, 0.275], [0.5, 0.315], [0.525, 0.415], [0.505, 0.505],
          [0.44, 0.585], [0.36, 0.555], [0.305, 0.46], [0.31, 0.355]
        ])
      },
      {
        name: 'Halsen',
        color: 0xc9a279,
        path: (c, W, H) => S(c, W, H, [
          [0.43, 0.555], [0.52, 0.545], [0.58, 0.6], [0.615, 0.69],
          [0.5, 0.735], [0.435, 0.68], [0.415, 0.61]
        ], true, 0.8)
      },
      {
        name: 'Kragen',
        color: 0xe9e6dc,
        path: (c, W, H) => S(c, W, H, [
          [0.44, 0.735], [0.53, 0.655], [0.65, 0.665], [0.62, 0.745], [0.52, 0.785]
        ], true, 0.8)
      },
      {
        name: 'Läpparna',
        color: 0xb8615a,
        path: (c, W, H) => S(c, W, H, [
          [0.345, 0.485], [0.385, 0.471], [0.425, 0.487], [0.386, 0.513]
        ], true, 0.9)
      },
      {
        name: 'Ögonvitorna',
        color: 0xe8e2d6,
        path: (c, W, H) => {
          blob(c, W, H, 0.352, 0.398, 0.028, 0.016, -0.05);
          blob(c, W, H, 0.455, 0.393, 0.026, 0.015, 0.05);
        }
      },
      {
        name: 'Pärlan',
        color: 0xcbd2d6,
        path: (c, W, H) => blob(c, W, H, 0.558, 0.552, 0.032, 0.038)
      },
      {
        name: 'Pärlans glans',
        color: 0xf7f6f0,
        path: (c, W, H) => blob(c, W, H, 0.547, 0.563, 0.012, 0.013)
      }
    ],
    detail(ctx, W, H) {
      // She is looking straight at you over her shoulder. All of that is in the eyes.
      mark(ctx, W, H, 0.357, 0.399, 0.013, 0.013, 0, 0.78);
      mark(ctx, W, H, 0.458, 0.394, 0.012, 0.012, 0, 0.78);
      ink(ctx, W, H, [[0.322, 0.388], [0.353, 0.376], [0.383, 0.39]], 0.005, 0.6);
      ink(ctx, W, H, [[0.428, 0.383], [0.456, 0.372], [0.484, 0.384]], 0.005, 0.6);
      ink(ctx, W, H, [[0.318, 0.364], [0.352, 0.352], [0.386, 0.364]], 0.004, 0.3);
      ink(ctx, W, H, [[0.425, 0.36], [0.456, 0.349], [0.487, 0.36]], 0.004, 0.3);
      // Nose and mouth
      ink(ctx, W, H, [[0.388, 0.405], [0.396, 0.448], [0.372, 0.462]], 0.0042, 0.35);
      ink(ctx, W, H, [[0.345, 0.487], [0.386, 0.493], [0.426, 0.487]], 0.004, 0.45);
      // The turban's front edge, the folds in the tail and the pearl's rim
      ink(ctx, W, H, [[0.3, 0.34], [0.38, 0.26], [0.5, 0.24], [0.62, 0.3]], 0.005, 0.24);
      ink(ctx, W, H, [[0.62, 0.22], [0.71, 0.35], [0.755, 0.53], [0.79, 0.72]], 0.004, 0.22);
      ink(ctx, W, H, [[0.665, 0.2], [0.755, 0.36], [0.815, 0.56], [0.845, 0.76]], 0.004, 0.18);
      ink(ctx, W, H, [[0.543, 0.527], [0.553, 0.537]], 0.004, 0.4);
      // The collar's fold and the jacket's lit edge
      ink(ctx, W, H, [[0.46, 0.73], [0.54, 0.665], [0.63, 0.685]], 0.004, 0.3);
      ink(ctx, W, H, [[0.3, 0.94], [0.37, 0.81], [0.47, 0.73]], 0.004, 0.18);
    }
  },
  {
    id: 'stjarnenatten',
    title: 'Stjärnenatten',
    artist: 'Vincent van Gogh',
    year: 1889,
    note: 'Alla vill ha den. Ingen klarar virvlarna.',
    regions: [
      {
        name: 'Natthimlen',
        color: 0x20418c,
        path: (c, W, H) => P(c, W, H, [[-0.04, -0.04], [1.04, -0.04], [1.04, 0.82], [-0.04, 0.82]])
      },
      {
        name: 'Ljusa bandet',
        color: 0x7fa8d4,
        path: (c, W, H) => ribbon(c, W, H, wave(0.56, 0.035, 1.1, 0.4), wave(0.79, 0.02, 0.9, 2.2))
      },
      {
        name: 'Stora virveln',
        color: 0x8fb6dc,
        path: (c, W, H) => swirl(c, W, H, 0.47, 0.28, 0.05, 0.24, 1.3, 0.085, 0.012, 2.5)
      },
      {
        name: 'Andra virveln',
        color: 0xa8c8e4,
        path: (c, W, H) => swirl(c, W, H, 0.65, 0.33, 0.04, 0.16, 1.1, 0.07, 0.01, -0.6, -1)
      },
      {
        name: 'Stjärnornas gloria',
        color: 0xcfe0f0,
        path: (c, W, H) => STARS.forEach(([x, y, r]) => blob(c, W, H, x, y, r * 2.1, r * 2.3))
      },
      {
        name: 'Stjärnorna',
        color: 0xf2dc86,
        path: (c, W, H) => STARS.forEach(([x, y, r]) => blob(c, W, H, x, y, r, r * 1.1))
      },
      {
        name: 'Månens sken',
        color: 0xd9c05a,
        path: (c, W, H) => blob(c, W, H, 0.895, 0.135, 0.115, 0.126)
      },
      {
        name: 'Månen',
        color: 0xf7d43e,
        // A crescent, not a disc: the outer arc swept one way, the inner arc
        // back the other. A filled circle under a halo just reads as a sun.
        path: (c, W, H) => S(c, W, H, [
          [0.888, 0.042], [0.952, 0.078], [0.972, 0.15], [0.944, 0.222], [0.878, 0.25],
          [0.928, 0.206], [0.94, 0.145], [0.924, 0.086]
        ], true, 0.95)
      },
      {
        // The hills climb to the right and break into a dark headland; the
        // village sits in the dip under them.
        name: 'Kullarna',
        color: 0x2f4a7a,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.8], [0.18, 0.775], [0.4, 0.79], [0.58, 0.73], [0.72, 0.7],
          [0.84, 0.59], [0.92, 0.555], [1.04, 0.62], [1.04, 0.92], [-0.04, 0.92]
        ], true, 0.7)
      },
      {
        name: 'Buskarna',
        color: 0x3c6b60,
        path: (c, W, H) => {
          [[0.62, 0.795, 0.06], [0.72, 0.775, 0.07], [0.82, 0.75, 0.075],
            [0.92, 0.735, 0.07], [1.0, 0.765, 0.06]].forEach(([x, y, r]) => {
            blob(c, W, H, x, y, r, r * 0.62);
          });
        }
      },
      {
        name: 'Byn',
        color: 0x1e2a3d,
        path: (c, W, H) => S(c, W, H, [
          [-0.04, 0.93], [0.12, 0.895], [0.28, 0.92], [0.44, 0.885], [0.6, 0.9],
          [0.76, 0.875], [0.92, 0.9], [1.04, 0.88], [1.04, 1.06], [-0.04, 1.06]
        ], true, 0.55)
      },
      {
        name: 'Kyrkan',
        color: 0x1a2436,
        path: (c, W, H) => {
          P(c, W, H, [[0.548, 0.96], [0.552, 0.79], [0.567, 0.63], [0.582, 0.79], [0.586, 0.96]]);
          P(c, W, H, [[0.5, 0.96], [0.5, 0.86], [0.567, 0.8], [0.632, 0.86], [0.632, 0.96]]);
        }
      },
      {
        name: 'Husens fönster',
        color: 0xe8b64a,
        path: (c, W, H) => {
          [[0.13, 0.94], [0.24, 0.955], [0.35, 0.935], [0.46, 0.95], [0.66, 0.93],
            [0.75, 0.95], [0.86, 0.925], [0.95, 0.945]].forEach(([x, y]) => {
            P(c, W, H, [[x, y], [x + 0.024, y], [x + 0.024, y + 0.028], [x, y + 0.028]]);
          });
        }
      },
      {
        // A green flame that runs the whole height of the canvas and is
        // nearly a third of its width. Drawn thin it is a lamp post.
        name: 'Cypressen',
        color: 0x22301c,
        path: (c, W, H) => S(c, W, H, [
          [0.195, 0.02], [0.225, 0.22], [0.26, 0.34], [0.295, 0.46], [0.26, 0.56],
          [0.36, 0.66], [0.32, 0.76], [0.43, 0.86], [0.42, 1.06], [0.115, 1.06],
          [0.105, 0.88], [0.16, 0.78], [0.095, 0.66], [0.165, 0.54], [0.12, 0.42],
          [0.17, 0.28], [0.165, 0.12]
        ], true, 0.92)
      }
    ],
    detail(ctx, W, H) {
      // Van Gogh's sky is nothing but direction. The strokes ARE the picture.
      for (let i = 0; i < 5; i++) {
        const r = 0.08 + i * 0.042;
        const pts = [];
        for (let j = 0; j <= 22; j++) {
          const t = j / 22;
          const a = 2.5 + t * 1.25 * Math.PI * 2;
          const rr = r + t * 0.13;
          pts.push([0.47 + Math.cos(a) * rr, 0.28 + Math.sin(a) * rr]);
        }
        ink(ctx, W, H, pts, 0.0035, 0.16);
      }
      for (let i = 0; i < 3; i++) {
        const pts = [];
        for (let j = 0; j <= 18; j++) {
          const t = j / 18;
          const a = -0.6 - t * 1.1 * Math.PI * 2;
          const rr = 0.05 + i * 0.034 + t * 0.1;
          pts.push([0.65 + Math.cos(a) * rr, 0.33 + Math.sin(a) * rr]);
        }
        ink(ctx, W, H, pts, 0.003, 0.14);
      }
      // Halo rings round the stars, the way he ringed each one
      STARS.map(([x, y, r]) => [x, y, r * 1.5]).concat([[0.895, 0.135, 0.09]]).forEach(([x, y, r]) => {
        const pts = [];
        for (let j = 0; j <= 14; j++) {
          const a = (j / 14) * Math.PI * 2;
          pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 1.1]);
        }
        ink(ctx, W, H, pts, 0.003, 0.2, true);
      });
      // The cypress is drawn in flames, not in leaves
      for (let i = 0; i < 6; i++) {
        const x = 0.135 + i * 0.045;
        ink(ctx, W, H, [
          [x + 0.06, 1.0], [x - 0.015, 0.82], [x + 0.05, 0.64], [x - 0.02, 0.46],
          [x + 0.045, 0.28], [x + 0.015, 0.1]
        ], 0.0035, 0.22);
      }
      // The spire, then gables down the village street
      ink(ctx, W, H, [[0.567, 0.63], [0.567, 0.96]], 0.004, 0.3);
      [[0.1, 0.925], [0.22, 0.945], [0.34, 0.92], [0.45, 0.94], [0.7, 0.92],
        [0.82, 0.94], [0.94, 0.915]].forEach(([x, y]) => {
        ink(ctx, W, H, [[x - 0.05, y + 0.04], [x, y - 0.028], [x + 0.05, y + 0.04]], 0.0035, 0.26);
        ink(ctx, W, H, [[x, y - 0.028], [x, y + 0.055]], 0.003, 0.16);
      });
      // The long horizontal sweep under the swirls
      ink(ctx, W, H, wave(0.66, 0.02, 1.3, 0.5, 8), 0.003, 0.16);
      ink(ctx, W, H, wave(0.73, 0.016, 1, 2, 8), 0.003, 0.16);
    }
  },
  {
    id: 'nattvarden',
    title: 'Nattvarden',
    artist: 'Leonardo da Vinci',
    year: 1495,
    note: 'Tretton figurer och en enda flyktpunkt. Lycka till.',
    regions: [
      {
        name: 'Salens bakvägg',
        color: 0x8c8168,
        path: (c, W, H) => P(c, W, H, [[-0.04, -0.04], [1.04, -0.04], [1.04, 1.06], [-0.04, 1.06]])
      },
      {
        name: 'Taket',
        color: 0x4f4737,
        path: (c, W, H) => P(c, W, H, [[-0.04, -0.04], [1.04, -0.04], [0.82, 0.24], [0.18, 0.24]])
      },
      {
        name: 'Sidoväggarna',
        color: 0x6e6450,
        path: (c, W, H) => {
          P(c, W, H, [[-0.04, -0.04], [0.18, 0.24], [0.18, 0.7], [-0.04, 1.0]]);
          P(c, W, H, [[1.04, -0.04], [0.82, 0.24], [0.82, 0.7], [1.04, 1.0]]);
        }
      },
      {
        // The four dark hangings down each wall are what give the room its
        // depth; without them the side walls are two grey wedges.
        name: 'Gobelängerna',
        color: 0x3a3024,
        path: (c, W, H) => {
          [[-0.02, 0.1, 0.035, 0.15, 0.66, 0.78], [0.05, 0.16, 0.09, 0.2, 0.63, 0.72],
            [0.11, 0.21, 0.145, 0.245, 0.605, 0.675], [0.155, 0.25, 0.178, 0.272, 0.585, 0.64]]
            .forEach(([x0, y0, x1, y1, yb1, yb0]) => {
              P(c, W, H, [[x0, y0], [x1, y1], [x1, yb1], [x0, yb0]]);
              P(c, W, H, [[1 - x0, y0], [1 - x1, y1], [1 - x1, yb1], [1 - x0, yb0]]);
            });
        }
      },
      {
        name: 'Mittfönstret',
        color: 0xb8c8cc,
        path: (c, W, H) => P(c, W, H, [[0.44, 0.34], [0.56, 0.34], [0.56, 0.6], [0.44, 0.6]])
      },
      {
        name: 'Sidofönstren',
        color: 0x93a8ab,
        path: (c, W, H) => {
          P(c, W, H, [[0.3, 0.375], [0.385, 0.375], [0.385, 0.575], [0.3, 0.575]]);
          P(c, W, H, [[0.615, 0.375], [0.7, 0.375], [0.7, 0.575], [0.615, 0.575]]);
        }
      },
      {
        name: 'Lärjungarna vänster',
        color: 0x4a5a72,
        path: (c, W, H) => {
          S(c, W, H, [[0.02, 0.75], [0.05, 0.55], [0.12, 0.49], [0.19, 0.55], [0.22, 0.75]], true, 0.8);
          S(c, W, H, [[0.235, 0.75], [0.26, 0.545], [0.33, 0.478], [0.41, 0.545], [0.425, 0.75]], true, 0.8);
        }
      },
      {
        name: 'Lärjungarna höger',
        color: 0x6d5c3c,
        path: (c, W, H) => {
          S(c, W, H, [[0.575, 0.75], [0.59, 0.545], [0.665, 0.478], [0.74, 0.545], [0.765, 0.75]], true, 0.8);
          S(c, W, H, [[0.78, 0.75], [0.81, 0.555], [0.88, 0.49], [0.95, 0.555], [0.98, 0.75]], true, 0.8);
        }
      },
      {
        name: 'Kristi röda mantel',
        color: 0x94413a,
        path: (c, W, H) => S(c, W, H, [[0.502, 0.465], [0.466, 0.495], [0.437, 0.62], [0.425, 0.75], [0.502, 0.75]], true, 0.8)
      },
      {
        name: 'Kristi blå mantel',
        color: 0x41608c,
        path: (c, W, H) => S(c, W, H, [[0.502, 0.465], [0.538, 0.495], [0.567, 0.62], [0.579, 0.75], [0.502, 0.75]], true, 0.8)
      },
      {
        name: 'Kristi ansikte',
        color: 0xd2ab80,
        path: (c, W, H) => S(c, W, H, [
          [0.502, 0.4], [0.527, 0.417], [0.531, 0.456], [0.502, 0.481], [0.473, 0.456], [0.477, 0.417]
        ])
      },
      {
        name: 'Lärjungarnas ansikten',
        color: 0xcba57c,
        path: (c, W, H) => APOSTLES.forEach(([x, y]) => blob(c, W, H, x, y, 0.021, 0.026))
      },
      {
        name: 'Duken',
        color: 0xe6e2d4,
        path: (c, W, H) => P(c, W, H, [[0.02, 0.72], [0.98, 0.72], [1.0, 0.9], [0.0, 0.9]])
      },
      {
        name: 'Bordets kant',
        color: 0xc2bba8,
        path: (c, W, H) => P(c, W, H, [[0.0, 0.9], [1.0, 0.9], [1.0, 1.06], [0.0, 1.06]])
      }
    ],
    detail(ctx, W, H) {
      // Every line in the room aims at the back of Christ's head. That is
      // the whole trick of the picture, so the ink pass draws it explicitly.
      const VX = 0.502;
      const VY = 0.43;
      [[-0.04, -0.04], [0.28, -0.04], [0.72, -0.04], [1.04, -0.04],
        [-0.04, 1.06], [1.04, 1.06], [-0.04, 0.42], [1.04, 0.42]].forEach(([x, y]) => {
        const dx = VX - x;
        const dy = VY - y;
        ink(ctx, W, H, [[x, y], [x + dx * 0.72, y + dy * 0.72]], 0.0032, 0.16);
      });
      // Coffers in the ceiling
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        ink(ctx, W, H, [[-0.04 + t * 0.22, -0.04 + t * 0.28], [1.04 - t * 0.22, -0.04 + t * 0.28]], 0.0032, 0.2);
      }
      // Window bars, and the pediment over the middle window
      [[0.5, 0.34, 0.6], [0.342, 0.375, 0.575], [0.657, 0.375, 0.575]].forEach(([x, y0, y1]) => {
        ink(ctx, W, H, [[x, y0], [x, y1]], 0.0035, 0.35);
        ink(ctx, W, H, [[x - 0.06, (y0 + y1) / 2], [x + 0.06, (y0 + y1) / 2]], 0.003, 0.28);
      });
      ink(ctx, W, H, [[0.4, 0.34], [0.5, 0.272], [0.6, 0.34]], 0.005, 0.3);
      // Christ's arms open on the cloth — the calm at the centre of it
      ink(ctx, W, H, [[0.5, 0.49], [0.437, 0.62], [0.4, 0.715]], 0.005, 0.35);
      ink(ctx, W, H, [[0.5, 0.49], [0.564, 0.62], [0.604, 0.715]], 0.005, 0.35);
      // Thirteen sets of shoulders, and the plates down the cloth
      APOSTLES.forEach(([x, y]) => {
        mark(ctx, W, H, x - 0.008, y - 0.002, 0.0045, 0.005, 0, 0.55);
        mark(ctx, W, H, x + 0.008, y - 0.002, 0.0045, 0.005, 0, 0.55);
        ink(ctx, W, H, [[x - 0.03, y + 0.045], [x, y + 0.03], [x + 0.03, y + 0.045]], 0.0045, 0.3);
      });
      for (let i = 0; i < 9; i++) {
        const x = 0.08 + i * 0.105;
        ink(ctx, W, H, [[x - 0.028, 0.82], [x, 0.81], [x + 0.028, 0.82], [x, 0.833], [x - 0.028, 0.82]], 0.003, 0.22);
      }
      ink(ctx, W, H, [[0.02, 0.725], [0.98, 0.725]], 0.004, 0.25);
    }
  }
];

/* --------------------------------------------------------------- painting */

/*
 * The canvas surface. A flat fill reads as vector art, which is exactly what
 * a painting is not, so every filled region gets a weave underneath it and a
 * few directional strokes on top. Both are deterministic — the same region
 * looks the same every time it is drawn — so nothing crawls between frames.
 */

let weaveCanvas = null;
function weave() {
  if (weaveCanvas) return weaveCanvas;
  const N = 96;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const c = cv.getContext('2d');
  let s = 1337;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    c.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(48,38,26,0.10)';
    c.fillRect(x, y, 1.3, 1.3);
  }
  c.strokeStyle = 'rgba(70,56,38,0.05)';
  c.lineWidth = 1;
  for (let i = 0; i < N; i += 3) {
    c.beginPath();
    c.moveTo(i + 0.5, 0);
    c.lineTo(i + 0.5, N);
    c.moveTo(0, i + 0.5);
    c.lineTo(N, i + 0.5);
    c.stroke();
  }
  weaveCanvas = cv;
  return cv;
}

/** Directional strokes inside a region, so the paint reads as laid on. */
function brushwork(ctx, W, H, rg, seed, rgb) {
  ctx.save();
  ctx.beginPath();
  rg.path(ctx, W, H);
  ctx.clip();
  let s = (seed * 2654435761) >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const angle = -0.5 + rnd() * 1.0;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const cx = rnd() * W;
    const cy = rnd() * H;
    const len = (0.18 + rnd() * 0.45) * W;
    ctx.beginPath();
    ctx.moveTo(cx - dx * len * 0.5, cy - dy * len * 0.5);
    ctx.lineTo(cx + dx * len * 0.5, cy + dy * len * 0.5);
    ctx.lineWidth = (0.012 + rnd() * 0.03) * W;
    ctx.strokeStyle = shiftCss(rgb, i % 2 ? 0.2 : -0.16, 0.11);
    ctx.stroke();
  }
  ctx.restore();
}

/** The old-varnish falloff that makes a museum photograph look like one. */
function varnish(ctx, W, H) {
  const g = ctx.createRadialGradient(W * 0.5, H * 0.46, W * 0.2, W * 0.5, H * 0.5, W * 0.82);
  g.addColorStop(0, 'rgba(120,86,40,0)');
  g.addColorStop(1, 'rgba(46,30,12,0.34)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

/** The reference: every region in the colour it wants, plus the drawing. */
export function paintReference(ctx, work, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#efece3';
  ctx.fillRect(0, 0, W, H);
  work.regions.forEach((rg, i) => {
    const rgb = hexToRgb(rg.color);
    ctx.beginPath();
    rg.path(ctx, W, H);
    ctx.fillStyle = rgbToCss(rgb);
    ctx.fill();
    brushwork(ctx, W, H, rg, i + 1, rgb);
  });
  if (work.detail) work.detail(ctx, W, H);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = ctx.createPattern(weave(), 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  varnish(ctx, W, H);
}

/**
 * The player's canvas: painted regions in whatever they mixed, the rest bare
 * primed linen with the drawing showing through. Rebuilt only when something
 * actually changes — the pulsing selection is composited on top per frame.
 */
export function paintPlayerBase(ctx, work, W, H, painted) {
  ctx.clearRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f6f3e9');
  g.addColorStop(1, '#e5dfcf');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  work.regions.forEach((rg, i) => {
    const got = painted[i];
    if (!got) return;
    ctx.beginPath();
    rg.path(ctx, W, H);
    ctx.fillStyle = rgbToCss(got);
    ctx.fill();
    brushwork(ctx, W, H, rg, i + 1, got);
  });

  // The outlines of everything still to do, so the drawing reads as a drawing
  work.regions.forEach((rg, i) => {
    ctx.beginPath();
    rg.path(ctx, W, H);
    ctx.lineWidth = Math.max(1.2, W * (painted[i] ? 0.0022 : 0.0038));
    ctx.strokeStyle = painted[i] ? 'rgba(30,24,16,0.16)' : 'rgba(64,52,36,0.55)';
    ctx.stroke();
  });

  if (work.detail) work.detail(ctx, W, H);

  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ctx.createPattern(weave(), 'repeat');
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // Stretcher shadow round the edge: the canvas is a physical object
  const e = ctx.createLinearGradient(0, 0, 0, H);
  e.addColorStop(0, 'rgba(60,46,28,0.16)');
  e.addColorStop(0.12, 'rgba(60,46,28,0)');
  e.addColorStop(0.9, 'rgba(60,46,28,0)');
  e.addColorStop(1, 'rgba(60,46,28,0.13)');
  ctx.fillStyle = e;
  ctx.fillRect(0, 0, W, H);
}

/** The region about to be painted, pulsing so the target is unmistakable. */
export function paintSelection(ctx, work, W, H, painted, selected, t) {
  if (selected < 0 || selected >= work.regions.length || painted[selected]) return;
  const pulse = 0.35 + Math.sin(t * 6) * 0.22;
  const rg = work.regions[selected];
  ctx.save();
  ctx.beginPath();
  rg.path(ctx, W, H);
  ctx.fillStyle = `rgba(242,193,78,${pulse * 0.42})`;
  ctx.fill();
  ctx.lineWidth = Math.max(2.5, W * 0.008);
  ctx.strokeStyle = `rgba(255,214,120,${0.5 + pulse})`;
  ctx.stroke();
  ctx.restore();
}

/** The id-map used to turn a tap on the canvas into a region index. */
export function paintIdMap(ctx, work, W, H) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  work.regions.forEach((rg, i) => {
    ctx.beginPath();
    rg.path(ctx, W, H);
    ctx.fillStyle = `rgb(${i + 1},0,0)`;
    ctx.fill();
  });
}
