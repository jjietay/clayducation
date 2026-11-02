// Sound effects for the videos, synthesised from code (a prototype: see SFX-PROPOSAL.md).
// No samples, no models, no licence: every sound is an oscillator or filtered noise.
// Each event gets its own seeded variation (pitch, gain, length, noise), so repeats do not
// sound like a machine, and the same events always give the same file, byte for byte.
//
//   node sfx.mjs kit <out-dir>                                  one WAV a sound, and a preview with 3 variants
//   node sfx.mjs track <events.json> <seconds> <out.wav> [timeline.json]   the SFX bus of a video
//
// events.json: [{ "t": 3.12, "sound": "stamp", "gain": 0, "pan": 0, "pitch": 0, "dur": 0.4 }, ...]
// t in seconds from the start of the video; gain in dB; pan -1 (left) to 1 (right);
// pitch in semitones; dur only for the sounds with a length (whoosh, swish, paper, marker, pencil, typing).
import fs from 'node:fs';
import path from 'node:path';

export const SR = 48000;
const TAU = 2 * Math.PI;

// ---------- toolkit ----------
function rng(seed) { // xorshift32, as in music.mjs
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const hash = (str) => { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }; // FNV-1a
const buf = (d) => new Float64Array(Math.ceil(d * SR));
const white = (n, r) => { const a = new Float64Array(n); for (let i = 0; i < n; i++) a[i] = r() * 2 - 1; return a; };
const smooth = (u) => u * u * (3 - 2 * u);

// State-variable filter (Zavalishin TPT form): stable when the cut-off moves every sample.
// fc is a number or a function of the sample index. 'bp' has a gain of 1 at fc.
function svf(x, mode, fc, Q = 0.707) {
  const k = 1 / Q, f = typeof fc === 'function' ? fc : () => fc;
  let s1 = 0, s2 = 0;
  for (let i = 0; i < x.length; i++) {
    const g = Math.tan((Math.PI * Math.min(f(i), SR * 0.45)) / SR), a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = x[i], v3 = v0 - s2, v1 = a1 * s1 + a2 * v3, v2 = s2 + a2 * s1 + a3 * v3;
    s1 = 2 * v1 - s1; s2 = 2 * v2 - s2;
    x[i] = mode === 'lp' ? v2 : mode === 'bp' ? k * v1 : v0 - k * v1 - v2;
  }
  return x;
}
// A sine whose frequency and level are functions of time; `harm` adds harmonics [[n, level, extraDecay]].
function tone(d, freq, amp, harm = [[1, 1, 0]]) {
  const a = buf(d); let ph = 0;
  for (let i = 0; i < a.length; i++) {
    const t = i / SR; let v = 0;
    for (const [n, g, dec] of harm) v += g * Math.exp(-t * dec) * Math.sin(n * ph);
    a[i] = amp(t) * v; ph += (TAU * freq(t)) / SR;
  }
  return a;
}
// A noise burst: band, level envelope.
function burst(d, r, mode, fc, Q, amp) {
  const a = svf(white(Math.ceil(d * SR), r), mode, fc, Q);
  for (let i = 0; i < a.length; i++) a[i] *= amp(i / SR);
  return a;
}
const mixInto = (dst, src, at = 0, g = 1) => { const o = Math.round(at * SR); for (let j = 0; j < src.length && o + j < dst.length; j++) dst[o + j] += g * src[j]; return dst; };
// Slow random level (a rough surface): sample-and-hold at `rate` Hz, smoothed.
function rough(n, r, rate, depth) {
  const a = new Float64Array(n), hold = Math.max(1, Math.round(SR / rate)); let v = r(), y = v;
  const k = Math.exp(-TAU * rate / SR);
  for (let i = 0; i < n; i++) { if (i % hold === 0) v = r(); y = (1 - k) * v + k * y; a[i] = 1 - depth + depth * y; }
  return a;
}
// Small room (Freeverb, as in music.mjs, with a short tail): mono in, stereo out.
function room(x, { size = 0.35, damp = 0.5, wet = 0.2 } = {}) {
  const sc = SR / 44100, fb = size * 0.28 + 0.7, d = damp * 0.4, tail = Math.ceil(0.6 * SR);
  const n = x.length + tail, L = new Float64Array(n), R = new Float64Array(n);
  for (const [c, off] of [[L, 0], [R, 23]]) {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((t) => ({ b: new Float64Array(Math.round((t + off) * sc)), i: 0, s: 0 }));
    const aps = [556, 441, 341, 225].map((t) => ({ b: new Float64Array(Math.round((t + off) * sc)), i: 0 }));
    for (let i = 0; i < n; i++) {
      const v = (i < x.length ? x[i] : 0) * 0.015; let y = 0;
      for (const cb of combs) { const o = cb.b[cb.i]; cb.s = o * (1 - d) + cb.s * d; cb.b[cb.i] = v + cb.s * fb; if (++cb.i >= cb.b.length) cb.i = 0; y += o; }
      for (const ap of aps) { const o = ap.b[ap.i], u = o - y; ap.b[ap.i] = y + o * 0.5; if (++ap.i >= ap.b.length) ap.i = 0; y = u; }
      c[i] = (i < x.length ? x[i] * Math.SQRT1_2 : 0) + wet * y * 3;
    }
  }
  // The tail fades to 0 over its last 0.3 s, so the reverb never stops with a click.
  for (let i = n - Math.ceil(0.3 * SR); i < n; i++) { const g = (n - i) / (0.3 * SR); L[i] *= g; R[i] *= g; }
  return { L, R };
}

// ---------- the kit ----------
// Each sound is (r, o) => mono Float64Array, or { L, R } for a sound that moves or has a room.
// o.p = pitch factor (1 = as designed); o.dur = length in s for the sounds with a length.
// `level` is the loudness class: the largest K-weighted loudness over 100 ms that the sound gets,
// in LUFS, before the event gain (see loudMax). The voice in a render is at -16 LUFS integrated.
const ACCENT = -21, MEDIUM = -24, SMALL = -27;
export const KIT = {
  // Soft bubble pop: a sine that jumps up in pitch in 10 ms, with a tiny air transient. Icons that appear.
  pop: { level: MEDIUM, make: (r, { p }) => {
    const a = tone(0.18, (t) => p * (420 + 520 * (1 - Math.exp(-t / 0.01))), (t) => Math.min(1, t / 0.0008) * Math.exp(-t * 32), [[1, 1, 0], [2, 0.15, 20]]);
    return mixInto(a, burst(0.01, r, 'bp', 2400 * p, 1, (t) => Math.exp(-t * 900)), 0, 0.35);
  } },
  // Mechanical click: a press and a softer release 22 ms later. Magnets, buttons, parts that snap in.
  click: { level: SMALL, make: (r, { p }) => {
    const one = (f, g) => { const x = tone(0.07, () => f * p, (t) => g * Math.exp(-t * 220), [[1, 0.6, 0], [1.61, 0.3, 80]]);
      mixInto(x, tone(0.07, () => 190 * p, (t) => g * 0.5 * Math.exp(-t * 70)));
      return mixInto(x, burst(0.008, r, 'bp', 3000 * p, 1.5, (t) => g * Math.exp(-t * 700)), 0, 0.8); };
    return mixInto(mixInto(buf(0.1), one(2300, 1)), one(2700, 0.3), 0.022);
  } },
  // Small bright tick. Counters, data marks; give each mark a pitch from its value (o.pitch in semitones).
  tick: { level: SMALL, make: (r, { p }) => {
    const a = tone(0.06, () => 3100 * p, (t) => Math.min(1, t / 0.0003) * Math.exp(-t * 110), [[1, 1, 0], [2, 0.3, 90], [0.5, 0.3, 40]]);
    return mixInto(a, burst(0.002, r, 'bp', 5000, 1, () => 1), 0, 0.2);
  } },
  // Air that passes from left to right: noise through a band-pass that opens as the thing comes near.
  // Scene changes and big moves. o.dur 0.3 to 3 s; o.peak (0 to 1) = where in the sound the thing is nearest.
  // -25 LUFS, 4 dB under the accents: the user found the 2.5 s fly-in whoosh at -21 a bit too loud.
  whoosh: { level: -25, make: (r, o) => whoosh(r, { dur: 0.7, peak: 0.55, lo: 220, hi: 2600, ...o }) },
  // Short high whoosh: a card or a label that slides in.
  swish: { level: MEDIUM, make: (r, o) => whoosh(r, { dur: 0.28, peak: 0.4, lo: 700, hi: 5500, body: 0.25, ...o }) },
  // Heavy landing: a sine that falls from 135 Hz to 50 Hz, with harmonics so laptop speakers play it too.
  thud: { level: ACCENT, make: (r, { p }) => {
    const a = tone(0.45, (t) => p * (50 + 85 * Math.exp(-t * 28)), (t) => Math.min(1, t / 0.002) * Math.exp(-t * 8), [[1, 1, 0], [2, 0.35, 6], [3, 0.15, 12]]);
    mixInto(a, burst(0.12, r, 'lp', 500, 0.7, (t) => Math.exp(-t * 45)), 0, 0.6);
    return mixInto(a, burst(0.02, r, 'bp', 1500, 1, (t) => Math.exp(-t * 400)), 0, 0.15);
  } },
  // Rubber stamp on paper on a desk: a short low body, a wood knock, the paper slap, a small room.
  // The newsreel slam, the briefing-board stamp, the mid-century medallion.
  stamp: { level: ACCENT, make: (r, { p }) => {
    const a = tone(0.3, (t) => p * (95 + 110 * Math.exp(-t * 35)), (t) => Math.min(1, t / 0.001) * Math.exp(-t * 14));
    mixInto(a, tone(0.2, () => 410 * p, (t) => 0.35 * Math.exp(-t * 28), [[1, 1, 0], [1.56, 0.55, 12]]));
    mixInto(a, burst(0.15, r, 'bp', 1800, 0.7, (t) => Math.min(1, t / 0.0005) * Math.exp(-t * 38)), 0, 0.9);
    mixInto(a, burst(0.04, r, 'bp', 4500, 1, (t) => Math.exp(-t * 120)), 0, 0.3);
    return room(a, { size: 0.3, damp: 0.6, wet: 0.16 });
  } },
  // Paper that slides and lands: band-passed noise with a grainy level, a soft tap at the end.
  // A sheet, a card or a cut-out that arrives (paper cut-out, risograph plates, briefing board).
  paper: { level: MEDIUM, make: (r, { dur = 0.4 }) => {
    const n = Math.ceil(dur * SR), a = svf(svf(white(n, r), 'bp', 3200, 0.6), 'hp', 900), g = rough(n, r, 90, 0.5);
    for (let i = 0; i < n; i++) { const u = i / n; a[i] *= g[i] * (u < 0.7 ? smooth(u / 0.7) : Math.cos((Math.PI / 2) * (u - 0.7) / 0.3) ** 2); }
    const out = mixInto(buf(dur + 0.12), a);
    mixInto(out, burst(0.1, r, 'lp', 1800, 0.7, (t) => Math.exp(-t * 60)), dur * 0.85, 0.5);
    return mixInto(out, tone(0.1, () => 220, (t) => 0.2 * Math.exp(-t * 50)), dur * 0.85);
  } },
  // Felt marker on a whiteboard: friction noise and a light stick-slip squeak. o.dur = the stroke.
  marker: { level: MEDIUM, make: (r, { p, dur = 0.5 }) => {
    const n = Math.ceil(dur * SR), ph0 = r() * TAU, walk = rough(n, r, 6, 1), g = rough(n, r, 120, 0.35), on = rough(n, r, 9, 1);
    const sq = buf(dur); let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, f = p * 1250 * (1 + 0.05 * Math.sin(TAU * 5.5 * t + ph0) + 0.08 * (walk[i] - 0.5));
      const gate = Math.min(1, Math.max(0, (on[i] - 0.45) * 4)); // the squeak comes and goes, as the pen sticks and slips
      sq[i] = (Math.sin(ph) + Math.sin(2 * ph) / 2 + Math.sin(3 * ph) / 3 + Math.sin(4 * ph) / 4) * g[i] * gate; ph += (TAU * f) / SR; }
    svf(sq, 'bp', 2600 * p, 2);
    const fr = svf(white(n, r), 'bp', 2800, 1.2), a = buf(dur);
    for (let i = 0; i < n; i++) { const t = i / SR, e = Math.min(1, t / 0.025) * Math.min(1, (dur - t) / 0.05); a[i] = e * (0.35 * sq[i] + 0.6 * fr[i] * g[i]); }
    return a;
  } },
  // Pencil or grease pencil on paper: high hiss and graphite crackle. o.dur = the stroke.
  pencil: { level: MEDIUM, make: (r, { dur = 0.4 }) => {
    const n = Math.ceil(dur * SR), hiss = svf(svf(white(n, r), 'hp', 1800), 'bp', 5200, 0.5), cr = new Float64Array(n);
    for (let i = 0; i < n; i++) if (r() < 0.004) cr[i] = r() * 2 - 1;
    svf(cr, 'bp', 3500, 3);
    const a = buf(dur), ph = r() * TAU;
    for (let i = 0; i < n; i++) { const t = i / SR, e = Math.min(1, t / 0.015) * Math.min(1, (dur - t) / 0.03) * (0.7 + 0.3 * Math.sin(TAU * 3 * t + ph)); a[i] = e * (hiss[i] + 2.5 * cr[i]); }
    return a;
  } },
  // Small glass chime, two notes of the music's key (C6 then G6), with a room. One "aha" a video, not more.
  chime: { level: ACCENT, make: (r, { p }) => {
    const bell = (f) => tone(1.6, () => f * p, (t) => Math.min(1, t / 0.002) * Math.exp(-t * 2.6), [[1, 1, 0], [2.76, 0.45, 2], [5.4, 0.18, 5.5], [8.93, 0.1, 9.5]]);
    const a = mixInto(mixInto(buf(1.7), bell(1046.5)), bell(1568), 0.07, 0.8);
    return room(a, { size: 0.55, damp: 0.4, wet: 0.25 });
  } },
  // Keys on a keyboard: random gaps of 70 to 160 ms, each key a tick and a thock, a release, and a space bar now and then.
  typing: { level: MEDIUM, make: (r, { dur = 1.2 }) => {
    const a = buf(dur + 0.2); let k = 0;
    for (let t = 0.02; t < dur; t += 0.07 + 0.09 * r(), k++) {
      const space = k % 7 === 6, g = 0.6 + 0.4 * r(), fc = 2500 + 1500 * r(), body = space ? 140 : 260 + 180 * r();
      mixInto(a, burst(space ? 0.03 : 0.012, r, 'bp', fc, 1.2, (x) => g * Math.exp(-x * (space ? 250 : 500))), t);
      mixInto(a, tone(0.05, () => body, (x) => g * 0.5 * Math.exp(-x * 80)), t);
      mixInto(a, burst(0.008, r, 'bp', fc * 1.2, 1.5, (x) => 0.3 * g * Math.exp(-x * 600)), t + 0.05 + 0.03 * r());
    }
    return a;
  } },
};
function whoosh(r, { dur, peak, lo, hi, body = 0.6, dir = 1, p = 1 }) {
  const n = Math.ceil(dur * SR), e = new Float64Array(n);
  for (let i = 0; i < n; i++) { const u = i / n; e[i] = u < peak ? Math.sin((Math.PI / 2) * (u / peak)) ** 2.5 : Math.cos((Math.PI / 2) * ((u - peak) / (1 - peak))) ** 1.6; }
  const fc = (i) => p * lo * (hi / lo) ** (e[i] ** 0.8);
  const a = svf(white(n, r), 'bp', fc, 1.1), b = svf(white(n, r), 'lp', (i) => fc(i) * 0.35, 0.7), L = new Float64Array(n), R = new Float64Array(n);
  const fl = 14 + 6 * r(), ph = r() * TAU;
  for (let i = 0; i < n; i++) {
    const t = i / SR, v = e[i] * (1 + 0.12 * Math.sin(TAU * fl * t + ph)) * (a[i] + body * b[i]);
    const pan = dir * (-0.7 + 1.4 * smooth(i / n)), th = ((pan + 1) * Math.PI) / 4;
    L[i] = v * Math.cos(th); R[i] = v * Math.sin(th);
  }
  return { L, R };
}

