import * as THREE from 'three';

/** Golden hour over Varggropen: a low warm sun from the north-west (a Swedish
 * summer evening), long shadows, a cool sky fill and warm haze. */
export const SUN_DIRECTION = new THREE.Vector3(-0.68, 0.235, -0.62).normalize();
export const FOG_COLOR = 0xd9b994;
const SUN_DISTANCE = 140;

/** Sets the shared engine's lights for golden hour and returns a shadow
 * follower that keeps the sun's shadow box over what the chase camera sees. */
export function goldenHour(game, { phone = false } = {}) {
  const { scene, sun, ambient, fill } = game;
  scene.background = new THREE.Color(FOG_COLOR);
  scene.fog = new THREE.Fog(FOG_COLOR, 60, 300);
  if (ambient) {
    ambient.color.set(0x9db7d9); ambient.groundColor.set(0x6e5536); ambient.intensity = 0.62;
  }
  if (fill) {
    // Cool bounce from the blue sky opposite the sun.
    fill.color.set(0x8fb0e6); fill.intensity = 0.42;
    fill.position.set(-SUN_DIRECTION.x * 30, 18, -SUN_DIRECTION.z * 30);
  }
  const reach = phone ? 26 : 32;
  if (sun) {
    sun.color.set(0xffb874);
    sun.intensity = 3.35;
    sun.target.position.set(0, 0, 0);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
    sun.target.updateMatrixWorld();
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 2, far: SUN_DISTANCE * 2 });
    sun.shadow.camera.updateProjectionMatrix();
    // A grazing sun needs a little more slope bias on the gentle terrain.
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 2;
  }
  // Light-space axes for snapping the box to whole shadow texels (no shimmer).
  const lightZ = SUN_DIRECTION.clone().negate();
  const lightX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), lightZ).normalize();
  const lightY = new THREE.Vector3().crossVectors(lightZ, lightX).normalize();
  const forward = new THREE.Vector3(), focus = new THREE.Vector3();
  return {
    sunDirection: SUN_DIRECTION,
    /** Centre the shadow box a little ahead of the camera, on the ground. */
    follow(camera, fallback) {
      if (!sun || !game.setShadowFocus) return;
      camera.getWorldDirection(forward);
      forward.y = 0;
      if (forward.lengthSq() < 1e-6) focus.copy(fallback || camera.position);
      else {
        forward.normalize();
        focus.copy(camera.position).addScaledVector(forward, reach * 0.62);
        focus.y = fallback ? fallback.y : camera.position.y - 1.5;
      }
      if (!Number.isFinite(focus.x + focus.y + focus.z)) return;
      const texel = (reach * 2) / (sun.shadow.mapSize.x || 1024);
      const x = Math.round(focus.dot(lightX) / texel) * texel;
      const y = Math.round(focus.dot(lightY) / texel) * texel;
      const z = focus.dot(lightZ);
      focus.copy(lightX).multiplyScalar(x).addScaledVector(lightY, y).addScaledVector(lightZ, z);
      game.setShadowFocus(focus.x, focus.y, focus.z);
    }
  };
}

/** Evening sky: a warm horizon band brightest towards the sun, a soft halo
 * and disc, and clouds lit gold from below. Fog colour at the horizon so the
 * terrain dissolves into it. Time is wrapped before it reaches the shader. */
export function goldenSky({ radius = 330, reducedMotion = false } = {}) {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: time, uSun: { value: SUN_DIRECTION.clone() },
      uHaze: { value: new THREE.Color(FOG_COLOR) }, uZenith: { value: new THREE.Color(0x5f8fc4) },
      uGlow: { value: new THREE.Color(0xffc27a) }
    },
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 uSun, uHaze, uZenith, uGlow; uniform float uTime;
      float hash(vec2 p) { p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y); }
      float cloud(vec2 p) { return noise(p) * 0.57 + noise(p * 2.13 + 13.0) * 0.28 + noise(p * 4.31 - 9.0) * 0.15; }
      void main() {
        vec3 d = normalize(vDirection);
        float up = max(d.y, 0.0);
        float sunDot = max(dot(d, uSun), 0.0);
        vec3 flatSun = normalize(vec3(uSun.x, 0.0, uSun.z));
        float azimuth = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), flatSun), 0.0);
        // Haze at the horizon, blue overhead; the band is warmer towards the sun.
        vec3 c = mix(uHaze, uZenith, pow(up, 0.5));
        c = mix(c, vec3(0.86, 0.63, 0.58), (1.0 - smoothstep(0.0, 0.28, up)) * (1.0 - azimuth) * 0.22);
        c += uGlow * pow(azimuth, 3.0) * (1.0 - smoothstep(0.0, 0.45, up)) * 0.5;
        c += uGlow * pow(sunDot, 12.0) * 0.55 + vec3(1.0, 0.8, 0.5) * pow(sunDot, 120.0) * 0.9;
        c += vec3(2.4, 1.9, 1.2) * smoothstep(0.9993, 0.9998, sunDot);
        // Clouds: drifting, darker on their tops away from the sun, gold-lit near it.
        vec2 p = d.xz / (up + 0.2) * 2.6 + vec2(uTime * 0.005, 0.0);
        float n = cloud(p);
        float opacity = smoothstep(0.6, 0.78, n) * smoothstep(-0.02, 0.18, d.y) * 0.85;
        vec3 shadowSide = vec3(0.55, 0.55, 0.66);
        vec3 litSide = mix(vec3(1.0, 0.86, 0.68), vec3(1.0, 0.72, 0.42), pow(sunDot, 4.0));
        vec3 cloudColor = mix(shadowSide, litSide, smoothstep(0.62, 0.86, n) * 0.6 + pow(sunDot, 3.0) * 0.5);
        c = mix(c, cloudColor, opacity);
        float wisps = smoothstep(0.62, 0.78, cloud(p * vec2(0.3, 2.0) + 31.0)) * smoothstep(0.12, 0.4, d.y) * 0.18;
        c = mix(c, mix(vec3(0.95, 0.85, 0.78), vec3(1.0, 0.8, 0.55), pow(sunDot, 3.0)), wisps);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), material);
  mesh.name = 'golden-sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return { mesh, update(elapsed) { if (!reducedMotion) time.value = elapsed % 20000; } };
}
