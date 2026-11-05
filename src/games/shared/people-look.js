/**
 * Pekkas Pokal — people: appearances and outfits.
 *
 * appearanceFor(name) gives each participant one look that holds in every
 * game (hair, facial hair, glasses, skin, build, face shape, eye colour)
 * plus an everyday outfit that games replace with their own. The thirteen
 * friends are hand-picked so the line-up is varied but generic and kind —
 * no caricature. Any other name gets a look hashed from the name.
 */
import * as THREE from 'three';
import { REGION, MAT, rng } from './people-build.js';

export const SKIN_TONES = {
  fair: 0xf0c3a2, light: 0xe8b08b, lightWarm: 0xdda07a, medium: 0xc4855e, olive: 0xb0774f, deep: 0x8a5638
};
export const HAIR_COLORS = {
  black: 0x231812, darkBrown: 0x3b281b, brown: 0x60432b, lightBrown: 0x87684a, ash: 0x7a6a57,
  blond: 0xc4a066, lightBlond: 0xdcc08c, ginger: 0x9a4f2a, gray: 0xaaa69f, saltPepper: 0x76706a,
  darkBlond: 0x9a7b52, strawberry: 0xc68d58, copper: 0x80462a
};
/** Iris colours, linear RGB. */
export const EYE_COLORS = {
  blue: [0.16, 0.34, 0.62], grayBlue: [0.3, 0.4, 0.5], green: [0.22, 0.38, 0.18], hazel: [0.38, 0.27, 0.1],
  brown: [0.22, 0.11, 0.04], darkBrown: [0.1, 0.05, 0.025]
};

const P = (o) => o;
/**
 * The thirteen, as they appear in competition-data.csv. Hair, facial hair,
 * glasses, headwear and build follow the owner's group photo (Jonas is not
 * in it). Everyday outfits are the photo's summer clothes; games dress them
 * in their own kit on top. The owner's rule: of the participants only Henrik
 * and Viktor wear glasses (clear ones) and nobody wears sunglasses; invented
 * characters may (glasses 'sun', shades 'up' | 'shirt').
 */
