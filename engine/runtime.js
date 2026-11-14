// Page side of the Clayducation engine. It loads the project's scenes.js and
// gives you window.seek(T): the frame at time T, drawn only from T.
//
// Every picture must be a pure function of time. No CSS transitions, no
// requestAnimationFrame in scenes, no Math.random: the renderer jumps to any
// frame in any order and in several browsers at once, and each must agree.

const W = 1920, H = 1080;
const SAFE = { x: 96, y: 72, w: W - 192, h: H - 144 };
const stage = document.getElementById('stage');
const TL = window.TIMELINE;
const RENDER = new URLSearchParams(location.search).has('render');
window.__errors = [];
window.__cues = {};
window.__sfx = {};   // sound effects that scenes declare with s.sfx(); the render mixes them
const report = (msg) => { window.__errors.push(String(msg)); console.error(msg); };
window.addEventListener('error', (e) => report(e.message + (e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : '')));
window.addEventListener('unhandledrejection', (e) => report(e.reason?.stack || e.reason));

// ---------- maths and easing ----------
export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));

// cubic-bezier(x1, y1, x2, y2) exactly as CSS defines it, so a style's numbers
// can be copied straight from its rules.
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u) => ((ax * u + bx) * u + cx) * u;
  const dX = (u) => (3 * ax * u + 2 * bx) * u + cx;
  const Y = (u) => ((ay * u + by) * u + cy) * u;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let u = x;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - x, d = dX(u);
      if (Math.abs(e) < 1e-6) break;
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    // Newton can leave [0,1] on steep curves; bisection always lands.
    if (u < 0 || u > 1 || Math.abs(X(u) - x) > 1e-4) {
      let lo = 0, hi = 1; u = x;
      for (let i = 0; i < 30; i++) { if (X(u) < x) lo = u; else hi = u; u = (lo + hi) / 2; }
    }
    return Y(u);
  };
}

export const E = {
  linear: (x) => clamp(x),
  inOut: bezier(0.65, 0, 0.35, 1),
  out: bezier(0.16, 1, 0.3, 1),
  in: bezier(0.7, 0, 0.84, 0),
  snap: bezier(0.7, 0, 0.2, 1),
  overshoot: bezier(0.34, 1.56, 0.64, 1),
  // A drop that lands with weight and then settles `n` times, each smaller.
  settle: (x, n = 2, amp = 0.1) => {
    x = clamp(x);
    const fall = 0.42;
    if (x < fall) { const u = x / fall; return u * u; }
    const u = (x - fall) / (1 - fall);
    return 1 - amp * Math.abs(Math.sin(Math.PI * n * u)) * (1 - u) * (1 - u);
  },
};

// Seeded random, so a procedural shape is the same in every frame and worker.
export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Colours: mix('#ff0000', '#0000ff', 0.5).
const hex = (c) => { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function mix(a, b, t) {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], clamp(t))).toString(16).padStart(2, '0')).join('');
}

// ---------- point lists: morphs, line drawing, wobble ----------
const measure = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
measure.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
document.body.appendChild(measure);

// Points evenly spaced along an SVG path. Two shapes resampled to the same n
// can be morphed point by point with lerpPoints.
export function resample(d, n = 120) {
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', d);
  measure.appendChild(p);
  const L = p.getTotalLength(), out = [];
  for (let i = 0; i < n; i++) { const q = p.getPointAtLength((L * i) / n); out.push([q.x, q.y]); }
  p.remove();
  return out;
}
export const lerpPoints = (a, b, t) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]);
// Rotates a closed point list so index 0 is the point nearest `to`. Without it
// a morph between two closed shapes twists through itself.
export function align(points, to) {
  let best = 0, bd = Infinity;
  points.forEach((p, i) => { const d = (p[0] - to[0]) ** 2 + (p[1] - to[1]) ** 2; if (d < bd) { bd = d; best = i; } });
  return points.slice(best).concat(points.slice(0, best));
}
// A smooth SVG path through points (Catmull-Rom as cubic Beziers).
export function pathFrom(pts, closed = true) {
  const n = pts.length, P = (i) => pts[closed ? (i + n) % n : clamp(i, 0, n - 1)];
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
}
export function polyLength(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
// The first `len` pixels of a polyline, and the pen tip at its end.
export function polySlice(pts, len) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len <= seg) { const t = seg ? len / seg : 0; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); return out; }
    len -= seg; out.push(b);
  }
  return out;
}
// Hand-made jitter: the same seed gives the same wobble, so cycling 3 seeds boils.
export function wobble(pts, amp = 2, seed = 1) {
  const r = rng(seed);
  return pts.map(([x, y]) => [x + (r() - 0.5) * 2 * amp, y + (r() - 0.5) * 2 * amp]);
}
// A stroke whose width follows width(u), u from 0 to 1 along the line: ink, not a pen plotter.
export function strokeVar(ctx, pts, width = () => 4, color = '#1c1c1c') {
  ctx.save(); ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = 1; i < pts.length; i++) {
    ctx.lineWidth = width(i / (pts.length - 1));
    ctx.beginPath(); ctx.moveTo(...pts[i - 1]); ctx.lineTo(...pts[i]); ctx.stroke();
  }
  ctx.restore();
}

// ---------- isometric ----------
// World (x, y, z) in tiles to screen pixels, true isometric (30 degrees).
export function iso(x, y, z = 0, { tile = 48, ox = W / 2, oy = H / 2 } = {}) {
  const c = Math.cos(Math.PI / 6), s = 0.5;
  return [ox + (x - y) * tile * c, oy + (x + y) * tile * s - z * tile];
}
// A block with three flat tones: light top, mid left, dark right.
export function isoBox(ctx, { x, y, z = 0, w = 1, d = 1, h = 1, top, left, right, line = null, ...o }) {
  const P = (a, b, c) => iso(a, b, c, o);
  const face = (pts, fill) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (line) { ctx.strokeStyle = line; ctx.lineWidth = 2; ctx.stroke(); } };
  face([P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)], left);
  face([P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)], right);
  face([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], top);
}