// ---------- loudness ----------
// K-weighting (ITU-R BS.1770, 48 kHz), then the largest 400 ms mean square (EBU "momentary").
const KW = [[[1.53512485958697, -2.69169618940638, 1.19839281085285], [-1.69065929318241, 0.73248077421585]], [[1, -2, 1], [-1.99004745483398, 0.99007225036621]]];
function kweight(x) {
  const y = Float64Array.from(x);
  for (const [[b0, b1, b2], [a1, a2]] of KW) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const v = y[i], o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o; } }
  return y;
}
// win 0.4 = EBU momentary loudness. The kit uses win 0.1: the ear sums the loudness of a short
// sound over about 100 ms, so a 400 ms window reads a 60 ms click 6 dB too soft.
export function loudMax({ L, R }, win = 0.4) {
  const w = Math.round(win * SR), kl = kweight(L), kr = kweight(R), n = L.length + w; // pad, so a short sound is measured whole
  let s = 0, best = 0;
  const sq = (i) => (i < L.length ? kl[i] ** 2 + kr[i] ** 2 : 0);
  for (let i = 0; i < n; i++) { s += sq(i); if (i >= w) s -= sq(i - w); best = Math.max(best, s); }
  return -0.691 + 10 * Math.log10(best / w + 1e-20);
}
const peakOf = ({ L, R }) => { let pk = 1e-12; for (const c of [L, R]) for (const v of c) pk = Math.max(pk, Math.abs(v)); return pk; };
export const PEAK_CEILING = -9; // dBFS: no sound peaks above this, whatever its class and gain