export const PARTICIPANTS = {
  'Olov Melander': P({ height: 1.81, build: 'average', skin: 'light', hair: ['sideSwept', 'brown'], eyes: 'blue', smile: 0.45,
    face: { headW: 1.06, faceL: 0.93, jaw: 1.02, jawSq: 0.3, chin: 0.95, cheek: 1.16, cheekbone: 0.92, nose: 0.92, noseLen: 0.86, noseW: 1.08, brow: 0.98, browArch: 0.8, mouth: 1.12, eyeSize: 1.04, eyeOpen: 1.03, eyeTilt: 0.03 },
    browThick: 1.0,
    outfit: { topColor: 0xcfc5b2, bottom: 'shorts', bottomColor: 0x1c1d22 } }),
  // Tall and slim, neat short hair. The painting game's culture critic: the
  // polo neck is his default outfit.
  'Mikael Hägglund': P({ height: 1.87, build: 'slim', skin: 'light', hair: ['crop', 'lightBrown'], eyes: 'grayBlue',
    face: { headW: 0.91, headL: 1.0, faceL: 1.16, jaw: 0.88, jawSq: 0.3, chin: 1.12, cheek: 0.88, cheekbone: 1.12, nose: 1.04, noseLen: 1.2, noseW: 0.88, brow: 1.04, browArch: 0.4, lips: 0.9, eyeSize: 0.99, eyeOpen: 0.98, eyeTilt: -0.03 },
    browThick: 0.92,
    outfit: { top: 'poloNeck', topColor: 0x1f2026, bottom: 'trousers', bottomColor: 0x8f8268, shoes: 'leather' } }),
  'Viktor Jones': P({ height: 1.8, build: 'average', skin: 'fair', hair: ['crop', 'brown'], facialHair: 'fullBeard', glasses: 'round', glassesColor: 0x1a1614, eyes: 'brown',
    headwear: { style: 'cap', color: 0x6f6152 },
    face: { headW: 1.03, faceL: 0.98, jaw: 1.02, jawSq: 0.5, chin: 1.0, cheek: 1.07, nose: 1.06, noseW: 1.1, brow: 1.1, browArch: 0.15, browTilt: 0.3, lips: 1.04, eyeSize: 0.97, eyeOpen: 0.96 },
    browThick: 1.25,
    outfit: { top: 'stripedTee', topColor: 0xb8693a, accent: 0xe9d9c0, bottom: 'shorts', bottomColor: 0xc9b58f } }),
  'Per Vikman': P({ height: 1.87, build: 'slim', skin: 'lightWarm', hair: ['wavy', 'darkBlond'], facialHair: 'stubble', eyes: 'blue', smile: 0.25,
    face: { headW: 0.92, faceL: 1.14, jaw: 0.97, jawSq: 1.0, chin: 1.16, cheek: 0.87, cheekbone: 1.4, nose: 1.08, noseLen: 1.24, noseW: 0.9, brow: 1.08, browArch: 0.25, lips: 0.9, eyeSize: 0.95, eyeOpen: 0.93, eyeTilt: 0.05, headL: 1.02 },
    outfit: { top: 'linen', topColor: 0xc8cebd, bottom: 'shorts', bottomColor: 0xbca785 } }),
  'Erik Vallgren': P({ height: 1.86, build: 'average', skin: 'fair', hair: ['receding', 'darkBlond'], smile: 0.35, eyes: 'blue',
    face: { headW: 1.1, faceL: 1.02, jaw: 1.13, jawSq: 0.8, chin: 1.04, cheek: 1.16, cheekbone: 0.92, nose: 1.05, noseLen: 1.02, noseW: 1.12, brow: 1.0, browArch: -0.2, eyeSize: 0.95, eyeOpen: 0.9, eyeTilt: -0.02 },
    outfit: { topColor: 0xb3b5b5, bottom: 'shorts', bottomColor: 0x1f2638 } }),
  'Henrik Lundqvist': P({ height: 1.83, build: 'slim', skin: 'light', hair: ['messy', 'darkBrown'], glasses: 'rect', glassesColor: 0x141416, eyes: 'hazel',
    face: { headW: 0.94, faceL: 1.08, jaw: 0.95, jawSq: 1.0, chin: 1.05, cheek: 0.9, cheekbone: 1.2, nose: 1.02, noseLen: 1.1, noseW: 0.9, brow: 1.12, browArch: -0.75, browTilt: 0.2, eyeSize: 0.95, eyeOpen: 0.94 }, browThick: 1.3,
    outfit: { topColor: 0x3b2b22, bottom: 'shorts', bottomColor: 0x1d1e23 } }),
  'Rickard Nilsson': P({ height: 1.8, build: 'average', skin: 'lightWarm', hair: ['sweptBack', 'strawberry'], facialHair: 'stubble', eyes: 'blue', smile: 0.6,
    face: { headW: 1.04, faceL: 1.0, jaw: 1.15, jawSq: 1.5, chin: 1.13, brow: 1.15, browArch: -0.25, browTilt: 0.15, nose: 1.0, noseW: 1.06, cheek: 1.04, cheekbone: 1.12, mouth: 1.15, eyeSize: 0.94, eyeOpen: 0.82 },
    browThick: 1.12,
    outfit: { topColor: 0xbabcb9, bottom: 'shorts', bottomColor: 0x1c1d22 } }),
  'Niklas Norberg': P({ height: 1.78, build: 'broad', skin: 'light', hair: ['crop', 'lightBrown'], facialHair: 'beard', smile: 0.3, eyes: 'green',
    headwear: { style: 'cap', color: 0x6d6c4c },
    face: { headW: 1.12, faceL: 0.94, jaw: 1.15, jawSq: 0.35, cheek: 1.22, cheekbone: 0.88, nose: 1.06, noseLen: 0.96, noseW: 1.2, chin: 0.95, eyeSize: 0.93, eyeOpen: 0.87, browArch: 0.2 },
    outfit: { topColor: 0x3e4531, bottom: 'shorts', bottomColor: 0x2a2b30 } }),
  'Per Olsson': P({ height: 1.84, build: 'average', skin: 'light', hair: ['crop', 'darkBrown'], eyes: 'brown',
    face: { headW: 0.97, faceL: 1.07, jaw: 1.02, jawSq: 0.85, chin: 1.07, cheek: 0.96, cheekbone: 1.14, nose: 1.08, noseLen: 1.1, noseW: 0.98, brow: 1.08, browArch: -0.4, browTilt: 0.25, lips: 1.06, eyeSize: 0.94, eyeOpen: 0.92, eyeTilt: -0.05, headL: 1.02 },
    browThick: 1.22,
    outfit: { top: 'polo', topColor: 0x22253a, bottom: 'shorts', bottomColor: 0xb6a37f } }),
  'Tobias Lundqvist': P({ height: 1.81, build: 'average', skin: 'fair', hair: ['shaved', 'strawberry'], facialHair: 'fullBeard', smile: 0.15, eyes: 'blue',
    face: { headW: 1.08, faceL: 0.92, jaw: 1.06, jawSq: 0.3, chin: 0.95, cheek: 1.15, cheekbone: 0.9, nose: 0.95, noseLen: 0.9, noseW: 1.1, brow: 1.05, browArch: 0.1, eyeSize: 1.02, eyeOpen: 1.0, eyeTilt: -0.03 },
    outfit: { topColor: 0xeae8e3, bottom: 'shorts', bottomColor: 0x2b2c31 } }),
  'Lars Sandin': P({ height: 1.79, build: 'average', skin: 'light', hair: ['sidePart', 'blond'], smile: 0.3, eyes: 'grayBlue',
    face: { headW: 1.03, faceL: 1.0, jaw: 1.09, jawSq: 1.1, chin: 1.03, cheek: 1.03, nose: 0.97, noseLen: 0.92, noseW: 1.02, brow: 1.02, browArch: -0.5, eyeSize: 0.96, eyeOpen: 0.9, eyeTilt: 0.05 },
    outfit: { topColor: 0xeeeeea, bottom: 'shorts', bottomColor: 0x1c1d22 } }),
  // Shaved head and a long copper beard: the one silhouette everyone knows
  'Ludvig Ulenius': P({ height: 1.84, build: 'slim', skin: 'fair', hair: ['shaved', 'copper'], facialHair: 'longBeard', eyes: 'blue',
    face: { headW: 0.94, faceL: 1.1, jaw: 0.96, jawSq: 0.6, chin: 1.0, cheek: 0.9, cheekbone: 1.3, nose: 1.02, noseLen: 1.12, noseW: 0.94, brow: 1.08, browArch: -0.3, eyeSize: 0.97, eyeOpen: 0.95 },
    outfit: { topColor: 0x9ba2a6, bottom: 'shorts', bottomColor: 0x41709a } }),
  'Jonas Eriksson': P({ height: 1.76, build: 'average', skin: 'lightWarm', hair: ['crop', 'saltPepper'], facialHair: 'moustache', eyes: 'brown',
    face: { jaw: 1.04, nose: 1.14, cheek: 1.1, brow: 1.06, chin: 0.98 }, outfit: { topColor: 0x4d6b42, bottomColor: 0x3a3a40 } })
};
export const PARTICIPANT_NAMES = Object.keys(PARTICIPANTS);

