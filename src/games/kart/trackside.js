import * as THREE from 'three';
import { createBatch, trackRibbon, createClearance, faceTrack, canvasTexture, atlasPlane } from './kit.js';
import { trackLayout, asphaltMaterial, paintMaterial, surfaceMaterial, EDGE_LINE, GRID_SLOTS, KERB_INNER, KERB_OUTER } from './surfaces.js';
import { ROAD_HALF_WIDTH } from './route.js';

/** Original, invented sponsors only. */
export const ADVERTS = [
  { text: 'PEKKAS POKAL', bg: '#173b32', fg: '#f2c05c' },
  { text: 'VARGGROPEN KRC', bg: '#b8382c', fg: '#ffffff' },
  { text: 'KORV & KAFFE', bg: '#f2c94c', fg: '#2a2a22' },
  { text: 'LINDQVISTS DÄCK', bg: '#1d2321', fg: '#f4f1e6' },
  { text: 'ÅSENS BAGERI', bg: '#f1e4c6', fg: '#6b3b22' },
  { text: 'SKOGSGLASS', bg: '#2f6fb0', fg: '#ffffff' },
  { text: 'NORRBY RÖR', bg: '#1f6f6a', fg: '#f4f1e6' },
  { text: 'BYGDENS BIL', bg: '#e9782f', fg: '#1d1d1d' }
];
const RED = 0xc8372b, WHITE = 0xece8dc;

/** Road surface, kerbs and paint, then the furniture that sells speed: tyre
 * walls, catch fences, marker boards, adverts and cones close to the edge. */
