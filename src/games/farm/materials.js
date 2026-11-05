import * as THREE from 'three';
import { buildScenicSky } from '../shared/scenic.js';

/** Tileable close-range fibres and stone; generated once per location. */
export function countrySurfaces() {
  let seed = 2015;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function texture(kind) {
    const size = ['wood', 'paint', 'straw'].includes(kind) ? 512 : 256;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const c = canvas.getContext('2d');
    c.fillStyle = kind === 'grass' ? '#c3c6ad' : kind === 'gravel' ? '#cec7b4' : '#ddd7c5'; c.fillRect(0, 0, size, size);
    // Broad mottling survives distance and avoids a uniform, painted ground.
    for (let i = 0; i < 150; i++) {
      const x = random() * size, y = random() * size, radius = size * (.025 + random() * .12);
      const shade = c.createRadialGradient(x, y, 0, x, y, radius);
      shade.addColorStop(0, i % 2 ? '#665b3b12' : '#fff9e020'); shade.addColorStop(1, '#ffffff00'); c.fillStyle = shade; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    if (kind === 'wood' || kind === 'paint') {
      // Slow, wavy grain, rather than straight stripes; knots interrupt fibres.
      for (let i = 0; i < 190; i++) {
        const y = i * size / 190 + random() * 2, amplitude = 1 + random() * 3;
        c.strokeStyle = i % 4 ? `rgba(95,80,54,${.045 + random() * .13})` : '#fff8d850'; c.lineWidth = .4 + random() * 1.25;
        c.beginPath();
        for (let x = -4; x <= size + 4; x += 8) {
          const wave = y + Math.sin(x * .016 + i * .2) * amplitude + Math.sin(x * .043 + i) * .65;
          if (x === -4) c.moveTo(x, wave); else c.lineTo(x, wave);
        }
        c.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const x = 65 + i * 173, y = 83 + i * 139;
        for (let r = 1; r <= 5; r++) { c.strokeStyle = `rgba(100,80,47,${.2 - r * .023})`; c.beginPath(); c.ellipse(x, y, r * 7, r * 1.8, .04, 0, Math.PI * 2); c.stroke(); }
      }
      if (kind === 'paint') {
        const rotated = document.createElement('canvas'); rotated.width = rotated.height = size;
        const r = rotated.getContext('2d'); r.translate(size, 0); r.rotate(Math.PI / 2); r.drawImage(canvas, 0, 0); c.clearRect(0, 0, size, size); c.drawImage(rotated, 0, 0);
      }
    } else {
      for (let i = 0; i < (kind === 'straw' ? 7500 : 5800); i++) {
        const x = random() * size, y = random() * size, light = Math.floor(95 + random() * 150);
        c.fillStyle = c.strokeStyle = `rgba(${light},${light},${Math.max(0, light - 15)},${kind === 'straw' ? .3 : .28})`;
        if (kind === 'gravel') { c.beginPath(); c.ellipse(x, y, .5 + random() * 2.1, .3 + random() * 1.1, random() * 3, 0, Math.PI * 2); c.fill(); } else { c.lineWidth = kind === 'straw' ? .6 + random() * 1.1 : .6; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (kind === 'straw' ? random() * 60 - 30 : random() * 4 - 2), y + (kind === 'straw' ? random() * 20 : random() * 7 + 1)); c.stroke(); }
      }
    }
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.anisotropy = 4;
    map.repeat.set(kind === 'grass' ? 22 : kind === 'gravel' ? 4 : 1, kind === 'grass' ? 22 : kind === 'gravel' ? 24 : 1);
    return map;
  }
  const maps = { grass: texture('grass'), wood: texture('wood'), paint: texture('paint'), gravel: texture('gravel'), straw: texture('straw') };
  return { ...maps, dispose: () => Object.values(maps).forEach((map) => map.dispose()) };
}

export function countrySky(scene, lake, options = {}) {
  const sky = buildScenicSky({ radius: 240, horizon: lake ? '#ccd9d5' : '#d6ddd4', zenith: lake ? '#78a5be' : '#709fbe', cloudiness: lake ? .56 : .48, reducedMotion: !!options.reducedMotion, sunDirection: options.sunDirection });
  scene.add(sky.mesh);
  return sky;
}
