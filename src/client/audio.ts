/**
 * Procedural sound kit (WebAudio, no audio files): soft bells, airy whooshes and thuds
 * through a light reverb, plus a quiet evening-city ambience.
 *
 * Sound is ON by default. Browsers only allow audio after the first user gesture, so the
 * engine unlocks itself on the first tap/click/key anywhere on the page.
 */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbIn: GainNode | null = null;
let ambience: GainNode | null = null;
let muted = readMuted();

const MASTER = 0.6;
const AMBIENCE = 0.5;

function readMuted(): boolean {
  try {
    return localStorage.getItem('sky:muted') === '1';
  } catch {
    return false;
  }
}

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(c: AudioContext, seconds: number, brown = false): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else {
      d[i] = w;
    }
  }
  return buf;
}

let whiteNoise: AudioBuffer | null = null;

/** Creates the audio graph. Safe to call many times; needs a user gesture to actually play. */
export function initAudio(): void {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    comp.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(comp);

    const conv = ctx.createConvolver();
    conv.buffer = impulse(ctx, 2.2, 2.6);
    reverbIn = ctx.createGain();
    reverbIn.gain.value = 0.5;
    reverbIn.connect(conv);
    conv.connect(master);

    whiteNoise = noiseBuffer(ctx, 2);
    startAmbience();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Unlocks audio on the first gesture anywhere (sound is on by default). */
export function installAudioUnlock(): void {
  const unlock = (): void => {
    initAudio();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

function startAmbience(): void {
  if (!ctx || !master) return;
  ambience = ctx.createGain();
  ambience.gain.value = AMBIENCE;
  ambience.connect(master);

  // Distant traffic hum: looping brown noise through a low-pass filter.
  const hum = ctx.createBufferSource();
  hum.buffer = noiseBuffer(ctx, 6, true);
  hum.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 380;
  const humGain = ctx.createGain();
  humGain.gain.value = 0.09;
  hum.connect(lp).connect(humGain).connect(ambience);
  hum.start();

  // Soft warm pad (A major 9 voicing) with a slow swell.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.022;
  const padLp = ctx.createBiquadFilter();
  padLp.type = 'lowpass';
  padLp.frequency.value = 1100;
  padGain.connect(padLp).connect(ambience);
  for (const [f, det] of [[110, -4], [164.81, 3], [246.94, -2], [277.18, 5], [329.63, 0]] as const) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    o.detune.value = det;
    o.connect(padGain);
    o.start();
  }
  const lfo = ctx.createOscillator();
  const lfoAmt = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoAmt.gain.value = 0.012;
  lfo.connect(lfoAmt).connect(padGain.gain);
  lfo.start();
}

export function setMuted(m: boolean): void {
  muted = m;
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MASTER, ctx.currentTime, 0.05);
  try {
    localStorage.setItem('sky:muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function isMuted(): boolean {
  return muted;
}

function ready(): AudioContext | null {
  if (!ctx || !master || muted) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOpts {
  type?: OscillatorType;
  at?: number;
  attack?: number;
  glideTo?: number;
  send?: number;
  detune?: number;
}

/** One enveloped oscillator note. */
function tone(freq: number, dur: number, peak: number, o: ToneOpts = {}): void {
  const c = ready();
  if (!c || !master) return;
  const t = c.currentTime + (o.at ?? 0);
  const osc = c.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + dur);
  if (o.detune) osc.detune.value = o.detune;
  const g = c.createGain();
  const a = o.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  if (o.send && reverbIn) {
    const s = c.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(reverbIn);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Bell: fundamental plus soft inharmonic partials. */
function bell(freq: number, dur: number, peak: number, at = 0, send = 0.6): void {
  tone(freq, dur, peak, { at, send });
  tone(freq * 2.01, dur * 0.6, peak * 0.35, { at, send });
  tone(freq * 3.98, dur * 0.3, peak * 0.12, { at, send });
}

interface NoiseOpts {
  at?: number;
  filter?: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
  attack?: number;
  send?: number;
}

/** Filtered noise burst with a frequency sweep (whooshes, thuds, rumbles). */
function noise(dur: number, peak: number, o: NoiseOpts): void {
  const c = ready();
  if (!c || !master || !whiteNoise) return;
  const t = c.currentTime + (o.at ?? 0);
  const src = c.createBufferSource();
  src.buffer = whiteNoise;
  const f = c.createBiquadFilter();
  f.type = o.filter ?? 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.from, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + (o.attack ?? 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  if (o.send && reverbIn) {
    const s = c.createGain();
    s.gain.value = o.send;
    g.connect(s).connect(reverbIn);
  }
  src.start(t, Math.random());
  src.stop(t + dur + 0.05);
}

export function playSelect(): void {
  tone(1180, 0.07, 0.09, { glideTo: 900 });
  noise(0.03, 0.03, { filter: 'highpass', from: 5000 });
}

export function playToolSelect(): void {
  tone(660, 0.09, 0.08, { type: 'triangle' });
  tone(990, 0.12, 0.06, { type: 'triangle', at: 0.05 });
}

export function playStart(): void {
  bell(659.25, 0.9, 0.12);
  bell(987.77, 1.1, 0.11, 0.12);
}

export function playJump(): void {
  tone(240, 0.16, 0.16, { glideTo: 520 });
  noise(0.18, 0.05, { from: 900, to: 2600, q: 0.8 });
}

export function playGlide(): void {
  noise(0.7, 0.12, { from: 2600, to: 500, q: 1.3, attack: 0.12, send: 0.3 });
  tone(700, 0.6, 0.03, { glideTo: 420, attack: 0.1 });
}

export function playGrapple(): void {
  tone(170, 0.2, 0.06, { type: 'sawtooth', glideTo: 1500 });
  tone(2400, 0.06, 0.08, { type: 'triangle', at: 0.2 });
  noise(0.05, 0.05, { filter: 'highpass', from: 3500, at: 0.2 });
}

export function playLand(): void {
  tone(150, 0.16, 0.28, { glideTo: 55 });
  noise(0.09, 0.07, { filter: 'lowpass', from: 700 });
}

export function playGoldChime(): void {
  [1046.5, 1318.5, 1568, 2093].forEach((f, i) => bell(f, 0.5, 0.07, i * 0.07, 0.5));
}

export function playCollapse(): void {
  noise(0.12, 0.12, { filter: 'highpass', from: 2200 });
  noise(1.2, 0.22, { filter: 'lowpass', from: 420, to: 120, attack: 0.05, send: 0.25 });
  tone(62, 0.9, 0.16, { glideTo: 34 });
}

export function playWin(): void {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => bell(f, 1.4, 0.1, i * 0.11));
  for (const f of [261.63, 329.63, 392]) tone(f, 1.8, 0.035, { type: 'triangle', at: 0.5, attack: 0.25, send: 0.6 });
}

export function playLose(): void {
  tone(392, 0.45, 0.08, { type: 'triangle', send: 0.4 });
  tone(311.13, 0.7, 0.08, { type: 'triangle', at: 0.22, send: 0.4 });
}

export function playError(): void {
  tone(220, 0.09, 0.09, { type: 'triangle' });
  tone(185, 0.12, 0.09, { type: 'triangle', at: 0.1 });
}

export function dispose(): void {
  void ctx?.close();
  ctx = null;
  master = null;
  reverbIn = null;
  ambience = null;
}
