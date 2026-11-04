/**
 * Pekkas Lerduvor — the gang behind the station.
 *
 * Five of the real 2022 field on fika chairs and Henrik — the arranger —
 * on his feet by the fika table with the score sheet, all built with the
 * shared people system so everyone looks the way they do in every other
 * game. Ludvig, the man whose 3 400 you are chasing, has the middle seat.
 *
 * They are only ever on screen in the establishing shot, on the camera's
 * flight to the gun and back, and in the reaction shot after each series,
 * so the game hides them (and skips their animation) the rest of the time.
 *
 * Behaviour, in layers:
 *  - a base pose per person: sitting, or sitting with a coffee mug that
 *    gets a sip now and then (POSES.sitCup), or Henrik's score sheet;
 *  - idle life: everyone picks something to look at every few seconds —
 *    the station, the trap house, a neighbour — and now and then somebody
 *    talks while the one next to them turns to listen;
 *  - reactions, staggered a little per person so a cheer ripples instead
 *    of firing like one machine: clap, cheer, a gold "no way!" and
 *    Ludvig's arms-crossed smirk when his score survives.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createPerson, appearanceFor, POSES, SEAT_HEIGHT, SEAT_BACK } from '../shared/people.js';

/** Who sits where. x/z is the chair (root) position; yaw 0 faces the field (−z). */
const SEATS = [
  {
    name: 'Tobias Lundqvist', x: -1.95, z: 2.82, yaw: 0.16, cup: true, fabric: 0x2f6d4a,
    look: { outfit: { top: 'shirt' } }
  },
  {
    name: 'Viktor Jones', x: -0.98, z: 2.95, yaw: 0.07, fabric: 0x2b4f86,
    look: { headwear: { style: 'cap', color: 0x1f2328 } }
  },
  {
    name: 'Ludvig Ulenius', x: 0.0, z: 2.86, yaw: 0, cup: true, fabric: 0x9a3a2e,
    look: { outfit: { top: 'sweater', topColor: 0x2f5f5c } }
  },
  {
    name: 'Rickard Nilsson', x: 0.98, z: 2.97, yaw: -0.08, fabric: 0xa8832e,
    look: { headwear: { style: 'beanie', color: 0x2f4a32 }, outfit: { top: 'jacket', topColor: 0x4a5a3a, shoes: 'boots', shoeColor: 0x3a2a1e } }
  },
  {
    name: 'Per Olsson', x: 1.95, z: 2.8, yaw: -0.2, cup: true, fabric: 0x6a5a8a,
    look: { outfit: { top: 'sweater' } }
  }
];

/** Henrik arranged 2022 (with Ludvig) — so he keeps the score sheet. */
const SCORER = {
  name: 'Henrik Lundqvist', x: 3.05, z: 2.15,
  look: { outfit: { top: 'jacket', topColor: 0x3f5a3c, shoes: 'boots', shoeColor: 0x3a2a1e } }
};

const LUDVIG = 'Ludvig Ulenius';

/* ------------------------------------------------------------- props */

/** A cylinder between two points (for chair tubes). */
function tube(a, b, r, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, 6, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
}

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

function boxAt(w, h, d, color, at, rotX = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotX) g.rotateX(rotX);
  g.translate(at[0], at[1], at[2]);
  return paint(g, color);
}

/**
 * A folding fika chair in the person's own frame (facing +z, seat centred
 * SEAT_BACK behind the root, seat top at SEAT_HEIGHT for their height):
 * an aluminium X on each side, canvas seat and a slung canvas back.
 */
function chairParts(scale, fabric) {
  const sh = SEAT_HEIGHT * scale;
  const zc = -SEAT_BACK * scale;
  const alu = 0xb4b8bd;
  const parts = [];
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const shade = new THREE.Color(fabric).multiplyScalar(0.8);
  parts.push(boxAt(0.46, 0.025, 0.42, fabric, [0, sh - 0.018, zc]));
  parts.push(boxAt(0.46, 0.34, 0.02, shade, [0, sh + 0.3, zc - 0.25], -0.16));
  [-1, 1].forEach((s) => {
    const x = s * 0.24;
    parts.push(tube(v(x, 0, zc + 0.22), v(x, sh - 0.02, zc - 0.2), 0.011, alu));
    parts.push(tube(v(x, 0, zc - 0.22), v(x, sh - 0.02, zc + 0.2), 0.011, alu));
    parts.push(tube(v(x, sh - 0.02, zc - 0.21), v(x, sh - 0.02, zc + 0.21), 0.011, alu));
    parts.push(tube(v(x, sh - 0.02, zc - 0.21), v(x, sh + 0.5, zc - 0.31), 0.011, alu));
  });
  parts.push(tube(v(-0.24, sh - 0.02, zc + 0.21), v(0.24, sh - 0.02, zc + 0.21), 0.01, alu));
  parts.push(tube(v(-0.24, 0.012, zc - 0.22), v(0.24, 0.012, zc - 0.22), 0.01, alu));
  return parts;
}

