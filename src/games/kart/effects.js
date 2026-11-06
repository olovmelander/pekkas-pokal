import * as THREE from 'three';

/** Pekkas Gokart particles: tyre smoke, grass and dirt spray, exhaust puffs and
 * contact sparks, plus a subtle screen-edge speed overlay. Two draw calls in
 * all (soft and additive), both instanced camera-facing quads; nothing is
 * created mid-race, so the shaders compile with the first frame.
 * `update(dt, drivers, camera)` expects the player first in `drivers`.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const WALL_LANE = 4.35;

const vertexShader = /* glsl */ `
  attribute vec3 iPos;
  attribute vec4 iData; // size, alpha, rotation, stretch
  attribute vec3 iColor;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_vertex>
  void main() {
    vUv = position.xy * 2.0;
    vAlpha = iData.y;
    vColor = iColor;
    vec4 mvPosition = modelViewMatrix * vec4(iPos, 1.0);
    float c = cos(iData.z), s = sin(iData.z);
    vec2 corner = vec2(position.x * iData.w, position.y);
    mvPosition.xy += vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * iData.x;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const fragmentShader = /* glsl */ `
  uniform float uCore;
  varying vec2 vUv;
  varying float vAlpha;
  varying vec3 vColor;
  #include <fog_pars_fragment>
  void main() {
    float r = length(vUv);
    float a = (1.0 - smoothstep(uCore, 1.0, r)) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

function createPool(scene, capacity, { additive = false, core = 0.3 } = {}) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('iPos', iPos); geometry.setAttribute('iData', iData); geometry.setAttribute('iColor', iColor);
  // One transparent, zero-sized slot keeps the program compiled from the first frame.
  geometry.instanceCount = 1;
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, fog: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uCore: { value: core } }])
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = additive ? 3 : 2;
  scene.add(mesh);
  // Struct of arrays: position, velocity, age/life, size from/to, alpha, colour, drag, gravity, spin.
  const p = {
    capacity, count: 0, mesh, iPos, iData, iColor,
    pos: new Float32Array(capacity * 3), vel: new Float32Array(capacity * 3), age: new Float32Array(capacity), life: new Float32Array(capacity),
    size0: new Float32Array(capacity), size1: new Float32Array(capacity), alpha: new Float32Array(capacity), color: new Float32Array(capacity * 3),
    drag: new Float32Array(capacity), gravity: new Float32Array(capacity), rot: new Float32Array(capacity), spin: new Float32Array(capacity), stretch: new Float32Array(capacity)
  };
  return p;
}

function spawn(p, x, y, z, vx, vy, vz, { life = 1, size0 = 0.3, size1 = 1, alpha = 0.4, color, drag = 1, gravity = 0, spin = 0, stretch = 1 }) {
  if (![x, y, z, vx, vy, vz].every(Number.isFinite)) return;
  let i = p.count;
  if (i >= p.capacity) {
    // Recycle the oldest-looking slot rather than growing.
    i = Math.floor(Math.random() * p.capacity);
  } else p.count++;
  p.pos.set([x, y, z], i * 3); p.vel.set([vx, vy, vz], i * 3);
  p.age[i] = 0; p.life[i] = Math.max(0.05, life);
  p.size0[i] = size0; p.size1[i] = size1; p.alpha[i] = alpha;
  p.color.set([color.r, color.g, color.b], i * 3);
  p.drag[i] = drag; p.gravity[i] = gravity; p.rot[i] = Math.random() * 6.283; p.spin[i] = spin * (Math.random() - 0.5); p.stretch[i] = stretch;
}