function hashName(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const WARM_TOPS = new Set(['jacket', 'fishingJacket', 'sweater', 'poloNeck']);
const SPORT_TOPS = new Set(['fencing', 'jersey']);
const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const SHIRT_COLORS = [0x8c3a3a, 0x36506e, 0x4d6b42, 0x7a5a2c, 0x5a3c62, 0x2f5f5c, 0x8a6a3a, 0xa8202c, 0xc9a24a, 0x3d4a66, 0xe0d6c4, 0x6e7f8c];
const TROUSER_COLORS = [0x2b3140, 0x4a3e30, 0x1d2230, 0x3c4a62, 0x5a5348, 0x2e3a2e];

/**
 * A deterministic look for a name. Known participants get their curated
 * look; anyone else is hashed. `overrides` is merged on top (and `outfit`
 * merged field by field), e.g. appearanceFor('Per Vikman', { outfit: { top: 'jersey' } }).
 */
export function appearanceFor(name, overrides = {}) {
  const key = String(name || '').trim();
  const base = PARTICIPANTS[key];
  const r = rng(hashName(key || 'anon'));
  let spec;
  if (base) {
    spec = {
      name: key, height: base.height, build: base.build, skin: SKIN_TONES[base.skin],
      hair: { style: base.hair[0], color: HAIR_COLORS[base.hair[1]] }, facialHair: base.facialHair || null,
      glasses: base.glasses || null, glassesColor: base.glassesColor, eyes: base.eyes, face: { ...base.face },
      headwear: base.headwear ? { ...base.headwear } : null, shades: base.shades || null, smile: base.smile || 0,
      browThick: base.browThick, seed: hashName(key),
      outfit: { top: 'tshirt', bottom: 'jeans', shoes: 'sneakers', ...base.outfit }
    };
  } else {
    const styles = ['crop', 'sidePart', 'sweptBack', 'curly', 'buzz', 'tousled', 'balding', 'crop', 'long', 'bun'];
    spec = {
      name: key,
      height: 1.74 + r() * 0.16,
      build: pick(r, ['slim', 'average', 'average', 'broad']),
      skin: pick(r, [SKIN_TONES.fair, SKIN_TONES.light, SKIN_TONES.light, SKIN_TONES.lightWarm, SKIN_TONES.medium, SKIN_TONES.olive]),
      hair: { style: pick(r, styles), color: pick(r, Object.values(HAIR_COLORS)) },
      facialHair: pick(r, [null, null, 'stubble', 'beard', 'fullBeard', 'moustache']),
      // Of the participants only Henrik and Viktor wear glasses; invented
      // spectators may wear glasses or sunglasses
      glasses: r() < 0.14 ? pick(r, ['round', 'rect', 'sun']) : null,
      eyes: pick(r, Object.keys(EYE_COLORS)),
      face: { jaw: 0.95 + r() * 0.1, nose: 0.95 + r() * 0.12, chin: 0.95 + r() * 0.1, brow: 0.95 + r() * 0.12, cheek: 0.96 + r() * 0.08 },
      seed: hashName(key),
      outfit: { top: 'tshirt', topColor: pick(r, SHIRT_COLORS), bottom: pick(r, ['jeans', 'trousers']), bottomColor: pick(r, TROUSER_COLORS), shoes: 'sneakers' }
    };
  }
  const out = { ...spec, ...overrides };
  // A different garment drops the colour that belonged to the everyday one
  const everyday = { ...spec.outfit };
  const o = overrides.outfit || {};
  if (o.top && o.top !== everyday.top) {
    delete everyday.topColor;
    if (everyday.accent !== undefined && o.accent === undefined) delete everyday.accent;
  }
  // Dressed for the weather: a warm top or boots over summer shorts gets long trousers
  if (everyday.bottom === 'shorts' && !o.bottom && (WARM_TOPS.has(o.top) || o.shoes === 'boots')) {
    everyday.bottom = 'jeans';
    delete everyday.bottomColor;
  }
  if (o.bottom && o.bottom !== everyday.bottom) delete everyday.bottomColor;
  if (o.shoes && o.shoes !== everyday.shoes) delete everyday.shoeColor;
  out.outfit = { ...everyday, ...o };
  // A sports kit leaves the everyday cap and the sunglasses on the shelf
  if (SPORT_TOPS.has(o.top) && !('headwear' in overrides)) out.headwear = null;
  if (SPORT_TOPS.has(o.top) && !('shades' in overrides)) out.shades = null;
  if (o.top && o.top !== spec.outfit.top && out.shades === 'shirt' && !('shades' in overrides)) out.shades = null;
  if (overrides.hair) out.hair = { ...spec.hair, ...overrides.hair };
  if (overrides.face) out.face = { ...spec.face, ...overrides.face };
  return out;
}

/* ------------------------------------------------------------ outfits */

const lin = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};

