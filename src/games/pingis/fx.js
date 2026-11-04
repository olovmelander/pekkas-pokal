/**
 * Pekkas Pingis — the juice layer.
 *
 * Everything here is feedback, never physics: the trail behind the ball, the
 * ring a bounce leaves on the table, the swoosh of a swing, contact sparks
 * and the confetti for the champion. Each effect is one draw call with a
 * fixed-size buffer, so a long rally costs exactly what a short one does.
 *
 * Colour is a language shared by all of them. Topspin is ORANGE, backspin is
 * VIOLET, sidespin pulls toward TEAL and a flat ball stays warm white — the
 * same for your shots and the opponent's, so an incoming trail tells you
 * what is on the ball before it bounces.
 */

import * as THREE from 'three';

const TOP = new THREE.Color(0xff8a3d);
const BACK = new THREE.Color(0x8f7bff);
const SIDE = new THREE.Color(0x5eead4);
const FLAT = new THREE.Color(0xfff1d6);

/** The spin colour for a topspin (+) / backspin (−) and sidespin amount. */
export function spinColor(st, ss, out = new THREE.Color()) {
  out.copy(FLAT);
  if (st > 0) out.lerp(TOP, Math.min(1, st * 1.6));
  else out.lerp(BACK, Math.min(1, -st * 1.6));
  out.lerp(SIDE, Math.min(0.6, Math.abs(ss) * 0.9));
  return out;
}

/** CSS twin of spinColor for HUD labels. */
export function spinCss(st, ss) {
  return `#${spinColor(st, ss).getHexString()}`;
}

const additive = (opts = {}) => new THREE.MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
  ...opts
});

/**
 * A camera-facing ribbon through the ball's recent positions. Sampled by
 * time, not by frame, so it is the same length at 30 and 120 fps — and a
 * fast ball naturally draws a longer streak than a slow one.
 */
export class Trail {
  constructor({ max = 40, width = 0.017, life = 0.16 } = {}) {
    this.max = max;
    this.width = width;
    this.life = life;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.col = new Float32Array(max * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, additive());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this._t = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
  }

  push(p, color, boost = 1) {
    let e;
    if (this.pts.length >= this.max) e = this.pts.pop();
    else e = { p: new THREE.Vector3(), c: new THREE.Color(), age: 0, boost: 1 };
    e.p.copy(p);
    e.c.copy(color);
    e.age = 0;
    e.boost = boost;
    this.pts.unshift(e);
  }

  clear() {
    this.pts.length = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }

  update(dt, camPos) {
    const { pts } = this;
    for (let i = 0; i < pts.length; i++) pts[i].age += dt;
    while (pts.length && pts[pts.length - 1].age > this.life) pts.pop();
    const n = pts.length;
    if (n < 2) {
      this.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)].p;
      const b = pts[Math.min(n - 1, i + 1)].p;
      this._t.subVectors(a, b);
      this._v.subVectors(camPos, pts[i].p);
      this._s.crossVectors(this._t, this._v).normalize();
      const k = 1 - i / (n - 1);
      const fade = Math.max(0, 1 - pts[i].age / this.life);
      const w = this.width * (0.25 + 0.75 * k) * pts[i].boost;
      const { p } = pts[i];
      this.pos[i * 6] = p.x + this._s.x * w;
      this.pos[i * 6 + 1] = p.y + this._s.y * w;
      this.pos[i * 6 + 2] = p.z + this._s.z * w;
      this.pos[i * 6 + 3] = p.x - this._s.x * w;
      this.pos[i * 6 + 4] = p.y - this._s.y * w;
      this.pos[i * 6 + 5] = p.z - this._s.z * w;
      const a2 = fade * k * 0.95;
      const { c } = pts[i];
      for (let j = 0; j < 2; j++) {
        this.col.set([c.r, c.g, c.b, a2], i * 8 + j * 4);
      }
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }
}

/**
 * The swing: a swept band between the blade's root and its tip, the way a
 * sword trail is drawn. It only lives for a fraction of a second after a
 * stroke, and its colour is the spin the stroke put on the ball.
 */
