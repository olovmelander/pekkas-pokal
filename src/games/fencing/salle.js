/**
 * Pekkas Fäktning — the Stockholm salle.
 *
 * A classic fäktsal at dusk, procedural as always:
 *
 *  - herringbone parquet and the raised metallic piste with its en-garde
 *    lines, painted as canvas textures
 *  - tall arched windows with a dusk Stockholm skyline — Stadshuset with
 *    its three-crown tower included — behind them
 *  - chandeliers whose glow is an additive sprite, banners, a bench of
 *    spectators (the rest of the gang) who throw their arms up on a touch
 *  - a real scoring box above the piste: green lamp for the left fencer,
 *    red for the right, exactly like the apparatus in a real bout
 *  - the fencers themselves: articulated low-poly figures with mask,
 *    jacket, knickers and a foil, posed entirely in code
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

/** Herringbone-ish parquet strips with tone variation. */
export function parquetTexture() {
  const w = 512;
  const h = 512;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(31);
  ctx.fillStyle = '#7a5230';
  ctx.fillRect(0, 0, w, h);
  const rows = 10;
  const cols = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = 0.82 + rand() * 0.36;
      ctx.fillStyle = `rgb(${Math.round(138 * v)},${Math.round(92 * v)},${Math.round(52 * v)})`;
      const off = (r % 2) * (w / cols / 2);
      ctx.fillRect(c * (w / cols) + off - w / cols / 2, r * (h / rows) + 1, w / cols - 3, h / rows - 2);
    }
  }
  // Sheen strips
  const sheen = ctx.createLinearGradient(0, 0, w, h);
  sheen.addColorStop(0, 'rgba(255,236,200,0.07)');
  sheen.addColorStop(0.5, 'rgba(255,236,200,0)');
  sheen.addColorStop(1, 'rgba(255,236,200,0.05)');
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

/** The metallic piste seen from above: brushed strip with bout lines. */
export function pisteTexture() {
  const w = 1024;
  const h = 128;
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d');
  const rand = mulberry(17);
  const base = ctx.createLinearGradient(0, 0, w, 0);
  base.addColorStop(0, '#8e97a6');
  base.addColorStop(0.5, '#b8c1cf');
  base.addColorStop(1, '#8e97a6');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  // Brushed metal streaks
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, 0, 1 + rand() * 2, h);
    ctx.fillStyle = `rgba(40,50,66,${0.02 + rand() * 0.05})`;
    ctx.fillRect(rand() * w, 0, 1, h);
  }
  // Centre line and the two en-garde lines
  ctx.fillStyle = 'rgba(30,36,48,0.85)';
  ctx.fillRect(w / 2 - 3, 0, 6, h);
  [-0.14, 0.14].forEach((f) => {
    ctx.fillRect(w / 2 + f * w - 2, 0, 4, h);
  });
  // Edge rails
  ctx.fillStyle = 'rgba(30,36,48,0.9)';
  ctx.fillRect(0, 0, w, 5);
  ctx.fillRect(0, h - 5, w, 5);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  sky.addColorStop(0, '#1c2c52');
  sky.addColorStop(0.55, '#3c4a78');
  sky.addColorStop(0.8, '#b06a52');
  sky.addColorStop(1, '#e8935e');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // A pale moon
  ctx.fillStyle = 'rgba(240,240,255,0.85)';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.2, 11, 0, Math.PI * 2);
  ctx.fill();

  // Rooftops with lit windows
  ctx.fillStyle = '#131b30';
  let x = 0;
  while (x < w) {
    const bw = 20 + rand() * 34;
    const bh = 46 + rand() * 60;
    ctx.fillRect(x, h - bh, bw, bh);
    ctx.fillStyle = 'rgba(255,205,120,0.85)';
    for (let i = 0; i < 5; i++) {
      if (rand() < 0.5) ctx.fillRect(x + 3 + rand() * (bw - 8), h - bh + 4 + rand() * (bh - 12), 3, 4);
    }
    ctx.fillStyle = '#131b30';
    x += bw + 3;
  }

  // Stadshuset: long body, arcade, and the tower with tre kronor
  ctx.fillStyle = '#0e1526';
  ctx.fillRect(w * 0.12, h - 92, w * 0.34, 92);
  ctx.fillStyle = 'rgba(255,205,120,0.8)';
  for (let i = 0; i < 8; i++) ctx.fillRect(w * 0.135 + i * w * 0.04, h - 84, 4, 10);
  ctx.fillStyle = '#0e1526';
  ctx.fillRect(w * 0.4, h - 176, 22, 176);
  ctx.fillRect(w * 0.397, h - 186, 28, 12);
  // Three crowns, tiny and golden
  ctx.fillStyle = '#ffd27a';
  [0, 1, 2].forEach((i) => {
    ctx.fillRect(w * 0.405 + i * 6, h - 194, 4, 5);
  });
  // Riddarholmen spire
  ctx.fillStyle = '#0e1526';
  ctx.beginPath();
  ctx.moveTo(w * 0.62, h - 60);
  ctx.lineTo(w * 0.635, h - 150);
  ctx.lineTo(w * 0.65, h - 60);
  ctx.fill();

  // Water glints at the bottom
  ctx.fillStyle = 'rgba(255,170,110,0.35)';
  for (let i = 0; i < 30; i++) ctx.fillRect(rand() * w, h - 12 + rand() * 10, 5 + rand() * 8, 1.5);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
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
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* -------------------------------------------------------------- the salle */

