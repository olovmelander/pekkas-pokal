/**
 * Pekkas Pingis — the Bredbyn bygdegård.
 *
 * A Norrland community hall on a late-August evening: worn plank floor,
 * wainscoted walls, pendant lamps over the table and blue dusk in the
 * windows. Interiors live or die on lighting HIERARCHY — one dominant
 * source, a fill, a few accents — so the room is built around the three
 * pendants over the table: they are the reason the table glows and the
 * corners fall away into warm darkness.
 *
 * Everything is procedural: plank and table textures are painted to
 * canvas, the lamps get fake volumetric cones (semi-transparent geometry,
 * the cheap trick that runs anywhere) and painted light pools beneath.
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

/** Worn pine planks, laid along z, with gaps and per-plank tone. */
export function plankTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(41);
  ctx.fillStyle = '#8a6a42';
  ctx.fillRect(0, 0, size, size);
  const pw = size / 8;
  for (let p = 0; p < 8; p++) {
    const v = 0.78 + rand() * 0.4;
    ctx.fillStyle = `rgb(${Math.round(148 * v)},${Math.round(112 * v)},${Math.round(70 * v)})`;
    ctx.fillRect(p * pw + 1, 0, pw - 2, size);
    // Grain lines running the length of the plank
    ctx.strokeStyle = `rgba(${Math.round(92 * v)},${Math.round(66 * v)},${Math.round(38 * v)},0.55)`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const x = p * pw + 3 + rand() * (pw - 6);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      for (let y = 0; y <= size; y += 32) {
        ctx.lineTo(x + (rand() - 0.5) * 3, y);
      }
      ctx.stroke();
    }
    // Board joints
    let y = rand() * 180;
    while (y < size) {
      ctx.fillStyle = 'rgba(40,26,12,0.5)';
      ctx.fillRect(p * pw + 1, y, pw - 2, 2);
      y += 150 + rand() * 200;
    }
    // The odd knot
    if (rand() < 0.7) {
      const kx = p * pw + pw * (0.3 + rand() * 0.4);
      const ky = rand() * size;
      const kr = 3 + rand() * 4;
      const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      g.addColorStop(0, 'rgba(52,34,16,0.9)');
      g.addColorStop(1, 'rgba(52,34,16,0)');
      ctx.fillStyle = g;
      ctx.fillRect(kx - kr, ky - kr, kr * 2, kr * 2);
    }
  }
  // Decades of dance nights: a soft sheen worn down the middle
  const sheen = ctx.createLinearGradient(0, 0, size, 0);
  sheen.addColorStop(0, 'rgba(255,226,180,0)');
  sheen.addColorStop(0.5, 'rgba(255,226,180,0.09)');
  sheen.addColorStop(1, 'rgba(255,226,180,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 7);
  // A floor is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
  return tex;
}

