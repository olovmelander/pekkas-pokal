/** Pekkas Gokart sound on the arcade's shared AudioContext, so the shell's
 * pause, mute and teardown keep working. The graph is built lazily after the
 * first player gesture wakes the context.
 * - A single-cylinder rental-kart engine: three detuned oscillators through a
 *   load-driven low-pass, a firing-rate chop and filtered intake noise; the rpm
 *   follows speed through a centrifugal clutch.
 * - Wind, tyre squeal (band-passed noise), kerb and grass rumble.
 * - Five rival engines, panned and attenuated by the gap, with a whoosh as they pass.
 * - One-shots: start-light beeps, lights out, impacts, lap chimes and a finish fanfare.
 * Without `game.audioContext` it falls back to `createVoice` and `tone`.
 */
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const TOP_SPEED = 18.5;
const IDLE_RPM = 1450, CLUTCH_RPM = 2350, MAX_RPM = 3900;
const ACTIVE = new Set(['grid', 'lights', 'countdown', 'racing']);

/** Engine speed for a rental kart with a centrifugal clutch. Pure, for the tests. */
export function kartRpm(previous, speed, throttle, dt, wheelspin = 0) {
  const wheel = IDLE_RPM + clamp(finite(speed), 0, 22) * (MAX_RPM - IDLE_RPM) / TOP_SPEED * 0.98;
  // On the throttle the clutch slips at its engagement speed until the wheels catch up;
  // off it the engine is dragged by the wheels until the clutch lets go.
  let target = throttle ? Math.max(wheel, CLUTCH_RPM) : wheel > 2000 ? wheel : IDLE_RPM;
  target = Math.min(MAX_RPM + 150, target + clamp(finite(wheelspin), 0, 1) * 700);
  const rate = target > previous ? (throttle ? 7 : 3) : 4.5;
  return finite(previous, IDLE_RPM) + (target - finite(previous, IDLE_RPM)) * (1 - Math.exp(-rate * clamp(finite(dt), 0, 0.1)));
}

function trackGap(a, b, length) {
  return ((b - a + length / 2) % length + length) % length - length / 2;
}

