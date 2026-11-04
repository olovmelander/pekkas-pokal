/**
 * Pekkas Lerskulptur — the clay body.
 *
 * The game logic still thinks in one thing only: a radial height field
 * r[0..N-1] up the outside wall. This module turns that into a believable
 * thrown pot:
 *
 *  - the profile is walked as ONE path — up the outside, over a rounded lip,
 *    down the inside wall and across the floor — and spun into a lathe mesh,
 *    so every vessel is hollow and a bowl actually reads as a bowl
 *  - normals come straight from the path's slope (a surface of revolution
 *    has an exact normal), which is far cheaper than computeVertexNormals on
 *    a mesh that is rewritten every frame the hands are on it
 *  - throwing rings live in a generated, tileable normal map; a per-row
 *    attribute (aRW) scales how deep they are and how WET each band is, so
 *    fingers leave crisp rings, the sponge melts them away, and wet bands
 *    get the darker colour and the thin glossy water film (clearcoat) that
 *    make clay look like clay instead of plastic
 *  - the inside is darkened through vertex colours (a cheap, stable AO), so
 *    the opening reads as depth without any screen-space pass
 *
 * The same geometry, frozen, becomes the fired piece; only the material and
 * the per-row attributes change (glaze breaking on the rim, an unglazed
 * waxed foot, pooling in the throwing rings).
 */

import * as THREE from 'three';

export const N = 64; // profile samples along the height (game logic)
export const H = 2.05; // clay column height
export const R_MIN = 0.14;
export const R_MAX = 1.5;

const K = 64; // radial segments
const COLS = K + 1; // seam duplicated so the ring texture can wrap
const LIP = 5; // rows over the rounded rim
const INNER = 34; // rows down the inside wall
const FLOOR = 4; // rows across the inside floor
const ROWS = 1 + N + LIP + INNER + FLOOR;
const WALL = 0.12; // wall thickness
const FLOOR_Y = 0.2; // inside floor height
const RING_TILE = 0.36; // world units of height per ring-texture tile
const U_TILES = 4; // ring-texture tiles around the circumference

/* ------------------------------------------------------------- textures */

