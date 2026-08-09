/**
 * Pekkas Pingis — OLYMPIA in Bredbyn, where the 2019 competition was held.
 *
 * The real Olympia is Anundsjö IF's hall: raised in 1938, about a thousand
 * square metres, and the place the village has danced, played football and
 * skied out of ever since. Its dance floor was replaced in the six-million
 * renovation, so the boards here are laid new and lacquered over a room
 * that is anything but. Anundsjö IF play in red, which is why the curtain,
 * the house sign and the pennants are all the same red.
 *
 * Interiors live or die on lighting HIERARCHY — one dominant source, a
 * fill, a few accents — so the room is built around the pendants over the
 * table: they are why the table glows and the corners fall away into warm
 * darkness. Everything is procedural: every texture is painted to canvas,
 * the lamps get fake volumetric cones (semi-transparent geometry, the
 * cheap trick that runs anywhere) and painted light pools beneath.
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


/**
 * The house sign over the stage.
 *
 * Olympia has been the name over that door since 1938, so the sign is set
 * the way a hall sign of that vintage is: one word, wide-tracked, in the
 * club's red, on a board with a gold rule. Everything on it is true of the
 * real place — the name, the village, the parish, the year.
 */
export function olympiaSignTexture() {
  const w = 1024;
  const h = 320;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');

  const board = ctx.createLinearGradient(0, 0, 0, h);
  board.addColorStop(0, '#2a1418');
  board.addColorStop(0.5, '#3d1a20');
  board.addColorStop(1, '#261216');
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, w, h);

  // Backlight behind the lettering, as a lit sign has
  const back = ctx.createRadialGradient(w / 2, h * 0.46, 20, w / 2, h * 0.46, w * 0.5);
  back.addColorStop(0, 'rgba(255,196,120,0.34)');
  back.addColorStop(1, 'rgba(255,196,120,0)');
  ctx.fillStyle = back;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(226,178,86,0.85)';
  ctx.lineWidth = 5;
  ctx.strokeRect(14, 14, w - 28, h - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(28, 28, w - 56, h - 56);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '26px';
  ctx.font = '700 132px "Space Grotesk", Inter, sans-serif';
  ctx.shadowColor = 'rgba(255,120,110,0.75)';
  ctx.shadowBlur = 44;
  ctx.fillStyle = '#f5e9d8';
  ctx.fillText('OLYMPIA', w / 2 + 13, h * 0.44);
  ctx.shadowBlur = 0;

  ctx.letterSpacing = '11px';
  ctx.font = '700 34px Inter, sans-serif';
  ctx.fillStyle = 'rgba(232,186,110,0.92)';
  ctx.fillText('BREDBYN · ANUNDSJÖ', w / 2 + 6, h * 0.73);
  ctx.letterSpacing = '7px';
  ctx.font = '700 22px Inter, sans-serif';
  ctx.fillStyle = 'rgba(226,200,170,0.6)';
  ctx.fillText('SEDAN 1938', w / 2 + 4, h * 0.88);
  ctx.letterSpacing = '0px';

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Anundsjö-red pennant cloth for the bunting and the wall banner. */
export function pennantTexture(label) {
  const w = 256;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#a8202c');
  g.addColorStop(1, '#79161f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(240,208,140,0.8)';
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f6ead6';
  ctx.font = '700 40px "Space Grotesk", Inter, sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText(label, w / 2 + 3, h / 2);
  ctx.letterSpacing = '0px';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
      new THREE.CylinderGeometry(0.012, 0.012, HALL_H - 3.4, 5),
      lambert(0x1a1611)
    );
    cord.position.y = HALL_H - (HALL_H - 3.4) / 2;
    if (showFixture) g.add(cord);
    const shade = new THREE.Mesh(
      new THREE.ConeGeometry(0.2, 0.17, 18, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x1a4a38, side: THREE.DoubleSide })
    );
    shade.position.y = 3.32;
    if (showFixture) g.add(shade);
    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0 })
    );
    bulb.position.y = 3.24;
    if (showFixture) g.add(bulb);
    // Fake volumetric cone: vertex-alpha fade, no depth write
    const coneGeo = new THREE.CylinderGeometry(0.07, 0.62, 2.1, 20, 1, true);
    const colors = [];
    const pos = coneGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = (pos.getY(i) + 1.05) / 2.1; // 1 at top, 0 at bottom
      colors.push(1, 0.92, 0.7, k * 0.045 + 0.003);
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
      cone.position.y = 2.15;
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
        opacity: 0.05,
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
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W - 1.2, 1.6, 24, 1), lambert(0x7a2028));
  const cpos = curtain.geometry.attributes.position;
  for (let i = 0; i < cpos.count; i++) {
    cpos.setZ(i, Math.sin(cpos.getX(i) * 4.2) * 0.07);
  }
  curtain.geometry.computeVertexNormals();
  curtain.position.set(0, 1.55, -HALL_D / 2 + 0.25);
  group.add(curtain);

  /* The house sign over the stage — Olympia has carried that name since
     1938, and the gable above the stage is where a hall puts it. */
  {
    const signTex = olympiaSignTexture();
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(3.6, 1.13),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    sign.position.set(0, 2.34, -HALL_D / 2 + 0.2);
    group.add(sign);
    // Frame and a warm wash so it reads as a lit sign, not a poster
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.88, 1.4, 0.1), lambert(0x2a1f14));
    frame.position.set(0, 2.34, -HALL_D / 2 + 0.13);
    group.add(frame);
    const wash = new THREE.Mesh(
      new THREE.PlaneGeometry(5.2, 2.4),
      new THREE.MeshBasicMaterial({
        map: glow, color: 0xff9a72, transparent: true, opacity: 0.06,
        depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    wash.position.set(0, 2.26, -HALL_D / 2 + 0.32);
    wash.renderOrder = 3;
    group.add(wash);
    const signLamp = new THREE.PointLight(0xff9c6a, 1.4, 5, 2);
    signLamp.position.set(0, 2.1, -HALL_D / 2 + 0.9);
    group.add(signLamp);
    refs.sign = sign;
  }

  /* Anundsjö IF pennants on the side wall, in the club's red */
  ['ANUNDSJÖ IF', 'PEKKAS POKAL'].forEach((label, i) => {
    const pen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.55),
      new THREE.MeshBasicMaterial({ map: pennantTexture(label) })
    );
    pen.position.set(i === 0 ? -2.85 : 2.85, 2.34, -HALL_D / 2 + 0.22);
    group.add(pen);
  });

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

  /* Spectators. A village hall final is not played to an empty room, and
     a few seated silhouettes at the edge of the light do more for the
     sense of occasion than any amount of extra geometry on the table. */
  refs.crowd = [];
  const crowdShirts = [0x8c3a3a, 0x36506e, 0x4d6b42, 0x7a5a2c, 0x5a3c62, 0x2f5f5c, 0x8a6a3a];
  const seatRow = (x0, z0, dx, dz, n, ry) => {
    for (let i = 0; i < n; i++) {
      const c = new THREE.Group();
      // Stagger depth and height a little — a row of identical heads at
      // one z reads as a fence, not as people.
      c.position.set(x0 + dx * i, 0.5, z0 + dz * i - rand() * 0.3);
      c.rotation.y = ry + (rand() - 0.5) * 0.35;
      c.scale.setScalar(0.94 + rand() * 0.14);
      const shirt = crowdShirts[Math.floor(rand() * crowdShirts.length)];
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.24), lambert(shirt));
      body.position.y = 0.25;
      c.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.2, 0.19), lambert(0xd9a678));
      head.position.y = 0.6;
      c.add(head);
      const hair = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.07, 0.2),
        lambert(rand() < 0.3 ? 0xb9b3a6 : 0x3d2b18)
      );
      hair.position.y = 0.72;
      c.add(hair);
      // Legs hanging off the stage front
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.14), lambert(0x2b3140));
      legs.position.set(0, -0.15, 0.14);
      c.add(legs);
      c.userData = { phase: rand() * Math.PI * 2, home: c.position.y };
      group.add(c);
      refs.crowd.push(c);
    }
  };
  // Along the front lip of the stage, legs dangling, facing the table
  seatRow(-3.1, -HALL_D / 2 + 2.35, 0.78, 0, 8, 0);
  // A second cluster over on the right, on the stacked chairs
  seatRow(3.4, -1.2, 0, 0.95, 3, -Math.PI / 2.2);

  /* Wall clock — every bygdegård has one, and it dates the room */
  {
    const face = new THREE.Mesh(
      new THREE.CircleGeometry(0.24, 24),
      lambert(0xf0ece0)
    );
    face.position.set(HALL_W / 2 - 0.05, 2.9, -1.2);
    face.rotation.y = -Math.PI / 2;
    group.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), lambert(0x2a1f14));
    rim.position.copy(face.position);
    rim.rotation.y = -Math.PI / 2;
    group.add(rim);
    [[0.16, 0.02, -0.5], [0.1, 0.02, 1.9]].forEach(([len, wdt, ang]) => {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.01, len, wdt), lambert(0x22262e));
      hand.geometry.translate(0, len / 2, 0);
      hand.position.set(HALL_W / 2 - 0.07, 2.9, -1.2);
      hand.rotation.set(0, -Math.PI / 2, ang);
      group.add(hand);
    });
  }

  /* Scoreboard on the back wall — index.js repaints it per point */
  const sbCv = document.createElement('canvas');
  sbCv.width = 256;
  sbCv.height = 128;
  const sbTex = new THREE.CanvasTexture(sbCv);
  sbTex.colorSpace = THREE.SRGBColorSpace;
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(1.9, 0.95),
    new THREE.MeshBasicMaterial({ map: sbTex })
  );
  board.position.set(-3.0, 2.2, -HALL_D / 2 + 0.28);
  board.rotation.x = 0.14; // tilted toward the players, like a real board
  group.add(board);
  refs.scoreboard = { canvas: sbCv, ctx: sbCv.getContext('2d'), tex: sbTex };

  return { group, refs };
}