function stepPool(p, dt) {
  let i = 0;
  while (i < p.count) {
    p.age[i] += dt;
    if (p.age[i] >= p.life[i]) {
      const last = --p.count;
      if (i !== last) {
        for (const [array, width] of [[p.pos, 3], [p.vel, 3], [p.color, 3]]) array.copyWithin(i * width, last * width, last * width + width);
        for (const array of [p.age, p.life, p.size0, p.size1, p.alpha, p.drag, p.gravity, p.rot, p.spin, p.stretch]) array[i] = array[last];
      }
      continue;
    }
    const damping = Math.exp(-p.drag[i] * dt);
    const v = i * 3;
    p.vel[v] *= damping; p.vel[v + 1] = p.vel[v + 1] * damping - p.gravity[i] * dt; p.vel[v + 2] *= damping;
    p.pos[v] += p.vel[v] * dt; p.pos[v + 1] += p.vel[v + 1] * dt; p.pos[v + 2] += p.vel[v + 2] * dt;
    p.rot[i] += p.spin[i] * dt;
    const t = p.age[i] / p.life[i];
    p.iPos.array[v] = p.pos[v]; p.iPos.array[v + 1] = p.pos[v + 1]; p.iPos.array[v + 2] = p.pos[v + 2];
    const d = i * 4;
    p.iData.array[d] = p.size0[i] + (p.size1[i] - p.size0[i]) * Math.sqrt(t);
    // Quick fade in, long fade out.
    p.iData.array[d + 1] = p.alpha[i] * Math.min(1, t * 8) * (1 - t) * (1 - t);
    p.iData.array[d + 2] = p.rot[i];
    p.iData.array[d + 3] = p.stretch[i];
    p.iColor.array[v] = p.color[v]; p.iColor.array[v + 1] = p.color[v + 1]; p.iColor.array[v + 2] = p.color[v + 2];
    i++;
  }
  if (p.count === 0) { p.iData.array[0] = 0; p.iData.array[1] = 0; }
  p.mesh.geometry.instanceCount = Math.max(1, p.count);
  p.iPos.needsUpdate = p.iData.needsUpdate = p.iColor.needsUpdate = true;
}

