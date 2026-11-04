/**
 * Pekkas Lerduvor — effects.
 *
 * Everything that flies, puffs or glints, kept to a handful of draw calls:
 *
 *  - Particles: a CPU-simulated pool drawn as ONE `Points` call per blend
 *    mode. Dust puffs and gun smoke use normal blending, sparks and the
 *    golden dove's glitter use additive. Sizes are in metres (the vertex
 *    shader does the perspective), so a puff at 35 m and smoke at 1 m
 *    come out right from the same numbers.
 *  - Shards: the clay breaks into real 3D chips — an InstancedMesh with
 *    gravity, drag, tumbling and a bounce when they hit the field.
 *  - ShotCloud: the pellet swarm, drawn as short motion-blurred streaks
 *    so you SEE the pattern leave the muzzle and spread on its way out.
 *  - Ambient: midge columns and drifting seed fluff that light up when
 *    they're between you and the sun — animated entirely on the GPU.
 *
 * Fog is applied by hand in these shaders (not three's chunk) because the
 * additive layer must fade OUT with distance, not toward the fog colour.
 */

import * as THREE from 'three';

const POINT_VERT = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;
  uniform float uScale;
  uniform float uFogNear;
  uniform float uFogFar;
  varying vec4 vColor;
  varying float vFog;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = min(aSize * uScale / max(0.05, -mv.z), 480.0);
    gl_Position = projectionMatrix * mv;
    vFog = smoothstep(uFogNear, uFogFar, -mv.z);
  }
`;

const POINT_FRAG = /* glsl */`
  uniform float uAdditive;
  uniform vec3 uFogColor;
  varying vec4 vColor;
  varying float vFog;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    // Soft gaussian body with a clean edge — reads as a puff, not a disc
    float a = exp(-r2 * 2.6) * (1.0 - r2);
    vec3 col = vColor.rgb;
    float alpha = vColor.a * a;
    if (uAdditive > 0.5) {
      alpha *= 1.0 - vFog;
    } else {
      col = mix(col, uFogColor, vFog);
    }
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function pointMaterial(additive, fog) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uScale: { value: 600 },
      uAdditive: { value: additive ? 1 : 0 },
      uFogColor: { value: fog.color },
      uFogNear: { value: fog.near },
      uFogFar: { value: fog.far }
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
}

/* ------------------------------------------------------------- particles */

