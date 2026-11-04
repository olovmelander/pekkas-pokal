/**
 * Pekkas Lerskulptur — particles and screen effects.
 *
 *  - Sprites: one tiny point shader shared by every particle system — slip
 *    droplets thrown off the wheel, kiln embers, steam off the hot piece and
 *    glints on fresh glaze. Per-particle size and fade, ring-buffered, and
 *    hidden entirely (no draw call) while nothing is alive.
 *  - Splats: slip that lands stays. An InstancedMesh of soft blotches on
 *    the floor and in the splash pan, so by the end of the evening there is
 *    clay everywhere — one draw call however many land.
 *  - Heat haze: a screen-space ripple over the kiln while it fires.
 */

import * as THREE from 'three';

function spriteCanvas(draw) {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 64;
  draw(cv.getContext('2d'));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A glossy droplet: dark rim, lighter body, a hot specular dot. */
function dropletTexture() {
  return spriteCanvas((c) => {
    let g = c.createRadialGradient(32, 32, 0, 32, 32, 30);
    g.addColorStop(0, 'rgba(176,110,70,1)');
    g.addColorStop(0.75, 'rgba(120,64,38,1)');
    g.addColorStop(1, 'rgba(90,46,26,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
    g = c.createRadialGradient(24, 22, 0, 24, 22, 10);
    g.addColorStop(0, 'rgba(255,240,220,0.95)');
    g.addColorStop(1, 'rgba(255,240,220,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

function softTexture() {
  return spriteCanvas((c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });
}

/** Four-pointed glint for fresh glaze. */
function glintTexture() {
  return spriteCanvas((c) => {
    c.translate(32, 32);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 10);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(-32, -32, 64, 64);
    c.fillStyle = 'rgba(255,255,255,0.9)';
    [0, Math.PI / 2].forEach((a) => {
      c.save();
      c.rotate(a);
      c.beginPath();
      c.moveTo(-30, 0);
      c.quadraticCurveTo(0, -2.2, 30, 0);
      c.quadraticCurveTo(0, 2.2, -30, 0);
      c.fill();
      c.restore();
    });
  });
}

/** Irregular slip blotch for the splats. */
function blotchTexture() {
  return spriteCanvas((c) => {
    c.fillStyle = 'rgba(255,255,255,1)';
    c.translate(32, 32);
    c.beginPath();
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const r = 22 + 4 * Math.sin(a * 3 + 1) + 2.5 * Math.sin(a * 7);
      if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.fill();
    [[22, -16, 4], [-25, 10, 3]].forEach(([x, y, r]) => {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    });
  });
}

const spriteVert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  uniform float uScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    vAlpha = aAlpha;
  }`;

const spriteFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 t = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(uColor * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/**
 * A ring-buffered particle system. `step(p, dt)` integrates one particle
 * (default: gravity + drag); `alphaOf(p)` shapes the fade.
 */
class Sprites {
  constructor({ max, map, color, additive = false, gravity = 0, drag = 0, alphaOf, step }) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.parts = [];
    for (let i = 0; i < max; i++) this.parts.push({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, s: 0, seed: Math.random() });
    this.next = 0;
    this.gravity = gravity;
    this.drag = drag;
    this.alphaOf = alphaOf || ((p) => Math.min(1, p.life / p.max * 3));
    this.stepFn = step;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, uColor: { value: new THREE.Color(color) }, uScale: { value: 400 } },
      vertexShader: spriteVert,
      fragmentShader: spriteFrag,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 8;
    this.alive = 0;
  }

  emit(x, y, z, vx, vy, vz, life, size) {
    const i = this.next % this.max;
    this.next++;
    const p = this.parts[i];
    p.life = life;
    p.max = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.s = size;
    p.seed = Math.random();
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.size[i] = size;
    this.points.visible = true;
    return i;
  }

  /** Advance; `onLand(x, y, z, p)` returns true when a particle hit something. */
  update(dt, onLand) {
    let alive = 0;
    const damp = Math.exp(-this.drag * dt);
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i];
      if (p.life <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      p.life -= dt;
      if (this.stepFn) this.stepFn(p, dt);
      p.vy -= this.gravity * dt;
      p.vx *= damp;
      p.vy *= damp;
      p.vz *= damp;
      const o = i * 3;
      this.pos[o] += p.vx * dt;
      this.pos[o + 1] += p.vy * dt;
      this.pos[o + 2] += p.vz * dt;
      if (onLand && onLand(this.pos[o], this.pos[o + 1], this.pos[o + 2], p)) p.life = 0;
      this.alpha[i] = p.life > 0 ? this.alphaOf(p) : 0;
      this.size[i] = p.s;
      if (p.life > 0) alive++;
    }
    this.alive = alive;
    if (alive || this.points.visible) {
      const g = this.points.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.aAlpha.needsUpdate = true;
      g.attributes.aSize.needsUpdate = true;
    }
    this.points.visible = alive > 0;
  }

  clear() {
    this.parts.forEach((p) => {
      p.life = 0;
    });
    this.alpha.fill(0);
    this.points.visible = false;
  }
}

/* -------------------------------------------------------------- splats */

class Splats {
  constructor(max) {
    this.max = max;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.tex = blotchTexture();
    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      alphaMap: this.tex,
      transparent: true,
      depthWrite: false,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    this.mesh = new THREE.InstancedMesh(geo, this.material, max);
    this.mesh.count = 0;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.c = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
  }

  add(x, y, z, size, tone = 1) {
    const i = this.next % this.max;
    this.next++;
    this.q.setFromAxisAngle(this.up, Math.random() * Math.PI * 2);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(size, 1, size * (0.7 + Math.random() * 0.5)));
    this.mesh.setMatrixAt(i, this.m);
    // Dried slip: paler and duller than the wet clay it came from
    this.c.setRGB(0.3 * tone, 0.15 * tone, 0.08 * tone);
    this.mesh.setColorAt(i, this.c);
    this.mesh.count = Math.min(this.max, Math.max(this.mesh.count, i + 1));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  reset(seedFn) {
    this.mesh.count = 0;
    this.next = 0;
    if (seedFn) seedFn(this);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.tex.dispose();
  }
}

/* ------------------------------------------------------------ heat haze */

export const HeatHazeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uStrength: { value: 0 },
    uCenter: { value: new THREE.Vector2(0.7, 0.6) },
    uRadius: { value: new THREE.Vector2(0.12, 0.25) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uStrength;
    uniform vec2 uCenter;
    uniform vec2 uRadius;
    varying vec2 vUv;
    void main() {
      vec2 d = (vUv - uCenter) / uRadius;
      // 1 − smoothstep, not smoothstep(1.0, 0.15, …): reversed edges are undefined in GLSL
      float m = (1.0 - smoothstep(0.15, 1.0, length(d))) * uStrength;
      // Rising ripples: phase runs with height so the shimmer climbs
      float a = sin(vUv.y * 90.0 - uTime * 7.0) + 0.6 * sin(vUv.y * 151.0 + vUv.x * 37.0 - uTime * 11.0);
      float b = cos(vUv.x * 70.0 + vUv.y * 20.0 - uTime * 5.0);
      gl_FragColor = texture2D(tDiffuse, vUv + vec2(a * 0.0028, b * 0.0018) * m);
    }`
};

/* ------------------------------------------------------------- the rig */

export function buildFx(scene) {
  const soft = softTexture();
  const droplet = dropletTexture();
  const glint = glintTexture();

  const drops = new Sprites({
    max: 140,
    map: droplet,
    color: 0xffffff,
    gravity: 9.5,
    drag: 0.4,
    alphaOf: (p) => Math.min(1, p.life * 6)
  });
  const embers = new Sprites({
    max: 90,
    map: soft,
    color: new THREE.Color(1.0, 0.45, 0.12).multiplyScalar(3),
    additive: true,
    gravity: -0.8,
    drag: 0.6,
    alphaOf: (p) => Math.min(1, (p.life / p.max) * 2) * (0.6 + 0.4 * Math.sin(p.life * 30 + p.seed * 9)),
    step: (p, dt) => {
      p.vx += Math.sin(p.life * 4 + p.seed * 20) * 0.9 * dt;
      p.vz += Math.cos(p.life * 3 + p.seed * 13) * 0.9 * dt;
    }
  });
  const steam = new Sprites({
    max: 40,
    map: soft,
    color: 0xfff4ea,
    gravity: -0.25,
    drag: 0.8,
    alphaOf: (p) => {
      const k = p.life / p.max;
      // wisps, not fog: they must never veil keramikern's face
      return Math.sin(k * Math.PI) * 0.13;
    },
    step: (p, dt) => {
      p.s += dt * 0.2;
      p.vx += Math.sin(p.life * 2 + p.seed * 10) * 0.2 * dt;
    }
  });
  const glints = new Sprites({
    max: 24,
    map: glint,
    color: new THREE.Color(1, 0.96, 0.88).multiplyScalar(2.2),
    additive: true,
    alphaOf: (p) => Math.sin((p.life / p.max) * Math.PI) ** 2
  });
  const splats = new Splats(240);
  [drops, embers, steam, glints].forEach((s) => scene.add(s.points));
  scene.add(splats.mesh);

  return {
    drops,
    embers,
    steam,
    glints,
    splats,
    setScale(scale) {
      [drops, embers, steam, glints].forEach((s) => {
        s.material.uniforms.uScale.value = scale;
      });
    },
    clear() {
      [drops, embers, steam, glints].forEach((s) => s.clear());
    },
    dispose() {
      [drops, embers, steam, glints].forEach((s) => {
        s.points.geometry.dispose();
        s.material.dispose();
      });
      splats.dispose();
      [soft, droplet, glint].forEach((t) => t.dispose());
    }
  };
}
