/**
 * Pekkas Lerduvor — the Arnäsvall range.
 *
 * A Norrland field in August evening light, procedural top to bottom:
 *
 *  - a gradient sky dome with a low warm sun and drifting clouds
 *  - a barley field painted as a canvas texture, mowed short around the
 *    shooting station
 *  - the sunken trap house ahead, a red barn with white knuts off to the
 *    side, fence posts, and two ranks of spruce closing the horizon
 *  - the gang behind the station on folding chairs, arms up on a kross
 *  - an over-under shotgun seen from the gun's own shoulder, muzzle
 *    flash sprite and ejected shells included
 *  - the clay itself: a fluorescent orange dome that breaks into real
 *    3D shards when the pattern connects
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

/* ---------------------------------------------------------------- helpers */

function mergeGeos(list) {
  let total = 0;
  list.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o);
    o += g.attributes.position.count * 3;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/* ------------------------------------------------------------------- sky */

export function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x2f6aac) },
    uHorizon: { value: new THREE.Color(0xffd9a0) },
    uSunColor: { value: new THREE.Color(0xfff2cf) },
    uSunDir: { value: new THREE.Vector3(-0.42, 0.16, -0.89).normalize() }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uSunColor, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.62));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunColor * smoothstep(0.9988, 0.9995, s) * 2.6;
        c += uSunColor * pow(s, 22.0) * 0.6;
        c += uSunColor * pow(s, 3.0) * 0.16;
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 14), mat);
  dome.renderOrder = -10;
  return { dome, material: mat, uniforms };
}

/* ----------------------------------------------------------------- field */

/** Golden barley strokes over green, worn to stubble near the station. */
export function fieldTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(47);
  ctx.fillStyle = '#8a9142';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const g = rand();
    ctx.strokeStyle = g < 0.5
      ? `rgba(${180 + rand() * 50},${150 + rand() * 40},${60 + rand() * 30},0.5)`
      : `rgba(${95 + rand() * 40},${115 + rand() * 40},${40 + rand() * 25},0.55)`;
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 3 - rand() * 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  return tex;
}

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

/* ----------------------------------------------------------------- range */

const SHIRTS = [0xd23b4e, 0x3e6e9e, 0xc9982e, 0x8a4a8c, 0x4a8c8a];

