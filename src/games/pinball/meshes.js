/**
 * Builds the 3D table from the same layout the physics uses.
 *
 * Playfield (x, y) maps to world (x, height, -y): the table lies in the XZ
 * plane with +Y up, so a 2D shape drawn in playfield coordinates can be
 * extruded upward and dropped straight in.
 */

import { L, mirrorX } from './table.js';

/** Extruding a shape drawn in playfield space lands it flat, height along +Y. */
function flatten(geo) {
  geo.rotateX(-Math.PI / 2);
  return geo;
}

/**
 * Capsule outline between two points — the silhouette of every wall and rail.
 */
function capsuleShape(THREE, ax, ay, bx, by, r) {
  const shape = new THREE.Shape();
  const ang = Math.atan2(by - ay, bx - ax);
  shape.absarc(ax, ay, r, ang + Math.PI / 2, ang - Math.PI / 2, true);
  shape.absarc(bx, by, r, ang - Math.PI / 2, ang + Math.PI / 2, true);
  shape.closePath();
  return shape;
}

/**
 * Flipper silhouette: two circles of different radii joined by their outer
 * tangents, pivot at the origin pointing along +x.
 */
function flipperShape(THREE, length, r0, r1) {
  const alpha = Math.asin((r0 - r1) / length);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r0, Math.PI / 2 + alpha, -Math.PI / 2 - alpha, true);
  shape.absarc(length, 0, r1, -Math.PI / 2 - alpha, Math.PI / 2 + alpha, true);
  shape.closePath();
  return shape;
}

/** The Pekkas Pokal trophy, turned on a lathe. */
export function trophyGeometry(THREE) {
  const profile = [
    [0, 0], [0.54, 0], [0.54, 0.08], [0.24, 0.14], [0.18, 0.38],
    [0.44, 0.46], [0.58, 0.86], [0.52, 0.9], [0.2, 0.66], [0, 0.62]
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  return new THREE.LatheGeometry(profile, 40);
}

/* -------------------------------------------------------------- materials */

export function createMaterials(THREE, playfieldTexture) {
  return {
    playfield: new THREE.MeshStandardMaterial({
      map: playfieldTexture,
      roughness: 0.5,
      metalness: 0.1,
      envMapIntensity: 0.3
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xdfe6ff,
      roughness: 0.16,
      metalness: 1,
      envMapIntensity: 1
    }),
    rail: new THREE.MeshStandardMaterial({
      color: 0x7c88a8,
      roughness: 0.3,
      metalness: 0.9,
      envMapIntensity: 0.5
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.26,
      metalness: 1,
      envMapIntensity: 0.55,
      emissive: 0x2a1e04,
      emissiveIntensity: 1
    }),
    goldGlow: new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.34,
      metalness: 0.55,
      envMapIntensity: 0.4,
      emissive: 0xf2c14e,
      emissiveIntensity: 0.95
    }),
    blueGlow: new THREE.MeshStandardMaterial({
      color: 0x7c8cf8,
      roughness: 0.34,
      metalness: 0.45,
      envMapIntensity: 0.4,
      emissive: 0x7c8cf8,
      emissiveIntensity: 0.8
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x10152a,
      roughness: 0.8,
      metalness: 0.1,
      envMapIntensity: 0.25
    }),
    targetUp: new THREE.MeshStandardMaterial({
      color: 0xf26d8d,
      roughness: 0.4,
      metalness: 0.35,
      envMapIntensity: 0.35,
      emissive: 0xf26d8d,
      emissiveIntensity: 0.6
    }),
    targetDown: new THREE.MeshStandardMaterial({
      color: 0x3a4265,
      roughness: 0.6,
      metalness: 0.3,
      emissive: 0x000000
    })
  };
}

/* ------------------------------------------------------------------ builder */

