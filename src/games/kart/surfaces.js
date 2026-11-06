import * as THREE from 'three';

/** Small seamless material tiles; all artwork is generated locally. */
export function surfaceMaterial(kind, anisotropy = 4) {
  const size = 256;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const height = document.createElement('canvas'); height.width = height.height = size;
  const context = canvas.getContext('2d'), heightContext = height.getContext('2d');
  const pixels = context.createImageData(size, size), heights = heightContext.createImageData(size, size);
  const base = kind === 'asphalt' ? [89, 94, 94] : kind === 'gravel' ? [147, 140, 122] : [87, 108, 55];
  for (let i = 0; i < size * size; i++) {
    let hash = Math.imul(i ^ 2012, 0x45d9f3b); hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
    const noise = (hash >>> 0) / 4294967296;
    const x = i % size, y = Math.floor(i / size);
    const phase = Math.PI * 2 / size;
    const cloud = kind === 'grass'
      ? (Math.sin((x + y * 2) * phase) * Math.sin((x * 3 - y) * phase) + Math.sin((x * 5 + y * 7) * phase) * 0.4) * 1.5
      : Math.sin(x * Math.PI / 32) * Math.sin(y * Math.PI / 64) * 2;
    const grain = (noise - 0.5) * (kind === 'gravel' ? 35 : 17) + cloud;
    pixels.data.set([base[0] + grain, base[1] + grain, base[2] + grain * 0.7, 255], i * 4);
    const h = 110 + noise * (kind === 'asphalt' ? 45 : 115);
    heights.data.set([h, h, h, 255], i * 4);
  }
  context.putImageData(pixels, 0, 0); heightContext.putImageData(heights, 0, 0);
  if (kind === 'asphalt') {
    context.strokeStyle = 'rgba(35,39,38,.22)'; context.lineWidth = 0.65;
    for (let i = 0; i < 5; i++) {
      context.beginPath();
      for (let j = 0; j < 7; j++) {
        const x = 23 + i * 43 + Math.sin(j * 7.3 + i) * 12, y = 10 + j * 32;
        if (j === 0) context.moveTo(x, y); else context.lineTo(x, y);
      }
      context.stroke();
    }
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(height);
  for (const texture of [map, bumpMap]) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = anisotropy; }
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, map, bumpMap, bumpScale: kind === 'asphalt' ? 0.018 : 0.04,
    roughness: kind === 'asphalt' ? 0.88 : 1, metalness: 0, envMapIntensity: 0.22, vertexColors: true
  });
}
