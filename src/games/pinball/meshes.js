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
  [m.chrome, m.rail, m.armour].forEach((mat) => tameGlints(mat));
  return m;
}

/* ----------------------------------------------------------- the machine */

/**
 * Where the cabinet sits around the playfield. Everything the cabinet builds
 * hangs off these, and index.js frames the camera on them.
 */
export const CAB = {
  x0: -L.flareX - 1.15,
  x1: L.outerX + 1.15,
  z0: 2.1, // front edge, on the player's side of the apron
  z1: -(L.domeY + L.domeOuterR + 1.2),
  glassY: 6.4, // the glass clears the tallest ramp and the castle roofs
  railY: 4.7, // top edge of the side armour
  backH: 7.4, // how far the backbox stands above the playfield
  headTilt: 0.44, // leans away from the player, as a real head does
  // The DMD window in the head, in head-face units from its bottom centre.
  // Big on purpose: on a phone the head is ~250 px wide, and the display
  // has to stay legible at that size.
  dmd: { w: 15.6, h: 3.9, y: 2.5 }
};

/** World-space top edge of the backbox, for framing the camera */
export function headTop() {
  return {
    y: CAB.backH * Math.cos(CAB.headTilt),
    z: CAB.z1 + 0.4 - CAB.backH * Math.sin(CAB.headTilt)
  };
}

/**
 * The head's face art: a translite lit from behind across the top, and the
 * speaker panel below it with the DMD window and two grilles — the layout of
 * every machine since the mid-nineties.
 */