/** Tileable value noise on a g×g lattice. */
function tileNoise(g, rand) {
  const v = new Float32Array(g * g);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  return (x, y) => {
    const fx = x * g;
    const fy = y * g;
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const at = (a, b) => v[(((b % g) + g) % g) * g + (((a % g) + g) % g)];
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/**
 * Throwing rings as a height field: four ridges per tile, each with its own
 * width and depth, a slight helical waver, depth that swells and fades
 * around the pot (that variation is what lets you SEE the wheel turn) and
 * a little grit. Everything is periodic, so the tile wraps both ways.
 */
function ringHeights(size, rand) {
  const grit = tileNoise(32, rand);
  const blot = tileNoise(6, rand);
  const rings = [];
  for (let i = 0; i < 4; i++) {
    rings.push({
      y: (i + 0.2 + rand() * 0.6) / 4,
      w: 0.035 + rand() * 0.04,
      a: 0.55 + rand() * 0.45,
      f: 1 + Math.floor(rand() * 2),
      p: rand() * Math.PI * 2,
      q: rand() * Math.PI * 2
    });
  }
  const h = new Float32Array(size * size);
  for (let yi = 0; yi < size; yi++) {
    const y = yi / size;
    for (let xi = 0; xi < size; xi++) {
      const x = xi / size;
      let v = 0;
      for (const r of rings) {
        const cy = r.y + 0.012 * Math.sin(Math.PI * 2 * x + r.q);
        let d = Math.abs(y - cy);
        d = Math.min(d, 1 - d);
        const k = Math.max(0, 1 - d / r.w);
        const depth = r.a * (0.6 + 0.4 * Math.sin(Math.PI * 2 * x * r.f + r.p));
        v += k * k * (3 - 2 * k) * depth;
      }
      v += (grit(x, y) - 0.5) * 0.22 + (blot(x, y) - 0.5) * 0.18;
      h[yi * size + xi] = v;
    }
  }
  return h;
}

function dataTexture(data, size, srgb) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * The ring maps: a tangent-space normal map and a grey albedo map in which
 * the grooves are a touch darker (slip — and later glaze — pools in them).
 * Built straight into DataTextures in UV space (row 0 = v 0), so there is
 * no canvas flip to second-guess when deriving the normals.
 */
export function ringMaps(seed = 7) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const size = 256;
  const h = ringHeights(size, rand);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  const nrm = new Uint8Array(size * size * 4);
  const alb = new Uint8Array(size * size * 4);
  const strength = 2.6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nrm[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nrm[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      nrm[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nrm[i + 3] = 255;
      const g = Math.max(0, Math.min(255, 238 - at(x, y) * 34));
      alb[i] = g;
      alb[i + 1] = g;
      alb[i + 2] = g;
      alb[i + 3] = 255;
    }
  }
  return { normal: dataTexture(nrm, size, false), albedo: dataTexture(alb, size, true), heights: h, size };
}

/*
 * Glaze surfaces. Each glaze gets its own albedo map — the ring grooves of
 * ringMaps (glaze pools in them) times a pattern of its own — so the four
 * pieces look like four different glazes, not one colour four times. They
 * only swap a texture, never a shader: every glazed piece keeps the program
 * precompiled at load.
 *
 * The UVs wrap U_TILES times around a pot of ~0.7 radius and repeat every
 * RING_TILE up it, so one texel is about ASPECT times wider on the pot than
 * it is tall; the patterns are drawn squashed by that much and come out
 * round on the clay.
 */
const ASPECT = 3;

/** Tileable jittered-grid Voronoi: distance to the nearest edge, in "pot" units. */
function voronoiEdges(size, gx, gy, rand) {
  const pts = new Float32Array(gx * gy * 2);
  for (let i = 0; i < gx * gy; i++) {
    pts[i * 2] = rand();
    pts[i * 2 + 1] = rand();
  }
  const out = new Float32Array(size * size);
  for (let yi = 0; yi < size; yi++) {
    for (let xi = 0; xi < size; xi++) {
      const fx = (xi / size) * gx;
      const fy = (yi / size) * gy;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      let d1 = 1e9;
      let d2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (((cx + ox) % gx) + gx) % gx;
          const iy = (((cy + oy) % gy) + gy) % gy;
          const px = cx + ox + pts[(iy * gx + ix) * 2];
          const py = cy + oy + pts[(iy * gx + ix) * 2 + 1];
          // cells are gx wide and gy tall per tile; on the pot a tile is ASPECT× wider than tall
          const dx = ((px - fx) / gx) * ASPECT;
          const dy = (py - fy) / gy;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      }
      out[yi * size + xi] = Math.sqrt(d2) - Math.sqrt(d1);
    }
  }
  return out;
}

/**
 * One albedo variant per glaze kind:
 *  - crackle: the celadon's crazing, a coarse and a fine network of dark lines
 *  - speckle: iron spots bleeding through a honey glaze, with pale haloes
 *  - mottle: the cobalt's depth — the glaze breaks lighter and pools darker
 */
export function glazeMaps(maps, seed = 11) {
  let s = seed;
  const rand = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const { heights: h, size } = maps;
  const base = (i) => Math.max(0, Math.min(1, (238 - h[i] * 34) / 255));
  const make = (fn) => {
    const px = new Uint8Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const v = Math.max(0, Math.min(255, base(i) * fn(i) * 255));
      px[i * 4] = v;
      px[i * 4 + 1] = v;
      px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    return dataTexture(px, size, true);
  };
  const coarse = voronoiEdges(size, 14, 5, rand);
  const fine = voronoiEdges(size, 34, 12, rand);
  const crackle = make((i) => {
    const a = 1 - 0.55 * (1 - smooth01(0.0, 0.012, coarse[i]));
    const b = 1 - 0.28 * (1 - smooth01(0.0, 0.006, fine[i]));
    return a * b;
  });
  const spots = new Float32Array(size * size).fill(1);
  for (let n = 0; n < 260; n++) {
    const x = rand() * size;
    const y = rand() * size;
    // radius in texel rows (a texel is ASPECT× wider on the pot than tall)
    const r = 2.2 + rand() * rand() * 5;
    const dark = 0.3 + rand() * 0.35;
    const ry = Math.ceil(r * 2.2);
    const rx = Math.ceil((r * 2.2) / ASPECT);
    for (let oy = -ry; oy <= ry; oy++) {
      for (let ox = -rx; ox <= rx; ox++) {
        const xi = (((Math.floor(x) + ox) % size) + size) % size;
        const yi = (((Math.floor(y) + oy) % size) + size) % size;
        const d = Math.hypot((ox + 0.5 - (x % 1)) * ASPECT, oy + 0.5 - (y % 1));
        const i = yi * size + xi;
        if (d < r) spots[i] = Math.min(spots[i], dark + (1 - dark) * (d / r) ** 3);
        else if (d < r * 2.2 && spots[i] >= 1) spots[i] = 1.08;
      }
    }
  }
  const speckle = make((i) => spots[i]);
  const blot = tileNoise(5, rand);
  const blot2 = tileNoise(13, rand);
  const mottle = make((i) => {
    const x = (i % size) / size;
    const y = Math.floor(i / size) / size;
    return 0.82 + 0.26 * blot(x, y) + 0.12 * blot2(x, y);
  });
  return { crackle, speckle, mottle, list: [crackle, speckle, mottle] };
}

/* ------------------------------------------------------------ materials */

/**
 * Ceiling on what the clay and glazes send to the screen (linear HDR).
 * The wet film and the glaze are sharp mirrors; on the spinning, ringed
 * wall a light's highlight lands on a different sub-pixel facet every frame,
 * and unclamped those specks run to 20–50× white — bloom turns each into a
 * twinkling firefly. Tone mapping already renders 4× as white, so nothing
 * visible is lost.
 */
const SPEC_MAX = 4.0;

/**
 * Teach a physical material the per-row aRW attribute: x scales the ring
 * normal map, y is "wet" (raw clay) or "glazed" (fired piece). Wet/glazed
 * bands get lower roughness, a clearcoat film and — for raw clay — the
 * darker, richer colour of saturated clay. The chunk names patched here are
 * checked against r187's ShaderChunk.
 */
function patchRW(mat, wetDark, wetRough) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWetDark = { value: wetDark };
    sh.uniforms.uWetRough = { value: wetRough };
    sh.uniforms.uSpecMax = { value: SPEC_MAX };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aRW;\nvarying vec2 vRW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRW = aRW;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec2 vRW;\nuniform float uWetDark;\nuniform float uWetRough;\nuniform float uSpecMax;'
      )
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb *= mix( 1.0, uWetDark, vRW.y );'
      )
      .replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor *= mix( 1.0, uWetRough, vRW.y );'
      )
      .replace(
        '#include <normal_fragment_maps>',
        THREE.ShaderChunk.normal_fragment_maps.replace(
          'mapN.xy *= normalScale;',
          'mapN.xy *= normalScale * vRW.x;'
        )
      )
      .replace(
        '#include <lights_physical_fragment>',
        THREE.ShaderChunk.lights_physical_fragment.replace(
          'material.clearcoat = clearcoat;',
          'material.clearcoat = clearcoat * vRW.y;'
        )
      )
      .replace('#include <opaque_fragment>', 'outgoingLight = min( outgoingLight, vec3( uSpecMax ) );\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `lr-rw-${wetDark}-${wetRough}`;
}

