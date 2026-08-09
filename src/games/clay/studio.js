/**
 * Pekkas Lerskulptur — the ceramics studio.
 *
 * A warm Barcelona taller at golden hour, built procedurally:
 *
 *  - the clay itself is shaded with a generated MATCAP — the trick every
 *    sculpting package uses for its clay preview: bake a sphere's whole
 *    lighting response into one small texture and look it up by normal.
 *    One 256px canvas gives wet highlights and soft occlusion for free,
 *    at any triangle count, on any phone
 *  - terracotta floor tiles and the arched window are canvas textures
 *  - the shelf pots are random lathe profiles with their glaze tints baked
 *    into vertex colours, merged so each shelf is a single draw call
 *  - a light shaft from the window and drifting dust motes carry the mood
 */

import * as THREE from 'three';

/* ---------------------------------------------------------------- helpers */

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

/* ---------------------------------------------------------------- matcaps */

/**
 * Paint a clay matcap: a warm base sphere, a broad soft key light up-left,
 * a tight wet specular, cool bounce from below-right, dark occluded rim.
 */
export function clayMatcap(base = '#a9663f', deep = '#5c3020', sheen = 0.85) {
  const size = 256;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;

  // Base shading sphere: lit up-left, falling to the deep tone
  let g = ctx.createRadialGradient(c * 0.72, c * 0.66, c * 0.1, c, c, c);
  g.addColorStop(0, base);
  g.addColorStop(0.75, deep);
  g.addColorStop(1, '#241008');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Broad diffuse key
  g = ctx.createRadialGradient(c * 0.62, c * 0.55, 0, c * 0.62, c * 0.55, c * 0.9);
  g.addColorStop(0, 'rgba(255,231,200,0.5)');
  g.addColorStop(1, 'rgba(255,231,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Tight wet specular — this is what makes it read as slip-covered clay
  g = ctx.createRadialGradient(c * 0.58, c * 0.48, 0, c * 0.58, c * 0.48, c * 0.22);
  g.addColorStop(0, `rgba(255,248,238,${sheen})`);
  g.addColorStop(0.4, `rgba(255,244,226,${sheen * 0.35})`);
  g.addColorStop(1, 'rgba(255,244,226,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Cool bounce light low-right, so the shadow side is not dead
  g = ctx.createRadialGradient(c * 1.42, c * 1.5, 0, c * 1.42, c * 1.5, c * 0.75);
  g.addColorStop(0, 'rgba(120,140,190,0.22)');
  g.addColorStop(1, 'rgba(120,140,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* --------------------------------------------------------------- textures */

/** Terracotta tile floor with grout lines and per-tile tone variation. */
export function tileTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(41);
  const tiles = 6;
  const t = size / tiles;
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) {
      const v = 0.85 + rand() * 0.3;
      ctx.fillStyle = `rgb(${Math.round(158 * v)},${Math.round(96 * v)},${Math.round(64 * v)})`;
      ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
      // A little worn shading inside each tile
      const g = ctx.createRadialGradient(
        x * t + t * (0.3 + rand() * 0.4), y * t + t * (0.3 + rand() * 0.4), 4,
        x * t + t / 2, y * t + t / 2, t * 0.8
      );
      g.addColorStop(0, 'rgba(255,220,180,0.12)');
      g.addColorStop(1, 'rgba(60,30,16,0.18)');
      ctx.fillStyle = g;
      ctx.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.anisotropy = 8;
  return tex;
}

/** Evening light through an arched window: painted straight into a canvas. */
export function windowTexture() {
  const w = 256;
  const h = 384;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  // Sky gradient outside
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#ffe9c2');
  sky.addColorStop(0.55, '#ffc276');
  sky.addColorStop(1, '#e88b4e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Barcelona rooftops silhouette
  ctx.fillStyle = 'rgba(122,66,44,0.85)';
  let x = 0;
  const rand = mulberry(9);
  while (x < w) {
    const bw = 24 + rand() * 40;
    const bh = 30 + rand() * 70;
    ctx.fillRect(x, h - bh, bw, bh);
    if (rand() < 0.4) ctx.fillRect(x + bw * 0.3, h - bh - 14, bw * 0.2, 14);
    x += bw + 4;
  }
  // Sagrada-ish spires
  [0.24, 0.34, 0.44].forEach((fx, i) => {
    const bx = w * fx;
    const bh = 150 - i * 18;
    ctx.beginPath();
    ctx.moveTo(bx - 10, h - 40);
    ctx.lineTo(bx, h - 40 - bh);
    ctx.lineTo(bx + 10, h - 40);
    ctx.fill();
  });

  // The low sun
  const sun = ctx.createRadialGradient(w * 0.68, h * 0.42, 4, w * 0.68, h * 0.42, 70);
  sun.addColorStop(0, 'rgba(255,252,240,1)');
  sun.addColorStop(0.25, 'rgba(255,240,205,0.9)');
  sun.addColorStop(1, 'rgba(255,240,205,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);

  // Window muntins
  ctx.strokeStyle = '#3a2417';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.moveTo(0, h * 0.42);
  ctx.lineTo(w, h * 0.42);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ pots */

/** One lathe profile for a shelf pot, in unit height. */
function potProfile(rand) {
  const belly = 0.28 + rand() * 0.3;
  const neck = 0.1 + rand() * 0.16;
  const lip = neck + 0.05 + rand() * 0.14;
  const bellyAt = 0.3 + rand() * 0.25;
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const u = i / 10;
    let r;
    if (u < bellyAt) r = 0.12 + (belly - 0.12) * Math.sin((u / bellyAt) * Math.PI * 0.5);
    else if (u < 0.82) {
      const k = (u - bellyAt) / (0.82 - bellyAt);
      r = belly + (neck - belly) * k * k * (3 - 2 * k);
    } else {
      const k = (u - 0.82) / 0.18;
      r = neck + (lip - neck) * k;
    }
    pts.push(new THREE.Vector2(Math.max(0.06, r), u));
  }
  return pts;
}

const GLAZES = [0x3f6f8e, 0x8e5a3f, 0x6f8e58, 0xc9a227, 0x8a4a5c, 0xd8cfc0, 0x4a5c8a];

/** All pots for one shelf, merged with baked vertex-colour glazes. */
export function buildShelfPots(seed, count, spanX, shelfYs) {
  const rand = mulberry(seed);
  const geos = [];
  for (let i = 0; i < count; i++) {
    const h = 0.34 + rand() * 0.3;
    const lathe = new THREE.LatheGeometry(potProfile(rand), 14);
    lathe.scale(h, h, h);
    const y = shelfYs[i % shelfYs.length];
    lathe.translate(-spanX / 2 + (i / (count - 1)) * spanX + (rand() - 0.5) * 0.1, y, 0);
    const g = lathe.toNonIndexed();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(GLAZES[Math.floor(rand() * GLAZES.length)]);
    c.offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    for (let v = 0; v < n; v++) {
      col[v * 3] = c.r;
      col[v * 3 + 1] = c.g;
      col[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geos.push(g);
  }
  let total = 0;
  geos.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  geos.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

/* ------------------------------------------------------------- the studio */

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

export function buildStudio(potMatcap) {
  const g = new THREE.Group();

  /* Floor */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 15),
    new THREE.MeshLambertMaterial({ map: tileTexture() })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  // Clay splatter around the wheel — nobody throws pots on a clean floor
  const splatMat = new THREE.MeshLambertMaterial({
    color: 0x9c6c4a, transparent: true, opacity: 0.45, depthWrite: false
  });
  const srand = mulberry(71);
  for (let i = 0; i < 26; i++) {
    const a = srand() * Math.PI * 2;
    const r = 1.0 + srand() * 2.6;
    const blob = new THREE.Mesh(new THREE.CircleGeometry(0.06 + srand() * 0.16, 7), splatMat);
    blob.rotation.x = -Math.PI / 2;
    blob.rotation.z = srand() * 3;
    blob.position.set(Math.cos(a) * r, 0.006, Math.sin(a) * r);
    blob.renderOrder = 2;
    g.add(blob);
  }

  /* Walls: plaster, warm */
  const wallMat = lambert(0xd9b98f);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(22, 8), wallMat);
  back.position.set(0, 4, -5.5);
  back.receiveShadow = true;
  g.add(back);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(15, 8), wallMat);
    side.position.set(s * 8.5, 4, 0);
    side.rotation.y = -s * Math.PI / 2;
    g.add(side);
  });

  /* Arched window in the back wall */
  const win = new THREE.Group();
  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.6),
    new THREE.MeshBasicMaterial({ map: windowTexture(), fog: false })
  );
  pane.position.y = -0.3;
  win.add(pane);
  const arch = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 24, 0, Math.PI),
    new THREE.MeshBasicMaterial({ map: windowTexture(), fog: false })
  );
  arch.position.y = 1.0;
  win.add(arch);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.16, 0.07, 6, 20, Math.PI), lambert(0x4a2e1c));
  frame.position.y = 1.0;
  win.add(frame);
  [-1.16, 1.16].forEach((x) => {
    const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.7, 0.12), lambert(0x4a2e1c));
    jamb.position.set(x, -0.35, 0);
    win.add(jamb);
  });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.3), lambert(0x4a2e1c));
  sill.position.y = -1.68;
  win.add(sill);
  win.position.set(-2.1, 3.4, -5.45);
  g.add(win);

  /* Light shaft from the window toward the wheel, vertex-colour faded */
  const shaftGeo = new THREE.BufferGeometry();
  const sv = [];
  const sc = [];
  const quads = [
    [[-3.4, 4.8, -5.4], [-0.8, 4.8, -5.4], [2.0, 0.05, 2.2], [-3.0, 0.05, 2.2]],
    [[-3.1, 4.8, -5.2], [-1.1, 4.8, -5.2], [1.2, 0.05, 1.4], [-2.2, 0.05, 1.4]]
  ];
  quads.forEach((q) => {
    [[0, 1, 2], [0, 2, 3]].forEach((tri) => {
      tri.forEach((idx) => {
        sv.push(q[idx][0], q[idx][1], q[idx][2]);
        const bright = idx <= 1 ? 0.5 : 0.06;
        sc.push(1.0 * bright, 0.82 * bright, 0.6 * bright);
      });
    });
  });
  shaftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sv), 3));
  shaftGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(sc), 3));
  const shaft = new THREE.Mesh(shaftGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide
  }));
  shaft.renderOrder = 5;
  g.add(shaft);

  /* Shelves with fired pots */
  const potMat = new THREE.MeshMatcapMaterial({ matcap: potMatcap, vertexColors: true });
  [-1, 1].forEach((s, si) => {
    const unit = new THREE.Group();
    const frameMat = lambert(0x6b4526);
    [0.9, 1.75, 2.6].forEach((y) => {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.09, 0.75), frameMat);
      plank.position.y = y;
      plank.castShadow = true;
      plank.receiveShadow = true;
      unit.add(plank);
    });
    [-1.6, 1.6].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.75, 0.7), frameMat);
      leg.position.set(x, 1.42, 0);
      unit.add(leg);
    });
    const pots = new THREE.Mesh(buildShelfPots(7 + si * 13, 9, 3.0, [0.95, 1.8, 2.65]), potMat);
    pots.castShadow = true;
    unit.add(pots);
    unit.position.set(s * 5.6, 0, -3.6);
    unit.rotation.y = -s * 0.35;
    g.add(unit);
  });

  /* The kiln, stage right — glows during firing */
  const kiln = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 1.5), lambert(0x8a5f4a));
  body.position.y = 1.0;
  body.castShadow = true;
  body.receiveShadow = true;
  kiln.add(body);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.8, 7), lambert(0x5c3d2c));
  top.position.y = 2.35;
  kiln.add(top);
  const doorMat = new THREE.MeshBasicMaterial({ color: 0x2a1408 });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.0), doorMat);
  door.position.set(0, 0.95, 0.76);
  kiln.add(door);
  kiln.position.set(3.6, 0, -3.0);
  kiln.rotation.y = -0.5;
  g.add(kiln);

  /* Keramikern — apron, beret, judging posture */
  const guy = new THREE.Group();
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.36, 0.95, 7), lambert(0x39506b));
  apron.position.y = 1.22;
  guy.add(apron);
  const shirt = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.3, 7), lambert(0xd8cfc0));
  shirt.position.y = 1.78;
  guy.add(shirt);
  [-0.2, 0.2].forEach((z) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.75, 6), lambert(0x3a3f4a));
    leg.position.set(0, 0.4, z);
    guy.add(leg);
  });
  const headG = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 8, 6), lambert(0xdba97f));
  headG.add(head);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.16, 7, 5), lambert(0x777d88));
  beard.position.set(0.1, -0.1, 0);
  beard.scale.set(0.9, 0.8, 0.85);
  headG.add(beard);
  const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.2, 0.11, 8), lambert(0x2c2c34));
  beret.position.set(-0.03, 0.18, 0);
  beret.rotation.z = 0.16;
  headG.add(beret);
  headG.position.y = 2.12;
  guy.add(headG);
  [-1, 1].forEach((s) => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.62, 6), lambert(0xd8cfc0));
    arm.position.set(0.05, 1.5, s * 0.3);
    arm.rotation.x = s * 0.5;
    arm.rotation.z = -0.5;
    guy.add(arm);
  });
  guy.position.set(2.6, 0, -1.6);
  guy.rotation.y = -0.7;
  guy.userData.head = headG;
  g.add(guy);

  /* Tool rack on the back wall: ribs, wires and a sponge on pegs */
  const rack = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.08), lambert(0x6b4526));
  rack.add(board);
  const TOOLS = [0xd8cfc0, 0x8a6a52, 0x4a5c6e, 0xc9a227, 0x7a4a3c];
  for (let i = 0; i < 5; i++) {
    const tx = -0.85 + i * 0.42;
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 5), lambert(0x4a3320));
    peg.rotation.x = Math.PI / 2;
    peg.position.set(tx, 0.1, 0.08);
    rack.add(peg);
    const tool = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.3 + (i % 3) * 0.08, 0.03),
      lambert(TOOLS[i])
    );
    tool.position.set(tx, -0.08 - (i % 3) * 0.04, 0.1);
    tool.castShadow = true;
    rack.add(tool);
  }
  rack.position.set(2.2, 2.5, -5.42);
  g.add(rack);

  /* Water bucket with a slick of slip in it */
  const bucket = new THREE.Group();
  const pail = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.19, 0.36, 12, 1, true), lambert(0x5c6670));
  pail.position.y = 0.18;
  pail.castShadow = true;
  bucket.add(pail);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12),
    new THREE.MeshPhongMaterial({ color: 0x8a7a5c, shininess: 80, specular: 0xffffff }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  bucket.add(water);
  bucket.position.set(1.5, 0, 0.7);
  g.add(bucket);

  /* Bagged clay stacked against the wall */
  const bagMat = lambert(0x6f6a5e);
  [[-3.4, 0.18, -4.4, 0.1], [-3.4, 0.52, -4.35, -0.2], [-2.9, 0.18, -4.5, 0.5]].forEach(([bx, by, bz, ry]) => {
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.32, 0.42), bagMat);
    bag.position.set(bx, by, bz);
    bag.rotation.y = ry;
    bag.castShadow = true;
    bag.receiveShadow = true;
    g.add(bag);
  });

  /* Dust motes in the light shaft */
  const moteCount = 160;
  const motePos = new Float32Array(moteCount * 3);
  const rand = mulberry(23);
  for (let i = 0; i < moteCount; i++) {
    motePos[i * 3] = -2.6 + rand() * 3.4;
    motePos[i * 3 + 1] = 0.3 + rand() * 3.8;
    motePos[i * 3 + 2] = -4 + rand() * 5;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    color: 0xffe8c8,
    size: 0.028,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  g.add(motes);

  return { group: g, kilnDoor: doorMat, guy, motes, shaft };
}

