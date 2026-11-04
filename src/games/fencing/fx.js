/**
 * Pekkas Fäktning — effects: spark streaks, blade trails, hit rings and
 * the champion's confetti.
 *
 * Sparks are instanced quads stretched along their own velocity in view
 * space, so a parry throws out real streaks rather than round dots — the
 * look of hot steel shavings — and bloom turns their heads into points
 * of light. Trails are ribbons through the last dozen positions of the
 * blade, brightness tied to how fast the steel was moving, so an idle
 * blade leaves nothing and a lunge leaves a smear.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------- sparks */

const SPARK_VERT = `
attribute vec3 aPos;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec2 aLife; // remaining life 0..1, width
varying vec2 vUv;
varying vec3 vColor;
varying float vLife;
void main() {
  vec3 vh = (viewMatrix * vec4(aPos, 1.0)).xyz;
  vec3 vt = (viewMatrix * vec4(aPos - aVel * 0.035, 1.0)).xyz;
  vec3 dir = vt - vh;
  float w = aLife.y;
  if (length(dir.xy) < w) dir = vec3(normalize(dir.xy + vec2(1e-4, 0.0)) * w, dir.z);
  vec3 side = normalize(cross(dir, vec3(0.0, 0.0, 1.0)));
  vec3 p = mix(vh, vh + dir, position.x + 0.5) + side * position.y * w;
  vUv = vec2(position.x + 0.5, position.y * 2.0);
  vColor = aColor;
  vLife = aLife.x;
  gl_Position = projectionMatrix * vec4(p, 1.0);
}`;

const SPARK_FRAG = `
varying vec2 vUv;
varying vec3 vColor;
varying float vLife;
void main() {
  if (vLife <= 0.0) discard;
  float across = exp(-vUv.y * vUv.y * 3.5);
  float along = 1.0 - vUv.x * 0.85;
  gl_FragColor = vec4(vColor * across * along * vLife, 1.0);
  #include <colorspace_fragment>
}`;

export class Sparks {
  constructor(count = 220) {
    this.n = count;
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.life = new Float32Array(count * 2);
    this.age = new Float32Array(count);
    this.max = new Float32Array(count);
    this.grav = new Float32Array(count);
    const attr = (arr, size) => {
      const a = new THREE.InstancedBufferAttribute(arr, size);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos = attr(this.pos, 3);
    this.aVel = attr(this.vel, 3);
    this.aCol = attr(this.col, 3);
    this.aLife = attr(this.life, 2);
    geo.setAttribute('aPos', this.aPos);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aColor', this.aCol);
    geo.setAttribute('aLife', this.aLife);
    geo.instanceCount = count;
    this.quad = quad;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      vertexShader: SPARK_VERT,
      fragmentShader: SPARK_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.next = 0;
    this.alive = 0;
    this.rand = Math.random;
  }

  /**
   * @param {THREE.Vector3} at
   * @param {object} o  n, speed, color (THREE.Color, HDR ok), spread
   *                    (cone around dir), dir (Vector3), life, width, gravity
   */
  burst(at, o) {
    const r = this.rand;
    const n = o.n || 20;
    const c = o.color;
    for (let k = 0; k < n; k++) {
      const i = this.next++ % this.n;
      // Random direction, biased along dir if given
      let x = r() * 2 - 1;
      let y = r() * 2 - 1;
      let z = r() * 2 - 1;
      const l = Math.hypot(x, y, z) || 1;
      x /= l;
      y /= l;
      z /= l;
      if (o.dir) {
        const s = o.spread ?? 0.6;
        x = o.dir.x + x * s;
        y = o.dir.y + y * s;
        z = o.dir.z + z * s;
      }
      const sp = (o.speed || 3) * (0.35 + r() * 0.85);
      this.pos.set([at.x, at.y, at.z], i * 3);
      this.vel.set([x * sp, y * sp + (o.lift ?? 0.8), z * sp * 0.6], i * 3);
      const b = 0.6 + r() * 0.6;
      this.col.set([c.r * b, c.g * b, c.b * b], i * 3);
      this.max[i] = (o.life || 0.5) * (0.5 + r() * 0.8);
      this.age[i] = 0;
      this.life[i * 2] = 1;
      this.life[i * 2 + 1] = (o.width || 0.012) * (0.7 + r() * 0.6);
      this.grav[i] = o.gravity ?? 7;
    }
    this.alive = this.n;
    this.aCol.needsUpdate = true;
  }

  update(dt) {
    if (!this.alive) return;
    let any = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i * 2] <= 0) continue;
      any++;
      this.age[i] += dt;
      const k = 1 - this.age[i] / this.max[i];
      if (k <= 0) {
        this.life[i * 2] = 0;
        continue;
      }
      this.life[i * 2] = k * k;
      const j = i * 3;
      this.vel[j + 1] -= this.grav[i] * dt;
      // A little air drag so streaks shorten as they cool
      const drag = 1 - Math.min(0.5, dt * 1.6);
      this.vel[j] *= drag;
      this.vel[j + 1] *= drag;
      this.vel[j + 2] *= drag;
      this.pos[j] += this.vel[j] * dt;
      this.pos[j + 1] += this.vel[j + 1] * dt;
      this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.02) {
        this.pos[j + 1] = 0.02;
        this.vel[j + 1] *= -0.35;
      }
    }
    this.alive = any;
    this.aPos.needsUpdate = true;
    this.aVel.needsUpdate = true;
    this.aLife.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.quad.dispose();
    this.mesh.material.dispose();
  }
}

