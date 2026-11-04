/**
 * Pekkas Lerduvor — the August evening sky over Arnäsvall.
 *
 * A custom dome rather than the Preetham `Sky` addon, for one reason: the
 * whole scene's aerial perspective depends on the horizon band being the
 * EXACT colour of the scene fog, so the far spruce melt into the sky
 * instead of standing on it. Preetham's horizon changes colour all the
 * way round; this one is art-directed so it can't.
 *
 * What it does, bottom to top:
 *  - a haze band at the horizon identical to `HAZE` (the fog colour)
 *  - an azimuthal golden-hour ramp: warm peach on the sun's side, a cool
 *    lilac-grey opposite, the way a low sun only lights half the sky
 *  - Mie forward scattering — three lobes of glow around the sun — and an
 *    HDR sun disk bright enough for the bloom pass to flare it
 *  - drifting fbm clouds projected onto a plane, with gold silver-lining
 *    on the rims toward the sun and lilac undersides away from it
 *
 * Also here: the mist that hangs over the forest line (depth haze), and the
 * distant blue hills behind it — the last two layers of aerial perspective.
 */

import * as THREE from 'three';

/** The haze everything distant fades into — sky band, fog and forest share it. */
export const HAZE = 0xb6b3ac;

/** Where the sun sits in the SKY: low in the west-north-west, 7–8° up. */
export const SUN_DIR = new THREE.Vector3(-0.47, 0.13, -0.87).normalize();

/**
 * Where the sun LIGHTS FROM. A deliberate cheat, as in every film: the key
 * light is higher than the visible disk, because a true 7° sun would rake
 * the field so flat that every blade's face falls into its own shadow.
 */
export const LIGHT_DIR = new THREE.Vector3(-0.44, 0.36, -0.82).normalize();

export const SUN_COLOR = 0xffcf96;

const NOISE = /* glsl */`
  // Gradient noise with a sinless hash — identical clouds on every GPU
  vec2 grad2(vec2 i) {
    vec3 p = fract(i.xyx * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.xx + p.yz) * p.zy) * 2.0 - 1.0;
  }
  float gnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = dot(grad2(i), f);
    float b = dot(grad2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0));
    float c = dot(grad2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0));
    float d = dot(grad2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y) * 1.6;
  }
  float fbm(vec2 p) {
    float r = 0.0;
    float amp = 0.55;
    for (int i = 0; i < 5; i++) {
      r += amp * gnoise(p);
      p = p * 2.03 + vec2(1.7, 9.2);
      amp *= 0.5;
    }
    return r;
  }
`;

