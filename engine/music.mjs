// Background music for the videos, synthesised from code (see SOUND.md).
// No samples, no models, no licence: every sound is an oscillator or filtered noise,
// with a Freeverb reverb. Each track is a function of the length, so it fits any video.
// The noise is seeded, so the same track and length always give the same file.
//
//   node music.mjs <out-dir> [seconds] [track ...]     (a preview of each track)
//
// make.mjs calls music(file, track, seconds). Tracks: current (the default), lofi.
import fs from 'node:fs';
import path from 'node:path';

export const SR = 48000;
const TAU = 2 * Math.PI;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// ---------- toolkit ----------
function rng(seed) { // xorshift32: the same seed gives the same track every time
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const bus = (total) => ({ L: new Float64Array(Math.ceil(total * SR)), R: new Float64Array(Math.ceil(total * SR)) });
const render = (d, fn) => { // a note; its last 10 ms fade out so it never ends with a click
  const a = new Float64Array(Math.ceil(d * SR)), z = Math.min(480, a.length);
  for (let i = 0; i < a.length; i++) a[i] = fn(i / SR) * Math.min(1, (a.length - i) / z);
  return a;
};
function add(b, t0, arr, gain = 1, pan = 0) { // equal-power pan, -1 left .. 1 right
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4), gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  const a = Math.round(t0 * SR), n = b.L.length;
  for (let j = Math.max(0, -a); j < arr.length && a + j < n; j++) { b.L[a + j] += gl * arr[j]; b.R[a + j] += gr * arr[j]; }
}
function biquad(x, type, fc, Q = 0.707) { // RBJ cookbook, in place
  const w = (TAU * fc) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * Q), a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  const [b0, b1, b2] = type === 'lp' ? [(1 - c) / 2, 1 - c, (1 - c) / 2] : type === 'hp' ? [(1 + c) / 2, -(1 + c), (1 + c) / 2] : [al, 0, -al];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const filt = (b, type, fc, Q) => { biquad(b.L, type, fc, Q); biquad(b.R, type, fc, Q); return b; };
function freeverb(b, { room = 0.8, damp = 0.5 } = {}) { // Jezar's Freeverb, 8 combs + 4 all-pass per side
  const sc = SR / 44100, fb = room * 0.28 + 0.7, d = damp * 0.4;
  const side = (off) => ({
    combs: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => ({ b: new Float64Array(Math.round((t + off) * sc)), i: 0, s: 0 })),
    aps: [556, 441, 341, 225].map((t) => ({ b: new Float64Array(Math.round((t + off) * sc)), i: 0 })),
  });
  const sides = [side(0), side(23)], out = { L: new Float64Array(b.L.length), R: new Float64Array(b.L.length) };
  for (let i = 0; i < b.L.length; i++) {
    const x = (b.L[i] + b.R[i]) * 0.015;
    for (let c = 0; c < 2; c++) {
      let y = 0;
      for (const cb of sides[c].combs) { const o = cb.b[cb.i]; cb.s = o * (1 - d) + cb.s * d; cb.b[cb.i] = x + cb.s * fb; if (++cb.i >= cb.b.length) cb.i = 0; y += o; }
      for (const ap of sides[c].aps) { const o = ap.b[ap.i], v = o - y; ap.b[ap.i] = y + o * 0.5; if (++ap.i >= ap.b.length) ap.i = 0; y = v; }
      (c ? out.R : out.L)[i] = y * 3;
    }
  }
  return out;
}
// Attack, exponential decay, and a release that starts at `len`.
const env = (t, att, dec, len, rel) => Math.min(1, t / att) * Math.exp(-t * dec) * (t < len ? 1 : Math.max(0, 1 - (t - len) / rel));

