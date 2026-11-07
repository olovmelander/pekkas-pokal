/**
 * Pekkas Pingis — the split-flap scoreboard on the stage wall.
 *
 * A hall board of a certain age does not redraw, it FLIPS: the top half of
 * the old number falls over the hinge and the bottom half of the new one
 * lands on top of it. That half-second clatter after every point is the
 * room telling you the score, so the board is painted to canvas per frame
 * only while a flap is moving, and costs nothing the rest of the time.
 */

import * as THREE from 'three';

const W = 512;
const H = 256;
const FLIP = 0.36; // seconds per flap

export class Scoreboard {
  constructor(mesh) {
    this.cv = document.createElement('canvas');
    this.cv.width = W;
    this.cv.height = H;
    this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    mesh.material.map = this.tex;
    mesh.material.needsUpdate = true;
    this.flaps = [
      { cur: '0', prev: '0', t: 1 },
      { cur: '0', prev: '0', t: 1 }
    ];
    this.name = '';
    this.match = 1;
    this.serveMine = true;
    this.mp = 0; // 0 none, 1 your match point, -1 theirs
    this.blink = 0;
    this.paint();
  }

  /** Returns true when a flap starts to fall (the caller plays the clack). */
  set(me, ai, name, match, serveMine, mp) {
    let flipped = false;
    [String(me), String(ai)].forEach((v, i) => {
      const f = this.flaps[i];
      if (f.cur !== v) {
        f.prev = f.cur;
        f.cur = v;
        f.t = 0;
        flipped = true;
      }
    });
    const dirty = flipped || name !== this.name || match !== this.match ||
      serveMine !== this.serveMine || mp !== this.mp;
    this.name = name;
    this.match = match;
    this.serveMine = serveMine;
    this.mp = mp;
    if (dirty) this.paint();
    return flipped;
  }

  update(dt) {
    let moving = false;
    this.flaps.forEach((f) => {
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / FLIP);
        moving = true;
      }
    });
    if (this.mp) {
      this.blink += dt;
      moving = true;
    }
    if (moving) this.paint();
  }

  card(x, y, w, h, text, part, squash = 1, shade = 0) {
    const { ctx } = this;
    const hinge = y + h / 2;
    ctx.save();
    ctx.beginPath();
    if (part === 'top') ctx.rect(x, y, w, h / 2);
    else if (part === 'bottom') ctx.rect(x, hinge, w, h / 2);
    else ctx.rect(x, y, w, h);
    ctx.clip();
    // Squash toward the hinge to fake the flap's rotation
    ctx.translate(0, hinge);
    ctx.scale(1, squash);
    ctx.translate(0, -hinge);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2a2723');
    g.addColorStop(0.5, '#1d1b18');
    g.addColorStop(1, '#262420');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.fillStyle = '#f4e6c4';
    ctx.font = `700 ${Math.round(h * 0.78)}px "Schibsted Grotesk", "Space Grotesk", Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h * 0.54);
    if (shade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${shade})`;
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  paint() {
    const { ctx } = this;
    ctx.fillStyle = '#0f0e0c';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(242,193,78,0.55)';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, W - 10, H - 10);

    // Header: the event — or, on match point, the only word that matters
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '6px';
    const on = this.mp && Math.sin(this.blink * 7) > -0.2;
    ctx.font = '700 26px Inter, sans-serif';
    ctx.fillStyle = this.mp
      ? (on ? (this.mp > 0 ? '#ffd166' : '#ff6b5c') : 'rgba(255,255,255,0.2)')
      : 'rgba(235,240,250,0.78)';
    ctx.fillText(this.mp ? 'MATCHBOLL' : `PINGIS 2019 · MATCH ${this.match}/3`, W / 2 + 3, 32);
    ctx.letterSpacing = '0px';

    const cw = 168;
    const ch = 140;
    const cy = 58;
    [[44, 0], [W - 44 - cw, 1]].forEach(([cx, i]) => {
      const f = this.flaps[i];
      const p = f.t;
      if (p >= 1) {
        this.card(cx, cy, cw, ch, f.cur, 'full');
      } else {
        // Behind the falling flap: new top half, old bottom half
        this.card(cx, cy, cw, ch, f.cur, 'top');
        this.card(cx, cy, cw, ch, f.prev, 'bottom');
        if (p < 0.5) this.card(cx, cy, cw, ch, f.prev, 'top', Math.cos(p * Math.PI), p * 0.9);
        else this.card(cx, cy, cw, ch, f.cur, 'bottom', -Math.cos(p * Math.PI), (1 - p) * 0.9);
      }
      // The hinge line
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(cx, cy + ch / 2 - 1.5, cw, 3);
    });

    // Names, and the serve lamp over whoever has it
    ctx.font = '700 24px Inter, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillStyle = 'rgba(235,240,250,0.72)';
    ctx.fillText('DU', 44 + cw / 2, 226);
    ctx.fillText(this.name, W - 44 - cw / 2, 226);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = '#ffcf6b';
    ctx.shadowColor = 'rgba(255,190,90,0.9)';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(this.serveMine ? W / 2 - 22 : W / 2 + 22, cy + ch / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(235,240,250,0.35)';
    ctx.fillRect(W / 2 - 2, cy + 20, 4, ch - 40);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
