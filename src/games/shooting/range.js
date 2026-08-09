/**
 * Pekkas Lerduvor — the Arnäsvall range.
 *
 * A Norrland field in August evening light, procedural top to bottom.
 * The look leans on three things the literature keeps repeating about
 * outdoor scenes:
 *
 *  - AERIAL PERSPECTIVE. Distance is sold by making far things paler,
 *    bluer and less detailed, not by drawing more of them. The fog is a
 *    desaturated blue-grey that the sky dome fades into at the horizon,
 *    and the far rank of spruce is pre-tinted toward it on top of that.
 *  - GROUNDED LIGHT. One shadow-casting sun with a tight orthographic
 *    frustum around the station. Contact shadows under the trap house,
 *    the crowd and the boulders are what stop everything looking like
 *    stickers on a backdrop.
 *  - SCATTER. Grass (see grass.js), plus bushes, boulders, wildflowers
 *    and a fence in the middle distance, so the eye has something to
 *    travel across between the muzzle and the treeline.
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

/** The haze everything distant fades into — sky, fog and forest share it. */
export const HAZE = 0xb9c6cc;

/* ---------------------------------------------------------------- helpers */

/** Merge non-indexed geometries, carrying per-vertex colour. */
function mergeColored(list) {
  let total = 0;
  list.forEach((g) => {
    total += g.attributes.position.count;
  });
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  let o = 0;
  list.forEach((g) => {
    const P = g.attributes.position;
    pos.set(P.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    o += P.count;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeVertexNormals();
  return out;
}

/** Paint a geometry a flat colour, optionally darkened toward its base. */
function paint(geo, color, baseDarken = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const P = g.attributes.position;
  const col = new Float32Array(P.count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < P.count; i++) {
    minY = Math.min(minY, P.getY(i));
    maxY = Math.max(maxY, P.getY(i));
  }
  const span = Math.max(0.001, maxY - minY);
  const c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const k = (P.getY(i) - minY) / span;
    c.copy(color).multiplyScalar(1 - baseDarken * (1 - k));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/* ------------------------------------------------------------------- sky */

export function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x2a5f9e) },
    uHorizon: { value: new THREE.Color(0xf6c294) },
    uHaze: { value: new THREE.Color(HAZE) },
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
      uniform vec3 uZenith, uHorizon, uHaze, uSunColor, uSunDir;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.62));
        // A haze band hugging the horizon so the fogged distance and the
        // sky meet without a seam — this is the aerial perspective join.
        c = mix(c, uHaze, smoothstep(0.10, 0.0, h) * 0.7);
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        c += uSunColor * smoothstep(0.9988, 0.9995, s) * 2.6;
        c += uSunColor * pow(s, 22.0) * 0.6;
        c += uSunColor * pow(s, 5.0) * 0.10;
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