export function createKartAudio(game, { trackLength = 665 } = {}) {
  let graph = null;
  let fallback = null;
  let rpm = IDLE_RPM;
  let previousSpeed = 0;
  let squealLevel = 0;

  function noiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      // A touch of brown noise keeps the wind and rumble from hissing.
      brown = (brown + white * 0.02) / 1.02;
      data[i] = white * 0.6 + brown * 3.2;
    }
    return buffer;
  }

  function build(ctx) {
    const buffer = noiseBuffer(ctx);
    const nodes = [];
    const sources = [];
    const track = (node) => { nodes.push(node); return node; };
    const source = (node) => { sources.push(node); nodes.push(node); return node; };
    const gain = (value = 0) => { const node = track(ctx.createGain()); node.gain.value = value; return node; };
    const filter = (type, frequency, Q = 1) => { const node = track(ctx.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = Q; return node; };
    const osc = (type, frequency, detune = 0) => { const node = source(ctx.createOscillator()); node.type = type; node.frequency.value = frequency; node.detune.value = detune; return node; };
    const noise = () => { const node = source(ctx.createBufferSource()); node.buffer = buffer; node.loop = true; node.playbackRate.value = 0.9 + Math.random() * 0.2; return node; };
    const panner = (pan = 0) => {
      if (typeof ctx.createStereoPanner !== 'function') return gain(1);
      const node = track(ctx.createStereoPanner()); node.pan.value = pan; return node;
    };
    const master = gain(1);
    const compressor = track(ctx.createDynamicsCompressor());
    compressor.threshold.value = -18; compressor.knee.value = 12; compressor.ratio.value = 3.5; compressor.attack.value = 0.005; compressor.release.value = 0.2;
    master.connect(compressor).connect(ctx.destination);

    // Player engine: sawtooth + sub square + octave saw, a load-driven low-pass and a firing-rate chop.
    const engineFilter = filter('lowpass', 600, 3.2);
    const chop = gain(0.75);
    const engineOut = gain(0);
    const sawA = osc('sawtooth', 50, -6), sub = osc('square', 25, 4), sawB = osc('sawtooth', 100, 9);
    const aLevel = gain(0.5), subLevel = gain(0.32), bLevel = gain(0.16);
    sawA.connect(aLevel).connect(engineFilter); sub.connect(subLevel).connect(engineFilter); sawB.connect(bLevel).connect(engineFilter);
    const intake = noise(), intakeFilter = filter('bandpass', 700, 1.4), intakeLevel = gain(0);
    intake.connect(intakeFilter).connect(intakeLevel).connect(engineFilter);
    // The firing pulse modulates the whole engine: the "brap" of a single cylinder.
    const pulse = osc('triangle', 12), pulseDepth = gain(0.25);
    pulse.connect(pulseDepth).connect(chop.gain);
    engineFilter.connect(chop).connect(engineOut).connect(master);

    // Wind and tyres.
    const wind = noise(), windFilter = filter('bandpass', 600, 0.6), windLevel = gain(0);
    wind.connect(windFilter).connect(windLevel).connect(master);
    const squeal = noise(), squealFilter = filter('bandpass', 1400, 9), squealPeak = filter('peaking', 2600, 6), squealLevel2 = gain(0);
    squealPeak.gain.value = 8;
    squeal.connect(squealFilter).connect(squealPeak).connect(squealLevel2).connect(master);
    const squealWobble = osc('sine', 7), squealWobbleDepth = gain(90);
    squealWobble.connect(squealWobbleDepth).connect(squealFilter.frequency);
    // Kerb rattle: low noise chopped at the stripe rate; grass is a softer, rougher rustle.
    const rumble = noise(), rumbleFilter = filter('lowpass', 260, 1.5), rumbleChop = gain(0), rumbleLevel = gain(0);
    const stripes = osc('square', 14), stripeDepth = gain(0.5);
    stripes.connect(stripeDepth).connect(rumbleChop.gain);
    rumble.connect(rumbleFilter).connect(rumbleChop).connect(rumbleLevel).connect(master);
    const rustle = noise(), rustleFilter = filter('bandpass', 420, 0.8), rustleLevel = gain(0);
    rustle.connect(rustleFilter).connect(rustleLevel).connect(master);

    // Rivals: one buzzy voice each, filtered, panned and attenuated by the gap.
    const rivals = Array.from({ length: 5 }, (_, i) => {
      const a = osc('sawtooth', 50, i * 7 - 14), b = osc('square', 25, -i * 5);
      const tone = filter('lowpass', 700, 2), level = gain(0), pan = panner(0);
      const bLevel2 = gain(0.35);
      a.connect(tone); b.connect(bLevel2).connect(tone);
      tone.connect(level).connect(pan).connect(master);
      return { a, b, tone, level, pan, rpm: IDLE_RPM, speed: 0, prevGap: null };
    });
    const whooshBus = gain(1);
    whooshBus.connect(master);
    sources.forEach((node) => node.start());
    return {
      ctx, nodes, sources, master, buffer, engineFilter, engineOut, sawA, sub, sawB, intakeFilter, intakeLevel, pulse, pulseDepth,
      windFilter, windLevel, squealFilter, squealLevel: squealLevel2, rumbleFilter, rumbleLevel, stripes, rustleLevel, rustleFilter, rivals, whooshBus, panner
    };
  }

  function teardown() {
    if (!graph) return;
    for (const node of graph.sources) { try { node.stop(); } catch { /* already stopped */ } }
    for (const node of graph.nodes) { try { node.disconnect(); } catch { /* already gone */ } }
    graph = null;
  }

  function ensure() {
    const ctx = game.audioContext;
    if (ctx && graph && graph.ctx !== ctx) teardown();
    if (ctx && !graph) {
      try { graph = build(ctx); } catch { graph = null; }
    }
    if (!ctx && !graph && !fallback && typeof game.createVoice === 'function' && !('audioContext' in game)) {
      fallback = {
        a: game.createVoice({ type: 'sawtooth', frequency: 50, gain: 0 }),
        b: game.createVoice({ type: 'square', frequency: 25, gain: 0 }),
        squeal: game.createVoice({ type: 'triangle', frequency: 1300, gain: 0 })
      };
    }
    return graph;
  }

  const set = (param, value, time, constant = 0.05) => {
    if (Number.isFinite(value)) param.setTargetAtTime(value, time, constant);
  };

  /** A short envelope-shaped one-shot on the shared context. */
  function blip({ type = 'sine', from = 440, to = from, duration = 0.15, level = 0.06, delay = 0, pan = 0, noise = false, filterHz = 0 }) {
    const g = graph;
    if (!g) return;
    const { ctx } = g;
    const t = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(level, t + 0.008);
    out.gain.exponentialRampToValueAtTime(0.0008, t + Math.max(0.03, duration));
    let src;
    if (noise) {
      src = ctx.createBufferSource(); src.buffer = g.buffer;
    } else {
      src = ctx.createOscillator(); src.type = type;
      src.frequency.setValueAtTime(Math.max(20, from), t);
      src.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + Math.max(0.03, duration));
    }
    let head = src;
    const extra = [];
    if (filterHz) {
      const f = ctx.createBiquadFilter(); f.type = noise ? 'bandpass' : 'lowpass'; f.frequency.setValueAtTime(filterHz, t); f.Q.value = noise ? 1.2 : 0.8;
      if (noise && to !== from) f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + duration);
      head.connect(f); head = f; extra.push(f);
    }
    let p = null;
    if (pan && typeof ctx.createStereoPanner === 'function') { p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); head.connect(p); head = p; extra.push(p); }
    head.connect(out).connect(g.master);
    src.start(t);
    src.stop(t + Math.max(0.05, duration) + 0.05);
    src.onended = () => { src.disconnect(); extra.forEach((node) => node.disconnect()); out.disconnect(); };
  }

  function event(name, detail = {}) {
    if (!ensure()) {
      // Fallback: the shell's simple tones.
      const tones = { light: [520, 0.14], go: [1040, 0.4], lap: [880, 0.16], final: [988, 0.22], impact: [95, 0.12], finish: [784, 0.35], wrong: [240, 0.2] };
      const [hz, duration] = tones[name] ?? [];
      if (hz) game.tone?.(hz, duration, name === 'impact' ? 'sawtooth' : 'triangle');
      return;
    }
    switch (name) {
      case 'light': blip({ type: 'square', from: 520, duration: 0.2, level: 0.05, filterHz: 1800 }); break;
      case 'go':
        blip({ type: 'square', from: 1040, duration: 0.55, level: 0.055, filterHz: 3200 });
        blip({ type: 'triangle', from: 2080, duration: 0.45, level: 0.025 });
        break;
      case 'jump': blip({ type: 'sawtooth', from: 300, to: 180, duration: 0.45, level: 0.05, filterHz: 900 }); break;
      case 'impact': {
        const strength = clamp(finite(detail.strength, 1), 0.2, 1.5);
        blip({ type: 'sine', from: 150, to: 42, duration: 0.28, level: 0.11 * strength, pan: detail.pan });
        blip({ noise: true, from: 900, to: 160, duration: 0.2, level: 0.09 * strength, filterHz: 900, pan: detail.pan });
        break;
      }
      case 'bump':
        blip({ type: 'sine', from: 120, to: 60, duration: 0.14, level: 0.06, pan: detail.pan });
        blip({ noise: true, from: 600, to: 200, duration: 0.1, level: 0.05, filterHz: 600, pan: detail.pan });
        break;
      case 'lap': blip({ type: 'triangle', from: 880, duration: 0.18, level: 0.05 }); blip({ type: 'triangle', from: 1318, duration: 0.3, level: 0.045, delay: 0.12 }); break;
      case 'final': [784, 988, 1175].forEach((hz, i) => blip({ type: 'triangle', from: hz, duration: 0.22, level: 0.045, delay: i * 0.11 })); break;
      case 'best': blip({ type: 'sine', from: 1568, duration: 0.25, level: 0.04 }); break;
      case 'wrong': blip({ type: 'square', from: 260, duration: 0.22, level: 0.035, filterHz: 900 }); blip({ type: 'square', from: 220, duration: 0.3, level: 0.035, filterHz: 900, delay: 0.24 }); break;
      case 'overtake': blip({ type: 'triangle', from: 660, to: 990, duration: 0.18, level: 0.03 }); break;
      case 'finish': {
        const podium = finite(detail.position, 6) <= 3;
        const notes = podium ? [523, 659, 784, 1047, 784, 1047] : [523, 659, 784, 659];
        const beat = podium ? 0.13 : 0.16;
        notes.forEach((hz, i) => {
          const last = i === notes.length - 1;
          blip({ type: 'square', from: hz, duration: last ? 0.9 : 0.17, level: 0.035, delay: i * beat, filterHz: 2600 });
          blip({ type: 'triangle', from: hz / 2, duration: last ? 0.9 : 0.17, level: 0.04, delay: i * beat });
        });
        break;
      }
      default: break;
    }
  }

  function whoosh(pan, strength) {
    blip({ noise: true, from: 2400, to: 380, duration: 0.55, level: 0.07 * strength, filterHz: 2400, pan });
  }

  return {
    event,
    /** Engine speed for the rev counter. */
    get rpm() { return rpm; },
    /** `controls` is optional ({ throttle, brake }); without it load is read from acceleration. */
    update(dt, player, opponents = [], state = 'racing', controls = null) {
      const step = clamp(finite(dt), 0, 0.1);
      const speed = Math.max(0, finite(player?.speed));
      const accel = step > 0 ? (speed - previousSpeed) / step : 0;
      previousSpeed = speed;
      const active = ACTIVE.has(state);
      const throttle = controls ? !!controls.throttle && !controls.brake : accel > 0.6;
      const wheelspin = finite(player?.wheelspin);
      rpm = kartRpm(rpm, speed, active && throttle, step, wheelspin);
      const g = ensure();
      if (!g) {
        if (fallback) {
          const hz = rpm / 30;
          fallback.a.set(hz, active ? (throttle ? 0.016 : 0.008) : 0);
          fallback.b.set(hz / 2, active ? 0.006 : 0);
          fallback.squeal.set(1200 + speed * 20, active && player?.skidding ? 0.008 : 0);
        }
        return;
      }
      const t = g.ctx.currentTime;
      // Between races only the one-shots (lights, fanfare) sound.
      if (!active) {
        set(g.engineOut.gain, 0, t, 0.4); set(g.windLevel.gain, 0, t, 0.3); set(g.squealLevel.gain, 0, t, 0.1);
        set(g.rumbleLevel.gain, 0, t, 0.1); set(g.rustleLevel.gain, 0, t, 0.1);
        g.rivals.forEach((rival) => set(rival.level.gain, 0, t, 0.4));
        return;
      }
      const fast = clamp(speed / TOP_SPEED, 0, 1);
      const surface = player?.surface ?? (Math.abs(finite(player?.lane)) > 3.5 ? 'grass' : 'asphalt');
      const load = throttle ? clamp(0.55 + 0.45 * (1 - fast) + (surface === 'grass' ? 0.2 : 0) + wheelspin * 0.3, 0, 1) : 0.08;
      const hz = rpm / 30;
      set(g.sawA.frequency, hz, t, 0.03); set(g.sub.frequency, hz / 2, t, 0.03); set(g.sawB.frequency, hz * 2.01, t, 0.03);
      set(g.pulse.frequency, rpm / 120, t, 0.03);
      set(g.pulseDepth.gain, 0.18 + load * 0.2, t, 0.05);
      set(g.engineFilter.frequency, 260 + load * 1500 + (rpm - IDLE_RPM) * 0.22, t, 0.05);
      set(g.intakeFilter.frequency, hz * 9, t, 0.05);
      set(g.intakeLevel.gain, 0.06 + load * 0.25, t, 0.05);
      set(g.engineOut.gain, 0.05 + load * 0.055 + fast * 0.02, t, 0.06);
      // Wind rises with the square of speed.
      set(g.windFilter.frequency, 450 + speed * 75, t, 0.1);
      set(g.windLevel.gain, fast * fast * 0.075, t, 0.12);
      // Tyre squeal from rear slip (or skidding, if slip is not reported).
      const slide = Math.max(finite(player?.slip), player?.skidding ? 0.5 : 0, wheelspin * 0.8);
      const wishSqueal = surface === 'grass' ? 0 : clamp((slide - 0.18) / 0.5, 0, 1) * clamp(speed / 6, wheelspin > 0.2 ? 0.6 : 0, 1);
      squealLevel += (wishSqueal - squealLevel) * (1 - Math.exp(-step * 12));
      set(g.squealFilter.frequency, 1150 + slide * 650 + speed * 12, t, 0.08);
      set(g.squealLevel.gain, squealLevel * 0.06, t, 0.04);
      // Kerb rattle at the stripe rate; grass rustle with speed.
      const onKerb = surface === 'kerb' && speed > 2;
      set(g.stripes.frequency, clamp(speed / 1.1, 4, 30), t, 0.05);
      set(g.rumbleLevel.gain, onKerb ? 0.08 + fast * 0.1 : 0, t, 0.03);
      set(g.rustleLevel.gain, surface === 'grass' && speed > 1 ? 0.03 + fast * 0.06 : 0, t, 0.05);
      set(g.rustleFilter.frequency, 300 + speed * 25, t, 0.1);

      // Rivals: louder when close, panned by which side they are on, Doppler-ish pitch as they pass.
      g.rivals.forEach((voice, i) => {
        const opponent = opponents[i];
        if (!opponent || opponent.finishTime != null && Math.abs(trackGap(finite(player.distance), finite(opponent.distance), trackLength)) > 40) {
          set(voice.level.gain, 0, t, 0.2);
          voice.prevGap = null;
          return;
        }
        const oSpeed = Math.max(0, finite(opponent.speed));
        const oAccel = step > 0 ? (oSpeed - voice.speed) / step : 0;
        voice.speed = oSpeed;
        voice.rpm = kartRpm(voice.rpm, oSpeed, oAccel > 0.3 || oSpeed < 2, step);
        const gap = trackGap(finite(player.distance), finite(opponent.distance), trackLength);
        const lateral = finite(opponent.lane) - finite(player.lane);
        const range = Math.hypot(gap, lateral * 0.8);
        // Positive lane is the driver's left.
        const pan = clamp(-lateral / (Math.abs(gap) * 0.6 + 2.2), -0.95, 0.95);
        const closing = gap < 0 ? oSpeed - speed : speed - oSpeed;
        const doppler = clamp(1 + (Math.abs(gap) > 0.5 ? closing * 0.012 : 0), 0.9, 1.1);
        const rivalHz = voice.rpm / 30 * doppler;
        set(voice.a.frequency, rivalHz, t, 0.05); set(voice.b.frequency, rivalHz / 2, t, 0.05);
        set(voice.tone.frequency, 380 + 900 / (1 + range * 0.12), t, 0.08);
        set(voice.level.gain, 0.075 / (1 + (range / 5) ** 2), t, 0.06);
        if (voice.pan.pan) set(voice.pan.pan, pan, t, 0.05);
        // A pass: the gap changes sign while side by side.
        if (voice.prevGap !== null && Math.sign(voice.prevGap) !== Math.sign(gap) && Math.abs(gap) < 3 && Math.abs(lateral) < 3 && Math.abs(oSpeed - speed) > 0.4 && state === 'racing') {
          whoosh(pan, clamp(Math.abs(oSpeed - speed) / 4 + 0.4, 0.4, 1));
        }
        voice.prevGap = gap;
      });
    },
    reset() { rpm = IDLE_RPM; previousSpeed = 0; squealLevel = 0; graph?.rivals.forEach((voice) => { voice.prevGap = null; }); },
    destroy() {
      teardown();
      if (fallback) { Object.values(fallback).forEach((voice) => voice.stop()); fallback = null; }
    }
  };
}
