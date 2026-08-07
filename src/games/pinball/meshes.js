/**
 * Builds the 3D table from the same layout the physics uses.
 *
 * Playfield (x, y) maps to world (x, height, -y): the table lies in the XZ
 * plane with +Y up, so a 2D shape drawn in playfield coordinates can be
 * extruded upward and dropped straight in.
 */

import { L, ART, mirrorX } from './table.js';

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

/**
 * A full trophy: cup, handles and plinth. Handles are what make it read as a
 * pokal rather than a vase at a glance.
 */
export function buildTrophy(THREE, material, scale = 1) {
  const g = new THREE.Group();

  const cup = new THREE.Mesh(trophyGeometry(THREE), material);
  cup.castShadow = true;
  g.add(cup);

  // A torus already lies in XY, which is the plane a trophy handle sits in.
  // Each arc spans 1.3π, rotated so its opening faces the cup.
  const handleGeo = new THREE.TorusGeometry(0.3, 0.07, 10, 24, Math.PI * 1.3);
  [-1, 1].forEach((side) => {
    const handle = new THREE.Mesh(handleGeo, material);
    handle.position.set(side * 0.52, 0.64, 0);
    handle.rotation.z = side > 0 ? -Math.PI * 0.65 : Math.PI * 0.35;
    handle.castShadow = true;
    g.add(handle);
  });

  g.scale.setScalar(scale);
  return g;
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
    stone: new THREE.MeshStandardMaterial({
      color: 0x8b93ad,
      roughness: 0.82,
      metalness: 0.12,
      envMapIntensity: 0.25
    }),
    stoneDark: new THREE.MeshStandardMaterial({
      color: 0x5c6480,
      roughness: 0.85,
      metalness: 0.1,
      envMapIntensity: 0.2
    }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x8a5a2b,
      roughness: 0.7,
      metalness: 0.05,
      envMapIntensity: 0.2
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
    troll: new THREE.MeshStandardMaterial({
      color: 0x6f9b5a,
      roughness: 0.72,
      metalness: 0.08,
      envMapIntensity: 0.3
    }),
    trollEye: new THREE.MeshStandardMaterial({
      color: 0xffd166,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0xffb703,
      emissiveIntensity: 1.4
    }),
    insert: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.1,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.92
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

/* ------------------------------------------------------------------- ramps */

/** World-space curve for a ramp path ([x, y, h] playfield triples). */
export function rampCurve(THREE, path) {
  return new THREE.CatmullRomCurve3(
    path.map(([x, y, h]) => new THREE.Vector3(x, h, -y)),
    false,
    'catmullrom',
    0.35
  );
}

/**
 * A wireform habitrail: two chrome tubes riding either side of the curve,
 * with periodic U-shaped cross ties. The Medieval Madness look.
 */
function buildWireform(THREE, curve, materials) {
  const g = new THREE.Group();
  const railR = 0.07;
  const halfGap = 0.34;

  // Offset each rail horizontally, perpendicular to the path direction
  [-1, 1].forEach((side) => {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const p = curve.getPointAt(t);
      const tan = curve.getTangentAt(t);
      const perp = new THREE.Vector3(-tan.z, 0, tan.x);
      const l = perp.length() || 1;
      pts.push(p.clone().addScaledVector(perp.multiplyScalar(1 / l), side * halfGap));
    }
    const railCurve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(railCurve, 90, railR, 7, false), materials.chrome);
    g.add(tube);
  });

  // Cross ties: shallow U-loops under the ball path
  for (let i = 1; i < 12; i++) {
    const t = i / 12;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(halfGap, 0.045, 6, 14, Math.PI),
      materials.rail
    );
    tie.position.copy(p).y -= 0.06;
    tie.rotation.z = Math.PI; // open side up
    tie.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
    g.add(tie);
  }
  return g;
}

/* ------------------------------------------------------------------ castle */

/**
 * The castle: two round towers with golden cone roofs, a crenellated gate
 * house, a drawbridge that lowers when the gate opens, and pennant flags.
 */
