/**
 * Pekkas Fäktning — the Stockholm salle.
 *
 * A classic fäktsal at dusk. Interiors live or die on their lighting, and
 * the rule the literature keeps repeating is HIERARCHY: one dominant
 * source, one or two fills, a few accents — never everything lit equally.
 * So this room is built around:
 *
 *  - DOMINANT: low evening sun through the arched windows, warm, casting
 *    the only real shadows. Fake volumetric beams (semi-transparent
 *    geometry, the cheap trick that runs anywhere) carry it into the room
 *    with dust turning over inside them.
 *  - FILL: a cool overhead hemisphere so shadowed faces stay readable.
 *  - ACCENT: warm chandeliers, each with a glow sprite and a pool of
 *    light painted onto the floor beneath it.
 *
 * Everything else follows from that: a glossy parquet that catches
 * specular highlights, a metallic piste that does the same harder, and
 * wainscoted walls with enough tonal variety that the darkness has shape.
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

function lambert(color) {
  return new THREE.MeshLambertMaterial({ color });
}

/* --------------------------------------------------------------- textures */

/** Herringbone parquet with per-block tone variation and a waxed sheen. */
export function parquetTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(31);
  ctx.fillStyle = '#6d4a28';
  ctx.fillRect(0, 0, size, size);

  // Real herringbone: pairs of blocks at right angles, marching diagonally
  const bw = size / 8;
  const bl = bw * 2;
  const block = (x, y, vertical, v) => {
    ctx.save();
    ctx.translate(x, y);
    const w = vertical ? bw : bl;
    const h = vertical ? bl : bw;
    ctx.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(101 * v)},${Math.round(56 * v)})`;
    ctx.fillRect(1, 1, w - 2, h - 2);
    // Grain
    ctx.strokeStyle = `rgba(${Math.round(96 * v)},${Math.round(62 * v)},${Math.round(30 * v)},0.5)`;
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(w * t, 2);
        ctx.lineTo(w * t + (rand() - 0.5) * 2, h - 2);
      } else {
        ctx.moveTo(2, h * t);
        ctx.lineTo(w - 2, h * t + (rand() - 0.5) * 2);
      }
      ctx.stroke();
    }
    ctx.restore();
  };
  for (let row = -2; row < 10; row++) {
    for (let col = -2; col < 10; col++) {
      const x = col * bl;
      const y = row * bw + col * bw;
      block(x, y, false, 0.82 + rand() * 0.36);
      block(x + bl, y - bw, true, 0.82 + rand() * 0.36);
    }
  }
  // Waxed sheen across the boards
  const sheen = ctx.createLinearGradient(0, 0, size, size);
  sheen.addColorStop(0, 'rgba(255,232,190,0.08)');
  sheen.addColorStop(0.5, 'rgba(255,232,190,0)');
  sheen.addColorStop(1, 'rgba(255,232,190,0.06)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(7, 4);
  // A floor is always seen at a grazing angle; without this mipmaps eat it
  tex.anisotropy = 8;
  return tex;
}

/** The metallic piste from above: brushed strip with the bout lines. */
export function pisteTexture() {
  const w = 1024;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(17);
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#7d8695');
  base.addColorStop(0.45, '#c3ccd9');
  base.addColorStop(1, '#77808f');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.06})`;
    ctx.fillRect(rand() * w, 0, 1 + rand() * 2, h);
    ctx.fillStyle = `rgba(38,46,60,${0.02 + rand() * 0.06})`;
    ctx.fillRect(rand() * w, 0, 1, h);
  }
  ctx.fillStyle = 'rgba(28,34,46,0.85)';
  ctx.fillRect(w / 2 - 3, 0, 6, h);
  [-0.14, 0.14].forEach((f) => ctx.fillRect(w / 2 + f * w - 2, 0, 4, h));
  // Warning lines near the ends
  ctx.fillStyle = 'rgba(200,60,50,0.5)';
  [-0.42, 0.42].forEach((f) => ctx.fillRect(w / 2 + f * w - 12, 0, 24, h));
  ctx.fillStyle = 'rgba(28,34,46,0.9)';
  ctx.fillRect(0, 0, w, 5);
  ctx.fillRect(0, h - 5, w, 5);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Dusk over Stockholm: deep blue sky, warm windows, Stadshuset tower. */