export function buildSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color(0x214781) },
    uMid: { value: new THREE.Color(0x6e95c2) },
    uWarm: { value: new THREE.Color(0xffb274) },
    uCool: { value: new THREE.Color(0xb8b1bb) },
    uHaze: { value: new THREE.Color(HAZE) },
    uBelow: { value: new THREE.Color(HAZE) },
    uCloudLit: { value: new THREE.Color(0xfbe3c6) },
    uCloudShade: { value: new THREE.Color(0x8d8aa2) },
    uSunColor: { value: new THREE.Color(SUN_COLOR) },
    uSunDir: { value: SUN_DIR.clone() },
    uDisk: { value: 1 },
    uTime: { value: 0 }
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uMid, uWarm, uCool, uHaze, uBelow;
      uniform vec3 uCloudLit, uCloudShade, uSunColor, uSunDir;
      uniform float uDisk, uTime;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        float mu = dot(d, uSunDir);
        float m = max(mu, 0.0);

        // Golden hour lights only the sun's half of the sky. (Guarded: straight
        // up, d.xz has no direction to normalise.)
        float lxz = length(d.xz);
        float az = lxz > 1e-4 ? dot(d.xz / lxz, normalize(uSunDir.xz)) * 0.5 + 0.5 : 0.5;
        vec3 horizon = mix(uCool, uWarm, az * az * az);
        vec3 c = mix(horizon, uMid, smoothstep(0.0, 0.3, h));
        c = mix(c, uZenith, smoothstep(0.16, 0.9, h));

        // The haze band — the aerial-perspective join with the fogged forest
        c = mix(c, uHaze, (1.0 - smoothstep(0.0, 0.075, h)) * 0.86);

        // Mie forward scatter: broad glow, tight halo, corona
        c += uSunColor * (pow(m, 6.0) * 0.16 + pow(m, 48.0) * 0.38 + pow(m, 900.0) * 1.4);

        // Clouds: fbm projected onto a high plane, drifting on the evening breeze
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.05) * 0.8 + vec2(uTime * 0.006, uTime * 0.0022);
          float n = fbm(uv * vec2(1.0, 2.2)) * 0.5 + 0.5;
          float cov = 0.5 + 0.14 * gnoise(uv * 0.31 + 4.0);
          float mask = smoothstep(cov, cov + 0.22, n);
          mask *= smoothstep(0.01, 0.07, d.y) * (1.0 - 0.5 * smoothstep(0.35, 0.85, d.y));
          float thick = clamp((n - cov) * 3.2, 0.0, 1.0);
          vec3 cloud = mix(uCloudLit, uCloudShade, thick * (1.0 - 0.6 * m));
          // Silver lining: thin edges facing the sun light up gold
          cloud += uSunColor * pow(m, 3.0) * (1.0 - thick) * 1.5;
          // Distant clouds sink into the same haze as everything else
          cloud = mix(cloud, uHaze, (1.0 - smoothstep(0.0, 0.09, d.y)) * 0.8);
          c = mix(c, cloud, mask * 0.9);
        }

        // HDR disk — well above 1.0 so the bloom pass flares it. Measured as the
        // sine of the angle to the sun (|d × s|), not as cos = 0.9999…: those
        // edges sit closer together than a half-float or a mediump GPU can
        // tell apart, and smoothstep with equal edges divides by zero.
        float sinA = length(cross(d, uSunDir));
        c += uSunColor * (1.0 - smoothstep(0.0134, 0.0179, sinA)) * step(0.0, mu) * 14.0 * uDisk;

        if (d.y < 0.0) c = mix(c, uBelow, smoothstep(0.0, 0.06, -d.y));
        gl_FragColor = vec4(max(c, vec3(0.0)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const geometry = new THREE.SphereGeometry(300, 48, 24);
  bakeFallbackColors(geometry, uniforms);
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  // The last-resort sky: the same palette as plain vertex colours, for a GPU
  // that renders the dome black. Swapped in by the graphics watchdog.
  const plain = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false
  });
  return { dome, material, plain, uniforms };
}

/**
 * The dome's gradient evaluated per vertex on the CPU — horizon ramp, haze
 * band, zenith and the broad sun glow, no clouds and no disk. Coarse, but a
 * GPU that cannot run the sky shader still gets an evening, not a void.
 */
