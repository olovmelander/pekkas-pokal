/**
 * The arcade the machine stands in.
 *
 * On a phone the frame is all table, but a landscape screen shows what is
 * either side of it, and black bars there say "web page" where a dim room
 * says "arcade". So the machine gets a floor and neighbours: two more tables
 * in the row, idling in attract mode, with their translites glowing.
 *
 * The neighbours are the site's other years. They are background, and priced
 * like it: baked, unlit art on simple boxes, a handful of draw calls each,
 * and frustum-culled entirely in portrait.
 */

import { CAB, ROOM, roomPoint, shellGeometries } from './cabinet.js';

// Between cabinets: far enough that only their inner edges show in play
const GAP = 16;
const PITCH = CAB.hw * 2 + GAP;
// The neighbours stand a little further back than ours, along the floor
const SET_BACK = -9;

function canvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

/**
 * Arcade carpet: navy with scattered neon confetti, the pattern every arcade
 * on earth has because it glows under the blacklights and hides the spills.
 * Drawn wrapped so it tiles without a seam.
 */
function carpetTexture(THREE) {
  const N = 512;
  const [cv, g] = canvas(N, N);
  g.fillStyle = '#0a0b1c';
  g.fillRect(0, 0, N, N);
  const colors = ['#2de2e6', '#ff3cac', '#f9d649', '#7b5cff', '#ff8a3d'];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const shapes = [
    (x, y, s) => {
      g.beginPath();
      g.moveTo(x - s, y + s * 0.6);
      for (let k = 1; k <= 4; k++) g.lineTo(x - s + (k * s) / 2, y + (k % 2 ? -s : s) * 0.6);
      g.stroke();
    },
    (x, y, s) => {
      g.beginPath();
      g.arc(x, y, s * 0.6, 0, Math.PI * 2);
      g.stroke();
    },
    (x, y, s) => {
      g.beginPath();
      g.moveTo(x, y - s * 0.7);
      g.lineTo(x + s * 0.65, y + s * 0.5);
      g.lineTo(x - s * 0.65, y + s * 0.5);
      g.closePath();
      g.stroke();
    },
    (x, y, s) => {
      g.beginPath();
      g.moveTo(x - s, y);
      g.quadraticCurveTo(x - s / 2, y - s, x, y);
      g.quadraticCurveTo(x + s / 2, y + s, x + s, y);
      g.stroke();
    }
  ];
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const s = 9 + rnd() * 16;
    const c = colors[Math.floor(rnd() * colors.length)];
    const shape = shapes[Math.floor(rnd() * shapes.length)];
    g.strokeStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 8;
    g.lineWidth = 3;
    g.globalAlpha = 0.55 + rnd() * 0.35;
    g.save();
    // Draw every copy that touches the tile so the pattern wraps seamlessly
    for (const dx of [-N, 0, N]) {
      for (const dy of [-N, 0, N]) {
        if (Math.abs(x + dx - N / 2) < N / 2 + 30 && Math.abs(y + dy - N / 2) < N / 2 + 30) shape(x + dx, y + dy, s);
      }
    }
    g.restore();
  }
  g.globalAlpha = 1;
  g.shadowBlur = 0;
  // Pile: fine noise so the carpet doesn't read as a flat print
  const img = g.getImageData(0, 0, N, N);
  for (let i = 0; i < img.data.length; i += 4) {
    const k = 0.82 + Math.random() * 0.3;
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** A neighbour's playfield print, with its GI already baked in */
function playfieldArt(THREE, theme) {
  const [cv, g] = canvas(256, 512);
  const bg = g.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, theme.top);
  bg.addColorStop(1, theme.bottom);
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 512);
  const pool = (x, y, r, c) => {
    const grad = g.createRadialGradient(x, y, 4, x, y, r);
    grad.addColorStop(0, c);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 512);
  };
  pool(128, 140, 120, theme.glow);
  pool(128, 380, 110, 'rgba(255,220,150,.25)');
  // Lanes, arcs and inserts: enough structure to read as a playfield at a glance
  g.strokeStyle = 'rgba(255,240,210,.35)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(128, 120, 100, Math.PI, 0);
  g.stroke();
  [[60, 300, 40, 420], [196, 300, 216, 420], [40, 420, 100, 470], [216, 420, 156, 470]].forEach(([a, b, c, d]) => {
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
  });
  theme.inserts.forEach(([x, y, c]) => {
    g.fillStyle = c;
    g.shadowColor = c;
    g.shadowBlur = 10;
    g.beginPath();
    g.arc(x, y, 7, 0, Math.PI * 2);
    g.fill();
  });
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,240,215,.75)';
  g.font = '700 30px Georgia, serif';
  g.textAlign = 'center';
  g.fillText(theme.word, 128, 262);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function translite(THREE, theme) {
  const [cv, g] = canvas(512, 262);
  const bg = g.createLinearGradient(0, 0, 0, 262);
  bg.addColorStop(0, theme.top);
  bg.addColorStop(0.62, theme.bottom);
  bg.addColorStop(0.64, '#0a0812');
  bg.addColorStop(1, '#05060d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 262);
  const pool = g.createRadialGradient(256, 90, 10, 256, 90, 280);
  pool.addColorStop(0, theme.glow);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, 512, 165);
  // Speaker panel: a dark DMD window with two grilles, like ours
  g.fillStyle = '#020203';
  g.fillRect(128, 190, 256, 56);
  g.fillStyle = theme.ink;
  g.globalAlpha = 0.5;
  g.font = '700 22px monospace';
  g.textAlign = 'center';
  g.fillText('INSERT COIN', 256, 226);
  g.globalAlpha = 1;
  [64, 448].forEach((x) => {
    g.strokeStyle = 'rgba(220,226,240,.6)';
    g.lineWidth = 4;
    g.beginPath();
    g.arc(x, 218, 30, 0, Math.PI * 2);
    g.stroke();
  });
  g.textAlign = 'center';
  g.fillStyle = theme.ink;
  g.shadowColor = theme.ink;
  g.shadowBlur = 18;
  g.font = '700 58px Georgia, serif';
  g.fillText(theme.title, 256, 92);
  g.shadowBlur = 0;
  g.font = '700 22px sans-serif';
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillText(theme.sub, 256, 134);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const THEMES = [
  {
    // 2024: Pekkas Fiske — the lake at dusk
    side: -1,
    title: 'PEKKAS FISKE',
    sub: '2024',
    word: 'FISKE',
    top: '#0f4a5a',
    bottom: '#0a2433',
    glow: 'rgba(94,234,212,.45)',
    ink: '#8ff0e0',
    floor: [0.2, 0.75, 0.7],
    inserts: [[90, 210, '#5eead4'], [166, 210, '#5eead4'], [128, 320, '#f9d649'], [70, 360, '#ff7a59'], [186, 360, '#ff7a59']]
  },
  {
    // 2019: Pekkas Pingis — the community hall's red floor
    side: 1,
    title: 'PEKKAS PINGIS',
    sub: '2019',
    word: 'PINGIS',
    top: '#6a1d2a',
    bottom: '#2a0d16',
    glow: 'rgba(255,140,90,.4)',
    ink: '#ffc0a0',
    floor: [0.9, 0.42, 0.3],
    inserts: [[80, 200, '#ffb347'], [176, 200, '#ffb347'], [128, 300, '#ffffff'], [64, 370, '#f26d8d'], [192, 370, '#f26d8d']]
  }
];

/**
 * One neighbouring machine's own parts: playfield print, toys and translite.
 * Their cabinets (body, armour, legs) are drawn for both neighbours at once
 * as instanced shells, in buildRoom.
 */
function buildNeighbour(THREE, mergeGeometries, materials, theme, disposables) {
  const g = new THREE.Group();
  const w = CAB.x1 - CAB.x0;
  const len = CAB.z0 - CAB.z1;
  const cz = (CAB.z0 + CAB.z1) / 2;

  const pfTex = playfieldArt(THREE, theme);
  const pf = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 1.2, len - 1.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: pfTex,
      color: 0x6c6c6c,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2
    })
  );
  pf.position.set(CAB.cx, 0.02, cz);
  g.add(pf);

  // A few toys in relief so the print doesn't read as a sticker
  const toys = [];
  [[-3.2, -8], [2.6, -8], [-0.3, -12.5]].forEach(([x, z]) => {
    toys.push(new THREE.CylinderGeometry(1.15, 1.2, 1.1, 14).translate(x, 0.55, z));
  });
  [-1, 1].forEach((s) => {
    toys.push(new THREE.BoxGeometry(3, 0.8, 0.7).rotateY(s * 0.5).translate(s * 2.3 - 0.3, 0.4, len / 2 - 8.5));
    toys.push(new THREE.BoxGeometry(0.6, 1.4, 4).rotateY(s * 0.3).translate(s * 5.2, 0.7, len / 2 - 12));
  });
  const toyMesh = new THREE.Mesh(mergeGeometries(toys), materials.gold);
  toyMesh.position.set(CAB.cx, 0, cz);
  g.add(toyMesh);

  const tlTex = translite(THREE, theme);
  const tl = new THREE.Mesh(
    new THREE.PlaneGeometry(CAB.hw * 2 - 1.2, CAB.backH - 0.7),
    new THREE.MeshBasicMaterial({ map: tlTex, color: 0xffffff })
  );
  tl.position.set(0, CAB.backH / 2, 0.02);
  const headGroup = new THREE.Group();
  headGroup.position.set(CAB.cx, 0, CAB.z1 + 0.4);
  headGroup.rotation.x = -CAB.headTilt;
  headGroup.add(tl);
  g.add(headGroup);

  disposables.push(pfTex, tlTex);
  // Set back a little from ours along the floor, as machines in a row never
  // quite line up — which also keeps their translites above the frame
  g.position.set(theme.side * PITCH, SET_BACK * Math.sin(ROOM.slope), SET_BACK * Math.cos(ROOM.slope));
  return { group: g, translite: tl.material, playfield: pf.material };
}

