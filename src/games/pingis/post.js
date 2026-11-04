/**
 * Pekkas Pingis — the camera's last word.
 *
 * Bloom, so the pendants, the house sign and the ball's trail glow the way a
 * warm hall reads on camera; then the output transform; then one cheap
 * finishing pass in display space: a vignette that tightens on match point,
 * a grade that leans gold or red with who is about to win, the white flash
 * and the hint of lens fringing on a smash, and a whisper of static dither
 * so the dark corners do not band.
 *
 * Bloom is where a real GPU flickers and a software one does not: the
 * stock bright-pass reads ONE texel per bloom texel, at a quarter of the
 * screen's resolution, so a tiny highlight — a sconce bulb, the glint on
 * the ball, a lamp in the floor's mirror — is either sampled or skipped
 * depending on where it falls this frame, and the glow around it blinks
 * as the camera drifts. Our bright-pass averages the whole footprint with
 * a Karis weight (each tap divided by 1 + its brightness), so a lone hot
 * pixel spreads its light evenly instead of winning or losing a lottery,
 * and the threshold has a soft knee so nothing pops on and off at it.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { postTarget, addSanitize } from '../shared/gfx.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinishShader = {
  name: 'PingisFinish',
  uniforms: {
    tDiffuse: { value: null },
    uAspect: { value: 1 },
    uVignette: { value: 0.32 },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uTintAmt: { value: 0 },
    uFlash: { value: 0 },
    uFringe: { value: 0 },
    uGrain: { value: 0.012 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAspect;
    uniform float uVignette;
    uniform vec3 uTint;
    uniform float uTintAmt;
    uniform float uFlash;
    uniform float uFringe;
    uniform float uGrain;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      vec3 col;
      if (uFringe > 0.0005) {
        col.r = texture2D(tDiffuse, vUv + d * uFringe).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, vUv - d * uFringe).b;
      } else {
        col = texture2D(tDiffuse, vUv).rgb;
      }
      // Grade: a gentle S toward warm, then the drama tint
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.18);
      col = mix(col, col * uTint, uTintAmt);
      // Vignette, elliptical with the frame
      vec2 dv = d * vec2(max(1.0, uAspect) * 0.9, max(1.0, 1.0 / uAspect) * 0.9);
      // Edges in rising order: a reversed smoothstep is undefined in GLSL
      // and D3D11 (ANGLE) really does return garbage for it
      float v = 1.0 - smoothstep(0.15, 0.95, length(dv) * (1.0 + uVignette));
      col *= mix(1.0, v, 0.85);
      col += uFlash * vec3(1.0, 0.96, 0.88);
      // Stillastående dither (interleaved gradient noise) i stället för ett
      // animerat sin-hash: fract(sin(stort tal)) räknas grovt på många
      // grafikkretsar och blev blockigt brus som flimrade varje bildruta.
      float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      col += (n - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`
};

/** Bright-pass with a box-filtered, firefly-weighted footprint (see top). */
const BRIGHT_FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec3 defaultColor;
  uniform float defaultOpacity;
  uniform float luminosityThreshold;
  uniform float smoothWidth;
  uniform vec2 uSrcTexel;
  uniform float uFoot;
  varying vec2 vUv;
  vec4 tap(vec2 o, inout float wsum) {
    vec4 c = texture2D(tDiffuse, vUv + o * uSrcTexel);
    float w = 1.0 / (1.0 + luminance(c.rgb));
    wsum += w;
    return c * w;
  }
  void main() {
    // Four bilinear taps, each the average of a 2x2 block, cover the
    // footprint this bloom texel stands for in the full-size image
    float wsum = 0.0;
    float f = uFoot;
    vec4 texel = tap(vec2(-f, -f), wsum) + tap(vec2(f, -f), wsum) + tap(vec2(-f, f), wsum) + tap(vec2(f, f), wsum);
    texel /= max(wsum, 1e-4);
    float v = luminance(texel.rgb);
    vec4 outputColor = vec4(defaultColor.rgb, defaultOpacity);
    float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
    gl_FragColor = mix(outputColor, texel, alpha);
  }`;

export function createPost(renderer, scene, camera, { samples = 0, bloomRes = 0.5, profile } = {}) {
  // Our own target so the scene pass keeps MSAA — the composer's default
  // target has none, which is how a post-processed game loses its
  // antialiasing without anyone noticing. postTarget() picks a format and
  // sample count the GPU can actually render to.
  const rt = postTarget(profile, { samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, camera));
  addSanitize(composer);
  // Nothing in the hall is meant to be brighter than this; a hotter pixel
  // is a glint, and a glint should not get to decide the bloom
  const sanitize = composer.passes.find((p) => p.uniforms?.uMax);
  if (sanitize) sanitize.uniforms.uMax.value = 8;
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.34, 0.55, 0.86);
  const hp = bloom.materialHighPassFilter;
  hp.uniforms.uSrcTexel = { value: new THREE.Vector2(1 / 256, 1 / 256) };
  hp.uniforms.uFoot = { value: 1 };
  hp.uniforms.smoothWidth.value = 0.3;
  hp.fragmentShader = BRIGHT_FRAG;
  hp.needsUpdate = true;
  // The bloom's own mip chain is half-float whatever the scene target is:
  // where the GPU cannot render to half-float it would be drawing into
  // incomplete framebuffers, so it simply stays off there
  bloom.enabled = !!profile?.floatRT;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);
  const u = finish.uniforms;

  return {
    composer,
    bloom,
    u,
    setSize(w, h) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      const pr = renderer.getPixelRatio();
      bloom.setSize(Math.round(w * pr * bloomRes), Math.round(h * pr * bloomRes));
      // The bright-pass target is half the bloom size: each of its texels
      // covers (2 / bloomRes) source texels a side; taps sit a quarter in
      hp.uniforms.uSrcTexel.value.set(1 / Math.max(1, w * pr), 1 / Math.max(1, h * pr));
      hp.uniforms.uFoot.value = 0.5 / bloomRes;
      u.uAspect.value = w / h;
    },
    render() {
      composer.render();
    },
    dispose() {
      composer.passes.forEach((p) => p.dispose?.());
      composer.dispose();
      rt.dispose();
    }
  };
}
