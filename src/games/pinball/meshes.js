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
 *
 * Both end caps sweep counter-clockwise, so each bulges AWAY from the other
 * end. (They used to sweep the other way and bulge inward: every wall had a
 * semicircular bite out of each end, and where two segments met the two
 * bites left a round hole in the top of the wall, showing the dark inside.)
 */
function capsuleShape(THREE, ax, ay, bx, by, r) {
  const shape = new THREE.Shape();
  const ang = Math.atan2(by - ay, bx - ax);
  shape.absarc(ax, ay, r, ang + Math.PI / 2, ang + Math.PI * 1.5, false);
  shape.absarc(bx, by, r, ang - Math.PI / 2, ang + Math.PI / 2, false);
  shape.closePath();
  return shape;
}

/**
 * Flipper silhouette: two circles of different radii joined by their outer
 * tangents, pivot at the origin pointing along +x. The tangents touch both
 * circles at ±(π/2 − α), leaning toward the tip; the round pivot end sweeps
 * the long way round behind the pivot and the tip end the short way round
 * the tip, both counter-clockwise (inverted, both ends had a bite out).
 */
function flipperShape(THREE, length, r0, r1) {
  const alpha = Math.asin((r0 - r1) / length);
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r0, Math.PI / 2 - alpha, Math.PI * 1.5 + alpha, false);
  shape.absarc(length, 0, r1, -Math.PI / 2 + alpha, Math.PI / 2 - alpha, false);
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

/* ------------------------------------------------------------ environment */

/**
 * The room the machine stands in, as an equirectangular map.
 *
 * This is what turns chrome from grey plastic into metal: a rail can only
 * look like steel if there is something bright for it to reflect. Two ceiling
 * strips run above the long axis, the backbox throws amber from one end, and
 * everything else is a dark arcade — so highlights come out as streaks that
 * travel along a wire, not as a uniform wash.
 */
export function machineEnvironment(THREE) {
  const W = 512;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  // Ceiling → horizon → floor.
  //
  // Deliberately dark between the fixtures. The broad top light a room gives
  // the playfield comes from the hemisphere light instead, because this map
  // is also what the clearcoat mirrors: paint the ceiling bright and the coat
  // reflects a uniform grey sheet over the whole playfield, which greys out
  // the print. Dark ceiling + discrete strips = discrete streaks.
  const room = g.createLinearGradient(0, 0, 0, H);
  room.addColorStop(0, '#242b46');
  room.addColorStop(0.32, '#141a2e');
  room.addColorStop(0.52, '#0a0e1a');
  room.addColorStop(1, '#04060c');
  g.fillStyle = room;
  g.fillRect(0, 0, W, H);

  const glow = (u, v, ru, rv, rgb, a) => {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(u * W, v * H);
    g.scale(ru * W, rv * H);
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(0.45, `rgba(${rgb},${a * 0.34})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(-1, -1, 2, 2);
    g.restore();
  };

  // Two ceiling fixtures, one over each side of the machine. Wide and soft
  // rather than small and blinding: a near-mirror wireform reflecting a tiny
  // over-bright source clips to white and the bloom pass renders the result
  // as a hard square, which is worse than having no highlight at all.
  glow(0.26, 0.1, 0.21, 0.11, '255,247,228', 0.8);
  glow(0.76, 0.1, 0.21, 0.11, '255,247,228', 0.8);
  // The backbox is a lamp in its own right
  glow(0.5, 0.3, 0.2, 0.13, '255,196,110', 0.5);
  // Cool spill off the walls behind the player
  glow(0.02, 0.4, 0.24, 0.17, '116,146,255', 0.26);
  glow(0.98, 0.4, 0.24, 0.17, '116,146,255', 0.26);
  // Floor bounce so undersides are dim rather than dead black
  glow(0.5, 0.88, 0.5, 0.14, '92,102,142', 0.16);

  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * The ball's own reflection map. A steel ball is a convex mirror of
 * everything round it, and what makes it read as steel (rather than a grey
 * marble) is that it shows the room crisply: the fixtures overhead, the
 * backbox up the table, a ring of warm GI at its equator and the blue
 * playfield underneath. Values are kept moderate; the ball shader caps the
 * result under the bloom threshold anyway.
 */
export function ballEnvironment(THREE) {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  // Sky: dark room. Ground: the playfield, lit near the ball, darker far off.
  // Not black: a steel ball in a lit arcade is silver, its darks are the
  // room's mid-tones, not a void
  const sky = g.createLinearGradient(0, 0, 0, H / 2);
  sky.addColorStop(0, '#68739a');
  sky.addColorStop(0.6, '#3c4468');
  sky.addColorStop(1, '#262c4a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H / 2);
  const ground = g.createLinearGradient(0, H / 2, 0, H);
  ground.addColorStop(0, '#1d2a66');
  ground.addColorStop(0.35, '#2f45a8');
  ground.addColorStop(1, '#3a52c0');
  g.fillStyle = ground;
  g.fillRect(0, H / 2, W, H / 2);
  const soft = (x, y, w, h, color, blur) => {
    g.save();
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
    g.restore();
  };
  // Two long ceiling fixtures, crisp-edged with a little bloom of their own,
  // and a dimmer row further off: highlights that slide over the ball
  soft(W * 0.1, H * 0.08, W * 0.24, H * 0.07, '#f4f6ff', 20);
  soft(W * 0.56, H * 0.1, W * 0.26, H * 0.065, '#f4f6ff', 20);
  soft(W * 0.62, H * 0.2, W * 0.14, H * 0.04, '#cfd6f0', 12);
  soft(W * 0.36, H * 0.22, W * 0.12, H * 0.035, '#cfd6f0', 12);
  soft(W * 0.86, H * 0.25, W * 0.1, H * 0.03, '#b8c2e6', 10);
  // The backbox, amber, standing up the table (−z sits at u ≈ 0.25)
  soft(W * 0.19, H * 0.3, W * 0.12, H * 0.14, '#d98b3a', 26);
  soft(W * 0.21, H * 0.33, W * 0.08, H * 0.05, '#ffbf73', 10);
  // GI ring at the horizon: warm blobs all the way round
  for (let i = 0; i < 18; i++) {
    const x = (i / 18) * W + (i % 2) * 14;
    const grad = g.createRadialGradient(x, H * 0.5, 0, x, H * 0.5, 26);
    grad.addColorStop(0, 'rgba(255,214,150,.85)');
    grad.addColorStop(1, 'rgba(255,214,150,0)');
    g.fillStyle = grad;
    g.fillRect(x - 26, H * 0.5 - 26, 52, 52);
  }
  // Lit inserts and the lane guides in the playfield below
  [[0.1, 0.66, '#f2c14e'], [0.3, 0.72, '#f26d8d'], [0.52, 0.64, '#7c8cf8'], [0.7, 0.7, '#5eead4'], [0.9, 0.67, '#f2c14e']].forEach(([u, v, c]) => {
    const grad = g.createRadialGradient(u * W, v * H, 0, u * W, v * H, 34);
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(u * W - 34, v * H - 34, 68, 68);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Micro-variation for the playfield clearcoat: ink irregularity plus the fine
 * swirl a coated playfield picks up from years of balls and cloths. A coat of
 * perfectly uniform gloss is the tell-tale CG-plastic look.
 */
function wearTexture(THREE) {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#6e6e6e';
  g.fillRect(0, 0, N, N);
  for (let i = 0; i < 240; i++) {
    const x = Math.random() * N;
    const y = Math.random() * N;
    const r = 6 + Math.random() * 26;
    const v = Math.random() < 0.5 ? 255 : 0;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(${v},${v},${v},0.1)`);
    grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.055)';
  g.lineWidth = 1;
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * N;
    const y = Math.random() * N;
    const a = Math.random() * Math.PI * 2;
    const len = 8 + Math.random() * 40;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 10);
  return tex;
}

/** Soft round falloff — used for contact shadows and diffused insert pools. */
function radialTexture(THREE, inner, stops) {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(N / 2, N / 2, N / 2 * inner, N / 2, N / 2, N / 2);
  stops.forEach(([at, color]) => grad.addColorStop(at, color));
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  return new THREE.CanvasTexture(cv);
}

/**
 * Dressed stone for the castle: courses of slightly uneven blocks with dark
 * mortar, grey so the material colour tints it. Mapped in world units by
 * bakeStatic (one tile = STONE_TILE units), so a merlon and a tower wall
 * show blocks of the same size.
 */
const STONE_TILE = 2.4;
function stoneTexture(THREE) {
  const N = 256;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d');
  g.fillStyle = '#5c5a58';
  g.fillRect(0, 0, N, N);
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const rows = 14;
  const rh = N / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 7;
    const cw = N / cols;
    const off = r % 2 ? cw / 2 : 0;
    for (let c = -1; c <= cols; c++) {
      const x = c * cw + off;
      const v = 150 + Math.round(rnd() * 46);
      g.fillStyle = `rgb(${v + 6},${v},${v - 8})`;
      g.fillRect(x + 1.5, r * rh + 1.5, cw - 3, rh - 3);
      // A lit top edge and a shaded bottom: the blocks stand proud of the mortar
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + 1.5, r * rh + 1.5, cw - 3, 2);
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + 1.5, r * rh + rh - 3.5, cw - 3, 2);
    }
  }
  // Weathering
  for (let i = 0; i < 260; i++) {
    const v = rnd() < 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.04 + rnd() * 0.06})`;
    g.fillRect(rnd() * N, rnd() * N, 2 + rnd() * 6, 2 + rnd() * 4);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Re-maps a (world-space) geometry's UVs: box projection, or around a tower's axis */
function worldUV(geo, scale, cyl) {
  const { position: p, normal: n, uv } = geo.attributes;
  if (!p || !n || !uv) return;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    let u;
    let v;
    const ny = Math.abs(n.getY(i));
    if (cyl && ny < 0.7) {
      // Seam at the back of the tower, away from the camera
      u = (Math.atan2(x - cyl.x, z - cyl.z) * cyl.r) / scale;
      v = y / scale;
    } else {
      const nx = Math.abs(n.getX(i));
      const nz = Math.abs(n.getZ(i));
      if (ny >= nx && ny >= nz) {
        u = x / scale;
        v = z / scale;
      } else if (nx >= nz) {
        u = z / scale;
        v = y / scale;
      } else {
        u = x / scale;
        v = y / scale;
      }
    }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Static batching. Everything on the table that never moves on its own is
 * merged into one mesh per material (and shadow setting), so the castle's
 * forty-odd blocks, the wireform ties and the posts cost a handful of draw
 * calls instead of a hundred — half of them twice, once more for the shadow
 * map. Anything animated, swapped or recoloured is flagged `userData.keep`
 * by its builder and left alone, with its whole subtree.
 */
export function bakeStatic(THREE, mergeGeometries, root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map();
  const visit = (o) => {
    if (o.userData.keep || !o.visible) return;
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !Array.isArray(o.material)) {
      const key = `${o.material.uuid}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
      let b = buckets.get(key);
      if (!b) {
        b = { material: o.material, items: [], cast: o.castShadow, receive: o.receiveShadow, order: o.renderOrder };
        buckets.set(key, b);
      }
      b.items.push(o);
    }
    o.children.forEach(visit);
  };
  root.children.forEach(visit);
  const m = new THREE.Matrix4();
  let merged = 0;
  buckets.forEach((b) => {
    const worldScale = b.material.userData.worldUV;
    if (b.items.length < 2 && !worldScale) return;
    const geos = b.items.map((o) => {
      m.multiplyMatrices(inv, o.matrixWorld);
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      Object.keys(g.attributes).forEach((name) => {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
      });
      g.morphAttributes = {};
      g.clearGroups();
      g.applyMatrix4(m);
      if (worldScale) worldUV(g, worldScale, o.userData.cylUV);
      return g;
    });
    const geo = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!geo) return;
    const mesh = new THREE.Mesh(geo, b.material);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.receive;
    mesh.renderOrder = b.order;
    mesh.name = 'baked';
    root.add(mesh);
    b.items.forEach((o) => o.parent && o.parent.remove(o));
    merged += b.items.length;
  });
  return merged;
}