export function buildTrackside(route, root, { anisotropy = 4, phone = false, random = Math.random } = {}) {
  const layout = trackLayout();
  const { length, sample } = route;
  const clear = createClearance(route);
  const group = new THREE.Group(); group.name = 'trackside'; root.add(group);
  const batch = createBatch();
  const mat = (color, roughness = 0.8, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  const steel = mat(0x8a948f, 0.5, 0.6), painted = mat(0xffffff, 0.7, 0, { vertexColors: true });
  painted.name = 'painted'; steel.name = 'steel';

  /* ---------------------------------------------------------- road surface */
  const gravel = surfaceMaterial('gravel', anisotropy);
  const gravelMesh = new THREE.Mesh(trackRibbon(route, { from: -4.75, to: 4.75, lift: 0.012, columns: 2 }), gravel);
  gravelMesh.receiveShadow = true; gravelMesh.name = 'gravel'; group.add(gravelMesh);
  const asphalt = asphaltMaterial(anisotropy);
  const road = new THREE.Mesh(trackRibbon(route, {
    from: -ROAD_HALF_WIDTH, to: ROAD_HALF_WIDTH, lift: 0.04, columns: 6, step: 0.6,
    track: (d) => layout.racingLine(d), color: () => 1
  }), asphalt);
  road.receiveShadow = true; road.name = 'asphalt'; group.add(road);

  /* ---------------------------------------------------------- paint */
  const paint = paintMaterial();
  const paintBatch = createBatch();
  // Edge lines run everywhere except under a kerb.
  for (const side of [-1, 1]) {
    let runStart = null;
    for (let d = 0; d <= length; d += 0.5) {
      const kerb = d < length && layout.kerbAt(d, side);
      if (!kerb && runStart === null) runStart = d;
      if ((kerb || d >= length) && runStart !== null) {
        if (d - runStart > 0.6) paintBatch.addMatrix(trackRibbon(route, { from: side * EDGE_LINE[0], to: side * EDGE_LINE[1], start: runStart, end: d, lift: 0.048, step: 1 }), paint, new THREE.Matrix4(), WHITE);
        runStart = null;
      }
    }
  }
  // Start/finish: a chequered band, a solid line on its leading edge.
  const tile = 0.5, rows = 3;
  for (let row = 0; row < rows; row++) for (let i = 0; i < 14; i++) {
    const d0 = -0.75 + row * tile, lane0 = -3.5 + i * tile;
    paintBatch.addMatrix(trackRibbon(route, { from: lane0, to: lane0 + tile, start: d0, end: d0 + tile, lift: 0.048, step: tile }), paint, new THREE.Matrix4(), (row + i) % 2 ? 0x1b1f1d : WHITE);
  }
  paintBatch.addMatrix(trackRibbon(route, { from: -3.5, to: 3.5, start: 0.75, end: 0.9, lift: 0.048, step: 0.15 }), paint, new THREE.Matrix4(), WHITE);
  // Grid boxes: front bar and two short side legs, painted on the asphalt.
  for (const slot of GRID_SLOTS) {
    const front = slot.distance + 1.25, w = 0.85, line = 0.09;
    paintBatch.addMatrix(trackRibbon(route, { from: slot.lane - w, to: slot.lane + w, start: front - line, end: front, lift: 0.048, step: 0.1 }), paint, new THREE.Matrix4(), WHITE);
    for (const edge of [-1, 1]) {
      const lane = slot.lane + edge * w;
      paintBatch.addMatrix(trackRibbon(route, { from: lane - line / 2, to: lane + line / 2, start: front - 1.6, end: front, lift: 0.048, step: 0.4 }), paint, new THREE.Matrix4(), WHITE);
    }
  }
  paintBatch.build(group, { castShadow: false, name: 'paint' });

  /* ---------------------------------------------------------- kerbs */
  // Crowned profile across the kerb (lane offset from its inner edge, height
  // over the terrain): 8 mm above the asphalt at the road, 4.5 cm crown.
  const width = KERB_OUTER - KERB_INNER;
  const profile = [[0, 0.046], [0.1, 0.07], [0.32, 0.084], [width - 0.22, 0.08], [width - 0.08, 0.05], [width, 0.012]];
  const kerbPositions = [], kerbColors = [], kerbIndices = [];
  const red = new THREE.Color(RED), white = new THREE.Color(WHITE);
  for (const kerb of layout.kerbs) {
    const pieceLength = (kerb.end - kerb.start) / kerb.pieces;
    for (let piece = 0; piece < kerb.pieces; piece++) {
      const color = piece % 2 ? white : red;
      const base = kerbPositions.length / 3;
      const rowsPerPiece = 3;
      for (let r = 0; r < rowsPerPiece; r++) {
        // Tiny gap between pieces gives each block an edge.
        const d = kerb.start + pieceLength * (piece + 0.015 + 0.97 * r / (rowsPerPiece - 1));
        for (const [offset, height] of profile) {
          const lane = kerb.side * (KERB_INNER + offset);
          const p = sample(d, lane).position;
          kerbPositions.push(p.x, p.y + height, p.z);
          kerbColors.push(color.r, color.g, color.b);
        }
      }
      const cols = profile.length;
      for (let r = 0; r < rowsPerPiece - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const a = base + r * cols + c, b = a + cols;
        if (kerb.side > 0) kerbIndices.push(a, b, a + 1, a + 1, b, b + 1); else kerbIndices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const kerbGeometry = new THREE.BufferGeometry();
  kerbGeometry.setAttribute('position', new THREE.Float32BufferAttribute(kerbPositions, 3));
  kerbGeometry.setAttribute('color', new THREE.Float32BufferAttribute(kerbColors, 3));
  kerbGeometry.setIndex(kerbIndices); kerbGeometry.computeVertexNormals();
  const kerbMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const kerbMesh = new THREE.Mesh(kerbGeometry, kerbMaterial); kerbMesh.name = 'kerbs';
  kerbMesh.receiveShadow = true; group.add(kerbMesh);

  /* ---------------------------------------------------------- tyre walls */
  const tireGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.18, -0.12), new THREE.Vector2(0.29, -0.125), new THREE.Vector2(0.34, -0.07),
    new THREE.Vector2(0.345, 0), new THREE.Vector2(0.34, 0.07), new THREE.Vector2(0.29, 0.125), new THREE.Vector2(0.18, 0.12)
  ], phone ? 9 : 12);
  const tireMaterial = mat(0xffffff, 0.86);
  const tirePlaces = [];
  const dummy = new THREE.Object3D();
  const banded = [0xf2efe4, 0xc8372b, 0xf2efe4, 0x2f6fb0];
  for (const corner of layout.corners) {
    const side = -corner.sign;
    for (let d = corner.start - 10; d < corner.end + 12; d += 0.68) {
      const s = sample(d, side * 5.05);
      if (!clear(s.position.x, s.position.z, d, 5.6)) continue;
      const block = Math.floor((d - corner.start) / 2.04);
      tirePlaces.push({ s, tiers: 3, band: banded[((block % 4) + 4) % 4], bandTier: 1 });
    }
  }
  const tires = new THREE.InstancedMesh(tireGeo, tireMaterial, tirePlaces.length * 3 + 1);
  let tireCount = 0;
  const rubber = new THREE.Color(0x232624), bandColor = new THREE.Color();
  for (const { s, tiers, band, bandTier } of tirePlaces) {
    for (let tier = 0; tier < tiers; tier++) {
      dummy.position.copy(s.position); dummy.position.y += 0.13 + tier * 0.25;
      dummy.rotation.set(0, s.angle + tier * 0.4, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      tires.setMatrixAt(tireCount, dummy.matrix);
      tires.setColorAt(tireCount++, tier === bandTier ? bandColor.set(band) : rubber);
    }
  }
  tires.count = tireCount; tires.castShadow = tires.receiveShadow = true; tires.name = 'tyre-walls';
  tires.computeBoundingSphere(); group.add(tires);

  /* ---------------------------------------------------------- catch fences */
  const straights = [];
  const inCorner = d => layout.corners.some(c => d > c.start - 14 && d < c.end + 14);
  for (let d = 0; d < length; d += 2.5) {
    const last = straights[straights.length - 1];
    if (inCorner(d)) continue;
    if (last && d - last.end <= 2.5) last.end = d; else straights.push({ start: d, end: d });
  }
  const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6); postGeo.translate(0, 0.9, 0);
  const fencePosts = [], netPieces = [];
  const startZone = d => (d > length - 32 || d < 26);
  for (const straight of straights) {
    for (const side of [-1, 1]) {
      let run = [];
      const flush = () => { if (run.length > 3) netPieces.push(run); run = []; };
      for (let d = straight.start; d <= straight.end; d += 2.5) {
        const lane = side * 7.2;
        const s = sample(d, lane);
        const ok = clear(s.position.x, s.position.z, d, 8.5) && !(side > 0 && startZone(d)) && Math.floor(d / 45) % 4 !== 3;
        if (!ok) { flush(); continue; }
        run.push({ d, lane, s });
        fencePosts.push(s);
      }
      flush();
    }
  }
  const posts = new THREE.InstancedMesh(postGeo, steel, Math.max(1, fencePosts.length));
  fencePosts.forEach((s, i) => { dummy.position.copy(s.position); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); posts.setMatrixAt(i, dummy.matrix); });
  posts.count = fencePosts.length; posts.castShadow = true; posts.receiveShadow = true; posts.name = 'fence-posts';
  posts.computeBoundingSphere(); group.add(posts);
  const netTexture = wireTexture(anisotropy);
  const netMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa59f, map: netTexture, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.55, metalness: 0.45 });
  const netPositions = [], netUv = [], netIndex = [];
  for (const run of netPieces) {
    let travelled = 0;
    run.forEach((point, i) => {
      if (i) travelled += point.s.position.distanceTo(run[i - 1].s.position);
      const base = netPositions.length / 3;
      netPositions.push(point.s.position.x, point.s.position.y + 0.12, point.s.position.z, point.s.position.x, point.s.position.y + 1.75, point.s.position.z);
      netUv.push(travelled / 0.34, 0, travelled / 0.34, 1.63 / 0.34);
      if (i) netIndex.push(base - 2, base, base - 1, base - 1, base, base + 1);
    });
  }
  const netGeometry = new THREE.BufferGeometry();
  netGeometry.setAttribute('position', new THREE.Float32BufferAttribute(netPositions, 3));
  netGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(netUv, 2));
  netGeometry.setIndex(netIndex); netGeometry.computeVertexNormals();
  const net = new THREE.Mesh(netGeometry, netMaterial); net.name = 'catch-fence'; net.receiveShadow = true; group.add(net);
  // Top rail on every run.
  for (const run of netPieces) for (let i = 1; i < run.length; i++) {
    const a = run[i - 1].s.position, b = run[i].s.position;
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.y += 1.78;
    const len = a.distanceTo(b);
    batch.add(new THREE.CylinderGeometry(0.022, 0.022, 1, 5), steel, mid.toArray(), [0, Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2, Math.PI / 2], [1, len, 1]);
  }

  /* ---------------------------------------------------------- boards */
  const atlas = boardAtlas(anisotropy);
  const boardMaterial = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.62, metalness: 0, side: THREE.FrontSide });
  boardMaterial.name = 'boards';
  const boardBatch = createBatch();
  const backing = new THREE.BoxGeometry(1, 1, 1);
  const addBoard = (d, lane, w, h, rect, y = 0.12) => {
    const s = sample(d, lane), facing = faceTrack(s, lane);
    const at = s.position.clone(); at.y += y + h / 2;
    boardBatch.add(atlasPlane(w, h, rect), boardMaterial, at.toArray(), [0, facing, 0]);
    const back = new THREE.Vector3(Math.sin(facing), 0, Math.cos(facing)).multiplyScalar(-0.035);
    batch.add(backing, painted, at.clone().add(back).toArray(), [0, facing, 0], [w + 0.06, h + 0.06, 0.05], 0x30383a);
    return { s, facing, at };
  };
  // Adverts in short rows on the straights, just beyond the gravel.
  let advert = 0;
  for (const straight of straights) {
    for (const side of [-1, 1]) {
      for (let d = straight.start + 6; d + 3 < straight.end - 6; d += 3) {
        if (Math.floor((d + side * 13) / 24) % 2) continue;
        if (side > 0 && startZone(d)) continue;
        const lane = side * 6.1, s = sample(d, lane);
        if (!clear(s.position.x, s.position.z, d, 7.2)) continue;
        const i = advert++ % ADVERTS.length;
        const board = addBoard(d, lane, 2.8, 0.7, advertRect(i), 0.08);
        for (const x of [-1.2, 1.2]) {
          const off = new THREE.Vector3(Math.cos(board.facing), 0, -Math.sin(board.facing)).multiplyScalar(x);
          batch.add(new THREE.BoxGeometry(0.06, 0.12, 0.3), painted, board.at.clone().add(off).setY(board.s.position.y + 0.06).toArray(), [0, board.facing, 0], 1, 0x30383a);
        }
      }
    }
  }
  // Countdown boards 3-2-1 before the four tight corners, on the outside.
  const markers = [];
  for (const corner of layout.corners.filter(c => c.peak > 0.085)) {
    const side = -corner.sign;
    [3, 2, 1].forEach((n, i) => {
      const d = corner.start - 34 + i * 10;
      const lane = side * 5.7, s = sample(d, lane);
      if (!clear(s.position.x, s.position.z, d, 6.5)) return;
      const board = addBoard(d, lane, 0.62, 0.62, markerRect(n), 0.62);
      batch.add(new THREE.CylinderGeometry(0.035, 0.035, 0.66, 6), steel, [s.position.x, s.position.y + 0.33, s.position.z]);
      markers.push({ distance: d, lane, number: n, facing: board.facing });
    });
  }
  boardBatch.build(group, { name: 'boards' });

  /* ---------------------------------------------------------- cones */
  const coneGeo = coneGeometry();
  const conePlaces = [];
  for (const corner of layout.corners) {
    for (const offset of [-5, 0, 5]) {
      const d = corner.apex + offset, lane = corner.sign * 4.75, s = sample(d, lane);
      if (clear(s.position.x, s.position.z, d, 5.4)) conePlaces.push(s);
    }
    // A pair where the exit kerb ends: the classic "don't cut here" marker.
    const exit = layout.kerbs.find(k => k.kind === 'exit' && Math.abs(k.start - (corner.start + (corner.end - corner.start) * 0.55)) < 2);
    if (exit) for (const extra of [0.6, 1.8]) {
      const s = sample(exit.end + extra, -corner.sign * 4.7);
      if (clear(s.position.x, s.position.z, exit.end, 5.3)) conePlaces.push(s);
    }
  }
  const coneMaterial = mat(0xffffff, 0.6, 0, { vertexColors: true });
  const cones = new THREE.InstancedMesh(coneGeo, coneMaterial, Math.max(1, conePlaces.length));
  conePlaces.forEach((s, i) => { dummy.position.copy(s.position); dummy.position.y += 0.01; dummy.rotation.set(0, random() * 6, 0); dummy.updateMatrix(); cones.setMatrixAt(i, dummy.matrix); });
  cones.count = conePlaces.length; cones.castShadow = true; cones.receiveShadow = true; cones.name = 'cones';
  cones.computeBoundingSphere(); group.add(cones);

  /* ---------------------------------------------------------- close trees */
  // The back section runs through the wood: birches and spruces close behind
  // the fences, so the edge of the frame flickers past at speed.
  const trees = [];
  for (let d = 118; d < 330; d += 4.2) {
    for (const side of [-1, 1]) {
      if (random() < 0.35) continue;
      const lane = side * (9 + random() * 5), s = sample(d, lane);
      if (!clear(s.position.x, s.position.z, d, 9.5)) continue;
      trees.push({ x: s.position.x, y: s.position.y, z: s.position.z, height: 5 + random() * 4.5, type: random() < 0.6 ? 'birch' : 'spruce', haze: 0, details: phone ? { clumps: 14, tiers: 6, arms: 6 } : {} });
    }
  }

  batch.build(group, { name: 'trackside' });
  return { group, trees, markers, clear, straights, layout };
}