export function createEffects(scene, track, { reducedMotion = false, coarse = false, overlay = null } = {}) {
  const soft = createPool(scene, coarse ? 240 : 420, { core: 0.18 });
  const hot = createPool(scene, coarse ? 70 : 120, { additive: true, core: 0.05 });
  const colors = {
    smoke: new THREE.Color(0xefede7), dust: new THREE.Color(0xa58e66), clod: new THREE.Color(0x4f5a2c), soil: new THREE.Color(0x5e4a33),
    exhaust: new THREE.Color(0x4a4c4c), spark: new THREE.Color(0xffb35a).multiplyScalar(2.2), sparkWhite: new THREE.Color(0xfff0c8).multiplyScalar(2.4)
  };
  const memory = new WeakMap();
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), point = new THREE.Vector3();
  let speedFx = null, speedFxLevel = 0, speedFxClock = 0;
  if (overlay && !reducedMotion) {
    speedFx = document.createElement('div');
    speedFx.className = 'kart-speedfx';
    speedFx.setAttribute('aria-hidden', 'true');
    overlay.prepend(speedFx);
  }

  function surfaceOf(driver) {
    if (driver.surface) return driver.surface;
    if (typeof track.surfaceAt === 'function') return track.surfaceAt(driver.distance, driver.lane);
    const lane = Math.abs(finite(driver.lane));
    return lane > 3.5 ? 'grass' : lane > 3.0 ? 'kerb' : 'asphalt';
  }
  /** World point on a kart; x is towards +lane (the kart's left), z forward. */
  function onKart(s, yaw, x, y, z, out = point) {
    forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    right.set(forward.z, 0, -forward.x);
    return out.copy(s.position).addScaledVector(right, x).addScaledVector(forward, z).setY(s.position.y + y);
  }

  function burst(kind, position, { count, strength = 1, direction = null } = {}) {
    if (!position || ![position.x, position.y, position.z].every(Number.isFinite)) return;
    const { x, y, z } = position;
    if (kind === 'sparks') {
      const n = count ?? Math.round(14 + 12 * clamp(strength, 0, 1.5));
      for (let i = 0; i < n; i++) {
        const angle = Math.random() * 6.283, out = 2.5 + Math.random() * 5 * strength;
        let vx = Math.cos(angle) * out, vz = Math.sin(angle) * out;
        if (direction) { vx = vx * 0.5 + direction.x * out; vz = vz * 0.5 + direction.z * out; }
        spawn(hot, x, y, z, vx, 1.5 + Math.random() * 3.5, vz, {
          life: 0.22 + Math.random() * 0.3, size0: 0.09, size1: 0.04, alpha: 1, color: i % 3 ? colors.spark : colors.sparkWhite,
          drag: 1.2, gravity: 9.8, stretch: 2.6
        });
      }
    } else if (kind === 'dust') {
      for (let i = 0; i < (count ?? 12); i++) {
        spawn(soft, x + (Math.random() - 0.5) * 0.8, y + 0.2, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 1.5, (Math.random() - 0.5) * 3, {
          life: 0.8 + Math.random() * 0.6, size0: 0.4, size1: 1.8, alpha: 0.42, color: colors.dust, drag: 2.2, gravity: -0.15, spin: 1
        });
      }
    } else if (kind === 'smoke') {
      for (let i = 0; i < (count ?? 10); i++) {
        spawn(soft, x + (Math.random() - 0.5) * 0.6, y + 0.2, z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.5, 0.5 + Math.random(), (Math.random() - 0.5) * 1.5, {
          life: 1.1 + Math.random() * 0.7, size0: 0.4, size1: 2.1, alpha: 0.36, color: colors.smoke, drag: 1.6, gravity: -0.25, spin: 0.8
        });
      }
    }
  }

  function emitFor(driver, index, dt, cameraPosition, handled, drivers) {
    const s = track.sample(finite(driver.distance), finite(driver.lane));
    const yaw = s.angle + finite(driver.heading);
    const speed = Math.max(0, finite(driver.speed));
    let m = memory.get(driver);
    if (!m) { m = { smoke: 0, spray: 0, exhaust: Math.random() * 0.2, hit: finite(driver.hit), speed, wheel: 0 }; memory.set(driver, m); }
    const accel = dt > 0 ? (speed - m.speed) / dt : 0;
    m.speed = speed;
    const near = index === 0 || s.position.distanceToSquared(cameraPosition) < 45 * 45;
    // Contacts: a rising contact cooldown is a fresh hit.
    const hit = finite(driver.hit);
    if (hit > m.hit + 0.3 && !handled.has(driver) && near) {
      handled.add(driver);
      if (Math.abs(finite(driver.lane)) > WALL_LANE - 0.45) {
        const wall = track.sample(finite(driver.distance) + 0.6, Math.sign(driver.lane) * (Math.abs(driver.lane) + 0.85)).position;
        burst('sparks', point.copy(wall).setY(wall.y + 0.35), { strength: clamp(speed / 12, 0.4, 1.3), direction: forward.set(Math.sin(yaw), 0, Math.cos(yaw)) });
      } else {
        let other = null, best = 9;
        for (const candidate of drivers) {
          if (candidate === driver) continue;
          const c = track.sample(finite(candidate.distance), finite(candidate.lane)).position;
          const gap = c.distanceToSquared(s.position);
          if (gap < best) { best = gap; other = { candidate, c }; }
        }
        if (other) {
          handled.add(other.candidate);
          burst('sparks', point.copy(s.position).add(other.c).multiplyScalar(0.5).setY(s.position.y + 0.32), { strength: 0.6 });
        }
      }
    }
    m.hit = hit;
    if (!near) return;
    const surface = surfaceOf(driver);
    const scale = index === 0 ? 1 : 0.55;
    // Tyre smoke from a sliding rear or wheelspin off the line.
    const slide = Math.max(finite(driver.slip), finite(driver.wheelspin), driver.skidding ? 0.45 : 0);
    if (surface !== 'grass' && slide > 0.15 && (speed > 2.5 || finite(driver.wheelspin) > 0.15)) {
      m.smoke += dt * 44 * slide * scale * (coarse ? 0.7 : 1);
      while (m.smoke >= 1) {
        m.smoke -= 1; m.wheel = 1 - m.wheel;
        const wheel = onKart(s, yaw, m.wheel ? 0.86 : -0.86, 0.12, -0.8);
        // Carried along with the kart for a moment, so the cloud hangs beside and behind it.
        const carry = speed * (0.4 + Math.random() * 0.2);
        spawn(soft, wheel.x, wheel.y, wheel.z, forward.x * carry + (Math.random() - 0.5) * 1.2, 0.35 + Math.random() * 0.6, forward.z * carry + (Math.random() - 0.5) * 1.2, {
          life: 1.2 + Math.random() * 0.7, size0: 0.45, size1: 2.2 + slide * 1.2, alpha: 0.3 + slide * 0.25, color: colors.smoke, drag: 1.3, gravity: -0.3, spin: 0.9
        });
      }
    } else m.smoke = 0;
    // Grass, dirt and clods kicked up behind the rear wheels.
    if (surface === 'grass' && speed > 2.5) {
      m.spray += dt * 40 * clamp(speed / 12, 0.25, 1.2) * scale * (coarse ? 0.7 : 1);
      while (m.spray >= 1) {
        m.spray -= 1; m.wheel = 1 - m.wheel;
        const wheel = onKart(s, yaw, m.wheel ? 0.86 : -0.86, 0.08, -0.85);
        // Thrown up and out by the tyres; the kart's wake carries it along for a moment,
        // so the spray reads beside and just behind the rear wheels.
        const back = speed * (0.5 + Math.random() * 0.25);
        const out = (m.wheel ? 1 : -1) * (0.8 + Math.random() * 1.8);
        const sx = right.x * out, sz = right.z * out;
        if (Math.random() < 0.5) {
          spawn(soft, wheel.x, wheel.y, wheel.z, forward.x * back + sx, 0.7 + Math.random() * 0.9, forward.z * back + sz, {
            life: 0.8 + Math.random() * 0.6, size0: 0.45, size1: 2.0, alpha: 0.42, color: colors.dust, drag: 1.8, gravity: -0.15, spin: 1
          });
        } else {
          spawn(soft, wheel.x, wheel.y, wheel.z, forward.x * back + sx * 1.4, 2.5 + Math.random() * 2.6, forward.z * back + sz * 1.4, {
            life: 0.7 + Math.random() * 0.35, size0: 0.15, size1: 0.1, alpha: 0.95, color: Math.random() < 0.6 ? colors.clod : colors.soil, drag: 0.6, gravity: 9.8, spin: 8
          });
        }
      }
    } else m.spray = 0;
    // Small exhaust puffs: quicker and darker on the throttle.
    if (index === 0 || s.position.distanceToSquared(cameraPosition) < 20 * 20) {
      const load = clamp(accel / 3, 0, 1);
      m.exhaust -= dt;
      if (m.exhaust <= 0) {
        m.exhaust = 0.22 - load * 0.13 + Math.random() * 0.05;
        const pipe = onKart(s, yaw, 0.9, 0.55, -1.32);
        spawn(soft, pipe.x, pipe.y, pipe.z, -forward.x * 0.6 + right.x * 0.4, 0.35, -forward.z * 0.6 + right.z * 0.4, {
          life: 0.45 + load * 0.25, size0: 0.08, size1: 0.42 + load * 0.2, alpha: 0.14 + load * 0.16, color: colors.exhaust, drag: 2.5, gravity: -0.4, spin: 1.5
        });
      }
    }
  }

  return {
    burst,
    /** Live particle counts, for tests and the debug hook. */
    get counts() { return { soft: soft.count, hot: hot.count }; },
    /** Particles for every driver; the first driver also drives the speed overlay. */
    update(dt, drivers, camera) {
      const step = clamp(finite(dt), 0, 0.05);
      const handled = new Set();
      if (step > 0) drivers.forEach((driver, index) => emitFor(driver, index, step, camera.position, handled, drivers));
      stepPool(soft, step);
      stepPool(hot, step);
      if (speedFx) {
        const player = drivers[0];
        const fast = clamp((finite(player?.speed) - 11) / 7, 0, 1);
        speedFxLevel += (fast - speedFxLevel) * (1 - Math.exp(-step * 4));
        speedFxClock += step;
        if (speedFxClock > 0.05) {
          speedFxClock = 0;
          speedFx.style.opacity = speedFxLevel.toFixed(3);
          speedFx.style.setProperty('--kart-streak-turn', `${(Math.random() * 360).toFixed(1)}deg`);
        }
      }
    },
    reset() { soft.count = hot.count = 0; stepPool(soft, 0); stepPool(hot, 0); if (speedFx) speedFx.style.opacity = '0'; speedFxLevel = 0; },
    dispose() {
      for (const pool of [soft, hot]) { pool.mesh.removeFromParent(); pool.mesh.geometry.dispose(); pool.mesh.material.dispose(); }
      speedFx?.remove();
    }
  };
}