// One sound, as stereo at its loudness class + gainDb. `seed` makes the variation.
export function makeSound(name, { seed = 1, gain = 0, pan = 0, pitch = 0, dur, vary = true, ...rest } = {}) {
  const def = KIT[name];
  if (!def) throw new Error(`no sound "${name}". Sounds: ${Object.keys(KIT).join(', ')}`);
  const r = rng(seed), v = (amt) => (vary ? (r() * 2 - 1) * amt : 0);
  const p = 2 ** ((pitch + v(0.5)) / 12); // +-0.5 semitone = +-3 %
  const o = { ...rest, p, ...(dur ? { dur: dur * (1 + v(0.04)) } : {}) };
  const g0 = v(1); // +-1 dB
  let s = def.make(r, o);
  if (!s.L) { const th = ((pan + 1) * Math.PI) / 4; s = { L: s.map((x) => x * Math.cos(th)), R: s.map((x) => x * Math.sin(th)) }; }
  for (const c of [s.L, s.R]) { const z = Math.min(240, c.length); for (let j = 1; j <= z; j++) c[c.length - j] *= (j - 1) / z; } // 5 ms end fade: no click
  let k = 10 ** ((def.level + gain + g0 - loudMax(s, 0.1)) / 20);
  k = Math.min(k, 10 ** (PEAK_CEILING / 20) / peakOf(s));
  for (const c of [s.L, s.R]) for (let i = 0; i < c.length; i++) c[i] *= k;
  return s;
}

