/**
 * Pekkas Lerduvor — the gang behind the station.
 *
 * Five of the real 2022 field on fika chairs and Henrik — the arranger —
 * on his feet by the fika table with the score sheet, all built with the
 * shared people system so everyone looks the way they do in every other
 * game (faces, hair and glasses come from appearanceFor; only clothes are
 * chosen here). Ludvig, the man whose 3 400 you are chasing, has the
 * middle seat.
 *
 * They are only ever on screen in the establishing shot, on the camera's
 * flight to the gun and back, and in the reaction shot after each series,
 * so the game hides them (and skips their animation) the rest of the time.
 *
 * Hands that hold things are placed with the people system's two-bone IK,
 * not baked into a pose, so the prop sits right in the fist whatever the
 * person's size:
 *  - a mug rests on the thigh, upright in the fist (thumb side up), and
 *    now and then goes to the mouth for a sip, tipping as it gets there;
 *    in a cheer it is raised high — a toast — instead of vanishing;
 *  - Henrik holds the score sheet flat in his left hand, thumb on top,
 *    tilted toward himself to read, and writes on it with a pencil.
 * The IK targets are eased, never switched, so every move is a move.
 *
 * Behaviour, in layers:
 *  - idle life: everyone picks something to look at every few seconds —
 *    the station, the trap house, the tower, a neighbour — and now and then
 *    two of them talk, the speaker gesturing with a free hand;
 *  - reactions, staggered a little per person so a cheer ripples instead
 *    of firing like one machine: clap, cheer, a gold "no way!" and
 *    Ludvig's arms-crossed smirk when his score survives.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES, SEAT_HEIGHT, SEAT_BACK } from '../shared/people.js';

/**
 * Who sits where. x/z is the chair (root) position; yaw 0 faces the field
 * (−z). `cup` marks a mug hand. `lean` sits a little back in the canvas.
 */
const SEATS = [
  {
    name: 'Tobias Lundqvist', x: -1.72, z: 2.84, yaw: 0.2, cup: true, fabric: 0x2f6d4a, lean: 0.06,
    look: { outfit: { top: 'shirt' } }
  },
  {
    name: 'Viktor Jones', x: -0.86, z: 2.96, yaw: 0.08, cup: true, fabric: 0x2b4f86,
    look: { outfit: { top: 'polo', topColor: 0x34465e } }
  },
  {
    name: 'Ludvig Ulenius', x: 0.0, z: 2.88, yaw: 0, fabric: 0x9a3a2e, lean: 0.08,
    look: { outfit: { top: 'sweater', topColor: 0x2f5f5c } }
  },
  {
    name: 'Rickard Nilsson', x: 0.86, z: 2.98, yaw: -0.07, fabric: 0xa8832e, pump: true,
    look: { outfit: { top: 'jacket', topColor: 0x4a5a3a, shoes: 'boots', shoeColor: 0x3a2a1e } }
  },
  {
    name: 'Per Olsson', x: 1.72, z: 2.82, yaw: -0.22, cup: true, fabric: 0x6a5a8a, lean: 0.04,
    look: { outfit: { top: 'sweater' } }
  }
];

/** Henrik arranged 2022 (with Ludvig) — so he keeps the score sheet. */
const SCORER = {
  name: 'Henrik Lundqvist', x: 2.5, z: 2.1,
  look: { outfit: { top: 'jacket', topColor: 0x3f5a3c, shoes: 'boots', shoeColor: 0x3a2a1e } }
};

const LUDVIG = 'Ludvig Ulenius';

/* ------------------------------------------------------------- props */