function advertRect(i) {
  const col = i % 2, row = Math.floor(i / 2);
  return [col * 0.5, 1 - (row + 1) * 0.2, (col + 1) * 0.5, 1 - row * 0.2];
}
function markerRect(n) {
  const cell = 3 - n; // 3, 2, 1 → cells 0, 1, 2
  return [cell * 0.125, 0, (cell + 1) * 0.125, 0.2];
}

/** 1024 x 640: eight adverts (512 x 128) over a row of square marker boards. */
function boardAtlas(anisotropy) {
  return canvasTexture(1024, 640, (c) => {
    ADVERTS.forEach((ad, i) => {
      const x = (i % 2) * 512, y = Math.floor(i / 2) * 128;
      c.fillStyle = ad.bg; c.fillRect(x, y, 512, 128);
      c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; c.strokeRect(x + 6, y + 6, 500, 116);
      c.fillStyle = ad.fg; c.textAlign = 'center'; c.textBaseline = 'middle';
      let size = 68;
      c.font = `900 ${size}px "Arial Black", Arial, sans-serif`;
      while (c.measureText(ad.text).width > 470 && size > 30) { size -= 3; c.font = `900 ${size}px "Arial Black", Arial, sans-serif`; }
      c.fillText(ad.text, x + 256, y + 68);
    });
    [3, 2, 1].forEach((n, i) => {
      const x = i * 128, y = 512;
      c.fillStyle = '#f4f2ea'; c.fillRect(x, y, 128, 128);
      c.fillStyle = '#c8372b'; c.fillRect(x, y, 128, 14); c.fillRect(x, y + 114, 128, 14);
      c.fillStyle = '#1b1f1d'; c.font = '900 92px "Arial Black", Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(n), x + 64, y + 70);
    });
  }, { anisotropy });
}

