/**
 * Pekkas Fiske — particles.
 *
 * Three small CPU pools share one shader and one 2×2 sprite atlas (soft
 * dot, bubble, glint, droplet): `glow` adds light (catch sparkles, sun
 * glints on fish in the air), `bubbles` adds rising rings (the lure's
 * trail, the splash-in), `spray` is ordinary alpha (water thrown into the
 * air). Each particle carries its own size, colour, alpha and atlas cell,
 * and fades out instead of popping off.
 *
 * Marine snow is different: its positions never change on the CPU. The
 * vertex shader drifts them and wraps them modulo a box around the camera,
 * so there is always something sliding past at any depth, for free.
 */

import * as THREE from 'three';
import { WAVE_GLSL } from './world.js';

export const CELL = { DOT: 0, BUBBLE: 1, GLINT: 2, DROP: 3 };

const ATLAS_LOOKUP = `
  vec4 atlas(sampler2D tex, float cell) {
    float cx = mod(cell, 2.0);
    float cy = floor(cell / 2.0);
    vec2 uv = vec2((cx + gl_PointCoord.x) * 0.5, (1.0 - cy) * 0.5 + (1.0 - gl_PointCoord.y) * 0.5);
    return texture2D(tex, uv);
  }
`;

/** Pixels per world unit at distance 1 — what gl_PointSize is scaled by. */
export function pointScale(renderer, camera) {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
  return h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

/**
 * The largest sprite worth drawing, in drawing-buffer pixels: about 140 CSS
 * px, and never above what this GPU can rasterise. GPUs clamp gl_PointSize
 * to ALIASED_POINT_SIZE_RANGE silently and differently (64 on some phones,
 * 1024 on desktops) — clamping it ourselves keeps every device alike.
 */
export function pointCap(renderer, ratio) {
  const gl = renderer.getContext();
  const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
  const gpuMax = range && range[1] ? range[1] : 64;
  return Math.max(8, Math.min(gpuMax, 140 * ratio));
}

const TMP = new THREE.Color();

export class Pool {
  constructor(count, atlas, blending, scale, cap) {
    this.count = count;
    this.next = 0;
    this.parts = [];
    for (let i = 0; i < count; i++) {
      this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, grav: 0, drag: 0, s0: 0, s1: 0, a0: 0, wob: 0, ph: 0 });
    }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.color = new Float32Array(count * 3);
    this.cell = new Float32Array(count);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -9999;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aCell', new THREE.BufferAttribute(this.cell, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas }, uScale: scale, uCap: cap },
      transparent: true,
      depthWrite: false,
      blending,
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        attribute vec3 aColor;
        attribute float aCell;
        uniform float uScale, uCap;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vCell;
        void main() {
          vAlpha = aAlpha;
          vColor = aColor;
          vCell = aCell;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), uCap);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        varying float vAlpha;
        varying vec3 vColor;
        varying float vCell;
        ${ATLAS_LOOKUP}
        void main() {
          vec4 t = atlas(uAtlas, vCell);
          gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
          if (gl_FragColor.a < 0.004) discard;
          #include <colorspace_fragment>
        }
      `
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    this.dirty = false;
    /** Applied to particles emitted without their own `grav`. */
    this.gravity = 0;
  }

  /**
   * One particle. o: x,y,z, vx,vy,vz, life, size, size1 (end size),
   * alpha, color (THREE.Color or hex), cell, grav, drag, wob (wobble amp).
   */
  emit(o) {
    const i = this.next % this.count;
    this.next++;
    const p = this.parts[i];
    p.life = p.max = o.life || 1;
    p.vx = o.vx || 0;
    p.vy = o.vy || 0;
    p.vz = o.vz || 0;
    p.grav = o.grav === undefined ? null : o.grav;
    p.drag = o.drag || 0;
    p.s0 = o.size || 0.2;
    p.s1 = o.size1 === undefined ? p.s0 : o.size1;
    p.a0 = o.alpha === undefined ? 1 : o.alpha;
    p.wob = o.wob || 0;
    p.ph = Math.random() * 6.28;
    this.pos[i * 3] = o.x;
    this.pos[i * 3 + 1] = o.y;
    this.pos[i * 3 + 2] = o.z || 0;
    const c = o.color instanceof THREE.Color ? o.color : TMP.set(o.color === undefined ? 0xffffff : o.color);
    this.color[i * 3] = c.r;
    this.color[i * 3 + 1] = c.g;
    this.color[i * 3 + 2] = c.b;
    this.cell[i] = o.cell || 0;
    this.size[i] = p.s0;
    this.alpha[i] = p.a0;
    this.dirty = true;
  }

  /** A radial burst — the old emitBurst, with fades and colour. */
  burst(x, y, z, n, speed, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI - Math.PI / 2;
      const v = speed * (0.35 + Math.random() * 0.9);
      const spread = o.spread || 0.3;
      this.emit({
        x: x + (Math.random() - 0.5) * spread,
        y: y + (Math.random() - 0.5) * spread,
        z: z + (Math.random() - 0.5) * spread * 0.5,
        vx: Math.cos(a) * Math.cos(e) * v,
        vy: Math.sin(e) * v + speed * (o.lift || 0.3),
        vz: Math.sin(a) * Math.cos(e) * v * 0.45,
        life: (o.life || 0.7) * (0.6 + Math.random() * 0.6),
        size: (o.size || 0.2) * (0.6 + Math.random() * 0.8),
        size1: o.size1,
        alpha: o.alpha,
        color: o.color,
        cell: o.cell,
        grav: o.grav,
        drag: o.drag === undefined ? 1.5 : o.drag,
        wob: o.wob
      });
    }
  }

  update(dt, t) {
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.parts[i];
      if (p.life <= 0) continue;
      alive = true;
      p.life -= dt;
      if (p.life <= 0) {
        this.alpha[i] = 0;
        this.pos[i * 3 + 1] = -9999;
        continue;
      }
      const k = 1 - p.life / p.max;
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp + (p.grav === null ? this.gravity : p.grav) * dt;
      this.pos[i * 3] += (p.vx + (p.wob ? Math.sin(t * 7 + p.ph) * p.wob : 0)) * dt;
      this.pos[i * 3 + 1] += p.vy * dt;
      this.pos[i * 3 + 2] += p.vz * dt;
      this.size[i] = p.s0 + (p.s1 - p.s0) * k;
      // Quick in, long out
      this.alpha[i] = p.a0 * Math.min(1, k * 8) * (1 - k) ** 1.4;
    }
    if (alive || this.dirty) {
      const g = this.points.geometry.attributes;
      g.position.needsUpdate = true;
      g.aSize.needsUpdate = true;
      g.aAlpha.needsUpdate = true;
      g.aColor.needsUpdate = true;
      g.aCell.needsUpdate = true;
      this.dirty = false;
    }
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}


/** Marine snow and plankton, drifting and wrapping on the GPU. */
export function buildSnow(atlas, scale, cap, count, box = 34) {
  const pos = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * box;
    pos[i * 3 + 1] = (Math.random() - 0.5) * box;
    pos[i * 3 + 2] = (Math.random() - 0.5) * box * 0.6 - 2;
    rnd[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  const uniforms = {
    uAtlas: { value: atlas },
    uScale: scale,
    uCap: cap,
    uCam: { value: new THREE.Vector3() },
    uBox: { value: box },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0xcfeee6) },
    uOpacity: { value: 0.5 }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aRand;
      uniform vec3 uCam;
      uniform float uBox, uTime, uScale, uCap;
      varying float vA;
      void main() {
        vec3 p = position;
        // Snow sinks, plankton flits; both sway
        p.y -= uTime * (0.08 + aRand * 0.18);
        p.x += sin(uTime * 0.35 + aRand * 40.0) * 0.5;
        p.z += cos(uTime * 0.27 + aRand * 23.0) * 0.4;
        vec3 halfBox = vec3(uBox * 0.5, uBox * 0.5, uBox * 0.3);
        p = mod(p - uCam + halfBox, halfBox * 2.0) - halfBox + uCam;
        vec3 rel = (p - uCam) / halfBox;
        float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(rel.x), abs(rel.y)));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float s = 0.05 + aRand * aRand * aRand * 0.34;
        gl_PointSize = min(s * uScale / max(0.2, -mv.z), uCap * 0.3);
        float tw = 0.55 + 0.45 * sin(uTime * (0.8 + aRand * 3.0) + aRand * 50.0);
        // Big near ones are out-of-focus bokeh: dimmer, so they read as depth
        vA = tw * edge * (1.0 - smoothstep(0.6, 1.0, aRand) * 0.55) * smoothstep(0.5, 2.5, -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uAtlas;
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vA;
      ${ATLAS_LOOKUP}
      void main() {
        vec4 t = atlas(uAtlas, 0.0);
        gl_FragColor = vec4(uColor * t.rgb * t.a * vA * uOpacity, 1.0);
        #include <colorspace_fragment>
      }
    `
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 4;
  return { points, uniforms };
}

