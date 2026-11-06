import * as THREE from 'three';

// Deterministic, local surfaces. No downloads and no image assets to decode.
function random(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
}
function texture(width, height, paint, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = 4;
  return map;
}
function woodTexture() {
  return texture(512, 512, (ctx, w, h) => {
    const rand = random(812);
    ctx.fillStyle = '#73513b'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1100; i++) {
      const x = rand() * w;
      ctx.strokeStyle = rand() < 0.46 ? `rgba(34,16,8,${rand() * 0.2})` : `rgba(232,176,111,${rand() * 0.13})`;
      ctx.lineWidth = 0.5 + rand() * 2.4;
      ctx.beginPath(); ctx.moveTo(x, 0);
      for (let y = 0; y <= h; y += 12) ctx.lineTo(x + Math.sin(y / 100 + x * 0.024) * (3 + Math.sin(x * 0.14) * 2), y);
      ctx.stroke();
    }
    for (let i = 0; i < 24; i++) {
      ctx.strokeStyle = 'rgba(31,13,6,.16)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(180, 210, 5 + i * 3, 18 + i * 11, -.05, 0, Math.PI * 2); ctx.stroke();
    }
  });
}
function parquetTexture() {
  return texture(768, 768, (ctx, w, h) => {
    const rand = random(41);
    ctx.fillStyle = '#4a3425'; ctx.fillRect(0, 0, w, h);
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
    for (let y = -768; y < 768; y += 96) {
      for (let x = -768; x < 768; x += 96) {
        for (let k = 0; k < 3; k++) {
          ctx.save(); ctx.translate(x + 48, y + 48);
          if ((x / 96 + y / 96) % 2) ctx.rotate(Math.PI / 2);
          const tone = .88 + rand() * .24;
          ctx.fillStyle = `rgb(${105 * tone},${78 * tone},${53 * tone})`;
          ctx.fillRect(-47 + k * 31.6, -47, 30.7, 94);
          for (let n = 0; n < 15; n++) {
            ctx.fillStyle = rand() < .5 ? '#190b0618' : '#f8d49413';
            ctx.fillRect(-45 + k * 31 + rand() * 27, -46, .5 + rand(), 92);
          }
          ctx.fillStyle = '#f4ca8518'; ctx.fillRect(-46 + k * 31, -46, 1, 92);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }, 2);
}
function fabricTexture(base, dark) {
  return texture(256, 256, (ctx, w, h) => {
    const rand = random(76);
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle = rand() < .5 ? dark : '#e6dfab10';
      ctx.fillRect(rand() * w, rand() * h, .6, 1.4);
    }
    ctx.strokeStyle = '#efe6c406'; ctx.lineWidth = .5;
    for (let p = 0; p < w; p += 2) {
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
    }
  }, 5);
}
function rugTexture() {
  return texture(1024, 768, (ctx, w, h) => {
    ctx.fillStyle = '#411f24'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = ['#ad8957', '#1b4542', '#c2a76b', '#65372f'][i % 4];
      ctx.lineWidth = i % 2 ? 4 : 12;
      ctx.strokeRect(13 + i * 11, 13 + i * 11, w - 26 - i * 22, h - 26 - i * 22);
    }
    const diamond = (x, y, r, color) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .65, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * .65, y); ctx.closePath(); ctx.fill();
    };
    for (let y = 113; y < h - 90; y += 54) for (let x = 116; x < w - 90; x += 54) {
      diamond(x + (y % 108 ? 20 : 0), y, 15, '#93663d'); diamond(x + (y % 108 ? 20 : 0), y, 8, '#294b40');
    }
    [248, 209, 174, 140, 103].forEach((r, i) => diamond(w / 2, h / 2, r, ['#be9257', '#173b37', '#a67b4a', '#56272b', '#d2b073'][i]));
    const rand = random(912);
    for (let i = 0; i < 22000; i++) {
      ctx.fillStyle = rand() > .5 ? '#0d080717' : '#e7d2a013'; ctx.fillRect(rand() * w, rand() * h, 2, 1);
    }
  });
}
function wallpaperTexture() {
  return texture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#29433f'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#c6ab6d21'; ctx.lineWidth = .7;
    for (let y = -32; y < 300; y += 64) for (let x = -32; x < 300; x += 64) {
      for (let i = 1; i < 5; i++) {
        ctx.beginPath(); ctx.ellipse(x + (y % 128 ? 32 : 0), y, i * 7, i * 12, 0, Math.PI, Math.PI * 2); ctx.stroke();
      }
    }
  }, 4);
}
export function stockholmTexture() {
  return texture(1536, 768, (ctx, w, h) => {
    const rand = random(2018);
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#142039'); gradient.addColorStop(.42, '#556177'); gradient.addColorStop(.66, '#b29080'); gradient.addColorStop(.76, '#355164'); gradient.addColorStop(1, '#182a3b');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 100; i++) {
      ctx.fillStyle = `rgba(247,229,196,${rand() * .5})`; ctx.fillRect(rand() * w, rand() * h * .38, 1.2, 1.2);
    }
    const glow = ctx.createRadialGradient(1170, 110, 5, 1170, 110, 80);
    glow.addColorStop(0, '#f8e5bd60'); glow.addColorStop(1, '#f8e5bd00'); ctx.fillStyle = glow; ctx.fillRect(1090, 30, 160, 160);
    ctx.fillStyle = '#eadcc2'; ctx.beginPath(); ctx.arc(1170, 110, 15, 0, Math.PI * 2); ctx.fill();
    for (let layer = 0; layer < 2; layer++) {
      let x = -10;
      while (x < w) {
        const bw = 28 + rand() * 60, bh = 50 + rand() * 90, y = 510 + layer * 34;
        ctx.fillStyle = layer ? '#24323a' : '#4c4e58'; ctx.fillRect(x, y - bh, bw - 3, bh);
        ctx.beginPath(); ctx.moveTo(x - 2, y - bh); ctx.lineTo(x + bw * .5, y - bh - 15 - rand() * 12); ctx.lineTo(x + bw, y - bh); ctx.fill();
        for (let wx = x + 7; wx < x + bw - 7; wx += 11) for (let wy = y - bh + 12; wy < y - 8; wy += 19) {
          ctx.fillStyle = rand() > .53 ? '#e0be7a' : '#58616a'; ctx.fillRect(wx, wy, 4, 7);
        }
        x += bw;
      }
    }
    // Stadshuset's brick tower and golden three crowns across the water.
    const tx = 1220;
    ctx.fillStyle = '#523d37'; ctx.fillRect(tx - 30, 230, 60, 310); ctx.fillRect(tx - 65, 470, 180, 70);
    ctx.fillStyle = '#182c33'; ctx.fillRect(tx - 25, 210, 50, 20); ctx.fillRect(tx - 17, 179, 34, 31);
    ctx.beginPath(); ctx.moveTo(tx - 26, 179); ctx.lineTo(tx, 127); ctx.lineTo(tx + 26, 179); ctx.fill();
    ctx.fillStyle = '#e0bd6b'; ctx.fillRect(tx - 1, 107, 2, 30);
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.arc(tx + i * 7, 109 + Math.abs(i) * 5, 3, 0, Math.PI * 2); ctx.fill(); }
    for (let y = 245; y < 460; y += 39) for (let x = tx - 14; x <= tx + 14; x += 28) { ctx.fillStyle = '#d5ad69'; ctx.fillRect(x - 3, y, 6, 17); }
    ctx.fillStyle = '#172f3d'; ctx.fillRect(0, 544, w, 5);
    for (let i = 0; i < 800; i++) {
      const y = 551 + rand() * 217;
      ctx.fillStyle = rand() < .35 ? `rgba(229,187,123,${.04 + rand() * .22})` : `rgba(138,172,189,${rand() * .17})`;
      ctx.fillRect(rand() * w, y, 3 + rand() * (10 + (y - 550) * .2), 1 + rand());
    }
  });
}
export function makeRoomMaterials() {
  const grain = woodTexture();
  const parquet = parquetTexture();
  const felt = fabricTexture('#2d7663', '#09271d15');
  const velvet = fabricTexture('#652e34', '#20080d12');
  const wall = wallpaperTexture();
  const standard = (color, roughness = .5, metalness = 0, options = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...options });
  return {
    wood: standard('#baa07c', .38, 0, { map: grain, bumpMap: grain, bumpScale: .015 }),
    darkWood: standard('#6e5542', .4, 0, { map: grain, bumpMap: grain, bumpScale: .012 }),
    floor: standard('#bba582', .5, 0, { map: parquet, bumpMap: parquet, bumpScale: .014 }),
    gold: standard('#c5a366', .28, .78),
    agedGold: standard('#876337', .41, .68),
    green: standard('#b6c4ad', .98, 0, { map: felt, bumpMap: felt, bumpScale: .013 }),
    leather: standard('#193b30', .56, 0, { map: felt, bumpMap: felt, bumpScale: .018 }),
    velvet: standard('#d8a9a3', .94, 0, { map: velvet, bumpMap: velvet, bumpScale: .01, side: THREE.DoubleSide }),
    wall: standard('#c3c3b0', .9, 0, { map: wall, bumpMap: wall, bumpScale: .009 }),
    rug: standard('#d3c3a0', .96, 0, { map: rugTexture() }),
    porcelain: standard('#f0e7d2', .2),
    coffee: standard('#25120a', .16),
    wax: standard('#ead5aa', .67),
    glass: new THREE.MeshPhysicalMaterial({ color: '#d2e2dc', roughness: .07, metalness: .12, transparent: true, opacity: .38, envMapIntensity: 1.4, side: THREE.DoubleSide }),
    silver: standard('#b7c2c0', .22, .92),
    black: standard('#111715', .66),
    paper: standard('#e8dfc6', .78),
    cardBack: standard('#234e43', .52),
    lampshade: standard('#2e7054', .27, .15, { side: THREE.DoubleSide }),
    light: new THREE.MeshBasicMaterial({ color: '#ffe0a3', toneMapped: false }),
    flame: new THREE.MeshBasicMaterial({ color: '#fff0b8', toneMapped: false })
  };
}