export function skylineTexture() {
  const w = 256;
  const h = 320;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(5);

  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#26407a');
  sky.addColorStop(0.5, '#6a5f96');
  sky.addColorStop(0.78, '#d2814e');
  sky.addColorStop(1, '#ffb063');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = 'rgba(245,245,255,0.9)';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, 11, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#141c33';
  let x = 0;
  while (x < w) {
    const bw = 20 + rand() * 34;
    const bh = 46 + rand() * 60;
    ctx.fillRect(x, h - bh, bw, bh);
    ctx.fillStyle = 'rgba(255,205,120,0.9)';
    for (let i = 0; i < 5; i++) {
      if (rand() < 0.5) ctx.fillRect(x + 3 + rand() * (bw - 8), h - bh + 4 + rand() * (bh - 12), 3, 4);
    }
    ctx.fillStyle = '#141c33';
    x += bw + 3;
  }

  // Stadshuset with its three crowns
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(w * 0.12, h - 92, w * 0.34, 92);
  ctx.fillStyle = 'rgba(255,205,120,0.85)';
  for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.135 + i * w * 0.04, h - 84, 4, 10);
  ctx.fillStyle = '#0d1424';
  ctx.fillRect(w * 0.4, h - 176, 22, 176);
  ctx.fillRect(w * 0.397, h - 186, 28, 12);
  ctx.fillStyle = '#ffd27a';
  [0, 1, 2].forEach((i) => ctx.fillRect(w * 0.405 + i * 6, h - 194, 4, 5));
  ctx.fillStyle = '#0d1424';
  ctx.beginPath();
  ctx.moveTo(w * 0.62, h - 60);
  ctx.lineTo(w * 0.635, h - 150);
  ctx.lineTo(w * 0.65, h - 60);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,170,110,0.4)';
  for (let i = 0; i < 30; i++) ctx.fillRect(rand() * w, h - 12 + rand() * 10, 5 + rand() * 8, 1.5);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Panelled plaster wall: wainscot, rail, and blotchy age above it. */