/** Torso/arm garment definitions. Offsets are metres proud of the body. */
function topDef(kind, o) {
  const base = { neck: 'crew', hem: 0.838, tucked: false, off: 0.0042, sleeve: 0.15, sleeveOff: 0.0035, sleeveLoose: 0.55, mat: MAT.CLOTH, tint: [1, 1, 1] };
  switch (kind) {
    case 'none':
      return { ...base, neck: null, hem: 0.99, tucked: true, off: 0, sleeve: 0, mat: MAT.SKIN, region: REGION.SKIN };
    case 'polo':
      return { ...base, neck: 'collar', collar: 'fold', sleeve: 0.14, buttons: 2, placket: true, sleeveBand: { region: REGION.TOP, tint: [0.88, 0.88, 0.88] }, fabric: 'pique' };
    case 'linen':
      // An untucked linen shirt, sleeves rolled to just below the elbow
      return {
        ...base, neck: 'collar', collar: 'fold', hem: 0.826, off: 0.0052, sleeve: 0.33, sleeveOff: 0.0072, sleeveLoose: 1.5, buttons: 5,
        placket: true, sleeveBand: { region: REGION.TOP, tint: [0.9, 0.9, 0.88] }, fabric: 'linen'
      };
    case 'stripedTee':
      return { ...base, stripes: true, fabric: 'jersey' };
    case 'shirt':
      return { ...base, neck: 'collar', collar: 'fold', tucked: true, off: 0.0035, sleeve: 0.54, cuff: true, cuffTint: [0.95, 0.95, 0.95], buttons: 6, placket: true };
    case 'poloNeck':
      return { ...base, neck: 'turtle', hem: 0.875, off: 0.0048, sleeve: 0.545, cuff: true, cuffTint: [0.9, 0.9, 0.9], neckRoll: true, rib: true };
    case 'sweater':
      return { ...base, neck: 'crew', hem: 0.875, off: 0.006, sleeve: 0.545, cuff: true, cuffTint: [0.88, 0.88, 0.88], hemBand: true };
    case 'jacket':
      return { ...base, neck: 'collar', collar: 'stand', hem: 0.835, off: 0.009, sleeve: 0.545, sleeveOff: 0.0095, cuff: true, cuffTint: [0.85, 0.85, 0.85], zip: true, pockets: true, sleeveLoose: 1.3 };
    case 'fishingJacket':
      return { ...base, neck: 'high', collar: 'stand', collarTall: true, hem: 0.82, off: 0.013, sleeve: 0.545, sleeveOff: 0.014, cuff: true, cuffTint: [0.82, 0.82, 0.82], zip: true, pockets: true, flaps: true, sleeveLoose: 1.6 };
    case 'apron':
      return { ...base, neck: 'collar', collar: 'fold', tucked: true, off: 0.0035, sleeve: 0.3, sleeveOff: 0.007, rolled: true, apron: true, buttons: 0 };
    case 'jersey':
      return {
        ...base, neck: 'vee', hem: 0.86, off: 0.0055, sleeve: 0.16, sleeveOff: 0.008, sleeveLoose: 1.4,
        sleeveBand: { region: REGION.ACCENT, tint: [1, 1, 1] }, trim: true, chestStripe: true
      };
    case 'fencing':
      return { ...base, neck: 'high', hem: 0.86, off: 0.0055, sleeve: 0.545, sleeveOff: 0.0065, cuff: true, cuffTint: [0.95, 0.95, 0.95], lame: o.lame !== false, collar: 'stand' };
    default:
      return base;
  }
}