/**
 * Ripple rings on the surface: where the lure goes in, where the catch
 * comes out, where a missed fish plops back. Instanced, eight at a time.
 * Each ring is a small grid that rides the same five waves as the water,
 * a few cm above it — a flat card would cut into the slope of a wave and
 * flicker where the two meet.
 */
export function buildRipples(timeU, count = 8) {
  const geo = new THREE.PlaneGeometry(2, 2, 10, 10);
  geo.rotateX(-Math.PI / 2);
  const age = new THREE.InstancedBufferAttribute(new Float32Array(count * 2), 2);
  age.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aRing', age);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime: timeU },
    vertexShader: `
      attribute vec2 aRing;
      uniform float uTime;
      varying vec2 vUv;
      varying vec2 vRing;
      ${WAVE_GLSL}
      void main() {
        vUv = uv;
        vRing = aRing;
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        w.y = waveH(w.xz, uTime) + 0.06;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      varying vec2 vRing;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float k = vRing.x;
        float r = 0.25 + k * 0.7;
        float ring = smoothstep(r - 0.12, r, d) * (1.0 - smoothstep(r, r + 0.05, d));
        float inner = smoothstep(r - 0.5, r - 0.2, d) * (1.0 - smoothstep(r - 0.2, r - 0.12, d)) * 0.4;
        float a = (ring + inner) * (1.0 - k) * (1.0 - k) * vRing.y;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vec3(0.93, 0.98, 1.0), a);
        #include <colorspace_fragment>
      }
    `
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.renderOrder = 4;
  mesh.frustumCulled = false;
  const rings = [];
  for (let i = 0; i < count; i++) rings.push({ t: 1, life: 1, x: 0, z: 0, size: 1, str: 0 });
  let next = 0;
  const m = new THREE.Matrix4();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    mesh,
    spawn(x, z, size = 2, str = 0.6, life = 1.4) {
      const r = rings[next++ % count];
      Object.assign(r, { t: 0, life, x, z, size, str });
    },
    update(dt) {
      rings.forEach((r, i) => {
        if (r.t >= 1) {
          mesh.setMatrixAt(i, zero);
          age.array[i * 2 + 1] = 0;
          return;
        }
        r.t = Math.min(1, r.t + dt / r.life);
        const s = r.size * (0.4 + r.t * 0.9);
        m.makeScale(s, 1, s).setPosition(r.x, 0, r.z); // height comes from the waves
        mesh.setMatrixAt(i, m);
        age.array[i * 2] = r.t;
        age.array[i * 2 + 1] = r.str;
      });
      mesh.instanceMatrix.needsUpdate = true;
      age.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    }
  };
}
