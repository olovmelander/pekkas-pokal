/**
 * Pekkas Pokal — pokalen i 3D (Three.js r187)
 *
 * Översiktens hjälte: en svarvad guldpokal på en lackad sockel, där varje
 * års vinnare står ingraverad på mässingsplåtar runt sockeln — samma lista
 * som krönikan, bara i metall. Allt byggs i kod; den enda bilden som laddas
 * är föreningens egen logga, som etsas in på kupans framsida.
 *
 * Det som får metall att se ut som metall är vad den speglar, inte ljusen
 * som lyser på den. Därför byggs en liten fotostudio — en mörk kupol med
 * några kraftiga softboxar — och bakas till en PMREM-miljö. Guldet får
 * guldets egen F0-färg (≈ 1.0, 0.77, 0.34 linjärt) och låg ojämnhet, så
 * softboxarnas långa reflexer glider över bålen när pokalen vrids.
 *
 * Duken är genomskinlig så sidans eget sken syns bakom, och loopen ritar
 * bara när pokalen syns och fliken är aktiv.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const GOLD_F0 = new THREE.Color().setRGB(1.0, 0.766, 0.336); // linjärt, fysikaliskt guld

/* ------------------------------------------------------------------ studio */

function buildStudioEnvironment(renderer) {
  const env = new THREE.Scene();

  // Kupolen: nästan svart nertill, varmt dov överst — ger guldet en mörk
  // underkant att kontrastera mot, vilket är det som gör det "polerat".
  const domeGeo = new THREE.SphereGeometry(20, 48, 24);
  const colors = [];
  const pos = domeGeo.attributes.position;
  const top = new THREE.Color(0.85, 0.66, 0.42);
  const mid = new THREE.Color(0.16, 0.12, 0.08);
  const bottom = new THREE.Color(0.01, 0.01, 0.012);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 20;
    if (y > 0) c.copy(mid).lerp(top, Math.pow(y, 1.6));
    else c.copy(mid).lerp(bottom, Math.min(1, -y * 2.2));
    colors.push(c.r, c.g, c.b);
  }
  domeGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(domeGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

  // Softboxar: färgvärden över 1 blir HDR-ljus i den halvflytande PMREM:en.
  const box = (w, h, intensity, tint, position, lookAt = [0, 1.5, 0]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...position);
    m.lookAt(...lookAt);
    env.add(m);
  };
  box(9, 2.2, 9, 0xfff3e0, [-4, 9, 6]); // nyckel, snett ovanifrån
  box(2.4, 10, 6, 0xfff1dc, [-2.6, 4, 9]); // hög strimma framifrån — bålens långa reflex
  box(1.2, 8, 3, 0xffe2b8, [3.6, 3, 8.5]); // svagare motstrimma
  box(1.4, 12, 7, 0xffe6c4, [-9, 3, -3]); // kantljus vänster
  box(1.4, 12, 6, 0xdfe8ff, [9, 3, -2]); // kallt kantljus höger
  box(6, 1.2, 3.5, 0xffd9a0, [3, 0.5, 9]); // låg varm fyllnad framifrån
  box(14, 3, 1.4, 0xffffff, [0, 14, 0], [0, 0, 0]); // takets breda sken

  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
  return rt;
}

/* ------------------------------------------------------------------ pokalen */

/** Profilen svarvas runt y-axeln: fot, nod, skaft, bål, läpp — och tillbaka
 *  ner på insidan så kupan har godstjocklek och en synlig insida. */
function cupProfile() {
  const outer = [
    [0.001, 0.0], [0.98, 0.0], [1.02, 0.05], [1.0, 0.13], [0.86, 0.2], [0.58, 0.28],
    [0.34, 0.4], [0.22, 0.56], [0.3, 0.72], [0.35, 0.8], [0.3, 0.88], [0.19, 0.98],
    [0.17, 1.1], [0.26, 1.18], [0.62, 1.3], [0.98, 1.55], [1.17, 1.92], [1.26, 2.32],
    [1.3, 2.66], [1.37, 2.88], [1.47, 3.0]
  ];
  const spline = new THREE.SplineCurve(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  const pts = spline.getPoints(110);
  // Läppens ovansida och insidan, glesare — den syns mindre.
  pts.push(new THREE.Vector2(1.44, 3.04), new THREE.Vector2(1.38, 3.02));
  const inner = new THREE.SplineCurve(
    [
      [1.32, 2.93], [1.24, 2.66], [1.19, 2.3], [1.08, 1.92], [0.86, 1.6], [0.45, 1.42], [0.001, 1.38]
    ].map(([x, y]) => new THREE.Vector2(x, y))
  );
  return pts.concat(inner.getPoints(36));
}

function buildHandle(side) {
  const s = side;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.2 * s, 2.62, 0),
    new THREE.Vector3(1.62 * s, 2.86, 0),
    new THREE.Vector3(2.1 * s, 2.7, 0),
    new THREE.Vector3(2.18 * s, 2.28, 0),
    new THREE.Vector3(1.86 * s, 1.92, 0),
    new THREE.Vector3(1.38 * s, 1.74, 0),
    new THREE.Vector3(1.12 * s, 1.72, 0)
  ]);
  const geo = new THREE.TubeGeometry(curve, 72, 0.085, 18, false);
  // Rullen i handtagets topp — en liten volut som fångar ljuset
  const scroll = new THREE.TorusGeometry(0.16, 0.06, 14, 28);
  scroll.rotateY(Math.PI / 2);
  scroll.translate(1.66 * s, 2.98, 0);
  return [geo, scroll];
}