export class Swoosh {
  constructor({ max = 18, life = 0.2 } = {}) {
    this.max = max;
    this.life = life;
    this.samples = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.col = new Float32Array(max * 2 * 4);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(geo, additive());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.color = new THREE.Color();
    this.active = 0;
  }

  /** Arm the trail for `dur` seconds of sampling in `color`. */
  fire(color, dur = 0.16) {
    this.color.copy(color);
    this.active = dur;
  }

  sample(root, tip, dt) {
    if (this.active > 0) {
      this.active -= dt;
      let s;
      if (this.samples.length >= this.max) s = this.samples.pop();
      else s = { a: new THREE.Vector3(), b: new THREE.Vector3(), age: 0 };
      s.a.copy(root);
      s.b.copy(tip);
      s.age = 0;
      this.samples.unshift(s);
    }
    const sm = this.samples;
    for (let i = 0; i < sm.length; i++) sm[i].age += dt;
    while (sm.length && sm[sm.length - 1].age > this.life) sm.pop();
    const n = sm.length;
    if (n < 2) {
      this.mesh.geometry.setDrawRange(0, 0);
      return;
    }
    const c = this.color;
    for (let i = 0; i < n; i++) {
      const s = sm[i];
      this.pos.set([s.a.x, s.a.y, s.a.z, s.b.x, s.b.y, s.b.z], i * 6);
      const f = Math.max(0, 1 - s.age / this.life) * (1 - i / n);
      this.col.set([c.r, c.g, c.b, f * 0.12, c.r, c.g, c.b, f * 0.75], i * 8);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, (n - 1) * 6);
  }

  clear() {
    this.samples.length = 0;
    this.active = 0;
    this.mesh.geometry.setDrawRange(0, 0);
  }
}

/**
 * Impact rings: one instanced quad per ring, the ring itself drawn in the
 * shader. A bounce on the table leaves one lying flat in the spin colour;
 * a paddle contact throws one facing the camera.
 */
export class Rings {
  constructor(n = 12) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(1, 1);
    this.aT = new THREE.InstancedBufferAttribute(new Float32Array(n).fill(1), 1);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aT.setUsage(THREE.DynamicDrawUsage);
    this.aC.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aT', this.aT);
    geo.setAttribute('aC', this.aC);
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        attribute float aT;
        attribute vec3 aC;
        varying vec2 vUv;
        varying float vT;
        varying vec3 vC;
        void main() {
          vUv = uv;
          vT = aT;
          vC = aC;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv;
        varying float vT;
        varying vec3 vC;
        void main() {
          if (vT >= 1.0) discard;
          float d = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.6, 0.8, d) * (1.0 - smoothstep(0.84, 1.0, d));
          float core = (1.0 - smoothstep(0.0, 0.55, d)) * max(0.0, 1.0 - vT * 5.0);
          float a = (ring + core * 0.8) * pow(1.0 - vT, 1.6);
          gl_FragColor = vec4(vC * 1.6, a);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.items = Array.from({ length: n }, () => ({
      t: 1, dur: 0.5, size: 0.2, p: new THREE.Vector3(), q: new THREE.Quaternion()
    }));
    this.next = 0;
    this._m = new THREE.Matrix4();
    this._s = new THREE.Vector3();
    this._flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  }

  spawn(p, color, size = 0.22, dur = 0.5, quat = null) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    const it = this.items[i];
    it.t = 0;
    it.dur = dur;
    it.size = size;
    it.p.copy(p);
    it.q.copy(quat || this._flat);
    this.aC.setXYZ(i, color.r, color.g, color.b);
    this.aC.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.n; i++) {
      const it = this.items[i];
      if (it.t >= 1) {
        this.aT.setX(i, 1);
        continue;
      }
      any = true;
      it.t = Math.min(1, it.t + dt / it.dur);
      const grow = 1 - (1 - it.t) ** 3;
      const s = it.size * (0.2 + 0.8 * grow);
      this._m.compose(it.p, it.q, this._s.set(s, s, s));
      this.mesh.setMatrixAt(i, this._m);
      this.aT.setX(i, it.t);
    }
    this.aT.needsUpdate = true;
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Contact sparks: a small burst of additive points that arc and die. */
export class Sparks {
  constructor(glow, n = 96) {
    this.n = n;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.035, map: glow, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    this.p = Array.from({ length: n }, () => ({
      x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, c: new THREE.Color()
    }));
    this.next = 0;
  }