const SHIRTS = [0xd23b4e, 0x3e6e9e, 0x6f9e6a, 0xc9982e, 0x8a4a8c, 0x4a8c8a, 0xd97b3c, 0x777d88];

export function buildSalle(glow) {
  const g = new THREE.Group();

  /* Floor + piste */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 16),
    new THREE.MeshLambertMaterial({ map: parquetTexture() })
  );
  floor.rotation.x = -Math.PI / 2;
  g.add(floor);

  const piste = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.06, 1.9),
    new THREE.MeshLambertMaterial({ map: pisteTexture() })
  );
  piste.position.y = 0.03;
  g.add(piste);

  /* Walls: deep green panelling with a wooden dado */
  const wallMat = lambert(0x2c473c);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), wallMat);
  back.position.set(0, 4.5, -7);
  g.add(back);
  const dado = new THREE.Mesh(new THREE.BoxGeometry(30, 1.5, 0.12), lambert(0x4a3320));
  dado.position.set(0, 0.75, -6.95);
  g.add(dado);
  [-1, 1].forEach((s) => {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), wallMat);
    side.position.set(s * 15, 4.5, 0);
    side.rotation.y = -s * Math.PI / 2;
    g.add(side);
  });

  /* Tall arched windows with the skyline behind */
  const skyTex = skylineTexture();
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
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.07, 6, 18, Math.PI), lambert(0x3a2c1c));
    frame.position.y = 1.3;
    win.add(frame);
    [-1.3, 1.3].forEach((fx) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 0.12), lambert(0x3a2c1c));
      jamb.position.set(fx, -0.45, 0);
      win.add(jamb);
    });
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.09, 3.4, 0.09), lambert(0x3a2c1c));
    mull.position.y = -0.4;
    win.add(mull);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.12, 0.3), lambert(0x3a2c1c));
    sill.position.y = -2.2;
    win.add(sill);
    win.position.set(x, 4.4, -6.93);
    g.add(win);
  });

  /* Chandeliers */
  const glowMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xffd9a0,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  [-5, 5].forEach((x) => {
    const ch = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), lambert(0x2c2418));
    stem.position.y = 0.8;
    ch.add(stem);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 6, 14), lambert(0x6b4d26));
    ring.rotation.x = Math.PI / 2;
    ch.add(ring);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const candle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5),
        new THREE.MeshBasicMaterial({ color: 0xfff2cf })
      );
      candle.position.set(Math.cos(a) * 0.5, 0.12, Math.sin(a) * 0.5);
      ch.add(candle);
    }
    const halo = new THREE.Sprite(glowMat);
    halo.scale.setScalar(2.6);
    halo.position.y = 0.2;
    ch.add(halo);
    ch.position.set(x, 6.4, -1.5);
    g.add(ch);
  });

  /* Banners over the back wall */
  [-11.5, 11.5].forEach((x, i) => {
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(1.4, 2.6),
      lambert(i ? 0x8f2d3c : 0xc9982e)
    );
    banner.position.set(x, 5.2, -6.9);
    g.add(banner);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.7, 4), banner.material);
    tip.rotation.z = Math.PI;
    tip.rotation.y = Math.PI / 4;
    tip.scale.z = 0.08;
    tip.position.set(x, 3.55, -6.9);
    g.add(tip);
  });

  /* The scoring box, hung above centre piste: green left, red right */
  const box = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 0.3), lambert(0x1c222e));
  box.add(body);
  const lampL = new THREE.MeshBasicMaterial({ color: 0x1c3324 });
  const lampR = new THREE.MeshBasicMaterial({ color: 0x33201c });
  const lampMeshL = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), lampL);
  lampMeshL.position.set(-0.42, 0.02, 0.16);
  box.add(lampMeshL);
  const lampMeshR = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.42), lampR);
  lampMeshR.position.set(0.42, 0.02, 0.16);
  box.add(lampMeshR);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 4.4, 4), lambert(0x10141c));
  wire.position.y = 2.55;
  box.add(wire);
  box.position.set(0, 4.35, -2.6);
  g.add(box);

  /* Spectator bench along the back — the rest of the gang */
  const crowd = [];
  const bench = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.7), lambert(0x4a3320));
  seat.position.y = 0.55;
  bench.add(seat);
  [-4, 0, 4].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.55, 0.6), lambert(0x3a2c1c));
    leg.position.set(x, 0.27, 0);
    bench.add(leg);
  });
  const rand = mulberry(13);
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Group();
    const body2 = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.2, 0.55, 6),
      lambert(SHIRTS[i % SHIRTS.length])
    );
    body2.position.y = 0.88;
    p.add(body2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 5), lambert(0xdba97f));
    head.position.y = 1.32;
    p.add(head);
    const arms = new THREE.Group();
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.42, 5), body2.material);
      arm.position.set(s * 0.2, 0, 0);
      arm.rotation.z = s * 2.4; // resting: hanging down-ish
      arms.add(arm);
    });
    arms.position.y = 1.06;
    p.add(arms);
    p.position.set(-4 + i * 1.15 + (rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.1);
    p.userData.arms = arms;
    p.userData.phase = rand() * 6.28;
    bench.add(p);
    crowd.push(p);
  }
  bench.position.set(0, 0, -5.6);
  g.add(bench);

  /* Trophy table stage left */
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.9), lambert(0x4a3320));
  top.position.y = 0.9;
  table.add(top);
  [-0.55, 0.55].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.8), lambert(0x3a2c1c));
    leg.position.set(x, 0.45, 0);
    table.add(leg);
  });
  const cup = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.09, 0.3, 10),
    new THREE.MeshLambertMaterial({ color: 0xf2c14e, emissive: 0x4a3200 })
  );
  bowl.position.y = 1.24;
  cup.add(bowl);
  const stemC = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.2, 6), bowl.material);
  stemC.position.y = 1.04;
  cup.add(stemC);
  table.add(cup);
  table.position.set(-6.4, 0, -4.6);
  table.rotation.y = 0.4;
  g.add(table);

  return { group: g, lampL, lampR, crowd };
}