/** Stubble and soil under the grass — it only shows between blades. */
export function fieldTexture() {
  const size = 512;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const rand = mulberry(47);
  ctx.fillStyle = '#8b9a4c';
  ctx.fillRect(0, 0, size, size);
  // Broad tonal patches so the ground is never one flat colour
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(
      rand() * size, rand() * size, 4,
      rand() * size, rand() * size, 60 + rand() * 110
    );
    g.addColorStop(0, rand() < 0.5 ? 'rgba(186,170,86,0.32)' : 'rgba(82,100,44,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  for (let i = 0; i < 3200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    ctx.strokeStyle = rand() < 0.45
      ? `rgba(${170 + rand() * 50},${146 + rand() * 40},${62 + rand() * 30},0.45)`
      : `rgba(${74 + rand() * 40},${94 + rand() * 40},${34 + rand() * 25},0.5)`;
    ctx.lineWidth = 1 + rand();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 5);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  // Ground seen at a grazing angle is exactly the case mipmaps smear into
  // mush; anisotropy is the one-line fix and costs nothing noticeable.
  tex.anisotropy = 8;
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

/* ------------------------------------------------------------------ trees */

/**
 * A rank of spruce as one merged, lit, vertex-coloured mesh. Trunks on the
 * near rank only; the far rank is pre-tinted toward the haze so it sits
 * behind the near one even before the fog gets to it.
 */
function spruceRank(rand, z, count, spread, opts) {
  const parts = [];
  const base = new THREE.Color(opts.color);
  const haze = new THREE.Color(HAZE);
  for (let i = 0; i < count; i++) {
    const h = (2.4 + rand() * 4.2) * opts.scale;
    const w = (0.75 + rand() * 0.55) * opts.scale;
    const x = -spread / 2 + (i / count) * spread + (rand() - 0.5) * (spread / count) * 2.2;
    const zz = z + (rand() - 0.5) * opts.depth;

    const tint = base.clone();
    tint.offsetHSL((rand() - 0.5) * 0.03, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12);
    tint.lerp(haze, opts.haze);

    // Two stacked cones give a spruce its stepped silhouette
    const lower = new THREE.ConeGeometry(w, h * 0.7, 5);
    lower.translate(x, h * 0.35 + opts.lift, zz);
    parts.push(paint(lower.toNonIndexed(), tint, 0.35));

    const upper = new THREE.ConeGeometry(w * 0.62, h * 0.55, 5);
    upper.translate(x, h * 0.72 + opts.lift, zz);
    parts.push(paint(upper.toNonIndexed(), tint.clone().multiplyScalar(1.1), 0.25));

    if (opts.trunks) {
      const trunk = new THREE.CylinderGeometry(w * 0.1, w * 0.14, h * 0.34, 4);
      trunk.translate(x, h * 0.17 + opts.lift, zz);
      parts.push(paint(trunk.toNonIndexed(), new THREE.Color(0x4a3826).lerp(haze, opts.haze), 0.3));
    }
  }
  const mesh = new THREE.Mesh(
    mergeColored(parts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  mesh.renderOrder = -6;
  return mesh;
}

/* ----------------------------------------------------------------- range */

const SHIRTS = [0xd23b4e, 0x3e6e9e, 0xc9982e, 0x8a4a8c, 0x4a8c8a];

export function buildRange(rand) {
  const g = new THREE.Group();

  /* ---- Ground ---- */
  const ground = new THREE.Mesh(
    // 40 segments over 300 m means 7.5 m triangles. Seen at the grazing
    // angle you get standing on them, depth interpolation across a
    // triangle that large is so coarse the plane wins the depth test
    // against 30 cm grass blades and swallows the whole near field.
    new THREE.PlaneGeometry(300, 300, 150, 150),
    new THREE.MeshLambertMaterial({ map: fieldTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  const gp = ground.geometry.attributes.position;
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i);
    const y = gp.getY(i);
    const d = Math.hypot(x, y);
    if (d > 26) {
      const roll = Math.sin(x * 0.045) * 1.5 + Math.cos(y * 0.038) * 1.3;
      gp.setZ(i, roll * Math.min(1, (d - 26) / 30));
    }
  }
  ground.geometry.computeVertexNormals();
  g.add(ground);

  /* Worn dirt apron around the station — where boots killed the grass */
  const apron = new THREE.Mesh(
    new THREE.CircleGeometry(1.7, 20),
    new THREE.MeshLambertMaterial({ color: 0x9c8757 })
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.008;
  apron.receiveShadow = true;
  g.add(apron);

  /* ---- Trap house ---- */
  const trap = new THREE.Group();
  const bunker = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.2, 2.4), lambert(0x55684e));
  bunker.position.y = 0.45;
  bunker.castShadow = true;
  bunker.receiveShadow = true;
  trap.add(bunker);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 2.7), lambert(0x3d4b3d));
  roof.position.y = 1.13;
  roof.castShadow = true;
  trap.add(roof);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.34, 0.1),
    new THREE.MeshBasicMaterial({ color: 0x0c110c }));
  slot.position.set(0, 0.78, 1.26);
  trap.add(slot);
  [-1.2, -0.4, 0.4, 1.2].forEach((x) => {
    const bag = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 4), lambert(0x9a8a63));
    bag.scale.set(1.25, 0.7, 0.85);
    bag.position.set(x, 0.16, 1.35);
    bag.castShadow = true;
    trap.add(bag);
  });
  trap.position.set(0, 0, -17);
  g.add(trap);

  /* ---- Scatter: boulders, bushes, wildflowers ---- */
  const rockParts = [];
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 34;
    const s = 0.3 + rand() * 0.85;
    const rock = new THREE.DodecahedronGeometry(s, 0);
    rock.scale(1, 0.6 + rand() * 0.35, 1);
    rock.rotateY(rand() * 3);
    rock.translate(Math.cos(a) * r, s * 0.34, Math.sin(a) * r - 6);
    const tint = new THREE.Color(0x8c8f88).offsetHSL(0, 0, (rand() - 0.5) * 0.16);
    rockParts.push(paint(rock.toNonIndexed(), tint, 0.3));
  }
  const rocks = new THREE.Mesh(
    mergeColored(rockParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  g.add(rocks);

  const bushParts = [];
  for (let i = 0; i < 22; i++) {
    const a = rand() * Math.PI * 2;
    const r = 12 + rand() * 32;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r - 8;
    const clumps = 3 + Math.floor(rand() * 3);
    const tint = new THREE.Color(0x3f6330).offsetHSL((rand() - 0.5) * 0.04, 0, (rand() - 0.5) * 0.12);
    for (let k = 0; k < clumps; k++) {
      const s = 0.4 + rand() * 0.55;
      const p = new THREE.IcosahedronGeometry(s, 0);
      p.translate(bx + (rand() - 0.5) * 1.1, s * 0.75, bz + (rand() - 0.5) * 1.1);
      bushParts.push(paint(p.toNonIndexed(), tint, 0.4));
    }
  }
  const bushes = new THREE.Mesh(
    mergeColored(bushParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  bushes.castShadow = true;
  g.add(bushes);

  // Wildflowers: a stem and a head, merged flat. Pure decoration, near-free.
  const flowerParts = [];
  const FLOWER = [0xf2e9c8, 0xe8d24a, 0xd86a8a, 0xe8f0f4];
  for (let i = 0; i < 190; i++) {
    const a = rand() * Math.PI * 2;
    const r = 2.4 + rand() * 22;
    const fx = Math.cos(a) * r;
    const fz = Math.sin(a) * r;
    if (Math.abs(fx) < 1.4 && Math.abs(fz) < 1.8) continue;
    const h = 0.28 + rand() * 0.2;
    const stem = new THREE.CylinderGeometry(0.008, 0.012, h, 3);
    stem.translate(fx, h / 2, fz);
    flowerParts.push(paint(stem.toNonIndexed(), new THREE.Color(0x5c7434)));
    const head = new THREE.SphereGeometry(0.045 + rand() * 0.03, 5, 3);
    head.translate(fx, h, fz);
    flowerParts.push(paint(head.toNonIndexed(),
      new THREE.Color(FLOWER[Math.floor(rand() * FLOWER.length)])));
  }
  const flowers = new THREE.Mesh(
    mergeColored(flowerParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  g.add(flowers);

  /* ---- Fence: posts and two sagging wires ---- */
  const fenceParts = [];
  const postXs = [];
  for (let i = 0; i < 30; i++) {
    const x = -58 + i * 4;
    const z = -30 - Math.sin(i * 0.35) * 3.5;
    postXs.push([x, z]);
    const post = new THREE.CylinderGeometry(0.07, 0.09, 1.2, 5);
    post.rotateZ((rand() - 0.5) * 0.08);
    post.translate(x, 0.6, z);
    fenceParts.push(paint(post.toNonIndexed(), new THREE.Color(0x6b5136), 0.35));
  }
  const fence = new THREE.Mesh(
    mergeColored(fenceParts),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  );
  fence.castShadow = true;
  g.add(fence);
  [0.55, 0.95].forEach((wy) => {
    const pts = postXs.map(([x, z], i) => new THREE.Vector3(
      x, wy - Math.sin(i * 1.7) * 0.04 - 0.03, z
    ));
    g.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6a6f6a, transparent: true, opacity: 0.7 })
    ));
  });

  /* ---- The red barn with vita knutar ---- */
  const barn = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 6), lambert(0x8f2d26));
  body.position.y = 2.5;
  body.castShadow = true;
  barn.add(body);
  const barnRoof = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 9.4, 3, 1), lambert(0x3c3f47));
  barnRoof.rotation.z = Math.PI / 2;
  barnRoof.rotation.y = Math.PI / 6;
  barnRoof.scale.set(1, 1, 0.55);
  barnRoof.position.y = 5.9;
  barnRoof.castShadow = true;
  barn.add(barnRoof);
  [-4.55, 4.55].forEach((x) => {
    [2.8, -2.8].forEach((z) => {
      const knut = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 0.5), lambert(0xf0ede4));
      knut.position.set(x, 2.5, z);
      barn.add(knut);
    });
  });
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4), lambert(0xf0ede4));
  door.position.set(0, 1.7, 3.02);
  barn.add(door);
  const doorX = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3), lambert(0x7a241e));
  doorX.position.set(0, 1.7, 3.03);
  barn.add(doorX);
  barn.position.set(-38, 0, -52);
  barn.rotation.y = 0.5;
  g.add(barn);

  /* ---- Forest: two ranks, the far one hazed for aerial perspective ---- */
  g.add(spruceRank(rand, -155, 44, 460, {
    color: 0x2c4a3a, scale: 3.0, depth: 22, haze: 0.62, trunks: false, lift: -1.5
  }));
  g.add(spruceRank(rand, -108, 52, 350, {
    color: 0x27452e, scale: 2.0, depth: 16, haze: 0.24, trunks: true, lift: -0.6
  }));

  /* ---- Clouds ---- */
  const cloudMat = new THREE.MeshBasicMaterial({
    color: 0xffeedb, fog: false, transparent: true, opacity: 0.5
  });
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Group();
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const s = 6 + rand() * 9;
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), cloudMat);
      p.position.set(k * s * 1.05 - n * 3, rand() * s * 0.35, rand() * 4);
      p.scale.y = 0.38;
      cloud.add(p);
    }
    cloud.position.set(-220 + rand() * 440, 62 + rand() * 55, -230 - rand() * 40);
    cloud.renderOrder = -9;
    g.add(cloud);
  }

  /* ---- The station ---- */
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 1.7), lambert(0x2e3338));
  mat.position.set(0, 0.025, 0);
  mat.receiveShadow = true;
  g.add(mat);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.09, 0.09), lambert(0x6b5136));
  rail.position.set(0, 0.88, -1.15);
  rail.castShadow = true;
  g.add(rail);
  [-1.15, 1.15].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.88, 5), lambert(0x5a422c));
    leg.position.set(x, 0.44, -1.15);
    leg.castShadow = true;
    g.add(leg);
  });
  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.3), lambert(0x7a5a34));
  crate.position.set(-1.25, 0.15, 0.5);
  crate.rotation.y = 0.3;
  crate.castShadow = true;
  g.add(crate);

  /* ---- The gang on folding chairs ---- */
  const crowd = [];
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Group();
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), lambert(0xd8d4c8));
    chair.position.y = 0.5;
    chair.castShadow = true;
    p.add(chair);
    [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]].forEach(([cx, cz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4), lambert(0x8a9096));
      leg.position.set(cx, 0.25, cz);
      p.add(leg);
    });
    const body2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.6, 6),
      lambert(SHIRTS[i % SHIRTS.length]));
    body2.position.y = 0.85;
    body2.castShadow = true;
    p.add(body2);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 5), lambert(0xdba97f));
    head.position.y = 1.32;
    head.castShadow = true;
    p.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.17, 0.09, 7), lambert(0x2c4a72));
    cap.position.y = 1.44;
    p.add(cap);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.2), lambert(0x24406a));
    brim.position.set(0, 1.42, -0.17);
    p.add(brim);
    const arms = new THREE.Group();
    [-1, 1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.4, 5), body2.material);
      arm.position.set(s * 0.2, 0, 0);
      arm.rotation.z = s * 2.4;
      arms.add(arm);
    });
    arms.position.y = 1.05;
    p.add(arms);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.09, 6), lambert(0xf0ede4));
    cup.position.set(0.3, 0.95, 0.1);
    p.add(cup);
    p.position.set(-2.5 + i * 1.25, 0, 2.5 + (rand() - 0.5) * 0.5);
    p.rotation.y = Math.PI + (rand() - 0.5) * 0.3;
    p.userData.arms = arms;
    p.userData.phase = rand() * 6.28;
    g.add(p);
    crowd.push(p);
  }

  /* ---- Birds crossing the sky ---- */
  const birdMat = new THREE.MeshBasicMaterial({
    color: 0x2b3038, side: THREE.DoubleSide, fog: false
  });
  const birds = [];
  for (let i = 0; i < 5; i++) {
    const bird = new THREE.Group();
    [-1, 1].forEach((s) => {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), birdMat);
      wing.position.x = s * 0.42;
      bird.add(wing);
    });
    bird.position.set(-90 + rand() * 50, 24 + rand() * 16, -70 - rand() * 40);
    bird.userData = { speed: 3 + rand() * 3, phase: rand() * 6.28 };
    g.add(bird);
    birds.push(bird);
  }

  return { group: g, crowd, birds, trap };
}