  burst(at, color, count = 14, speed = 1.6, rand = Math.random) {
    for (let k = 0; k < count; k++) {
      const s = this.p[this.next];
      this.next = (this.next + 1) % this.n;
      const th = rand() * Math.PI * 2;
      const ph = Math.acos(2 * rand() - 1);
      const v = speed * (0.4 + rand() * 0.8);
      s.x = at.x;
      s.y = at.y;
      s.z = at.z;
      s.vx = Math.sin(ph) * Math.cos(th) * v;
      s.vy = Math.abs(Math.cos(ph)) * v * 0.9 + 0.4;
      s.vz = Math.sin(ph) * Math.sin(th) * v;
      s.max = 0.25 + rand() * 0.3;
      s.life = s.max;
      s.c.copy(color);
    }
  }

  update(dt) {
    for (let i = 0; i < this.n; i++) {
      const s = this.p[i];
      if (s.life <= 0) {
        this.col[i * 3] = 0;
        this.col[i * 3 + 1] = 0;
        this.col[i * 3 + 2] = 0;
        continue;
      }
      s.life -= dt;
      s.vy -= 6 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      const f = Math.max(0, s.life / s.max) * 1.4;
      this.pos[i * 3] = s.x;
      this.pos[i * 3 + 1] = s.y;
      this.pos[i * 3 + 2] = s.z;
      this.col[i * 3] = s.c.r * f;
      this.col[i * 3 + 1] = s.c.g * f;
      this.col[i * 3 + 2] = s.c.b * f;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

/**
 * Confetti for the champion: paper squares that tumble, flutter and settle
 * on the floor and the table. Instanced, with a colour per piece.
 */
export class Confetti {
  constructor(n = 320) {
    this.n = n;
    const geo = new THREE.PlaneGeometry(0.035, 0.022);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const cols = [0xf2c14e, 0xd8394d, 0x2e5f9e, 0xfff1d6, 0xa8202c, 0x5eead4].map((c) => new THREE.Color(c));
    this.items = Array.from({ length: n }, (_, i) => {
      this.mesh.setColorAt(i, cols[i % cols.length]);
      return {
        p: new THREE.Vector3(), v: new THREE.Vector3(), ax: new THREE.Vector3(1, 0, 0),
        ang: 0, spin: 0, ph: 0, rest: false
      };
    });
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  /** Release a cloud over (x, z) from just under the ceiling. */
  launch(rand = Math.random, cx = 0, cz = 0, spread = 2.6) {
    this.mesh.visible = true;
    this.items.forEach((it) => {
      it.p.set(cx + (rand() - 0.5) * spread * 1.6, 3.4 + rand() * 1.4, cz + (rand() - 0.5) * spread * 1.8);
      it.v.set((rand() - 0.5) * 0.6, -0.2 - rand() * 0.6, (rand() - 0.5) * 0.6);
      it.ax.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      it.ang = rand() * 6.28;
      it.spin = 4 + rand() * 9;
      it.ph = rand() * 6.28;
      it.rest = false;
    });
  }

  stop() {
    this.mesh.visible = false;
  }

  update(dt, t, floorAt) {
    if (!this.mesh.visible) return;
    this.items.forEach((it, i) => {
      if (!it.rest) {
        // Paper falls at a terminal speed and drifts in little loops
        it.v.y = Math.max(-0.75, it.v.y - 2.2 * dt);
        it.p.x += (it.v.x + Math.sin(t * 3 + it.ph) * 0.35) * dt;
        it.p.y += it.v.y * dt;
        it.p.z += (it.v.z + Math.cos(t * 2.6 + it.ph) * 0.35) * dt;
        it.ang += it.spin * dt;
        const ground = floorAt(it.p.x, it.p.z);
        if (it.p.y <= ground) {
          it.p.y = ground;
          it.rest = true;
          it.ax.set(1, 0, 0);
          it.ang = -Math.PI / 2;
        }
      }
      this._q.setFromAxisAngle(it.ax, it.ang);
      this._m.compose(it.p, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