/** The back wall: dark panelling, warm sconces, the arcade's neon sign */
function wallTexture(THREE) {
  const [cv, g] = canvas(1024, 384);
  const bg = g.createLinearGradient(0, 0, 0, 384);
  bg.addColorStop(0, '#07081a');
  bg.addColorStop(0.6, '#110d22');
  bg.addColorStop(1, '#0a0812');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 384);
  // Wainscot
  g.fillStyle = '#0c0a16';
  g.fillRect(0, 270, 1024, 114);
  g.fillStyle = 'rgba(242,193,78,.35)';
  g.fillRect(0, 268, 1024, 3);
  for (let x = 0; x < 1024; x += 64) {
    g.fillStyle = 'rgba(255,255,255,.03)';
    g.fillRect(x + 6, 282, 52, 92);
  }
  // Warm sconces, each throwing a pool up and down the wall
  for (let i = 0; i < 8; i++) {
    const x = 64 + i * 128;
    const pool = g.createRadialGradient(x, 190, 4, x, 190, 120);
    pool.addColorStop(0, 'rgba(255,190,120,.5)');
    pool.addColorStop(0.4, 'rgba(255,160,90,.16)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = pool;
    g.fillRect(x - 130, 60, 260, 260);
    g.fillStyle = '#ffd9a0';
    g.beginPath();
    g.moveTo(x - 9, 196);
    g.lineTo(x + 9, 196);
    g.lineTo(x + 5, 180);
    g.lineTo(x - 5, 180);
    g.closePath();
    g.fill();
  }
  // Neon sign
  const neon = (text, x, y, px, c) => {
    g.font = `italic 700 ${px}px Georgia, serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = c;
    g.shadowBlur = 22;
    g.lineWidth = 5;
    g.strokeStyle = c;
    g.strokeText(text, x, y);
    g.shadowBlur = 8;
    g.lineWidth = 2;
    g.strokeStyle = '#fff';
    g.strokeText(text, x, y);
    g.shadowBlur = 0;
  };
  neon('Arkaden', 512, 150, 44, '#ff4fb8');
  neon('PEKKAS', 512, 116, 20, '#59e6ff');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A soft radial blob: floor glow pools (additive) and contact shadows */
function blobTexture(THREE, rgb, rounded) {
  const N = 128;
  const [cv, g] = canvas(N, N);
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = ((x + 0.5) / N) * 2 - 1;
      const v = ((y + 0.5) / N) * 2 - 1;
      // A squircle for the shadow under a box, a disc for a pool
      const d = rounded ? Math.pow(Math.pow(Math.abs(u), 4) + Math.pow(Math.abs(v), 4), 0.25) : Math.hypot(u, v);
      const a = Math.max(0, 1 - d);
      const i = (y * N + x) * 4;
      img.data[i] = rgb[0];
      img.data[i + 1] = rgb[1];
      img.data[i + 2] = rgb[2];
      img.data[i + 3] = Math.round(Math.pow(a, rounded ? 0.9 : 1.6) * 255);
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Flat quads in the floor frame (rx, rd, w, l), merged, with a colour each */
function floorQuads(THREE, quads, lift) {
  const pos = [];
  const uv = [];
  const col = [];
  quads.forEach(([rx, rd, w, l, c]) => {
    const p = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    p.forEach(([a, b]) => {
      pos.push(rx + (a * w) / 2, lift, rd - (b * l) / 2);
      uv.push((a + 1) / 2, (b + 1) / 2);
      col.push(c[0], c[1], c[2]);
    });
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return geo;
}

export function buildRoom(THREE, { mergeGeometries, materials }) {
  const group = new THREE.Group();
  const disposables = [];

  // Everything that stands on the floor lives in the floor's frame, pitched
  // by the playfield slope: relative to it, our level playfield climbs
  // toward the back exactly as a real one does.
  const frame = new THREE.Group();
  frame.position.set(CAB.cx, ROOM.origin.y, ROOM.origin.z);
  frame.rotation.x = -ROOM.slope;
  group.add(frame);

  const carpet = carpetTexture(THREE);
  carpet.repeat.set(12, 12);
  disposables.push(carpet);
  // Unlit and unfogged: the carpet's glow is its own (blacklight), and at
  // ninety units from the camera the fog would otherwise swallow it whole.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: carpet, color: 0x4a4d63, fog: false })
  );
  floor.position.set(0, 0, -40);
  frame.add(floor);

  // Contact shadows under the three machines, then the light the machines
  // throw on the carpet in front of them — the floor's "reflection" of the
  // coin door and the attract shows. One draw call each.
  const mid = -CAB.bodyL / 2;
  const shadowTex = blobTexture(THREE, [0, 0, 0], true);
  const glowTex = blobTexture(THREE, [255, 255, 255], false);
  disposables.push(shadowTex, glowTex);
  const shadows = new THREE.Mesh(
    floorQuads(THREE, [
      [0, mid, CAB.hw * 2 + 14, CAB.bodyL + 16, [1, 1, 1]],
      [-PITCH, mid + SET_BACK, CAB.hw * 2 + 14, CAB.bodyL + 16, [1, 1, 1]],
      [PITCH, mid + SET_BACK, CAB.hw * 2 + 14, CAB.bodyL + 16, [1, 1, 1]]
    ], 0.08),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.85, depthWrite: false, fog: false })
  );
  shadows.renderOrder = 1;
  frame.add(shadows);
  const glowGeo = floorQuads(THREE, [
    [0, 8, 34, 22, [0.17, 0.11, 0.05]],
    [-PITCH, 8 + SET_BACK, 34, 22, [0, 0, 0]],
    [PITCH, 8 + SET_BACK, 34, 22, [0, 0, 0]]
  ], 0.16);
  const glow = new THREE.Mesh(
    glowGeo,
    new THREE.MeshBasicMaterial({
      map: glowTex,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false
    })
  );
  glow.renderOrder = 2;
  frame.add(glow);

  // Back wall, far behind the row
  const wallTex = wallTexture(THREE);
  disposables.push(wallTex);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 112),
    new THREE.MeshBasicMaterial({ map: wallTex, color: 0xb0b0b0, fog: false })
  );
  wall.position.set(0, 50, -112);
  frame.add(wall);

  // The neighbours: their own print and translites, and both cabinets drawn
  // as instanced shells (three draw calls for the pair)
  const neighbours = THEMES.map((th) => buildNeighbour(THREE, mergeGeometries, materials, th, disposables));
  neighbours.forEach((n) => group.add(n.group));
  const shell = shellGeometries(THREE);
  const powder = new THREE.MeshStandardMaterial({ color: 0x0d0f16, roughness: 0.45, metalness: 0.5, envMapIntensity: 0.6 });
  disposables.push(powder);
  const m4 = new THREE.Matrix4();
  [[shell.paint, materials.cabinet], [shell.metal, materials.armour], [shell.legs, powder]].forEach(([geo, mat]) => {
    const inst = new THREE.InstancedMesh(geo, mat, neighbours.length);
    neighbours.forEach((n, i) => inst.setMatrixAt(i, m4.makeTranslation(n.group.position.x, n.group.position.y, n.group.position.z)));
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);
  });

  // A warm practical off to the front left: the fill that shows the cabinet
  // as an object in the showcase. Directional (one cheap term per pixel, no
  // shadow), dimmed almost to nothing while playing — index.js drives it.
  const fill = new THREE.DirectionalLight(0xffc48a, 0.1);
  fill.position.set(CAB.cx - 46, 30, 42);
  fill.target.position.set(CAB.cx, -12, -22);
  group.add(fill, fill.target);

  const glowCol = glowGeo.attributes.color;
  const front = roomPoint(0, 0);
  return {
    group,
    fill,
    /** Floor height under the front of our machine (world) */
    floorFront: front.y,
    /** Attract-mode breathing on the neighbours' translites */
    update(t) {
      neighbours.forEach((n, i) => {
        const breathe = 0.6 + Math.sin(t * 1.3 + i * 2.1) * 0.12;
        n.translite.color.setScalar(breathe);
        // Their own attract shows: the playfield GI swells and dips, now
        // and then a quick double flash, as a machine idling in a row does
        const ph = (t * 0.9 + i * 1.7) % 6;
        const flashK = ph > 5.6 ? (Math.floor(ph * 20) % 2 ? 0.1 : 0) : 0;
        // Linear values: 0.15 is the old fixed 0x6c6c6c
        const v = 0.15 + Math.sin(t * 2.1 + i * 2.6) * 0.03 + flashK;
        n.playfield.color.setRGB(v, v, v * 1.04);
        // …and the light they throw on the carpet follows the show
        const c = THEMES[i].floor;
        const kk = (breathe - 0.3) * 0.5 + flashK * 2;
        for (let j = 0; j < 6; j++) glowCol.setXYZ(6 * (i + 1) + j, c[0] * kk, c[1] * kk, c[2] * kk);
      });
      glowCol.needsUpdate = true;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      Object.values(shell).forEach((geo) => geo.dispose());
    }
  };
}
