/**
 * Pekkas Pingis — the people of Bredbyn who came to watch.
 *
 * A village hall final is not played to an empty room, and a crowd that
 * REACTS does more for the sense of occasion than any amount of geometry on
 * the table: heads follow the ball, everyone leans in as a rally gets long,
 * arms go up when you win a point, hands go to heads when you lose one, the
 * room holds its breath on match point — and stands up for the champion.
 *
 * Built as six instanced meshes (torso, head, hair, arms, thighs, shins) so
 * the whole crowd costs six draw calls however many seats are filled.
 */

import * as THREE from 'three';
import { mulberry } from './hall.js';

const SHIRTS = [0x8c3a3a, 0x36506e, 0x4d6b42, 0x7a5a2c, 0x5a3c62, 0x2f5f5c, 0x8a6a3a, 0xa8202c, 0xc9a24a, 0x3d4a66, 0xe0d6c4];
const HAIR = [0x3d2b18, 0x6b4a24, 0x1f1a14, 0xb9b3a6, 0x9a6a3a, 0x2a1c10, 0xd8c08a];
const SKIN = [0xd9a678, 0xe2b48c, 0xc89468, 0xeac3a0];

export function buildCrowd(seats) {
  const rand = mulberry(1938);
  const n = seats.length;
  const lam = () => new THREE.MeshLambertMaterial();
  const capsule = (r, len) => {
    const g = new THREE.CapsuleGeometry(r, len, 3, 8);
    g.translate(0, -(len / 2 + r), 0); // pivot at the top end
    return g;
  };
  const parts = {
    torso: new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.15, 0.24, 4, 10), lam(), n),
    head: new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 12, 9), lam(), n),
    hair: new THREE.InstancedMesh(new THREE.SphereGeometry(0.106, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), lam(), n),
    arm: new THREE.InstancedMesh(capsule(0.042, 0.4), lam(), n * 2),
    thigh: new THREE.InstancedMesh(capsule(0.06, 0.3), lam(), n * 2),
    shin: new THREE.InstancedMesh(capsule(0.052, 0.34), lam(), n * 2)
  };
  const group = new THREE.Group();
  Object.values(parts).forEach((m) => {
    m.frustumCulled = false;
    group.add(m);
  });

  const col = new THREE.Color();
  const people = seats.map((s, i) => {
    const shirt = SHIRTS[Math.floor(rand() * SHIRTS.length)];
    const skin = SKIN[Math.floor(rand() * SKIN.length)];
    const trousers = rand() < 0.5 ? 0x2b3140 : rand() < 0.5 ? 0x4a3e30 : 0x1d2230;
    parts.torso.setColorAt(i, col.setHex(shirt));
    parts.head.setColorAt(i, col.setHex(skin));
    parts.hair.setColorAt(i, col.setHex(HAIR[Math.floor(rand() * HAIR.length)]));
    for (let k = 0; k < 2; k++) {
      parts.arm.setColorAt(i * 2 + k, col.setHex(rand() < 0.6 ? shirt : skin));
      parts.thigh.setColorAt(i * 2 + k, col.setHex(trousers));
      parts.shin.setColorAt(i * 2 + k, col.setHex(trousers));
    }
    return {
      seat: s,
      scale: 0.92 + rand() * 0.16,
      phase: rand() * Math.PI * 2,
      delay: rand() * 0.25,
      fan: 0.6 + rand() * 0.6, // how demonstrative this one is
      look: 0,
      lean: 0,
      armL: 0.45,
      armR: 0.45,
      lift: 0
    };
  });

  const mood = { kind: 'idle', t: 0, power: 1, excite: 0, hush: 0 };
  const M = new THREE.Matrix4();
  const P = new THREE.Matrix4();
  const L = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  const setPart = (mesh, idx, x, y, z, rx, ry, rz, sx = 1, sy = 1, sz = 1) => {
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    L.compose(v.set(x, y, z), q, sc.set(sx, sy, sz));
    M.multiplyMatrices(P, L);
    mesh.setMatrixAt(idx, M);
  };

  /**
   * kind: 'cheer' | 'groan' | 'ooh' | 'celebrate' | 'idle'. Cheers and groans
   * are one-shots that decay; `excite` (0..1, rally length) and `hush`
   * (match point) are levels the game sets every frame.
   */
  function react(kind, power = 1) {
    mood.kind = kind;
    mood.t = 0;
    mood.power = power;
  }

  function update(t, dt, ball, levels) {
    mood.t += dt;
    mood.excite += ((levels.excite || 0) - mood.excite) * Math.min(1, dt * 2);
    mood.hush += ((levels.hush || 0) - mood.hush) * Math.min(1, dt * 2);
    const k = mood.kind;
    people.forEach((p, i) => {
      const s = p.seat;
      const lt = mood.t - p.delay;
      // One-shot envelope: up fast, hold, settle
      const env = lt < 0 ? 0 : lt < 0.15 ? lt / 0.15 : Math.max(0, 1 - (lt - 0.15) / (1.1 * mood.power));
      let armL = 0.45;
      let armR = 0.5;
      let lift = 0;
      let lean = mood.excite * 0.22 + mood.hush * 0.12;
      let slump = 0;
      if (k === 'cheer' && env > 0) {
        const wave = Math.sin(lt * 14 + p.phase) * 0.25;
        armL = 0.45 + (2.6 - 0.45) * env * p.fan + wave * env;
        armR = 0.5 + (2.7 - 0.5) * env * p.fan - wave * env;
        lift = Math.abs(Math.sin(lt * 9 + p.phase)) * 0.07 * env * p.fan;
      } else if (k === 'groan' && env > 0) {
        // Hands to the head
        armL = 0.45 + 2.15 * env * Math.min(1, p.fan);
        armR = 0.5 + 2.1 * env * Math.min(1, p.fan);
        slump = env * 0.18;
      } else if (k === 'ooh' && env > 0) {
        lean += env * 0.18;
        armL = 0.45 + env * 0.9;
        armR = 0.5 + env * 0.9;
      } else if (k === 'celebrate') {
        const wave = Math.sin(t * 10 + p.phase);
        armL = 2.5 + wave * 0.35;
        armR = 2.6 - wave * 0.35;
        lift = Math.abs(Math.sin(t * 7.5 + p.phase)) * 0.09;
        lean = 0;
      } else if (mood.excite > 0.35) {
        // Long rally: a few start clapping
        const clap = Math.sin(t * 13 + p.phase) * 0.12 * (p.fan > 0.9 ? 1 : 0);
        armL = 1.15 + clap;
        armR = 1.15 - clap;
      }
      // Heads track the ball, the hush stills everyone
      const breathe = Math.sin(t * 1.6 + p.phase) * 0.006 * (1 - mood.hush);
      const target = ball
        ? Math.atan2(ball.x - s.x, ball.z - s.z) - s.ry
        : 0;
      const look = THREE.MathUtils.clamp(Math.atan2(Math.sin(target), Math.cos(target)), -1.1, 1.1);
      p.look += (look - p.look) * Math.min(1, dt * 5);
      p.armL += (armL - p.armL) * Math.min(1, dt * 12);
      p.armR += (armR - p.armR) * Math.min(1, dt * 12);
      p.lean += (lean - slump - p.lean) * Math.min(1, dt * 6);
      p.lift += (lift - p.lift) * Math.min(1, dt * 18);

      // Person frame: seat position and facing, scaled
      const standing = s.pose === 'stand' || k === 'celebrate';
      const hipY = s.pose === 'stand' ? 0.86 : standing ? 0.6 : 0.07;
      e.set(0, s.ry, 0);
      q.setFromEuler(e);
      P.compose(v.set(s.x, s.y + p.lift, s.z), q, sc.copy(one).multiplyScalar(p.scale));
      const hip = hipY;
      // Torso, leaning forward from the hip (+z is toward the table)
      const ty = hip + 0.3 * Math.cos(p.lean);
      const tz = 0.3 * Math.sin(p.lean);
      setPart(parts.torso, i, 0, ty + breathe, tz, p.lean, 0, 0, 1.25, 1, 0.7);
      const hy = hip + 0.66 * Math.cos(p.lean) + breathe;
      const hz = 0.66 * Math.sin(p.lean);
      setPart(parts.head, i, 0, hy, hz, 0, p.look, 0, 1, 1.12, 1);
      setPart(parts.hair, i, 0, hy + 0.01, hz - 0.008, -0.25, p.look, 0, 1, 1.05, 1.05);
      const shY = hip + 0.47 * Math.cos(p.lean);
      const shZ = 0.47 * Math.sin(p.lean);
      // Pitch: 0 hangs, π/2 forward, π straight up (negative x-rotation
      // swings a hanging arm toward +z)
      setPart(parts.arm, i * 2, -0.18, shY, shZ, -p.armL, 0, -0.07, 1, 1, 1);
      setPart(parts.arm, i * 2 + 1, 0.18, shY, shZ, -p.armR, 0, 0.07, 1, 1, 1);
      // Legs: seated thighs run forward, shins hang; standing legs drop
      const sitting = !standing;
      for (let j = 0; j < 2; j++) {
        const lx = j ? 0.09 : -0.09;
        if (sitting) {
          setPart(parts.thigh, i * 2 + j, lx, hip, 0, -Math.PI / 2, 0, 0);
          const drop = s.pose === 'ledge' ? 0.2 * Math.sin(t * 2 + p.phase + j) * 0.3 : 0;
          setPart(parts.shin, i * 2 + j, lx, hip, 0.42, drop, 0, 0);
        } else {
          setPart(parts.thigh, i * 2 + j, lx, hip, 0, 0, 0, 0);
          setPart(parts.shin, i * 2 + j, lx, hip - 0.42, 0, 0, 0, 0);
        }
      }
    });
    Object.values(parts).forEach((m) => {
      m.instanceMatrix.needsUpdate = true;
    });
  }

  return { group, react, update };
}