function backglassTexture(THREE, logo, faceW, faceH) {
  const W = 2048;
  const H = Math.round((W * faceH) / faceW);
  const u = W / faceW; // pixels per unit
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');

  // Face-space helpers: x from the centre, y up from the bottom of the face
  const X = (x) => W / 2 + x * u;
  const Y = (y) => H - y * u;
  const { dmd } = CAB;
  // The face plane starts 0.35 above the head's bottom edge
  const dy = dmd.y - 0.35;
  const panelTop = dy + dmd.h / 2 + 0.45;

  /* ---- Translite ---- */
  const tlTop = 0;
  const tlBot = Y(panelTop);
  const bg = g.createLinearGradient(0, tlTop, 0, tlBot);
  bg.addColorStop(0, '#1d2a62');
  bg.addColorStop(1, '#0b1030');
  g.fillStyle = bg;
  g.fillRect(0, tlTop, W, tlBot);
  // Lit from behind, so the light pools behind the artwork
  const pool = g.createRadialGradient(W / 2, tlBot * 0.55, 20, W / 2, tlBot * 0.55, W * 0.42);
  pool.addColorStop(0, 'rgba(242,193,78,.42)');
  pool.addColorStop(0.5, 'rgba(124,140,248,.18)');
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, tlTop, W, tlBot);
  // Stars over the castle sky
  for (let i = 0; i < 70; i++) {
    g.fillStyle = `rgba(255,240,210,${0.25 + Math.random() * 0.5})`;
    g.fillRect(Math.random() * W, Math.random() * tlBot * 0.8, 2.5, 2.5);
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const tlH = tlBot - tlTop;
  if (logo && logo.width) {
    const h = tlH * 0.8;
    const w = (h * logo.width) / logo.height;
    g.save();
    g.shadowColor = 'rgba(242,193,78,.9)';
    g.shadowBlur = 40;
    g.drawImage(logo, W * 0.045, tlTop + tlH * 0.1, w, h);
    g.restore();
  }
  // Castle silhouette on the right, pennants flying
  {
    const bx = W * 0.83;
    const by = tlBot - 6;
    g.fillStyle = '#0a0e24';
    g.strokeStyle = 'rgba(242,193,78,.85)';
    g.lineWidth = 4;
    const path = new Path2D();
    const s = tlH / 230;
    const pts = [
      [-150, 0], [-150, -120], [-170, -120], [-130, -190], [-90, -120], [-110, -120], [-110, -80], [-60, -80],
      [-60, -100], [-40, -100], [-40, -80], [-20, -80], [-20, -100], [0, -100], [0, -80], [20, -80],
      [20, -100], [40, -100], [40, -80], [60, -80], [60, -100], [80, -100], [80, -80], [110, -80],
      [110, -120], [90, -120], [130, -190], [170, -120], [150, -120], [150, 0]
    ];
    pts.forEach(([px, py], i) => (i ? path.lineTo(bx + px * s, by + py * s) : path.moveTo(bx + px * s, by + py * s)));
    path.closePath();
    g.fill(path);
    g.shadowColor = 'rgba(242,193,78,.8)';
    g.shadowBlur = 16;
    g.stroke(path);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,200,110,.9)';
    g.beginPath();
    g.arc(bx, by - 30 * s, 22 * s, Math.PI, 0);
    g.lineTo(bx + 22 * s, by);
    g.lineTo(bx - 22 * s, by);
    g.fill();
    g.fillStyle = '#7c8cf8';
    [[-130, -190], [130, -190]].forEach(([px, py]) => {
      g.fillRect(bx + px * s - 2, by + (py - 40) * s, 4, 40 * s);
      g.beginPath();
      g.moveTo(bx + px * s + 2, by + (py - 40) * s);
      g.lineTo(bx + (px + 34) * s, by + (py - 30) * s);
      g.lineTo(bx + px * s + 2, by + (py - 20) * s);
      g.fill();
    });
  }
  g.fillStyle = '#f2c14e';
  g.font = `700 ${Math.round(tlH * 0.36)}px Fraunces, Georgia, serif`;
  g.letterSpacing = '8px';
  g.shadowColor = 'rgba(242,193,78,.85)';
  g.shadowBlur = 28;
  g.fillText('PEKKAS POKAL', W / 2, tlTop + tlH * 0.42);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(214,222,255,.85)';
  g.font = `700 ${Math.round(tlH * 0.13)}px "Schibsted Grotesk", Inter, sans-serif`;
  g.letterSpacing = '14px';
  g.fillText('FLIPPER · 2025', W / 2, tlTop + tlH * 0.78);
  g.letterSpacing = '0px';

  /* ---- Speaker panel: unlit black plastic ---- */
  const panel = g.createLinearGradient(0, tlBot, 0, H);
  panel.addColorStop(0, '#15172a');
  panel.addColorStop(1, '#07080f');
  g.fillStyle = panel;
  g.fillRect(0, tlBot, W, H - tlBot);
  g.fillStyle = 'rgba(242,193,78,.75)';
  g.fillRect(0, tlBot - 3, W, 6);

  // DMD well: the dark bezel the plasma sits back in
  const mx = (dmd.w / 2 + 0.28) * u;
  const my0 = Y(dy + dmd.h / 2 + 0.28);
  const my1 = Y(dy - dmd.h / 2 - 0.28);
  g.fillStyle = '#020203';
  g.beginPath();
  g.roundRect(W / 2 - mx, my0, mx * 2, my1 - my0, 18);
  g.fill();
  g.strokeStyle = 'rgba(160,170,200,.35)';
  g.lineWidth = 4;
  g.stroke();

  // Speaker grilles either side: a ring of chrome round a field of holes
  const gx = dmd.w / 2 + (faceW / 2 - dmd.w / 2) / 2;
  [-gx, gx].forEach((sx) => {
    const cx = X(sx);
    const cy = Y(dy);
    const r = Math.min(((faceW / 2 - dmd.w / 2) / 2 - 0.15) * u, (dmd.h / 2) * u);
    g.fillStyle = '#10121e';
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#000';
    for (let y = -r; y <= r; y += 11) {
      for (let x = -r; x <= r; x += 11) {
        if (x * x + y * y < (r - 8) * (r - 8)) g.fillRect(cx + x - 2.5, cy + y - 2.5, 5, 5);
      }
    }
    g.strokeStyle = 'rgba(200,210,235,.6)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.stroke();
  });

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * The cabinet the playfield lives in: body, side armour, lockdown bar and a
 * lit backglass standing at the far end.
 *
 * Without it the table floats in a void, which is the single thing that most
 * gives away a pinball render as a diorama rather than a photograph. The
 * armour and the lockdown bar are also the brightest metal in frame, so they
 * do the job a picture frame does — they bound the composition.
 */