// ---------- pixel art ----------
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// Ordered-dither threshold for pixel (x, y), from 0 to 1. Fill when value > bayer(x, y).
export const bayer = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// A 5x7 bitmap font, drawn with whole pixels so it stays crisp on a pixel canvas.
const GLYPHS = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000', '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00010 00100 00000 00100', ':': '00000 01100 01100 00000 01100 01100 00000',
  '-': '00000 00000 00000 11111 00000 00000 00000', "'": '00100 00100 01000 00000 00000 00000 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010', ')': '01000 00100 00010 00010 00010 00100 01000',
  '/': '00001 00010 00010 00100 01000 01000 10000', '+': '00000 00100 00100 11111 00100 00100 00000',
  '=': '00000 00000 11111 00000 11111 00000 00000', '>': '01000 00100 00010 00001 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '%': '11000 11001 00010 00100 01000 10011 00011',
  '#': '01010 01010 11111 01010 11111 01010 01010', '"': '01010 01010 00000 00000 00000 00000 00000',
};
// Draws text on a pixel canvas, 6 px per character, 8 px per line. Lower case shows as upper case.
export function pixelText(ctx, str, x, y, color = '#f4f4f4', scale = 1) {
  ctx.fillStyle = color;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    if (ch === '\n') { cx = x; y += 8 * scale; continue; }
    const g = (GLYPHS[ch] || GLYPHS['?']).split(' ');
    g.forEach((row, r) => { for (let c = 0; c < 5; c++) if (row[c] === '1') ctx.fillRect(cx + c * scale, y + r * scale, scale, scale); });
    cx += 6 * scale;
  }
  return cx;
}
// The part of `str` that has typed out by time t, at `cps` characters a second.
export const typed = (str, t, cps = 30) => str.slice(0, Math.max(0, Math.floor(t * cps)));

// ---------- SVG helpers ----------
const SVGNS = 'http://www.w3.org/2000/svg';
export function el(tag, attrs = {}, parent = null) {
  const isSvg = parent ? parent.namespaceURI === SVGNS : ['svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'defs', 'filter', 'clipPath', 'mask', 'tspan', 'linearGradient', 'radialGradient', 'stop', 'use', 'foreignObject'].includes(tag);
  const n = isSvg ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
    else n.setAttribute(k, v);
  }
  if (parent) parent.appendChild(n);
  return n;
}
// Metaball blending: shapes inside <g filter="url(#id)"> melt together where they meet.
export function goo(svg, id = 'goo', blur = 16) {
  const defs = svg.querySelector('defs') || el('defs', {}, svg);
  const f = el('filter', { id, x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: blur, result: 'b' }, f);
  el('feColorMatrix', { in: 'b', mode: 'matrix', values: '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10', result: 'g' }, f);
  el('feComposite', { in: 'SourceGraphic', in2: 'g', operator: 'atop' }, f);
  return `url(#${id})`;
}
// Moves an element by (x, y) px from where it was placed, and scales and turns
// it about its own centre. Works on HTML and SVG elements.
// An HTML element moves by whole pixels. At a fractional offset (a label that follows a 3D point), Chrome
// reused a raster that it made at another offset, so the label's edges depended on the frame drawn before
// and "make stable" failed (the strawberry video, 2026-11-10). SVG keeps fractional offsets.
export function set(n, { x = 0, y = 0, scale = 1, rot = 0, opacity } = {}) {
  const svg = n instanceof SVGElement;
  if (svg) { n.style.transformBox = 'fill-box'; n.style.transformOrigin = 'center'; }
  else { x = Math.round(x); y = Math.round(y); }
  if (!n.dataset.tr) n.dataset.tr = 'auto'; // "make review" follows everything that moves
  n.style.transform = `translate(${x}px,${y}px) rotate(${rot}deg) scale(${scale})`;
  if (opacity !== undefined) n.style.opacity = opacity;
  return n;
}