/* ------------------------------------------------------------- trails */

/**
 * A ribbon between the blade's tip and a point halfway down the blade,
 * through its last N positions. Alpha per sample comes from the speed the
 * blade had at that moment, and fades with age.
 */
export class Trail {
  constructor(color, n = 14) {
    this.n = n;
    this.tips = new Float32Array(n * 3);
    this.mids = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.color = new THREE.Color(color);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.primed = false;
    this.last = new THREE.Vector3();
    this.gain = 1;
  }

  push(tip, mid, dt) {
    if (!this.primed) {
      for (let i = 0; i < this.n; i++) {
        this.tips.set([tip.x, tip.y, tip.z], i * 3);
        this.mids.set([mid.x, mid.y, mid.z], i * 3);
      }
      this.last.copy(tip);
      this.primed = true;
    }
    const speed = dt > 0 ? tip.distanceTo(this.last) / dt : 0;
    this.last.copy(tip);
    this.tips.copyWithin(3, 0, (this.n - 1) * 3);
    this.mids.copyWithin(3, 0, (this.n - 1) * 3);
    this.alpha.copyWithin(1, 0, this.n - 1);
    this.tips.set([tip.x, tip.y, tip.z], 0);
    this.mids.set([mid.x, mid.y, mid.z], 0);
    if (dt > 0) this.alpha[0] = Math.min(1, Math.max(0, (speed - 1.6) / 5)) * this.gain;
    const p = this.posAttr.array;
    const c = this.colAttr.array;
    const col = this.color;
    for (let i = 0; i < this.n; i++) {
      const fade = this.alpha[i] * (1 - i / this.n) ** 1.5;
      p.set(this.tips.subarray(i * 3, i * 3 + 3), i * 6);
      p.set(this.mids.subarray(i * 3, i * 3 + 3), i * 6 + 3);
      c[i * 6] = col.r * fade;
      c[i * 6 + 1] = col.g * fade;
      c[i * 6 + 2] = col.b * fade;
      // The mid edge is dimmer: the smear is brightest at the point
      c[i * 6 + 3] = col.r * fade * 0.15;
      c[i * 6 + 4] = col.g * fade * 0.15;
      c[i * 6 + 5] = col.b * fade * 0.15;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
  }

  reset() {
    this.primed = false;
    this.alpha.fill(0);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/* ---------------------------------------------------------- textures */

export function starTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.08)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Four-point glint
  ctx.globalCompositeOperation = 'lighter';
  [[1, 0.05], [0.05, 1]].forEach(([sx, sy]) => {
    const r = ctx.createRadialGradient(c, c, 0, c, c, c);
    r.addColorStop(0, 'rgba(255,255,255,0.9)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.save();
    ctx.translate(c, c);
    ctx.scale(sx, sy);
    ctx.translate(-c, -c);
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
  });
  return new THREE.CanvasTexture(cv);
}

export function ringTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, c * 0.55, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(cv);
}

/* ---------------------------------------------------- impact flashes */

/** A short-lived additive sprite pair: hot core plus expanding ring. */
export class Flashes {
  constructor(glow, ring, count = 6) {
    this.group = new THREE.Group();
    this.items = [];
    for (let i = 0; i < count; i++) {
      const core = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
      }));
      const rim = new THREE.Sprite(new THREE.SpriteMaterial({
        map: ring, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0
      }));
      core.renderOrder = 10;
      rim.renderOrder = 10;
      this.group.add(core, rim);
      this.items.push({ core, rim, t: 1, dur: 0.3, size: 1 });
    }
    this.next = 0;
  }

  fire(at, color, size = 1, dur = 0.32) {
    const it = this.items[this.next++ % this.items.length];
    it.core.position.copy(at);
    it.rim.position.copy(at);
    it.core.material.color.copy(color);
    it.rim.material.color.copy(color);
    it.t = 0;
    it.dur = dur;
    it.size = size;
  }

  update(dt) {
    this.items.forEach((it) => {
      if (it.t >= 1) {
        it.core.visible = false;
        it.rim.visible = false;
        return;
      }
      it.t = Math.min(1, it.t + dt / it.dur);
      const k = it.t;
      it.core.visible = true;
      it.rim.visible = true;
      it.core.material.opacity = (1 - k) ** 2;
      it.core.scale.setScalar(it.size * (0.5 + k * 0.6));
      it.rim.material.opacity = (1 - k) * 0.9;
      it.rim.scale.setScalar(it.size * (0.25 + k * 1.6));
    });
  }

  dispose() {
    this.items.forEach((it) => {
      it.core.material.dispose();
      it.rim.material.dispose();
    });
  }
}