/** Loggans emblem (älgen i triangeln) som vit-på-svart alfamask */
async function loadEmblemMask() {
  const img = new Image();
  img.decoding = 'async';
  img.src = new URL('logo-pekkas-pokal.png', document.baseURI).href;
  await img.decode();
  const crop = { w: img.naturalWidth, h: Math.round(img.naturalHeight * 0.772) }; // ovanför ordmärket
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = Math.round((512 * crop.h) / crop.w);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
  // Alfa → luminans, eftersom alphaMap läser grön kanal
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const a = data.data[i + 3];
    data.data[i] = data.data[i + 1] = data.data[i + 2] = a;
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return { tex, aspect: canvas.width / canvas.height };
}

/** En mässingsplåt med graverad text: mörk text multiplicerar guldet. */
function plateTexture(lines, { width = 1024, height = 256, title = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, width, height);
  g.addColorStop(0, '#fff7e6');
  g.addColorStop(0.5, '#f1e2c2');
  g.addColorStop(1, '#fff3da');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, width, height);
  // Borstade linjer — plåten ska vara satin, inte spegel
  ctx.globalAlpha = 0.08;
  for (let y = 0; y < height; y += 2) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
    ctx.fillRect(0, y, width, 1);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(70, 48, 12, 0.55)';
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, width - 28, height - 28);
  ctx.fillStyle = 'rgba(52, 34, 6, 0.92)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (title) {
    ctx.font = `600 ${Math.round(height * 0.34)}px Fraunces, Georgia, serif`;
    ctx.fillText(lines[0], width / 2, height * 0.44);
    ctx.font = `500 ${Math.round(height * 0.13)}px "JetBrains Mono", monospace`;
    ctx.fillText(lines[1] || '', width / 2, height * 0.76);
  } else {
    const rows = Math.ceil(lines.length / 2);
    const colW = width / 2;
    lines.forEach((line, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const y = height * ((row + 0.5) / rows) * 0.8 + height * 0.1;
      ctx.font = `600 ${Math.round(height * 0.15)}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(line.year, col * colW + 48, y);
      ctx.font = `500 ${Math.round(height * 0.17)}px Fraunces, Georgia, serif`;
      ctx.fillText(line.name, col * colW + 48 + height * 0.62, y);
    });
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function contactShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function sparkleTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,248,225,1)');
  g.addColorStop(0.18, 'rgba(255,220,150,0.8)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  // fyrstrålig glimt
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,240,210,0.9)';
  ctx.fillRect(31, 4, 2, 56);
  ctx.fillRect(4, 31, 56, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ montering */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ winners: {year:number,name:string}[], reducedMotion?: boolean, onReady?: () => void }} opts
 */
export async function mountTrophy(canvas, opts = {}) {
  const { winners = [], reducedMotion = false } = opts;
  const disposables = [];
  const track = (o) => (disposables.push(o), o);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const envRT = buildStudioEnvironment(renderer);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xfff0d8, 1.6);
  key.position.set(-4, 7, 6);
  scene.add(key);

  // ---- Material ----
  const gold = track(
    new THREE.MeshPhysicalMaterial({
      color: GOLD_F0,
      metalness: 1,
      roughness: 0.14,
      clearcoat: 0.35,
      clearcoatRoughness: 0.08
    })
  );
  const lacquer = track(
    new THREE.MeshPhysicalMaterial({
      color: 0x0c0b0a,
      metalness: 0,
      roughness: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.12
    })
  );

  // ---- Pokalen ----
  const trophy = new THREE.Group();
  scene.add(trophy);

  const cupGeo = track(new THREE.LatheGeometry(cupProfile(), 120));
  const cup = new THREE.Mesh(cupGeo, gold);
  const PLINTH_H = 1.25;
  cup.position.y = PLINTH_H;
  trophy.add(cup);

  [-1, 1].forEach((s) => {
    buildHandle(s).forEach((g) => {
      track(g);
      const m = new THREE.Mesh(g, gold);
      m.position.y = PLINTH_H;
      trophy.add(m);
    });
  });

  // Ringar som markerar övergången bål/skaft och fotens kant
  [
    [0.28, 0.035, 1.19],
    [1.0, 0.03, 0.08]
  ].forEach(([r, t, y]) => {
    const g = track(new THREE.TorusGeometry(r, t, 12, 96));
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, gold);
    m.position.y = PLINTH_H + y;
    trophy.add(m);
  });

  // ---- Sockeln: två lackade avsatser med mässingsplåtar ----
  const lower = new THREE.Mesh(track(new RoundedBoxGeometry(2.7, 0.72, 2.7, 4, 0.05)), lacquer);
  lower.position.y = 0.36;
  trophy.add(lower);
  const upper = new THREE.Mesh(track(new RoundedBoxGeometry(2.2, 0.5, 2.2, 4, 0.05)), lacquer);
  upper.position.y = 0.72 + 0.25;
  trophy.add(upper);
  const trim = new THREE.Mesh(track(new RoundedBoxGeometry(2.24, 0.04, 2.24, 2, 0.015)), gold);
  trim.position.y = 1.22;
  trophy.add(trim);

  // Vinnarplåtar: fyra sidor, upp till fyra namn var (två kolumner × två rader)
  const sorted = winners.slice().sort((a, b) => a.year - b.year);
  const perSide = Math.max(2, Math.ceil(sorted.length / 4));
  const plateGeo = track(new THREE.PlaneGeometry(2.3, 0.5));
  for (let side = 0; side < 4; side++) {
    const chunk = sorted.slice(side * perSide, side * perSide + perSide);
    if (!chunk.length) continue;
    const tex = track(plateTexture(chunk));
    const mat = track(new THREE.MeshPhysicalMaterial({ color: GOLD_F0, map: tex, metalness: 1, roughness: 0.32 }));
    const plate = new THREE.Mesh(plateGeo, mat);
    const a = (side * Math.PI) / 2;
    plate.position.set(Math.sin(a) * 1.356, 0.36, Math.cos(a) * 1.356);
    plate.rotation.y = a;
    trophy.add(plate);
  }
  const titleTex = track(plateTexture(['PEKKAS POKAL', '63.29°N · 18.73°E · SEDAN 2011'], { width: 1024, height: 256, title: true }));
  const titlePlate = new THREE.Mesh(
    track(new THREE.PlaneGeometry(1.5, 0.375)),
    track(new THREE.MeshPhysicalMaterial({ color: GOLD_F0, map: titleTex, metalness: 1, roughness: 0.28 }))
  );
  titlePlate.position.set(0, 0.97, 1.106);
  trophy.add(titlePlate);

  // ---- Kontaktskugga ----
  const shadowMat = track(
    new THREE.MeshBasicMaterial({ map: track(contactShadowTexture()), transparent: true, depthWrite: false, opacity: 0.8 })
  );
  const shadow = new THREE.Mesh(track(new THREE.PlaneGeometry(5.6, 5.6)), shadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.002;
  scene.add(shadow);

  // ---- Guldstoft ----
  const SPARKS = 46;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkSeed = new Float32Array(SPARKS);
  for (let i = 0; i < SPARKS; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 1.4 + Math.random() * 1.6;
    sparkPos[i * 3] = Math.cos(a) * r;
    sparkPos[i * 3 + 1] = 0.6 + Math.random() * 4.2;
    sparkPos[i * 3 + 2] = Math.sin(a) * r;
    sparkSeed[i] = Math.random() * 10;
  }
  const sparkGeo = track(new THREE.BufferGeometry());
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = track(
    new THREE.PointsMaterial({
      size: 0.16,
      map: track(sparkleTexture()),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.85,
      sizeAttenuation: true
    })
  );
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);

  // ---- Älgen, etsad i satin på kupans framsida ----
  try {
    const { tex, aspect } = await loadEmblemMask();
    track(tex);
    cup.updateMatrixWorld(true);
    const h = 0.95;
    const decalGeo = track(
      new DecalGeometry(cup, new THREE.Vector3(0, PLINTH_H + 2.18, 1.3), new THREE.Euler(0, 0, 0), new THREE.Vector3(h * aspect, h, 1.2))
    );
    const decalMat = track(
      new THREE.MeshPhysicalMaterial({
        color: GOLD_F0.clone().multiplyScalar(0.7),
        metalness: 1,
        roughness: 0.5,
        alphaMap: tex,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4
      })
    );
    // DecalGeometry ger koordinater i världsrummet; pokalens grupp står
    // fortfarande i origo utan rotation här, så de gäller även i gruppen.
    const decal = new THREE.Mesh(decalGeo, decalMat);
    trophy.add(decal);
  } catch (e) {
    /* utan logga blir pokalen slät — inget fel att visa */
  }

  // ---- Kamera & storlek ----
  const target = new THREE.Vector3(0, 2.05, 0);
  function frame() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Passa in pokalens höjd (≈4.3) och bredd (≈4.5) med luft runt om
    const fovV = THREE.MathUtils.degToRad(camera.fov);
    const distH = (5.3 / 2) / Math.tan(fovV / 2);
    const distW = (5.8 / 2) / (Math.tan(fovV / 2) * camera.aspect);
    const dist = Math.max(distH, distW);
    camera.position.set(0, target.y + dist * 0.16, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  frame();

  // ---- Interaktion: dra för att vrida, med tröghet ----
  let rotY = -0.5;
  let vel = 0;
  let dragging = false;
  let lastX = 0;
  let tiltX = 0;
  let tiltTarget = 0;
  let intro = reducedMotion ? 1 : 0;

  const onDown = (e) => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    tiltTarget = ((e.clientY - rect.top) / rect.height - 0.5) * 0.12;
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    vel = dx * 0.006;
    rotY += vel;
    if (reducedMotion) render();
  };
  const onUp = () => {
    dragging = false;
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', () => (tiltTarget = 0));

  // ---- Loop ----
  const timer = new THREE.Timer();
  let raf = 0;
  let visible = true;
  let running = false;

  function render() {
    renderer.render(scene, camera);
  }

  function tick(ts) {
    raf = requestAnimationFrame(tick);
    timer.update(ts);
    const dt = Math.min(timer.getDelta(), 0.05);
    const t = timer.getElapsed();

    // Intro: pokalen svänger in och reser sig
    if (intro < 1) intro = Math.min(1, intro + dt / 1.8);
    const e = 1 - Math.pow(1 - intro, 4);

    if (!dragging) {
      vel *= Math.pow(0.04, dt);
      rotY += vel + dt * 0.22;
    }
    tiltX += (tiltTarget - tiltX) * Math.min(1, dt * 4);
    trophy.rotation.y = rotY + (1 - e) * 2.4;
    trophy.rotation.x = tiltX;
    trophy.position.y = (1 - e) * -0.6 + Math.sin(t * 0.8) * 0.03;
    trophy.scale.setScalar(0.92 + 0.08 * e);

    const p = sparkGeo.attributes.position;
    for (let i = 0; i < SPARKS; i++) {
      let y = p.getY(i) + dt * (0.12 + (sparkSeed[i] % 1) * 0.18);
      if (y > 5.2) y = 0.6;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    sparkMat.opacity = 0.55 + Math.sin(t * 2.3) * 0.2;
    sparks.rotation.y = t * 0.05;

    render();
  }

  function start() {
    if (running || !visible || document.hidden) return;
    running = true;
    if (reducedMotion) {
      trophy.rotation.y = rotY;
      render();
      running = false;
      return;
    }
    timer.reset();
    raf = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  const io = new IntersectionObserver(
    (entries) => {
      visible = entries.some((en) => en.isIntersecting);
      if (visible) start();
      else stop();
    },
    { threshold: 0.01 }
  );
  io.observe(canvas);
  const onVis = () => (document.hidden ? stop() : start());
  document.addEventListener('visibilitychange', onVis);
  const ro = new ResizeObserver(() => {
    frame();
    if (!running) render();
  });
  ro.observe(canvas);

  // Kompilera före första bilden så inbländningen inte hackar
  renderer.compile(scene, camera);
  start();
  render();

  return {
    setTheme(theme) {
      shadowMat.opacity = theme === 'light' ? 0.45 : 0.8;
      if (!running) render();
    },
    pause: stop,
    resume: start,
    destroy() {
      stop();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      timer.dispose();
      disposables.forEach((d) => d.dispose && d.dispose());
      envRT.dispose();
      renderer.dispose();
    }
  };
}

export default mountTrophy;
