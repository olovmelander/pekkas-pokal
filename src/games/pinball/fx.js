/**
 * Impact effects: flashes, sparks and ball trails.
 *
 * All of it is additive and costs almost nothing when idle — one Points
 * object for every spark on the table, a small pool of flash sprites, and a
 * ribbon per ball that only switches on at speed. Everything lives in the
 * table group, so it jolts with the table on a nudge.
 */

const SPARKS = 96;
const FLASHES = 6;
const TRAIL = 9; // samples per ribbon

function glowTexture(THREE) {
  const N = 64;
  const cv = document.createElement('canvas');
  cv.width = N;
  cv.height = N;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, N, N);
  return new THREE.CanvasTexture(cv);
}

export function createFx(THREE, parent, { ballRadius }) {
  const tex = glowTexture(THREE);
  const additive = {
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  };

  /* ---- Sparks ---- */
  const pos = new Float32Array(SPARKS * 3);
  const col = new Float32Array(SPARKS * 3);
  const vel = new Float32Array(SPARKS * 3);
  const base = new Float32Array(SPARKS * 3);
  const life = new Float32Array(SPARKS);
  const maxLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
  const colAttr = new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage);
  sparkGeo.setAttribute('position', posAttr);
  sparkGeo.setAttribute('color', colAttr);
  const sparkMat = new THREE.PointsMaterial({ size: 0.62, map: tex, vertexColors: true, ...additive });
  const points = new THREE.Points(sparkGeo, sparkMat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  parent.add(points);
  let nextSpark = 0;
  let liveSparks = 0;
  const tmp = new THREE.Color();

  /** A burst of sparks off a hit, mostly sideways with a little lift */
  function spark(x, y, z, color, n = 10, speed = 7, lift = 4) {
    tmp.set(color);
    for (let k = 0; k < n; k++) {
      const i = nextSpark;
      nextSpark = (nextSpark + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      vel[i * 3] = Math.cos(a) * s;
      vel[i * 3 + 1] = lift * (0.4 + Math.random());
      vel[i * 3 + 2] = Math.sin(a) * s;
      base[i * 3] = tmp.r;
      base[i * 3 + 1] = tmp.g;
      base[i * 3 + 2] = tmp.b;
      maxLife[i] = 0.22 + Math.random() * 0.38;
      life[i] = maxLife[i];
    }
    liveSparks = SPARKS;
  }

  /* ---- Flash sprites ---- */
  const flashes = Array.from({ length: FLASHES }, () => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, ...additive }));
    m.visible = false;
    m.renderOrder = 6;
    parent.add(m);
    return { m, t: 0, dur: 1, size: 1 };
  });

  function flash(x, y, z, color, size = 3, dur = 0.24) {
    // Reuse whichever flash is furthest through its life
    let f = flashes[0];
    flashes.forEach((c) => {
      if (!c.m.visible || c.t / c.dur > f.t / f.dur) f = c;
    });
    f.m.visible = true;
    f.m.position.set(x, y, z);
    f.m.material.color.set(color);
    f.t = 0;
    f.dur = dur;
    f.size = size;
  }

  /* ---- Ball trails: a tapered ribbon through the last few positions ---- */
  const trails = [];
  function makeTrail() {
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(TRAIL * 2 * 3);
    const c = new Float32Array(TRAIL * 2 * 4);
    const idx = [];
    for (let k = 0; k < TRAIL - 1; k++) {
      const a = k * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(c, 4).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive })
    );
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.renderOrder = 4;
    parent.add(mesh);
    const t = { mesh, hist: [], p, c };
    trails.push(t);
    return t;
  }

  /**
   * Feed a ball's position each frame. The ribbon fades in above a speed
   * where the eye starts to lose the ball, which is exactly when a streak
   * helps — and stays out of the way when the ball is being trapped.
   */
  function trail(i, position, speed, show) {
    const tr = trails[i] || makeTrail();
    const { hist } = tr;
    const last = hist[0];
    if (!show || (last && last.distanceToSquared(position) > 36)) hist.length = 0;
    if (!show) {
      tr.mesh.visible = false;
      return;
    }
    hist.unshift(position.clone());
    if (hist.length > TRAIL) hist.length = TRAIL;
    const k = Math.min(1, Math.max(0, (speed - 24) / 34));
    tr.mesh.visible = k > 0 && hist.length > 2;
    if (!tr.mesh.visible) return;
    const n = hist.length;
    for (let s = 0; s < TRAIL; s++) {
      const q = hist[Math.min(s, n - 1)];
      const nb = hist[Math.min(s + 1, n - 1)];
      const pr = hist[Math.max(s - 1, 0)];
      let dx = pr.x - nb.x;
      let dz = pr.z - nb.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const f = s / (TRAIL - 1);
      const w = ballRadius * 0.85 * (1 - f);
      const a = s < n ? 0.5 * k * (1 - f) ** 1.6 : 0;
      tr.p.set([q.x - dz * w, q.y, q.z + dx * w, q.x + dz * w, q.y, q.z - dx * w], s * 6);
      tr.c.set([0.72 * a, 0.82 * a, 1 * a, a, 0.72 * a, 0.82 * a, 1 * a, a], s * 8);
    }
    tr.mesh.geometry.attributes.position.needsUpdate = true;
    tr.mesh.geometry.attributes.color.needsUpdate = true;
  }

  function update(dt) {
    if (liveSparks > 0) {
      let any = 0;
      for (let i = 0; i < SPARKS; i++) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        const j = i * 3;
        if (life[i] <= 0) {
          col[j] = col[j + 1] = col[j + 2] = 0;
          continue;
        }
        any++;
        vel[j + 1] -= 26 * dt;
        pos[j] += vel[j] * dt;
        pos[j + 1] = Math.max(0.08, pos[j + 1] + vel[j + 1] * dt);
        pos[j + 2] += vel[j + 2] * dt;
        const f = (life[i] / maxLife[i]) ** 1.4;
        col[j] = base[j] * f * 1.6;
        col[j + 1] = base[j + 1] * f * 1.6;
        col[j + 2] = base[j + 2] * f * 1.6;
      }
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      liveSparks = any;
    }
    flashes.forEach((f) => {
      if (!f.m.visible) return;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) {
        f.m.visible = false;
        return;
      }
      f.m.scale.setScalar(f.size * (0.55 + 0.45 * Math.sqrt(k)));
      f.m.material.opacity = (1 - k) ** 2;
    });
  }

  function clear() {
    life.fill(0);
    col.fill(0);
    colAttr.needsUpdate = true;
    flashes.forEach((f) => (f.m.visible = false));
    trails.forEach((t) => {
      t.hist.length = 0;
      t.mesh.visible = false;
    });
  }

  function dispose() {
    tex.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
    flashes.forEach((f) => f.m.material.dispose());
    trails.forEach((t) => {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    });
  }

  return { spark, flash, trail, update, clear, dispose };
}