// ---------- instruments ----------
const inst = {
  // FM electric piano: the modulation index decays, so the attack is bright and the tail is round.
  epiano: (m, len, vel = 1, wob = 0.0015) => { const f = hz(m); return render(len + 0.5, (t) => {
    const ph = TAU * f * (t + (wob * (1 - Math.cos(TAU * 0.5 * t))) / (TAU * 0.5));
    const I = 1.4 * Math.exp(-t * 3) + 0.25;
    return vel * env(t, 0.004, 0.9, len, 0.45) * (Math.sin(ph + I * Math.sin(ph)) + 0.06 * Math.exp(-t * 14) * Math.sin(ph * 7));
  }); },
  tri: (m, len, vel = 1) => { const f = hz(m); return render(len + 0.08, (t) => vel * env(t, 0.006, 1.2, len, 0.06) *
    (Math.sin(TAU * f * t) - Math.sin(TAU * 3 * f * t) / 9 + Math.sin(TAU * 5 * f * t) / 25)); },
  kick: (vel = 1) => render(0.5, (t) => vel * Math.exp(-t * 9) * Math.sin(TAU * (45 * t + (80 * (1 - Math.exp(-30 * t))) / 30))),
  noise: (d, dec, seed, att = 0.001) => { const r = rng(seed); return render(d, (t) => Math.min(1, t / att) * Math.exp(-t * dec) * (r() * 2 - 1)); },
};
const snare = (seed, vel = 1) => { const n = biquad(biquad(inst.noise(0.3, 16, seed), 'hp', 900), 'lp', 4500);
  const body = render(0.3, (t) => Math.exp(-t * 22) * Math.sin(TAU * 185 * t)); return n.map((v, i) => vel * (0.8 * v + 0.6 * body[i])); };
const hat = (seed, vel = 1, dec = 55) => biquad(inst.noise(0.2, dec, seed), 'hp', 7000).map((v) => v * vel);

// ---------- mixing ----------
function mixdown(stems, total, { lp, sat } = {}) {
  const n = Math.ceil(total * SR), L = new Float64Array(n), R = new Float64Array(n);
  for (const [, b, g] of stems) for (let i = 0; i < n; i++) { L[i] += g * b.L[i]; R[i] += g * b.R[i]; }
  if (lp) { biquad(L, 'lp', lp); biquad(R, 'lp', lp); }
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const t = i / SR, fade = Math.min(1, t / 3) * Math.min(1, (total - t) / 4); // the engine's fades
    if (sat) { L[i] = Math.tanh(L[i] * sat) / sat; R[i] = Math.tanh(R[i] * sat) / sat; }
    L[i] *= fade; R[i] *= fade; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  }
  const k = 0.8 / peak; // peak 0.8, as the engine does
  for (let i = 0; i < n; i++) { L[i] *= k; R[i] *= k; }
  // K-weighted level of each stem (the BS.1770 filters at 48 kHz, no gating), so bass and treble compare by ear.
  const kw = (x) => { const st = [[[1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585]], [[1, -2, 1], [-1.99004745483398, 0.99007225036621]]];
    for (const [[b0, b1, b2], [a1, a2]] of st) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; } } return x; };
  const db = (b, g) => { const x = kw(Float64Array.from(b.L, (v, i) => (v + b.R[i]) * 0.5 * g * k)); let s = 0; for (let i = 0; i < n; i++) s += x[i] ** 2; return (10 * Math.log10(s / n + 1e-12) - 0.691).toFixed(1); };
  return { L, R, report: stems.map(([name, b, g]) => `${name} ${db(b, g)} dB`).join(', ') };
}