// ---------- the SFX bus of a video ----------
// words: [{start, end}] in video seconds. A sound that starts while the voice speaks is
// duckDb softer, so it never covers a word; in a gap it plays at its full level.
export function sfxTrack(events, seconds, { words = [], volume = 1, duckDb = 3 } = {}) {
  const n = Math.ceil(seconds * SR), L = new Float64Array(n), R = new Float64Array(n);
  const speaking = (t) => words.some((w) => t + 0.1 > w.start && t < w.end);
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const seed = hash(`${e.sound}|${Math.round(e.t * 1000)}|${e.seed ?? 0}`);
    const s = makeSound(e.sound, { ...e, seed, gain: (e.gain || 0) - (speaking(e.t) ? duckDb : 0) });
    const a = Math.round(e.t * SR);
    for (let j = Math.max(0, -a); j < s.L.length && a + j < n; j++) { L[a + j] += volume * s.L[j]; R[a + j] += volume * s.R[j]; }
  }
  return { L, R };
}

// Warnings for a list of events: too many sounds, accents on words. `check` would print these.
const ACCENTS = Object.keys(KIT).filter((k) => KIT[k].level === ACCENT);
export function lint(events, words = []) {
  const out = [], ev = [...events].sort((a, b) => a.t - b.t);
  for (let i = 0; i < ev.length; i++) {
    const inWin = ev.filter((x) => x.t >= ev[i].t && x.t < ev[i].t + 2 && Math.abs(x.t - ev[i].t) > 0.03); // a layer (same time) counts once
    if (inWin.length > 3) { out.push(`${ev[i].t.toFixed(2)} s: ${inWin.length + 1} sounds in 2 s. Keep 1 sound a beat; mark only what changes the picture`); i += inWin.length; }
  }
  const acc = ev.filter((e) => ACCENTS.includes(e.sound));
  for (let i = 1; i < acc.length; i++) if (acc[i].t - acc[i - 1].t < 2 && acc[i].t - acc[i - 1].t > 0.03) out.push(`${acc[i].t.toFixed(2)} s: two accents (${acc[i - 1].sound}, ${acc[i].sound}) less than 2 s apart`);
  const chimes = ev.filter((e) => e.sound === 'chime').length;
  if (chimes > 2) out.push(`${chimes} chimes: keep the chime for 1 or 2 "aha" moments`);
  for (const e of acc) { const w = words.find((x) => e.t + 0.1 > x.start && e.t < x.end); if (w) out.push(`${e.t.toFixed(2)} s: ${e.sound} on the word "${w.text}" (it plays 3 dB softer). If the word matters, move the sound into the gap before it`); }
  return out;
}