export function buildRange() {
  const g = new THREE.Group();

  /* Ground */
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 240, 24, 24),
    new THREE.MeshLambertMaterial({ map: fieldTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  const gp = ground.geometry.attributes.position;
  const grand = mulberry(3);
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const y = gp.getY(i);
    const d = Math.hypot(x, y);
    if (d > 30) gp.setZ(i, Math.sin(x * 0.05) * 1.4 + Math.cos(y * 0.04) * 1.2 + grand() * 0.5);
  }
  ground.geometry.computeVertexNormals();
  g.add(ground);

  /* The sunken trap house, half buried ahead of the station */
  const trap = new THREE.Group();
  const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 2.2), lambert(0x4a5c46));
  bunker.position.y = 0.4;
  trap.add(bunker);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.14, 2.5), lambert(0x39473a));
  roof.position.y = 1.02;
  trap.add(roof);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0x101610 }));
  slot.position.set(0, 0.72, 1.16);
  trap.add(slot);
  trap.position.set(0, 0, -17);
  g.add(trap);

  /* Fence posts marching along the field edge */
  const postGeos = [];
  const rand = mulberry(11);
  for (let i = 0; i < 24; i++) {
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.1, 5);
    const x = -46 + i * 4;
    post.translate(x, 0.55, -26 - Math.sin(i * 0.4) * 3);
    postGeos.push(post.toNonIndexed());
  }
  g.add(new THREE.Mesh(mergeGeos(postGeos), lambert(0x6b5136)));

  /* The red barn with vita knutar, off left */
  const barn = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), lambert(0x8f2d26));
  body.position.y = 2.5;
  barn.add(body);
  const barnRoof = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 9.4, 3, 1), lambert(0x3c3f47));
  barnRoof.rotation.z = Math.PI / 2;
  barnRoof.rotation.y = Math.PI / 6;
  barnRoof.scale.set(1, 1, 0.55);
  barnRoof.position.y = 5.9;
  barn.add(barnRoof);
  [[-4.55, 0], [4.55, 0]].forEach(([x]) => {
    const knut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), lambert(0xf0ede4));
    knut.position.set(x, 2.5, 2.8);
    barn.add(knut);
    const knut2 = knut.clone();
    knut2.position.z = -2.8;
    barn.add(knut2);
  });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), lambert(0xf0ede4));
  door.position.set(0, 1.7, 3.02);
  barn.add(door);
  const doorX = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3), lambert(0x7a241e));
  doorX.position.set(0, 1.7, 3.03);
  barn.add(doorX);
  barn.position.set(-34, 0, -48);
  barn.rotation.y = 0.5;
  g.add(barn);

  /* Two ranks of spruce forest closing the horizon */
  const ridge = (z, color, hScale, count, spread) => {
    const parts = [];
    for (let i = 0; i < count; i++) {
      const h = (2 + rand() * 3.4) * hScale;
      const w = (0.8 + rand() * 0.6) * hScale;
      const tree = new THREE.ConeGeometry(w, h, 5);
      tree.translate(-spread / 2 + (i / count) * spread + rand() * 4, h / 2, z + rand() * 8);
      parts.push(tree.toNonIndexed());
    }
    const m = new THREE.Mesh(mergeGeos(parts), new THREE.MeshBasicMaterial({ color, fog: false }));
    m.renderOrder = -8;
    return m;
  };
  g.add(ridge(-150, 0x5b7085, 3.0, 46, 420));
  g.add(ridge(-105, 0x24402e, 1.8, 56, 340));

  /* Clouds */
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffeed8, fog: false, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 6; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 5 + rand() * 8;
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat);
      puff.position.set(k * s * 1.05 - n * 3, rand() * s * 0.35, rand() * 4);
      puff.scale.y = 0.4;
      cloud.add(puff);
    }
    cloud.position.set(-200 + rand() * 400, 70 + rand() * 50, -230 - rand() * 40);
    cloud.renderOrder = -9;
    g.add(cloud);
  }

  /* The station: rubber mat and a low rail */
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, 1.6), lambert(0x33383c));
  mat.position.set(0, 0.02, 0);
  g.add(mat);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.08), lambert(0x6b5136));
  rail.position.set(0, 0.85, -1.1);
  g.add(rail);
  [-1.1, 1.1].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.85, 5), lambert(0x5a422c));
    leg.position.set(x, 0.42, -1.1);
    g.add(leg);
  });

  /* The gang on folding chairs behind the station */
  const crowd = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), lambert(0xd8d4c8));
    chair.position.y = 0.5;
    p.add(chair);
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([cx, cz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), lambert(0x8a9096));
      leg.position.set(cx, 0.25, cz);
      p.add(leg);
    });
    const body2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.6, 6), lambert(SHIRTS[i % SHIRTS.length]));
    body2.position.y = 0.85;
    p.add(body2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), lambert(0xdba97f));
    head.position.y = 1.32;
    p.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.09, 7), lambert(0x2c4a72));
    cap.position.y = 1.44;
    p.add(cap);
    const arms = new THREE.Group();
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.4, 5), body2.material);
      arm.position.set(s * 0.2, 0, 0);
      arm.rotation.z = s * 2.4;
      arms.add(arm);
    });
    arms.position.y = 1.05;
    p.add(arms);
    // Kaffekopp in one hand
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 6), lambert(0xf0ede4));
    cup.position.set(0.3, 0.95, 0.1);
    p.add(cup);
    p.position.set(-2.4 + i * 1.2, 0, 2.4 + (rand() - 0.5) * 0.5);
    p.rotation.y = Math.PI + (rand() - 0.5) * 0.3;
    p.userData.arms = arms;
    p.userData.phase = rand() * 6.28;
    g.add(p);
    crowd.push(p);
  }

  /* Birds crossing the sky now and then — two dark blades each */
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x22262c, side: THREE.DoubleSide, fog: false });
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const bird = new THREE.Group();
    [-1, 1].forEach((s) => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), birdMat);
      wing.position.x = s * 0.42;
      bird.add(wing);
    });
    bird.position.set(-80 + rand() * 40, 22 + rand() * 14, -60 - rand() * 30);
    bird.userData = { speed: 3 + rand() * 3, phase: rand() * 6.28 };
    g.add(bird);
    birds.push(bird);
  }

  return { group: g, crowd, birds, trap };
}