function wireTexture(anisotropy) {
  const texture = canvasTexture(64, 64, (c) => {
    c.strokeStyle = '#dfe6df'; c.lineWidth = 3;
    for (const offset of [-64, 0, 64]) {
      c.beginPath(); c.moveTo(offset, 0); c.lineTo(offset + 64, 64); c.stroke();
      c.beginPath(); c.moveTo(offset + 64, 0); c.lineTo(offset, 64); c.stroke();
    }
  }, { anisotropy });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Orange traffic cone with a white reflective band, vertex coloured. */
function coneGeometry() {
  const points = [[0.0, 0.5], [0.035, 0.5], [0.06, 0.42], [0.075, 0.36], [0.1, 0.24], [0.13, 0.05], [0.2, 0.05], [0.2, 0.0], [0.0, 0.0]];
  const geometry = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 10).toNonIndexed();
  const { position } = geometry.attributes, colors = [];
  const orange = new THREE.Color(0xf06a1c), band = new THREE.Color(0xf4f4ee), base = new THREE.Color(0x2a2a28);
  for (let i = 0; i < position.count; i += 3) {
    const y = (position.getY(i) + position.getY(i + 1) + position.getY(i + 2)) / 3;
    const c = y < 0.055 ? base : y > 0.25 && y < 0.37 ? band : orange;
    for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