// A scene drawn by Manim (manim_scenes.py, rendered with "make manim"): shows
// its frames. extra.setup / extra.draw add HTML or SVG on top.
export function manim(extra = {}) {
  return {
    bg: extra.bg || '#000',
    // only a plain Manim scene shows exactly its Manim frames; verify compares those frame by frame
    manimOnly: !extra.setup && !extra.draw,
    // threeD: true marks a Manim scene whose picture is really 3D, for the rule in "make check".
    threeD: !!extra.threeD,
    isManim: true,
    async setup(s) {
      const r = await fetch(`/build/manim/${s.id}/info.json`);
      if (!r.ok) throw new Error(`scene ${s.id}: no Manim frames. Run "make manim".`);
      s.manim = await r.json();
      s.frame = el('img');
      s.frame.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:0`;
      s.root.appendChild(s.frame);
      await extra.setup?.(s);
    },
    async draw(s) {
      const i = Math.min(s.manim.frames - 1, Math.floor(s.t * s.manim.fps + 1e-6));
      const src = `/build/manim/${s.id}/f_${String(i + 1).padStart(5, '0')}.jpg`;
      // a failed decode must not stop the overlay draw below (it would keep an old overlay on screen)
      // The fast render (make.mjs) draws only the overlay here and puts Manim's own frame under it with ffmpeg.
      s.frame.style.visibility = window.__overlayOnly ? 'hidden' : '';
      if (!window.__overlayOnly && s.frame.getAttribute('src') !== src) { s.frame.src = src; try { await s.frame.decode(); } catch (e) { /* keep the old frame */ } }
      await extra.draw?.(s);
    },
  };
}

// ---------- scenes ----------
const defs = new Map();
window.manimOnly = () => [...defs].filter(([, d]) => d.manimOnly).map(([id]) => id);
window.manimScenes = () => [...defs].filter(([, d]) => d.isManim).map(([id]) => id);
// The overlay of the scene now, as a hash of its HTML (the Manim frame left out). Two frames with the same
// hash look the same, so the fast render screenshots the overlay only when the hash changes. A canvas has
// pixels that no HTML shows, so a scene with one gives null and renders the normal way.
window.__overlaySig = () => {
  if (!current) return null;
  let h = 0;
  for (const c of current.root.children) {
    if (c === current.frame) continue;
    if (c.tagName === 'CANVAS' || c.querySelector?.('canvas')) return null;
    const str = c.outerHTML + getComputedStyle(c).opacity;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return String(h);
};
// Transparent page, for the overlay screenshots of the fast render.
const bgSaved = [];
window.__overlayMode = (on) => {
  const els = [document.documentElement, document.body, stage, ...(current ? [current.root] : [])];
  if (on) { bgSaved.length = 0; for (const e of els) { bgSaved.push([e, e.style.background]); e.style.background = 'transparent'; } }
  else { for (const [e, b] of bgSaved) e.style.background = b; bgSaved.length = 0; }
};
window.scene = (id, def) => {
  if (typeof def === 'function') def = { draw: def };
  defs.set(id, def);
};

const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

class Scene {
  constructor(info, def) {
    Object.assign(this, { id: info.id, start: info.start, dur: info.dur, words: info.words || [], marks: info.marks || {}, attrs: info.attrs || {} });
    this.def = def;
    this.W = W; this.H = H; this.SAFE = SAFE; this._t = 0; this._T = 0; this._trace = {};
    // A scene that writes over one of these breaks silently: s.H = robot once sent every label off screen.
    for (const k of ['id', 'start', 'dur', 'words', 'marks', 'attrs', 'W', 'H', 'SAFE']) Object.defineProperty(this, k, { writable: false, configurable: false, value: this[k] });
    this.root = el('div', { class: 'scene', 'data-id': info.id });
    this.root.style.cssText = `position:absolute;inset:0;overflow:hidden;display:none;background:${def.bg || '#000'}`;
    stage.appendChild(this.root);
  }
  // Call it in draw while something cancels on screen, so the voice check can see it.
  cancelling(on = true) { if (on) this._cancelNow = true; }
  get t() { return this._t; }
  get T() { return this._T; }
  // A sound effect at a cue: s.sfx('stamp', '#slam'). Call it in setup, once for each sound.
  // at: seconds after the cue. x: the stage x of the thing, for the pan. Also gain (dB),
  // pitch (semitones), dur and peak. The kit is in engine/sfx.mjs; video.json turns it on.
  sfx(sound, cue, { at = 0, x, ...o } = {}) {
    const t = this.start + this.at(cue) + at, pan = x == null ? 0 : clamp((x - 960) / 1600, -0.6, 0.6);
    window.__sfx[`${this.id}|${sound}|${cue}|${at}`] = { t: +t.toFixed(4), sound, pan, ...o };
  }
  // Time (seconds into the scene) of a cue: '#marker' from script.md, or a
  // spoken word. at('vector', 2) is the second time "vector" is said.
  at(key, n = 1) {
    if (typeof key === 'number') return key;
    if (key.startsWith('#')) {
      const v = this.marks[key.slice(1)];
      if (v === undefined) throw new Error(`scene ${this.id}: no marker [${key}] in script.md. Markers: ${Object.keys(this.marks).join(', ') || 'none'}`);
      window.__cues[`${this.id}|${key}|1`] = v;
      return v;
    }
    const want = norm(key);
    let seen = 0;
    for (const w of this.words) if (norm(w.text) === want && ++seen === n) { window.__cues[`${this.id}|${key}|${n}`] = w.start; return w.start; }
    throw new Error(`scene ${this.id}: the narration does not say "${key}"${n > 1 ? ` ${n} times` : ''}`);
  }
  // Progress from 0 to 1 of something that starts at `from` (seconds or a cue) and lasts `dur`.
  p(from, dur = 0.6, ease = E.inOut) { return ease(clamp((this.t - this.at(from)) / dur)); }
  after(from) { return this.t >= this.at(from); }
  // Time quantised to `fps`, for stop motion (12) and animation on twos (12 at 24).
  tq(fps = 12) { return Math.floor(this.t * fps + 1e-6) / fps; }
  // Which of n jitter variants to draw now, cycling at `fps`.
  boil(n = 3, fps = 12) { return Math.floor(this.t * fps + 1e-6) % n; }
  // Tells "make review" where a thing is, so the physics check can follow it.
  // In setup: trace(element, 'name') names an HTML or SVG element.
  // In draw: trace('name', x, y, { r }) for things drawn on a canvas or in
  // Three.js (stage px; r = radius for the collision check).
  trace(what, x, y, extra = {}) {
    if (what instanceof Element) { what.dataset.tr = x || 'auto'; return what; }
    this._trace[what] = { x, y, ...extra };
  }
  // A canvas that fills the stage. pixel: draws at w x h and scales up without smoothing.
  canvas({ w = W, h = H, pixel = false, z = 0 } = {}) {
    const c = el('canvas', { width: w, height: h });
    c.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:${z};${pixel ? 'image-rendering:pixelated;' : ''}`;
    this.root.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = !pixel;
    return ctx;
  }
  svg({ z = 0 } = {}) {
    const s = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H });
    s.style.cssText = `position:absolute;left:0;top:0;z-index:${z};overflow:visible`;
    this.root.appendChild(s);
    return s;
  }
  // An HTML text box. anchor: 'tl' top-left, 'c' centre, 'tc' top-centre, 'l' left-middle.
  text(str, { x = W / 2, y = H / 2, size = 56, font = 'Inter', weight = 600, color = '#111', anchor = 'c', width, align, z = 2, html = false } = {}) {
    const d = el('div');
    const [ax, ay] = { tl: [0, 0], tc: [-50, 0], c: [-50, -50], l: [0, -50], r: [-100, -50], tr: [-100, 0], bc: [-50, -100] }[anchor];
    d.style.cssText = `position:absolute;left:${x}px;top:${y}px;translate:${ax}% ${ay}%;font:${weight} ${size}px/${1.2} '${font}';color:${color};z-index:${z};white-space:${width ? 'normal' : 'nowrap'};${width ? `width:${width}px;` : ''}text-align:${align || (anchor.includes('c') ? 'center' : 'left')}`;
    if (html) d.innerHTML = str; else d.textContent = str;
    d.dataset.text = '1';
    d.dataset.l0 = x; d.dataset.t0 = y;
    this.root.appendChild(d);
    return d;
  }
  // TeX typeset to SVG (in Node, by the engine). Wrap a term in \class{name}{...}
  // to colour it later with node.querySelectorAll('.name'). Await it in setup.
  async tex(src, { x = W / 2, y = H / 2, size = 64, color = '#111', anchor = 'c', display = true, z = 2 } = {}) {
    const r = await fetch(`/_tex?display=${display ? 1 : 0}&q=${encodeURIComponent(src)}`);
    if (!r.ok) throw new Error(`tex "${src}": ${await r.text()}`);
    const d = this.text('', { x, y, size, color, anchor, z, html: true });
    d.innerHTML = await r.text();
    d.dataset.text = '';
    d.dataset.tex = src;
    return d;
  }
  // Three.js in this scene. Returns { THREE, renderer, scene, camera }. Call
  // render() at the end of draw. ortho: true gives a true isometric camera.
  // The clay look: the mascot, the shared models and one soft studio (styles/clay.md).
  async clay(opts) { return (await import('/_lib/clay.js')).clay(this, opts); }
  async three({ ortho = false, view = 10, bg = null, z = 0 } = {}) {
    const THREE = await import('three');
    this.has3d = true;
    // Antialiasing on the GPU path drops whole objects at random. Twice the pixels make the edges smooth.
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, alpha: !bg });
    renderer.setPixelRatio(2);
    renderer.setSize(W, H, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:${z}`;
    this.root.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (bg) scene.background = new THREE.Color(bg);
    let camera;
    if (ortho) {
      const a = W / H;
      camera = new THREE.OrthographicCamera((-view * a) / 2, (view * a) / 2, view / 2, -view / 2, 0.1, 1000);
      camera.position.set(50, 50, 50); // equal x, y, z: true isometric
      camera.lookAt(0, 0, 0);
    } else {
      camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 500);
      camera.position.set(0, 4, 14);
      camera.lookAt(0, 0, 0);
    }
    const render = () => renderer.render(scene, camera);
    // Stage px of an object's centre, for trace().
    const screen = (obj) => { const v = obj.getWorldPosition(new THREE.Vector3()).project(camera); return [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
    return { THREE, renderer, scene, camera, render, screen };
  }
}

// ---------- the clock ----------
const list = [];
let current = null;
const ready = (async () => {
  await import('/scenes.js?v=' + Date.now());
  for (const info of TL.scenes) {
    const def = defs.get(info.id);
    if (!def) { report(`scenes.js has no scene('${info.id}', ...) for the "## ${info.id}" heading in script.md`); continue; }
    list.push(new Scene(info, def));
  }
  for (const id of defs.keys()) if (!TL.scenes.some((s) => s.id === id)) report(`scenes.js defines scene '${id}', but script.md has no "## ${id}"`);
  // Load every declared font face now. Canvas text does not ask for a font by itself,
  // so without this the first frames of a canvas scene draw in a serif fallback font.
  await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
  await document.fonts.ready;
})();

window.TOTAL = TL.duration;
window.FPS = TL.fps;
window.SCENES = TL.scenes.map((s) => ({ id: s.id, start: s.start, dur: s.dur, attrs: s.attrs || {}, marks: s.marks, words: s.words }));

window.seek = async function (T) {
  await ready;
  T = clamp(T, 0, TL.duration - 1e-6);
  const s = list.find((x) => T >= x.start - 1e-6 && T < x.start + x.dur - 1e-6) || list[list.length - 1];
  if (!s) return;
  if (current !== s) {
    if (current) current.root.style.display = 'none';
    s.root.style.display = 'block';
    current = s;
  }
  try {
    // Every seek waits for the one setup: a second seek that arrived while setup was
    // still loading used to draw a half-built scene (a Manim scene with no frame list).
    s.setupDone ??= Promise.resolve(s.def.setup?.(s));
    await s.setupDone;
    // A frame must come only from its time. Kits that keep state between frames (the mascot's walk
    // adds its swing to the arms) save it once after setup and put it back before every draw.
    if (!s._saved) { s._saved = true; for (const f of s._afterSetup || []) f(); }
    for (const f of s._beforeDraw || []) f();
    s._t = T - s.start;
    s._T = T;
    s._trace = {}; s._cancelNow = false;
    await s.def.draw?.(s);
    fitText(s);
  } catch (e) {
    report(`scene ${s.id} at ${(T - s.start).toFixed(2)} s: ${e.stack || e}`);
  }
};
// Auto-fit (the user asked for it on 2026-11-09): every text and formula stays inside the safe area.
// A text that is wider or taller than the safe area shrinks, then the whole is pushed back inside.
// The pieces of one eqn() row (same data-eqn) move and shrink together, so the row keeps its spacing.
// A node with data-fit="off" is left alone. Each fit is logged, and "make check" WARNs about it, so the
// author still moves the thing to a better place: auto-fit is a guard, not a layout.
const FIT_LOG = new Map();
function fitText(s) {
  const nodes = [...s.root.querySelectorAll('[data-text="1"], [data-tex]')].filter((n) => n.dataset.fit !== 'off' && n.dataset.l0 !== undefined);
  for (const n of nodes) { n.style.left = n.dataset.l0 + 'px'; n.style.top = n.dataset.t0 + 'px'; n.style.scale = ''; }
  const groups = new Map();
  for (const n of nodes) {
    if (n.closest('[data-tex]') !== n && n.dataset.text !== '1') continue;
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || +cs.opacity === 0) continue;
    const key = n.dataset.eqn || n;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  for (const [key, list] of groups) {
    const rs = list.map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0);
    if (!rs.length) continue;
    const L = Math.min(...rs.map((r) => r.left)), T = Math.min(...rs.map((r) => r.top)), R = Math.max(...rs.map((r) => r.right)), B = Math.max(...rs.map((r) => r.bottom));
    const k = Math.min(1, SAFE.w / (R - L), SAFE.h / (B - T));
    const cx = (L + R) / 2, cy = (T + B) / 2, w = (R - L) * k, h = (B - T) * k;
    const nx = clamp(cx, SAFE.x + w / 2, SAFE.x + SAFE.w - w / 2), ny = clamp(cy, SAFE.y + h / 2, SAFE.y + SAFE.h - h / 2);
    if (k > 0.999 && Math.abs(nx - cx) < 0.5 && Math.abs(ny - cy) < 0.5) continue;
    list.forEach((n, i) => {
      const r = rs[i] || n.getBoundingClientRect(), ncx = (r.left + r.right) / 2, ncy = (r.top + r.bottom) / 2;
      const dx = nx - cx + (ncx - cx) * (k - 1), dy = ny - cy + (ncy - cy) * (k - 1);
      n.style.left = (+n.dataset.l0 + dx) + 'px'; n.style.top = (+n.dataset.t0 + dy) + 'px';
      if (k < 0.999) n.style.scale = k;
    });
    const label = typeof key === 'string' ? `formula ${key}` : (list[0].dataset.tex || list[0].textContent).trim().slice(0, 40);
    const f = FIT_LOG.get(`${s.id}|${label}`) || { scene: s.id, label, from: s._t, to: s._t, k: 1, d: 0 };
    f.from = Math.min(f.from, s._t); f.to = Math.max(f.to, s._t); f.k = Math.min(f.k, k); f.d = Math.max(f.d, Math.hypot(nx - cx, ny - cy));
    FIT_LOG.set(`${s.id}|${label}`, f);
  }
}
window.__fits = () => [...FIT_LOG.values()];
// Alignment (the user asked, 2026-11-09: labels and formulas sat "all over the page", with no harmony).
// The visible text blocks of the frame: each eqn() row as one block, every other text and formula as one.
// Two blocks are near-aligned when a left, centre or right edge (x), or a top or middle (y), differ by
// 4 to 40 px: close enough to look meant, far enough to look wrong. Exact (under 4 px) or clearly apart
// (over 40 px) is fine. A text in flight (data-pass) is not judged.
window.__alignBlocks = () => {
  if (!current) return [];
  const groups = new Map();
  for (const n of current.root.querySelectorAll('[data-text="1"], [data-tex]')) {
    if (n.parentElement?.closest('[data-tex]') || n.dataset.pass === '1') continue;
    if (seenOpacity(n, current.root) < 0.5) continue;
    const r = n.getBoundingClientRect(); if (r.width < 2) continue;
    const key = n.dataset.eqn || n, g = groups.get(key);
    const label = (n.dataset.tex || n.textContent).trim().slice(0, 30);
    if (!g) groups.set(key, { label: n.dataset.eqn ? `formula "${label}…"` : `"${label}"`, l: r.left, t: r.top, r: r.right, b: r.bottom });
    else { g.l = Math.min(g.l, r.left); g.t = Math.min(g.t, r.top); g.r = Math.max(g.r, r.right); g.b = Math.max(g.b, r.bottom); }
  }
  return [...groups.values()];
};
// Lists (the user asked, 2026-11-14): 3 or more plain text lines stacked on one left edge (within 4 px, each gap
// under 40 px) are a list, and each line starts with a bullet "•" or a number ("1 ·", "2."). The head zone (kicker and
// title, top left above y 200) is not a list.
window.listIssues = () => {
  if (!current) return [];
  const T = [];
  for (const n of current.root.querySelectorAll('[data-text="1"]')) {
    if (n.dataset.pass === '1' || seenOpacity(n, current.root) < 0.5) continue;
    const r = n.getBoundingClientRect(), txt = n.textContent.trim();
    if (r.width < 2 || !txt || (r.top < 200 && r.left < 900)) continue;
    T.push({ l: r.left, r: r.right, c: (r.left + r.right) / 2, t: r.top, b: r.bottom, txt });
  }
  T.sort((a, b) => a.t - b.t);
  // A stack on one left, right or centre edge is a list (the recap of the agentic harness video, 2026-11-14,
  // stacked 4 right-aligned lines with no bullets, and a left-edge check missed it).
  const out = [], said = new Set();
  for (const k of ['l', 'r', 'c']) {
    const used = new Set();
    for (let i = 0; i < T.length; i++) {
      if (used.has(i)) continue;
      const col = [T[i]]; used.add(i);
      for (let j = i + 1; j < T.length; j++) {
        const last = col[col.length - 1];
        if (!used.has(j) && Math.abs(T[j][k] - T[i][k]) < 4 && T[j].t - last.b < 40 && T[j].t >= last.t) { col.push(T[j]); used.add(j); }
      }
      const bare = col.filter((x) => !/^(•|\d+\s*[·.)])/.test(x.txt));
      if (col.length >= 3 && bare.length && !said.has(bare[0].txt)) { said.add(bare[0].txt); out.push(`a list of ${col.length} lines with no bullet points ("${bare[0].txt.slice(0, 30)}"). Start each line with "• " (or "1 · " when the order matters)`); }
    }
  }
  return out;
};
window.alignIssues = () => {
  const B = window.__alignBlocks(), out = [];
  const near = (a, b) => { const d = Math.abs(a - b); return d >= 4 && d <= 40 ? Math.round(d) : 0; };
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    // Only blocks one above the other share a column, and only blocks side by side share a row.
    // Only neighbours are judged: a column within 250 px up or down, a row within 400 px across. A label on a
    // 3D object far from the title is not in the title's column.
    const gapY = Math.max(a.t, b.t) - Math.min(a.b, b.b), gapX = Math.max(a.l, b.l) - Math.min(a.r, b.r);
    const stacked = Math.min(a.r, b.r) - Math.max(a.l, b.l) > -60 && gapY < 250, sideBy = Math.min(a.b, b.b) - Math.max(a.t, b.t) > 0 && gapX < 400;
    if (stacked && !sideBy) {
      const exact = [Math.abs(a.l - b.l), Math.abs((a.l + a.r) / 2 - (b.l + b.r) / 2), Math.abs(a.r - b.r)].some((d) => d < 4);
      const d = Math.min(...[near(a.l, b.l), near((a.l + a.r) / 2, (b.l + b.r) / 2), near(a.r, b.r)].filter(Boolean));
      if (!exact && isFinite(d)) out.push({ a: a.label, b: b.label, axis: 'x', d });
    } else if (sideBy && !stacked) {
      const exact = [Math.abs(a.t - b.t), Math.abs((a.t + a.b) / 2 - (b.t + b.b) / 2)].some((d) => d < 4);
      const d = Math.min(...[near(a.t, b.t), near((a.t + a.b) / 2, (b.t + b.b) / 2)].filter(Boolean));
      if (!exact && isFinite(d)) out.push({ a: a.label, b: b.label, axis: 'y', d });
    }
  }
  return out;
};
// Screen boxes of the 3D things now (clay scenes only), for "make zones".
window.__zoneBoxes = () => current?._zoneBoxes?.() || null;

// What "make check" needs for the look rules. Each scene must have been drawn once before this.
window.__looks = () => list.map((s) => ({
  id: s.id, has3d: !!s.has3d || !!s.def.threeD, mascot: !!s.hasMascot, manim: !!s.manim, heroTravel: s._hero ? s._hero.travel || 0 : null,
  // A formula with nothing else in the picture: no 3D object and no drawing.
  texAlone: !!s.root.querySelector('[data-tex]') && !s.manim && (s.has3d ? s.clayCount === 0 : !s.root.querySelector('canvas, svg:not([data-tex] svg)')),
}));
window.sceneAt = (T) => (list.find((x) => T >= x.start - 1e-6 && T < x.start + x.dur - 1e-6) || list[list.length - 1])?.id;

// Two boxes overlap when they share more than OVERLAP_PX in both directions.
// A few pixels of touch is fine (descenders, tight rows); more covers letters.
const OVERLAP_PX = 6;
window.overlapOf = (a, b) => {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > OVERLAP_PX && h > OVERLAP_PX ? { w, h } : null;
};
// Layout problems the checker can find in HTML text: outside the safe area, too small
// to read, or on top of another text or formula.
window.layoutIssues = function () {
  const out = [];
  if (!current) return out;
  const shown = [];
  for (const n of current.root.querySelectorAll('[data-text="1"], [data-tex]')) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0 || !n.textContent.trim() && !n.dataset.tex) continue;
    let hidden = false;
    for (let p = n.parentElement; p && p !== current.root; p = p.parentElement) if (+getComputedStyle(p).opacity === 0) hidden = true;
    if (hidden) continue;
    const r = n.getBoundingClientRect();
    const label = (n.dataset.tex || n.textContent).trim().slice(0, 40);
    // A term in flight is judged when it lands.
    if (n.dataset.pass !== '1' && (r.left < SAFE.x - 1 || r.top < SAFE.y - 1 || r.right > SAFE.x + SAFE.w + 1 || r.bottom > SAFE.y + SAFE.h + 1))
      out.push(`"${label}" leaves the safe area (box ${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)})`);
    if (!n.dataset.tex && parseFloat(cs.fontSize) * (r.height / (n.offsetHeight || r.height)) < 28)
      out.push(`"${label}" is ${Math.round(parseFloat(cs.fontSize))} px; 28 px is the smallest readable size`);
    // Content text (labels, captions, notes) is 34 px or more: the user found 30 px labels too small in the JEV video
    // (2026-11-14). The kicker and the title, top left above y 200, keep their own sizes.
    else if (!n.dataset.tex && parseFloat(cs.fontSize) * (r.height / (n.offsetHeight || r.height)) < 33.5 && !(r.top < 200 && r.left < 900))
      out.push(`"${label}" is ${Math.round(parseFloat(cs.fontSize))} px; content text is 34 px or more`);
    if (seenOpacity(n, current.root) > 0.3) shown.push({ n, r, label });
  }
  for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
    const a = shown[i], b = shown[j];
    if (a.n.contains(b.n) || b.n.contains(a.n) || a.n.dataset.pass === '1' || b.n.dataset.pass === '1') continue;
    const o = overlapOf(a.r, b.r);
    if (o) out.push(`"${a.label}" overlaps "${b.label}" (${Math.round(o.w)} x ${Math.round(o.h)} px at ${Math.round(Math.max(a.r.left, b.r.left))},${Math.round(Math.max(a.r.top, b.r.top))})`);
  }
  return out;
};

// What "make review" records each frame: every text, formula and moved or traced
// element (centre, size, opacity as seen), and the trace() points.
const trKeys = new WeakMap();
let trCount = 0;
const trUsed = {};
const seenOpacity = (n, root) => {
  let o = 1;
  for (let p = n; p && p !== root.parentElement; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (cs.display === 'none' || cs.visibility === 'hidden') return 0;
    o *= +cs.opacity;
  }
  return o;
};
window.__traceFrame = function () {
  if (!current) return null;
  const items = [];
  for (const n of current.root.querySelectorAll('[data-text="1"], [data-tex], [data-tr]')) {
    if (!trKeys.has(n)) {
      const name = n.dataset.tr && n.dataset.tr !== 'auto' ? n.dataset.tr
        : n.dataset.tex ? `tex "${n.dataset.tex.slice(0, 30)}"`
        : n.dataset.text === '1' ? `text "${n.textContent.trim().slice(0, 30)}"`
        : `${n.tagName.toLowerCase()} ${++trCount}`;
      const used = (trUsed[current.id] ??= new Set());
      let k = name, i = 2;
      while (used.has(k)) k = `${name} (${i++})`;
      used.add(k);
      trKeys.set(n, k);
    }
    const r = n.getBoundingClientRect();
    const text = n.dataset.tex || (n.dataset.text === '1' ? n.textContent.trim() : '');
    items.push({ k: trKeys.get(n), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, o: seenOpacity(n, current.root), text, isText: !!text, pass: n.dataset.pass === '1', group: n.dataset.eqn || null });
  }
  for (const [k, v] of Object.entries(current._trace)) items.push({ k, ...v, o: v.o ?? 1, manual: true });
  return { scene: current.id, items, acting: !!current._cancelNow || !!current.root.querySelector('[data-acting="1"]'), cancelling: !!current._cancelNow || !!current.root.querySelector('[data-cancelling="1"]'), hits: current._collide?.(items) || [], moved: current._movers?.() || null };
};

// ---------- the ID pass: exact masks of what each thing paints ----------
// make.mjs shows a few things at a time on a key colour, captures the stage at full size and gives
// the capture back here; clay draws its own ID image of its models. Each mask is a quarter of the
// stage (480 x 270). From the masks: the gap between a text and each thing near it, text that lies
// on a drawing, a model that others hide, text contrast, and motion of drawings that no trace sees.
const IW = 480, IH = 270, IQ = 4;
let idLayers = [], idShots = [], idFrame = null, idHist = new Map();
const idCss = document.createElement('style');
idCss.textContent = '#stage.xv-id{background:#f0f!important}#stage.xv-id *{visibility:hidden!important}'
  + '#stage.xv-id [data-idshow],#stage.xv-id [data-idshow] *{visibility:visible!important}'
  + '#stage.xv-id [data-idshow]:not(canvas){opacity:1!important}'
  + '#stage.xv-id [data-idshow]:not(canvas),#stage.xv-id [data-idshow] *:not(canvas){color:#000!important;fill:#000!important;stroke:#000!important;text-shadow:none!important}';
document.head.appendChild(idCss);
const idCanvas = document.createElement('canvas'); idCanvas.width = IW; idCanvas.height = IH;
const idCtx = idCanvas.getContext('2d', { willReadFrequently: true });
const idDecode = async (url) => {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  idCtx.imageSmoothingEnabled = true; idCtx.imageSmoothingQuality = 'high';
  idCtx.clearRect(0, 0, IW, IH); idCtx.drawImage(bmp, 0, 0, IW, IH);
  return idCtx.getImageData(0, 0, IW, IH).data;
};
const qbox = (b) => [Math.max(0, Math.floor(b[0] / IQ) - 1), Math.max(0, Math.floor(b[1] / IQ) - 1), Math.min(IW - 1, Math.ceil(b[2] / IQ) + 1), Math.min(IH - 1, Math.ceil(b[3] / IQ) + 1)];
const meet = (a, b, pad) => a[0] - pad < b[2] && b[0] - pad < a[2] && a[1] - pad < b[3] && b[1] - pad < a[3];

window.__idReset = () => { idHist = new Map(); };
// Which things are on screen, and which of them can share one capture (their boxes do not meet).
window.__idPlan = function () {
  idLayers = []; idShots = []; idFrame = null;
  if (!current) return { shots: 0, text: false };
  const root = current.root;
  const add = (node, k, kind, color) => {
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || seenOpacity(node, root) <= 0.3) return;
    idLayers.push({ node, k, kind, color, eqn: node.dataset?.eqn, box: [r.left, r.top, r.right, r.bottom] });
  };
  for (const n of root.querySelectorAll('[data-text="1"], [data-tex], [data-tr]')) {
    if (n.dataset.pass === '1') continue;
    const kind = n.dataset.tex ? 'tex' : n.dataset.text === '1' ? 'text' : 'traced';
    add(n, trKeys.get(n) || (kind === 'tex' ? `tex "${n.dataset.tex.slice(0, 30)}"` : kind === 'text' ? `text "${n.textContent.trim().slice(0, 30)}"` : n.dataset.tr || n.tagName.toLowerCase()), kind, getComputedStyle(n).color);
  }
  let c = 0;
  for (const n of root.querySelectorAll('canvas, svg')) if (n.dataset.clay !== '1' && !n.closest('[data-text="1"], [data-tex], [data-tr]')) add(n, `drawing ${++c}`, 'drawing');
  for (const l of idLayers) {
    const shot = idShots.find((s) => s.every((o) => !meet(o.box, l.box, 3) && !o.node.contains(l.node) && !l.node.contains(o.node)));
    if (shot) shot.push(l); else idShots.push([l]);
  }
  return { shots: idShots.length, text: idLayers.some((l) => l.kind === 'text' || l.kind === 'tex') };
};
// Show only capture i on the key colour; -1 shows the frame as it is again.
window.__idShow = function (i) {
  for (const n of document.querySelectorAll('[data-idshow]')) n.removeAttribute('data-idshow');
  stage.classList.toggle('xv-id', i >= 0);
  if (i >= 0) for (const l of idShots[i]) l.node.setAttribute('data-idshow', '1');
};
// A capture of group i: a pixel is ink when it is far from the key colour. A canvas that paints its
// own background (paper, film) also leaves out its most common colour.
window.__idTake = async function (i, url) {
  const px = await idDecode(url), far = (o, r, g, b) => Math.max(Math.abs(px[o] - r), Math.abs(px[o + 1] - g), Math.abs(px[o + 2] - b)) > 48;
  for (const l of idShots[i]) {
    const [x0, y0, x1, y1] = l.q = qbox(l.box), m = new Uint8Array(IW * IH);
    let bg = null;
    if (l.kind === 'drawing') {
      const count = new Map(); let total = 0;
      for (let y = y0; y <= y1; y += 2) for (let x = x0; x <= x1; x += 2) { const o = (y * IW + x) * 4; const k = (px[o] >> 4) << 8 | (px[o + 1] >> 4) << 4 | (px[o + 2] >> 4); count.set(k, (count.get(k) || 0) + 1); total++; }
      let best = 0, key = 0; for (const [k, n] of count) if (n > best) { best = n; key = k; }
      const rgb = [((key >> 8) & 15) * 16 + 8, ((key >> 4) & 15) * 16 + 8, (key & 15) * 16 + 8];
      if (best > total * 0.35 && Math.max(Math.abs(rgb[0] - 255), rgb[1], Math.abs(rgb[2] - 255)) > 48) bg = rgb;
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = (y * IW + x) * 4;
      if (far(o, 255, 0, 255) && (!bg || far(o, bg[0], bg[1], bg[2]))) m[y * IW + x] = 1;
    }
    l.mask = m;
  }
};
window.__idFrame = async (url) => { idFrame = await idDecode(url); };
// Outlined boxes over the stage, for the "tightest gaps" sheet. null removes them.
window.__idMark = function (boxes) {
  for (const n of document.querySelectorAll('.xv-mark')) n.remove();
  for (const [x0, y0, x1, y1] of boxes || []) {
    const d = el('div', {}, stage); d.className = 'xv-mark';
    d.style.cssText = `position:absolute;left:${x0 - 4}px;top:${y0 - 4}px;width:${x1 - x0 + 8}px;height:${y1 - y0 + 8}px;border:3px solid #d6336c;border-radius:6px;z-index:99;pointer-events:none`;
  }
};
// Chamfer distance (3-4) from a mask, in thirds of a mask pixel.
const chamfer = (m) => {
  const d = new Uint16Array(IW * IH);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? 0 : 65000;
  for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
    const i = y * IW + x; let v = d[i];
    if (x > 0) v = Math.min(v, d[i - 1] + 3);
    if (y > 0) { v = Math.min(v, d[i - IW] + 3); if (x > 0) v = Math.min(v, d[i - IW - 1] + 4); if (x < IW - 1) v = Math.min(v, d[i - IW + 1] + 4); }
    d[i] = v;
  }
  for (let y = IH - 1; y >= 0; y--) for (let x = IW - 1; x >= 0; x--) {
    const i = y * IW + x; let v = d[i];
    if (x < IW - 1) v = Math.min(v, d[i + 1] + 3);
    if (y < IH - 1) { v = Math.min(v, d[i + IW] + 3); if (x < IW - 1) v = Math.min(v, d[i + IW + 1] + 4); if (x > 0) v = Math.min(v, d[i + IW - 1] + 4); }
    d[i] = v;
  }
  return d;
};
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
// All measures of this frame. Lengths come back in stage px.
window.__idMeasure = function () {
  const L = idLayers.filter((l) => l.mask), out = { warns: [], gaps: [], moved: [] };
  if (current?._idPass) {
    const r = current._idPass(IW, IH);
    r.names.forEach((k, i) => {
      const m = new Uint8Array(IW * IH); let x0 = IW, y0 = IH, x1 = 0, y1 = 0, n = 0, s = 0;
      for (let p = 0; p < m.length; p++) { if (r.visible[p] === i + 1) { m[p] = 1; n++; const x = p % IW, y = (p / IW) | 0; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (r.sil[i][p]) s++; }
      if (n) L.push({ k, kind: 'model', mask: m, q: [x0, y0, x1, y1], box: [x0 * IQ, y0 * IQ, (x1 + 1) * IQ, (y1 + 1) * IQ] });
      // A model that other models hide: less than half of its own outline shows.
      if (s >= 150 && n / s < 0.5) out.warns.push({ kind: 'hidden', a: k, v: Math.round(100 * (1 - n / s)) });
    });
  }
  const isText = (l) => l.kind === 'text' || l.kind === 'tex';
  const texts = L.filter(isText), ink = new Uint8Array(IW * IH);
  for (const l of texts) for (let p = 0; p < ink.length; p++) if (l.mask[p]) ink[p] = 1;
  for (const a of texts) {
    for (const b of L) {
      if (a === b || (isText(b) && L.indexOf(b) < L.indexOf(a)) || (a.node && b.node && (a.node.contains(b.node) || b.node.contains(a.node)))) continue;
      if (a.eqn && a.eqn === b.eqn) continue;   // the terms of one formula sit close on purpose
      if (!meet(a.q, b.q, 16)) continue;
      let over = 0;
      for (let y = a.q[1]; y <= a.q[3]; y++) for (let x = a.q[0]; x <= a.q[2]; x++) { const p = y * IW + x; if (a.mask[p] && b.mask[p]) over++; }
      // Text on a 3D model is clay's own check, and text on text is the box check: report text on a drawing.
      if (over >= 4) { if (b.kind === 'drawing' || b.kind === 'traced') out.warns.push({ kind: 'ink', a: a.k, b: b.k, v: over * IQ * IQ }); continue; }
      if (over) continue;
      const d = (b.dt ??= chamfer(b.mask)); let best = 65000;
      for (let y = a.q[1]; y <= a.q[3]; y++) for (let x = a.q[0]; x <= a.q[2]; x++) { const p = y * IW + x; if (a.mask[p] && d[p] < best) best = d[p]; }
      const gap = Math.round((best / 3 - 1) * IQ);
      if (gap <= 60) out.gaps.push({ a: a.k, b: b.k, v: Math.max(0, gap), boxes: [a.box, b.box] });
    }
    // Contrast of the text against the pixels just around it (not other text).
    if (idFrame && a.color) {
      const c = a.color.match(/[\d.]+/g)?.map(Number);
      const d = (a.dt ??= chamfer(a.mask)), ring = [];
      for (let y = a.q[1]; y <= a.q[3]; y++) for (let x = a.q[0]; x <= a.q[2]; x++) { const p = y * IW + x; if (d[p] >= 4 && d[p] <= 9 && !ink[p]) ring.push(lum(idFrame[p * 4], idFrame[p * 4 + 1], idFrame[p * 4 + 2])); }
      if (c && ring.length >= 20) {
        ring.sort((u, v) => u - v);
        const L1 = lum(c[0], c[1], c[2]), L2 = ring[ring.length >> 1], ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 3) out.warns.push({ kind: 'contrast', a: a.k, v: Math.round(ratio * 10) / 10 });
      }
    }
  }
  // Motion of things that no trace follows: a drawing or a traced element whose pixels changed since
  // two captures ago, in a patch thicker than one mask pixel (hand-drawn line boil is thinner).
  for (const l of L) {
    if (l.kind !== 'drawing' && l.kind !== 'traced') continue;
    const h = idHist.get(l.k) || [], old = h[0];
    if (old) {
      const x = new Uint8Array(IW * IH); for (let p = 0; p < x.length; p++) x[p] = l.mask[p] !== old[p] ? 1 : 0;
      let n = 0;
      for (let y = 1; y < IH - 1; y++) for (let xx = 1; xx < IW - 1; xx++) { const p = y * IW + xx; if (x[p] && x[p - 1] && x[p + 1] && x[p - IW] && x[p + IW]) n++; }
      if (n >= 8) out.moved.push(l.k);
    }
    h.push(l.mask); if (h.length > 2) h.shift(); idHist.set(l.k, h);
  }
  return out;
};