function buildCastle(THREE, materials) {
  const g = new THREE.Group();
  const refs = {};
  const towerH = 3.0;

  L.castle.towers.forEach((t) => {
    const tower = new THREE.Mesh(
      new THREE.CylinderGeometry(t.r + 0.12, t.r + 0.22, towerH, 18),
      materials.stone
    );
    tower.position.set(t.x, towerH / 2, -t.y);
    tower.castShadow = true;
    g.add(tower);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(t.r + 0.3, 1.1, 18), materials.gold);
    roof.position.set(t.x, towerH + 0.55, -t.y);
    roof.castShadow = true;
    g.add(roof);

    // Pennant flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), materials.chrome);
    pole.position.set(t.x, towerH + 1.5, -t.y);
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.3), materials.blueGlow);
    flag.position.set(t.x + 0.28, towerH + 1.75, -t.y);
    flag.material = materials.blueGlow;
    g.add(flag);
  });

  // Battlement walls above the physics walls
  const wallH = 2.1;
  [L.castle.leftWall, L.castle.rightWall].forEach((pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const lenW = Math.hypot(bx - ax, by - ay);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(lenW, wallH, 0.5), materials.stone);
      wall.position.set((ax + bx) / 2, wallH / 2, -(ay + by) / 2);
      wall.rotation.y = Math.atan2(by - ay, bx - ax);
      wall.castShadow = true;
      g.add(wall);
      // Crenellations: small merlon blocks along the top
      const n = Math.max(2, Math.round(lenW / 0.55));
      for (let k = 0; k < n; k += 2) {
        const f = (k + 0.5) / n;
        const merlon = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.5), materials.stoneDark);
        merlon.position.set(
          ax + (bx - ax) * f,
          wallH + 0.15,
          -(ay + (by - ay) * f)
        );
        merlon.rotation.y = Math.atan2(by - ay, bx - ax);
        g.add(merlon);
      }
    }
  });

  // Gate house: an arch over the gate opening
  const [gax, gay, gbx] = L.castle.gate;
  const gateW = Math.abs(gbx - gax);
  const gateCx = (gax + gbx) / 2;
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.7, 0.55, 0.65), materials.stoneDark);
  lintel.position.set(gateCx, 2.15, -gay);
  lintel.castShadow = true;
  g.add(lintel);
  const crown = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.4, 0.28, 0.6), materials.stone);
  crown.position.set(gateCx, 2.55, -gay);
  g.add(crown);

  // Portcullis: drops with the gate closed, lifts when it opens
  const portcullis = new THREE.Group();
  for (let i = 0; i <= 4; i++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.85, 6), materials.rail);
    bar.position.set(gax + (gateW * i) / 4, -0.92, 0);
    portcullis.add(bar);
  }
  const cross = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.15, 0.09, 0.09), materials.rail);
  cross.position.set(gateCx, -0.8, 0);
  portcullis.add(cross);
  // Bars are laid out in absolute playfield x, so the group only lifts them
  portcullis.position.set(0, 1.88, -gay);
  g.add(portcullis);
  refs.portcullis = portcullis;

  // Drawbridge: hinged plank in front of the gate
  const bridge = new THREE.Group();
  const plank = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.3, 0.12, 1.9), materials.wood);
  plank.position.z = -0.95;
  bridge.add(plank);
  [0.32, -0.32].forEach((off) => {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 1.9), materials.rail);
    strap.position.set(off * gateW, 0.02, -0.95);
    bridge.add(strap);
  });
  bridge.position.set(gateCx, 0.1, -(gay - 0.35));
  bridge.rotation.x = -Math.PI / 2 + 0.12; // raised (closed)
  g.add(bridge);
  refs.bridge = bridge;

  // Courtyard glow
  const lamp = new THREE.PointLight(0xf2c14e, 0.6, 9, 2);
  lamp.position.set(L.centerX, 2.6, -(gay + 1.6));
  g.add(lamp);
  refs.lamp = lamp;

  return { group: g, refs };
}

/* ------------------------------------------------------------------ builder */