function wallTexture() {
  const w = 512;
  const h = 256;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(61);

  // Upper plaster
  ctx.fillStyle = '#40614c';
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 46; i++) {
    const g = ctx.createRadialGradient(
      rand() * w, rand() * h * 0.7, 3,
      rand() * w, rand() * h * 0.7, 30 + rand() * 80
    );
    g.addColorStop(0, rand() < 0.5 ? 'rgba(86,120,96,0.22)' : 'rgba(18,32,24,0.26)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // Wainscot along the bottom third, with raised panels
  const wainTop = h * 0.62;
  ctx.fillStyle = '#4a3320';
  ctx.fillRect(0, wainTop, w, h - wainTop);
  const panels = 8;
  for (let i = 0; i < panels; i++) {
    const px = (i * w) / panels + 6;
    const pw = w / panels - 12;
    ctx.fillStyle = '#5c4028';
    ctx.fillRect(px, wainTop + 12, pw, h - wainTop - 24);
    ctx.strokeStyle = 'rgba(28,18,10,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 5, wainTop + 17, pw - 10, h - wainTop - 34);
    ctx.strokeStyle = 'rgba(150,110,70,0.28)';
    ctx.beginPath();
    ctx.moveTo(px + 5, wainTop + 17);
    ctx.lineTo(px + pw - 5, wainTop + 17);
    ctx.stroke();
  }
  // Chair rail
  ctx.fillStyle = '#6b4a2c';
  ctx.fillRect(0, wainTop - 4, w, 9);
  ctx.fillStyle = 'rgba(160,120,78,0.4)';
  ctx.fillRect(0, wainTop - 4, w, 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 4;
  return tex;
}

/** Soft round glow sprite. */
export function glowTexture(size = 64) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* -------------------------------------------------------------- the salle */

const SHIRTS = [0xd23b4e, 0x3e6e9e, 0x6f9e6a, 0xc9982e, 0x8a4a8c, 0x4a8c8a, 0xd97b3c, 0x777d88];

/**
 * A fake volumetric shaft: a tapered quad brightest at the source and
 * fading to black at the floor, additively blended. Semi-transparent
 * geometry rather than a real volume — cheap enough for any phone.
 */
function beamQuad(from, to, wTop, wBot, tint) {
  const verts = [];
  const cols = [];
  const q = [
    [from[0] - wTop, from[1], from[2]], [from[0] + wTop, from[1], from[2]],
    [to[0] + wBot, to[1], to[2]], [to[0] - wBot, to[1], to[2]]
  ];
  [[0, 1, 2], [0, 2, 3]].forEach((tri) => {
    tri.forEach((idx) => {
      verts.push(q[idx][0], q[idx][1], q[idx][2]);
      const b = idx <= 1 ? 1 : 0.04;
      cols.push(tint.r * b, tint.g * b, tint.b * b);
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
  return geo;
}

export function buildSalle(glow) {
  const g = new THREE.Group();
  const rand = mulberry(13);

  /* ---- Floor: glossy parquet that can catch a highlight ---- */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16, 60, 32),
    new THREE.MeshPhongMaterial({
      map: parquetTexture(), shininess: 24, specular: 0x3a3222
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  /* ---- Piste: harder sheen, raised, with its own shadow ---- */
  const piste = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.07, 1.9),
    new THREE.MeshPhongMaterial({
      map: pisteTexture(), shininess: 70, specular: 0x9aa6b8
    })
  );
  piste.position.y = 0.035;
  piste.receiveShadow = true;
  piste.castShadow = true;
  g.add(piste);

  /* ---- Walls: panelled, with pilasters breaking up the run ---- */
  const wallMat = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), wallMat);
  back.position.set(0, 4.5, -7);
  back.receiveShadow = true;
  g.add(back);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), wallMat);
    side.position.set(s * 15, 4.5, 0);
    side.rotation.y = (-s * Math.PI) / 2;
    g.add(side);
  });
  // Pilasters + a cornice give the back wall depth
  const woodMat = lambert(0x4a3320);
  [-11, -5.6, 5.6, 11].forEach((x) => {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 8.4, 0.22), woodMat);
    pil.position.set(x, 4.2, -6.86);
    pil.castShadow = true;
    g.add(pil);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.24, 0.34), lambert(0x60432a));
    cap.position.set(x, 8.5, -6.82);
    g.add(cap);
  });
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(30, 0.35, 0.4), lambert(0x60432a));
  cornice.position.set(0, 8.8, -6.8);
  g.add(cornice);

  /* ---- The windows: the room's dominant light ---- */
  const skyTex = skylineTexture();
  const beamGeos = [];
  const beamTint = new THREE.Color(0xffcf95);
  [-8.2, 0, 8.2].forEach((x) => {
    const win = new THREE.Group();
    const pane = new THREE.Mesh(
      new THREE.PlaneGeometry(2.5, 3.4),
      new THREE.MeshBasicMaterial({ map: skyTex, fog: false })
    );
    pane.position.y = -0.4;
    win.add(pane);
    const arch = new THREE.Mesh(
      new THREE.CircleGeometry(1.25, 20, 0, Math.PI),
      new THREE.MeshBasicMaterial({ map: skyTex, fog: false })
    );
    arch.position.y = 1.3;
    win.add(arch);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.08, 6, 18, Math.PI), lambert(0x3a2c1c));
    frame.position.y = 1.3;
    win.add(frame);
    [-1.3, 1.3].forEach((fx) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.5, 0.14), lambert(0x3a2c1c));
      jamb.position.set(fx, -0.45, 0);
      win.add(jamb);
    });
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.4, 0.1), lambert(0x3a2c1c));
    mull.position.y = -0.4;
    win.add(mull);
    const transom = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.1), lambert(0x3a2c1c));
    transom.position.y = -0.4;
    win.add(transom);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.34), lambert(0x4a3320));
    sill.position.y = -2.2;
    sill.castShadow = true;
    win.add(sill);
    win.position.set(x, 5.1, -6.93);
    g.add(win);

    // The shaft this window throws across the floor
    beamGeos.push(beamQuad(
      [x - 0.3, 5.6, -6.8], [x + 3.4, 0.05, 1.6], 1.5, 2.4, beamTint
    ));
  });

  // Merge the three shafts into one additive mesh
  let total = 0;
  beamGeos.forEach((b) => {
    total += b.attributes.position.count;
  });
  const bp = new Float32Array(total * 3);
  const bc = new Float32Array(total * 3);
  let bo = 0;
  beamGeos.forEach((b) => {
    bp.set(b.attributes.position.array, bo * 3);
    bc.set(b.attributes.color.array, bo * 3);
    bo += b.attributes.position.count;
    b.dispose();
  });
  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(bp, 3));
  beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  const beams = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.13,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  }));
  beams.renderOrder = 6;
  g.add(beams);

  /* ---- Chandeliers: the warm accents, each with a pool on the floor ---- */
  const glowMat = new THREE.SpriteMaterial({
    map: glow, color: 0xffc078, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const poolMat = new THREE.MeshBasicMaterial({
    map: glow, color: 0xffb877, transparent: true, opacity: 0.16,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const chandeliers = [];
  [-5, 5].forEach((x) => {
    const ch = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5), lambert(0x2c2418));
    stem.position.y = 0.8;
    ch.add(stem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 6, 14), lambert(0x7a5a2c));
    ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 5, 12), lambert(0x7a5a2c));
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.16;
    ch.add(inner);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const candle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.032, 0.032, 0.2, 5),
        new THREE.MeshBasicMaterial({ color: 0xfff4d8 })
      );
      candle.position.set(Math.cos(a) * 0.52, 0.14, Math.sin(a) * 0.52);
      ch.add(candle);
      const flame = new THREE.Sprite(glowMat);
      flame.scale.setScalar(0.3);
      flame.position.set(Math.cos(a) * 0.52, 0.3, Math.sin(a) * 0.52);
      ch.add(flame);
    }
    const halo = new THREE.Sprite(glowMat);
    halo.scale.setScalar(3.0);
    halo.position.y = 0.2;
    ch.add(halo);
    ch.position.set(x, 6.3, -1.5);
    g.add(ch);
    chandeliers.push(ch);

    // The pool it throws on the floor: a flat additive disc
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.012, -1.5);
    pool.renderOrder = 4;
    g.add(pool);
  });

  /* ---- Banners and a wall clock ---- */
  [-12.4, 12.4].forEach((x, i) => {
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.8), lambert(i ? 0x8f2d3c : 0xb08428));
    banner.position.set(x, 5.4, -6.86);
    g.add(banner);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.75, 0.75, 4), banner.material);
    tip.rotation.z = Math.PI;
    tip.rotation.y = Math.PI / 4;
    tip.scale.z = 0.06;
    tip.position.set(x, 3.62, -6.86);
    g.add(tip);
    // Crossed foils on each banner
    [-1, 1].forEach((s) => {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.7, 0.03), lambert(0xe8e2cf));
      blade.position.set(x, 5.5, -6.83);
      blade.rotation.z = s * 0.42;
      g.add(blade);
    });
  });
  const clock = new THREE.Group();
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), lambert(0xf0ead6));
  clock.add(face);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 6, 20), lambert(0x2c2418));
  clock.add(bezel);
  [[0.02, 0.26, 0.5], [0.02, 0.17, -1.1]].forEach(([w2, l, rot]) => {
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w2, l, 0.02), lambert(0x22262c));
    hand.position.set(Math.sin(rot) * l * 0.5, Math.cos(rot) * l * 0.5, 0.03);
    hand.rotation.z = -rot;
    clock.add(hand);
  });
  clock.position.set(-4.2, 6.5, -6.84);
  g.add(clock);

  /* ---- The scoring box, hung above centre piste ---- */
  const box = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.76, 0.32), lambert(0x1c222e));
  body.castShadow = true;
  box.add(body);
  const bezel2 = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.82, 0.06), lambert(0x333c4c));
  bezel2.position.z = -0.14;
  box.add(bezel2);
  const lampL = new THREE.MeshBasicMaterial({ color: 0x1c3324 });
  const lampR = new THREE.MeshBasicMaterial({ color: 0x33201c });
  const lampMeshL = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), lampL);
  lampMeshL.position.set(-0.44, 0.02, 0.17);
  box.add(lampMeshL);
  const lampMeshR = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.44), lampR);
  lampMeshR.position.set(0.44, 0.02, 0.17);
  box.add(lampMeshR);
  box.position.set(3.5, 1.95, -3.4);
  box.rotation.y = -0.42;
  box.scale.setScalar(0.9);
  g.add(box);
  // Tripod stand under it
  const stand = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.58, 6), lambert(0x24282f));
  post.position.y = 0.79;
  post.castShadow = true;
  stand.add(post);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.62, 5), lambert(0x24282f));
    foot.position.set(Math.cos(a) * 0.2, 0.24, Math.sin(a) * 0.2);
    foot.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55);
    foot.castShadow = true;
    stand.add(foot);
  }
  stand.position.set(3.5, 0, -3.4);
  g.add(stand);

  /* ---- Spectator bench ---- */
  const crowd = [];
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.14, 0.75), lambert(0x4a3320));
  seat.position.y = 0.56;
  seat.castShadow = true;
  seat.receiveShadow = true;
  bench.add(seat);
  const backRest = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.5, 0.1), lambert(0x54391f));
  backRest.position.set(0, 0.95, -0.34);
  bench.add(backRest);
  [-4.2, 0, 4.2].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.62), lambert(0x3a2c1c));
    leg.position.set(x, 0.28, 0);
    leg.castShadow = true;
    bench.add(leg);
  });
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Group();
    const body2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.21, 0.58, 7),
      lambert(SHIRTS[i % SHIRTS.length])
    );
    body2.position.y = 0.9;
    body2.castShadow = true;
    p.add(body2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 8, 6), lambert(0xdba97f));
    head.position.y = 1.34;
    head.castShadow = true;
    p.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.152, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      lambert(rand() < 0.5 ? 0x3a2a1c : 0x6b5238));
    hair.position.y = 1.35;
    p.add(hair);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.24), lambert(0x2f3746));
    legs.position.set(0, 0.36, 0.22);
    p.add(legs);
    const arms = new THREE.Group();
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.042, 0.44, 5), body2.material);
      arm.position.set(s * 0.2, 0, 0);
      arm.rotation.z = s * 2.4;
      arms.add(arm);
    });
    arms.position.y = 1.08;
    p.add(arms);
    p.position.set(-4 + i * 1.15 + (rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.1);
    p.userData.arms = arms;
    p.userData.phase = rand() * 6.28;
    bench.add(p);
    crowd.push(p);
  }
  bench.position.set(0, 0, -5.6);
  g.add(bench);

  /* ---- Trophy table stage left, with a spot of its own ---- */
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.09, 0.95), lambert(0x4a3320));
  top.position.y = 0.92;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);
  const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.42, 1.0), lambert(0x7a2230));
  cloth.position.y = 0.72;
  table.add(cloth);
  [-0.6, 0.6].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.92, 0.85), lambert(0x3a2c1c));
    leg.position.set(x, 0.46, 0);
    table.add(leg);
  });
  const cupMat = new THREE.MeshPhongMaterial({
    color: 0xf2c14e, emissive: 0x4a3200, shininess: 90, specular: 0xfff0c0
  });
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.1, 0.32, 12), cupMat);
  bowl.position.y = 1.28;
  bowl.castShadow = true;
  table.add(bowl);
  const stemC = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.22, 8), cupMat);
  stemC.position.y = 1.06;
  table.add(stemC);
  const footC = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 10), cupMat);
  footC.position.y = 0.98;
  table.add(footC);
  [-1, 1].forEach((s) => {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.018, 4, 10), cupMat);
    handle.position.set(s * 0.24, 1.3, 0);
    handle.rotation.y = Math.PI / 2;
    table.add(handle);
  });
  const cupGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: 0xffd98a, transparent: true, opacity: 0.4,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  cupGlow.scale.setScalar(1.5);
  cupGlow.position.y = 1.28;
  table.add(cupGlow);
  table.position.set(-6.6, 0, -4.6);
  table.rotation.y = 0.4;
  g.add(table);

  /* ---- Dust turning over in the beams ---- */
  const moteCount = 150;
  const motePos = new Float32Array(moteCount * 3);
  for (let i = 0; i < moteCount; i++) {
    const beamAt = [-8.2, 0, 8.2][Math.floor(rand() * 3)];
    const t = rand();
    motePos[i * 3] = beamAt - 0.3 + t * 3.7 + (rand() - 0.5) * 2.6;
    motePos[i * 3 + 1] = 4.9 - t * 4.85 + (rand() - 0.5) * 0.6;
    motePos[i * 3 + 2] = -6.8 + t * 8.4 + (rand() - 0.5) * 1.2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
    map: glow, color: 0xffe2b4, size: 0.045, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending
  }));
  motes.frustumCulled = false;
  g.add(motes);

  return { group: g, lampL, lampR, crowd, beams, motes, chandeliers };
}