/**
 * Raw, wet terracotta on the wheel. `lite` (phones) drops the sheen lobe —
 * the clay fills much of a phone screen and the wet clearcoat film is the
 * part that sells it.
 */
export function clayMaterial(maps, lite = false) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xb4693f,
    map: maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughness: 0.78,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
    sheen: lite ? 0 : 0.45,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffc49a),
    vertexColors: true
  });
  patchRW(mat, 0.74, 0.42);
  return mat;
}

/**
 * A fired, glazed piece. Base roughness is the bare fired body; glazed rows
 * (aRW.y = 1) drop to a glossy film with a clearcoat on top. The gold luster
 * of the bonus Pokal is a metal.
 */
export function glazeMaterial(maps, metal, albedo = null) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: albedo || maps.albedo,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.86,
    metalness: metal ? 1 : 0,
    clearcoat: metal ? 0.6 : 1,
    clearcoatRoughness: 0.06,
    vertexColors: true,
    emissive: 0xff5a14,
    emissiveIntensity: 0,
    // Metal has no diffuse to fall back on: let gold drink in the room's light
    envMapIntensity: metal ? 2.4 : 1
  });
  patchRW(mat, 1.0, metal ? 0.3 : 0.15);
  return mat;
}

/* ---------------------------------------------------------- the clay body */