/* -------------------------------------------------------------- materials */

/**
 * Caps the direct-light highlight on polished metal at just under the bloom
 * threshold, keeping its hue (the brightest channel is scaled, not each one).
 *
 * The key light's glint on a 0.17-rough cylinder — the lockdown bar, the
 * wireforms — is hundreds of times brighter than white. Tone mapping hides
 * that, but bloom does not: the bar turned the bottom corner of the screen
 * into a haze, and a wire only a pixel wide blinks in and out of a
 * third-resolution bloom as the camera drifts with the ball. Capped, the
 * streak still reads as polished steel (it still tones to near-white), and
 * the room's reflection on top of it carries the rest.
 */
function tameGlints(material, cap = 0.9) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        float peak = max(max(reflectedLight.directSpecular.r, reflectedLight.directSpecular.g), reflectedLight.directSpecular.b);
        reflectedLight.directSpecular *= min(1.0, ${cap.toFixed(2)} / max(peak, 1e-4));
      }`
    );
  };
  material.customProgramCacheKey = () => `pb-glint-${cap}`;
  return material;
}

export function createMaterials(THREE, playfieldTexture) {
  const m = {
    // A playfield is ink on wood under a thick pour of clearcoat. The coat is
    // what carries the room's reflection; the print below stays matte, and
    // the wear map keeps the gloss from being a perfect mirror.
    playfield: new THREE.MeshPhysicalMaterial({
      map: playfieldTexture,
      roughnessMap: wearTexture(THREE),
      roughness: 0.62,
      metalness: 0,
      clearcoat: 0.62,
      clearcoatRoughness: 0.2,
      envMapIntensity: 1
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xeef2ff,
      roughness: 0.17,
      metalness: 1,
      envMapIntensity: 1.15
    }),
    rail: new THREE.MeshStandardMaterial({
      color: 0x98a4c4,
      roughness: 0.26,
      metalness: 0.95,
      envMapIntensity: 1
    }),
    // Dressed stone: the block map is grey, the colour tints it (a cool
    // moonlit limestone, darker for the corbels and merlons)
    stone: new THREE.MeshStandardMaterial({
      color: 0xa3a6b8,
      roughness: 0.84,
      metalness: 0.05,
      envMapIntensity: 0.25
    }),
    stoneDark: new THREE.MeshStandardMaterial({
      color: 0x737a96,
      roughness: 0.86,
      metalness: 0.05,
      envMapIntensity: 0.2
    }),
    // Post and sling rubbers: off-white, matte, the classic look
    rubberWhite: new THREE.MeshStandardMaterial({
      color: 0xe9e4d8,
      roughness: 0.62,
      metalness: 0,
      envMapIntensity: 0.3
    }),
    // Lit castle windows and the GI bulbs: self-lit, held under the bloom
    // threshold so the small shapes never sparkle in and out of the bloom
    window: new THREE.MeshBasicMaterial({ color: 0xffb35c }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xfff0d0 }),
    wood: new THREE.MeshStandardMaterial({
      color: 0x8a5a2b,
      roughness: 0.7,
      metalness: 0.05,
      envMapIntensity: 0.2
    }),
    gold: new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.3,
      // Anodised, not chromed. At metalness 1 the base colour is thrown away
      // and the surface shows only the room — which in a dark arcade means a
      // gold flipper renders white under the key light.
      metalness: 0.35,
      envMapIntensity: 1,
      emissive: 0x2a1e04,
      emissiveIntensity: 1
    }),
    goldGlow: new THREE.MeshStandardMaterial({
      color: 0xf2c14e,
      roughness: 0.34,
      metalness: 0.55,
      envMapIntensity: 0.4,
      emissive: 0xf2c14e,
      emissiveIntensity: 0.6
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
    // Inserts and their pockets sit a few hundredths of a unit above the
    // wood. That is plenty in a 24-bit depth buffer and nothing in a 16-bit
    // one (some phones, and the direct-render fallback on others), where the
    // wood would punch through them in a crawling pattern. A polygon offset
    // is measured in the depth buffer's own steps, so it holds on both.
    insert: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.1,
      emissive: 0xffffff,
      emissiveIntensity: 0.12,
      transparent: true,
      opacity: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x10152a,
      roughness: 0.8,
      metalness: 0.1,
      envMapIntensity: 0.25
    }),
    // The steel lip round each drop-target slot. Raised a hair off the wood
    // and polygon-offset as well, like the inserts.
    slotRim: new THREE.MeshStandardMaterial({
      color: 0xc9d1ec,
      roughness: 0.3,
      metalness: 0.9,
      envMapIntensity: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    }),
    // Cabinet: painted plywood, deliberately darker than anything on the
    // playfield so the lit surface stays the brightest thing in frame.
    cabinet: new THREE.MeshStandardMaterial({
      color: 0x0c1122,
      roughness: 0.62,
      metalness: 0.1,
      envMapIntensity: 0.45
    }),
    // Side armour and the lockdown bar: polished stainless, the brightest
    // metal on the machine and the frame the whole photo hangs on.
    armour: new THREE.MeshStandardMaterial({
      color: 0xb9c4dc,
      roughness: 0.17,
      metalness: 1,
      envMapIntensity: 0.95
    }),
    // The routed pocket an insert sits in — a dark ring is what makes the
    // insert read as let into the wood instead of stuck on top of it.
    bezel: new THREE.MeshStandardMaterial({
      color: 0x05070f,
      roughness: 0.9,
      metalness: 0,
      envMapIntensity: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    })
  };
  [m.chrome, m.rail, m.armour, m.slotRim].forEach((mat) => tameGlints(mat));
  // The GI lamps mirrored in the clearcoat were blowing out to white discs
  // with a bloom halo. Capped (hue kept), they still read as bulbs in a
  // glossy coat but no longer bleach the print under them.
  m.playfield.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      #ifdef USE_CLEARCOAT
      {
        float pc = max(max(clearcoatSpecularDirect.r, clearcoatSpecularDirect.g), clearcoatSpecularDirect.b);
        clearcoatSpecularDirect *= min(1.0, 1.5 / max(pc, 1e-4));
      }
      #endif
      {
        float pd = max(max(reflectedLight.directSpecular.r, reflectedLight.directSpecular.g), reflectedLight.directSpecular.b);
        reflectedLight.directSpecular *= min(1.0, 1.5 / max(pd, 1e-4));
      }`
    );
  };
  m.playfield.customProgramCacheKey = () => 'pb-playfield-coat';
  const stone = stoneTexture(THREE);
  [m.stone, m.stoneDark].forEach((mat) => {
    mat.map = stone;
    mat.userData.worldUV = STONE_TILE;
  });
  return m;
}

/* ----------------------------------------------------------- the machine */

// The cabinet, backbox and glass live in cabinet.js; re-exported here so
// existing imports keep working.
export { CAB, headTop, buildCabinet, buildGlass } from './cabinet.js';

/** Height of the underside of the plastics over the slings and lane guides */
const PLASTIC_Y = 1.95;

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
 * A wireform habitrail, the way they are bent: two floor wires the ball
 * rolls on, two side wires at the height of its middle that keep it in,
 * U-hoops welded round all four every ball-length or so, and steel
 * supports down to the playfield wherever the ramp is high enough to need
 * one. Returns plain geometries (table space) so buildTable can bake both
 * ramps into a single chrome draw.
 */
function wireformGeometries(THREE, curve, t0 = 0) {
  const geos = [];
  const wireR = 0.055;
  const ballR = L.ballRadius;
  const SEG = 80;
  const up = new THREE.Vector3(0, 1, 0);
  const frame = (t0r) => {
    // t0 + (1 − t0)·i/n can land a hair past 1, where a curve has no point
    const t = Math.min(1, Math.max(0, t0r));
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const side = new THREE.Vector3().crossVectors(tan, up);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    return { p, tan, side };
  };
  // [lateral, height above the ball's lowest point]
  const WIRES = [[-0.34, 0.07], [0.34, 0.07], [-0.66, ballR + 0.06], [0.66, ballR + 0.06]];
  WIRES.forEach(([lat, h]) => {
    const pts = [];
    for (let i = 0; i <= SEG; i++) {
      const { p, side } = frame(t0 + ((1 - t0) * i) / SEG);
      pts.push(p.clone().addScaledVector(side, lat).add(new THREE.Vector3(0, h, 0)));
    }
    geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 110, wireR, 6, false));
  });

  // U-hoops around the ball path, and supports to the wood
  const len = curve.getLength();
  const n = Math.max(6, Math.round(((1 - t0) * len) / 1.15));
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((1 - t0) * i) / n;
    const { p, tan, side } = frame(t);
    const c = p.clone().add(new THREE.Vector3(0, ballR + 0.06, 0));
    const hoop = new THREE.TorusGeometry(0.68, 0.04, 5, 14, Math.PI);
    // Torus arc lies in its XY plane from +x through +y: flip it so the
    // arc runs UNDER the ball, then turn its plane across the path
    hoop.rotateZ(Math.PI);
    const m = new THREE.Matrix4().makeBasis(side, new THREE.Vector3().crossVectors(tan, side).normalize(), tan);
    hoop.applyMatrix4(m);
    hoop.translate(c.x, c.y, c.z);
    geos.push(hoop);
    // Every third hoop on a raised stretch stands on a post
    if (i % 3 === 1 && p.y > 0.7) {
      const hgt = p.y - 0.02;
      const post = new THREE.CylinderGeometry(0.05, 0.06, hgt, 6);
      post.translate(p.x, hgt / 2, p.z);
      geos.push(post);
      const foot = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 8);
      foot.translate(p.x, 0.025, p.z);
      geos.push(foot);
    }
  }
  return geos;
}

/**
 * The clear plastic entrance of a ramp: a U-channel of polycarbonate
 * carrying the ball up off the playfield until the wireform takes over at
 * `t1`. Returns geometries (in table space) for the plastic, its two lit
 * top edges, and the floor sticker; buildTable merges them across ramps.
 */