function bottomDef(kind) {
  const base = { waist: 0.99, legEnd: 0.828, off: 0.004, minR: 0.056, minFrom: 0.42, break: 1, mat: MAT.CLOTH, belt: true, beltTint: [0.42, 0.42, 0.42] };
  switch (kind) {
    case 'jeans': return { ...base, off: 0.0035, minR: 0.051, seam: true, break: 0.7, legEnd: 0.822 };
    // Loose legs below the seat; the top follows the thigh so a shirt hem sits over it cleanly
    case 'shorts': return { ...base, legEnd: 0.31, off: 0.006, minR: 0.079, minFrom: 0.14, break: 0, sock: { end: 0.87, region: REGION.FIXED, tint: [0.85, 0.85, 0.82], from: 0.74 } };
    case 'knickers': return { ...base, legEnd: 0.47, off: 0.004, minR: 0.0, break: 0, belt: false, sock: { end: 0.87, region: REGION.ACCENT, tint: [1, 1, 1] } };
    default: return base;
  }
}

function shoeDef(kind, color) {
  const c = lin(color);
  switch (kind) {
    case 'leather': {
      return {
        length: 0.285, width: 0.94, height: 0.92, mat: MAT.GLOSS,
        tint: (z, q, y) => (y < 0.012 ? [0.03, 0.025, 0.02] : c.map((v) => v * (1 - 0.15 * Math.max(0, q.top || 0))))
      };
    }
    case 'boots': {
      return {
        length: 0.29, width: 1.04, height: 1.08, mat: MAT.SKIN, boot: 0.6, color: c,
        tint: (z, q, y) => (y < 0.014 ? [0.025, 0.025, 0.025] : c)
      };
    }
    default: {
      const white = [0.82, 0.82, 0.8];
      const gum = [0.62, 0.6, 0.56];
      return {
        length: 0.285, width: 1.0, height: 1.0, mat: MAT.CLOTH,
        tint: (z, q, y) => {
          // Grippy outsole, a white midsole band, a rubber toe cap, laces
          if (q.sole) return gum;
          if (y < 0.012) return white.map((v) => v * 0.9);
          if (y < 0.024) return white;
          if (z > 0.172) return white.map((v) => v * 0.95);
          if (y > 0.058 && Math.abs(q.x || 0) < 0.021 && z > 0.0 && z < 0.14) return Math.sin(z * 250) > 0 ? white : c.map((v) => v * 0.7);
          // A heel tab, a shade darker
          if (z < -0.05 && y > 0.06) return c.map((v) => v * 0.8);
          return c;
        }
      };
    }
  }
}

