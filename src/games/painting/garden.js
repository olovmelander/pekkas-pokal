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
 */

import * as THREE from 'three';

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

/** Soft round falloff — glows, light pools, contact shadows. */
export function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.42)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* -------------------------------------------------------------- the world */

/**
 * One draw call for a crowd of near-identical objects.
 *
 * A forest built as one Mesh per cone is two hundred draw calls describing
 * about four distinct shapes, and the draw calls — not the triangles — are
 * what a phone GPU actually runs out of. Colour varies per instance, so the
 * trees keep their individual greens.
 */
function instanced(geo, items, shadows = false) {
  const mesh = new THREE.InstancedMesh(geo, lambert(0xffffff), items.length);
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
 *
 * Nothing is built here — the cones and trunks are pushed onto shared lists
 * and drawn as two instanced meshes for the whole forest.
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

export function buildGarden() {
  const group = new THREE.Group();
  const rand = mulberry(2021);
  const refs = {};

  /* Lawn */
  const lawn = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70, 40, 40),
    new THREE.MeshLambertMaterial({ map: lawnTexture() })
  );
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  group.add(lawn);

  /* Clouds, high and far, before anything solid */
  {
    const cloudMat = new THREE.MeshBasicMaterial({
      map: cloudTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0.9
    });
    const cloudGeo = new THREE.PlaneGeometry(24, 12);
    [[-26, 10, -44, 1.25], [9, 13.5, -46, 1], [30, 8.5, -40, 0.85], [-5, 15.5, -50, 0.7]]
      .forEach(([x, y, z, s]) => {
        const c = new THREE.Mesh(cloudGeo, cloudMat);
        c.position.set(x, y, z);
        c.scale.setScalar(s);
        c.renderOrder = 0;
        group.add(c);
      });
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
    group.add(instanced(new THREE.SphereGeometry(1, 8, 6), bushes, true));
  }

  /* The house — Terrassvägen 47: falu red with white knots, as it should be */
  {
    const house = new THREE.Group();
    house.position.set(9.5, 0, -22);
    house.rotation.y = -0.22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3.6, 6.5), lambert(0x8c3126));
    body.position.y = 1.8;
    body.castShadow = true;
    house.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(7.2, 2.3, 4), lambert(0x4a4348));
    roof.position.y = 4.72;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.66;
    house.add(roof);
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
    group.add(instanced(new THREE.ConeGeometry(1, 1, 9), cones));
    group.add(instanced(new THREE.CylinderGeometry(0.5, 1, 1, 5), trunks));
  }

  /* Birches either side, with the bunting strung between them */
  const birch = (x, z, h) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, h, 7), lambert(0xe4e0d4));
    trunk.position.y = h / 2;
    trunk.castShadow = true;
    g.add(trunk);
    for (let i = 0; i < 5; i++) {
      const mark = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), lambert(0x2a2620));
      mark.position.set(0, h * (0.2 + rand() * 0.6), 0.1);
      mark.rotation.y = rand() * Math.PI;
      g.add(mark);
    }
    for (let i = 0; i < 5; i++) {
      const crown = new THREE.Mesh(new THREE.SphereGeometry(1 + rand() * 0.5, 7, 5), lambert(0x6d9c3c));
      crown.position.set((rand() - 0.5) * 1.6, h + rand() * 1.2, (rand() - 0.5) * 1.6);
      crown.castShadow = true;
      g.add(crown);
    }
    group.add(g);
  };
  birch(-8.6, -8.4, 5);
  birch(9.2, -8.8, 5.4);

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
        pos: [p.x, p.y - 0.22, p.z],
        rot: [Math.PI, rand() * Math.PI, Math.sin(i * 1.7) * 0.12],
        scale: [0.17, 0.42, 0.17],
        color: flagCols[i % 4]
      });
    }
    group.add(instanced(new THREE.ConeGeometry(1, 1, 3), flags));
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
      plank.castShadow = true;
      plank.receiveShadow = true;
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
    // The hat the slips came out of
    const hat = new THREE.Group();
    hat.position.set(-0.55, 0.83, 0);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.03, 20), lambert(0x2c2620));
    hat.add(brim);
    const crown2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.185, 0.2, 18), lambert(0x2c2620));
    crown2.position.y = 0.11;
    hat.add(crown2);
    const bandH = new THREE.Mesh(new THREE.CylinderGeometry(0.188, 0.188, 0.05, 18), lambert(0x8a2f28));
    bandH.position.y = 0.04;
    hat.add(bandH);
    hat.castShadow = true;
    table.add(hat);
    refs.hat = hat;
    // Beer. Ten each, said the brief.
    for (let i = 0; i < 5; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), lambert(0x4a2f14));
      bottle.position.set(0.15 + i * 0.13, 0.9, (rand() - 0.5) * 0.4);
      bottle.castShadow = true;
      table.add(bottle);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.07, 7), lambert(0x4a2f14));
      neck.position.set(bottle.position.x, 1.05, bottle.position.z);
      table.add(neck);
    }
    group.add(table);
  }

  /* A parasol and two folding chairs, to give the middle distance something
     other than lawn between the easels and the hedge */
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), lambert(0xb8b0a0));
    pole.position.set(5.9, 1.15, -8.6);
    pole.castShadow = true;
    group.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.62, 8), lambert(0xd8dcd6));
    canopy.position.set(5.9, 2.35, -8.6);
    canopy.castShadow = true;
    group.add(canopy);
    // Alternating gores, the way every garden parasol is striped
    for (let i = 0; i < 4; i++) {
      const gore = new THREE.Mesh(
        new THREE.ConeGeometry(1.505, 0.625, 8, 1, false, (i * Math.PI) / 2, Math.PI / 4),
        lambert(0xc4443c)
      );
      gore.position.set(5.9, 2.35, -8.6);
      group.add(gore);
    }
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lambert(0xb8b0a0));
    finial.position.set(5.9, 2.7, -8.6);
    group.add(finial);

    [[5.1, -7.9, 0.7], [6.9, -8.3, -0.4]].forEach(([cx, cz, ry]) => {
      const chair = new THREE.Group();
      chair.position.set(cx, 0, cz);
      chair.rotation.y = ry;
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.48), lambert(0x2f5f96));
      seat.position.y = 0.44;
      seat.castShadow = true;
      chair.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), lambert(0x2f5f96));
      back.position.set(0, 0.68, -0.22);
      back.rotation.x = -0.22;
      back.castShadow = true;
      chair.add(back);
      [[-0.21, -0.2], [0.21, -0.2], [-0.21, 0.2], [0.21, 0.2]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 5), lambert(0xb8b0a0));
        leg.position.set(lx, 0.22, lz);
        chair.add(leg);
      });
      group.add(chair);
    });
  }

  refs.lawn = lawn;
  return { group, refs };
}