const RAMP_PLASTIC_T = 0.2;
// Where the two ramp-floor stickers are printed on the plastics' sheet, in
// its playfield units (the band above every plastic is free)
const STICKER_AREA = [
  { x0: -10.0, x1: -8.6, y0: 13.75, y1: 16.05 },
  { x0: -8.3, x1: -6.9, y0: 13.75, y1: 16.05 }
];
function plasticRampParts(THREE, curve, t1, row) {
  const N = 30;
  const hw = 0.6;
  const wallH = 0.44;
  const pos = [];
  const idx = [];
  const tops = [[], []];
  const perp = new THREE.Vector3();
  const frame = (t0r) => {
    // t0 + (1 − t0)·i/n can land a hair past 1, where a curve has no point
    const t = Math.min(1, Math.max(0, t0r));
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    perp.set(-tan.z, 0, tan.x);
    if (perp.lengthSq() < 1e-6) perp.set(1, 0, 0);
    perp.normalize();
    return p;
  };
  for (let i = 0; i <= N; i++) {
    const t = (t1 * i) / N;
    const p = frame(t);
    const floor = p.y - 0.045;
    const ring = [
      p.clone().addScaledVector(perp, -(hw + 0.07)).setY(floor + wallH),
      p.clone().addScaledVector(perp, -hw).setY(floor),
      p.clone().addScaledVector(perp, hw).setY(floor),
      p.clone().addScaledVector(perp, hw + 0.07).setY(floor + wallH)
    ];
    ring.forEach((v) => pos.push(v.x, v.y, v.z));
    tops[0].push(ring[0]);
    tops[1].push(ring[3]);
    if (i < N) {
      const a = i * 4;
      for (let k = 0; k < 3; k++) idx.push(a + k, a + k + 4, a + k + 1, a + k + 1, a + k + 4, a + k + 5);
    }
  }
  const plastic = new THREE.BufferGeometry();
  plastic.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  plastic.setIndex(idx);
  plastic.computeVertexNormals();
  const edges = tops.map((pts) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), N, 0.028, 5, false).toNonIndexed());
  // The sticker: a decal on the channel floor just inside the mouth
  const spos = [];
  const suv = [];
  const sidx = [];
  const M = 8;
  const ts0 = 0.012;
  const ts1 = 0.075;
  for (let i = 0; i <= M; i++) {
    const t = ts0 + ((ts1 - ts0) * i) / M;
    const p = frame(t);
    const y = p.y - 0.045 + 0.012;
    [-1, 1].forEach((side) => {
      const v = p.clone().addScaledVector(perp, side * (hw - 0.06)).setY(y);
      spos.push(v.x, v.y, v.z);
      // Printed on the plastics' shared sheet (see STICKER_AREA)
      const ar = STICKER_AREA[row];
      suv.push(side < 0 ? ar.x0 : ar.x1, ar.y0 + ((ar.y1 - ar.y0) * i) / M);
    });
    if (i < M) {
      const a = i * 2;
      sidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const sticker = new THREE.BufferGeometry();
  sticker.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
  sticker.setAttribute('uv', new THREE.Float32BufferAttribute(suv, 2));
  sticker.setIndex(sidx);
  sticker.computeVertexNormals();
  return { plastic, edges, sticker };
}

/* ------------------------------------------------------------------ castle */

/**
 * The castle door, painted in four states side by side: whole, cracked,
 * splintered with the courtyard's light showing through, and smashed (the
 * fallen bridge). The game picks a frame by offsetting the map. Seeded, so
 * the cracks land in the same place every game.
 */
function gateDoorTexture(THREE) {
  const FW = 256;
  const FH = 192;
  const cv = document.createElement('canvas');
  cv.width = FW * 4;
  cv.height = FH;
  const g = cv.getContext('2d');
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const crack = (x0, y0, len, ang, w) => {
    let x = x0;
    let y = y0;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      ang += (rnd() - 0.5) * 0.9;
      x += Math.cos(ang) * (len / 6);
      y += Math.sin(ang) * (len / 6);
      g.lineTo(x, y);
    }
    g.stroke();
  };
  for (let f = 0; f < 4; f++) {
    const ox = f * FW;
    g.save();
    g.beginPath();
    g.rect(ox, 0, FW, FH);
    g.clip();
    // Vertical oak boards, each its own shade, with dark seams
    const boards = 7;
    for (let i = 0; i < boards; i++) {
      const x = ox + (i * FW) / boards;
      const l = 30 + ((i * 37) % 11);
      g.fillStyle = `hsl(28, 48%, ${l}%)`;
      g.fillRect(x, 0, FW / boards, FH);
      g.strokeStyle = 'rgba(40,22,8,0.35)';
      g.lineWidth = 1;
      for (let k = 0; k < 5; k++) {
        const gx = x + 4 + k * 6 + (k % 2) * 2;
        g.beginPath();
        g.moveTo(gx, 0);
        g.bezierCurveTo(gx + 3, FH * 0.3, gx - 3, FH * 0.7, gx + 1, FH);
        g.stroke();
      }
      g.fillStyle = 'rgba(15,8,2,0.85)';
      g.fillRect(x, 0, 2, FH);
    }
    // The courtyard's glow through the splits (frames 2 and 3)
    // A jagged, charred-edged hole, not a lamp
    if (f >= 2) {
      const hx = ox + FW * 0.62;
      const hy = FH * 0.4;
      const R = f === 3 ? 40 : 16;
      const hole = (scale) => {
        g.beginPath();
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2;
          const r = R * scale * (k % 2 ? 0.55 : 1) * (0.8 + ((k * 53) % 7) / 14);
          g.lineTo(hx + Math.cos(a) * r * 1.3, hy + Math.sin(a) * r);
        }
        g.closePath();
      };
      g.fillStyle = 'rgba(20,10,4,0.95)';
      hole(1.18);
      g.fill();
      const lg = g.createRadialGradient(hx, hy + R * 0.3, 1, hx, hy, R * 1.3);
      lg.addColorStop(0, 'rgba(255,214,140,1)');
      lg.addColorStop(0.6, 'rgba(214,120,40,1)');
      lg.addColorStop(1, 'rgba(90,40,10,1)');
      g.fillStyle = lg;
      hole(0.92);
      g.fill();
    }
    // Iron straps with rivets; bent and torn as the door gives way
    [0.22, 0.78].forEach((v, bi) => {
      const y = FH * v;
      const bend = f >= 2 && bi === 0 ? 9 : f >= 1 && bi === 1 ? 4 : 0;
      g.fillStyle = '#2b2e36';
      g.beginPath();
      g.moveTo(ox, y - 9);
      g.quadraticCurveTo(ox + FW / 2, y - 9 + bend, ox + FW, y - 9);
      g.lineTo(ox + FW, y + 9);
      g.quadraticCurveTo(ox + FW / 2, y + 9 + bend, ox, y + 9);
      g.fill();
      g.fillStyle = '#8d93a3';
      for (let k = 0; k < 9; k++) {
        if (f === 3 && k % 3 === 1) continue;
        g.beginPath();
        g.arc(ox + 14 + k * ((FW - 28) / 8), y + bend * Math.sin((k / 8) * Math.PI), 2.6, 0, Math.PI * 2);
        g.fill();
      }
    });
    // The crest: a gold shield with a trophy, scuffed as it takes hits
    const cx = ox + FW / 2;
    const cy = FH * 0.5;
    g.fillStyle = f >= 2 ? '#a07f2a' : '#d4a73a';
    g.beginPath();
    g.moveTo(cx - 22, cy - 26);
    g.lineTo(cx + 22, cy - 26);
    g.lineTo(cx + 22, cy + 4);
    g.quadraticCurveTo(cx + 20, cy + 22, cx, cy + 30);
    g.quadraticCurveTo(cx - 20, cy + 22, cx - 22, cy + 4);
    g.closePath();
    g.fill();
    g.fillStyle = '#5a1e2a';
    g.fillRect(cx - 9, cy - 16, 18, 12);
    g.fillRect(cx - 3, cy - 4, 6, 10);
    g.fillRect(cx - 9, cy + 6, 18, 5);
    // Cracks: more, longer and wider with every frame
    g.strokeStyle = 'rgba(12,6,2,0.92)';
    g.lineCap = 'round';
    seed = 7;
    const n = [0, 5, 11, 18][f];
    for (let i = 0; i < n; i++) {
      const sx = ox + FW * (0.25 + rnd() * 0.5);
      const sy = FH * (0.25 + rnd() * 0.5);
      crack(sx, sy, 40 + rnd() * 50 * (1 + f * 0.4), rnd() * Math.PI * 2, 1.5 + f * 0.9);
    }
    // Splinters: pale torn wood along the worst splits
    if (f >= 2) {
      g.strokeStyle = 'rgba(232,196,140,0.85)';
      for (let i = 0; i < f * 6; i++) {
        const sx = ox + FW * (0.3 + rnd() * 0.44);
        const sy = FH * (0.3 + rnd() * 0.4);
        crack(sx, sy, 10 + rnd() * 16, rnd() * Math.PI * 2, 1.2);
      }
    }
    // Soot and wear toward the edges
    const vg = g.createRadialGradient(cx, cy, FH * 0.3, cx, cy, FW * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${0.35 + f * 0.08})`);
    g.fillStyle = vg;
    g.fillRect(ox, 0, FW, FH);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(0.25, 1);
  return tex;
}

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
    tower.userData.cylUV = { x: t.x, z: -t.y, r: t.r + 0.17 };
    g.add(tower);

    // A plinth course at the foot and a corbelled gallery under the roof:
    // the two rings that turn a cylinder into a tower
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.3, t.r + 0.34, 0.3, 18), materials.stoneDark);
    plinth.position.set(t.x, 0.15, -t.y);
    plinth.userData.cylUV = { x: t.x, z: -t.y, r: t.r + 0.32 };
    g.add(plinth);
    const corbel = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.34, t.r + 0.16, 0.34, 18), materials.stoneDark);
    corbel.position.set(t.x, towerH - 0.12, -t.y);
    corbel.castShadow = true;
    corbel.userData.cylUV = { x: t.x, z: -t.y, r: t.r + 0.3 };
    g.add(corbel);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(t.r + 0.36, 1.25, 18), materials.gold);
    roof.position.set(t.x, towerH + 0.6, -t.y);
    roof.castShadow = true;
    g.add(roof);
    // Finial ball on the spire
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), materials.gold);
    finial.position.set(t.x, towerH + 1.27, -t.y);
    g.add(finial);

    // Arrow slits facing the player, lit from inside
    [[0, 1.05, 0.12], [-0.42, 1.95, 0.1], [0.42, 1.95, 0.1]].forEach(([ax, y, w]) => {
      const a = ax; // around the tower, radians from the front
      const slit = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, 0.08), materials.window);
      const rr = t.r + 0.15;
      slit.position.set(t.x + Math.sin(a) * rr, y, -t.y + Math.cos(a) * rr);
      slit.rotation.y = a;
      g.add(slit);
    });

    // Pennant flag
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), materials.chrome);
    pole.position.set(t.x, towerH + 1.6, -t.y);
    g.add(pole);
    const pennant = new THREE.Shape();
    pennant.moveTo(0, 0.17);
    pennant.lineTo(0.62, 0.03);
    pennant.lineTo(0.5, -0.02);
    pennant.lineTo(0.62, -0.1);
    pennant.lineTo(0, -0.17);
    pennant.closePath();
    const flag = new THREE.Mesh(new THREE.ShapeGeometry(pennant), materials.blueGlow);
    flag.position.set(t.x + 0.03, towerH + 1.86, -t.y);
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
  portcullis.userData.keep = true;
  g.add(portcullis);
  refs.portcullis = portcullis;

  // The gate door, which is also the drawbridge: it stands in the opening
  // while the gate is shut, cracks a little more with every hit (four
  // frames of one painted atlas, so damage costs no extra draw calls), and
  // falls forward onto the forecourt as a bridge when the gate gives way.
  // Hinged at its foot, just in front of the gate collider, so the ball
  // meets the planks where the physics stops it.
  const bridge = new THREE.Group();
  const doorTex = gateDoorTexture(THREE);
  const doorMat = new THREE.MeshStandardMaterial({
    map: doorTex,
    roughness: 0.78,
    metalness: 0.05,
    envMapIntensity: 0.25
  });
  const DOOR_H = 1.86;
  const plank = new THREE.Mesh(new THREE.BoxGeometry(gateW + 0.1, DOOR_H, 0.14), doorMat);
  plank.position.y = DOOR_H / 2;
  bridge.add(plank);
  bridge.position.set(gateCx, 0.1, -(gay - 0.22));
  bridge.rotation.x = 0; // standing (closed)
  bridge.userData.keep = true;
  g.add(bridge);
  refs.bridge = bridge;
  refs.door = { mat: doorMat, tex: doorTex, frame: 0 };

  // Courtyard glow
  const lamp = new THREE.PointLight(0xf2c14e, 9.6, 14, 2); // 0.6 in LAMP units
  lamp.position.set(L.centerX, 2.6, -(gay + 1.6));
  g.add(lamp);
  refs.lamp = lamp;

  return { group: g, refs };
}

/* ------------------------------------------------------------------- apron */

/**
 * The apron's print. On a real machine the plate over the drain is never
 * bare: it carries the logo and the instruction cards, and it is the last
 * thing the eye crosses before the flippers. Painted in apron space (the
 * extrusion's cap UVs are the shape's own coordinates, so the texture is
 * offset and scaled onto the plate's bounding box): x −4.4…2.0, y −1.6…3.4.
 */
function apronTexture(THREE) {
  const PX = 100; // pixels per unit
  const W = 640;
  const H = 500;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const X = (x) => (x + 4.4) * PX;
  const Y = (y) => (3.4 - y) * PX;
  const cx = X(-1.2);
  const corners = [[-4.4, -1.6], [2.0, -1.6], [0.2, 3.4], [-2.6, 3.4]];
  // The plate's outline, each corner pulled `inset` pixels toward the middle
  const trap = (inset) => {
    const my = Y(0.4);
    const path = new Path2D();
    corners.forEach(([x, y], i) => {
      const px = X(x);
      const py = Y(y);
      const k = 1 - inset / Math.hypot(px - cx, py - my);
      const qx = cx + (px - cx) * k;
      const qy = my + (py - my) * k;
      if (i) path.lineTo(qx, qy);
      else path.moveTo(qx, qy);
    });
    path.closePath();
    return path;
  };
  g.fillStyle = '#0b0f24';
  g.fillRect(0, 0, W, H);
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#232b66');
  bg.addColorStop(1, '#0e1333');
  g.fillStyle = bg;
  g.fill(trap(0));
  g.strokeStyle = 'rgba(242,193,78,.85)';
  g.lineWidth = 5;
  g.stroke(trap(18));
  g.strokeStyle = 'rgba(242,193,78,.35)';
  g.lineWidth = 2;
  g.stroke(trap(30));

  // A small pokal over the name
  g.fillStyle = 'rgba(242,193,78,.92)';
  g.beginPath();
  g.moveTo(cx - 26, 196);
  g.lineTo(cx + 26, 196);
  g.quadraticCurveTo(cx + 24, 236, cx + 5, 242);
  g.lineTo(cx + 5, 252);
  g.lineTo(cx + 16, 260);
  g.lineTo(cx - 16, 260);
  g.lineTo(cx - 5, 252);
  g.lineTo(cx - 5, 242);
  g.quadraticCurveTo(cx - 24, 236, cx - 26, 196);
  g.fill();

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#f2c14e';
  g.font = '700 50px Fraunces, Georgia, serif';
  g.fillText('PEKKAS POKAL', cx, 300);
  g.fillStyle = 'rgba(214,222,255,.8)';
  g.font = '700 21px "Schibsted Grotesk", Inter, sans-serif';
  g.letterSpacing = '6px';
  g.fillText('FLIPPER · 2025', cx, 348);
  g.letterSpacing = '0px';
  // The bank in little lamp rings: the plate's one instruction card
  g.font = '700 22px "Schibsted Grotesk", Inter, sans-serif';
  g.lineWidth = 3;
  'POKAL'.split('').forEach((ch, i) => {
    const x = cx + (i - 2) * 58;
    g.strokeStyle = 'rgba(242,109,141,.9)';
    g.beginPath();
    g.arc(x, 414, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#f9c3d0';
    g.fillText(ch, x, 415);
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.repeat.set(1 / 6.4, 1 / 5);
  tex.offset.set(4.4 / 6.4, 1.6 / 5);
  return tex;
}

/* ---------------------------------------------------------------- plastics */

// Playfield region the plastics' shared print covers (2:1, like its canvas)
const PL = { x0: -10.2, x1: 7.0, y0: 7.6, y1: 16.2 };

/** The plastic pieces, in playfield coordinates */
function plasticOutlines() {
  // Follows L.leftSlingPts (raised clear of the flipper's swing)
  const sling = [
    [-5.15, 12.2], [-5.7, 11.6], [-5.6, 9.7], [-5.14, 9.06], [-4.05, 8.9],
    [-3.66, 9.28], [-3.92, 9.86], [-4.73, 12.02]
  ];
  // A heater shield over the top of each lane guide, where the orbit
  // returns drop onto the inlane
  const guide = [[-7.9, 13.5], [-6.3, 13.5], [-6.3, 12.75], [-7.1, 12.05], [-7.9, 12.75]];
  const mirror = (pts) => pts.map(([x, y]) => [mirrorX(x), y]).reverse();
  return [
    { id: 'slingL', pts: sling, art: 'trophy' },
    { id: 'slingR', pts: mirror(sling), art: 'tower' },
    { id: 'guideL', pts: guide, art: 'crown' },
    { id: 'guideR', pts: mirror(guide), art: 'crown' }
  ];
}

/**
 * The plastics' print: screen-printed art on clear acrylic, one canvas for
 * every piece so they all draw in a single call. Royal blue and crimson
 * fields, heraldic charges in gold, a white ink keyline and the clear edge
 * where the art stops short of the cut.
 */
function plasticsTexture(THREE, pieces) {
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const sx = W / (PL.x1 - PL.x0);
  const X = (x) => (x - PL.x0) * sx;
  const Y = (y) => (PL.y1 - y) * sx;
  g.fillStyle = '#1a2160';
  g.fillRect(0, 0, W, H);
  const GOLD = '#f2c14e';

  const shield = (cx, cy, s) => {
    const p = new Path2D();
    p.moveTo(cx - s, cy - s * 0.95);
    p.lineTo(cx + s, cy - s * 0.95);
    p.lineTo(cx + s, cy + s * 0.05);
    p.quadraticCurveTo(cx + s * 0.95, cy + s * 0.95, cx, cy + s * 1.35);
    p.quadraticCurveTo(cx - s * 0.95, cy + s * 0.95, cx - s, cy + s * 0.05);
    p.closePath();
    return p;
  };
  const charge = (kind, cx, cy, s) => {
    g.fillStyle = GOLD;
    g.strokeStyle = GOLD;
    if (kind === 'trophy') {
      g.beginPath();
      g.moveTo(cx - s * 0.5, cy - s * 0.55);
      g.lineTo(cx + s * 0.5, cy - s * 0.55);
      g.quadraticCurveTo(cx + s * 0.48, cy + s * 0.12, cx + s * 0.1, cy + s * 0.22);
      g.lineTo(cx + s * 0.1, cy + s * 0.42);
      g.lineTo(cx + s * 0.32, cy + s * 0.58);
      g.lineTo(cx - s * 0.32, cy + s * 0.58);
      g.lineTo(cx - s * 0.1, cy + s * 0.42);
      g.lineTo(cx - s * 0.1, cy + s * 0.22);
      g.quadraticCurveTo(cx - s * 0.48, cy + s * 0.12, cx - s * 0.5, cy - s * 0.55);
      g.fill();
      g.lineWidth = s * 0.09;
      g.beginPath();
      g.arc(cx - s * 0.5, cy - s * 0.3, s * 0.2, Math.PI * 0.5, Math.PI * 1.5);
      g.arc(cx + s * 0.5, cy - s * 0.3, s * 0.2, -Math.PI * 0.5, Math.PI * 0.5);
      g.stroke();
    } else if (kind === 'tower') {
      g.beginPath();
      g.moveTo(cx - s * 0.42, cy + s * 0.6);
      g.lineTo(cx - s * 0.42, cy - s * 0.3);
      for (let i = 0; i < 4; i++) {
        const x = cx - s * 0.42 + (i * s * 0.84) / 3.5;
        g.lineTo(x, cy - s * 0.52);
        g.lineTo(x + s * 0.12, cy - s * 0.52);
        g.lineTo(x + s * 0.12, cy - s * 0.3);
        g.lineTo(x + s * 0.24, cy - s * 0.3);
      }
      g.lineTo(cx + s * 0.42, cy - s * 0.52);
      g.lineTo(cx + s * 0.42, cy + s * 0.6);
      g.closePath();
      g.fill();
      g.fillStyle = '#7a1022';
      g.beginPath();
      g.moveTo(cx - s * 0.13, cy + s * 0.6);
      g.lineTo(cx - s * 0.13, cy + s * 0.2);
      g.arc(cx, cy + s * 0.2, s * 0.13, Math.PI, 0);
      g.lineTo(cx + s * 0.13, cy + s * 0.6);
      g.fill();
    } else {
      // Crown
      g.beginPath();
      g.moveTo(cx - s * 0.55, cy + s * 0.32);
      g.lineTo(cx - s * 0.6, cy - s * 0.32);
      g.lineTo(cx - s * 0.28, cy - s * 0.02);
      g.lineTo(cx, cy - s * 0.48);
      g.lineTo(cx + s * 0.28, cy - s * 0.02);
      g.lineTo(cx + s * 0.6, cy - s * 0.32);
      g.lineTo(cx + s * 0.55, cy + s * 0.32);
      g.closePath();
      g.fill();
      g.fillStyle = '#c8203f';
      [-0.6, 0, 0.6].forEach((k) => {
        g.beginPath();
        g.arc(cx + k * s * (k ? 1 : 0), cy - s * (k ? 0.36 : 0.52), s * 0.08, 0, Math.PI * 2);
        g.fill();
      });
    }
  };

  pieces.forEach((pc) => {
    const path = new Path2D();
    pc.pts.forEach(([x, y], i) => (i ? path.lineTo(X(x), Y(y)) : path.moveTo(X(x), Y(y))));
    path.closePath();
    const xs = pc.pts.map((p) => X(p[0]));
    const ys = pc.pts.map((p) => Y(p[1]));
    const bx0 = Math.min(...xs);
    const bx1 = Math.max(...xs);
    const by0 = Math.min(...ys);
    const by1 = Math.max(...ys);
    const cx = (bx0 + bx1) / 2;
    const cy = (by0 + by1) / 2;
    const span = Math.min(bx1 - bx0, by1 - by0);
    const isSling = pc.id.startsWith('sling');
    g.save();
    g.clip(path);
    const bg = g.createLinearGradient(bx0, by0, bx1, by1);
    if (isSling) {
      bg.addColorStop(0, '#4560ea');
      bg.addColorStop(1, '#1d278a');
    } else {
      bg.addColorStop(0, '#d92c4c');
      bg.addColorStop(1, '#721126');
    }
    g.fillStyle = bg;
    g.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // Diagonal heraldic bend and a field of tiny stars
    if (isSling) {
      g.fillStyle = 'rgba(200,32,63,0.75)';
      g.beginPath();
      g.moveTo(bx0, by1 - (by1 - by0) * 0.18);
      g.lineTo(bx1, by0 + (by1 - by0) * 0.2);
      g.lineTo(bx1, by0 + (by1 - by0) * 0.34);
      g.lineTo(bx0, by1 - (by1 - by0) * 0.04);
      g.fill();
      g.fillStyle = 'rgba(255,236,190,0.6)';
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996;
        const r = Math.sqrt(i / 26) * span * 0.62;
        g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.4, 2.5, 2.5);
      }
    }
    // The charge on its shield
    const s = span * (isSling ? 0.3 : 0.3);
    const scy = cy + (isSling ? -span * 0.12 : -span * 0.04);
    g.fillStyle = '#0d1033';
    g.fill(shield(cx, scy, s * 1.08));
    g.strokeStyle = GOLD;
    g.lineWidth = Math.max(3, s * 0.12);
    g.stroke(shield(cx, scy, s * 0.92));
    charge(pc.art, cx, scy + s * 0.04, s * 0.9);
    // Inner keylines: dark, then gold, just inside the cut
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(5,6,20,0.7)';
    g.lineWidth = 22;
    g.stroke(path);
    g.strokeStyle = GOLD;
    g.lineWidth = 12;
    g.stroke(path);
    g.strokeStyle = 'rgba(255,248,230,0.95)';
    g.lineWidth = 4;
    g.stroke(path);
    g.restore();
  });
  // The ramp-floor stickers: chevrons up the ramp, gold on crimson
  STICKER_AREA.forEach((ar) => {
    const x0 = X(ar.x0);
    const x1 = X(ar.x1);
    const y0 = Y(ar.y1);
    const y1 = Y(ar.y0);
    g.fillStyle = '#8c1028';
    g.beginPath();
    g.roundRect(x0 + 4, y0 + 4, x1 - x0 - 8, y1 - y0 - 8, 10);
    g.fill();
    g.strokeStyle = GOLD;
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = GOLD;
    const w = x1 - x0;
    for (let k = 0; k < 3; k++) {
      const cy = y1 - (y1 - y0) * (0.2 + k * 0.28);
      g.beginPath();
      g.moveTo(x0 + w * 0.2, cy + w * 0.12);
      g.lineTo(x0 + w * 0.5, cy - w * 0.16);
      g.lineTo(x0 + w * 0.8, cy + w * 0.12);
      g.lineTo(x0 + w * 0.8, cy + w * 0.26);
      g.lineTo(x0 + w * 0.5, cy - w * 0.02);
      g.lineTo(x0 + w * 0.2, cy + w * 0.26);
      g.closePath();
      g.fill();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // Extrusion caps carry the shape's own (playfield) coordinates as UVs
  tex.repeat.set(1 / (PL.x1 - PL.x0), 1 / (PL.y1 - PL.y0));
  tex.offset.set(-PL.x0 / (PL.x1 - PL.x0), -PL.y0 / (PL.y1 - PL.y0));
  return tex;
}

/**
 * Plastics on their standoffs, with the GI bulbs that live under them.
 * The print is also the emissive map, tinted every frame with the GI colour
 * by the game, so the plastics glow with the string and recolour with it.
 */
function buildPlastics(THREE, materials, mergeGeometries, extra = []) {
  const group = new THREE.Group();
  const pieces = plasticOutlines();
  const tex = plasticsTexture(THREE, pieces);
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive: 0xffe0bc,
    emissiveIntensity: 0.32,
    roughness: 0.2,
    metalness: 0,
    envMapIntensity: 0.9
  });
  const geos = pieces.map((pc) => {
    const sh = new THREE.Shape();
    pc.pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
    sh.closePath();
    const geo = flatten(new THREE.ExtrudeGeometry(sh, {
      depth: 0.07,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.03,
      bevelOffset: -0.03,
      bevelSegments: 1
    }));
    geo.translate(0, PLASTIC_Y + 0.02, 0);
    return geo;
  });
  // The ramp stickers print on the same sheet, so they ride in this mesh
  extra.forEach((x) => geos.push(x.index ? x.toNonIndexed() : x));
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), mat);
  mesh.castShadow = true;
  mesh.userData.keep = true;
  group.add(mesh);

  // Standoffs under the lane-guide shields (the slings stand on their posts)
  pieces.filter((p) => p.id.startsWith('guide')).forEach((pc) => {
    const top = pc.pts.reduce((a, p) => a + p[0], 0) / pc.pts.length;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, PLASTIC_Y, 10), materials.chrome);
    post.position.set(top, PLASTIC_Y / 2, -12.85);
    group.add(post);
  });

  // GI bulbs tucked under the sling plastics, two a side
  const bulbs = [[-5.3, 10.3], [-4.65, 9.25]];
  bulbs.concat(bulbs.map(([x, y]) => [mirrorX(x), y])).forEach(([x, y]) => {
    const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8), materials.rubber);
    socket.position.set(x, 0.1, -y);
    group.add(socket);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), materials.bulb);
    bulb.scale.y = 1.35;
    bulb.position.set(x, 0.34, -y);
    group.add(bulb);
  });
  return { group, material: mat };
}

/* ------------------------------------------------------------ flashers */

/**
 * Two flasher domes on the wall tops, either side of the upper playfield.
 * Each has its own material so the game can fire them independently; the
 * light they throw is a punch on the nearest GI lamp (adding lights would
 * change every shader on the table mid-game).
 */
function buildFlashers(THREE, materials) {
  const group = new THREE.Group();
  const list = [
    { id: 'left', x: -10.15, y: 22.6, color: 0xff3b4e },
    { id: 'right', x: 6.6, y: 21.2, color: 0xffb02e }
  ].map((f) => {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.6, 0.18, 16), materials.rubber);
    base.position.set(f.x, L.wallH + 0.11, -f.y);
    group.add(base);
    const mat = new THREE.MeshStandardMaterial({
      color: f.color,
      roughness: 0.18,
      metalness: 0,
      transparent: true,
      opacity: 0.82,
      emissive: f.color,
      emissiveIntensity: 0.18,
      envMapIntensity: 1.2
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.52, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    dome.position.set(f.x, L.wallH + 0.2, -f.y);
    dome.scale.y = 1.25;
    dome.renderOrder = 3;
    dome.userData.keep = true;
    group.add(dome);
    return { id: f.id, x: f.x, y: f.y, color: new THREE.Color(f.color), mat, dome, t: 9 };
  });
  return { group, list };
}

/* ---------------------------------------------------------- lamp matrix */

/**
 * Small round inserts: the grenar row, the P-O-K-A-L letters, the locks,
 * bonus multipliers, kickback and the inlanes. A real playfield is covered
 * in these; the art is printed on the wood over a frosted lens.
 *
 * All of them are ONE mesh (and their glows a second), coloured per vertex:
 * the game sets each lamp's level and the colours are rewritten in place —
 * two draw calls for any number of lamps, and no new lights.
 */
const LAMP_DEFS = [
  // Grenar, a row over the flippers, left to right in the order they come
  ...["'12", "'13", "'19", "'22", "'24"].map((label, i) => ({
    id: `gren${i}`, x: -3.3 + i * 0.84, y: 10.3, r: 0.33, color: 0x7c8cf8, label
  })),
  { id: 'gren5', x: -3.3 + 5 * 0.84, y: 10.3, r: 0.33, color: 0xffd166, label: 'crown' },
  // The letters, just in front of each drop target
  ...L.targets.map((t, i) => ({
    id: `pokal${i}`, x: t.x + Math.sin(t.a) * 1.05, y: t.y - Math.cos(t.a) * 1.05, r: 0.36, color: 0xf26d8d, label: t.letter
  })),
  // Lock lamps either side of the castle arrow
  { id: 'lock0', x: -2.25, y: 19.55, r: 0.3, color: 0x7c8cf8, label: 'lock' },
  { id: 'lock1', x: -0.15, y: 19.55, r: 0.3, color: 0x7c8cf8, label: 'lock' },
  // Bonus multipliers: a second row under the grenar, clear of the
  // raised flippers
  ...[2, 3, 4, 5, 6].map((n, i) => ({
    id: `bx${n}`, x: L.centerX + (i - 2) * 0.84, y: 9.38, r: 0.27, color: 0xffb347, label: `${n}×`
  })),
  { id: 'kickback', x: -8.05, y: 11.75, r: 0.3, color: 0xf2c14e, label: 'K' },
  // Rules lamps: super jackpot under the castle arrow, add-a-ball by the
  // right ramp, the extra-ball lamp on the Kungsvägen (left ramp) approach
  { id: 'super', x: L.centerX, y: 18.2, r: 0.3, color: 0xffd166, label: 'S' },
  { id: 'addBall', x: 5.45, y: 16.55, r: 0.3, color: 0x5eead4, label: '+1' },
  // (placed from the ramp's capture line, so it follows the lane)
  { id: 'eb', x: (L.ramps.left.capture[0] + L.ramps.left.capture[2]) / 2, y: L.ramps.left.capture[1] - 0.9, r: 0.32, color: 0xff7a59, label: 'EB' },
  // Gate damage: three lamps on the forecourt, one per hit
  ...[0, 1, 2].map((i) => ({
    id: `gate${i}`, x: L.centerX - 0.9 + i * 0.9, y: 26.0, r: 0.24, color: 0xff9a3c, label: 'up'
  })),
  { id: 'inL', x: -6.15, y: 11.55, r: 0.26, color: 0x5eead4, label: '' },
  { id: 'inR', x: mirrorX(-6.15), y: 11.55, r: 0.26, color: 0x5eead4, label: '' }
];

function lampAtlas(THREE, defs) {
  const C = 64;
  const cols = 8;
  const rows = Math.ceil(defs.length / cols);
  const cv = document.createElement('canvas');
  cv.width = C * cols;
  cv.height = C * rows;
  const g = cv.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  defs.forEach((d, i) => {
    const x = (i % cols) * C + C / 2;
    const y = Math.floor(i / cols) * C + C / 2;
    // Frosted lens: bright core falling off to the rim, a thin lit edge
    const grad = g.createRadialGradient(x - 4, y - 5, 2, x, y, C / 2);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.55, '#d8d8d8');
    grad.addColorStop(0.86, '#8a8a8a');
    grad.addColorStop(0.94, '#e6e6e6');
    grad.addColorStop(1, '#5a5a5a');
    g.fillStyle = grad;
    g.fillRect(x - C / 2, y - C / 2, C, C);
    // The print over it, in dark ink
    g.fillStyle = 'rgba(8,10,28,0.82)';
    g.strokeStyle = 'rgba(8,10,28,0.82)';
    if (d.label === 'crown') {
      g.beginPath();
      g.moveTo(x - 16, y + 10);
      g.lineTo(x - 18, y - 9);
      g.lineTo(x - 8, y + 1);
      g.lineTo(x, y - 14);
      g.lineTo(x + 8, y + 1);
      g.lineTo(x + 18, y - 9);
      g.lineTo(x + 16, y + 10);
      g.closePath();
      g.fill();
    } else if (d.label === 'up') {
      // A chevron pointing up the table: "this way"
      g.beginPath();
      g.moveTo(x - 14, y + 6);
      g.lineTo(x, y - 9);
      g.lineTo(x + 14, y + 6);
      g.lineTo(x + 9, y + 10);
      g.lineTo(x, y + 1);
      g.lineTo(x - 9, y + 10);
      g.closePath();
      g.fill();
    } else if (d.label === 'lock') {
      g.lineWidth = 5;
      g.beginPath();
      g.arc(x, y - 4, 8, Math.PI, 0);
      g.stroke();
      g.fillRect(x - 12, y - 3, 24, 17);
    } else if (d.label) {
      const big = d.label.length <= 1;
      g.font = `800 ${big ? 34 : 24}px "Schibsted Grotesk", Inter, Arial, sans-serif`;
      g.fillText(d.label, x, y + 2);
    } else {
      // Plain chevron
      g.beginPath();
      g.moveTo(x - 14, y - 6);
      g.lineTo(x, y + 9);
      g.lineTo(x + 14, y - 6);
      g.lineTo(x + 9, y - 10);
      g.lineTo(x, y - 1);
      g.lineTo(x - 9, y - 10);
      g.closePath();
      g.fill();
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, cols, rows };
}

function buildLamps(THREE, materials, mergeGeometries) {
  const group = new THREE.Group();
  const defs = LAMP_DEFS;
  const { tex, cols, rows } = lampAtlas(THREE, defs);
  const SEG = 20;
  const lensGeos = [];
  const glowGeos = [];
  const bezels = [];
  defs.forEach((d, i) => {
    const cu = (i % cols) / cols;
    const cvv = 1 - (Math.floor(i / cols) + 1) / rows;
    const lens = new THREE.CircleGeometry(d.r, SEG);
    const { uv } = lens.attributes;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, cu + uv.getX(k) / cols, cvv + uv.getY(k) / rows);
    flatten(lens).translate(d.x, 0.032, -d.y);
    lensGeos.push(lens.toNonIndexed());
    const glow = flatten(new THREE.PlaneGeometry(d.r * 5.2, d.r * 5.2)).translate(d.x, 0.05, -d.y);
    glowGeos.push(glow.toNonIndexed());
    const ring = new THREE.Mesh(flatten(new THREE.RingGeometry(d.r * 0.98, d.r + 0.08, SEG)), materials.bezel);
    ring.position.set(d.x, 0.018, -d.y);
    bezels.push(ring);
  });
  bezels.forEach((b) => group.add(b));
  const lensGeo = mergeGeometries(lensGeos, false);
  const glowGeo = mergeGeometries(glowGeos, false);
  const lensVerts = lensGeos[0].attributes.position.count;
  const glowVerts = glowGeos[0].attributes.position.count;
  lensGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(lensGeo.attributes.position.count * 3), 3));
  glowGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(glowGeo.attributes.position.count * 3), 3));
  const lens = new THREE.Mesh(lensGeo, new THREE.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  }));
  lens.userData.keep = true;
  group.add(lens);
  const glowTex = radialTexture(THREE, 0, [
    [0, 'rgba(255,255,255,0.7)'],
    [0.35, 'rgba(255,255,255,0.22)'],
    [1, 'rgba(255,255,255,0)']
  ]);
  // The glow quads share one radial map; each covers the whole texture
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({
    map: glowTex,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3
  }));
  glow.renderOrder = 2;
  glow.userData.keep = true;
  group.add(glow);

  const index = {};
  defs.forEach((d, i) => {
    index[d.id] = i;
  });
  const base = defs.map((d) => new THREE.Color(d.color));
  const level = new Float32Array(defs.length);
  const shown = new Float32Array(defs.length).fill(-1);
  const tint = defs.map(() => null);
  const tmp = new THREE.Color();
  return {
    group,
    defs,
    /** Target level 0…1 (and optional colour override) for a lamp by id */
    set(id, v, color = null) {
      const i = index[id];
      if (i === undefined) return;
      level[i] = v;
      tint[i] = color;
    },
    /** Eases toward the targets and rewrites the vertex colours that changed */
    update(dt) {
      const k = Math.min(1, dt * 16);
      const lc = lensGeo.attributes.color;
      const gc = glowGeo.attributes.color;
      let dirty = false;
      for (let i = 0; i < defs.length; i++) {
        const cur = shown[i] < 0 ? level[i] : shown[i] + (level[i] - shown[i]) * k;
        if (Math.abs(cur - shown[i]) < 0.002) continue;
        shown[i] = cur;
        dirty = true;
        const c = tint[i] || base[i];
        // Unlit: the dark tinted plastic. Lit: a bright lens, peak kept
        // just under the bloom threshold.
        tmp.copy(c).multiplyScalar(0.24 + cur * 0.9);
        tmp.r += cur * 0.12;
        tmp.g += cur * 0.12;
        tmp.b += cur * 0.12;
        for (let v = 0; v < lensVerts; v++) lc.setXYZ(i * lensVerts + v, tmp.r, tmp.g, tmp.b);
        tmp.copy(c).multiplyScalar(cur * 0.85);
        for (let v = 0; v < glowVerts; v++) gc.setXYZ(i * glowVerts + v, tmp.r, tmp.g, tmp.b);
      }
      if (dirty) {
        lc.needsUpdate = true;
        gc.needsUpdate = true;
      }
    }
  };
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
  playfield.userData.keep = true;
  group.add(playfield);
  refs.playfield = playfield;

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
  const gateShapes = [];
  pushChain(L.leftReturnGate, 0.09, gateShapes);
  pushChain(L.rightReturnGate, 0.09, gateShapes);

  // Rolled edges. A sharp-cornered extrusion has nothing along its top to
  // catch the light, so from above every wall read as a flat grey ribbon.
  // The bevel is pulled INSIDE the outline (bevelOffset = −size), so the
  // sides stand exactly where the colliders are; the bottom bevel sinks
  // below the wood, out of sight.
  const bevelled = (s, h, size, segs = 5) => flatten(new THREE.ExtrudeGeometry(s, {
    depth: h - size,
    curveSegments: segs,
    bevelEnabled: true,
    bevelThickness: size,
    bevelSize: size,
    bevelOffset: -size,
    bevelSegments: 2
  }));
  const wallGeos = wallShapes.map((s) => bevelled(s, L.wallH, 0.09));
  const walls = new THREE.Mesh(mergeGeometries(wallGeos), materials.rail);
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const railGeos = railShapes.map((s) => bevelled(s, 1.0, 0.07, 6))
    .concat(gateShapes.map((s) => flatten(new THREE.ExtrudeGeometry(s, { depth: 1.0, curveSegments: 5, bevelEnabled: false }))));
  const rails = new THREE.Mesh(mergeGeometries(railGeos), materials.chrome);
  rails.castShadow = true;
  group.add(rails);

  /* ---- Slingshots: rubber triangle body + glowing kicker face ---- */
  const slingPostGeos = [];
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
    face.userData.keep = true;
    group.add(face);
    refs[name] = face;

    // The rubber ring stretched round three posts, as on every real sling:
    // the two plain edges carry the off-white band, the kicker edge keeps
    // its lit face. Each post also carries a plastic above it (below).
    const corners = [P.T, P.BO, P.BI];
    const cx = (P.T[0] + P.BO[0] + P.BI[0]) / 3;
    const cy = (P.T[1] + P.BO[1] + P.BI[1]) / 3;
    const out = (p, k) => {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const l = Math.hypot(dx, dy) || 1;
      return new THREE.Vector3(p[0] + (dx / l) * k, 0.62, -(p[1] + (dy / l) * k));
    };
    const band = new THREE.CatmullRomCurve3([out(P.T, 0.17), out(P.BO, 0.17), out(P.BI, 0.17)], false, 'catmullrom', 0.1);
    const bandMesh = new THREE.Mesh(new THREE.TubeGeometry(band, 24, 0.11, 6, false), materials.rubberWhite);
    bandMesh.castShadow = true;
    group.add(bandMesh);
    corners.forEach((c) => {
      const post = new THREE.CylinderGeometry(0.12, 0.14, PLASTIC_Y, 10);
      post.translate(c[0], PLASTIC_Y / 2, -c[1]);
      slingPostGeos.push(post);
    });
    // The kicker pushes its rubber out along the face normal (index.js
    // animates face.position by this, in table space)
    const fx0 = P.BI[0] - P.T[0];
    const fy0 = P.BI[1] - P.T[1];
    const fl = Math.hypot(fx0, fy0) || 1;
    let nx = -fy0 / fl;
    let ny = fx0 / fl;
    if (nx * (cx - P.T[0]) + ny * (cy - P.T[1]) > 0) {
      nx = -nx;
      ny = -ny;
    }
    face.userData.kick = new THREE.Vector3(nx, 0, -ny);
  });
  // Six chrome sling posts in one draw
  {
    const posts = new THREE.Mesh(mergeGeometries(slingPostGeos, false), materials.chrome);
    group.add(posts);
  }

  /* ---- Posts: brass, each wearing its rubber ring and a star-post cap ----
     Merged per material: three draws for all of them, not three each. */
  {
    const brass = [];
    const rings = [];
    const caps = [];
    L.posts.forEach((p) => {
      const post = new THREE.CylinderGeometry(p.r * 0.5, p.r * 0.56, L.wallH, 12);
      post.translate(p.x, L.wallH / 2, -p.y);
      brass.push(post);
      const ring = new THREE.TorusGeometry(p.r - 0.085, 0.085, 8, 20);
      ring.rotateX(Math.PI / 2);
      ring.translate(p.x, 0.62, -p.y);
      rings.push(ring);
      const cap = new THREE.CylinderGeometry(p.r * 0.8, p.r * 0.95, 0.22, 8);
      cap.translate(p.x, L.wallH + 0.11, -p.y);
      caps.push(cap);
    });
    const posts = new THREE.Mesh(mergeGeometries(brass, false), materials.gold);
    posts.castShadow = true;
    group.add(posts);
    const ringMesh = new THREE.Mesh(mergeGeometries(rings, false), materials.rubberWhite);
    ringMesh.castShadow = true;
    group.add(ringMesh);
    group.add(new THREE.Mesh(mergeGeometries(caps, false), materials.blueGlow));
  }

  /* ---- Pop bumpers ----
     The real anatomy, bottom up: a black base flange on the wood, the
     switch skirt (it dips toward the ball when it is struck), the body
     column, the steel ring the coil yanks DOWN to throw the ball, and the
     cap — a lit insert under a clear dome with the bulb inside. index.js
     animates the skirt and ring on every fire. */
  const bumperBases = [];
  L.bumpers.forEach((b) => {
    const base = new THREE.CylinderGeometry(L.bumperR * 1.12, L.bumperR * 1.17, 0.08, 28);
    base.translate(b.x, 0.04, -b.y);
    bumperBases.push(base);

    const g = new THREE.Group();
    g.position.set(b.x, 0, -b.y);

    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(L.bumperR * 0.84, L.bumperR * 1.02, 0.12, 28),
      materials.rubber
    );
    skirt.position.y = 0.17;
    skirt.castShadow = true;
    g.add(skirt);

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(L.bumperR * 0.5, L.bumperR * 0.54, 0.7, 20),
      materials.chrome
    );
    body.position.y = 0.55;
    g.add(body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(L.bumperR * 0.8, 0.13, 10, 32),
      materials.goldGlow
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.66;
    g.add(ring);

    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(L.bumperR * 0.72, L.bumperR * 0.84, 0.3, 24),
      materials.gold
    );
    cap.position.y = 1.05;
    cap.castShadow = true;
    g.add(cap);

    // The printed insert on the cap top, lit from the bulb below
    const insert = new THREE.Mesh(new THREE.CircleGeometry(L.bumperR * 0.6, 24), materials.goldGlow);
    insert.rotation.x = -Math.PI / 2;
    insert.position.y = 1.215;
    g.add(insert);

    // The lamp bead that lives inside the cap. Small, very bright, and read
    // through the plastic — which is what gives a pop bumper its glow.
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(L.bumperR * 0.24, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false })
    );
    bead.position.y = 1.3;
    g.add(bead);

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(L.bumperR * 0.6, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2),
      // Standard, not physical: a transparent clearcoat shader is the most
      // expensive thing on the table and, at this size, indistinguishable.
      new THREE.MeshStandardMaterial({
        color: 0xf2c14e,
        roughness: 0.16,
        metalness: 0.15,
        transparent: true,
        opacity: 0.66,
        emissive: 0xf2c14e,
        emissiveIntensity: 0.5,
        envMapIntensity: 1.4
      })
    );
    dome.position.y = 1.2;
    dome.renderOrder = 3;
    g.add(dome);

    const light = new THREE.PointLight(0xf2c14e, 0, 11, 2);
    light.position.y = 2.1;
    g.add(light);

    g.userData.keep = true;
    group.add(g);
    refs.bumpers.push({
      group: g, ring, trophy: dome, bead, light, base: 0, isTrophy: false,
      skirt, ringY: ring.position.y, fire: 0, tiltX: 0, tiltZ: 0
    });
  });
  {
    const bases = new THREE.Mesh(mergeGeometries(bumperBases, false), materials.rubber);
    bases.receiveShadow = true;
    group.add(bases);
  }

  /* ---- Drop targets (angled banks) ----
     Real drop targets: a thin upright plate (≈5 mm), its printed face in
     the table's crimson and gold, a rounded top edge, standing in a steel-
     lipped slot it drops straight down into. The plate's front face sits on
     the collider's front (radius 0.26), so the ball meets the print, not air. */
  const PLATE_W = L.targets[0].half * 2;
  const PLATE_TOP = 1.12;
  const PLATE_LOW = -0.3; // hidden in the slot while up
  const PLATE_D = 0.11; // + 2 × 0.025 bevel ≈ 0.16 ≈ 4 mm
  const PLATE_Z = 0.25 - (PLATE_D + 0.025); // front face at +0.25
  const plateShape = new THREE.Shape();
  {
    const hw = PLATE_W / 2;
    const r = 0.13;
    plateShape.moveTo(-hw, PLATE_LOW);
    plateShape.lineTo(hw, PLATE_LOW);
    plateShape.lineTo(hw, PLATE_TOP - r);
    plateShape.quadraticCurveTo(hw, PLATE_TOP, hw - r, PLATE_TOP);
    plateShape.lineTo(-hw + r, PLATE_TOP);
    plateShape.quadraticCurveTo(-hw, PLATE_TOP, -hw, PLATE_TOP - r);
    plateShape.closePath();
  }
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, {
    depth: PLATE_D,
    curveSegments: 4,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelOffset: -0.025,
    bevelSegments: 2
  });
  plateGeo.translate(0, 0, PLATE_Z);
  {
    // The edges (group 1) sample the plain crimson strip at the bottom of
    // the print, so one material (one draw) covers the whole plate
    const { uv } = plateGeo.attributes;
    plateGeo.groups.filter((gr) => gr.materialIndex === 1).forEach((gr) => {
      for (let k = gr.start; k < gr.start + gr.count; k++) uv.setXY(k, 0, -0.25);
    });
    plateGeo.clearGroups();
  }
  // The slot: a dark well with a steel lip, fixed to the playfield
  const slotDark = flatten(new THREE.PlaneGeometry(PLATE_W + 0.12, 0.34));
  const slotRim = (() => {
    const ow = (PLATE_W + 0.36) / 2;
    const oh = 0.29;
    const iw = (PLATE_W + 0.1) / 2;
    const ih = 0.16;
    const sh = new THREE.Shape();
    sh.moveTo(-ow, -oh);
    sh.lineTo(ow, -oh);
    sh.lineTo(ow, oh);
    sh.lineTo(-ow, oh);
    sh.closePath();
    const hole = new THREE.Path();
    hole.moveTo(-iw, -ih);
    hole.lineTo(-iw, ih);
    hole.lineTo(iw, ih);
    hole.lineTo(iw, -ih);
    hole.closePath();
    sh.holes.push(hole);
    return flatten(new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }));
  })();
  const slotZ = PLATE_Z + (PLATE_D + 0.05) / 2 - 0.025;
  const faceArt = (letter) => {
    const W = 128;
    const H = 165;
    const vis = Math.round(H * (PLATE_TOP / (PLATE_TOP - PLATE_LOW)));
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#5a0a1c';
    g.fillRect(0, 0, W, H);
    const bg = g.createLinearGradient(0, 0, 0, vis);
    bg.addColorStop(0, '#c21d40');
    bg.addColorStop(0.6, '#8f1029');
    bg.addColorStop(1, '#650b1e');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, vis);
    // Gold frame with a fine inner line
    g.strokeStyle = '#f2c14e';
    g.lineWidth = 5;
    g.strokeRect(8, 8, W - 16, vis - 14);
    g.strokeStyle = 'rgba(242,193,78,.55)';
    g.lineWidth = 1.5;
    g.strokeRect(14, 14, W - 28, vis - 26);
    // Diamond studs in the corners
    g.fillStyle = '#f2c14e';
    [[18, 18], [W - 18, 18], [18, vis - 13], [W - 18, vis - 13]].forEach(([x, y]) => {
      g.beginPath();
      g.moveTo(x, y - 5);
      g.lineTo(x + 5, y);
      g.lineTo(x, y + 5);
      g.lineTo(x - 5, y);
      g.closePath();
      g.fill();
    });
    // The letter, a heavy old-style serif in gold with a cut shadow
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 82px Fraunces, "Iowan Old Style", Georgia, serif';
    g.fillStyle = 'rgba(30,4,10,.75)';
    g.fillText(letter, W / 2 + 2.5, vis / 2 + 5.5);
    const gold = g.createLinearGradient(0, vis * 0.2, 0, vis * 0.85);
    gold.addColorStop(0, '#ffe7a3');
    gold.addColorStop(0.5, '#f2c14e');
    gold.addColorStop(1, '#b8861f');
    g.fillStyle = gold;
    g.fillText(letter, W / 2, vis / 2 + 3);
    // Gloss rolling over the rounded top edge
    const gl = g.createLinearGradient(0, 0, 0, 34);
    gl.addColorStop(0, 'rgba(255,240,230,.4)');
    gl.addColorStop(1, 'rgba(255,240,230,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, W, 34);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    // Cap UVs are the shape's own coordinates
    tex.repeat.set(1 / PLATE_W, 1 / (PLATE_TOP - PLATE_LOW));
    tex.offset.set(0.5, -PLATE_LOW / (PLATE_TOP - PLATE_LOW));
    return tex;
  };
  L.targets.forEach((t) => {
    const g = new THREE.Group();
    g.position.set(t.x, 0, -t.y);
    g.rotation.y = t.a;
    const art = faceArt(t.letter);
    const mat = new THREE.MeshStandardMaterial({
      map: art,
      roughness: 0.3,
      metalness: 0.05,
      envMapIntensity: 0.6,
      emissive: 0xffffff,
      emissiveMap: art,
      emissiveIntensity: 0.3
    });
    const face = new THREE.Mesh(plateGeo, mat);
    face.castShadow = true;
    g.add(face);
    g.userData.keep = true;
    group.add(g);
    // The slot stays put on the playfield (static, so it is batched)
    const slot = new THREE.Group();
    slot.position.copy(g.position);
    slot.rotation.y = t.a;
    const well = new THREE.Mesh(slotDark, materials.bezel);
    well.position.set(0, 0.016, slotZ);
    slot.add(well);
    const rim = new THREE.Mesh(slotRim, materials.slotRim);
    rim.position.set(0, 0, slotZ);
    slot.add(rim);
    group.add(slot);
    refs.targets.push({ group: g, face, mat, down: false });
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

    const light = new THREE.PointLight(0xf2c14e, 13.6, 18, 2); // 0.85 in LAMP units
    light.position.y = 2.4;
    g.add(light);

    g.userData.keep = true;
    group.add(g);
    refs.jackpot = { group: g, trophy, halo, light };
  }

  /* ---- Wireform ramps ---- */
  refs.rampCurves = {};
  refs.rampArches = {};
  // Clear plastic entrances, merged across both ramps (three draws in all)
  const rampPlastic = [];
  const rampEdges = [];
  const rampStickers = [];
  const wireGeos = [];
  refs.rampFlaps = {};
  ['left', 'right'].forEach((side, row) => {
    const curve = rampCurve(THREE, L.ramps[side].path);
    refs.rampCurves[side] = curve;
    wireGeos.push(...wireformGeometries(THREE, curve, RAMP_PLASTIC_T - 0.01));
    const parts = plasticRampParts(THREE, curve, RAMP_PLASTIC_T, row);
    rampPlastic.push(parts.plastic);
    rampEdges.push(...parts.edges);
    rampStickers.push(parts.sticker);

    // Entrance portal: a golden arch at the capture point, flashed on capture
    const p0 = curve.getPointAt(0);
    const arch = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.09, 8, 18, Math.PI),
      materials.goldGlow
    );
    arch.position.set(p0.x, 0.35, p0.z);
    const tan = curve.getTangentAt(0);
    arch.rotation.y = Math.atan2(tan.x, tan.z) + Math.PI / 2;
    arch.userData.keep = true;
    group.add(arch);
    refs.rampArches[side] = arch;

    // The entrance flap: a steel lip from the wood up to where the wires
    // start, so a captured ball is seen to roll on rather than jump
    const flat = new THREE.Vector3(tan.x, 0, tan.z).normalize();
    const run = 0.75;
    const rise = Math.max(0.05, p0.y - 0.08);
    const flap = new THREE.Group();
    flap.position.set(p0.x - flat.x * run * 0.5, rise * 0.5 + 0.01, p0.z - flat.z * run * 0.5);
    flap.rotation.order = 'YXZ';
    flap.rotation.y = Math.atan2(flat.x, flat.z);
    flap.rotation.x = -Math.atan2(rise, run);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, Math.hypot(run, rise) + 0.06), materials.chrome);
    flap.add(lip);
    flap.userData.keep = true;
    flap.userData.restX = flap.rotation.x;
    group.add(flap);
    refs.rampFlaps[side] = flap;
  });
  {
    // Both habitrails, hoops and supports: one baked chrome draw
    const wires = new THREE.Mesh(mergeGeometries(wireGeos.map((g) => (g.index ? g.toNonIndexed() : g)), false), materials.chrome);
    wires.castShadow = true;
    group.add(wires);
  }
  {
    // Polycarbonate: nearly invisible face-on, bright where it turns away
    // (the env catches it), never writing depth so the ball shows through
    const plastic = new THREE.Mesh(mergeGeometries(rampPlastic, false), tameGlints(new THREE.MeshStandardMaterial({
      color: 0xe4ecff,
      roughness: 0.06,
      metalness: 0,
      transparent: true,
      opacity: 0.17,
      envMapIntensity: 1.1,
      side: THREE.DoubleSide,
      depthWrite: false
    }), 0.7));
    plastic.renderOrder = 4;
    plastic.userData.keep = true;
    group.add(plastic);
    // The cut edges of the plastic carry the GI's light: thin lit lines on
    // top, in the bulbs' material (it follows the GI colour, and batches)
    rampEdges.forEach((geo) => group.add(new THREE.Mesh(geo, materials.bulb)));
    refs.rampStickers = rampStickers;
  }

  /* ---- Apron: the angled plate over the drain ---- */
  {
    const apron = new THREE.Shape();
    apron.moveTo(-4.4, -1.6);
    apron.lineTo(2.0, -1.6);
    apron.lineTo(0.2, 3.4);
    apron.lineTo(-2.6, 3.4);
    apron.closePath();
    // Caps (group 0) carry the printed plate, sides (group 1) stay stone
    const plate = new THREE.MeshStandardMaterial({
      map: apronTexture(THREE),
      roughness: 0.45,
      metalness: 0.15,
      envMapIntensity: 0.5
    });
    const mesh = new THREE.Mesh(
      flatten(new THREE.ExtrudeGeometry(apron, { depth: 0.7, bevelEnabled: false })),
      [plate, materials.stoneDark]
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
      { id: 'save', x: L.centerX, y: 4.5, a: 0, color: 0x3ddc7b, disc: true },
      // Just below the orbit switch and in front of the ramp's mouth
      { id: 'leftOrbit', x: -8.95, y: 18.6, a: 0, color: 0x7c8cf8 },
      { id: 'leftRamp', x: -6.2, y: 15.2, a: 0.18, color: 0xf2c14e },
      { id: 'castle', x: L.centerX, y: 19.4, a: 0, color: 0x7c8cf8 },
      { id: 'rightRamp', x: 5.5, y: 15.0, a: -0.18, color: 0xf2c14e },
      { id: 'trolls', x: L.centerX, y: 22.6, a: 0, color: 0x6f9b5a }
    ];
    const discGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 22);
    // The routed pocket the insert drops into
    const bezelGeo = flatten(
      new THREE.ExtrudeGeometry(arrow, { depth: 0.02, bevelEnabled: false })
    ).scale(1.16, 1, 1.16);
    const bezelDisc = new THREE.CylinderGeometry(0.6, 0.6, 0.02, 22);
    // The diffuser: real inserts are frosted so the lamp under them never
    // shows as a hot spot, and the light bleeds a little onto the wood.
    const poolTex = radialTexture(THREE, 0, [
      [0, 'rgba(255,255,255,0.85)'],
      [0.42, 'rgba(255,255,255,0.28)'],
      [1, 'rgba(255,255,255,0)']
    ]);
    const poolGeo = flatten(new THREE.PlaneGeometry(1, 1));
    // The lens: a frosted insert is brightest where the bulb sits under it
    // and falls off toward its edge, with a thin bright rim where the light
    // escapes the cut — the difference between a lit plastic and a sticker.
    const lensCanvas = document.createElement('canvas');
    lensCanvas.width = 128;
    lensCanvas.height = 128;
    {
      const lg = lensCanvas.getContext('2d');
      const grad = lg.createRadialGradient(64, 60, 4, 64, 64, 70);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#cfcfcf');
      grad.addColorStop(0.82, '#707070');
      grad.addColorStop(0.9, '#bdbdbd');
      grad.addColorStop(1, '#4a4a4a');
      lg.fillStyle = grad;
      lg.fillRect(0, 0, 128, 128);
    }
    const lensFor = (disc) => {
      const t = new THREE.CanvasTexture(lensCanvas);
      t.colorSpace = THREE.SRGBColorSpace;
      if (!disc) {
        // Arrow caps carry shape coordinates: x −0.72…0.72, y −0.5…0.86
        t.repeat.set(1 / 1.44, 1 / 1.36);
        t.offset.set(0.5, 0.5 / 1.36);
      }
      return t;
    };
    const arrowLens = lensFor(false);
    const discLens = lensFor(true);
    refs.inserts = {};
    SPOTS.forEach((s) => {
      const mat = materials.insert.clone();
      mat.color = new THREE.Color(s.color);
      mat.emissive = new THREE.Color(s.color);
      mat.emissiveIntensity = 0.12;
      mat.emissiveMap = s.disc ? discLens : arrowLens;
      mat.map = s.disc ? discLens : arrowLens;

      const bezel = new THREE.Mesh(s.disc ? bezelDisc : bezelGeo, materials.bezel);
      bezel.position.set(s.x, 0.016, -s.y);
      bezel.rotation.y = s.a;
      group.add(bezel);

      const mesh = new THREE.Mesh(s.disc ? discGeo : geo, mat);
      mesh.position.set(s.x, 0.035, -s.y);
      mesh.rotation.y = s.a;
      mesh.userData.keep = true;
      group.add(mesh);

      const pool = new THREE.Mesh(
        poolGeo,
        new THREE.MeshBasicMaterial({
          map: poolTex,
          color: new THREE.Color(s.color),
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -3,
          polygonOffsetUnits: -3
        })
      );
      pool.position.set(s.x, 0.05, -s.y);
      pool.scale.setScalar(s.disc ? 2.8 : 3.4);
      pool.renderOrder = 2;
      pool.userData.keep = true;
      group.add(pool);

      const light = new THREE.PointLight(s.color, 0, 7, 2);
      light.position.set(s.x, 0.8, -s.y);
      group.add(light);

      refs.inserts[s.id] = { mesh, mat, light, pool };
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
    blade.userData.keep = true;
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

    // Eyes so it reads as a creature, not a peg, and club-like horns —
    // each pair one mesh (a troll is drawn every frame of a gren)
    const eyes = mergeGeometries([-1, 1].map((side) =>
      new THREE.SphereGeometry(0.13, 12, 8).translate(side * 0.24, 1.42, t.r * 0.72)), false);
    g.add(new THREE.Mesh(eyes, materials.trollEye));
    const horns = mergeGeometries([-1, 1].map((side) =>
      new THREE.ConeGeometry(0.11, 0.42, 8).rotateZ(side * 0.4).translate(side * 0.36, 1.78, 0)), false);
    g.add(new THREE.Mesh(horns, materials.stoneDark));

    // Retracted below the playfield until the mode raises them
    g.position.y = -2.2;
    g.visible = false;
    g.userData.keep = true;
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
    g.userData.keep = true;
    group.add(g);
    return g;
  };
  refs.flippers.left = buildFlipper(L.centerX - L.flipperSpread, L.flipperY);
  refs.flippers.right = buildFlipper(L.centerX + L.flipperSpread, L.flipperY);

  /* ---- Ball ---- */
  // A near-mirror with a strong environment: the ball must pick up the
  // ceiling strips hard enough to stay findable against a dark playfield.
  // Polished steel. It reflects its own environment (index.js hands it one
  // made for it: ceiling fixtures, the backbox, the GI ring at the horizon,
  // the blue playfield below), and every term is held under the bloom
  // threshold — a near-mirror ball sparkling in and out of a third-res bloom
  // is a firefly. The direct-light highlight is allowed to be the hottest
  // thing on it, so it still reads as a small hard glint.
  materials.ball = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.07,
    metalness: 1,
    envMapIntensity: 1.7
  });
  materials.ball.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
      {
        vec3 is = reflectedLight.indirectSpecular;
        is *= min(1.0, 0.64 / max(max(max(is.r, is.g), is.b), 1e-4));
        vec3 ds = reflectedLight.directSpecular;
        ds *= min(1.0, 0.62 / max(max(max(ds.r, ds.g), ds.b), 1e-4));
        vec3 sum = is + ds;
        float k = min(1.0, 0.9 / max(max(max(sum.r, sum.g), sum.b), 1e-4));
        reflectedLight.indirectSpecular = is * k;
        reflectedLight.directSpecular = ds * k;
      }`
    );
  };
  materials.ball.customProgramCacheKey = () => 'pb-ball-steel';
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(L.ballRadius, 40, 28),
    materials.ball
  );
  ball.castShadow = true;
  ball.userData.keep = true;
  group.add(ball);
  refs.ball = ball;

  // Contact shadow. The shadow map covers the whole table, so its softest
  // penumbra is wider than the ball itself and the ball reads as hovering.
  // A tight dark blob pinned under it is what puts it back on the wood.
  // Tight and dark at the core (the contact), soft at the edge (the
  // occlusion round it): what keeps a small ball on the wood in portrait
  refs.contactTexture = radialTexture(THREE, 0, [
    [0, 'rgba(0,0,0,0.82)'],
    [0.28, 'rgba(0,0,0,0.6)'],
    [0.6, 'rgba(0,0,0,0.18)'],
    [1, 'rgba(0,0,0,0)']
  ]);
  refs.contactGeometry = flatten(new THREE.PlaneGeometry(1, 1));

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
    plunger.userData.keep = true;
    group.add(plunger);
    refs.plunger = plunger;

    // The shooter spring: a steel coil round the rod from the lane wall to
    // the knob, built one unit long and stretched to fit every frame, so it
    // visibly loads up as the plunger is drawn back
    const turns = 9;
    const pts = [];
    for (let i = 0; i <= turns * 14; i++) {
      const t = i / (turns * 14);
      const a = t * turns * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.27, Math.sin(a) * 0.27, t));
    }
    const coil = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 18, 0.034, 5, false),
      materials.chrome
    );
    coil.position.set(L.laneBallX, 0.55, -L.laneBottomY + L.laneWallR);
    coil.userData.keep = true;
    group.add(coil);
    refs.spring = coil;
  }

  /* ---- Plastics, GI bulbs, flashers and the lamp matrix ---- */
  const plastics = buildPlastics(THREE, materials, mergeGeometries, refs.rampStickers);
  delete refs.rampStickers;
  group.add(plastics.group);
  refs.plastics = plastics.material;
  const flashers = buildFlashers(THREE, materials);
  group.add(flashers.group);
  refs.flashers = flashers.list;
  const lamps = buildLamps(THREE, materials, mergeGeometries);
  group.add(lamps.group);
  refs.lamps = lamps;

  // Everything static becomes a handful of merged meshes
  refs.baked = bakeStatic(THREE, mergeGeometries, group);

  return { group, refs };
}

export { mirrorX };