/** Resolve an outfit spec into the definitions the builders read. */
export function resolveOutfit(o = {}) {
  const top = o.top || 'tshirt';
  const bottom = o.bottom || 'jeans';
  const defaultBottomColor = bottom === 'jeans' ? 0x3b5578 : bottom === 'knickers' ? 0xf1efe8 : 0x2b3140;
  return {
    top, bottom,
    topColor: o.topColor ?? (top === 'fencing' ? 0xf3f1ea : top === 'fishingJacket' ? 0xf2c14e : 0x36506e),
    bottomColor: o.bottomColor ?? defaultBottomColor,
    accent: o.accent ?? (top === 'apron' ? 0x3a5570 : top === 'jersey' ? 0xf1efe8 : top === 'stripedTee' ? 0xe9d9c0 : 0xb23a48),
    shoes: o.shoes || (bottom === 'knickers' ? 'sneakers' : 'sneakers'),
    shoeColor: o.shoeColor ?? (o.shoes === 'leather' ? 0x3a2418 : o.shoes === 'boots' ? 0x26343c : 0x2a2f3a),
    topDef: topDef(top, o),
    bottomDef: bottomDef(bottom),
    shoeDef: null
  };
}

export function finishOutfit(out) {
  out.shoeDef = shoeDef(out.shoes, out.shoeColor);
  return out;
}