export function buildCabinet(THREE, materials, logo, dmdMaterial) {
  const g = new THREE.Group();
  const refs = {};
  const { x0, x1, z0, z1, railY, backH, dmd } = CAB;
  const w = x1 - x0;
  const len = z0 - z1;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;

  // Body below the playfield, as deep as a real cabinet: on a wide screen
  // the floor is in frame and a shallow box would read as a tray on stilts.
  // Top face must land BELOW the playfield plane, not on it: at y = 0 this
  // box covers the entire print and the table renders as a dark slab. And
  // well below — the playfield covers it completely, and a top face a
  // tenth of a unit under the wood fights it in a 16-bit depth buffer.
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 12, len), materials.cabinet);
  body.position.set(cx, -6 - 0.5, cz);
  body.receiveShadow = true;
  g.add(body);

  // Inner cabinet walls, standing just outside the playfield's own guides
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, railY, len),
      materials.cabinet
    );
    wall.position.set(side < 0 ? x0 + 0.25 : x1 - 0.25, railY / 2, cz);
    wall.receiveShadow = true;
    g.add(wall);
  });

  // Side armour: the polished trim that carries the glass
  [-1, 1].forEach((side) => {
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.78, 1.5, len),
      materials.armour
    );
    rail.position.set(side < 0 ? x0 + 0.3 : x1 - 0.3, railY + 0.5, cz);
    rail.castShadow = true;
    g.add(rail);
  });

  // Lockdown bar across the front — the bright bar at the bottom of every
  // pinball photograph, and the thing that says "this is a machine".
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, w, 20, 1, false, -Math.PI / 2, Math.PI * 1.35),
    materials.armour
  );
  bar.rotation.z = Math.PI / 2;
  bar.position.set(cx, railY + 0.62, z0 - 0.5);
  bar.castShadow = true;
  g.add(bar);

  const front = new THREE.Mesh(
    new THREE.BoxGeometry(w, railY + 0.4, 0.6),
    materials.cabinet
  );
  front.position.set(cx, (railY + 0.4) / 2, z0 - 0.3);
  g.add(front);

  /* ---- Backbox: translite, speaker panel and the DMD ---- */
  {
    const head = new THREE.Group();
    head.position.set(cx, 0, z1 + 0.4);
    head.rotation.x = -CAB.headTilt;

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(w, backH, 0.9),
      materials.cabinet
    );
    shell.position.set(0, backH / 2, -0.5);
    head.add(shell);

    const faceW = w - 1.2;
    const faceH = backH - 0.7;
    const tex = backglassTexture(THREE, logo, faceW, faceH);
    // A backglass is a lamp: it must not be shaded by the playfield's lights
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(faceW, faceH),
      new THREE.MeshBasicMaterial({ map: tex })
    );
    glass.position.set(0, backH / 2, 0.02);
    head.add(glass);

    // The display sits proud of the panel art, in the well drawn round it
    if (dmdMaterial) {
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(dmd.w, dmd.h), dmdMaterial);
      screen.position.set(0, dmd.y, 0.06);
      head.add(screen);
      refs.dmd = screen;
    }

    // Chrome bezel around the glass
    const bezel = new THREE.Mesh(
      new THREE.BoxGeometry(w, backH, 0.3),
      materials.armour
    );
    bezel.position.set(0, backH / 2, -0.16);
    head.add(bezel);

    // The head throws light down the upper playfield
    const lamp = new THREE.PointLight(0xffd39a, 70, 44, 2);
    lamp.position.set(0, 3.2, 2.6);
    head.add(lamp);

    g.add(head);
    refs.backglass = glass;
    refs.headLamp = lamp;
  }

  return { group: g, refs };
}

/**
 * The playfield glass.
 *
 * Everything is played through a sheet of tempered glass, and the streaks of
 * the room's ceiling lights sliding across it are most of what makes a
 * pinball render read as a photograph.
 *
 * Drawn as three narrow bars rather than one sheet over the whole opening:
 * additive black is a no-op, so a full-size quad spends its entire fill rate
 * blending nothing over most of the table. The bars cover about a fifth of
 * the area for the same picture.
 */