/* ------------------------------------------------------------ confetti */

const CONFETTI = [0xf2c14e, 0xffe7a0, 0xd99a2b, 0xffffff, 0x3e6e9e, 0xf4d47a];

/** Gold-and-blue paper falling from the ceiling for the champion. */
export class Confetti {
  constructor(count = 260) {
    this.n = count;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.05, 0.03),
      new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.5 }),
      count
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) this.mesh.setColorAt(i, col.set(CONFETTI[i % CONFETTI.length]));
    this.p = new Float32Array(count * 3);
    this.v = new Float32Array(count * 3);
    this.r = new Float32Array(count * 3);
    this.o = new THREE.Object3D();
    this.active = false;
  }

  start(cx, cz) {
    for (let i = 0; i < this.n; i++) {
      this.p.set([cx + (Math.random() - 0.5) * 9, 5 + Math.random() * 6, cz + (Math.random() - 0.5) * 5], i * 3);
      this.v.set([(Math.random() - 0.5) * 0.4, -0.6 - Math.random() * 0.6, (Math.random() - 0.5) * 0.4], i * 3);
      this.r.set([Math.random() * 6, Math.random() * 6, Math.random() * 6], i * 3);
    }
    this.active = true;
    this.mesh.visible = true;
    this.t = 0;
  }

  stop() {
    this.active = false;
    this.mesh.visible = false;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const { o } = this;
    for (let i = 0; i < this.n; i++) {
      const j = i * 3;
      // Flutter: sideways drift that follows the spin
      this.p[j] += (this.v[j] + Math.sin(this.t * 3 + i) * 0.3) * dt;
      this.p[j + 1] += this.v[j + 1] * dt;
      this.p[j + 2] += (this.v[j + 2] + Math.cos(this.t * 2.6 + i) * 0.3) * dt;
      if (this.p[j + 1] < 0.01) {
        this.p[j + 1] = 0.01;
        this.v[j + 1] = 0;
      }
      const spin = this.v[j + 1] === 0 ? 0 : dt * 5;
      this.r[j] += spin;
      this.r[j + 1] += spin * 0.7;
      o.position.set(this.p[j], this.p[j + 1], this.p[j + 2]);
      o.rotation.set(this.v[j + 1] === 0 ? -Math.PI / 2 : this.r[j], this.r[j + 1], this.r[j + 2]);
      o.updateMatrix();
      this.mesh.setMatrixAt(i, o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.mesh.dispose();
  }
}