/* ---------------------------------------------------------------- easels */

/**
 * An easel with a canvas on it. The canvas mesh is handed back so index.js
 * can hang a CanvasTexture on it and repaint as the player works.
 */
export function buildEasel(canvasMaterial, w = 1.5, h = 1.15) {
  const g = new THREE.Group();
  const wood = lambert(0xa8804a);

  // Three legs, all BEHIND the canvas plane. An A-frame carries the canvas
  // on a tray at its front; legs crossing in front of the picture is the
  // one thing an easel never does. The mast is sized off the canvas —
  // a fixed length leaves a small canvas perched on stilts.
  const legLen = 1.05 + h * 0.6;
  [[-0.4 - w * 0.06, -0.06, 0.13], [0.4 + w * 0.06, -0.06, -0.13], [0, -0.62, 0]].forEach(([x, z, tilt]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.037, legLen, 6), wood);
    leg.position.set(x, legLen / 2 - 0.02, z);
    leg.rotation.z = tilt;
    leg.rotation.x = z < -0.3 ? -0.3 : 0.05;
    leg.castShadow = true;
    g.add(leg);
  });
  // Tray the canvas rests on, with the brushes and rag on it
  const tray = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.05, 0.14), wood);
  tray.position.set(0, 0.95, -0.02);
  tray.castShadow = true;
  g.add(tray);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.045, 0.028), wood);
  lip.position.set(0, 0.99, 0.045);
  g.add(lip);
  if (w > 1) {
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
  }

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, h + 0.09, 0.05), lambert(0xc4a878));
  frame.position.set(0, 0.98 + h / 2, 0.01);
  frame.castShadow = true;
  g.add(frame);

  // A box, not a plane: the canvas is a stretched object with a visible
  // edge, and a zero-thickness quad at this distance reads as a decal.
  const canvas = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.03), canvasMaterial);
  canvas.position.set(0, 0.98 + h / 2, 0.045);
  canvas.castShadow = true;
  g.add(canvas);

  g.userData = { canvas };
  return g;
}