/** The table top from above: competition blue, white lines, wear. */
export function tableTexture() {
  const w = 512;
  const h = 1024;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(19);
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#1d5f9e');
  base.addColorStop(0.5, '#175288');
  base.addColorStop(1, '#1d5f9e');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Sheet joins and subtle cloudiness in the paint
  for (let i = 0; i < 260; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = 14 + rand() * 46;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.028 + rand() * 0.05;
    g.addColorStop(0, rand() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(6,24,44,${a})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Lines: border, centre line for doubles
  ctx.strokeStyle = '#f3f6fb';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w / 2, 8);
  ctx.lineTo(w / 2, h - 8);
  ctx.stroke();
  // Ball scuffs near the ends
  ctx.fillStyle = 'rgba(235,240,250,0.05)';
  for (let i = 0; i < 90; i++) {
    const y = rand() < 0.5 ? h * (0.08 + rand() * 0.3) : h * (0.62 + rand() * 0.3);
    ctx.beginPath();
    ctx.ellipse(rand() * w, y, 3 + rand() * 5, 2 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Blue dusk with a moon and spruce silhouettes for the windows. */
export function duskTexture() {
  const w = 256;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(23);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#0d1a3a');
  sky.addColorStop(0.55, '#1b3260');
  sky.addColorStop(0.8, '#3a5480');
  sky.addColorStop(1, '#141f36');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Moon with halo
  const mg = ctx.createRadialGradient(w * 0.68, h * 0.24, 2, w * 0.68, h * 0.24, 34);
  mg.addColorStop(0, 'rgba(255,248,225,1)');
  mg.addColorStop(0.18, 'rgba(255,248,225,0.9)');
  mg.addColorStop(0.3, 'rgba(230,236,255,0.22)');
  mg.addColorStop(1, 'rgba(230,236,255,0)');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, w, h);
  // Stars
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.2 + rand() * 0.6;
    ctx.fillRect(rand() * w, rand() * h * 0.6, 1.2, 1.2);
  }
  ctx.globalAlpha = 1;
  // Spruce silhouettes along the bottom
  ctx.fillStyle = '#0a1220';
  for (let x = -6; x < w + 6; x += 10) {
    const th = 26 + rand() * 26;
    ctx.beginPath();
    ctx.moveTo(x, h);
    ctx.lineTo(x + 5, h - th);
    ctx.lineTo(x + 10, h);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round falloff, reused for glows, pools and the contact shadow. */
export function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* -------------------------------------------------------------- the hall */

export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  netH: 0.1525
};

export function buildHall(glow) {
  const group = new THREE.Group();
  const rand = mulberry(7);
  const refs = {};

  const HALL_W = 9;
  const HALL_D = 14;
  const HALL_H = 4.2;

  /* Floor */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(HALL_W, HALL_D, 24, 24),
    new THREE.MeshPhongMaterial({ map: plankTexture(), shininess: 26, specular: 0x3a3226 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  /* Walls: wainscot below, warm painted board above */
  const wallMat = lambert(0x8a7d63);
  const wainMat = lambert(0x5f4a30);
  const wallGeo = [
    { w: HALL_W, x: 0, z: -HALL_D / 2, ry: 0 },
    { w: HALL_W, x: 0, z: HALL_D / 2, ry: Math.PI },
    { w: HALL_D, x: -HALL_W / 2, z: 0, ry: Math.PI / 2 },
    { w: HALL_D, x: HALL_W / 2, z: 0, ry: -Math.PI / 2 }
  ];
  wallGeo.forEach((def) => {
    const upper = new THREE.Mesh(new THREE.PlaneGeometry(def.w, HALL_H - 1.1), wallMat);
    upper.position.set(def.x, 1.1 + (HALL_H - 1.1) / 2, def.z);
    upper.rotation.y = def.ry;
    group.add(upper);
    const wain = new THREE.Mesh(new THREE.PlaneGeometry(def.w, 1.1), wainMat);
    wain.position.set(def.x, 0.55, def.z);
    wain.rotation.y = def.ry;
    group.add(wain);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(def.w, 0.06, 0.05), lambert(0x4a3820));
    rail.position.set(def.x, 1.12, def.z);
    rail.rotation.y = def.ry;
    // Nudge the rail into the room so it does not z-fight the wall
    rail.translateZ(0.03);
    group.add(rail);
  });

  /* Ceiling with exposed beams */
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, HALL_D), lambert(0x6b5c44));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = HALL_H;
  group.add(ceil);
  for (let z = -HALL_D / 2 + 1.6; z < HALL_D / 2; z += 2.4) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.22, 0.16), lambert(0x4a3820));
    beam.position.set(0, HALL_H - 0.11, z);
    group.add(beam);
  }

  /* Windows on the back wall and one side: blue dusk outside */
  const dusk = duskTexture();
  const frameMat = lambert(0xe8e2d4);
  const addWindow = (x, z, ry) => {
    const g = new THREE.Group();
    g.position.set(x, 2.1, z);
    g.rotation.y = ry;
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 1.5),
      new THREE.MeshBasicMaterial({ map: dusk })
    );
    g.add(pane);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.64, 0.07), frameMat);
    frame.position.z = -0.012;
    g.add(frame);
    // Frame is a box BEHIND the pane; mullions sit in front
    [[0, 0.04, 1.24], [0.04, 1.64, 0]].forEach(([mw, mh]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(mw || 1.24, mh || 0.04, 0.03), frameMat);
      m.position.z = 0.02;
      g.add(m);
    });
    group.add(g);
    return pane;
  };
  addWindow(-2.6, -HALL_D / 2 + 0.02, 0);
  addWindow(2.6, -HALL_D / 2 + 0.02, 0);
  addWindow(-HALL_W / 2 + 0.02, -2.2, Math.PI / 2);
  addWindow(-HALL_W / 2 + 0.02, 2.2, Math.PI / 2);
  addWindow(HALL_W / 2 - 0.02, -2.2, -Math.PI / 2);

  /* Pendant lamps over the table — the hall's dominant light, drawn */
  refs.lamps = [];
  [-1.05, 0, 1.05].forEach((z, li) => {
    const g = new THREE.Group();
    g.position.set(0, 0, z);
    // The nearest pendant hangs over the player's head, out of frame: its
    // fixture would float as a pale ellipse over the HUD, so it keeps only
    // its pool of light. High cords on the rest keep the shades clear of
    // the portrait frame's centre.
    const showFixture = li < 2;
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, HALL_H - 3.1, 5),
      lambert(0x1a1611)
    );
    cord.position.y = HALL_H - (HALL_H - 3.1) / 2;
    if (showFixture) g.add(cord);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 0.24, 20, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x1f6a4e, side: THREE.DoubleSide })
    );
    shade.position.y = 3.08;
    if (showFixture) g.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0 })
    );
    bulb.position.y = 2.98;
    if (showFixture) g.add(bulb);
    // Fake volumetric cone: vertex-alpha fade, no depth write
    const coneGeo = new THREE.CylinderGeometry(0.09, 0.85, 2.1, 20, 1, true);
    const colors = [];
    const pos = coneGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) + 1.05) / 2.1; // 1 at top, 0 at bottom
      colors.push(1, 0.92, 0.7, k * 0.16 + 0.008);
    }
    coneGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
    // The nearest pendant hangs just over the camera — its cone would wash
    // the whole frame, so only the two far lamps get volumetrics.
    if (showFixture) {
      const cone = new THREE.Mesh(
        coneGeo,
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending
        })
      );
      cone.position.y = 1.92;
      cone.renderOrder = 4;
      g.add(cone);
    }
    // Painted pool of lamplight on the floor below
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 2.6),
      new THREE.MeshBasicMaterial({
        map: glow,
        color: 0xffdf9e,
        transparent: true,
        opacity: 0.1,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.012;
    pool.renderOrder = 1;
    g.add(pool);
    group.add(g);
    refs.lamps.push(g);
  });

  /* ---- The table ------------------------------------------------------- */
  const T = TABLE;
  const table = new THREE.Group();

  const top = new THREE.Mesh(
    new THREE.BoxGeometry(T.width, 0.045, T.length),
    [
      lambert(0x123c66), lambert(0x123c66),
      new THREE.MeshPhongMaterial({ map: tableTexture(), shininess: 42, specular: 0x556677 }),
      lambert(0x123c66), lambert(0x123c66), lambert(0x123c66)
    ]
  );
  top.position.y = T.height - 0.0225;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  // Frame and legs
  const legMat = lambert(0x21262e);
  [-1, 1].forEach((sx) => {
    [-1, 1].forEach((sz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, T.height - 0.05, 0.06), legMat);
      leg.position.set(sx * (T.width / 2 - 0.18), (T.height - 0.05) / 2, sz * (T.length / 2 - 0.3));
      leg.castShadow = true;
      table.add(leg);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), lambert(0x111318));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (T.width / 2 - 0.18), 0.045, sz * (T.length / 2 - 0.3));
      table.add(wheel);
    });
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, T.length - 0.7), legMat);
    brace.position.set(sx * (T.width / 2 - 0.18), 0.32, 0);
    table.add(brace);
  });

  /* Net: posts, tape and a real mesh drawn to canvas */
  const netCv = document.createElement('canvas');
  netCv.width = 256;
  netCv.height = 32;
  const nctx = netCv.getContext('2d');
  nctx.fillStyle = 'rgba(20,26,36,0.55)';
  nctx.fillRect(0, 0, 256, 32);
  nctx.strokeStyle = 'rgba(225,232,245,0.5)';
  nctx.lineWidth = 1;
  for (let x = 0; x <= 256; x += 6) {
    nctx.beginPath(); nctx.moveTo(x, 0); nctx.lineTo(x, 32); nctx.stroke();
  }
  for (let y = 0; y <= 32; y += 6) {
    nctx.beginPath(); nctx.moveTo(0, y); nctx.lineTo(256, y); nctx.stroke();
  }
  nctx.fillStyle = '#f3f6fb';
  nctx.fillRect(0, 0, 256, 5);
  const netTex = new THREE.CanvasTexture(netCv);
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(T.width + 0.3, T.netH),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide })
  );
  net.position.y = T.height + T.netH / 2;
  table.add(net);
  refs.net = net;
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, T.netH + 0.05, 8), legMat);
    post.position.set(s * (T.width / 2 + 0.15), T.height + (T.netH + 0.05) / 2 - 0.02, 0);
    table.add(post);
  });

  group.add(table);
  refs.table = table;

  /* ---- Set dressing ---------------------------------------------------- */

  // Stage at the far end, as every bygdegård has
  const stage = new THREE.Mesh(new THREE.BoxGeometry(HALL_W, 0.5, 2.2), lambert(0x4a3820));
  stage.position.set(0, 0.25, -HALL_D / 2 + 1.1);
  stage.receiveShadow = true;
  group.add(stage);
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W - 1.2, 2.4, 24, 1), lambert(0x6e2430));
  const cpos = curtain.geometry.attributes.position;
  for (let i = 0; i < cpos.count; i++) {
    cpos.setZ(i, Math.sin(cpos.getX(i) * 4.2) * 0.07);
  }
  curtain.geometry.computeVertexNormals();
  curtain.position.set(0, 2.2, -HALL_D / 2 + 0.25);
  group.add(curtain);

  // Pekkas bunting strung across the room
  const flagMat = [lambert(0xf2c14e), lambert(0x2e5f9e), lambert(0xd8394d)];
  [[-2.8, 3.3, -4.4, 2.8], [2.8, 3.3, 4.4, 2.8]].forEach(([x0, y0, x1, y1]) => {
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const x = x0 + (x1 - x0) * k;
      const y = y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 0.34;
      const flag = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 3), flagMat[i % 3]);
      flag.rotation.x = Math.PI;
      flag.rotation.y = rand() * Math.PI;
      flag.position.set(x, y - 0.12, -3.4);
      group.add(flag);
    }
  });

  // Fika table with coffee thermos by the wall
  const fika = new THREE.Group();
  fika.position.set(-3.3, 0, 2.8);
  const ftop = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.7), lambert(0xd9d2c4));
  ftop.position.y = 0.72;
  ftop.castShadow = true;
  fika.add(ftop);
  [[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.02, 0.7, 6), lambert(0x8a8478));
    leg.position.set(x, 0.35, z);
    fika.add(leg);
  });
  const thermos = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 10), lambert(0xb8422e));
  thermos.position.set(-0.3, 0.87, 0);
  thermos.castShadow = true;
  fika.add(thermos);
  const kanelbulle = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.05, 12), lambert(0xc9a25e));
  kanelbulle.position.set(0.25, 0.77, 0.05);
  fika.add(kanelbulle);
  group.add(fika);

  // Stacked chairs along the right wall
  for (let i = 0; i < 3; i++) {
    const stack = new THREE.Group();
    stack.position.set(3.6, 0, 1.2 + i * 1.1);
    for (let c = 0; c < 4; c++) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.44), lambert(0x7a4a26));
      seat.position.y = 0.42 + c * 0.12;
      stack.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.4, 0.04), lambert(0x7a4a26));
      back.position.set(0, 0.62 + c * 0.12, -0.2);
      stack.add(back);
    }
    stack.rotation.y = rand() * 0.3 - 0.15;
    group.add(stack);
  }

  /* Scoreboard on the back wall — index.js repaints it per point */
  const sbCv = document.createElement('canvas');
  sbCv.width = 256;
  sbCv.height = 128;
  const sbTex = new THREE.CanvasTexture(sbCv);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(2.3, 1.15),
    new THREE.MeshBasicMaterial({ map: sbTex })
  );
  board.position.set(-2.5, 3.05, -HALL_D / 2 + 0.28);
  board.rotation.x = 0.14; // tilted toward the players, like a real board
  group.add(board);
  refs.scoreboard = { canvas: sbCv, ctx: sbCv.getContext('2d'), tex: sbTex };

  return { group, refs };
}