export function buildTable(THREE, mergeGeometries, materials) {
  const group = new THREE.Group();
  const refs = { bumpers: [], targets: [], flippers: {}, lights: [] };

  /* ---- Playfield ---- */
  const artW = ART.x1 - ART.x0;
  const artH = ART.y1 - ART.y0;
  const playfield = new THREE.Mesh(
    flatten(new THREE.PlaneGeometry(artW, artH, 1, 1)),
    materials.playfield
  );
  playfield.position.set((ART.x0 + ART.x1) / 2, 0, -(ART.y0 + ART.y1) / 2);
  playfield.receiveShadow = true;
  group.add(playfield);

  /* ---- Walls ---- */
  const wallShapes = [];
  const railShapes = [];
  const pushChain = (pts, r = 0.3, into = wallShapes) => {
    for (let i = 0; i < pts.length - 1; i++) {
      into.push(capsuleShape(THREE, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], r));
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

  // Lane dividers and guide rails, slimmer and lower than the outer walls
  pushChain(L.leftDivider, 0.22, railShapes);
  pushChain(L.leftRail, 0.22, railShapes);
  pushChain(L.rightRail, 0.22, railShapes);
  // One-way return gates read as thin wires
  pushChain(L.leftReturnGate, 0.09, railShapes);
  pushChain(L.rightReturnGate, 0.09, railShapes);

  const wallGeos = wallShapes.map((s) =>
    flatten(new THREE.ExtrudeGeometry(s, { depth: L.wallH, bevelEnabled: false }))
  );
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), materials.rail);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const railGeos = railShapes.map((s) =>
    flatten(new THREE.ExtrudeGeometry(s, { depth: 1.0, bevelEnabled: false }))
  );
  const rails = new THREE.Mesh(mergeGeometries(railGeos), materials.chrome);
  rails.castShadow = true;
  group.add(rails);

  /* ---- Slingshots: rubber triangle body + glowing kicker face ---- */
  [['leftSling', L.leftSlingPts], ['rightSling', L.rightSlingPts]].forEach(([name, P]) => {
    const tri = new THREE.Shape();
    tri.moveTo(P.T[0], P.T[1]);
    tri.lineTo(P.BO[0], P.BO[1]);
    tri.lineTo(P.BI[0], P.BI[1]);
    tri.closePath();
    const body = new THREE.Mesh(
      flatten(new THREE.ExtrudeGeometry(tri, { depth: L.wallH * 0.8, bevelEnabled: false })),
      materials.rubber
    );
    body.castShadow = true;
    group.add(body);

    const face = new THREE.Mesh(
      flatten(
        new THREE.ExtrudeGeometry(
          capsuleShape(THREE, P.T[0], P.T[1], P.BI[0], P.BI[1], 0.24),
          { depth: L.wallH * 0.85, bevelEnabled: false }
        )
      ),
      materials.blueGlow
    );
    face.castShadow = true;
    group.add(face);
    refs[name] = face;
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

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(L.bumperR * 0.6, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      materials.goldGlow
    );
    dome.position.y = 0.94;
    dome.castShadow = true;
    g.add(dome);

    const light = new THREE.PointLight(0xf2c14e, 0, 7, 2);
    light.position.y = 1.9;
    g.add(light);

    group.add(g);
    refs.bumpers.push({ group: g, ring, trophy: dome, light, base: 0, isTrophy: false });
  });

  /* ---- Drop targets (angled banks) ---- */
  L.targets.forEach((t) => {
    const g = new THREE.Group();
    g.position.set(t.x, 0, -t.y);
    g.rotation.y = t.a;
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

  /* ---- Castle ---- */
  const castle = buildCastle(THREE, materials);
  group.add(castle.group);
  refs.castle = castle.refs;

  /* ---- Jackpot trophy in the courtyard ---- */
  {
    const g = new THREE.Group();
    g.position.set(L.jackpot.x, 0, -L.jackpot.y);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(L.jackpot.r, L.jackpot.r * 1.1, 0.42, 26),
      materials.stoneDark
    );
    base.position.y = 0.21;
    g.add(base);

    const trophy = buildTrophy(THREE, materials.gold, 1.75);
    trophy.position.y = 0.42;
    g.add(trophy);

    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(L.jackpot.r * 1.25, 0.08, 10, 34),
      materials.goldGlow
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.12;
    g.add(halo);

    const light = new THREE.PointLight(0xf2c14e, 0.85, 12, 2);
    light.position.y = 2.4;
    g.add(light);

    group.add(g);
    refs.jackpot = { group: g, trophy, halo, light };
  }

  /* ---- Wireform ramps ---- */
  refs.rampCurves = {};
  refs.rampArches = {};
  ['left', 'right'].forEach((side) => {
    const curve = rampCurve(THREE, L.ramps[side].path);
    refs.rampCurves[side] = curve;
    group.add(buildWireform(THREE, curve, materials));

    // Entrance portal: a golden arch at the capture point, flashed on capture
    const p0 = curve.getPointAt(0);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.09, 8, 18, Math.PI),
      materials.goldGlow
    );
    arch.position.set(p0.x, 0.35, p0.z);
    const tan = curve.getTangentAt(0);
    arch.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
    group.add(arch);
    refs.rampArches[side] = arch;
  });

  /* ---- Apron: the angled plate over the drain ---- */
  {
    const apron = new THREE.Shape();
    apron.moveTo(-4.4, -1.6);
    apron.lineTo(2.0, -1.6);
    apron.lineTo(0.2, 3.4);
    apron.lineTo(-2.6, 3.4);
    apron.closePath();
    const mesh = new THREE.Mesh(
      flatten(new THREE.ExtrudeGeometry(apron, { depth: 0.7, bevelEnabled: false })),
      materials.stoneDark
    );
    mesh.castShadow = true;
    group.add(mesh);
    const trim = new THREE.Mesh(
      flatten(
        new THREE.ExtrudeGeometry(capsuleShape(THREE, -2.6, 3.4, 0.2, 3.4, 0.12), {
          depth: 0.85,
          bevelEnabled: false
        })
      ),
      materials.gold
    );
    group.add(trim);
  }

  /* ---- Shot inserts: the lit arrows that tell you what is on ---- */
  {
    const arrow = new THREE.Shape();
    arrow.moveTo(-0.42, -0.5);
    arrow.lineTo(0.42, -0.5);
    arrow.lineTo(0.42, 0.16);
    arrow.lineTo(0.72, 0.16);
    arrow.lineTo(0, 0.86);
    arrow.lineTo(-0.72, 0.16);
    arrow.lineTo(-0.42, 0.16);
    arrow.closePath();
    const geo = flatten(new THREE.ExtrudeGeometry(arrow, { depth: 0.07, bevelEnabled: false }));

    const SPOTS = [
      { id: 'save', x: L.centerX, y: 4.5, a: 0, color: 0xf2c14e, disc: true },
      { id: 'leftOrbit', x: -8.95, y: 15.4, a: 0, color: 0x7c8cf8 },
      { id: 'leftRamp', x: -6.75, y: 14.4, a: 0.18, color: 0xf2c14e },
      { id: 'castle', x: L.centerX, y: 19.4, a: 0, color: 0x7c8cf8 },
      { id: 'rightRamp', x: 5.5, y: 15.0, a: -0.18, color: 0xf2c14e },
      { id: 'trolls', x: L.centerX, y: 22.6, a: 0, color: 0x6f9b5a }
    ];
    const discGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 22);
    refs.inserts = {};
    SPOTS.forEach((s) => {
      const mat = materials.insert.clone();
      mat.color = new THREE.Color(s.color);
      mat.emissive = new THREE.Color(s.color);
      mat.emissiveIntensity = 0.12;
      const mesh = new THREE.Mesh(s.disc ? discGeo : geo, mat);
      mesh.position.set(s.x, 0.035, -s.y);
      mesh.rotation.y = s.a;
      group.add(mesh);

      const light = new THREE.PointLight(s.color, 0, 4.5, 2);
      light.position.set(s.x, 0.8, -s.y);
      group.add(light);

      refs.inserts[s.id] = { mesh, mat, light };
    });
  }

  /* ---- Spinner: a bladed disc swinging on a post across the orbit ---- */
  {
    const g = new THREE.Group();
    g.position.set(L.spinner.x, 0, -L.spinner.y);
    [-1, 1].forEach((side) => {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 1.9, 10),
        materials.chrome
      );
      post.position.set(side * (L.spinner.half + 0.12), 0.95, 0);
      g.add(post);
    });
    const blade = new THREE.Mesh(
      new THREE.BoxGeometry(L.spinner.half * 2, 0.92, 0.05),
      materials.goldGlow
    );
    blade.position.y = 1.05;
    blade.castShadow = true;
    g.add(blade);
    group.add(g);
    refs.spinner = { group: g, blade, spin: 0 };
  }

  /* ---- Trolls: pop-up beasts in the castle corridor ---- */
  refs.trolls = L.trolls.map((t) => {
    const g = new THREE.Group();
    g.position.set(t.x, 0, -t.y);

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(t.r * 0.86, 0.7, 6, 14),
      materials.troll
    );
    body.position.y = 0.95;
    body.castShadow = true;
    g.add(body);

    // Eyes so it reads as a creature, not a peg
    [-1, 1].forEach((side) => {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 12, 8),
        materials.trollEye
      );
      eye.position.set(side * 0.24, 1.42, t.r * 0.72);
      g.add(eye);
    });
    // Club-like horns
    [-1, 1].forEach((side) => {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.42, 8),
        materials.stoneDark
      );
      horn.position.set(side * 0.36, 1.78, 0);
      horn.rotation.z = side * 0.4;
      g.add(horn);
    });

    // Retracted below the playfield until the mode raises them
    g.position.y = -2.2;
    g.visible = false;
    group.add(g);
    return { group: g, up: false };
  });

  /* ---- Flippers ---- */
  const flipperGeo = flatten(
    new THREE.ExtrudeGeometry(flipperShape(THREE, L.flipperLength, 0.46, 0.3), {
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
        new THREE.ExtrudeGeometry(flipperShape(THREE, L.flipperLength, 0.49, 0.33), {
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