/** An enamel mug (white, blue rim) and Henrik's clipboard. */
function mugGeometry() {
  const body = new THREE.CylinderGeometry(0.04, 0.036, 0.09, 14);
  const rim = new THREE.CylinderGeometry(0.0405, 0.0405, 0.008, 14, 1, true);
  rim.translate(0, 0.043, 0);
  const handle = new THREE.TorusGeometry(0.024, 0.006, 5, 10, Math.PI);
  handle.rotateZ(-Math.PI / 2);
  handle.translate(0.04, 0, 0);
  const parts = [paint(body, 0xf2efe6), paint(rim, 0x2a4a82), paint(handle, 0xf2efe6)];
  return mergeGeometries(parts);
}

function clipboardGeometry() {
  return mergeGeometries([
    boxAt(0.17, 0.012, 0.23, 0x8a6236, [0, 0, 0]),
    boxAt(0.15, 0.004, 0.19, 0xf4f1e8, [0, 0.008, 0.012]),
    boxAt(0.07, 0.01, 0.025, 0xb8bcc2, [0, 0.01, -0.1])
  ]);
}

/* ------------------------------------------------------------- the gang */

export function buildGang({ rand }) {
  const group = new THREE.Group();
  group.name = 'gang';
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mugGeo = mugGeometry();
  const clipGeo = clipboardGeometry();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const members = [];
  const chairs = [];

  function addMember(def, seated) {
    const person = createPerson(appearanceFor(def.name, def.look || {}));
    const yaw = Math.PI + (def.yaw || 0);
    person.root.position.set(def.x, 0, def.z);
    // Seated: facing the field. Standing: turned toward the station and the trap
    person.root.rotation.y = seated ? yaw : Math.atan2(0.4 - def.x, -7 - def.z);
    group.add(person.root);
    const m = {
      name: def.name, person, seated, cup: null, prop: null,
      base: seated ? (def.cup ? 'sitCup' : 'sit') : 'notebook',
      react: null, reactT: 0, delay: 0, surprise: 0,
      phase: rand() * 10, tempo: 0.9 + rand() * 0.25,
      idleLook: new THREE.Vector3(0, 1.4, 0), lookT: rand() * 2, talkT: 0, listenTo: null,
      pose: null
    };
    if (seated) {
      // The chair, in world space, merged with the others below
      m4.compose(person.root.position, q.setFromAxisAngle(up, yaw), new THREE.Vector3(1, 1, 1));
      chairParts(person.scale, def.fabric).forEach((g) => chairs.push(g.applyMatrix4(m4)));
    }
    if (def.cup) {
      m.cup = new THREE.Mesh(mugGeo, propMat);
      m.cup.castShadow = true;
      person.attach(m.cup, 'gripR', { position: [0, 0.01, 0.005], rotation: [Math.PI / 2, 0, 0] });
    }
    if (!seated) {
      m.prop = new THREE.Mesh(clipGeo, propMat);
      m.prop.castShadow = true;
      person.attach(m.prop, 'gripL', { position: [0.06, -0.02, 0.06], rotation: [0, 0, Math.PI / 2] });
    }
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

  // Idle gaze targets: the station, the trap house, the field
  const SPOTS = [new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0, 1.2, -16), new THREE.Vector3(-6, 3, -30), new THREE.Vector3(5, 2.5, -26)];

  let globalLook = null; // a point everyone watches (the camera) or null
  const tmp = new THREE.Vector3();

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
    if (mode === 'clap') p = m.seated ? POSES.sitClap(tt, m.pose) : POSES.clap(tt, m.pose);
    else if (mode === 'cheer' || mode === 'gold') p = m.seated ? POSES.sitCheer(tt, m.pose) : POSES.cheer(tt, m.pose);
    else if (mode === 'crossed') {
      // Seated with the arms folded: the sitting legs, armsCrossed above the hips
      p = m.seated ? POSES.sit(tt, m.pose) : POSES.armsCrossed(tt, m.pose);
      if (m.seated) {
        const c = POSES.armsCrossed(0);
        for (const b of ['upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR']) p[b] = c[b];
        p.gripL = c.gripL;
        p.gripR = c.gripR;
        p.chest[0] -= 0.1; // leaning back in the chair
      }
    } else if (m.base === 'sitCup') p = POSES.sitCup(tt, m.pose);
    else if (m.base === 'notebook') p = POSES.holdNotebook(tt, m.pose);
    else p = POSES.sit(tt, m.pose);
    m.pose = p;
    return mode;
  }

  function expressionFor(m, mode) {
    if (m.surprise > 0) return 'surprised';
    if (mode === 'cheer' || mode === 'gold') return { grin: 0.8, shout: 0.35 };
    if (mode === 'clap') return 'smile';
    if (mode === 'crossed') return { smile: 0.55, focus: 0.25 };
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

  function update(dt, t) {
    const blendRate = 1 - Math.exp(-dt * 9);
    members.forEach((m, i) => {
      if (m.delay > 0) m.delay -= dt;
      else if (m.reactT > 0) m.reactT -= dt;
      if (m.surprise > 0 && m.delay <= 0) m.surprise -= dt;
      const mode = poseFor(m, t);
      m.person.setPose(m.pose, blendRate);
      if (m.cup) m.cup.visible = !mode && m.base === 'sitCup';
      m.person.setExpression(expressionFor(m, mode));
      if (!mode) idle(m, i, dt);
      m.person.talk(!mode && m.talkT > 0 ? 0.8 : 0);
      if (globalLook) {
        m.person.lookAt(globalLook);
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
      propMat.dispose();
      if (group.parent) group.parent.remove(group);
    }
  };
}