export function writeWav(file, { L, R }) { // 48 kHz, stereo, 16 bit
  const n = L.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(L[i]), 44 + i * 4); b.writeInt16LE(q(R[i]), 46 + i * 4); }
  fs.writeFileSync(file, b);
}

// The words of a timeline (build/timeline.json), in video seconds.
export const timelineWords = (tl) => tl.scenes.flatMap((s) => (s.words || []).map((w) => ({ text: w.text, start: s.start + w.start, end: s.start + w.end })));

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'kit') {
    const out = a[0] || '.'; fs.mkdirSync(out, { recursive: true });
    for (const name of Object.keys(KIT)) {
      const one = makeSound(name, { seed: 1, vary: false });
      writeWav(path.join(out, `${name}.wav`), one);
      // The preview: the sound 3 times, with 3 seeds, 1 s apart (more for the long ones).
      const len = one.L.length / SR, gap = Math.max(1, len + 0.4);
      writeWav(path.join(out, `${name}-x3.wav`), sfxTrack([0, 1, 2].map((k) => ({ t: 0.2 + k * gap, sound: name, seed: k })), 0.4 + 3 * gap));
      console.log(`${name.padEnd(7)} ${len.toFixed(2)} s  peak ${(20 * Math.log10(peakOf(one))).toFixed(1)} dBFS  100 ms max ${loudMax(one, 0.1).toFixed(1)} LUFS  momentary (400 ms) max ${loudMax(one).toFixed(1)} LUFS`);
    }
  } else if (cmd === 'track') {
    const [evFile, secs, outFile, tlFile] = a, events = JSON.parse(fs.readFileSync(evFile, 'utf8'));
    const words = tlFile ? timelineWords(JSON.parse(fs.readFileSync(tlFile, 'utf8'))).filter((w) => w.start < +secs) : [];
    writeWav(outFile, sfxTrack(events, +secs, { words }));
    for (const w of lint(events, words)) console.log(`WARN ${w}`);
  } else console.log('usage: node sfx.mjs kit <out-dir> | track <events.json> <seconds> <out.wav> [timeline.json]');
}
