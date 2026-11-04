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
  blond: 0xc4a066, lightBlond: 0xdcc08c, ginger: 0x9a4f2a, gray: 0xaaa69f, saltPepper: 0x76706a
};
/** Iris colours, linear RGB. */
export const EYE_COLORS = {
  blue: [0.16, 0.34, 0.62], grayBlue: [0.3, 0.4, 0.5], green: [0.22, 0.38, 0.18], hazel: [0.38, 0.27, 0.1],
  brown: [0.22, 0.11, 0.04], darkBrown: [0.1, 0.05, 0.025]
};

const P = (o) => o;
/** The thirteen, as they appear in competition-data.csv. */
export const PARTICIPANTS = {
  'Olov Melander': P({ height: 1.83, build: 'average', skin: 'light', hair: ['sidePart', 'brown'], facialHair: 'stubble', eyes: 'blue',
    face: { jaw: 1.05, nose: 1.02, chin: 1.06, brow: 1.02, cheek: 0.98 }, outfit: { topColor: 0x2f4f6e, bottomColor: 0x3a4250 } }),
  'Mikael Hägglund': P({ height: 1.8, build: 'slim', skin: 'light', hair: ['sweptBack', 'gray'], glasses: 'round', eyes: 'grayBlue',
    face: { jaw: 0.9, nose: 1.14, noseLen: 1.15, chin: 0.96, headL: 1.05, cheek: 0.95, brow: 1.08 }, glassesColor: 0x17171a,
    outfit: { top: 'poloNeck', topColor: 0x1f2026, bottomColor: 0x8f8268, shoes: 'leather' } }),
  'Viktor Jones': P({ height: 1.82, build: 'average', skin: 'medium', hair: ['curly', 'black'], facialHair: 'stubble', eyes: 'darkBrown',
    face: { jaw: 1.04, lips: 1.25, nose: 1.1, cheek: 1.05, chin: 1.02 }, outfit: { topColor: 0xa8202c, bottomColor: 0x2a2e38 } }),
  'Per Vikman': P({ height: 1.79, build: 'average', skin: 'lightWarm', hair: ['crop', 'darkBrown'], facialHair: 'beard', eyes: 'brown',
    face: { jaw: 1.08, nose: 1.05, brow: 1.14, cheek: 1.02 }, outfit: { topColor: 0x7a2e2a, bottomColor: 0x2e3440 } }),
  'Erik Vallgren': P({ height: 1.88, build: 'slim', skin: 'fair', hair: ['sweptBack', 'blond'], glasses: 'rect', eyes: 'blue',
    face: { jaw: 0.92, headL: 1.04, noseLen: 1.12, chin: 1.1, cheek: 0.95 }, glassesColor: 0x222831, outfit: { topColor: 0x3e6b56, bottomColor: 0x3a3f4a } }),
  'Henrik Lundqvist': P({ height: 1.85, build: 'broad', skin: 'lightWarm', hair: ['crop', 'brown'], facialHair: 'fullBeard', eyes: 'hazel',
    face: { jaw: 1.12, nose: 1.08, brow: 1.1, cheek: 1.06, headW: 1.03 }, outfit: { topColor: 0x3f7a46, bottomColor: 0x2b3140 } }),
  'Rickard Nilsson': P({ height: 1.86, build: 'broad', skin: 'light', hair: ['buzz', 'black'], facialHair: 'stubble', eyes: 'brown',
    face: { jaw: 1.15, chin: 1.12, brow: 1.16, nose: 0.96, cheek: 1.03 }, outfit: { topColor: 0x2f5f96, bottomColor: 0x1d2230 } }),
  'Niklas Norberg': P({ height: 1.8, build: 'broad', skin: 'light', hair: ['balding', 'lightBrown'], facialHair: 'beard', glasses: 'rect', eyes: 'green',
    face: { jaw: 1.08, cheek: 1.12, nose: 1.12, headW: 1.05, chin: 0.96 }, glassesColor: 0x2b3446, outfit: { topColor: 0x5b4a7a, bottomColor: 0x3c4a62 } }),
  'Per Olsson': P({ height: 1.81, build: 'average', skin: 'fair', hair: ['bun', 'ginger'], facialHair: 'fullBeard', eyes: 'green',
    face: { brow: 1.18, nose: 1.04, jaw: 1.02, lips: 1.1 }, browThick: 1.35, outfit: { topColor: 0x6b4a2e, bottomColor: 0x33404f } }),
  'Tobias Lundqvist': P({ height: 1.78, build: 'slim', skin: 'lightWarm', hair: ['sidePart', 'brown'], glasses: 'round', eyes: 'hazel',
    face: { jaw: 0.94, nose: 0.94, chin: 0.94, cheek: 0.97, lips: 1.08 }, glassesColor: 0x6a4428, outfit: { topColor: 0xc9a24a, bottomColor: 0x2b3140 } }),
  'Lars Sandin': P({ height: 1.77, build: 'average', skin: 'light', hair: ['long', 'ash'], facialHair: 'stubble', eyes: 'grayBlue',
    face: { jaw: 0.97, headL: 1.03, nose: 1.1, noseLen: 1.1, cheek: 0.96 }, outfit: { topColor: 0x8c3a3a, bottomColor: 0x2f3746 } }),
  'Ludvig Ulenius': P({ height: 1.9, build: 'slim', skin: 'fair', hair: ['tousled', 'lightBlond'], eyes: 'blue',
    face: { jaw: 0.92, chin: 1.04, headW: 0.96, nose: 0.92, cheek: 0.94, lips: 0.95 }, outfit: { topColor: 0x2f5f5c, bottomColor: 0x384050 } }),
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
      glasses: pick(r, [null, null, null, 'round', 'rect']),
      eyes: pick(r, Object.keys(EYE_COLORS)),
      face: { jaw: 0.95 + r() * 0.1, nose: 0.95 + r() * 0.12, chin: 0.95 + r() * 0.1, brow: 0.95 + r() * 0.12, cheek: 0.96 + r() * 0.08 },
      seed: hashName(key),
      outfit: { top: 'tshirt', topColor: pick(r, SHIRT_COLORS), bottom: pick(r, ['jeans', 'trousers']), bottomColor: pick(r, TROUSER_COLORS), shoes: 'sneakers' }
    };
  }
  const out = { ...spec, ...overrides };
  // A different garment drops the colour that belonged to the everyday one
  const base = { ...spec.outfit };
  const o = overrides.outfit || {};
  if (o.top && o.top !== base.top) delete base.topColor;
  if (o.bottom && o.bottom !== base.bottom) delete base.bottomColor;
  if (o.shoes && o.shoes !== base.shoes) delete base.shoeColor;
  out.outfit = { ...base, ...o };
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
  const base = { neck: 'crew', hem: 0.85, tucked: false, off: 0.0042, sleeve: 0.15, sleeveOff: 0.0035, sleeveLoose: 0.55, mat: MAT.CLOTH, tint: [1, 1, 1] };
  switch (kind) {
    case 'none':
      return { ...base, neck: null, hem: 0.99, tucked: true, off: 0, sleeve: 0, mat: MAT.SKIN, region: REGION.SKIN };
    case 'polo':
      return { ...base, neck: 'collar', collar: 'fold', sleeve: 0.14, buttons: 2, sleeveBand: { region: REGION.TOP, tint: [0.88, 0.88, 0.88] } };
    case 'shirt':
      return { ...base, neck: 'collar', collar: 'fold', tucked: true, off: 0.0035, sleeve: 0.54, cuff: true, cuffTint: [0.95, 0.95, 0.95], buttons: 6 };
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
    case 'shorts': return { ...base, legEnd: 0.31, off: 0.006, minR: 0.084, minFrom: 0.0, break: 0, sock: { end: 0.87, region: REGION.FIXED, tint: [0.85, 0.85, 0.82], from: 0.74 } };
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
      return {
        length: 0.285, width: 1.0, height: 1.0, mat: MAT.CLOTH,
        tint: (z, q, y) => {
          if (q.sole || y < 0.018) return white;
          if (z > 0.17) return white.map((v) => v * 0.95);
          if (y > 0.06 && Math.abs(q.x || 0) < 0.02 && z > 0.0 && z < 0.14) return Math.sin(z * 250) > 0 ? white : c.map((v) => v * 0.7);
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
    accent: o.accent ?? (top === 'apron' ? 0x3a5570 : top === 'jersey' ? 0xf1efe8 : 0xb23a48),
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
  const browBase = hairColor.clone().multiplyScalar(0.72);
  if (hair.style === 'balding' || hairColor.getHSL({ h: 0, s: 0, l: 0 }).l > 0.45) browBase.lerp(new THREE.Color(0x3b2a20), 0.35);
  return {
    name: spec.name || '',
    height: spec.height ?? 1.8,
    build: spec.build || 'average',
    skin,
    hairStyle: hair.style || 'crop',
    hairColor,
    facialHair: spec.facialHair || null,
    glasses: spec.glasses || null,
    glassesTint: lin(spec.glassesColor ?? 0x1a1a1e),
    headwear: head ? head.style : null,
    headwearColor: head && head.color !== undefined ? new THREE.Color(head.color) : null,
    iris: eyes,
    face,
    browThick: spec.browThick ?? 0.95 + r() * 0.25,
    browArch: r() * 2 - 1,
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