/* --------------------------------------------------------------- figures */

/**
 * A Pekkas player.
 *
 * Articulated rather than boxed: head with a face, neck, torso, shorts,
 * two-segment arms with elbows, two-segment legs with knees, socks and
 * shoes. Every joint index.js animates is its own group with the pivot at
 * the joint, so a shoulder rotation swings the whole arm and the paddle
 * with it — which is the only way a swing reads as a swing rather than a
 * mesh sliding sideways.
 *
 * Group origin sits at the feet, facing +z.
 */
export function buildPlayer(shirt, opts = {}) {
  const skin = opts.skin ?? 0xd9a678;
  const hairColor = opts.hair ?? 0x3d2b18;
  const shortsColor = opts.shorts ?? 0x23283a;
  const g = new THREE.Group();
  const refs = {};

  const shirtMat = lambert(shirt);
  const skinMat = lambert(skin);
  const shortsMat = lambert(shortsColor);
  const sockMat = lambert(0xf0ece2);
  const shoeMat = lambert(0x1b1e26);

  /* ---- Legs. Hip groups so index.js can bend the knees in the stance. */
  const makeLeg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.13, 0.86, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.16), shortsMat);
    thigh.geometry.translate(0, -0.21, 0);
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    hip.add(knee);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.13), skinMat);
    shin.geometry.translate(0, -0.2, 0);
    knee.add(shin);
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.14, 0.14), sockMat);
    sock.position.y = -0.35;
    knee.add(sock);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.24), shoeMat);
    shoe.position.set(0, -0.455, 0.04);
    knee.add(shoe);
    g.add(hip);
    return { hip, knee };
  };
  refs.legL = makeLeg(-1);
  refs.legR = makeLeg(1);

  /* ---- Torso: a tapered club shirt, not a slab */
  const torso = new THREE.Group();
  torso.position.y = 0.86;
  g.add(torso);
  refs.torso = torso;

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.24), shirtMat);
  chest.position.y = 0.24;
  chest.castShadow = true;
  torso.add(chest);
  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.21), shirtMat);
  waist.position.y = 0.05;
  waist.castShadow = true;
  torso.add(waist);
  // Collar and a club stripe across the chest
  const collar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.22), lambert(0xf2efe6));
  collar.position.y = 0.42;
  torso.add(collar);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.05, 0.25), lambert(0xf2efe6));
  stripe.position.y = 0.16;
  torso.add(stripe);

  /* ---- Head with a face. Its own group so it can track the ball. */
  const headG = new THREE.Group();
  headG.position.y = 0.53;
  torso.add(headG);
  refs.head = headG;

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.07, 8), skinMat);
  neck.position.y = -0.03;
  headG.add(neck);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.24, 0.21), skinMat);
  skull.position.y = 0.12;
  skull.castShadow = true;
  headG.add(skull);
  // Hair: cap plus a fringe over the brow
  const hairMat = lambert(hairColor);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.09, 0.225), hairMat);
  hairTop.position.y = 0.235;
  headG.add(hairTop);
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.06, 0.04), hairMat);
  fringe.position.set(0, 0.18, 0.095);
  headG.add(fringe);
  [-1, 1].forEach((sx) => {
    const sideburn = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.13, 0.2), hairMat);
    sideburn.position.set(sx * 0.105, 0.14, -0.005);
    headG.add(sideburn);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.02), lambert(0x1a1d24));
    eye.position.set(sx * 0.05, 0.13, 0.108);
    headG.add(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.015, 0.02), hairMat);
    brow.position.set(sx * 0.05, 0.165, 0.108);
    headG.add(brow);
  });
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.035), skinMat);
  nose.position.set(0, 0.09, 0.115);
  headG.add(nose);
  // Headband in the club colour — the detail that says "athlete"
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.232, 0.038, 0.232), shirtMat);
  band.position.y = 0.2;
  headG.add(band);

  /* ---- Arms. Shoulder → elbow → hand, each its own pivot. */
  const makeArm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.23, 0.36, 0);
    torso.add(shoulder);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.15), shirtMat);
    sleeve.position.y = -0.03;
    shoulder.add(sleeve);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.26, 0.095), skinMat);
    upper.geometry.translate(0, -0.13, 0);
    upper.castShadow = true;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.25, 0.085), skinMat);
    fore.geometry.translate(0, -0.125, 0);
    fore.castShadow = true;
    elbow.add(fore);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.1, 0.07), skinMat);
    hand.position.y = -0.29;
    elbow.add(hand);
    return { shoulder, elbow, hand };
  };
  refs.armL = makeArm(-1);
  refs.armR = makeArm(1);

  // The paddle lives in the right hand, gripped at the handle
  const paddle = buildPaddle();
  paddle.position.set(0, -0.4, 0.02);
  paddle.rotation.x = -0.5;
  refs.armR.elbow.add(paddle);
  refs.paddle = paddle;

  // Resting pose: knees soft, arms forward in a ready stance.
  //
  // Positive pitch swings an arm toward the figure's own +z, which is the
  // side it faces. Negative put both arms behind its back, where the bat
  // was invisible from across the table.
  refs.legL.hip.rotation.x = 0.1;
  refs.legR.hip.rotation.x = 0.1;
  refs.legL.knee.rotation.x = -0.22;
  refs.legR.knee.rotation.x = -0.22;
  refs.armL.shoulder.rotation.x = 0.5;
  refs.armL.shoulder.rotation.z = 0.34;
  refs.armL.elbow.rotation.x = 0.5;
  refs.armR.shoulder.rotation.x = 0.72;
  refs.armR.shoulder.rotation.z = -0.42;
  refs.armR.elbow.rotation.x = 0.5;

  return { group: g, refs };
}

/** A paddle: red rubber one side, black the other, pale blade edge, handle. */
export function buildPaddle() {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(
    new THREE.CylinderGeometry(0.098, 0.098, 0.014, 22),
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
