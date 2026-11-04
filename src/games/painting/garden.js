/**
 * Pekkas Måleri — the garden at Terrassvägen 47.
 *
 * A sunny Saturday afternoon in Örnsköldsvik, 7 August 2021. Easels on the
 * lawn, the hedge and the house behind, bunting between the birches, and
 * beer within reach of every painter — Per Vikman's brief said everyone
 * was expected to get through ten.
 *
 * Lighting follows the same hierarchy as the rest of the games: one warm
 * low sun casting every shadow, a cool sky fill so nothing in shade goes
 * black, and a bounce off the lawn. Outdoors the trap is flatness, so the
 * scene leans hard on that single sun direction and on aerial perspective
 * — the far spruce rank is tinted toward the haze rather than drawn in
 * more detail.
 *
 * A garden that does not move reads as a photograph of a model, so the
 * things that would move on a breezy August afternoon do: the spruces and
 * birch crowns sway, the grass leans, the bunting swings on its line and
 * ripples, swallows loop over the hedge, the clouds drift, and the sun
 * comes through a birch that stands just out of frame as moving dapples
 * on the lawn. All of it is vertex-shader work off one shared clock; none
 * of it costs a draw call.
 *
 * Draw calls are the budget a phone runs out of, so every static group —
 * the house, the trestle, the parasol and chairs, each easel, each part of
 * each painter that moves as one — is baked into a single vertex-coloured
 * mesh at build time. The forest, the hedge, the flowers, the grass, the
 * bunting and the birds are instanced.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function mulberry(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lambert = (color, opts = {}) => new THREE.MeshLambertMaterial({ color, ...opts });

/* ----------------------------------------------------------------- baking */

/** One material for everything baked: colour lives in the vertices. */
let bakedMaterial = null;
function vertexColourMaterial() {
  if (!bakedMaterial || bakedMaterial.userData.disposed) {
    bakedMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    bakedMaterial.addEventListener('dispose', () => {
      bakedMaterial.userData.disposed = true;
    });
  }
  return bakedMaterial;
}

/**
 * Merge every mesh under `root` (except the subtrees in `skip`) into one
 * vertex-coloured mesh that replaces them. The originals' colours are read
 * off their Lambert materials, so groups are still authored the readable
 * way — one Mesh per part — and only collapsed once they are assembled.
 */