/* ------------------------------------------------------------- the wheel */

export function buildWheel() {
  const g = new THREE.Group();

  // Pedestal
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.05, 0.35, 18), lambert(0x4a3a30));
  base.position.y = 0.18;
  g.add(base);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.35, 10), lambert(0x37343a));
  column.position.y = 0.5;
  g.add(column);

  // Splash pan with a hint of slip water
  const pan = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.0, 0.16, 22, 1, true), lambert(0x8a6a52));
  pan.position.y = 0.62;
  g.add(pan);
  const slip = new THREE.Mesh(
    new THREE.CircleGeometry(1.1, 22),
    new THREE.MeshLambertMaterial({ color: 0x9c6c4a, transparent: true, opacity: 0.85 })
  );
  slip.rotation.x = -Math.PI / 2;
  slip.position.y = 0.57;
  g.add(slip);

  // The wheel head — this is the part that visibly spins
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.96, 0.1, 26), lambert(0x2e2b31));
  head.position.y = 0.68;
  // Spokes painted on top so the spin reads even before there is clay
  const spokeMat = lambert(0x413d45);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 0.07), spokeMat);
    spoke.position.y = 0.055;
    spoke.rotation.y = (i / 3) * Math.PI;
    head.add(spoke);
  }
  g.add(head);

  return { group: g, head, headY: 0.735 };
}
