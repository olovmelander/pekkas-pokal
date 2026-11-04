/**
 * Pekkas Lerskulptur — the keramiker's guide, drawn over the wheel.
 *
 * Everything here lives in one vertical plane through the wheel's axis that
 * is turned to face the camera every frame, so it always reads as a flat
 * diagram laid over the pot:
 *
 *  - the GHOST: the target silhouette as a glowing dashed ribbon (a mesh
 *    strip, not GL lines, so it is equally legible on a 4K monitor and a
 *    phone) whose dashes flow upward
 *  - the DIFF: a live band between your wall and the target wall — warm
 *    where clay has to be pushed in, cool where it has to be pulled out —
 *    so "what do I do next" is answered at a glance
 *  - CHEVRONS at the worst spot, pulsing in the direction to work, shown
 *    when the hands are off the clay
 *  - the CONTACT RING: where the wheel is turning the clay under your hand
 */

import * as THREE from 'three';
import { N, H } from './clay.js';

const TOL = 0.035; // what still counts as "on the line"
const PUSH = new THREE.Color(1.0, 0.42, 0.24);
const PULL = new THREE.Color(0.35, 0.78, 1.0);

function ghostStrip(profile, side, width) {
  const M = 72;
  const pts = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    pts.push(new THREE.Vector2(side * profile(u), u * H));
  }
  const pos = [];
  const uv = [];
  const idx = [];
  let dist = 0;
  for (let i = 0; i <= M; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(M, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
    pos.push(pts[i].x + nx * width, pts[i].y + ny * width, 0, pts[i].x - nx * width, pts[i].y - ny * width, 0);
    uv.push(dist, 0, dist, 1);
    if (i < M) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function buildGuide() {
  const group = new THREE.Group();

  /* Ghost ribbon */
  const ghostMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 1 },
      uColor: { value: new THREE.Color(0.45, 1.6, 1.4) }
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
        edge = smoothstep(0.0, 0.6, edge);
        float dash = smoothstep(0.38, 0.5, fract(vUv.x * 7.0 - uTime * 0.5));
        dash = 1.0 - dash * smoothstep(1.0, 0.88, fract(vUv.x * 7.0 - uTime * 0.5));
        float a = edge * mix(0.3, 1.0, dash) * uOpacity;
        gl_FragColor = vec4(uColor, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const ghost = new THREE.Group();
  ghost.renderOrder = 31;
  group.add(ghost);

  /* Diff band: per side, per row, a quad from your wall to the target */
  const bandGeo = new THREE.BufferGeometry();
  const bandPos = new Float32Array(2 * N * 2 * 3);
  const bandCol = new Float32Array(2 * N * 2 * 4);
  bandGeo.setAttribute('position', new THREE.BufferAttribute(bandPos, 3).setUsage(THREE.DynamicDrawUsage));
  bandGeo.setAttribute('color', new THREE.BufferAttribute(bandCol, 4).setUsage(THREE.DynamicDrawUsage));
  const bandIdx = [];
  for (let s = 0; s < 2; s++) {
    for (let j = 0; j < N - 1; j++) {
      const a = (s * N + j) * 2;
      const c = a + 2;
      bandIdx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  bandGeo.setIndex(bandIdx);
  const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  }));
  band.frustumCulled = false;
  band.renderOrder = 30;
  group.add(band);

  /* Chevrons at the worst spot */
  const chevGeo = new THREE.BufferGeometry();
  chevGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0.0, 0.0, 0, -0.11, 0.1, 0, -0.06, 0, 0,
    0.0, 0.0, 0, -0.06, 0, 0, -0.11, -0.1, 0
  ], 3));
  const chevMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false
  });
  const chevrons = [-1, 1].map(() => {
    const m = new THREE.Group();
    [0, 0.09].forEach((dx) => {
      const c = new THREE.Mesh(chevGeo, chevMat);
      c.position.x = dx;
      c.renderOrder = 32;
      m.add(c);
    });
    m.visible = false;
    group.add(m);
    return m;
  });

  /* Contact ring around the clay at the working height */
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.014, 6, 64), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 9;

  let target = null;
  const worst = { j: 0, d: 0 };

  return {
    group,
    ring,
    worst,
    setTarget(profile) {
      target = profile;
      ghost.children.forEach((m) => m.geometry.dispose());
      ghost.clear();
      [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(ghostStrip(profile, s, 0.018), ghostMat);
        m.renderOrder = 31;
        m.frustumCulled = false;
        ghost.add(m);
      });
    },
    /** Rebuild the diff band from the live profile and find the worst row. */
    updateDiff(r, strength = 1) {
      if (!target) return;
      worst.d = 0;
      for (let s = 0; s < 2; s++) {
        const side = s ? 1 : -1;
        for (let j = 0; j < N; j++) {
          const u = j / (N - 1);
          const t = target(u);
          const d = r[j] - t;
          const k = (s * N + j) * 2;
          const y = u * H;
          bandPos[k * 3] = side * r[j];
          bandPos[k * 3 + 1] = y;
          bandPos[k * 3 + 2] = 0;
          bandPos[(k + 1) * 3] = side * t;
          bandPos[(k + 1) * 3 + 1] = y;
          bandPos[(k + 1) * 3 + 2] = 0;
          const c = d > 0 ? PUSH : PULL;
          const a = Math.min(1, Math.max(0, (Math.abs(d) - TOL) / 0.12)) * 0.5 * strength;
          for (const v of [k, k + 1]) {
            bandCol[v * 4] = c.r;
            bandCol[v * 4 + 1] = c.g;
            bandCol[v * 4 + 2] = c.b;
            bandCol[v * 4 + 3] = v === k ? a * 0.55 : a;
          }
          // Weight the middle a little: the foot and lip matter less
          const wd = Math.abs(d) * (0.75 + 0.25 * Math.sin(u * Math.PI));
          if (s && j > 2 && wd > worst.d) {
            worst.d = wd;
            worst.j = j;
            worst.sign = Math.sign(d);
          }
        }
      }
      bandGeo.attributes.position.needsUpdate = true;
      bandGeo.attributes.color.needsUpdate = true;
    },
    /** Pulse the chevrons at the worst row (visible only when asked). */
    updateHints(r, t, show) {
      const on = show && worst.d > 0.11;
      chevrons.forEach((m, i) => {
        m.visible = on;
        if (!on) return;
        const side = i ? 1 : -1;
        const { j } = worst;
        const y = (j / (N - 1)) * H;
        const bob = Math.sin(t * 6) * 0.04;
        // The chevron points along +x; flip it to point the way to work.
        // Push in: outside the clay, pointing at the axis. Pull out: inside
        // the cool band, pointing away from it.
        if (worst.sign > 0) {
          m.position.set(side * (r[j] + 0.22 + bob), y, 0);
          m.scale.set(-side, 1, 1);
        } else {
          m.position.set(side * (r[j] + 0.16 + bob), y, 0);
          m.scale.set(side, 1, 1);
        }
      });
      chevMat.color.copy(worst.sign > 0 ? PUSH : PULL);
      chevMat.opacity = 0.65 + Math.sin(t * 6) * 0.3;
    },
    setGhostTime(t, opacity) {
      ghostMat.uniforms.uTime.value = t;
      ghostMat.uniforms.uOpacity.value = opacity;
    },
    /** Contact ring at height y and radius rr; push > 0 warm, < 0 cool. */
    setRing(on, y, rr, push, dt) {
      const goal = on ? 0.85 : 0;
      ringMat.opacity += (goal - ringMat.opacity) * Math.min(1, dt * 12);
      ring.visible = ringMat.opacity > 0.01;
      if (on) {
        ring.position.y = y;
        ring.scale.set(rr + 0.012, rr + 0.012, 1);
        ringMat.color.copy(push >= 0 ? PUSH : PULL).lerp(new THREE.Color(1, 1, 1), 0.35);
      }
    },
    dispose() {
      ghost.children.forEach((m) => m.geometry.dispose());
      ghostMat.dispose();
      bandGeo.dispose();
      band.material.dispose();
      chevGeo.dispose();
      chevMat.dispose();
      ring.geometry.dispose();
      ringMat.dispose();
    }
  };
}