function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('uv');
  const c = new THREE.Color(color);
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < col.length; i += 3) {
    col[i] = c.r;
    col[i + 1] = c.g;
    col[i + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A cylinder between two points (for chair tubes). */
function tube(a, b, r, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

function boxAt(w, h, d, color, at, rotX = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  g.translate(at[0], at[1], at[2]);
  return paint(g, color);
}

/**
 * A folding fika chair in the person's own frame (facing +z, seat centred
 * SEAT_BACK behind the root, seat top at SEAT_HEIGHT for their height):
 * an aluminium X on each side, a canvas seat that sags a little, armrests
 * and a slung canvas back set well behind the sitter's back.
 */
function chairParts(scale, fabric) {
  const sh = SEAT_HEIGHT * scale;
  const zc = -SEAT_BACK * scale - 0.03;
  const alu = 0xb4b8bd;
  const parts = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const shade = new THREE.Color(fabric).multiplyScalar(0.78);
  // Seat (a hair below the thighs) and the slung back, tilted back
  parts.push(boxAt(0.46, 0.022, 0.42, fabric, [0, sh - 0.03, zc]));
  parts.push(boxAt(0.46, 0.36, 0.018, shade, [0, sh + 0.31, zc - 0.29], -0.2));
  [-1, 1].forEach((s) => {
    const x = s * 0.25;
    parts.push(tube(v(x, 0, zc + 0.22), v(x, sh - 0.04, zc - 0.2), 0.011, alu));
    parts.push(tube(v(x, 0, zc - 0.22), v(x, sh - 0.04, zc + 0.2), 0.011, alu));
    parts.push(tube(v(x, sh - 0.04, zc - 0.21), v(x, sh - 0.04, zc + 0.21), 0.011, alu));
    parts.push(tube(v(x, sh - 0.04, zc - 0.22), v(x, sh + 0.52, zc - 0.36), 0.011, alu));
    // Armrest: a canvas strap on a tube, out to the side of the hips
    parts.push(tube(v(x + s * 0.02, sh + 0.2, zc - 0.25), v(x + s * 0.02, sh + 0.2, zc + 0.16), 0.012, alu));
    parts.push(tube(v(x + s * 0.02, sh - 0.04, zc + 0.18), v(x + s * 0.02, sh + 0.2, zc + 0.16), 0.01, alu));
  });
  parts.push(tube(v(-0.25, sh - 0.04, zc + 0.21), v(0.25, sh - 0.04, zc + 0.21), 0.01, alu));
  parts.push(tube(v(-0.25, 0.012, zc - 0.22), v(0.25, 0.012, zc - 0.22), 0.01, alu));
  return parts;
}

/** An enamel mug: white with a blue rim, coffee inside, handle on +x. */
function mugGeometry() {
  const body = new THREE.CylinderGeometry(0.04, 0.036, 0.09, 14, 1, true);
  const bottom = new THREE.CircleGeometry(0.036, 14);
  bottom.rotateX(Math.PI / 2);
  bottom.translate(0, -0.045, 0);
  const coffee = new THREE.CircleGeometry(0.037, 14);
  coffee.rotateX(-Math.PI / 2);
  coffee.translate(0, 0.03, 0);
  const rim = new THREE.CylinderGeometry(0.0412, 0.0412, 0.008, 14, 1, true);
  rim.translate(0, 0.043, 0);
  // A proper loop you can see from across the field: 4 cm inside, 16 mm bar
  const handle = new THREE.TorusGeometry(0.028, 0.008, 6, 12, Math.PI);
  handle.rotateZ(-Math.PI / 2);
  handle.translate(0.04, 0, 0);
  return mergeGeometries([
    paint(body, 0xf2efe6), paint(bottom, 0xd8d4ca), paint(coffee, 0x3a2414), paint(rim, 0x2a4a82), paint(handle, 0xf2efe6)
  ]);
}

/**
 * Henrik's clipboard, in its own frame: the board lies in XZ (face +Y),
 * long side along Z with the clip at −Z, and the sheet's 25 boxes ruled
 * on it. A pencil is separate.
 */
function clipboardGeometry() {
  const parts = [
    boxAt(0.17, 0.01, 0.23, 0x8a6236, [0, 0, 0]),
    boxAt(0.15, 0.003, 0.19, 0xf4f1e8, [0, 0.0065, 0.012]),
    boxAt(0.07, 0.012, 0.026, 0xb8bcc2, [0, 0.011, -0.098])
  ];
  // Ruled rows on the sheet (a few darker lines are all that read)
  for (let r = 0; r < 4; r++) parts.push(boxAt(0.12, 0.002, 0.004, 0x3a4a6a, [0, 0.0085, -0.045 + r * 0.035]));
  return mergeGeometries(parts);
}

function pencilGeometry() {
  const body = new THREE.CylinderGeometry(0.0045, 0.0045, 0.13, 6);
  const tip = new THREE.ConeGeometry(0.0045, 0.02, 6);
  tip.translate(0, -0.075, 0);
  return mergeGeometries([paint(body, 0xe8b22a), paint(tip, 0x3a3030)]);
}

/* ------------------------------------------------------------- the gang */

const UP = new THREE.Vector3(0, 1, 0);
const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildGang({ rand }) {
  const group = new THREE.Group();
  group.name = 'gang';
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mugGeo = mugGeometry();
  const clipGeo = clipboardGeometry();
  const pencilGeo = pencilGeometry();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  const members = [];
  const chairs = [];

  // Scratch
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const wTarget = new THREE.Vector3();
  const wPole = new THREE.Vector3();
  const qHand = new THREE.Quaternion();
  const qInv = new THREE.Quaternion();
  const qObj = new THREE.Quaternion();
  const qRoot = new THREE.Quaternion();
  const basis = new THREE.Matrix4();
  const bx = new THREE.Vector3();
  const by = new THREE.Vector3();
  const bz = new THREE.Vector3();

  function addMember(def, seated) {
    const person = createPerson(appearanceFor(def.name, def.look || {}));
    const yaw = Math.PI + (def.yaw || 0);
    person.root.position.set(def.x, 0, def.z);
    // Seated: facing the field. Standing: turned toward the station and the trap
    person.root.rotation.y = seated ? yaw : Math.atan2(0.4 - def.x, -7 - def.z);
    group.add(person.root);
    const s = person.scale || person.height / 1.8;
    const m = {
      name: def.name, person, seated, scale: s, lean: def.lean || 0, pump: !!def.pump,
      cup: null, board: null, pencil: null,
      react: null, reactT: 0, delay: 0, surprise: 0,
      phase: rand() * 10, tempo: 0.9 + rand() * 0.25,
      idleLook: new THREE.Vector3(0, 1.4, 0), lookT: rand() * 2, talkT: 0, listenTo: null,
      sipT: 2 + rand() * 9, sip: 0, writeT: 1 + rand() * 4, write: 0, gesture: 0,
      // Eased IK state for the prop hand, in the person's own frame
      hand: new THREE.Vector3(), tilt: 0, handInit: false,
      free: new THREE.Vector3(), freeK: 0,
      pose: null
    };
    if (seated) {
      // The chair, in world space, merged with the others below
      m4.compose(person.root.position, q.setFromAxisAngle(UP, yaw), new THREE.Vector3(1, 1, 1));
      chairParts(s, def.fabric).forEach((g) => chairs.push(g.applyMatrix4(m4)));
    }
    if (def.cup) {
      // hold('hook'): origin = the middle of the handle's grip bar, +Y the
      // mug's up, +Z toward the mug body — fingers through the handle,
      // thumb on top of it
      m.cup = new THREE.Group();
      const mug = new THREE.Mesh(mugGeo, propMat);
      mug.castShadow = true;
      mug.rotation.y = Math.PI / 2; // the handle (+x) turns to −Z
      mug.position.z = 0.068; // the body sits in front of the bar
      m.cup.add(mug);
      person.hold(m.cup, 'R', 'hook', { bar: 0.016, handle: 0.04 });
    }
    if (!seated) {
      // hold('flat'): origin = the middle of the held edge, +Y the top face
      // (thumb on top), the board reaching out along +Z. He holds it by its
      // left long edge; the clip ends up at the far end.
      m.board = new THREE.Group();
      const board = new THREE.Mesh(clipGeo, propMat);
      board.castShadow = true;
      board.rotation.y = -Math.PI / 2;
      board.position.z = 0.085;
      m.board.add(board);
      person.hold(m.board, 'L', 'flat', { thickness: 0.012 });
      // hold('pinch'): +Y toward the point, origin a few cm up from it
      m.pencil = new THREE.Group();
      const pencil = new THREE.Mesh(pencilGeo, propMat);
      pencil.rotation.x = Math.PI;
      pencil.position.y = -0.045;
      m.pencil.add(pencil);
      person.hold(m.pencil, 'R', 'pinch', { diameter: 0.009 });
    }
    // Free hands: the pose drives them (resting on the knee they drape in
    // the people system's natural cascade); in a cheer they clench. The fist
    // is solved once here, while loading, then handed back to the pose.
    m.freeSides = seated ? (def.cup ? ['L'] : ['L', 'R']) : [];
    m.freeSides.forEach((side) => {
      person.setGrip(side, 'fist', { blend: 0 });
      person.setGrip(side, null, { blend: 0 });
    });
    m.freeGrip = null;
    members.push(m);
    return m;
  }

  SEATS.forEach((d) => addMember(d, true));
  addMember(SCORER, false);
  const chairMesh = new THREE.Mesh(mergeGeometries(chairs), propMat);
  chairMesh.castShadow = true;
  chairMesh.receiveShadow = true;
  chairs.forEach((g) => g.dispose());
  group.add(chairMesh);

  // Idle gaze targets: the station, the trap house, the field, the tower
  const SPOTS = [[0, 1.3, 0], [0, 1.2, -16], [-6, 3, -30], [5, 2.5, -26], [9, 8.5, -60]].map((p) => new THREE.Vector3(...p));

  let globalLook = null; // a point everyone watches (the camera) or null

  /**
   * One-shot reaction for `seconds`: 'clap' | 'cheer' | 'gold' | 'crossed'
   * | 'idle'. `who` overrides the kind per name, e.g. { 'Ludvig Ulenius': 'crossed' }.
   */
  function react(kind, seconds = 2.4, who = {}) {
    members.forEach((m) => {
      const k = who[m.name] || kind;
      m.react = k === 'idle' ? null : k;
      m.reactT = seconds;
      m.delay = k === 'crossed' ? 0.3 : rand() * 0.28;
      m.surprise = k === 'gold' ? 0.55 : 0;
    });
  }

  function poseFor(m, t) {
    const mode = m.reactT > 0 && m.delay <= 0 ? m.react : null;
    const tt = t * m.tempo + m.phase;
    let p;
    if (mode === 'clap' && m.cup && m.seated) {
      // A mug in one hand: no clapping — the mug goes up in a toast instead
      // (cupHand), the other hand slaps the knee
      p = POSES.sit(tt, m.pose);
      p.forearmL[0] -= Math.abs(Math.sin(tt * 4.2)) * 0.35;
      p.chest[0] -= 0.05;
    } else if (mode === 'clap') p = m.seated ? POSES.sitClap(tt, m.pose) : POSES.clap(tt, m.pose);
    else if (mode === 'cheer' && m.seated && m.pump) p = POSES.sitFistPump(tt, m.pose); // not everyone throws both arms up
    else if (mode === 'cheer' || mode === 'gold') p = m.seated ? POSES.sitCheer(tt, m.pose) : POSES.cheer(tt, m.pose);
    else if (mode === 'crossed') {
      // Seated with the arms folded: the sitting legs, armsCrossed above the hips
      p = m.seated ? POSES.sit(tt, m.pose) : POSES.armsCrossed(tt, m.pose);
      if (m.seated) {
        const c = POSES.armsCrossed(0);
        for (const b of ['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR']) p[b] = c[b].slice();
        p.gripL = c.gripL;
        p.gripR = c.gripR;
        p.chest[0] -= 0.12; // leaning back in the chair
        p.head[0] -= 0.06; // chin up
      }
    } else if (m.seated) {
      p = POSES.sit(tt, m.pose);
      // Settled back into the canvas (update() adds each one's own sway)
      p.spine[0] -= m.lean;
      p.chest[0] -= m.lean * 0.5;
    } else {
      // Standing: his own seeded weight shifts and fidgets, never in step with anyone
      p = POSES.idle(t, m.pose, m.person.look.seed);
    }
    // (The held mug, board and pencil shape their own fingers via hold())
    // Head back a touch for the sip
    if (m.cup && m.seated && !mode) p.head[0] -= smoothstep(0.3, 1, m.sip) * 0.22;
    m.pose = p;
    return mode;
  }

  function freeHands(m, mode) {
    const want = mode === 'cheer' || mode === 'gold' ? 'fist' : null;
    if (m.freeGrip === want) return;
    m.freeGrip = want;
    m.freeSides.forEach((side) => m.person.setGrip(side, want, { blend: 0.25 }));
  }

  function expressionFor(m, mode) {
    if (m.surprise > 0) return 'surprised';
    if (mode === 'cheer' || mode === 'gold') return { grin: 0.8, shout: 0.35 };
    if (mode === 'clap') return { smile: 0.75 };
    if (mode === 'crossed') return { smile: 0.55, focus: 0.25 };
    if (m.write > 0.5) return { focus: 0.45, smile: 0.1 };
    return m.talkT > 0 ? { smile: 0.35 } : { smile: 0.18 };
  }

  function idle(m, i, dt) {
    m.lookT -= dt;
    if (m.talkT > 0) m.talkT -= dt;
    if (m.lookT > 0) return;
    m.lookT = 2.5 + rand() * 4.5;
    m.listenTo = null;
    if (rand() < 0.35) {
      // A word with a neighbour: they turn to each other and one of them talks
      const other = members[i === 0 ? 1 : i === members.length - 1 ? i - 1 : i + (rand() < 0.5 ? -1 : 1)];
      const dur = 1.4 + rand() * 1.8;
      const speaker = rand() < 0.5 ? m : other;
      m.listenTo = other;
      other.listenTo = m;
      m.lookT = dur + 0.4;
      other.lookT = dur + 0.4;
      speaker.talkT = dur;
    } else {
      m.idleLook.copy(SPOTS[Math.floor(rand() * SPOTS.length)]);
    }
  }

  /** person-local point → world */
  function toWorld(m, local, out) {
    return out.copy(local).applyMatrix4(m.person.root.matrixWorld);
  }

  /**
   * World orientation for a held object whose +Y points `yLocal` and +Z
   * (roughly) `zLocal`, both in the person's frame.
   */
  function objectQuat(m, yLocal, zLocal, out) {
    by.copy(yLocal).normalize();
    bz.copy(zLocal).addScaledVector(by, -zLocal.dot(by)).normalize();
    bx.crossVectors(by, bz);
    basis.makeBasis(bx, by, bz);
    out.setFromRotationMatrix(basis);
    m.person.root.getWorldQuaternion(qRoot);
    return out.premultiply(qRoot);
  }

  /**
   * Put what hand `side` holds at person-local `local`, turned to `qObj`
   * (world): the hand is the object's frame times the grip anchor's
   * inverse, and the IK target is the wrist behind it.
   */
  function placeHeld(m, side, local, qObj, poleLocal) {
    const anchor = m.person.sockets[side === 'L' ? 'holdL' : 'holdR'];
    if (!anchor) return;
    qHand.copy(qObj).multiply(qInv.copy(anchor.quaternion).invert());
    toWorld(m, local, wTarget);
    tmp.copy(anchor.position).applyQuaternion(qHand);
    wTarget.sub(tmp);
    toWorld(m, poleLocal, wPole);
    m.person.ikArm(side, wTarget, wPole, qHand);
  }

  const vLap = new THREE.Vector3();
  const vZ = new THREE.Vector3();
  const vY = new THREE.Vector3();
  const vPole = new THREE.Vector3();

  /** The mug hand: lap → mouth (a sip) → raised (a toast), eased. */
  function cupHand(m, mode, t, dt) {
    const s = m.scale;
    const ease = 1 - Math.exp(-dt * 5);
    // Sips on their own clock, only when nothing else is going on
    if (!mode && m.talkT <= 0) {
      m.sipT -= dt;
      if (m.sipT < 0) {
        m.sip = Math.min(1, m.sip + dt * 0.9);
        if (m.sipT < -2.6) m.sipT = 7 + rand() * 9;
      }
    }
    if (mode || m.sipT >= 0) m.sip = Math.max(0, m.sip - dt * 1.2);
    const sip = smoothstep(0.15, 0.85, m.sip) * (m.sipT < -2.0 ? smoothstep(-2.6, -2.0, m.sipT) : 1);
    const cheer = mode === 'cheer' || mode === 'gold';
    const toast = mode === 'clap';
    // Targets for the handle in the person's frame (x = their left; the
    // right hand is −x). vZ points from the handle to the mug's body.
    // The palm faces the mug's body: inward, like a handshake with the mug
    // on the palm side, so the forearm runs straight into the wrist
    if (cheer) {
      vLap.set(-0.34, 1.62 + Math.sin(t * 7) * 0.03, 0.12);
      vZ.set(0.8, 0, 0.6);
    } else if (toast) {
      vLap.set(-0.27, 1.0 + Math.abs(Math.sin(t * 4.2)) * 0.06, 0.38);
      vZ.set(0.85, 0, 0.5);
    } else {
      // Resting over the right thigh, or up at the mouth for a sip
      vLap.set(-0.2 + sip * 0.1, 0.68 + sip * 0.53, 0.24 - sip * 0.06);
      vZ.set(0.95, 0, 0.3 - sip * 0.25);
    }
    vLap.multiplyScalar(s);
    if (!m.handInit) {
      m.hand.copy(vLap);
      m.free.copy(vZ);
      m.handInit = true;
    }
    m.hand.lerp(vLap, ease);
    m.free.lerp(vZ, ease);
    // At the mouth the mug tips toward the face
    const tipTo = !cheer && !toast ? sip * 0.95 : 0;
    m.tilt += (tipTo - m.tilt) * ease;
    vY.set(0, Math.cos(m.tilt), -Math.sin(m.tilt));
    objectQuat(m, vY, m.free, qObj);
    vPole.set(-0.5, 0.2, -0.4).multiplyScalar(s);
    placeHeld(m, 'R', m.hand, qObj, vPole);
  }

  /** Henrik: the board flat in the left hand, the pencil hand writing. */
  function scorerHands(m, mode, t, dt) {
    const s = m.scale;
    const ease = 1 - Math.exp(-dt * 5);
    m.writeT -= dt;
    if (m.writeT < 0 && !mode) {
      m.write = Math.min(1, m.write + dt * 2);
      if (m.writeT < -2.2) m.writeT = 3 + rand() * 5;
    } else {
      m.write = Math.max(0, m.write - dt * 2);
    }
    const cheer = mode === 'cheer' || mode === 'gold';
    // The board's held (left) edge: at the waist, raised high in a cheer
    if (cheer) vLap.set(0.32, 1.78 + Math.sin(t * 6) * 0.04, 0.18).multiplyScalar(s);
    else vLap.set(0.17, 1.07, 0.3).multiplyScalar(s);
    if (!m.handInit) {
      m.hand.copy(vLap);
      m.handInit = true;
    }
    m.hand.lerp(vLap, ease);
    // Face up, tilted toward him to read; reaching across toward his right
    const tiltTo = cheer ? 0.2 : 0.38;
    m.tilt += (tiltTo - m.tilt) * ease;
    vY.set(0, Math.cos(m.tilt), -Math.sin(m.tilt));
    vZ.set(-1, 0, 0.22);
    objectQuat(m, vY, vZ, qObj);
    vPole.set(0.6, 0.3, -0.5).multiplyScalar(s);
    placeHeld(m, 'L', m.hand, qObj, vPole);
    if (cheer) return; // the right arm punches the air with the pose
    // The pencil: its point on the sheet, scribbling when he writes,
    // lifting off and tapping in time when he claps
    by.copy(vY).normalize();
    bz.copy(vZ).addScaledVector(by, -vZ.dot(by)).normalize();
    bx.crossVectors(by, bz); // toward the clip, away from him
    const w = m.write;
    const lift = mode === 'clap' ? Math.abs(Math.sin(t * 6)) * 0.05 : 0.035 * (1 - w);
    tmp2.copy(m.hand)
      .addScaledVector(bz, (0.085 + Math.sin(t * 13) * 0.012 * w) * s)
      .addScaledVector(bx, (0.01 + Math.sin(t * 2.3) * 0.02 * w) * s)
      .addScaledVector(by, (0.008 + lift) * s);
    // Pencil +Y (toward the point): down onto the sheet, leaning back
    // toward the hand on his right; the palm faces down
    vY.copy(by).multiplyScalar(-0.8).addScaledVector(bz, -0.45).addScaledVector(bx, 0.2);
    vZ.copy(by).negate();
    objectQuat(m, vY, vZ, qObj);
    m.free.copy(tmp2).addScaledVector(vY.normalize(), -0.035 * s);
    vPole.set(-0.6, 0.2, -0.5).multiplyScalar(s);
    placeHeld(m, 'R', m.free, qObj, vPole);
  }

  function update(dt, t) {
    const blendRate = 1 - Math.exp(-dt * 9);
    members.forEach((m, i) => {
      if (m.delay > 0) m.delay -= dt;
      else if (m.reactT > 0) m.reactT -= dt;
      if (m.surprise > 0 && m.delay <= 0) m.surprise -= dt;
      const mode = poseFor(m, t);
      freeHands(m, mode);
      m.person.setPose(m.pose, blendRate);
      m.person.root.updateMatrixWorld(true);
      if (m.cup) cupHand(m, mode === 'crossed' ? null : mode, t * m.tempo + m.phase, dt);
      if (m.board) scorerHands(m, mode, t * m.tempo + m.phase, dt);
      m.person.setExpression(expressionFor(m, mode));
      if (!mode) idle(m, i, dt);
      m.person.talk(!mode && m.talkT > 0 ? 0.8 : 0);
      if (m.sip > 0.4) {
        m.person.lookAt(null);
      } else if (globalLook) {
        m.person.lookAt(globalLook);
      } else if (m.write > 0.3 && m.board) {
        m.board.getWorldPosition(tmp);
        m.person.lookAt(tmp);
      } else if (m.listenTo) {
        m.listenTo.person.bones.head.getWorldPosition(tmp);
        m.person.lookAt(tmp);
      } else {
        m.person.lookAt(m.idleLook, 0.85);
      }
      m.person.update(dt, t);
    });
  }

  return {
    group,
    members,
    react,
    /** Everyone watches this point (e.g. the camera); null returns them to idle life. */
    lookAt(point) {
      globalLook = point;
    },
    get ludvig() {
      return members.find((m) => m.name === LUDVIG);
    },
    update,
    dispose() {
      members.forEach((m) => m.person.dispose());
      chairMesh.geometry.dispose();
      mugGeo.dispose();
      clipGeo.dispose();
      pencilGeo.dispose();
      propMat.dispose();
      if (group.parent) group.parent.remove(group);
    }
  };
}
