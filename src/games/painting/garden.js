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

/** Late-summer lawn: mown bands, clover patches, a few burnt spots. */
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
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  // Grass is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
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

function spruce(rand, h) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(h * 0.02, h * 0.035, h * 0.3, 5),
    lambert(0x3d2b1c)
  );
  trunk.position.y = h * 0.15;
  g.add(trunk);
  for (let i = 0; i < 4; i++) {
    const k = i / 4;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(h * (0.24 - k * 0.05), h * 0.34, 7),
      lambert(0x24401f)
    );
    cone.position.y = h * (0.28 + k * 0.2);
    cone.rotation.y = rand() * Math.PI;
    g.add(cone);
  }
  return g;
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

  /* The hedge behind the easels */
  for (let x = -9; x <= 9; x += 1.1) {
    const bush = new THREE.Mesh(
      new THREE.SphereGeometry(0.75 + rand() * 0.2, 8, 6),
      lambert(0x2f5326)
    );
    bush.position.set(x + (rand() - 0.5) * 0.2, 0.65, -7.4);
    bush.scale.y = 0.9;
    bush.castShadow = true;
    group.add(bush);
  }

  /* The house — Terrassvägen 47: falu red with white knots, as it should be */
  {
    const house = new THREE.Group();
    house.position.set(4.5, 0, -13.5);
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3.4, 6), lambert(0x8c3126));
    body.position.y = 1.7;
    body.castShadow = true;
    house.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.6, 2.1, 4), lambert(0x3a3a3f));
    roof.position.y = 4.45;
    roof.rotation.y = Math.PI / 4;
    roof.scale.z = 0.66;
    house.add(roof);
    // Windows and the white trim Norrland insists on
    [-3, -1, 1, 3].forEach((wx) => {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 1.15), lambert(0xdfe6ee));
      win.position.set(wx, 2, 3.02);
      house.add(win);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 0.07), lambert(0xf2efe6));
      fr.position.set(wx, 2, 2.99);
      house.add(fr);
    });
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), lambert(0xf2efe6));
    door.position.set(0, 1.05, 3.02);
    house.add(door);
    group.add(house);
  }

  /* Two ranks of spruce, the far one tinted toward the haze. Distance is
     sold with paler colour, not with more geometry. */
  for (let i = 0; i < 26; i++) {
    const t = spruce(rand, 5 + rand() * 3);
    t.position.set(-26 + i * 2.1 + rand() * 1.2, 0, -19 - rand() * 2);
    group.add(t);
  }
  for (let i = 0; i < 20; i++) {
    const t = spruce(rand, 6 + rand() * 3);
    t.position.set(-28 + i * 3 + rand() * 2, 0, -30 - rand() * 4);
    t.traverse((o) => {
      if (o.isMesh) o.material = lambert(0x5d7d84);
    });
    group.add(t);
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
  birch(-6.5, -6, 4.4);
  birch(7, -6.5, 4.8);

  const flagMat = [lambert(0xf2c14e), lambert(0x2e5f9e), lambert(0xd8394d)];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    const x = -6.5 + k * 13.5;
    const y = 4.4 + k * 0.4 - Math.sin(k * Math.PI) * 0.8;
    const flag = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 3), flagMat[i % 3]);
    flag.rotation.x = Math.PI;
    flag.rotation.y = rand() * Math.PI;
    flag.position.set(x, y - 0.17, -6.2);
    group.add(flag);
  }

  /* The trestle with the hat, the beer and the fika */
  {
    const table = new THREE.Group();
    table.position.set(-3.4, 0, -1.2);
    table.rotation.y = 0.4;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.85), lambert(0xd7cfbd));
    top.position.y = 0.76;
    top.castShadow = true;
    top.receiveShadow = true;
    table.add(top);
    [[-0.8, -0.3], [0.8, -0.3], [-0.8, 0.3], [0.8, 0.3]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.76, 6), lambert(0x8a8478));
      leg.position.set(x, 0.38, z);
      table.add(leg);
    });
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
  // one thing an easel never does.
  [[-0.44, -0.06, 0.13], [0.44, -0.06, -0.13], [0, -0.62, 0]].forEach(([x, z, tilt]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 1.75, 6), wood);
    leg.position.set(x, 0.85, z);
    leg.rotation.z = tilt;
    leg.rotation.x = z < -0.3 ? -0.3 : 0.05;
    leg.castShadow = true;
    g.add(leg);
  });
  // Tray the canvas rests on
  const tray = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.05, 0.13), wood);
  tray.position.set(0, 0.95, -0.02);
  tray.castShadow = true;
  g.add(tray);

  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.09, h + 0.09, 0.05), lambert(0xc4a878));
  frame.position.set(0, 0.98 + h / 2, 0.01);
  frame.castShadow = true;
  g.add(frame);

  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), canvasMaterial);
  canvas.position.set(0, 0.98 + h / 2, 0.042);
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

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.26), shirtMat);
  torso.position.y = 1.09;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.25, 0.23), skinMat);
  head.position.y = 1.52;
  head.castShadow = true;
  g.add(head);
  refs.head = head;

  if (opts.beret) {
    // Per Olsson came as Hans Hedberg: red beret, brown polo, big eyebrows
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.14, 0.06, 14), lambert(0xa8202c));
    beret.position.set(0, 1.665, 0);
    beret.rotation.z = 0.16;
    g.add(beret);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), lambert(0xa8202c));
    nub.position.set(0, 1.705, 0);
    g.add(nub);
    [-1, 1].forEach((s) => {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.028, 0.02), lambert(0xb9b3a6));
      brow.position.set(s * 0.055, 1.575, 0.118);
      g.add(brow);
    });
  } else {
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.245, 0.08, 0.245), lambert(opts.hair ?? 0x3d2b18));
    hair.position.y = 1.635;
    g.add(hair);
  }

  // Off arm hangs; brush arm swings at the canvas
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.1), shirtMat);
  armL.geometry.translate(0, -0.25, 0);
  armL.position.set(-0.27, 1.32, 0);
  armL.rotation.z = 0.22;
  g.add(armL);

  const armR = new THREE.Group();
  armR.position.set(0.27, 1.32, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.46, 0.1), shirtMat);
  upper.geometry.translate(0, -0.23, 0);
  upper.castShadow = true;
  armR.add(upper);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.09), skinMat);
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