// ---------- preview in a normal browser ----------
if (!RENDER) {
  document.body.style.background = '#111';
  const fit = () => { const k = Math.min(innerWidth / W, (innerHeight - 40) / H); stage.style.transform = `scale(${k})`; stage.style.transformOrigin = '0 0'; };
  addEventListener('resize', fit); fit();
  const audio = new Audio('/build/narration.wav');
  const bar = el('div'); bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:40px;background:#222;color:#ddd;font:14px Inter;display:flex;align-items:center;gap:12px;padding:0 12px';
  bar.innerHTML = '<span id="pt"></span><input id="ps" type="range" min="0" step="0.01" style="flex:1"><span>space: play / pause, arrows: 5 s</span>';
  document.body.appendChild(bar);
  const ps = bar.querySelector('#ps'), pt = bar.querySelector('#pt');
  ps.max = TL.duration;
  ps.oninput = () => { audio.currentTime = +ps.value; };
  addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); audio.paused ? audio.play() : audio.pause(); }
    if (e.code === 'ArrowRight') audio.currentTime += 5;
    if (e.code === 'ArrowLeft') audio.currentTime -= 5;
  });
  const loop = async () => {
    const t = audio.currentTime;
    await window.seek(t);
    ps.value = t; pt.textContent = `${t.toFixed(1)} / ${TL.duration.toFixed(1)} s  ${window.sceneAt(t) || ''}`;
    requestAnimationFrame(loop);
  };
  loop();
}

// Scenes use these without importing anything.
Object.assign(window, { manim, E, clamp, lerp, invLerp, bezier, rng, mix, resample, lerpPoints, align, pathFrom, polyLength, polySlice, wobble, strokeVar, iso, isoBox, bayer, pixelText, typed, el, goo, set, W, H, SAFE });