/* ------------------------------------------------------------- the fencer */

/**
 * An articulated fencer built to face +x. userData carries the joints the
 * game poses every frame: torso, headG, armF (front arm with the foil),
 * armB, legF, legB, foilTip.
 */
export function buildFencer(jacketColor, sockColor) {
  const g = new THREE.Group();
  const jacket = lambert(jacketColor);
  const knickers = lambert(0xe8e6e0);
  const skin = lambert(0xdba97f);

  /* Legs in en-garde stance */
  const legF = new THREE.Group();
  const thighF = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 6), knickers);
  thighF.position.y = -0.25;
  legF.add(thighF);
  const shinF = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.48, 6), lambert(sockColor));
  shinF.position.y = -0.72;
  legF.add(shinF);
  const shoeF = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.14), lambert(0x2c3038));
  shoeF.position.set(0.08, -0.99, 0);
  legF.add(shoeF);
  legF.position.set(0.22, 1.04, 0);
  legF.rotation.z = -0.35;
  g.add(legF);

  const legB = new THREE.Group();
  const thighB = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 6), knickers);
  thighB.position.y = -0.25;
  legB.add(thighB);
  const shinB = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.48, 6), lambert(sockColor));
  shinB.position.y = -0.72;
  legB.add(shinB);
  const shoeB = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.14), lambert(0x2c3038));
  shoeB.position.set(-0.05, -0.99, 0);
  shoeB.rotation.y = -0.9;
  legB.add(shoeB);
  legB.position.set(-0.26, 1.04, 0);
  legB.rotation.z = 0.42;
  g.add(legB);

  /* Torso group carries everything above the hips */
  const torso = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.72, 7), jacket);
  chest.position.y = 0.36;
  torso.add(chest);
  // The lamé target patch on the chest, slightly brighter
  const lame = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.245, 0.4, 7),
    new THREE.MeshLambertMaterial({ color: 0xf4f2ea, emissive: 0x1c1a14 }));
  lame.position.y = 0.42;
  lame.scale.z = 0.98;
  torso.add(lame);

  /* Head with mesh mask */
  const headG = new THREE.Group();
  const mask = new THREE.Mesh(new THREE.SphereGeometry(0.2, 9, 7), lambert(0x9aa2b0));
  mask.scale.set(1.15, 1.25, 0.95);
  headG.add(mask);
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 9, 7),
    new THREE.MeshLambertMaterial({ color: 0x22262e })
  );
  mesh.scale.set(1.05, 1.1, 0.7);
  mesh.position.x = 0.07;
  headG.add(mesh);
  const bib = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 7), jacket);
  bib.position.y = -0.22;
  headG.add(bib);
  headG.position.y = 0.95;
  torso.add(headG);

  /* Rear arm curls up behind — the classic pose */
  const armB = new THREE.Group();
  const upperB = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.4, 6), jacket);
  upperB.position.y = 0.2;
  upperB.rotation.z = 0.5;
  armB.add(upperB);
  const foreB = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.34, 6), jacket);
  foreB.position.set(-0.16, 0.45, 0);
  foreB.rotation.z = -0.9;
  armB.add(foreB);
  armB.position.set(-0.14, 0.5, 0.06);
  armB.rotation.z = 0.7;
  torso.add(armB);

  /* Front arm: the weapon arm, one pivot at the shoulder */
  const armF = new THREE.Group();
  const upperF = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.44, 6), jacket);
  upperF.rotation.z = Math.PI / 2;
  upperF.position.x = 0.22;
  armF.add(upperF);
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 6, 5), skin);
  glove.position.x = 0.46;
  armF.add(glove);

  /* The foil: guard, grip, blade, tip */
  const foil = new THREE.Group();
  const guard = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), lambert(0xb9c2d2));
  guard.rotation.z = -Math.PI / 2;
  foil.add(guard);
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.006, 1.05, 5),
    new THREE.MeshLambertMaterial({ color: 0xdfe6f2, emissive: 0x30363f }));
  blade.rotation.z = -Math.PI / 2;
  blade.position.x = 0.55;
  foil.add(blade);
  const foilTip = new THREE.Object3D();
  foilTip.position.x = 1.08;
  foil.add(foilTip);
  foil.position.x = 0.5;
  armF.add(foil);
  armF.position.set(0.12, 0.62, 0.1);
  torso.add(armF);

  torso.position.y = 1.02;
  g.add(torso);

  g.userData = { torso, headG, armF, armB, legF, legB, foilTip, foil };
  return g;
}