// ---------- tracks ----------
export const TRACKS = {
  // The first engine music: sine pad and a slow arpeggio, C-Am-F-G, 72 BPM. Mono.
  current(total) {
    const BEAT = 60 / 72, BAR = 4 * BEAT, CH = [[36, [60, 64, 67]], [45, [57, 60, 64]], [41, [57, 60, 65]], [43, [59, 62, 67]]];
    const n = Math.ceil(total * SR), out = new Float64Array(n);
    for (let b = 0; b * BAR < total; b++) {
      const [bass, notes] = CH[b % 4], a = Math.floor(b * BAR * SR), z = Math.min(n, Math.floor((b + 1.25) * BAR * SR));
      for (let i = a; i < z; i++) {
        const tt = i / SR - b * BAR, e = Math.min(1, tt / 1.2) * Math.max(0, Math.min(1, (BAR * 1.25 - tt) / (BAR * 0.5)));
        let pad = 0; for (const m of notes) pad += Math.sin(TAU * hz(m) * tt) + 0.5 * Math.sin(TAU * hz(m) * 1.003 * tt + 1);
        out[i] += 0.1 * e * pad + 0.16 * e * Math.sin(TAU * hz(bass) * tt);
      }
      [...notes, notes[1]].forEach((m, k) => { const s = Math.floor((b * BAR + k * BEAT) * SR);
        for (let j = 0; j < 2.5 * SR && s + j < n; j++) out[s + j] += 0.07 * Math.exp((-j / SR) * 2.2) * Math.sin(TAU * hz(m + 12) * (j / SR)); });
    }
    const k = Math.exp((-TAU * 2500) / SR); let acc = 0;
    for (let i = 0; i < n; i++) { acc = (1 - k) * out[i] + k * acc; out[i] = acc; }
    return mixdown([['pad+arp', { L: out, R: out }, 1]], total);
  },

  // Lo-fi study beat: FM electric piano on ii-V-I-vi 9th chords, swung hats, soft kick and snare,
  // round bass, vinyl crackle. Calm and steady, 76 BPM.
  lofi(total) {
    const BEAT = 60 / 76, BAR = 4 * BEAT, SW = 0.6, r = rng(7);
    const at = (bar, beat) => (bar * 4 + Math.floor(beat) + (beat % 1 === 0.5 ? SW : beat % 1)) * BEAT;
    const CH = [[38, [53, 57, 60, 64]], [43, [53, 59, 64]], [36, [52, 55, 59, 62]], [33, [55, 60, 64, 71]]];
    const keys = bus(total), bass = bus(total), drums = bus(total), vinyl = bus(total);
    for (let b = 0; b * BAR < total; b++) {
      const [root, v] = CH[b % 4];
      v.forEach((m, k) => {
        add(keys, at(b, 0) + k * 0.014, inst.epiano(m, 1.7 * BEAT, 0.9), 0.22, -0.3 + 0.2 * k);
        add(keys, at(b, 2.5) + k * 0.01, inst.epiano(m, 1.2 * BEAT, 0.55), 0.22, -0.3 + 0.2 * k);
      });
      add(bass, at(b, 0), inst.tri(root + 12, 1.6 * BEAT), 0.35);
      add(bass, at(b, 2.5), inst.tri(root + (b % 2 ? 19 : 12), 1.2 * BEAT, 0.8), 0.35);
      for (const beat of [0, 2.5]) add(drums, at(b, beat), inst.kick(beat ? 0.7 : 1), 0.8);
      for (const beat of [1, 3]) add(drums, at(b, beat), snare(b * 4 + beat, 0.8), 0.35, 0.05);
      for (let e = 0; e < 8; e++) add(drums, at(b, e / 2), hat(b * 8 + e + 99, e % 2 ? 0.55 : 1), 0.1, 0.25);
    }
    for (let i = 0; i < vinyl.L.length; i++) { // crackle: sparse clicks on a low hiss
      const h = (r() * 2 - 1) * 0.004, c = r() < 0.0004 ? (r() * 2 - 1) * 0.25 : 0;
      vinyl.L[i] = h + c; vinyl.R[i] = h + (r() < 0.0004 ? (r() * 2 - 1) * 0.25 : 0);
    }
    filt(vinyl, 'bp', 2500, 0.8); filt(bass, 'lp', 600); filt(keys, 'lp', 3200);
    const rev = freeverb(keys, { room: 0.7, damp: 0.6 });
    return mixdown([['keys', keys, 1], ['keys verb', rev, 0.35], ['bass', bass, 1], ['drums', drums, 1], ['vinyl', vinyl, 3]], total, { lp: 5000, sat: 1.5 });
  },

};

function writeWav(file, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(q(L[i]), 44 + i * 4); buf.writeInt16LE(q(R[i]), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}

// Writes the track at the given length to `file` (48 kHz, stereo, 16 bit, peak 0.8).
export function music(file, track, seconds) {
  if (!TRACKS[track]) throw new Error(`no music track "${track}". Tracks: ${Object.keys(TRACKS).join(', ')}`);
  const { L, R } = TRACKS[track](seconds);
  writeWav(file, L, R);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [out = '.', secs = '30', ...names] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  for (const name of names.length ? names : Object.keys(TRACKS)) {
    const { L, R, report } = TRACKS[name](Number(secs));
    writeWav(path.join(out, `${name}.wav`), L, R);
    console.log(`${name.padEnd(8)} stems (K-weighted): ${report}`);
  }
}
