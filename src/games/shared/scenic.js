/** The established garden's foliage, arranged for each arcade location.
 * Geometry is baked into local cells: a long race only draws nearby woods.
 * No global materials/textures survive a game's disposal.
 */
import * as THREE from 'three';
import { Growth, addSpruce, addBirch, addClump, foliageMaterial } from '../painting/forest.js';

export function sceneryRandom(seed = 1) {
  let state = seed | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A light sky with layered cirrus/cumulus. The two-dimensional noise is
 * evaluated only on the sky dome; no raymarching or full-screen effects. */
export function buildScenicSky({ radius = 240, horizon = 0xd6ddd6, zenith = 0x739bbd, cloudiness = 0.55, sunDirection = new THREE.Vector3(-14, 24, 12), reducedMotion = false } = {}) {
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTime: time, uHorizon: { value: new THREE.Color(horizon) }, uZenith: { value: new THREE.Color(zenith) },
      uSun: { value: sunDirection.clone().normalize() }, uClouds: { value: cloudiness }
    },
    vertexShader: `varying vec3 vDirection;
      void main() { vDirection = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 uHorizon,uZenith,uSun; uniform float uTime,uClouds;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) { vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y); }
      float cloud(vec2 p) { return noise(p)*.57+noise(p*2.13+13.)*.28+noise(p*4.31-9.)*.15; }
      void main() {
        vec3 d=normalize(vDirection);
        vec3 c=mix(uHorizon,uZenith,pow(max(d.y,0.),.58));
        float sun=max(dot(d,uSun),0.);
        c+=vec3(.27,.19,.085)*pow(sun,18.);
        c+=vec3(1.9,1.5,.85)*smoothstep(.99925,.9998,sun);
        vec2 p=d.xz/(max(d.y,0.)+.22)*2.8+vec2(uTime*.006,0.);
        float n=cloud(p);
        float opacity=smoothstep(.68-uClouds*.32,.82-uClouds*.25,n)*smoothstep(-.01,.16,d.y)*.88;
        vec3 white=mix(vec3(.62,.67,.71),vec3(1.,.98,.92),smoothstep(.4,.79,n));
        c=mix(c,white,opacity);
        float wisps=smoothstep(.63,.77,cloud(p*vec2(.3,2.)+31.))*smoothstep(.15,.45,d.y)*.16;
        c=mix(c,vec3(.86,.9,.91),wisps);
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
  mesh.renderOrder = -10;
  return { mesh, update(elapsed) { if (!reducedMotion) time.value = elapsed % 100000; } };
}

/** Positions are in the returned group's coordinates. Height and radius use metres. */
export function buildNature({ trees = [], bushes = [], grass = [], seed = 1, reducedMotion = false, sunDirection = new THREE.Vector3(-14, 24, 12) } = {}) {
  const group = new THREE.Group();
  group.name = 'layered-swedish-vegetation';
  const rand = sceneryRandom(seed);
  const wind = { phase: { value: new THREE.Vector3() }, gust: { value: 0 } };
  const material = foliageMaterial(wind, sunDirection);
  const cells = new Map();
  function cell(x, z, ground = false) {
    const key = `${Math.floor(x / 32)},${Math.floor(z / 32)},${ground}`;
    if (!cells.has(key)) cells.set(key, { growth: new Growth(), ground });
    return cells.get(key).growth;
  }
  for (const tree of trees) {
    const { x, y = 0, z, height = 8, type = 'spruce', haze = 0 } = tree;
    const g = cell(x, z);
    if (type === 'birch') {
      addBirch(g, rand, x, y, z, height, {
        clumps: 24, spread: 0.22, clumpScale: 0.88, sides: 7, top: 0.30,
        leaf: tree.color || 0xa4bb64, haze, ...tree.details
      });
    } else {
      addSpruce(g, rand, x, y, z, height, {
        tiers: 9, arms: 9, width: 0.21, tint: new THREE.Color(tree.color || 0x3c633e),
        tipColor: new THREE.Color(0x839449), tipLight: 0.12, trunk: true,
        elbow: true, twigs: 5, haze, ...tree.details
      });
    }
  }
  for (const bush of bushes) {
    const { x, y = 0, z, radius = 1, color = 0x56713b } = bush;
    const g = cell(x, z);
    g.tree(y, radius * 1.8, 0.35);
    const centre = new THREE.Vector3(x, y + radius * 0.45, z);
    for (let k = 0; k < 11; k++) {
      const a = k * 2.39996;
      const r = radius * (0.31 + rand() * 0.21);
      addClump(g, rand, x + Math.cos(a) * radius * 0.5, y + r * (0.65 + rand() * 0.45), z + Math.sin(a) * radius * 0.5, r, {
        tint: new THREE.Color(color).offsetHSL((rand() - 0.5) * 0.035, 0, (rand() - 0.5) * 0.09),
        centre, shade: 0.55, squash: 0.85, detail: 1, tipK: 0.5
      });
    }
  }
  for (const patch of grass) {
    const { x, y = 0, z, radius = 1, height = 0.35, count = 32 } = patch;
    const g = cell(x, z, true);
    g.tree(y, height, 0.24);
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2;
      const distance = Math.sqrt(rand()) * radius;
      const bx = x + Math.cos(a) * distance;
      const bz = z + Math.sin(a) * distance;
      const h = height * (0.4 + rand() * 0.75);
      const lean = (rand() - 0.5) * h * 0.55;
      const c = new THREE.Color(patch.color || 0x70833d).offsetHSL((rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.12);
      const dark = c.clone().multiplyScalar(0.55);
      for (let blade = 0; blade < 2; blade++) {
        const angle = a + blade * Math.PI / 2;
        const dx = Math.cos(angle) * h * 0.085;
        const dz = Math.sin(angle) * h * 0.085;
        g.v(bx - dx, y, bz - dz, -Math.sin(angle), 0.45, Math.cos(angle), dark);
        g.v(bx + dx, y, bz + dz, -Math.sin(angle), 0.45, Math.cos(angle), dark);
        g.v(bx + lean, y + h, bz + lean * 0.5, -Math.sin(angle), 0.8, Math.cos(angle), c, 1);
      }
    }
  }
  for (const { growth, ground } of cells.values()) {
    if (!growth.count) continue;
    const geometry = growth.geometry();
    // Wind displaces tips by < .5 m; expand culling bounds accordingly.
    geometry.boundingSphere.radius += 0.6;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = !ground;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Empty scenery still releases its otherwise unattached material.
  if (!group.children.length) material.dispose();
  return {
    group,
    update(elapsed) {
      if (reducedMotion) return;
      const tau = Math.PI * 2;
      wind.phase.value.set((elapsed * 0.85) % tau, (elapsed * 2.1) % tau, (elapsed * 0.63) % tau);
      wind.gust.value = 0.28 + Math.sin(elapsed * 0.23 % tau) * 0.2;
    }
  };
}