/* ------------------------------------------------------------------- gun */

/** Over-under shotgun seen from the shoulder. */
export function buildShotgun(glow) {
  const g = new THREE.Group();

  // Blued steel with a touch of specular so it catches the low sun
  const steel = new THREE.MeshPhongMaterial({ color: 0x3a424c, shininess: 70, specular: 0xa8b4c4, emissive: 0x141920 });
  const receiver = new THREE.MeshPhongMaterial({ color: 0x8892a0, shininess: 90, specular: 0xdce4ee, emissive: 0x1a1f26 });
  const walnut = new THREE.MeshPhongMaterial({ color: 0x8a5230, shininess: 30, specular: 0x6a4a30, emissive: 0x1e1008 });

  [0.035, -0.035].forEach((y) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 1.15, 10), steel);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, y, -0.68);
    g.add(barrel);
  });
  // Ventilated rib with its posts
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.012, 1.1), steel);
  rib.position.set(0, 0.077, -0.66);
  g.add(rib);
  for (let i = 0; i < 7; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.026, 0.02), steel);
    p.position.set(0, 0.058, -0.24 - i * 0.14);
    g.add(p);
  }
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff0b8 }));
  bead.position.set(0, 0.09, -1.2);
  g.add(bead);

  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.36, 9), walnut);
  fore.rotation.x = Math.PI / 2;
  fore.position.set(0, -0.048, -0.42);
  g.add(fore);
  const action = new THREE.Mesh(new THREE.BoxGeometry(0.078, 0.125, 0.24), receiver);
  action.position.set(0, 0, -0.06);
  g.add(action);
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.008, 4, 10, Math.PI), receiver);
  guard.rotation.set(Math.PI / 2, 0, 0);
  guard.position.set(0, -0.075, 0.02);
  g.add(guard);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.115, 0.42), walnut);
  stock.position.set(0.012, -0.052, 0.23);
  stock.rotation.x = -0.14;
  g.add(stock);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.076, 0.07, 0.12),
    new THREE.MeshPhongMaterial({ color: 0x53301a, shininess: 8 }));
  grip.position.set(0.008, -0.062, 0.1);
  g.add(grip);

  const flashMat = new THREE.SpriteMaterial({
    map: glow, color: 0xffdf9a, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const flash = new THREE.Sprite(flashMat);
  flash.position.set(0, 0.02, -1.32);
  flash.scale.setScalar(0.55);
  g.add(flash);

  const smokeMat = new THREE.SpriteMaterial({
    map: glow, color: 0xd8d4cc, transparent: true, opacity: 0, depthWrite: false
  });
  const smoke = new THREE.Sprite(smokeMat);
  smoke.position.set(0, 0.05, -1.28);
  smoke.scale.setScalar(0.3);
  g.add(smoke);

  return { group: g, flashMat, smokeMat, smoke };
}

/* ----------------------------------------------------------------- clays */

/**
 * A clay: shallow dome with a darker rim, and six shards for the break.
 * The emissive keeps it readable when it crosses the dark treeline.
 */
export function buildClay() {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6),
    new THREE.MeshLambertMaterial({ color: 0xff6a1c, emissive: 0x6b2400 })
  );
  dome.scale.y = 0.5;
  group.add(dome);
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.37, 0.32, 0.1, 14),
    new THREE.MeshLambertMaterial({ color: 0xd8480c, emissive: 0x4a1800 })
  );
  rim.position.y = -0.02;
  group.add(rim);

  const shards = [];
  const shardMat = new THREE.MeshLambertMaterial({
    color: 0xff6a1c, emissive: 0x511a00, side: THREE.DoubleSide
  });
  const inner = new THREE.MeshLambertMaterial({ color: 0x2a1c12, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const wedge = new THREE.Group();
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = ((i + 1) / 6) * Math.PI * 2;
    const geo = new THREE.BufferGeometry();
    const r = 0.34;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0.02, 0,
      Math.cos(a0) * r, 0, Math.sin(a0) * r,
      Math.cos(a1) * r, 0, Math.sin(a1) * r
    ]), 3));
    geo.computeVertexNormals();
    wedge.add(new THREE.Mesh(geo, i % 2 ? shardMat : inner));
    wedge.visible = false;
    shards.push(wedge);
    group.add(wedge);
  }

  group.userData = { shards };
  return group;
}