/** Turn a spec into everything the builders need (colours, face knobs). */
export function resolveLook(spec = {}) {
  const r = rng((spec.seed ?? hashName(spec.name || 'x')) ^ 0x9e3779b9);
  const hair = typeof spec.hair === 'string' ? { style: spec.hair } : (spec.hair || {});
  // Aliases: a shaved head is bald with a shadow of stubble on the scalp; a
  // long beard is a full beard that keeps going (crowds show a full beard)
  const shaved = hair.style === 'shaved';
  const longBeard = spec.facialHair === 'longBeard';
  const head = typeof spec.headwear === 'string' ? { style: spec.headwear } : (spec.headwear || null);
  const faceIn = spec.face || {};
  const face = {
    headW: 1, headL: 1, jaw: 1, chin: 1, cheek: 1, brow: 1, nose: 1, noseLen: 1, lips: 1, mouth: 1, ears: 1,
    blush: 0.8 + r() * 0.4, lipTone: 0.8 + r() * 0.4, ...faceIn
  };
  const skin = new THREE.Color(spec.skin ?? SKIN_TONES.light);
  const hairColor = new THREE.Color(hair.color ?? HAIR_COLORS.brown);
  const eyes = Array.isArray(spec.eyes) ? spec.eyes : EYE_COLORS[spec.eyes] || EYE_COLORS.brown;
  const outfit = finishOutfit(resolveOutfit(spec.outfit || {}));
  const hsl = hairColor.getHSL({ h: 0, s: 0, l: 0 });
  // Grey or salt-and-pepper hair: a little older, so a few age lines
  const age = spec.age ?? (hsl.s < 0.14 && hsl.l > 0.3 ? 1 : 0);
  const browBase = hairColor.clone().multiplyScalar(0.72);
  if (hair.style === 'balding' || hairColor.getHSL({ h: 0, s: 0, l: 0 }).l > 0.45) browBase.lerp(new THREE.Color(0x3b2a20), 0.35);
  return {
    name: spec.name || '',
    height: spec.height ?? 1.8,
    build: spec.build || 'average',
    skin,
    hairStyle: shaved ? 'bald' : hair.style || 'crop',
    shaved,
    hairColor,
    facialHair: longBeard ? 'fullBeard' : spec.facialHair || null,
    beardLong: longBeard,
    glasses: spec.glasses || null,
    glassesTint: lin(spec.glassesColor ?? 0x1a1a1e),
    shades: spec.shades || null,
    smile: spec.smile || 0,
    age,
    headwear: head ? head.style : null,
    headwearColor: head && head.color !== undefined ? new THREE.Color(head.color) : null,
    iris: eyes,
    face,
    browThick: spec.browThick ?? 0.95 + r() * 0.25,
    browArch: faceIn.browArch ?? r() * 2 - 1,
    browTint: [0.75, 0.75, 0.75],
    seed: spec.seed ?? hashName(spec.name || 'x'),
    outfit
  };
}

/** Build-dependent body proportions (widths, limb thickness). */
export function buildFactors(build) {
  switch (build) {
    case 'slim': return { w: 0.94, d: 0.93, neck: 0.97, limb: 0.97, thigh: 0.97, hand: 1.06, chest: 0.6, belly: 0 };
    case 'broad': return { w: 1.09, d: 1.1, neck: 1.1, limb: 1.17, thigh: 1.07, hand: 1.12, chest: 1.3, belly: 0.016 };
    default: return { w: 1, d: 1, neck: 1.03, limb: 1.07, thigh: 1.02, hand: 1.09, chest: 1, belly: 0.004 };
  }
}