/* --------------------------------------------------------------- figures */

/**
 * A low-poly Pekkas player: the boxy build the fisherman and fencers
 * share, with a paddle in the right hand. Group origin at the feet.
 */
export function buildPlayer(shirt, skin = 0xd9a678) {
  const g = new THREE.Group();
  const refs = {};

  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.5, 0.2), lambert(0x2b3140));
  legs.position.y = 0.25;
  g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.52, 0.26), lambert(shirt));
  torso.position.y = 0.76;
  torso.castShadow = true;
  g.add(torso);
  refs.torso = torso;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), lambert(skin));
  head.position.y = 1.19;
  head.castShadow = true;
  g.add(head);
  refs.head = head;
  const hairMat = lambert(0x4a3520);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.26), hairMat);
  hair.position.y = 1.34;
  g.add(hair);

  // Off arm
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), lambert(shirt));
  armL.geometry.translate(0, -0.16, 0);
  armL.position.set(-0.28, 0.98, 0);
  armL.rotation.z = 0.3;
  g.add(armL);
  refs.armL = armL;

  // Paddle arm: pivot at the shoulder so index.js can swing it
  const armR = new THREE.Group();
  armR.position.set(0.28, 0.98, 0);
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.42, 0.1), lambert(shirt));
  upper.geometry.translate(0, -0.16, 0);
  armR.add(upper);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), lambert(skin));
  hand.position.y = -0.38;
  armR.add(hand);
  const paddle = buildPaddle();
  paddle.position.set(0, -0.48, 0.05);
  paddle.rotation.x = 0.5;
  armR.add(paddle);
  refs.paddle = paddle;
  g.add(armR);
  refs.armR = armR;

  return { group: g, refs };
}

/** A paddle: red rubber one side, black the other, pale blade edge, handle. */
export function buildPaddle() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.085, 0.085, 0.012, 22),
    [
      lambert(0xe8dcc8),
      new THREE.MeshLambertMaterial({ color: 0xc22b35 }),
      new THREE.MeshLambertMaterial({ color: 0x1d2026 })
    ]
  );
  blade.rotation.x = Math.PI / 2;
  blade.castShadow = true;
  g.add(blade);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.02), lambert(0xb08a54));
  handle.position.y = -0.12;
  g.add(handle);
  return g;
}