function smooth01(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * The lathe mesh plus the per-row state that drives it. Call update() with
 * the outside profile whenever it changes.
 */
export class ClayBody {
  constructor() {
    const verts = ROWS * COLS;
    this.geometry = new THREE.BufferGeometry();
    this.pos = new Float32Array(verts * 3);
    this.nor = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    this.rw = new Float32Array(verts * 2);
    const uv = new Float32Array(verts * 2);
    const g = this.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aRW', new THREE.BufferAttribute(this.rw, 2).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2).setUsage(THREE.DynamicDrawUsage));
    this.uv = uv;

    const idx = [];
    for (let i = 0; i < ROWS - 1; i++) {
      for (let k = 0; k < K; k++) {
        const a = i * COLS + k;
        const b = a + 1;
        const c = a + COLS;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H / 2, 0), 2.2);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(-R_MAX - 0.1, 0, -R_MAX - 0.1), new THREE.Vector3(R_MAX + 0.1, H + 0.2, R_MAX + 0.1));

    this.cos = new Float32Array(COLS);
    this.sin = new Float32Array(COLS);
    for (let k = 0; k < COLS; k++) {
      const a = (k / K) * Math.PI * 2;
      this.cos[k] = Math.cos(a);
      this.sin[k] = Math.sin(a);
    }
    // Path through the profile, per row
    this.pr = new Float32Array(ROWS);
    this.py = new Float32Array(ROWS);
    this.pv = new Float32Array(ROWS);
    this.pao = new Float32Array(ROWS);
    this.pring = new Float32Array(ROWS);
    this.pwet = new Float32Array(ROWS);
    // Per outer row: how crisp the rings are and how wet the band is
    this.ring = new Float32Array(N).fill(0.7);
    this.wet = new Float32Array(N).fill(0.8);
    this.open = 1;
  }

  /** Outside radius at height y, linearly interpolated. */
  static radiusAt(r, y) {
    const f = Math.max(0, Math.min(N - 1, (y / H) * (N - 1)));
    const j = Math.min(N - 2, Math.floor(f));
    const t = f - j;
    return r[j] + (r[j + 1] - r[j]) * t;
  }

  /** Walk the profile path: outside up, over the lip, inside down, floor. */
  buildPath(r) {
    const { pr, py, pv, pao, pring, pwet } = this;
    const { open } = this;
    let i = 0;
    pr[i] = 0.0005;
    py[i] = 0;
    pv[i] = 0;
    pao[i] = 0.6;
    pring[i] = 0;
    pwet[i] = 0;
    i++;
    for (let j = 0; j < N; j++, i++) {
      const y = (j / (N - 1)) * H;
      pr[i] = Math.max(0.1, r[j]);
      py[i] = y;
      pv[i] = y / RING_TILE;
      // A touch of contact occlusion where the foot meets the wheel
      pao[i] = 0.72 + 0.28 * smooth01(0, 0.16, y);
      pring[i] = this.ring[j];
      pwet[i] = this.wet[j];
    }
    const rTop = Math.max(0.1, r[N - 1]);
    const wall = Math.min(WALL, rTop * 0.7);
    const rc = rTop - wall / 2;
    const bulge = (wall / 2) * (0.35 + 0.65 * open);
    let v = H / RING_TILE;
    for (let m = 1; m <= LIP; m++, i++) {
      const th = (Math.PI * m) / (LIP + 1);
      pr[i] = rc + (wall / 2) * Math.cos(th);
      py[i] = H + bulge * Math.sin(th);
      v += (Math.PI * wall) / 2 / (LIP + 1) / RING_TILE;
      pv[i] = v;
      pao[i] = 1;
      pring[i] = this.ring[N - 1] * 0.5;
      pwet[i] = this.wet[N - 1];
    }
    const depth = open * (H - FLOOR_Y);
    const yFloor = H - depth + (1 - open) * 0.05;
    let lastR = rTop - wall;
    for (let m = 0; m < INNER; m++, i++) {
      const s = m / (INNER - 1);
      const y = H - s * depth;
      let ri = Math.max(0.03, ClayBody.radiusAt(r, y) - wall);
      // Round the inside corner into the floor
      ri *= 1 - 0.32 * smooth01(0.82, 1, s) * open;
      pr[i] = ri;
      py[i] = y;
      v += (depth / (INNER - 1)) / RING_TILE + 0.0001;
      pv[i] = v;
      // Deeper and narrower = darker
      const deep = depth > 0.001 ? (H - y) / (H - FLOOR_Y) : 0;
      pao[i] = (0.92 - 0.55 * deep ** 0.8) * (0.55 + 0.45 * smooth01(0.05, 0.55, ri));
      pring[i] = 0.9;
      pwet[i] = this.wet[N - 1] * 0.8;
      lastR = ri;
    }
    for (let m = 1; m <= FLOOR; m++, i++) {
      const f = m / FLOOR;
      pr[i] = Math.max(0.0005, lastR * (1 - f));
      py[i] = yFloor + (1 - open) * 0.04 * f;
      v += (lastR / FLOOR) / RING_TILE;
      pv[i] = v;
      pao[i] = pao[i - 1] * 0.98;
      pring[i] = 0.4;
      pwet[i] = pwet[i - 1];
    }
  }

  /** Rebuild every vertex from the outside profile r. */
  update(r) {
    this.buildPath(r);
    const { pr, py, pv, pao, pring, pwet, pos, nor, col, rw, uv } = this;
    let nrPrev = 0;
    let nyPrev = -1;
    for (let i = 0; i < ROWS; i++) {
      const a = Math.max(0, i - 1);
      const b = Math.min(ROWS - 1, i + 1);
      const dr = pr[b] - pr[a];
      const dy = py[b] - py[a];
      const len = Math.hypot(dr, dy);
      // Surface of revolution: the normal is the path tangent turned 90°
      let nr = nrPrev;
      let ny = nyPrev;
      if (len > 1e-6) {
        nr = dy / len;
        ny = -dr / len;
      }
      nrPrev = nr;
      nyPrev = ny;
      const rr = pr[i];
      const yy = py[i];
      const ao = pao[i];
      const base = i * COLS;
      for (let k = 0; k < COLS; k++) {
        const vi = base + k;
        const c = this.cos[k];
        const s = this.sin[k];
        pos[vi * 3] = c * rr;
        pos[vi * 3 + 1] = yy;
        pos[vi * 3 + 2] = s * rr;
        nor[vi * 3] = c * nr;
        nor[vi * 3 + 1] = ny;
        nor[vi * 3 + 2] = s * nr;
        col[vi * 3] = ao;
        col[vi * 3 + 1] = ao;
        col[vi * 3 + 2] = ao;
        rw[vi * 2] = pring[i];
        rw[vi * 2 + 1] = pwet[i];
        uv[vi * 2] = (k / K) * U_TILES;
        uv[vi * 2 + 1] = pv[i];
      }
    }
    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.aRW.needsUpdate = true;
    g.attributes.uv.needsUpdate = true;
  }

  /**
   * Freeze the current shape into a fired piece: a new geometry with the
   * glaze painted into the vertex colours and aRW.y = "glazed".
   *  - the foot is waxed before glazing, so its bottom band stays bare body
   *  - glaze runs thin and BREAKS on the rim and on convex bellies, and
   *    pools thicker, darker and richer in concave necks and the inside floor
   *  - in the kiln it RUNS: it thickens toward the foot in streaks around the
   *    pot, and creeps past the glaze line in drips with a fat bead at the end
   *    (per column, so no two sides of the pot are the same)
   *  - a lustre (the gold Pokal) is painted on thin and evenly: no runs
   */
  firedGeometry(r, glazeData) {
    this.update(r);
    const g = this.geometry.clone();
    const col = g.attributes.color.array;
    const rw = g.attributes.aRW.array;
    const glaze = new THREE.Color(glazeData.color);
    const rim = new THREE.Color(glazeData.rim);
    const body = new THREE.Color(0xb7774f);
    const deep = glaze.clone().multiplyScalar(0.62);
    const c = new THREE.Color();
    const runny = glazeData.metal ? 0 : 1;
    // Per-column character from the profile itself, so a piece keeps its look
    let seed = 1;
    for (let j = 0; j < N; j += 7) seed = (seed * 31 + Math.round(r[j] * 997)) % 2147483647;
    const rand = () => {
      seed = (seed * 16807 + 11) % 2147483647;
      return seed / 2147483647;
    };
    const streak = new Float32Array(K);
    const drip = new Float32Array(K);
    const ph = [rand(), rand(), rand(), rand()].map((x) => x * Math.PI * 2);
    for (let k = 0; k < K; k++) {
      const a = (k / K) * Math.PI * 2;
      streak[k] = 0.5 * Math.sin(a * 3 + ph[0]) + 0.3 * Math.sin(a * 7 + ph[1]) + 0.2 * Math.sin(a * 13 + ph[2]);
      // Mostly short tongues, now and then a long run
      const x = rand();
      drip[k] = runny * (0.012 + x * x * x * 0.11 + 0.02 * Math.max(0, Math.sin(a * 5 + ph[3])));
    }
    // A drip is a few columns wide: soften it with its neighbours (wrapping)
    const dripS = new Float32Array(K);
    for (let k = 0; k < K; k++) {
      dripS[k] = Math.max(drip[k], 0.7 * drip[(k + 1) % K], 0.7 * drip[(k + K - 1) % K]);
    }
    // Convexity per outside row from the second difference of the profile
    const curv = new Float32Array(N);
    for (let j = 1; j < N - 1; j++) curv[j] = r[j - 1] + r[j + 1] - 2 * r[j];
    const GLAZE_LINE = 0.17;
    for (let i = 0; i < ROWS; i++) {
      const outerJ = i - 1;
      const y = this.py[i];
      const outside = outerJ >= 0 && outerJ < N;
      const lip = outerJ >= N && outerJ < N + LIP;
      const inside = outerJ >= N + LIP;
      // Thickness before the runs: thin on the rim and convex bellies, pooled in concave necks
      let thick = 1;
      let breakK = 0;
      if (outside) {
        const cv = Math.max(-1, Math.min(1, curv[outerJ] * 90));
        breakK = Math.max(0, -cv) * 0.22 + smooth01(H - 0.25, H, y) * 0.45;
        thick += Math.max(0, cv) * 0.35 + runny * 0.22 * (1 - y / H);
      } else if (lip) {
        breakK = 0.62;
        thick = 0.7;
      } else if (inside) {
        // Glaze gathers in the bottom of a bowl: a glassy, deeper pool
        thick = 1 + runny * 0.45 * smooth01(H * 0.5, FLOOR_Y, y);
      }
      const ao = this.pao[i];
      const base = i * COLS;
      for (let k = 0; k < COLS; k++) {
        const kk = k % K;
        let glazed = 1;
        let t = thick;
        let br = breakK;
        if (i === 0) glazed = 0;
        else if (outside) {
          const line = GLAZE_LINE - dripS[kk];
          // the glaze edge, and a fat bead where each drip stopped
          glazed = smooth01(line - 0.03, line + 0.015, y);
          const bead = Math.max(0, 1 - Math.abs(y - (line + 0.02)) / 0.05) * Math.min(1, dripS[kk] / 0.03);
          t += runny * (0.18 * streak[kk] * (1 - y / H) + 0.55 * bead);
          br = Math.max(0, br - runny * 0.12 * streak[kk]);
          if (y < 0.035) glazed = 0;
        } else if (inside) {
          t += runny * 0.08 * streak[kk];
        }
        if (glazed > 0) {
          c.copy(glaze).lerp(rim, Math.max(0, Math.min(1, br + (1 - t) * 0.8)));
          if (t > 1) c.lerp(deep, Math.min(0.85, (t - 1) * 1.1));
          if (!glazeData.metal) c.lerp(body, 1 - glazed);
        } else {
          c.copy(body);
        }
        const vi = base + k;
        col[vi * 3] = c.r * ao;
        col[vi * 3 + 1] = c.g * ao;
        col[vi * 3 + 2] = c.b * ao;
        // Thick glaze fills the throwing rings; thin glaze shows every one
        rw[vi * 2] = (0.55 + 0.4 * this.pring[i]) * (glazed > 0 ? Math.max(0.45, 1.15 - 0.45 * t) : 1);
        rw[vi * 2 + 1] = glazed;
      }
    }
    g.attributes.color.setUsage(THREE.StaticDrawUsage);
    return g;
  }

  /** Outside surface position (local) of profile row j on side `side`. */
  static surface(r, j, side) {
    return { x: side * r[Math.max(0, Math.min(N - 1, j))], y: (j / (N - 1)) * H };
  }

  dispose() {
    this.geometry.dispose();
  }
}
