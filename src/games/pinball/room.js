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

import { CAB } from './meshes.js';

// Real cabinets put the playfield about 90 cm off the floor: ≈36 units here
const FLOOR_Y = -36;
const GAP = 15; // between cabinets: far enough that only their inner edges show

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
  const [cv, g] = canvas(512, 160);
  const bg = g.createLinearGradient(0, 0, 0, 160);
  bg.addColorStop(0, theme.top);
  bg.addColorStop(1, '#05060d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  const pool = g.createRadialGradient(256, 80, 10, 256, 80, 260);
  pool.addColorStop(0, theme.glow);
  pool.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = pool;
  g.fillRect(0, 0, 512, 160);
  g.textAlign = 'center';
  g.fillStyle = theme.ink;
  g.shadowColor = theme.ink;
  g.shadowBlur = 18;
  g.font = '700 54px Georgia, serif';
  g.fillText(theme.title, 256, 88);
  g.shadowBlur = 0;
  g.font = '700 20px sans-serif';
  g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillText(theme.sub, 256, 126);
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
    inserts: [[80, 200, '#ffb347'], [176, 200, '#ffb347'], [128, 300, '#ffffff'], [64, 370, '#f26d8d'], [192, 370, '#f26d8d']]
  }
];

/** One neighbouring machine: five draw calls, no lights of its own */
function buildNeighbour(THREE, mergeGeometries, materials, theme, disposables) {
  const g = new THREE.Group();
  const w = CAB.x1 - CAB.x0;
  const len = CAB.z0 - CAB.z1;
  const cz = (CAB.z0 + CAB.z1) / 2;
  const headH = CAB.backH;

  // Body, inner walls and head shell are all the same painted plywood
  const head = new THREE.BoxGeometry(w, headH, 0.9);
  head.translate(0, headH / 2, -0.5);
  head.rotateX(-CAB.headTilt);
  head.translate(0, 0, CAB.z1 + 0.4 - cz);
  const body = mergeGeometries([
    // Top well under the print, as on our own cabinet (16-bit depth safety)
    new THREE.BoxGeometry(w, 12, len).translate(0, -6.5, 0),
    new THREE.BoxGeometry(0.5, CAB.railY, len).translate(-w / 2 + 0.25, CAB.railY / 2, 0),
    new THREE.BoxGeometry(0.5, CAB.railY, len).translate(w / 2 - 0.25, CAB.railY / 2, 0),
    new THREE.BoxGeometry(w, CAB.railY + 0.4, 0.6).translate(0, (CAB.railY + 0.4) / 2, len / 2 - 0.3),
    head
  ]);
  g.add(new THREE.Mesh(body, materials.cabinet));

  const bar = new THREE.CylinderGeometry(0.62, 0.62, w, 16, 1, false, -Math.PI / 2, Math.PI * 1.35);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, CAB.railY + 0.62, len / 2 - 0.5);
  const armour = mergeGeometries([
    new THREE.BoxGeometry(0.78, 1.5, len).translate(-w / 2 + 0.3, CAB.railY + 0.5, 0),
    new THREE.BoxGeometry(0.78, 1.5, len).translate(w / 2 - 0.3, CAB.railY + 0.5, 0),
    bar
  ]);
  g.add(new THREE.Mesh(armour, materials.armour));

  const pfTex = playfieldArt(THREE, theme);
  const pf = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 1.2, len - 1.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: pfTex, color: 0x6c6c6c, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 })
  );
  pf.position.y = 0.02;
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
  g.add(new THREE.Mesh(mergeGeometries(toys), materials.gold));

  const tlTex = translite(THREE, theme);
  const tl = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 1.4, headH - 0.9),
    new THREE.MeshBasicMaterial({ map: tlTex, color: 0xffffff })
  );
  tl.position.set(0, headH / 2, 0.02);
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0, CAB.z1 + 0.4 - cz);
  headGroup.rotation.x = -CAB.headTilt;
  headGroup.add(tl);
  g.add(headGroup);

  disposables.push(pfTex, tlTex);
  // Set back a little from ours, as machines in a row never quite line up —
  // which also keeps their translites above the frame, away from the HUD
  g.position.set((CAB.x0 + CAB.x1) / 2 + theme.side * (w + GAP), 0, cz - 9);
  return { group: g, translite: tl.material };
}

export function buildRoom(THREE, { mergeGeometries, materials }) {
  const group = new THREE.Group();
  const disposables = [];

  const carpet = carpetTexture(THREE);
  carpet.repeat.set(12, 12);
  disposables.push(carpet);
  // Unlit and unfogged: the carpet's glow is its own (blacklight), and at
  // ninety units from the camera the fog would otherwise swallow it whole.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: carpet, color: 0x4a4d63, fog: false })
  );
  floor.position.set(0, FLOOR_Y, -40);
  group.add(floor);

  const neighbours = THEMES.map((th) => buildNeighbour(THREE, mergeGeometries, materials, th, disposables));
  neighbours.forEach((n) => group.add(n.group));

  return {
    group,
    /** Attract-mode breathing on the neighbours' translites */
    update(t) {
      neighbours.forEach((n, i) => {
        n.translite.color.setScalar(0.6 + Math.sin(t * 1.3 + i * 2.1) * 0.12);
      });
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
    }
  };
}