/* ----------------------------------------------------------------- gun */

/** Over-under shotgun as seen from the shoulder, pivoted for aiming. */
export function buildShotgun(glow) {
  const g = new THREE.Group();

  const steel = lambert(0x2e3238);
  const walnut = lambert(0x5c3a22);

  // Two stacked barrels
  [0.035, -0.035].forEach((y) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.15, 8), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, y, -0.68);
    g.add(barrel);
  });
  // Rib and bead
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.01, 1.1), steel);
  rib.position.set(0, 0.075, -0.66);
  g.add(rib);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffe9b0 }));
  bead.position.set(0, 0.085, -1.2);
  g.add(bead);
  // Fore-end and stock
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.34, 7), walnut);
  fore.rotation.x = Math.PI / 2;
  fore.position.set(0, -0.045, -0.42);
  g.add(fore);
  const action = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.12, 0.22), steel);
  action.position.set(0, 0, -0.06);
  g.add(action);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.4), walnut);
  stock.position.set(0.012, -0.05, 0.22);
  stock.rotation.x = -0.14;
  g.add(stock);

  /* Muzzle flash sprite, flipped on for a couple of frames */
  const flashMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xffdf9a,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const flash = new THREE.Sprite(flashMat);
  flash.position.set(0, 0.02, -1.32);
  flash.scale.setScalar(0.55);
  g.add(flash);

  /* Smoke puffs */
  const smokeMat = new THREE.SpriteMaterial({
    map: glow,
    color: 0xd8d4cc,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.position.set(0, 0.05, -1.28);
  smoke.scale.setScalar(0.3);
  g.add(smoke);

  return { group: g, flashMat, smokeMat, smoke };
}

/* ----------------------------------------------------------------- clays */

const CLAY_ORANGE = 0xff6a1c;

/** One clay: a shallow dome with a darker rim — plus its six shards. */
export function buildClay() {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: CLAY_ORANGE, emissive: 0x511a00 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.6), mat);
  dome.scale.y = 0.5;
  group.add(dome);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.32, 0.09, 12), mat);
  rim.position.y = -0.02;
  group.add(rim);

  /* Shards: six wedges parked far away until the break */
  const shards = [];
  const shardMat = new THREE.MeshLambertMaterial({ color: CLAY_ORANGE, emissive: 0x511a00, side: THREE.DoubleSide });
  const inner = new THREE.MeshLambertMaterial({ color: 0x1c1410, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const wedge = new THREE.Group();
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    const geo = new THREE.BufferGeometry();
    const r = 0.34;
    const verts = new Float32Array([
      0, 0.02, 0,
      Math.cos(a0) * r, 0, Math.sin(a0) * r,
      Math.cos(a1) * r, 0, Math.sin(a1) * r
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    wedge.add(new THREE.Mesh(geo, i % 2 ? shardMat : inner));
    wedge.visible = false;
    shards.push(wedge);
    group.add(wedge);
  }

  group.userData = { shards };
  return group;
}