function bakeFallbackColors(geometry, u) {
  const P = geometry.attributes.position;
  const col = new Float32Array(P.count * 3);
  const d = new THREE.Vector3();
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const sun = u.uSunDir.value;
  const sxz = Math.hypot(sun.x, sun.z);
  const ss = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i < P.count; i++) {
    d.fromBufferAttribute(P, i).normalize();
    const h = Math.max(d.y, 0);
    const m = Math.max(d.dot(sun), 0);
    const lxz = Math.hypot(d.x, d.z);
    const az = lxz > 1e-4 ? ((d.x * sun.x + d.z * sun.z) / (lxz * sxz)) * 0.5 + 0.5 : 0.5;
    c.copy(u.uCool.value).lerp(u.uWarm.value, az * az * az);
    c.lerp(u.uMid.value, ss(0, 0.3, h));
    c.lerp(u.uZenith.value, ss(0.16, 0.9, h));
    c.lerp(u.uHaze.value, (1 - ss(0, 0.075, h)) * 0.86);
    c.add(tmp.copy(u.uSunColor.value).multiplyScalar(m ** 6 * 0.16 + m ** 48 * 0.38));
    if (d.y < 0) c.lerp(u.uBelow.value, ss(0, 0.06, -d.y));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/**
 * Bake the sky into a prefiltered environment map so the gun's blued steel
 * and the trophy's gold reflect THIS evening rather than a studio. The
 * ground half is swapped to a field green for the capture only.
 */
export function bakeEnvironment(renderer, sky) {
  // PMREM renders into half-float targets; a GPU that cannot render to
  // those would bake garbage (or NaN) into every reflection. No bake then —
  // the caller falls back to non-reflective metal.
  const gl = renderer.getContext();
  const isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  if (!isWebGL2 || !(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'))) return null;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const prevBelow = sky.uniforms.uBelow.value.clone();
  sky.uniforms.uBelow.value.set(0x4b5a2c);
  sky.uniforms.uDisk.value = 0.25;
  const { parent } = sky.dome;
  const prevPos = sky.dome.position.clone();
  sky.dome.position.set(0, 0, 0);
  envScene.add(sky.dome);
  const rt = pmrem.fromScene(envScene, 0.02, 1, 400);
  envScene.remove(sky.dome);
  if (parent) parent.add(sky.dome);
  sky.dome.position.copy(prevPos);
  sky.uniforms.uBelow.value.copy(prevBelow);
  sky.uniforms.uDisk.value = 1;
  pmrem.dispose();
  return rt;
}

/* ------------------------------------------------------------- depth haze */

/**
 * Mist sheets standing over the forest line. Each is a tall plane whose
 * alpha falls off with height and breaks up along its length, lit by the
 * same forward-scatter lobe as the sky, so the haze glows gold toward the
 * sun and stays a cool grey away from it — in-scattering, faked cheaply.
 */
export function buildHaze() {
  const group = new THREE.Group();
  const uniforms = {
    uHaze: { value: new THREE.Color(HAZE) },
    uSunColor: { value: new THREE.Color(SUN_COLOR) },
    uSunDir: { value: SUN_DIR.clone() },
    uTime: { value: 0 }
  };
  const sheets = [
    // z, width, height, opacity, seed
    [-128, 640, 30, 0.42, 1.3],
    [-98, 560, 8, 0.22, 4.1],
    [-62, 420, 3.2, 0.14, 7.7]
  ];
  sheets.forEach(([z, w, h, opacity, seed]) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...uniforms, uOpacity: { value: opacity }, uSeed: { value: seed } },
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }
      `,
      fragmentShader: /* glsl */`
        uniform vec3 uHaze, uSunColor, uSunDir;
        uniform float uOpacity, uSeed, uTime;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main() {
          vec3 v = normalize(vWorld - cameraPosition);
          float glow = pow(max(dot(v, uSunDir), 0.0), 6.0);
          float x = vWorld.x;
          float breakup = 0.72 + 0.28 * sin(x * 0.021 + uSeed + uTime * 0.03) * sin(x * 0.057 + uSeed * 2.0);
          // (clamped: an interpolated vUv.y a hair above 1 would hand pow() a
          // negative base, which is NaN on Direct3D)
          float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.04, vUv.y + 0.02);
          // Fade the sheet's ends so its edges never show
          a *= smoothstep(0.0, 0.18, vUv.x) * (1.0 - smoothstep(0.82, 1.0, vUv.x));
          vec3 col = uHaze + uSunColor * glow * 0.4;
          gl_FragColor = vec4(col, a * breakup * uOpacity);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat);
    mesh.position.set(0, h / 2 - 0.6, z);
    mesh.renderOrder = -4;
    group.add(mesh);
  });
  return { group, uniforms };
}

/**
 * Two rows of low Norrland hills on the horizon, flat-coloured and
 * pre-mixed toward the haze (the nearer row less) so they read as the
 * furthest planes of depth rather than as scenery.
 */
export function buildHills() {
  const group = new THREE.Group();
  const haze = new THREE.Color(HAZE);
  [
    { z: -262, mix: 0.8, amp: 22, base: 10, f: 0.011, seed: 2.1 },
    { z: -212, mix: 0.62, amp: 15, base: 6, f: 0.017, seed: 5.3 }
  ].forEach((row) => {
    const segs = 120;
    const width = 760;
    const pos = [];
    for (let i = 0; i <= segs; i++) {
      const x = -width / 2 + (i / segs) * width;
      const y = row.base
        + row.amp * (0.55 * Math.sin(x * row.f + row.seed)
        + 0.3 * Math.sin(x * row.f * 2.3 + row.seed * 3.1)
        + 0.15 * Math.sin(x * row.f * 5.1 + row.seed * 1.7));
      pos.push(x, -4, 0, x, Math.max(2, y), 0);
    }
    const index = [];
    for (let i = 0; i < segs; i++) {
      const a = i * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(index);
    const color = new THREE.Color(0x3a5a52).lerp(haze, row.mix);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false }));
    mesh.position.z = row.z;
    mesh.renderOrder = -8;
    group.add(mesh);
  });
  return group;
}