export function buildGlass(THREE) {
  const W = 64;
  const H = 256;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // Fades in and out along its length, brightest along its spine
    const along = Math.pow(Math.sin(Math.PI * ((y + 0.5) / H)), 0.55);
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W - 0.5;
      const across = Math.exp(-(u * u) / 0.022);
      const i = (y * W + x) * 4;
      img.data[i] = 214;
      img.data[i + 1] = 228;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(along * across * 255);
    }
  }
  g.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1, 1);
  const group = new THREE.Group();
  const cx = (CAB.x0 + CAB.x1) / 2;
  const cz = (CAB.z0 + CAB.z1) / 2;

  // Two reflections of the ceiling fixtures. Kept narrow: every pixel of an
  // additive quad is blended whether it adds anything or not, and this is a
  // phone-first game, so the bars are sized to what actually reads.
  [
    { w: 2.6, l: 34, x: -4.2, z: 0, rot: 0.11, a: 0.36 },
    { w: 1.8, l: 26, x: 4.4, z: -6, rot: -0.08, a: 0.26 }
  ].forEach((b) => {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        opacity: b.a,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide
      })
    );
    mesh.scale.set(b.w, b.l, 1);
    mesh.rotation.set(-Math.PI / 2, 0, b.rot);
    mesh.position.set(cx + b.x, CAB.glassY, cz + b.z);
    mesh.renderOrder = 5;
    group.add(mesh);
  });
  return group;
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
  const lamp = new THREE.PointLight(0xf2c14e, 9.6, 14, 2); // 0.6 in LAMP units
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

    // The lamp bead that lives inside the cap. Small, very bright, and read
    // through the plastic — which is what gives a pop bumper its glow.
    const bead = new THREE.Mesh(
      new THREE.SphereGeometry(L.bumperR * 0.26, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false })
    );
    bead.position.y = 1.06;
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
    dome.position.y = 0.94;
    dome.renderOrder = 3;
    g.add(dome);

    const light = new THREE.PointLight(0xf2c14e, 0, 11, 2);
    light.position.y = 1.9;
    g.add(light);

    group.add(g);
    refs.bumpers.push({ group: g, ring, trophy: dome, bead, light, base: 0, isTrophy: false });
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

    const light = new THREE.PointLight(0xf2c14e, 13.6, 18, 2); // 0.85 in LAMP units
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
      { id: 'save', x: L.centerX, y: 4.5, a: 0, color: 0x3ddc7b, disc: true },
      { id: 'leftOrbit', x: -8.95, y: 15.4, a: 0, color: 0x7c8cf8 },
      { id: 'leftRamp', x: -6.75, y: 14.4, a: 0.18, color: 0xf2c14e },
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
    refs.inserts = {};
    SPOTS.forEach((s) => {
      const mat = materials.insert.clone();
      mat.color = new THREE.Color(s.color);
      mat.emissive = new THREE.Color(s.color);
      mat.emissiveIntensity = 0.12;

      const bezel = new THREE.Mesh(s.disc ? bezelDisc : bezelGeo, materials.bezel);
      bezel.position.set(s.x, 0.016, -s.y);
      bezel.rotation.y = s.a;
      group.add(bezel);

      const mesh = new THREE.Mesh(s.disc ? discGeo : geo, mat);
      mesh.position.set(s.x, 0.035, -s.y);
      mesh.rotation.y = s.a;
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
  // A near-mirror with a strong environment: the ball must pick up the
  // ceiling strips hard enough to stay findable against a dark playfield.
  materials.ball = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.09,
    metalness: 1,
    envMapIntensity: 2
  });
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(L.ballRadius, 40, 28),
    materials.ball
  );
  ball.castShadow = true;
  group.add(ball);
  refs.ball = ball;

  // Contact shadow. The shadow map covers the whole table, so its softest
  // penumbra is wider than the ball itself and the ball reads as hovering.
  // A tight dark blob pinned under it is what puts it back on the wood.
  refs.contactTexture = radialTexture(THREE, 0, [
    [0, 'rgba(0,0,0,0.62)'],
    [0.45, 'rgba(0,0,0,0.3)'],
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
    group.add(plunger);
    refs.plunger = plunger;
  }

  return { group, refs };
}

export { mirrorX };