function bake(root, { skip = [], castShadow = true, receiveShadow = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const rel = new THREE.Matrix4();
  const geos = [];
  const sources = [];
  const walk = (o) => {
    if (skip.includes(o)) return;
    if (o.isMesh && !o.isInstancedMesh) {
      rel.multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry.clone().applyMatrix4(rel);
      Object.keys(g.attributes).forEach((n) => {
        if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      });
      const c = o.material.color;
      const cols = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < cols.length; i += 3) {
        cols[i] = c.r;
        cols[i + 1] = c.g;
        cols[i + 2] = c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geos.push(g);
      sources.push(o);
    }
    o.children.forEach(walk);
  };
  root.children.forEach(walk);
  if (!geos.length) return null;
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  sources.forEach((o) => {
    o.geometry.dispose();
    o.material.dispose();
  });
  root.children.filter((c) => !skip.includes(c)).forEach((c) => root.remove(c));
  const mesh = new THREE.Mesh(merged, vertexColourMaterial());
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  root.add(mesh);
  return mesh;
}

/* ------------------------------------------------------------------- wind */

/**
 * Sway in the vertex shader. Height inside the object (`base`..`base+span`
 * in its own y) sets how much a vertex moves, the world position sets the
 * phase so neighbouring trees never move in lockstep, and the shared
 * uGust swells and settles every few seconds.
 */
function windify(material, wind, { amp, base = 0, span = 1, freq = 1, instanced = true, key }) {
  const f = (v) => v.toFixed(4);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime;
    shader.uniforms.uGust = wind.uGust;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wOrigin = modelMatrix * ${instanced ? 'instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)' : 'vec4(position, 1.0)'};
        float wH = clamp((position.y - ${f(base)}) / ${f(span)}, 0.0, 1.0);
        float wPh = wOrigin.x * 0.31 + wOrigin.z * 0.17;
        float wS = sin(uTime * ${f(1.2 * freq)} + wPh) * 0.65 + sin(uTime * ${f(2.9 * freq)} + wPh * 1.9) * 0.35;
        transformed.x += wS * ${f(amp)} * wH * wH * (0.55 + uGust);
        transformed.z += cos(uTime * ${f(0.9 * freq)} + wPh) * ${f(amp * 0.35)} * wH * wH;`);
  };
  material.customProgramCacheKey = () => `pm-wind-${key}`;
  return material;
}

/* --------------------------------------------------------------- textures */

/** Late-summer lawn: mown bands, clover patches, daisies, a few burnt spots. */
export function lawnTexture() {
  const N = 512;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const rand = mulberry(53);
  ctx.fillStyle = '#5c7a38';
  ctx.fillRect(0, 0, N, N);
  // Mower stripes
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,255,220,0.06)' : 'rgba(20,40,10,0.07)';
    ctx.fillRect(0, (i * N) / 8, N, N / 8);
  }
  for (let i = 0; i < 900; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const r = 2 + rand() * 9;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rand() < 0.35;
    g.addColorStop(0, warm ? 'rgba(150,150,70,0.22)' : 'rgba(90,130,50,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Individual blades, so the ground does not read as felt when the camera
  // is a metre and a half above it
  for (let i = 0; i < 2200; i++) {
    const x = rand() * N;
    const y = rand() * N;
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(126,158,74,0.5)' : 'rgba(48,72,28,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 4);
    ctx.stroke();
  }
  // Daisies and dandelions — a Norrland lawn in August is never pure green
  for (let i = 0; i < 130; i++) {
    const x = rand() * N;
    const y = rand() * N;
    const yellow = rand() < 0.4;
    ctx.fillStyle = yellow ? 'rgba(232,196,72,0.9)' : 'rgba(244,244,232,0.9)';
    ctx.beginPath();
    ctx.arc(x, y, 1.4 + rand() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  // Grass is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
  return tex;
}

/**
 * The sky, as a gradient on the inside of a dome.
 *
 * A flat scene.background is one colour everywhere, which is exactly what an
 * outdoor sky never is: the zenith is three stops darker and much bluer than
 * the horizon, and losing that gradient is most of why a procedural garden
 * reads as a diorama. The dome is unlit and unfogged — it IS the distance.
 */
export function buildSky() {
  const cv = document.createElement('canvas');
  cv.width = 4;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#2c67a6');
  g.addColorStop(0.3, '#5e9bc9');
  g.addColorStop(0.56, '#95c0dc');
  g.addColorStop(0.76, '#c6d9de');
  g.addColorStop(0.9, '#e6dfc9');
  g.addColorStop(1, '#f0dcb4');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(58, 20, 14),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false })
  );
  dome.renderOrder = -1;
  return dome;
}

/** One fair-weather cumulus, on a billboard. */
function cloudTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N / 2;
  const ctx = cv.getContext('2d');
  const rand = mulberry(91);
  for (let i = 0; i < 22; i++) {
    const x = 30 + rand() * (N - 60);
    const y = N * 0.34 - rand() * N * 0.16;
    const r = 16 + rand() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    // The underside of a cumulus is grey-blue, the top is nearly white
    const top = y < N * 0.24;
    g.addColorStop(0, top ? 'rgba(255,255,255,0.95)' : 'rgba(214,224,234,0.85)');
    g.addColorStop(0.55, top ? 'rgba(250,251,253,0.5)' : 'rgba(198,210,224,0.42)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The canopy of the birch that stands behind the player's left shoulder,
 * as an alpha cut-out. It is never drawn — it lives on a layer only the
 * sun's shadow camera sees — so all it contributes is dappled light on the
 * lawn. Leaf clusters thin out to the right, which is the canopy's edge.
 */
function canopyTexture() {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const ctx = cv.getContext('2d');
  const rand = mulberry(1907);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, N, N);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 520; i++) {
    const x = rand() * N;
    const y = rand() * N;
    // Dense on the left, broken toward the right-hand edge of the crown
    if (rand() > 1.05 - x / N * 0.95) continue;
    const r = 3 + rand() * 9;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.5), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/* -------------------------------------------------------------- the world */

/**
 * One draw call for a crowd of near-identical objects. Colour varies per
 * instance, so the trees keep their individual greens.
 */
function instanced(geo, items, material, shadows = false) {
  const mesh = new THREE.InstancedMesh(geo, material || lambert(0xffffff), items.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const c = new THREE.Color();
  items.forEach((it, i) => {
    p.fromArray(it.pos);
    e.fromArray(it.rot || [0, 0, 0]);
    q.setFromEuler(e);
    s.fromArray(it.scale);
    mesh.setMatrixAt(i, m.compose(p, q, s));
    mesh.setColorAt(i, c.setHex(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = shadows;
  return mesh;
}

/** A Norrland spruce. Five skirts, never the same green twice. */
const SPRUCE_GREENS = [0x22401d, 0x1d3a1c, 0x2a4a22, 0x1a3319, 0x2e5026];

/*
 * `tiers` is the level of detail. A tree twenty metres away is four pixels
 * of silhouette wide; giving it five skirts to describe something the eye
 * reads as a triangle is wasted geometry. The near rank gets the detail,
 * the ranks behind it get the silhouette.
 */
function spruce(rand, h, colour, tiers, x, z, cones, trunks) {
  const treeY = rand() * Math.PI;
  const squash = 0.94 + rand() * 0.14;
  if (trunks) {
    trunks.push({
      pos: [x, h * 0.15, z], rot: [0, treeY, 0],
      scale: [h * 0.035, h * 0.3, h * 0.035], color: 0x3d2b1c
    });
  }
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const r = h * (0.26 - k * 0.048);
    cones.push({
      pos: [x, h * (0.26 + k * (0.85 / tiers)), z],
      rot: [0, treeY + rand() * Math.PI, 0],
      scale: [r * (1 + (rand() - 0.5) * 0.12), h * (0.32 - k * 0.03) * (5 / tiers), r * squash],
      color: colour
    });
  }
}

/** A grass blade: a tapering, slightly bent strip, one unit tall. */
function bladeGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [-0.5, 0, 0, 0.5, 0, 0, -0.32, 0.5, 0.06, 0.32, 0.5, 0.06, 0, 1, 0.16];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Normals straight up: a blade lit as its own thin sliver flickers between
  // black and white; lit like the lawn it is part of, it just adds depth
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

/** A pennant: a triangle hanging point down from the line, subdivided so
    it can ripple. Top edge at y = 0, tip at y = -1. */
function pennantGeometry() {
  const g = new THREE.PlaneGeometry(1, 1, 2, 4);
  g.translate(0, -0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, p.getX(i) * (1 + p.getY(i)));
  }
  g.computeVertexNormals();
  return g;
}

/** A swallow, as three triangles. Wings flap in the vertex shader. */
function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const pos = [
    0, 0, 0.2, 0.05, 0, 0.04, -0.05, 0, 0.04, 0, 0, -0.22,
    0.06, 0, 0.06, 0.06, 0, -0.07, 0.5, 0.02, -0.12,
    -0.06, 0, 0.06, -0.06, 0, -0.07, -0.5, 0.02, -0.12,
    0, 0, -0.22, 0.09, 0, -0.34, -0.09, 0, -0.34
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  return g;
}

export function buildGarden({ lowTier = false } = {}) {
  const group = new THREE.Group();
  const rand = mulberry(2021);
  const refs = {};
  const wind = { uTime: { value: 0 }, uGust: { value: 0 } };

  /* Lawn */
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshLambertMaterial({ map: lawnTexture() })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  group.add(lawn);

  /* Clouds, high and far, drifting east */
  {
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.9
    });
    const spots = [[-26, 10, -44, 1.25], [9, 13.5, -46, 1], [30, 8.5, -40, 0.85], [-5, 15.5, -50, 0.7], [-44, 12, -42, 0.9]];
    const clouds = new THREE.InstancedMesh(new THREE.PlaneGeometry(24, 12), cloudMat, spots.length);
    clouds.frustumCulled = false;
    refs.clouds = { mesh: clouds, spots };
    group.add(clouds);
  }

  /* The hedge behind the easels — one instanced draw for the whole run */
  {
    const bushes = [];
    for (let x = -14; x <= 14; x += 1.15) {
      const r = 0.8 + rand() * 0.22;
      bushes.push({
        pos: [x + (rand() - 0.5) * 0.25, 0.68, -9.6 + (rand() - 0.5) * 0.4],
        rot: [0, rand() * Math.PI, 0],
        scale: [r, r * 0.92, r],
        color: 0x2b5024 + Math.floor(rand() * 3) * 0x000a04
      });
    }
    const hedgeMat = windify(lambert(0xffffff), wind, { amp: 0.035, base: 0, span: 1, freq: 0.8, key: 'hedge' });
    group.add(instanced(new THREE.SphereGeometry(1, 8, 6), bushes, hedgeMat, true));

    // A bed of summer flowers along the foot of the hedge
    const flowers = [];
    const cols = [0xc8414f, 0xe8b84e, 0xece6d6, 0x9c5aa6, 0xd8743f, 0x6a84c8, 0xc8414f, 0xece6d6];
    for (let i = 0; i < (lowTier ? 160 : 320); i++) {
      const s = 0.045 + rand() * 0.04;
      flowers.push({
        pos: [-13 + rand() * 26, 0.06 + rand() * 0.34, -8.75 + rand() * 0.4],
        scale: [s, s * 0.8, s],
        color: cols[Math.floor(rand() * cols.length)]
      });
    }
    const bedMat = windify(lambert(0xffffff), wind, { amp: 0.6, base: -1, span: 2, freq: 1.4, key: 'bed' });
    group.add(instanced(new THREE.IcosahedronGeometry(1, 0), flowers, bedMat));
  }

  /* The house — Terrassvägen 47: falu red with white knots, as it should be */
  {
    const house = new THREE.Group();
    house.position.set(9.5, 0, -22);
    house.rotation.y = -0.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3.6, 6.5), lambert(0x8c3126));
    body.position.y = 1.8;
    house.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.3, 4), lambert(0x4a4348));
    roof.position.y = 4.72;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.66;
    house.add(roof);
    // White corner boards: the knots that make it a falu-red house
    [-4.98, 4.98].forEach((x) => {
      const knot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.6, 0.16), lambert(0xf2efe6));
      knot.position.set(x, 1.8, 3.2);
      house.add(knot);
    });
    // Windows: dark glass inside a white frame. A white pane on a white
    // frame is what turned these into blank patches the first time round.
    [-3.4, -1.15, 1.15, 3.4].forEach((wx) => {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.45, 0.08), lambert(0xf2efe6));
      fr.position.set(wx, 2.05, 3.26);
      house.add(fr);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 1.22), lambert(0x2a3a44));
      win.position.set(wx, 2.05, 3.31);
      house.add(win);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.06, 0.03), lambert(0xf2efe6));
      bar.position.set(wx, 2.05, 3.33);
      house.add(bar);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.24, 0.03), lambert(0xf2efe6));
      post.position.set(wx, 2.05, 3.33);
      house.add(post);
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 0.1), lambert(0xf2efe6));
    door.position.set(0, 1.1, 3.26);
    house.add(door);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.9), lambert(0x6d4a2c));
    panel.position.set(0, 1.1, 3.32);
    house.add(panel);
    const step = new THREE.Mesh(new THREE.BoxGeometry(2, 0.16, 0.9), lambert(0xb8b0a0));
    step.position.set(0, 0.08, 3.7);
    house.add(step);
    bake(house);
    group.add(house);
  }

  /* Three ranks of spruce, each paler than the last. Distance is sold with
     colour, not with more geometry — the far rank is two-thirds of the way
     to the sky and carries no detail at all. */
  {
    const cones = [];
    const trunks = [];
    for (let i = 0; i < 26; i++) {
      spruce(rand, 5 + rand() * 3, SPRUCE_GREENS[Math.floor(rand() * SPRUCE_GREENS.length)], 5,
        -32 + i * 2.5 + rand() * 1.2, -25 - rand() * 3, cones, trunks);
    }
    for (let i = 0; i < 20; i++) {
      spruce(rand, 6 + rand() * 3, 0x466a72, 3,
        -38 + i * 3.8 + rand() * 2, -34 - rand() * 4, cones, null);
    }
    for (let i = 0; i < 14; i++) {
      spruce(rand, 7 + rand() * 3, 0x7f9fa8, 2,
        -44 + i * 6.2 + rand() * 3, -44 - rand() * 5, cones, null);
    }
    // Cones are one unit tall centred on the origin: the tip moves, the
    // skirt's hem barely does
    const coneMat = windify(lambert(0xffffff), wind, { amp: 0.09, base: -0.5, span: 1, freq: 0.7, key: 'spruce' });
    group.add(instanced(new THREE.ConeGeometry(1, 1, 9), cones, coneMat));
    group.add(instanced(new THREE.CylinderGeometry(0.5, 1, 1, 5), trunks));
  }

  /* Birches: two behind the easels carrying the bunting, and one behind the
     player's shoulder whose crown is out of frame but whose shade is not */
  {
    const trunks = new THREE.Group();
    const crowns = new THREE.Group();
    const birch = (x, z, h) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, h, 7), lambert(0xe4e0d4));
      trunk.position.set(x, h / 2, z);
      trunks.add(trunk);
      for (let i = 0; i < 5; i++) {
        const mark = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), lambert(0x2a2620));
        mark.position.set(x, h * (0.2 + rand() * 0.6), z + 0.1);
        mark.rotation.y = rand() * Math.PI;
        trunks.add(mark);
      }
      for (let i = 0; i < 5; i++) {
        const crown = new THREE.Mesh(new THREE.SphereGeometry(1 + rand() * 0.5, 7, 5), lambert(0x6d9c3c + Math.floor(rand() * 3) * 0x040602));
        crown.position.set(x + (rand() - 0.5) * 1.6, h + rand() * 1.2, z + (rand() - 0.5) * 1.6);
        crowns.add(crown);
      }
    };
    birch(-8.6, -8.4, 5);
    birch(9.2, -8.8, 5.4);
    birch(-7.6, 4.4, 5.6);
    bake(trunks);
    const crownMesh = bake(crowns);
    crownMesh.material = windify(new THREE.MeshLambertMaterial({ vertexColors: true }), wind, {
      amp: 0.22, base: 3.6, span: 3.5, freq: 0.9, instanced: false, key: 'crown'
    });
    group.add(trunks, crowns);

    // The dappled light, from the near birch's canopy
    const canopy = new THREE.Mesh(
      new THREE.PlaneGeometry(11, 9),
      new THREE.MeshBasicMaterial({ alphaMap: canopyTexture(), alphaTest: 0.5, side: THREE.DoubleSide })
    );
    canopy.rotation.x = -Math.PI / 2;
    canopy.position.set(-4.4, 5.6, 1.2);
    canopy.castShadow = true;
    canopy.layers.set(1);
    refs.canopy = canopy;
    group.add(canopy);
  }

  /* Bunting on a catenary between the two birches. Pennants floating with
     no line between them is the detail that gives a scene away as fake. */
  {
    const x0 = -8.6;
    const x1 = 9.2;
    const y0 = 5;
    const y1 = 5.4;
    const sag = 1.5;
    const z = -8.6;
    const curveAt = (k) => new THREE.Vector3(
      x0 + k * (x1 - x0),
      y0 + k * (y1 - y0) - Math.sin(k * Math.PI) * sag,
      z
    );
    const line = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => curveAt(i / 11))),
        24, 0.022, 5, false
      ),
      lambert(0x3b3229)
    );
    group.add(line);
    const flagCols = [0xf2c14e, 0x2e5f9e, 0xd8394d, 0xe9e4d6];
    const flags = [];
    for (let i = 0; i <= 22; i++) {
      const k = (i + 0.5) / 23;
      const p = curveAt(k);
      flags.push({
        pos: [p.x, p.y - 0.01, p.z],
        rot: [0, 0, 0],
        scale: [0.36, 0.44, 1],
        color: flagCols[i % 4]
      });
    }
    // Each pennant swings on the line (its instance matrix, per frame) and
    // ripples along its length (here)
    const flagMat = lambert(0xffffff, { side: THREE.DoubleSide });
    flagMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind.uTime;
      shader.uniforms.uGust = wind.uGust;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float fPh = instanceMatrix[3].x * 1.7;
          transformed.z += sin(uTime * 7.0 + fPh - position.y * 4.0) * 0.12 * (-position.y) * (0.6 + uGust);`);
    };
    flagMat.customProgramCacheKey = () => 'pm-pennant';
    const bunting = instanced(pennantGeometry(), flags, flagMat);
    refs.bunting = { mesh: bunting, flags };
    group.add(bunting);
  }

  /* Grass, standing up out of the lawn where the camera can see it */
  {
    const blades = [];
    const greens = [0x5f7f34, 0x6f8f3c, 0x4f6e2c, 0x7d9a48, 0x587a30];
    const n = lowTier ? 1400 : 3600;
    for (let i = 0; i < n; i++) {
      const x = -7 + rand() * 14;
      const z = -8 + rand() * 9.5;
      const h = 0.08 + rand() * 0.16;
      blades.push({
        pos: [x, 0, z],
        rot: [0, rand() * Math.PI, (rand() - 0.5) * 0.4],
        scale: [0.025 + rand() * 0.02, h, 1],
        color: greens[Math.floor(rand() * greens.length)]
      });
    }
    const grassMat = windify(lambert(0xffffff, { side: THREE.DoubleSide }), wind, { amp: 0.6, base: 0, span: 1, freq: 1.6, key: 'grass' });
    const grass = instanced(bladeGeometry(), blades, grassMat);
    grass.receiveShadow = true;
    group.add(grass);

    // Daisies and clover heads in the near lawn
    const heads = [];
    for (let i = 0; i < (lowTier ? 90 : 200); i++) {
      const s = 0.012 + rand() * 0.01;
      heads.push({
        pos: [-7 + rand() * 14, 0.05 + rand() * 0.06, -8 + rand() * 9.5],
        scale: [s, s * 0.45, s],
        color: rand() < 0.65 ? 0xe4e2d6 : rand() < 0.6 ? 0xe0b83c : 0xb87a9c
      });
    }
    const headMesh = instanced(new THREE.IcosahedronGeometry(1, 0), heads);
    headMesh.receiveShadow = true;
    group.add(headMesh);
  }

  /* Swallows, looping over the hedge */
  {
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x2b2d36, side: THREE.DoubleSide });
    birdMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float bPh = instanceMatrix[3].x * 3.1 + instanceMatrix[3].z * 1.3;
          float flap = sin(uTime * 13.0 + bPh);
          transformed.y += flap * max(0.0, abs(position.x) - 0.06) * 0.9;`);
    };
    birdMat.customProgramCacheKey = () => 'pm-bird';
    const flock = [];
    for (let i = 0; i < 6; i++) {
      flock.push({
        cx: -6 + rand() * 12, cy: 5 + rand() * 4, cz: -10 - rand() * 8,
        rx: 4 + rand() * 5, rz: 2 + rand() * 3, speed: 0.35 + rand() * 0.3,
        phase: rand() * Math.PI * 2, dir: rand() < 0.5 ? -1 : 1, s: 0.75 + rand() * 0.4
      });
    }
    const birds = new THREE.InstancedMesh(birdGeometry(), birdMat, flock.length);
    birds.frustumCulled = false;
    refs.birds = { mesh: birds, flock };
    group.add(birds);
  }

  /* The trestle with the hat, the beer and the fika */
  {
    const table = new THREE.Group();
    table.position.set(-2.55, 0, -3.5);
    table.rotation.y = 0.5;
    // Planked top, not a slab: a trestle in a Norrland garden is boards
    for (let i = 0; i < 5; i++) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.155), lambert(i % 2 ? 0xc0b394 : 0xb6a888));
      plank.position.set(0, 0.76, -0.34 + i * 0.17);
      table.add(plank);
    }
    [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.76, 6), lambert(0x8d7f66));
      leg.position.set(x, 0.38, z);
      table.add(leg);
    });
    const brace = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.05), lambert(0x8d7f66));
    brace.position.set(0, 0.3, 0);
    table.add(brace);
    // The hat the slips came out of, with the slips showing over the brim
    const hat = new THREE.Group();
    hat.position.set(-0.55, 0.785, 0);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.03, 20), lambert(0x2c2620));
    brim.position.y = 0.015;
    hat.add(brim);
    const crown2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.185, 0.2, 18), lambert(0x2c2620));
    crown2.position.y = 0.125;
    hat.add(crown2);
    const bandH = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.188, 0.05, 18), lambert(0x8a2f28));
    bandH.position.y = 0.055;
    hat.add(bandH);
    for (let i = 0; i < 4; i++) {
      const slip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.006, 0.05), lambert(0xf3eedf));
      slip.position.set((rand() - 0.5) * 0.14, 0.226, (rand() - 0.5) * 0.14);
      slip.rotation.set((rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6);
      hat.add(slip);
    }
    bake(hat);
    refs.hat = hat;
    // Beer. Ten each, said the brief.
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), lambert(0x4a2f14));
      bottle.position.set(0.15 + i * 0.13, 0.9, (rand() - 0.5) * 0.4);
      table.add(bottle);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.07, 7), lambert(0x4a2f14));
      neck.position.set(bottle.position.x, 1.05, bottle.position.z);
      table.add(neck);
    }
    // Fika: a plate of buns
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.015, 16), lambert(0xf2efe6));
    plate.position.set(-0.05, 0.795, 0.2);
    table.add(plate);
    for (let i = 0; i < 4; i++) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lambert(0xc98a44));
      bun.scale.y = 0.6;
      bun.position.set(-0.05 + Math.cos(i * 1.6) * 0.06, 0.82, 0.2 + Math.sin(i * 1.6) * 0.06);
      table.add(bun);
    }
    bake(table, { skip: [hat], receiveShadow: true });
    table.add(hat);
    group.add(table);
  }

  /* A parasol and two folding chairs, to give the middle distance something
     other than lawn between the easels and the hedge */
  {
    const set = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), lambert(0xb8b0a0));
    pole.position.set(5.9, 1.15, -8.6);
    set.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.62, 8), lambert(0xd8dcd6));
    canopy.position.set(5.9, 2.35, -8.6);
    set.add(canopy);
    // Alternating gores, the way every garden parasol is striped
    for (let i = 0; i < 4; i++) {
      const gore = new THREE.Mesh(
        new THREE.ConeGeometry(1.505, 0.625, 8, 1, false, (i * Math.PI) / 2, Math.PI / 4),
        lambert(0xc4443c)
      );
      gore.position.set(5.9, 2.35, -8.6);
      set.add(gore);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0xb8b0a0));
    finial.position.set(5.9, 2.7, -8.6);
    set.add(finial);

    [[5.1, -7.9, 0.7], [6.9, -8.3, -0.4]].forEach(([cx, cz, ry]) => {
      const chair = new THREE.Group();
      chair.position.set(cx, 0, cz);
      chair.rotation.y = ry;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.48), lambert(0x2f5f96));
      seat.position.y = 0.44;
      chair.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), lambert(0x2f5f96));
      back.position.set(0, 0.68, -0.22);
      back.rotation.x = -0.22;
      chair.add(back);
      [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 5), lambert(0xb8b0a0));
        leg.position.set(lx, 0.22, lz);
        chair.add(leg);
      });
      set.add(chair);
    });
    bake(set);
    group.add(set);
  }

  refs.lawn = lawn;
  return { group, refs, wind };
}

/** Per-frame garden motion: gusts, bunting, birds, clouds, the dapples. */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function animateGarden(garden, t, still) {
  const { refs, wind } = garden;
  wind.uTime.value = still ? 0 : t;
  // A gust every few seconds, never on a fixed beat
  wind.uGust.value = still ? 0 : Math.max(0, Math.sin(t * 0.37) * 0.6 + Math.sin(t * 0.83 + 1.3) * 0.4);
  const gust = wind.uGust.value;

  const { mesh: bunting, flags } = refs.bunting;
  flags.forEach((f, i) => {
    const swing = still ? 0 : Math.sin(t * 2.1 + i * 0.73) * (0.18 + gust * 0.3) - gust * 0.25;
    _e.set(swing, Math.sin(t * 1.3 + i) * 0.15 * gust, Math.sin(i * 1.7) * 0.1);
    _q.setFromEuler(_e);
    _m.compose(_p.fromArray(f.pos), _q, _s.fromArray(f.scale));
    bunting.setMatrixAt(i, _m);
  });
  bunting.instanceMatrix.needsUpdate = true;

  const { mesh: birds, flock } = refs.birds;
  flock.forEach((b, i) => {
    const a = b.phase + t * b.speed * b.dir;
    const x = b.cx + Math.cos(a) * b.rx;
    const z = b.cz + Math.sin(a) * b.rz;
    const y = b.cy + Math.sin(a * 2 + i) * 0.7;
    // Heading along the path, banking into the turn
    const dx = -Math.sin(a) * b.rx * b.dir;
    const dz = Math.cos(a) * b.rz * b.dir;
    _e.set(0, Math.atan2(dx, dz), -b.dir * 0.35);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.setScalar(b.s));
    birds.setMatrixAt(i, _m);
  });
  birds.instanceMatrix.needsUpdate = true;

  const { mesh: clouds, spots } = refs.clouds;
  spots.forEach(([x, y, z, s], i) => {
    const drift = ((x + 50 + t * 0.35 * (1 + i * 0.12)) % 100) - 50;
    _m.compose(_p.set(drift, y, z), _q.identity(), _s.set(s, s, 1));
    clouds.setMatrixAt(i, _m);
  });
  clouds.instanceMatrix.needsUpdate = true;

  const { canopy } = refs;
  canopy.position.x = -4.4 + (still ? 0 : Math.sin(t * 0.9) * 0.12 * (0.4 + gust));
  canopy.rotation.z = still ? 0 : Math.sin(t * 0.6 + 0.4) * 0.025 * (0.5 + gust);
}

/* ---------------------------------------------------------------- easels */

/**
 * An easel with a canvas on it. With an `artMaterial` the canvas front is a
 * separate plane carrying it (index.js paints it and raycasts against it);
 * without one the whole easel, blank canvas and all, bakes into one mesh.
 */
export function buildEasel(artMaterial, w = 1.5, h = 1.15) {
  const g = new THREE.Group();
  const wood = 0xa8804a;

  // Three legs, all BEHIND the canvas plane. An A-frame carries the canvas
  // on a tray at its front; legs crossing in front of the picture is the
  // one thing an easel never does. The mast is sized off the canvas —
  // a fixed length leaves a small canvas perched on stilts.
  const legLen = 1.05 + h * 0.6;
  [[-0.4 - w * 0.06, -0.06, 0.13], [0.4 + w * 0.06, -0.06, -0.13], [0, -0.62, 0]].forEach(([x, z, tilt]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.037, legLen, 6), lambert(wood));
    leg.position.set(x, legLen / 2 - 0.02, z);
    leg.rotation.z = tilt;
    leg.rotation.x = z < -0.3 ? -0.3 : 0.05;
    g.add(leg);
  });
  // Tray the canvas rests on, with the brushes, a rag and the tubes on it
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.05, 0.14), lambert(wood));
  tray.position.set(0, 0.95, -0.02);
  g.add(tray);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.045, 0.028), lambert(wood));
  lip.position.set(0, 0.99, 0.045);
  g.add(lip);
  if (artMaterial) {
    [[-0.3, 0.14], [-0.21, -0.1], [0.34, 0.05]].forEach(([bx, rot], i) => {
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.26, 5), lambert(0xc9a05a));
      shaft.rotation.set(Math.PI / 2, 0, Math.PI / 2 + rot);
      shaft.position.set(bx, 0.995, -0.01);
      g.add(shaft);
      const ferrule = new THREE.Mesh(new THREE.ConeGeometry(0.017, 0.055, 5), lambert(i ? 0x2a2018 : 0x8a2f28));
      ferrule.rotation.set(Math.PI / 2, 0, -Math.PI / 2 + rot);
      ferrule.position.set(bx + 0.15, 0.995, -0.01 + rot * 0.14);
      g.add(ferrule);
    });
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.11), lambert(0xd8d0bc));
    rag.position.set(0.13, 0.99, 0.0);
    rag.rotation.y = 0.4;
    g.add(rag);
    // The five tubes, squeezed flat at the back, caps toward us
    [0xc0242c, 0xe8b419, 0x22459b, 0xf4f2ea, 0x1b1815].forEach((col, i) => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.11, 7), lambert(0xd9d6cf));
      tube.rotation.set(Math.PI / 2 - 0.1, 0, 0.3 - i * 0.12);
      tube.position.set(-0.52 + i * 0.045, 0.99, -0.03);
      g.add(tube);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0165, 0.0165, 0.04, 7), lambert(col));
      band.rotation.copy(tube.rotation);
      band.position.copy(tube.position);
      g.add(band);
    });
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, h + 0.09, 0.05), lambert(0xc4a878));
  frame.position.set(0, 0.98 + h / 2, 0.01);
  g.add(frame);

  // A box, not a plane: the canvas is a stretched object with a visible
  // edge, and a zero-thickness quad at this distance reads as a decal.
  const stretched = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), lambert(artMaterial ? 0xe8e2d2 : 0xd8cfba));
  stretched.position.set(0, 0.98 + h / 2, 0.045);
  g.add(stretched);

  bake(g, { receiveShadow: !artMaterial });

  let canvas = null;
  if (artMaterial) {
    canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMaterial);
    canvas.position.set(0, 0.98 + h / 2, 0.0605);
    g.add(canvas);
  }
  g.userData = { canvas };
  return g;
}

/**
 * The brush in the player's hand. Only on screen while a region is being
 * laid in: it follows the strokes across the canvas, loaded with the mix.
 * Its origin is the bristle tip, so placing it is placing the paint.
 */
export function buildBrush() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0085, 0.011, 0.3, 8), lambert(0x7a2a22));
  handle.position.y = 0.225;
  body.add(handle);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.0095, 0.05, 8), lambert(0xb9b4aa));
  ferrule.position.y = 0.055;
  body.add(ferrule);
  bake(body, { castShadow: false });
  g.add(body);
  const tipMat = lambert(0x888888);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0105, 0.04, 8), tipMat);
  tip.rotation.x = Math.PI;
  tip.position.y = 0.012;
  tip.scale.z = 0.55;
  g.add(tip);
  g.visible = false;
  return { group: g, tipMat };
}

/* --------------------------------------------------------------- painters */

/** Shared figure: legs, hips, torso, neck; a head pivot and two arm pivots. */
function figure(shirt, opts = {}) {
  const g = new THREE.Group();
  const skin = opts.skin ?? 0xd9a678;
  const trousers = opts.trousers ?? 0x2b3140;

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82, 0.22), lambert(trousers));
  legs.position.y = 0.41;
  g.add(legs);
  [-0.09, 0.09].forEach((x) => {
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.26), lambert(opts.shoes ?? 0x2a211a));
    shoe.position.set(x, 0.035, 0.03);
    g.add(shoe);
  });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.36, 4, 10), lambert(shirt));
  torso.scale.set(1, 1, 0.68);
  torso.position.y = 1.11;
  g.add(torso);
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.24), lambert(trousers));
  hips.position.y = 0.83;
  g.add(hips);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8), lambert(skin));
  neck.position.y = 1.36;
  g.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), lambert(skin));
  skull.scale.set(0.92, 1.08, 0.98);
  head.add(skull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 6), lambert(skin));
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.008, 0.118);
  head.add(nose);
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), lambert(skin));
    ear.position.set(s * 0.118, 0, -0.005);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 7, 6), lambert(0x2b241c));
    eye.position.set(s * 0.048, 0.022, 0.104);
    eye.scale.z = 0.5;
    head.add(eye);
  });
  g.add(head);

  const arm = (side) => {
    const a = new THREE.Group();
    a.position.set(side * 0.235, 1.3, 0);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 3, 7), lambert(shirt));
    upper.position.y = -0.25;
    a.add(upper);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 7, 6), lambert(skin));
    hand.position.y = -0.5;
    a.add(hand);
    g.add(a);
    return a;
  };
  const armL = arm(-1);
  const armR = arm(1);
  return { g, head, armL, armR };
}

/** Collapse a figure to four meshes: body, head, and each arm. */
function bakeFigure(f) {
  bake(f.head);
  bake(f.armL);
  bake(f.armR);
  bake(f.g, { skip: [f.head, f.armL, f.armR] });
}

/**
 * A Pekkas painter at an easel, seen from behind or three-quarters. Fewer
 * joints than the fencers or the table tennis players need — these are set
 * dressing — but the brush arm moves, because a garden full of people
 * standing perfectly still reads as a graveyard.
 */
export function buildPainter(shirt, opts = {}) {
  const f = figure(shirt, opts);
  const { head, armL, armR } = f;

  if (opts.beret) {
    // Per Olsson came as Hans Hedberg: red beret, brown polo, big eyebrows
    const beret = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 8, 0, Math.PI * 2, 0, 1.15), lambert(0xa8202c));
    beret.position.set(0, 0.03, -0.012);
    beret.rotation.z = 0.2;
    beret.scale.y = 0.62;
    head.add(beret);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), lambert(0xa8202c));
    nub.position.set(0, 0.12, -0.012);
    head.add(nub);
    [-1, 1].forEach((s) => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.024, 0.018), lambert(0xb9b3a6));
      brow.position.set(s * 0.048, 0.045, 0.108);
      head.add(brow);
    });
  } else {
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.132, 12, 9, 0, Math.PI * 2, 0, 1.25),
      lambert(opts.hair ?? 0x3d2b18)
    );
    hair.position.set(0, 0.012, -0.01);
    hair.scale.set(1, 1.02, 1.04);
    head.add(hair);
  }

  // Off arm holds the palette; brush arm swings at the canvas
  armL.rotation.set(0.5, 0, 0.3);
  const held = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.014, 14), lambert(0xb98d52));
  held.position.set(-0.02, -0.55, 0.06);
  held.rotation.set(1.35, 0, 0.2);
  armL.add(held);
  [0xc0242c, 0xe8b419, 0x22459b, 0xf4f2ea, 0x2a2018].forEach((col, i) => {
    const dab = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), lambert(col));
    const a = -1.1 + i * 0.55;
    dab.position.set(Math.sin(a) * 0.105, 0.009, Math.cos(a) * 0.105);
    dab.scale.y = 0.4;
    held.add(dab);
  });
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.3, 6), lambert(0xc9a05a));
  brush.position.set(0, -0.62, 0.03);
  armR.add(brush);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), lambert(0x2a2018));
  tip.position.set(0, -0.79, 0.03);
  armR.add(tip);

  bakeFigure(f);
  return { group: f.g, refs: { head, armL, armR } };
}

/**
 * Mikael Hägglund, the culture profile invited to judge. He is dressed for
 * it — black polo neck, round glasses, a notebook — and walks up to your
 * easel for the verdict.
 */
export function buildJudge() {
  const f = figure(0x1f2026, { trousers: 0x8f8268, shoes: 0x3a2a1e });
  const { g, head, armL, armR } = f;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.08, 12), lambert(0x1f2026));
  collar.position.y = 1.36;
  g.add(collar);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 12, 9, 0, Math.PI * 2, 0, 1.0),
    lambert(0x9a958c)
  );
  hair.position.set(0, 0.02, -0.02);
  head.add(hair);
  // Round glasses: two rings and a bridge
  [-1, 1].forEach((s) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.0045, 6, 16), lambert(0x18181a));
    ring.position.set(s * 0.048, 0.022, 0.118);
    head.add(ring);
  });
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.006), lambert(0x18181a));
  bridge.position.set(0, 0.026, 0.12);
  head.add(bridge);
  // Notebook in the left hand, pen in the right
  armL.rotation.set(-0.9, 0, 0.25);
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.012, 0.21), lambert(0x6b2e24));
  book.position.set(0.02, -0.52, 0.08);
  book.rotation.set(0.2, 0, 0.1);
  armL.add(book);
  const page = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.004, 0.19), lambert(0xf3eedf));
  page.position.set(0.02, -0.512, 0.08);
  page.rotation.copy(book.rotation);
  armL.add(page);
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6), lambert(0x18181a));
  pen.position.set(0, -0.56, 0.03);
  pen.rotation.x = 0.4;
  armR.add(pen);
  bakeFigure(f);
  return { group: g, refs: { head, armL, armR } };
}