/* --------------------------------------------------------------- painters */

/**
 * A Pekkas painter at an easel, seen from behind or three-quarters. Fewer
 * joints than the fencers or the table tennis players need — these are set
 * dressing — but the brush arm moves, because a garden full of people
 * standing perfectly still reads as a graveyard.
 */
export function buildPainter(shirt, opts = {}) {
  const g = new THREE.Group();
  const refs = {};
  const skin = opts.skin ?? 0xd9a678;
  const skinMat = lambert(skin);
  const shirtMat = lambert(shirt);

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.82, 0.22), lambert(opts.trousers ?? 0x2b3140));
  legs.position.y = 0.41;
  legs.castShadow = true;
  g.add(legs);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.36, 4, 10), shirtMat);
  torso.scale.set(1, 1, 0.68);
  torso.position.y = 1.11;
  torso.castShadow = true;
  g.add(torso);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.24), lambert(opts.trousers ?? 0x2b3140));
  hips.position.y = 0.83;
  g.add(hips);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 8), skinMat);
  neck.position.y = 1.36;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.125, 14, 12), skinMat);
  head.scale.set(0.92, 1.08, 0.98);
  head.position.y = 1.5;
  head.castShadow = true;
  g.add(head);
  refs.head = head;

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 6), skinMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.008, 0.118);
  head.add(nose);
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), skinMat);
    ear.position.set(s * 0.118, 0, -0.005);
    ear.scale.set(0.5, 1, 0.8);
    head.add(ear);
  });

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

  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 7, 6), lambert(0x2b241c));
    eye.position.set(s * 0.048, 0.022, 0.104);
    eye.scale.z = 0.5;
    head.add(eye);
  });

  // Off arm holds the palette; brush arm swings at the canvas
  const armL = new THREE.Group();
  armL.position.set(-0.235, 1.3, 0);
  armL.rotation.set(0.5, 0, 0.3);
  const upperL = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 3, 7), shirtMat);
  upperL.geometry.translate(0, -0.25, 0);
  upperL.castShadow = true;
  armL.add(upperL);
  const handL = new THREE.Mesh(new THREE.SphereGeometry(0.052, 7, 6), skinMat);
  handL.position.y = -0.5;
  armL.add(handL);
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
  g.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.235, 1.3, 0);
  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.4, 3, 7), shirtMat);
  upper.geometry.translate(0, -0.25, 0);
  upper.castShadow = true;
  armR.add(upper);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.052, 7, 6), skinMat);
  hand.position.y = -0.5;
  armR.add(hand);
  const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.3, 6), lambert(0xc9a05a));
  brush.position.set(0, -0.62, 0.03);
  armR.add(brush);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 6), lambert(0x2a2018));
  tip.position.set(0, -0.79, 0.03);
  armR.add(tip);
  g.add(armR);
  refs.armR = armR;

  return { group: g, refs };
}

/**
 * The palette in the player's hands, at the bottom of the frame: the thumb
 * hole, the pigment wells around the rim and the pool of mixed paint in
 * the middle. index.js repaints the wells and the pool every frame.
 */
export function buildPalette(paletteMaterial) {
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.86), paletteMaterial);
  g.add(board);
  return g;
}