/* ------------------------------------------------------------- the fencer */

/**
 * An articulated fencer facing +x. userData carries the joints the game
 * poses every frame, plus the socks so the opponent can be recoloured.
 */
export function buildFencer(jacketColor, sockColor) {
  const g = new THREE.Group();
  // The whites are lightly glossy — a fencing jacket is not chalk, and the
  // sheen is what separates the fencers from a dark salle.
  const jacket = new THREE.MeshPhongMaterial({
    color: jacketColor, shininess: 14, specular: 0x3c3c38
  });
  const knickers = new THREE.MeshPhongMaterial({
    color: 0xe6e4de, shininess: 10, specular: 0x333330
  });

  const sockMat = () => new THREE.MeshLambertMaterial({ color: sockColor });
  const socks = [];

  /* Legs in en-garde stance */
  const legF = new THREE.Group();
  const thighF = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.5, 7), knickers);
  thighF.position.y = -0.25;
  thighF.castShadow = true;
  legF.add(thighF);
  const shinF = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.48, 6), sockMat());
  shinF.position.y = -0.72;
  shinF.castShadow = true;
  legF.add(shinF);
  socks.push(shinF);
  const shoeF = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.15), lambert(0x22282f));
  shoeF.position.set(0.08, -0.99, 0);
  shoeF.castShadow = true;
  legF.add(shoeF);
  legF.position.set(0.22, 1.04, 0);
  legF.rotation.z = -0.35;
  g.add(legF);

  const legB = new THREE.Group();
  const thighB = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.09, 0.5, 7), knickers);
  thighB.position.y = -0.25;
  thighB.castShadow = true;
  legB.add(thighB);
  const shinB = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.48, 6), sockMat());
  shinB.position.y = -0.72;
  shinB.castShadow = true;
  legB.add(shinB);
  socks.push(shinB);
  const shoeB = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.15), lambert(0x22282f));
  shoeB.position.set(-0.05, -0.99, 0);
  shoeB.rotation.y = -0.9;
  shoeB.castShadow = true;
  legB.add(shoeB);
  legB.position.set(-0.26, 1.04, 0);
  legB.rotation.z = 0.42;
  g.add(legB);

  /* Torso */
  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.265, 0.72, 8), jacket);
  chest.position.y = 0.36;
  chest.castShadow = true;
  torso.add(chest);
  // The lamé: metallic, so it actually catches the chandeliers
  const lame = new THREE.Mesh(
    new THREE.CylinderGeometry(0.222, 0.252, 0.42, 8),
    new THREE.MeshPhongMaterial({
      color: 0xd8dce4, shininess: 95, specular: 0xffffff, emissive: 0x14161a
    })
  );
  lame.position.y = 0.42;
  lame.scale.z = 0.98;
  lame.castShadow = true;
  torso.add(lame);
  // Body-cord running from the back of the lamé
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), lambert(0x22262c));
  cord.position.set(-0.2, 0.3, 0);
  cord.rotation.z = 0.5;
  torso.add(cord);

  /* Head: mask shell plus a darker grille */
  const headG = new THREE.Group();
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8),
    new THREE.MeshPhongMaterial({ color: 0xa8b0bc, shininess: 40, specular: 0x6f7784 }));
  mask.scale.set(1.15, 1.25, 0.95);
  mask.castShadow = true;
  headG.add(mask);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x1b1f26 })
  );
  mesh.scale.set(1.05, 1.1, 0.7);
  mesh.position.x = 0.07;
  headG.add(mesh);
  // Bib below the grille
  const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 8), jacket);
  bib.position.y = -0.22;
  headG.add(bib);
  headG.position.y = 0.95;
  torso.add(headG);

  /* Rear arm curled up behind */
  const armB = new THREE.Group();
  const upperB = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.4, 6), jacket);
  upperB.position.y = 0.2;
  upperB.rotation.z = 0.5;
  armB.add(upperB);
  const foreB = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.05, 0.34, 6), jacket);
  foreB.position.set(-0.16, 0.45, 0);
  foreB.rotation.z = -0.9;
  armB.add(foreB);
  armB.position.set(-0.14, 0.5, 0.06);
  armB.rotation.z = 0.7;
  torso.add(armB);

  /* Weapon arm */
  const armF = new THREE.Group();
  const upperF = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.44, 6), jacket);
  upperF.rotation.z = Math.PI / 2;
  upperF.position.x = 0.22;
  upperF.castShadow = true;
  armF.add(upperF);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.08, 7, 6),
    new THREE.MeshPhongMaterial({ color: 0xe8e4da, shininess: 20, specular: 0x3a3a36 }));
  glove.position.x = 0.46;
  armF.add(glove);

  /* Foil: guard, grip, blade with a bright tip */
  const foil = new THREE.Group();
  const steel = new THREE.MeshPhongMaterial({
    color: 0xc8cfdc, shininess: 110, specular: 0xffffff, emissive: 0x1a1e24
  });
  const guard = new THREE.Mesh(
    new THREE.SphereGeometry(0.105, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel
  );
  guard.rotation.z = -Math.PI / 2;
  foil.add(guard);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.006, 1.05, 5), steel);
  blade.rotation.z = -Math.PI / 2;
  blade.position.x = 0.55;
  foil.add(blade);
  const tipMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), tipMat);
  tip.position.x = 1.07;
  foil.add(tip);
  const foilTip = new THREE.Object3D();
  foilTip.position.x = 1.08;
  foil.add(foilTip);
  // A streak along the blade, lit only while the arm is driving forward.
  // Nothing sells a lunge like the blade leaving a smear behind it.
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xbfe4ff, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.13), trailMat);
  trail.position.set(0.55, 0, 0);
  trail.renderOrder = 8;
  foil.add(trail);
  foil.position.x = 0.5;
  armF.add(foil);
  armF.position.set(0.12, 0.62, 0.1);
  torso.add(armF);

  torso.position.y = 1.02;
  g.add(torso);

  g.userData = { torso, headG, armF, armB, legF, legB, foilTip, foil, socks, blade, trailMat };
  return g;
}