export function buildTable(THREE, mergeGeometries, materials) {
  const group = new THREE.Group();
  const refs = { bumpers: [], targets: [], flippers: {}, lights: [] };

  /* ---- Playfield ---- */
  const artW = L.outerX * 2 + 1.2;
  const artH = 44;
  // No extra spin: the plane's +y becomes world -z, which is up-table, so the
  // canvas lands the right way up with the title at the top of the playfield.
  const playfield = new THREE.Mesh(
    flatten(new THREE.PlaneGeometry(artW, artH, 1, 1)),
    materials.playfield
  );
  // PlaneGeometry is centred; ART spans y -2..42 → centre 20
  playfield.position.set(0, 0, -20);
  playfield.receiveShadow = true;
  group.add(playfield);

  /* ---- Walls ---- */
  const wallShapes = [];
  const pushChain = (pts, r = 0.3) => {
    for (let i = 0; i < pts.length - 1; i++) {
      wallShapes.push(capsuleShape(THREE, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r));
    }
  };
  const pushArc = (cx, cy, radius, from, to, steps, r = 0.3) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
    }
    pushChain(pts, r);
  };

  const D = Math.PI / 180;
  pushChain(L.leftWall);
  pushChain(L.rightWall);
  pushChain([[L.laneX, L.laneBottomY], [L.laneX, L.domeY]]);
  pushChain([[L.outerX, L.laneBottomY], [L.outerX, L.domeY]]);
  pushChain([[L.laneX, L.laneBottomY], [L.outerX, L.laneBottomY]]);
  pushArc(0, L.domeY, L.domeOuterR, 0, 180 * D, 34);
  pushArc(0, L.domeY, L.domeInnerR, 0, 130 * D, 22);
  pushChain(L.leftGuide);
  pushChain(L.rightGuide);

  const wallGeos = wallShapes.map((s) =>
    flatten(new THREE.ExtrudeGeometry(s, { depth: L.wallH, bevelEnabled: false }))
  );
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), materials.rail);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  /* ---- Slingshots (glowing rubber faces) ---- */
  [L.leftSling, L.rightSling].forEach((s) => {
    const geo = flatten(
      new THREE.ExtrudeGeometry(capsuleShape(THREE, s[0][0], s[0][1], s[1][0], s[1][1], 0.32), {
        depth: L.wallH,
        bevelEnabled: false
      })
    );
    const mesh = new THREE.Mesh(geo, materials.blueGlow);
    mesh.castShadow = true;
    group.add(mesh);
    refs[s === L.leftSling ? 'leftSling' : 'rightSling'] = mesh;
  });

  /* ---- Posts ---- */
  L.posts.forEach((p) => {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(p.r, p.r, L.wallH, 16),
      materials.gold
    );
    post.position.set(p.x, L.wallH / 2, -p.y);
    post.castShadow = true;
    group.add(post);
  });

  /* ---- Pop bumpers ---- */
  const trophyGeo = trophyGeometry(THREE);
  L.bumpers.forEach((b) => {
    const g = new THREE.Group();
    g.position.set(b.x, 0, -b.y);

    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(L.bumperR, L.bumperR * 1.05, 0.5, 28),
      materials.rubber
    );
    skirt.position.y = 0.25;
    skirt.castShadow = true;
    g.add(skirt);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(L.bumperR * 0.92, 0.15, 12, 32),
      materials.goldGlow
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.56;
    g.add(ring);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(L.bumperR * 0.72, L.bumperR * 0.86, 0.34, 24),
      materials.gold
    );
    cap.position.y = 0.78;
    cap.castShadow = true;
    g.add(cap);

    const trophy = new THREE.Mesh(trophyGeo, materials.goldGlow);
    trophy.scale.setScalar(0.78);
    trophy.position.y = 0.95;
    g.add(trophy);

    const light = new THREE.PointLight(0xf2c14e, 0, 7, 2);
    light.position.y = 1.6;
    g.add(light);

    group.add(g);
    refs.bumpers.push({ group: g, ring, trophy, light, base: 0 });
  });

  /* ---- Drop targets ---- */
  L.targets.forEach((t) => {
    const g = new THREE.Group();
    g.position.set(t.x, 0, -t.y);
    const face = new THREE.Mesh(
      new THREE.BoxGeometry(t.half * 2, 1.15, 0.42),
      materials.targetUp.clone()
    );
    face.position.y = 0.58;
    face.castShadow = true;
    g.add(face);
    group.add(g);
    refs.targets.push({ group: g, face, down: false });
  });

  /* ---- Jackpot trophy ---- */
  {
    const g = new THREE.Group();
    g.position.set(L.jackpot.x, 0, -L.jackpot.y);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(L.jackpot.r, L.jackpot.r * 1.1, 0.42, 26),
      materials.rubber
    );
    base.position.y = 0.21;
    g.add(base);

    const trophy = new THREE.Mesh(trophyGeo, materials.goldGlow);
    trophy.scale.setScalar(1.5);
    trophy.position.y = 0.4;
    trophy.castShadow = true;
    g.add(trophy);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(L.jackpot.r * 1.25, 0.08, 10, 34),
      materials.goldGlow
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.12;
    g.add(halo);

    const light = new THREE.PointLight(0xf2c14e, 1.6, 12, 2);
    light.position.y = 2.2;
    g.add(light);

    group.add(g);
    refs.jackpot = { group: g, trophy, halo, light };
  }

  /* ---- Flippers ---- */
  const flipperGeo = flatten(
    new THREE.ExtrudeGeometry(flipperShape(THREE, L.flipperLength, 0.4, 0.28), {
      depth: 0.85,
      bevelEnabled: false
    })
  );
  const buildFlipper = (px, py) => {
    const g = new THREE.Group();
    g.position.set(px, 0.06, -py);
    const body = new THREE.Mesh(flipperGeo, materials.gold);
    body.castShadow = true;
    g.add(body);
    // Rubber strip along the face
    const strip = new THREE.Mesh(
      flatten(
        new THREE.ExtrudeGeometry(flipperShape(THREE, L.flipperLength, 0.43, 0.31), {
          depth: 0.3,
          bevelEnabled: false
        })
      ),
      materials.rubber
    );
    strip.position.y = 0.3;
    g.add(strip);
    group.add(g);
    return g;
  };
  refs.flippers.left = buildFlipper(L.centerX - L.flipperSpread, L.flipperY);
  refs.flippers.right = buildFlipper(L.centerX + L.flipperSpread, L.flipperY);

  /* ---- Ball ---- */
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(L.ballRadius, 40, 28),
    materials.chrome
  );
  ball.castShadow = true;
  group.add(ball);
  refs.ball = ball;

  /* ---- Plunger ---- */
  {
    const plunger = new THREE.Group();
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 2.4, 16),
      materials.chrome
    );
    rod.rotation.x = Math.PI / 2;
    plunger.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), materials.goldGlow);
    knob.position.z = 1.5;
    plunger.add(knob);
    plunger.position.set(L.laneBallX, 0.55, -L.laneBottomY + 0.6);
    group.add(plunger);
    refs.plunger = plunger;
  }

  return { group, refs };
}

export { mirrorX };