export class Particles {
  constructor(max, { additive = false, fog }) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.windK = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aColor = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aColor', this.aColor);
    geo.setDrawRange(0, 0);
    this.material = pointMaterial(additive, fog);
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 3 : 2;
  }

  /** o: { pos, vel, life, size, size1, color, alpha, drag, grav, wind } */
  spawn(o) {
    if (this.n >= this.max) return;
    const i = this.n++;
    const i3 = i * 3;
    this.pos[i3] = o.pos.x;
    this.pos[i3 + 1] = o.pos.y;
    this.pos[i3 + 2] = o.pos.z;
    this.vel[i3] = o.vel ? o.vel.x : 0;
    this.vel[i3 + 1] = o.vel ? o.vel.y : 0;
    this.vel[i3 + 2] = o.vel ? o.vel.z : 0;
    this.col[i3] = o.color.r;
    this.col[i3 + 1] = o.color.g;
    this.col[i3 + 2] = o.color.b;
    this.life[i] = 0;
    this.maxLife[i] = o.life;
    this.size0[i] = o.size;
    this.size1[i] = o.size1 === undefined ? o.size : o.size1;
    this.alpha[i] = o.alpha === undefined ? 1 : o.alpha;
    this.drag[i] = o.drag || 0;
    this.grav[i] = o.grav || 0;
    this.windK[i] = o.wind || 0;
  }

  kill(i) {
    const last = --this.n;
    if (i === last) return;
    const i3 = i * 3;
    const l3 = last * 3;
    for (let k = 0; k < 3; k++) {
      this.pos[i3 + k] = this.pos[l3 + k];
      this.vel[i3 + k] = this.vel[l3 + k];
      this.col[i3 + k] = this.col[l3 + k];
    }
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size0[i] = this.size0[last];
    this.size1[i] = this.size1[last];
    this.alpha[i] = this.alpha[last];
    this.drag[i] = this.drag[last];
    this.grav[i] = this.grav[last];
    this.windK[i] = this.windK[last];
  }

  update(dt, wind) {
    const P = this.aPos.array;
    const S = this.aSize.array;
    const C = this.aColor.array;
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      const k = this.life[i] / this.maxLife[i];
      if (k >= 1) {
        this.kill(i);
        continue;
      }
      const i3 = i * 3;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= damp;
      this.vel[i3 + 1] = this.vel[i3 + 1] * damp - this.grav[i] * dt;
      this.vel[i3 + 2] *= damp;
      const wk = this.windK[i];
      this.pos[i3] += (this.vel[i3] + wind.x * wk) * dt;
      this.pos[i3 + 1] += (this.vel[i3 + 1] + wind.y * wk) * dt;
      this.pos[i3 + 2] += (this.vel[i3 + 2] + wind.z * wk) * dt;
      P[i3] = this.pos[i3];
      P[i3 + 1] = this.pos[i3 + 1];
      P[i3 + 2] = this.pos[i3 + 2];
      const grow = 1 - (1 - k) * (1 - k);
      S[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * grow;
      // Quick fade-in so nothing pops, long ease-out tail
      const fade = Math.min(1, k * 14) * Math.pow(1 - k, 1.4);
      const i4 = i * 4;
      C[i4] = this.col[i3];
      C[i4 + 1] = this.col[i3 + 1];
      C[i4 + 2] = this.col[i3 + 2];
      C[i4 + 3] = this.alpha[i] * fade;
      i++;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.aPos.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aColor.needsUpdate = true;
  }

  clear() {
    this.n = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

/* ---------------------------------------------------------------- shards */

/** One irregular chip of clay: orange face, dark underside, thin walls. */
function chipGeometry() {
  const pts = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (i % 2) * 0.3;
    const r = i % 2 ? 0.075 : 0.12;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const top = 0.009;
  const pos = [];
  const col = [];
  const push = (x, y, z, c) => {
    pos.push(x, y, z);
    col.push(c, c, c);
  };
  for (let i = 0; i < n; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % n];
    // Face (slightly domed — it was part of a dome) and underside
    push(0, top * 1.6, 0, 1); push(bx, top, bz, 1); push(ax, top, az, 1);
    push(0, -top, 0, 0.28); push(ax, -top, az, 0.28); push(bx, -top, bz, 0.28);
    // The broken edge
    push(ax, top, az, 0.55); push(bx, top, bz, 0.55); push(bx, -top, bz, 0.55);
    push(ax, top, az, 0.55); push(bx, -top, bz, 0.55); push(ax, -top, az, 0.55);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class Shards {
  constructor(max = 40) {
    this.max = max;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a1000, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(chipGeometry(), mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.items = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const c = new THREE.Color(0xff6a1c);
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, zero);
      this.mesh.setColorAt(i, c);
      this.items.push({
        alive: false, life: 0, max: 1,
        p: new THREE.Vector3(), v: new THREE.Vector3(),
        q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1), resting: false
      });
    }
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.dq = new THREE.Quaternion();
    this.axis = new THREE.Vector3();
    this.scl = new THREE.Vector3();
    this.zero = zero;
  }

  /** Throw `count` chips from `origin`, inheriting part of the clay's velocity. */
  burst(origin, clayVel, color, count, rand, power = 1) {
    for (let k = 0; k < count; k++) {
      const it = this.items[this.next];
      this.mesh.setColorAt(this.next, color);
      this.next = (this.next + 1) % this.max;
      it.alive = true;
      it.resting = false;
      it.life = 0;
      it.max = 2.2 + rand() * 1.4;
      it.p.copy(origin);
      const a = rand() * Math.PI * 2;
      const out = (2.5 + rand() * 5.5) * power;
      it.v.set(Math.cos(a) * out, (1 + rand() * 4.5) * power, Math.sin(a) * out).addScaledVector(clayVel, 0.55);
      it.q.setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6));
      it.w.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(8 + rand() * 16);
      const s = 0.9 + rand() * 1.1;
      it.s.set(s * (0.8 + rand() * 0.5), s, s * (0.8 + rand() * 0.5));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt) {
    let any = false;
    this.items.forEach((it, i) => {
      if (!it.alive) return;
      any = true;
      it.life += dt;
      if (it.life >= it.max) {
        it.alive = false;
        this.mesh.setMatrixAt(i, this.zero);
        return;
      }
      if (!it.resting) {
        const damp = Math.exp(-0.35 * dt);
        it.v.multiplyScalar(damp);
        it.v.y -= 9.8 * dt;
        it.p.addScaledVector(it.v, dt);
        const ang = it.w.length() * dt;
        if (ang > 0) {
          this.dq.setFromAxisAngle(this.axis.copy(it.w).normalize(), ang);
          it.q.premultiply(this.dq);
        }
        // Land in the field: one tired bounce, then lie still
        if (it.p.y < 0.03) {
          it.p.y = 0.03;
          if (Math.abs(it.v.y) < 1.2) {
            it.resting = true;
          } else {
            it.v.set(it.v.x * 0.4, -it.v.y * 0.28, it.v.z * 0.4);
            it.w.multiplyScalar(0.4);
          }
        }
      }
      const shrink = Math.min(1, (it.max - it.life) / 0.35);
      this.scl.copy(it.s).multiplyScalar(shrink);
      this.m.compose(it.p, it.q, this.scl);
      this.mesh.setMatrixAt(i, this.m);
    });
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    this.items.forEach((it, i) => {
      it.alive = false;
      this.mesh.setMatrixAt(i, this.zero);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* ------------------------------------------------------------- the shot */

/**
 * The pellet swarm. Each pellet gets a direction inside the pattern cone
 * (gaussian, so the core is dense and the fringe thin, like a real
 * pattern board) and a place in the shot string (some pellets lag). They
 * are drawn as streaks whose length is the distance travelled in a frame
 * or two — a muzzle-to-target flicker, which is all the eye ever gets.
 */
export class ShotCloud {
  constructor(count = 72) {
    this.count = count;
    this.dirs = [];
    this.lag = new Float32Array(count);
    for (let i = 0; i < count; i++) this.dirs.push(new THREE.Vector3());
    this.origin = new THREE.Vector3();
    this.t = 0;
    this.range = 0;
    this.active = false;
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(count * 8), 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('color', this.aCol);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    }));
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    this.lines.renderOrder = 4;
    this.tmp = new THREE.Vector3();
    this.side = new THREE.Vector3();
    this.up = new THREE.Vector3();
  }

  fire(origin, dir, spread, range, rand) {
    this.origin.copy(origin);
    this.range = range;
    this.t = 0;
    this.active = true;
    this.lines.visible = true;
    this.side.crossVectors(dir, THREE.Object3D.DEFAULT_UP).normalize();
    this.up.crossVectors(this.side, dir).normalize();
    for (let i = 0; i < this.count; i++) {
      // Box–Muller for a gaussian pattern
      const r = Math.sqrt(-2 * Math.log(Math.max(1e-6, rand()))) * 0.5;
      const a = rand() * Math.PI * 2;
      const off = Math.min(1.35, r) * spread;
      this.dirs[i].copy(dir)
        .addScaledVector(this.side, Math.cos(a) * off)
        .addScaledVector(this.up, Math.sin(a) * off)
        .normalize();
      this.lag[i] = rand() * rand() * 0.12; // the shot string: a few stragglers
    }
  }

  /** speed in m/s of game time */
  update(dt, speed) {
    if (!this.active) return;
    this.t += dt;
    const P = this.aPos.array;
    const C = this.aCol.array;
    const travel = speed * this.t;
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      const d = travel * (1 - this.lag[i]);
      const len = Math.min(d, 4.5);
      const fade = Math.max(0, 1 - d / (this.range + 25));
      if (fade > 0) alive = true;
      const o = i * 6;
      this.tmp.copy(this.origin).addScaledVector(this.dirs[i], d);
      P[o] = this.tmp.x;
      P[o + 1] = this.tmp.y;
      P[o + 2] = this.tmp.z;
      this.tmp.addScaledVector(this.dirs[i], -len);
      P[o + 3] = this.tmp.x;
      P[o + 4] = this.tmp.y;
      P[o + 5] = this.tmp.z;
      const c = i * 8;
      C[c] = 1; C[c + 1] = 0.9; C[c + 2] = 0.68; C[c + 3] = 0.85 * fade;
      C[c + 4] = 1; C[c + 5] = 0.8; C[c + 6] = 0.5; C[c + 7] = 0;
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    if (!alive) {
      this.active = false;
      this.lines.visible = false;
    }
  }
}

/* -------------------------------------------------------------- ambient */

/**
 * Midges dancing in columns over the field and seed fluff drifting across
 * the view. Static buffers, all motion in the vertex shader; each speck's
 * brightness follows how directly it sits between the eye and the sun, so
 * the air itself seems to light up toward the evening sun.
 */
export function buildAmbient(rand, { sunDir, sunColor }) {
  const swarms = [[-3.2, 2.1, -7], [4.6, 1.7, -11], [-8.5, 2.6, -16], [1.5, 2.2, 5.5]];
  const perSwarm = 46;
  const motes = 110;
  const total = swarms.length * perSwarm + motes;
  const pos = new Float32Array(total * 3);
  const seed = new Float32Array(total * 4);
  let i = 0;
  swarms.forEach(([x, y, z]) => {
    for (let k = 0; k < perSwarm; k++, i++) {
      pos.set([x, y + (rand() - 0.5) * 1.2, z], i * 3);
      seed.set([rand() * 6.28, 0.8 + rand() * 1.6, 0, 0.35 + rand() * 0.4], i * 4);
    }
  });
  for (let k = 0; k < motes; k++, i++) {
    pos.set([(rand() - 0.5) * 22, 0.3 + rand() * 2.4, 3 - rand() * 22], i * 3);
    seed.set([rand() * 6.28, 0.3 + rand() * 0.7, 1, 0.4 + rand() * 0.6], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 600 },
    uSunDir: { value: sunDir.clone() },
    uSunColor: { value: new THREE.Color(sunColor) }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed; // phase, speed, kind (0 midge, 1 fluff), size factor
      uniform float uTime, uScale;
      uniform vec3 uSunDir;
      varying float vGlow;
      void main() {
        float ph = aSeed.x;
        float sp = aSeed.y;
        vec3 p = position;
        if (aSeed.z < 0.5) {
          // A midge: fast, jittery loops inside its column
          p += vec3(sin(uTime * 3.1 * sp + ph) * 0.45 + sin(uTime * 7.3 + ph * 3.0) * 0.08,
                    sin(uTime * 1.7 * sp + ph * 2.0) * 0.55,
                    cos(uTime * 2.6 * sp + ph) * 0.45);
        } else {
          // Fluff: drifts downwind (+x), wraps, bobs on the air
          p.x = mod(p.x + uTime * 0.55 * sp + 11.0, 22.0) - 11.0;
          p.y += sin(uTime * 0.6 * sp + ph) * 0.35;
          p.z += sin(uTime * 0.3 + ph) * 0.4;
        }
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vec3 view = normalize((modelMatrix * vec4(p, 1.0)).xyz - cameraPosition);
        float back = max(dot(view, uSunDir), 0.0);
        vGlow = (0.03 + 0.95 * pow(back, 12.0)) * smoothstep(2.5, 5.0, -mv.z) * (1.0 - smoothstep(14.0, 26.0, -mv.z));
        float size = (aSeed.z < 0.5 ? 0.03 : 0.045) * aSeed.w;
        gl_PointSize = min(size * uScale / max(0.1, -mv.z), 9.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uSunColor;
      varying float vGlow;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(p, p);
        if (r2 > 1.0) discard;
        gl_FragColor = vec4(uSunColor * vGlow, exp(-r2 * 3.0));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  points.renderOrder = 3;
  return { points, uniforms };
}
