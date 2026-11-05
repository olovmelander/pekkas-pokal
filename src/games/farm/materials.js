import * as THREE from 'three';

/** Quiet procedural surface detail; all four tileable maps fit in 1 MiB. */
export function countrySurfaces() {
  let seed = 2015;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(kind) {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const c = canvas.getContext('2d');
    c.fillStyle = kind === 'grass' ? '#b5c29a' : kind === 'wood' ? '#d7c9ad' : '#d4c9ae';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4800; i++) {
      const x = random() * 256, y = random() * 256, light = Math.floor(105 + random() * 125);
      c.strokeStyle = `rgba(${light},${light},${Math.max(0, light - 20)},${kind === 'wood' ? 0.18 : 0.25})`;
      c.fillStyle = c.strokeStyle;
      if (kind === 'gravel') { c.beginPath(); c.ellipse(x, y, 0.4 + random() * 1.5, 0.3 + random(), random() * 3, 0, Math.PI * 2); c.fill(); } else { c.beginPath(); c.moveTo(x, y); c.lineTo(x + (kind === 'wood' ? random() * 75 : random() * 5 - 2), y + (kind === 'wood' ? random() : random() * 7 + 2)); c.stroke(); }
    }
    if (kind === 'wood') for (let i = 0; i < 4; i++) {
      c.strokeStyle = '#7f71552b'; c.lineWidth = 1;
      c.beginPath(); c.ellipse(30 + i * 67, 32 + i * 52, 26, 4, 0, 0, Math.PI * 2); c.stroke();
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(kind === 'grass' ? 18 : kind === 'gravel' ? 4 : 1, kind === 'grass' ? 18 : kind === 'gravel' ? 24 : 1);
    return map;
  }
  const maps = { grass: texture('grass'), wood: texture('wood'), gravel: texture('gravel'), straw: texture('straw') };
  return { ...maps, dispose: () => Object.values(maps).forEach((map) => map.dispose()) };
}

export function countrySky(scene, lake) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 24, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { horizon: { value: new THREE.Color(lake ? '#d7d6b7' : '#ccd9d7') }, zenith: { value: new THREE.Color(lake ? '#7aa6b5' : '#73a9c3') } },
    vertexShader: 'varying vec3 direction; void main(){ direction = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 direction; uniform vec3 horizon; uniform vec3 zenith;
      void main(){ vec3 d = normalize(direction); vec3 color = mix(horizon,zenith,smoothstep(-.04,${lake ? '.8' : '.55'},d.y));
        float sun = max(0.,dot(d,normalize(vec3(-.48,.18,-.7))));
        color += vec3(.2,.12,.03)*pow(sun,30.); color = mix(color,vec3(1.,.91,.66),smoothstep(.9991,.9996,sun));
        gl_FragColor = vec4(color,1.);\n #include <tonemapping_fragment>\n #include <colorspace_fragment> }`
  }));
  sky.renderOrder = -10; scene.add(sky);
  return sky;
}
