// Clayducation: one clay world, played by the scroll. DESIGN.md says what each chapter shows and why.
//
// Each <section class="ch"> is a chapter: a tall stretch of scroll with a pinned screen. While a screen is
// pinned, the scroll plays its chapter (t from 0 to 1). Between two screens, the next one pushes the old one
// up, and the camera flies from one set to the next while the mascot walks there (u from 0 to 1).
// The mascot is the one thing that stays: he comes out of the clay and goes through the whole pipeline.

import * as THREE from 'three';
import { createMascot, studio, CACHE } from './world/clay/mascot.js';
import { buildModel } from './world/clay/models.js';

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const inOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const back = (t) => { t = clamp(t); return 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2; };
const bump = (a, b, x) => sm(a, a + (b - a) * 0.3, x) * (1 - sm(b - (b - a) * 0.3, b, x));
const D = Math.PI / 180, PI2 = Math.PI / 2;
const $ = (s, el = document) => el.querySelector(s);
const now = () => performance.now();

// ---------- the chapters and the scroll ----------
const chs = [...document.querySelectorAll('.ch')];
for (const c of chs) c.style.background = c.dataset.bg;
let tops = [];
function measure() { tops = chs.map((c) => c.offsetTop); }
// { i, t, u }: chapter i is pinned at t, or (u > 0) chapter i + 1 is pushing it up.
function where() {
  const y = scrollY, vh = innerHeight;
  for (let i = 0; i < chs.length; i++) {
    const end = tops[i] + chs[i].offsetHeight - vh;
    if (y <= end || i === chs.length - 1) return { i, t: clamp((y - tops[i]) / Math.max(1, end - tops[i])), u: 0 };
    if (y < tops[i + 1]) return { i, t: 1, u: clamp((y - end) / vh) };
  }
}
// How far chapter j is: below 0 while it scrolls in, 0 to 1 while pinned.
const qOf = (s, j) => (s.i === j ? (s.u > 0 ? 1 : s.t) : s.i === j - 1 ? s.u - 1 : s.i > j ? 2 : -2);

// The one statement of each chapter: split into words that rise in, with the strike under the key word.
for (const say of document.querySelectorAll('.say')) {
  const walk = (n) => [...n.childNodes].forEach((c) => {
    if (c.nodeType === 3) { const f = document.createDocumentFragment(); c.textContent.split(/(\s+)/).forEach((p) => { if (!p) return; if (/^\s+$/.test(p)) f.append(p); else { const s = document.createElement('span'); s.className = 'w'; s.textContent = p; f.append(s); } }); c.replaceWith(f); }
    else if (c.nodeName === 'B') { const s = document.createElement('span'); s.className = 'w'; c.replaceWith(s); s.append(c); }
  });
  walk(say);
}
const born = now();
function words(s) {
  chs.forEach((c, j) => {
    const q = j === 0 ? Math.min(qOf(s, 0) + 1, (now() - born) / 1400) : qOf(s, j);
    c.querySelectorAll('.say .w').forEach((w, k) => w.style.setProperty('--in', still ? 1 : sm(-0.42 + k * 0.035, -0.18 + k * 0.035, q - (j === 0 ? 1 : 0))));
    const b = $('.say b', c); if (b) b.style.setProperty('--k', still ? 1 : sm(0.02, 0.14, q - (j === 0 ? 0.02 : 0)));
  });
}

// Chapter dots: one for each chapter, to jump there.
const dots = $('.dots');
chs.forEach((c, j) => {
  const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${c.dataset.name}</span>`; b.title = c.dataset.name;
  b.addEventListener('click', () => scrollTo({ top: tops[j] + (j ? 0.04 * (c.offsetHeight - innerHeight) : 0), behavior: still ? 'instant' : 'smooth' }));
  dots.append(b);
});

// ---------- sound: the engine's own music and sound effects, off until the visitor turns them on ----------
const snd = { on: false, music: null, voice: null };
const soundBtn = $('.sound');
soundBtn.addEventListener('click', () => {
  snd.on = !snd.on;
  soundBtn.textContent = snd.on ? 'Sound on' : 'Sound off'; soundBtn.setAttribute('aria-pressed', snd.on);
  if (!snd.music) { snd.music = new Audio('music/current-30s.flac'); snd.music.loop = true; snd.music.volume = 0.28; }
  if (snd.on) snd.music.play().catch(() => {}); else snd.music.pause();
});
const sfxCache = {};
function sfx(name, vol = 0.6) {
  if (!snd.on) return;
  const a = (sfxCache[name] ??= new Audio(`sfx/${name}.flac`)).cloneNode(); a.volume = vol; a.play().catch(() => {});
}
// A sound at the moment a value passes a mark, in either direction.
const marks = new Map();
function cross(key, value, mark, fn) {
  const last = marks.get(key); marks.set(key, value);
  if (last !== undefined && (last < mark) !== (value < mark)) fn(value > last);
}

// ---------- the pointer ----------
const ptr = { x: innerWidth / 2, y: innerHeight / 2, at: -1e9, nx: 0, ny: 0, mouse: false, down: null };
addEventListener('pointermove', (e) => {
  Object.assign(ptr, { x: e.clientX, y: e.clientY, at: now(), nx: e.clientX / innerWidth * 2 - 1, ny: e.clientY / innerHeight * 2 - 1, mouse: e.pointerType === 'mouse' });
  if (ptr.down) { view.drag = clamp(ptr.down.drag + (e.clientX - ptr.down.x) * 0.15, -50, 50); }
}, { passive: true });
const fresh = (ms = 2500) => ptr.mouse && now() - ptr.at < ms;

// ---------- the world ----------
const canvas = document.createElement('canvas'); canvas.className = 'world'; canvas.setAttribute('aria-hidden', 'true');
let R, scene, cam, H = null, put = null;   // put: adds to the group of the chapter that builds now
const view = { drag: 0 };
const ray = new THREE.Raycaster();
function rayAt(x = ptr.x, y = ptr.y) { ray.setFromCamera(new THREE.Vector2(x / innerWidth * 2 - 1, 1 - y / innerHeight * 2), cam); return ray; }
const toScreen = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight]; };
const clayMat = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, sheen: 0.3, sheenRoughness: 0.6, sheenColor: new THREE.Color('#ffe9d8'), specularIntensity: 0.3, ...o });

let shadowTex;
function shadow(w, d, x, z, a = 0.4) {
  shadowTex ??= (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), r = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    r.addColorStop(0, 'rgba(20,20,30,1)'); r.addColorStop(0.6, 'rgba(20,20,30,.4)'); r.addColorStop(1, 'rgba(20,20,30,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  })();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: a, depthWrite: false }));
  m.rotation.x = -PI2; m.position.set(x, 0.01, z); m.scale.set(w, d, 1); m.renderOrder = -1; put(m); return m;
}
function model(name, { x = 0, y = 0, z = 0, ry = 0, k = 1, floor = true } = {}) {
  const m = buildModel(THREE, name); m.root.position.set(x, y, z); m.root.rotation.y = ry; m.root.scale.setScalar(k); put(m.root);
  if (floor) { const b = new THREE.Box3().setFromObject(m.root), s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3()); m.shadow = shadow(s.x * 1.4, s.z * 1.6, c.x, c.z); }
  return m;
}
// A flat card that always shows a canvas: pages, word chips, film frames.
function card(w, h, draw, { px = 512 } = {}) {
  const c = document.createElement('canvas'); c.width = px; c.height = Math.round(px * h / w);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  m.redraw = (...a) => { draw(c.getContext('2d'), c.width, c.height, ...a); tex.needsUpdate = true; };
  m.redraw(); return m;
}
const round = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

// ---------- shapes, packed by engine/gallery-export.mjs ----------
const ROOT = new URL('world/', import.meta.url);
const saved = {}; CACHE.read = (k) => saved[k];
let index;
function unpack(blob, { v, t, lo, hi, at, n }) {
  const pos = new Float32Array(v * 3), nor = new Float32Array(v * 3), col = new Float32Array(v * 3), tri = new Uint32Array(t);
  const P = new Uint16Array(blob.slice(at, at + v * 6)), N = new Int8Array(blob, at + v * 6, v * 3), C = new Uint8Array(blob, at + v * 9, v * 3);
  for (let a = 0; a < 3; a++) {
    const span = Math.max(hi[a] - lo[a], 1e-9) / 65535; let q = 0;
    for (let i = 0; i < v; i++) { q = (q + P[a * v + i]) & 0xffff; pos[i * 3 + a] = lo[a] + q * span; nor[i * 3 + a] = N[a * v + i] / 127; col[i * 3 + a] = (C[a * v + i] / 255) ** 2.2; }
  }
  for (let i = 0; i < v * 3; i += 3) { const l = Math.hypot(nor[i], nor[i + 1], nor[i + 2]) || 1; nor[i] /= l; nor[i + 1] /= l; nor[i + 2] /= l; }
  const I = new Uint8Array(blob, at + v * 12, n);
  for (let i = 0, p = 0, last = 0; i < t; i++) { let z = 0, m = 1, b; do { b = I[p++]; z += (b & 127) * m; m *= 128; } while (b & 128); last += z % 2 ? -(z + 1) / 2 : z / 2; tri[i] = last; }
  return { pos, nor, col, tri };
}
async function load(name) {
  const g = index[name], r = await fetch(new URL(g.file, ROOT));
  const blob = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  for (const [k, p] of Object.entries(g.packed)) saved[k] = unpack(blob, p);
}

// ---------- the mascot: placed, posed, and looking at the pointer when he is free ----------
function place(x, z, face, o = {}) { H.place(x, z, { face, ...o }); }
function look(k) {
  if (!H || k <= 0.01) return;
  const head = H.headPivot, at = head.getWorldPosition(new THREE.Vector3()), d0 = rayAt().ray.direction.clone();
  const target = cam.position.clone().addScaledVector(d0, cam.position.distanceTo(at)), d = head.parent.worldToLocal(target).sub(head.position);
  head.rotation.y += clamp(Math.atan2(d.x, d.z), -0.6, 0.6) * k; head.rotation.x -= clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.35, 0.35) * k;
  const b = (now() / 1000) % 3.9; if (b < 0.16) H.blink(Math.sin(b / 0.16 * Math.PI));
}
let happyAt = -1e9;
const happy = () => clamp(1 - Math.abs((now() - happyAt) / 1000 - 0.9) / 0.9);

// ---------- the chapters' sets ----------
// Each: start / end [x, z, face] of the mascot, build(), act(t) (sets the scene and the mascot for t) and
// shot(t) -> { at: [x, y, z], dist, az, el, sx, sy }. sx, sy move the subject on the screen (a fraction of
// its width and height), so the set sits beside the chapter's words.
const C = [];

// 0. A lump of clay in a spotlight. It dents under the pointer; the scroll squashes and stretches it, and
// the mascot comes out of it.
C[0] = {
  start: [0, 0.6, 0], end: [0, 0.6, 0.35],
  build() {
    const g = new THREE.SphereGeometry(2, 128, 96);
    this.base = g.attributes.position.array.slice(); this.lump = new THREE.Mesh(g, clayMat('#c98f6b', { roughness: 0.66 }));
    this.lump.position.set(0, 2, 0.6); put(this.lump);
    this.sh = shadow(5.5, 4.5, 0, 0.6, 0.55);
    this.dent = { dir: new THREE.Vector3(0, 0, 1), k: 0 };
  },
  act(t) {
    const L = this.lump, born = H ? sm(0.55, 0.72, t) : 0, T = now() / 1000;
    // Squash, then stretch up, then give the mascot his shape.
    const sq = sm(0.05, 0.32, t) * (1 - sm(0.32, 0.45, t)), st = sm(0.36, 0.52, t) * (1 - born);
    const s = 1 - born;
    L.visible = s > 0.01;
    L.scale.set((1 + 0.3 * sq - 0.25 * st) * s, (1 - 0.32 * sq + 0.7 * st) * s, (1 + 0.3 * sq - 0.25 * st) * s);
    L.position.y = 2 * L.scale.y; L.rotation.y = t * 3;
    this.sh.scale.set(5.5 * L.scale.x + 3 * born, 4.5 * L.scale.z + 1.5 * born, 1);
    // The dent: the pointer's hit on the lump, which springs back when the pointer leaves.
    const hit = fresh(1200) && L.visible ? rayAt().intersectObject(L)[0] : null;
    if (hit) { this.dent.dir.copy(L.worldToLocal(hit.point.clone()).normalize()); }
    this.dent.k = lerp(this.dent.k, hit ? 1 : 0, hit ? 0.2 : 0.06);
    const p = L.geometry.attributes.position, b = this.base, dd = this.dent.dir, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.set(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]); const n = v.clone().normalize();
      const breathe = still ? 0 : 0.035 * Math.sin(n.x * 3 + T * 1.3) * Math.sin(n.y * 2.4 + T) + 0.02 * Math.sin(n.z * 5 - T * 0.7);
      const a = Math.acos(clamp(n.dot(dd), -1, 1)), dent = -0.42 * this.dent.k * Math.exp(-((a / 0.42) ** 2)) + 0.07 * this.dent.k * Math.exp(-(((a - 0.62) / 0.2) ** 2));
      v.multiplyScalar(1 + breathe + dent); p.setXYZ(i, v.x, v.y, v.z);
    }
    p.needsUpdate = true; L.geometry.computeVertexNormals();
    cross('pop', t, 0.62, (fw) => fw && sfx('pop', 0.7));
    if (!H) return;
    const s2 = back((t - 0.56) / 0.2);
    H.root.visible = s2 > 0.01;
    H.pose.rest();
    place(0, 0.6, lerp(0, 0.35, sm(0.85, 1, t)), { y: -6.82 * (1 - Math.max(s2, 0.01)) });
    H.root.scale.setScalar(Math.max(s2, 0.01));
    const wave = still ? 0 : bump(0.7, 0.98, t);
    if (wave) { H.blendPose('rest', 'wave', wave); H.arms[1].elbow.rotation.z += Math.sin(now() / 110) * 0.3 * wave; }
    H.blendExpression('surprised', 'smile', sm(0.68, 0.78, t));
    look(sm(0.75, 0.9, t) * (1 - wave));
  },
  shot(t) {
    const o = still ? 1 : sm(0.38, 0.62, t);
    return { at: [0, lerp(2, 4.3, o), 0.6], dist: lerp(13, 31, o), az: lerp(-12, -8, o) + 3 * ptr.nx, el: lerp(14, 8, o) - 2 * ptr.ny, sx: 0.16, sy: lerp(-0.04, 0.02, o) };
  },
};

// 1. One sentence: the prompt types itself, then its words fly into the book he holds.
const topicEl = $('.prompt .topic');
let topic = topicEl.textContent, edited = false;
topicEl.addEventListener('input', () => { edited = true; topic = topicEl.textContent.trim() || 'your topic'; film?.title.redraw(); });
const askEl = $('.prompt .ask'), fullAsk = askEl.textContent;
C[1] = {
  start: [20, -1.2, 0.15], end: [20, -1.2, 0.5],
  build() { this.book = model('book', { x: 20, y: 4.1, z: 0.1, k: 1.0, floor: false }); this.flies = []; },
  act(t) {
    // Typing: only the start of the prompt, and only if the visitor has not typed their own topic.
    const ty = still ? 1 : sm(0.03, 0.22, t), n = Math.round(ty * fullAsk.length);
    if (askEl.textContent.length !== n) askEl.textContent = fullAsk.slice(0, n);
    if (!edited) topicEl.style.opacity = sm(0.2, 0.26, t);
    cross('type', t, 0.04, (fw) => fw && sfx('typing', 0.4));
    $('.prompt').style.setProperty('--in', sm(-0.3, 0.02, qOf(state, 1)));
    // The flying words: copies of the prompt's words that travel into the book.
    const parts = (askEl.textContent + topicEl.textContent).split(/\s+/).filter(Boolean);
    if (this.flies.length !== parts.length || this.flies.some((f, i) => f.textContent !== parts[i])) {
      this.flies.forEach((f) => f.remove());
      this.flies = parts.map((p) => { const s = document.createElement('span'); s.className = 'fly'; s.textContent = p; document.body.append(s); return s; });
      this.from = null;
    }
    const prompt = $('.prompt').getBoundingClientRect();
    if (!this.from || this.from.top !== prompt.top) {
      // Where each word sits in the prompt, measured with a hidden copy of the prompt's text.
      const range = document.createRange(), ws = [];
      for (const node of [askEl, topicEl]) { const tn = node.firstChild; if (!tn) continue; for (const m of tn.textContent.matchAll(/\S+/g)) { range.setStart(tn, m.index); range.setEnd(tn, m.index + m[0].length); const r = range.getBoundingClientRect(); ws.push([r.left, r.top]); } }
      this.from = { top: prompt.top, ws };
    }
    const bp = toScreen(this.book.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
    const pinned = state.i === 1 && state.u === 0;
    this.flies.forEach((f, i) => {
      const k = inOut(sm(0.42 + i * 0.025, 0.62 + i * 0.025, t)), [x0, y0] = this.from.ws[i] || [bp[0], bp[1]];
      f.style.display = pinned && k > 0 && k < 1 ? 'block' : 'none';
      f.style.transform = `translate(${lerp(x0, bp[0], k)}px, ${lerp(y0, bp[1], k) - 60 * Math.sin(k * Math.PI)}px) scale(${1 - 0.7 * k}) rotate(${k * (i % 2 ? 30 : -30)}deg)`;
      f.style.opacity = 1 - sm(0.8, 1, k);
    });
    const gone = sm(0.42, 0.62 + parts.length * 0.025, t);
    $('.prompt').style.opacity = state.i === 1 ? 1 - 0.75 * gone : '';
    cross('fly', t, 0.45, (fw) => fw && sfx('swish', 0.5));
    // The book writes while the words arrive.
    this.book.setPose(still ? 0 : (0.5 - 0.5 * Math.cos(now() / 140)) * bump(0.5, 0.95, t));
    if (!H) return;
    H.pose.rest(); place(20, -1.2, lerp(0.15, 0.5, sm(0.9, 1, t)), { lean: 0.08 });
    const B = this.book.root.position, grip = 1 - sm(0.92, 1, t);
    this.book.root.visible = grip > 0.02 || t < 0.9;
    this.book.root.scale.setScalar(Math.max(0.01, sm(0, 0.08, t) * (1 - sm(0.9, 1, t))));
    H.hold(0, [B.x - 1.15, B.y + 0.25, B.z], grip); H.hold(1, [B.x + 1.15, B.y + 0.25, B.z], grip);
    H.blendExpression('neutral', 'thinking', sm(0.1, 0.3, t)); H.blendExpression('thinking', 'understanding', sm(0.7, 0.85, t));
  },
  shot(t) { return { at: [20.3, 4.4, -0.6], dist: 31, az: 10 + 3 * ptr.nx, el: 8 - 2 * ptr.ny, sx: 0.02, sy: -0.04 }; },
};

// 2. Three files fan out of his hands. The script agent strikes a wrong fact and writes the fix.
const FILES = [
  ['storyboard.md', ['## cancel  ·  sand', '', 'He holds the weight,', 'then lets go.', '', '[#beta]  a plum ring', '         round the hub', '[#sub]   M q̈ + β = M v + β', '[#cancel] β cancels,', '          then M'], 'mono'],
  ['script.md', ['## cancel', '', 'Now choose the torque as', 'τ equals M v, plus β.', '', 'The β part supplies the', 'inertia torque.', 'gravity and friction torques.', '', 'So with v equal to zero,', 'the link stays where it is.'], 'serif'],
  ['scenes.js', ["scene('cancel', {", '  bg: BG.sand,', '  async setup(s) {', "    s.j = await s.g.model('joint');", '    s.hero = await s.g.mascot();', '  },', '  draw(s) {', '    s.hero.hold(0, massAt(a));', "    s.e.draw(); s.g.render();", '  },', '});'], 'mono'],
];
C[2] = {
  start: [40, 1.4, 0.2], end: [40, 1.4, 0.2],
  build() {
    this.pages = FILES.map(([name, lines, kind], i) => {
      const m = card(3.5, 4.5, (g, w, h, k = 0) => {
        g.clearRect(0, 0, w, h); g.fillStyle = '#fbf7ef'; round(g, 0, 0, w, h, 26); g.fill();
        g.fillStyle = '#26262a'; g.font = `700 ${w * 0.05}px "JetBrains Mono"`; g.fillText(name, w * 0.08, h * 0.09);
        g.fillStyle = '#e4d3b7'; g.fillRect(w * 0.08, h * 0.115, w * 0.84, 3);
        lines.forEach((l, j) => {
          const y = h * 0.19 + j * h * 0.072;
          const fix = kind === 'serif' && j === 7, wrong = kind === 'serif' && j === 6;
          if (fix && k < 0.6) return;
          g.globalAlpha = fix ? sm(0.6, 0.9, k) : 1;
          g.fillStyle = fix ? '#2f7d45' : '#26262a';
          g.font = kind === 'serif' ? `${w * 0.064}px "Instrument Serif"` : `${w * 0.043}px "JetBrains Mono"`;
          g.fillText(l, w * 0.08, y);
          if (wrong && k > 0) { const tw = g.measureText(l).width; g.strokeStyle = '#d6336c'; g.lineWidth = w * 0.012; g.beginPath(); g.moveTo(w * 0.07, y - h * 0.018); g.lineTo(w * 0.07 + (tw + w * 0.02) * sm(0, 0.5, k), y - h * 0.018); g.stroke(); }
          g.globalAlpha = 1;
        });
        if (kind === 'serif' && k > 0.3) { g.globalAlpha = sm(0.3, 0.6, k); g.fillStyle = '#d6336c'; g.font = `700 ${w * 0.04}px "Plus Jakarta Sans"`; g.fillText('script agent: β gives gravity and friction', w * 0.08, h * 0.95); g.globalAlpha = 1; }
      }, { px: 640 });
      m.home = new THREE.Vector3(36.4 + i * 3.7, 5.2 + (i === 1 ? 0.5 : 0), -2.4 - (i === 1 ? 0.6 : 0)); m.ry = (1 - i) * 0.28; m.lift = 0;
      put(m); return m;
    });
    this.fix = -1;
  },
  act(t) {
    let hov = -1;
    if (fresh() && state.i === 2) { const h = rayAt().intersectObjects(this.pages)[0]; if (h) hov = this.pages.indexOf(h.object); }
    const hand = new THREE.Vector3(40.9, 4.4, 1.2);
    this.pages.forEach((m, i) => {
      const k = still ? 1 : back((t - 0.06 - i * 0.07) / 0.25);
      m.lift = lerp(m.lift, hov === i ? 1 : 0, 0.15);
      m.position.lerpVectors(hand, m.home, clamp(k)).add(new THREE.Vector3(0, 0.4 * m.lift, 1.8 * m.lift));
      m.scale.setScalar(Math.max(0.01, k) * (1 + 0.12 * m.lift));
      m.rotation.set(0, m.ry * (1 - m.lift) + (1 - clamp(k)) * 1.5, (1 - clamp(k)) * (i - 1) * 0.6);
      m.visible = k > 0.01;
    });
    cross('paper', t, 0.08, (fw) => fw && sfx('paper', 0.6));
    const fk = still ? 1 : sm(0.45, 0.8, t);
    if (Math.abs(fk - this.fix) > 0.004) { this.pages[1].redraw(fk); this.fix = fk; }
    cross('strike2', t, 0.47, (fw) => fw && sfx('marker', 0.6));
    if (!H) return;
    H.pose.rest(); place(40, 1.4, 0.2);
    H.blendPose('rest', 'point', bump(0.04, 0.3, t) * 0.8);
    H.blendExpression('neutral', 'thinking', sm(0.35, 0.45, t)); H.blendExpression('thinking', 'understanding', sm(0.75, 0.85, t));
    look(sm(0.85, 0.95, t) * 0.8);
  },
  shot(t) { return { at: [40.4, 4.8, -0.4], dist: 29, az: -3 + 4 * ptr.nx, el: 6 - 2 * ptr.ny, sx: 0.15, sy: 0.1 }; },
};

// 3. The voice: the real waveform of one sentence, and each word drops onto the timeline at its time.
// With the sound on, the pointer plays the word under it.
let VOICE;
const WX0 = 54, WX1 = 78, WZ = 1.2;
C[3] = {
  start: [WX0 - 1, -1.6, PI2], end: [WX1, -1.6, PI2],
  build() {
    const { wave, words } = VOICE, n = wave.length, dur = 6.48;
    this.dur = dur;
    const geo = new THREE.BoxGeometry(0.17, 1, 0.5); geo.translate(0, 0.5, 0);
    this.bars = new THREE.InstancedMesh(geo, clayMat('#ffffff', { roughness: 0.5 }), n);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    this.h = wave.map((a) => 0.12 + 3.4 * a);
    for (let i = 0; i < n; i++) { m.makeScale(1, this.h[i], 1).setPosition(WX0 + (i + 0.5) / n * (WX1 - WX0), 0, WZ); this.bars.setMatrixAt(i, m); this.bars.setColorAt(i, c.set('#3d3a44')); }
    put(this.bars); shadow(WX1 - WX0 + 3, 2.6, (WX0 + WX1) / 2, WZ, 0.3);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.2, 0.08), new THREE.MeshBasicMaterial({ color: '#d6336c' })); this.head.geometry.translate(0, 2.6, 0); put(this.head);
    this.chips = words.map((w, j) => {
      const m = card(Math.max(1.1, 0.34 * w.w.length + 0.5), 0.9, (g, W, H2) => {
        g.clearRect(0, 0, W, H2); g.fillStyle = '#fbf7ef'; round(g, 2, 2, W - 4, H2 - 4, H2 * 0.28); g.fill();
        g.fillStyle = '#26262a'; g.font = `800 ${H2 * 0.4}px "Plus Jakarta Sans"`; g.textAlign = 'center'; g.fillText(w.w, W / 2, H2 * 0.52);
        g.fillStyle = '#8e3f8f'; g.font = `600 ${H2 * 0.22}px "JetBrains Mono"`; g.fillText(`${w.a.toFixed(2)} s`, W / 2, H2 * 0.84);
      }, { px: 256 });
      m.x = WX0 + w.a / dur * (WX1 - WX0) + m.geometry.parameters.width / 2 - 0.1; m.y = 4.25 + (j % 3) * 1.0; put(m); return m;
    });
    this.heard = -1;
  },
  act(t) {
    const { words } = VOICE, n = this.h.length, T = clamp((t - 0.08) / 0.82) * this.dur, x = WX0 + T / this.dur * (WX1 - WX0);
    this.head.position.set(x, 0, WZ); this.head.visible = t > 0.05 && t < 0.97;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) this.bars.setColorAt(i, c.set((i + 0.5) / n * this.dur < T ? '#d6336c' : '#3d3a44'));
    this.bars.instanceColor.needsUpdate = true;
    // The pointer on the wave: the word under it lifts, and plays when the sound is on.
    let hov = -1;
    if (fresh() && state.i === 3) { const h = rayAt().intersectObject(this.bars)[0]; if (h) { const tt = (h.instanceId + 0.5) / n * this.dur; hov = words.findIndex((w) => tt >= w.a - 0.05 && tt <= w.b + 0.05); } }
    if (hov !== this.heard) { this.heard = hov; if (hov >= 0 && snd.on) { const w = words[hov], a = (snd.voice ??= new Audio('voice/sentence.m4a')); a.currentTime = w.a; a.play().catch(() => {}); clearTimeout(this.stop); this.stop = setTimeout(() => a.pause(), (w.b - w.a) * 1000 + 60); } }
    this.chips.forEach((m, j) => {
      const w = words[j], k = still ? 1 : back((T - w.a) / 0.35);
      m.visible = k > 0.01; m.scale.setScalar(Math.max(0.01, k) * (hov === j ? 1.25 : 1));
      m.position.set(m.x, m.y + 2.5 * (1 - clamp(k)) + (hov === j ? 0.3 : 0), WZ + 0.2);
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
    });
    cross('voice', t, 0.1, (fw) => { if (fw && snd.on) { const a = (snd.voice ??= new Audio('voice/sentence.m4a')); a.currentTime = 0; a.play().catch(() => {}); } });
    if (!H) return;
    H.pose.rest(); place(x - 0.8, -1.6, PI2 - 0.25);
    H.stride((x - WX0) * H.STEP * 0.8, t > 0.08 && t < 0.9 ? 0.45 : 0);
    H.blendExpression('neutral', 'smile', 0.6);
  },
  shot(t) { const x = lerp(WX0 + 5, WX1 - 5, sm(0.08, 0.9, t)); return { at: [x, 3.6, 0.6], dist: 27, az: -8 + 4 * ptr.nx, el: 8 - 2 * ptr.ny, sx: 0.1, sy: 0.15 }; },
};

// 4. Code draws every frame: he holds the link, β appears as a plum ring, he lets go and the link stays.
// The formula above does what the voice would say: β cancels on both sides, then M. Drag turns the camera.
const JX = 88, JK = 1.5, JL = 3.9, PY = 5.4, PZ = 0.93;
const eqnEl = $('.eqn');
C[4] = {
  start: [JX + 6, PZ, -PI2], end: [JX + 7.3, PZ, -0.6],
  build() {
    this.j = model('joint', { x: JX, k: JK });
    this.ringMat = new THREE.MeshStandardMaterial({ color: '#8e3f8f', roughness: 0.45 }); this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 10, 48, 0.01), this.ringMat);
    this.ring.position.set(JX, PY, PZ + 0.85); put(this.ring); this.arc = -1;
    const P = (cls, html) => `<span class="p ${cls}" style="max-width:4em">${html}</span>`;
    eqnEl.innerHTML = `<div class="row a">${P('', 'τ')}${P('', '=')}${P('M', 'M')}${P('v', 'v')}${P('b', '+&thinsp;β')}</div>`
      + `<div class="row b">${P('M s m1', 'M')}${P('v', 'q̈')}${P('b s b1', '+&thinsp;β')}${P('', '=')}${P('M s m2', 'M')}${P('v', 'v')}${P('b s b2', '+&thinsp;β')}</div>`;
    this.rows = [...eqnEl.querySelectorAll('.row')];
  },
  act(t) {
    const a0 = -5 * D, mx = JX + JL * Math.cos(a0), my = PY + JL * Math.sin(a0);
    this.j.groups.link.rotation.z = a0;
    // β: the ring grows round the hub while the voice would name it.
    const arc = sm(0.22, 0.36, t) * 5.3;
    if (Math.abs(arc - this.arc) > 0.01) { this.ring.geometry.dispose(); this.ring.geometry = new THREE.TorusGeometry(1.15, 0.13, 10, 48, Math.max(arc, 0.01)); this.ring.rotation.z = 2.3; this.arc = arc; }
    this.ring.visible = arc > 0.02;
    // The formula, pinned beside the set.
    const [A, B] = this.rows, inA = sm(0.12, 0.2, t) * (1 - sm(0.4, 0.46, t)), inB = sm(0.44, 0.52, t);
    A.style.opacity = inA; A.style.transform = `translate(-50%, ${(1 - sm(0.12, 0.2, t)) * -30}px)`;
    B.style.opacity = inB; B.style.transform = `translate(-50%, ${(1 - inB) * -30}px)`;
    const s1 = sm(0.56, 0.62, t), c1 = sm(0.63, 0.69, t), s2 = sm(0.7, 0.76, t), c2 = sm(0.77, 0.83, t);
    for (const p of B.querySelectorAll('.b1, .b2')) { p.style.setProperty('--s', s1); p.style.maxWidth = `${4 * (1 - c1)}em`; p.style.opacity = 1 - c1; }
    for (const p of B.querySelectorAll('.m1, .m2')) { p.style.setProperty('--s', s2); p.style.maxWidth = `${4 * (1 - c2)}em`; p.style.opacity = 1 - c2; }
    B.style.gap = `${0.18 * (1 - c2 * 0.3)}em`;
    cross('s1', t, 0.57, (fw) => fw && sfx('marker', 0.6)); cross('s2', t, 0.71, (fw) => fw && sfx('marker', 0.6)); cross('c2', t, 0.84, (fw) => fw && sfx('chime', 0.5));
    eqnEl.style.opacity = state.i === 4 ? 1 : 0;
    if (!H) return;
    // He walks in, holds the weight, lets go at 0.38, and steps back: the link stays, because β holds it.
    const grip = sm(0.06, 0.14, t) * (1 - sm(0.38, 0.44, t)), stand = mx + 2.15;
    H.pose.rest();
    if (t < 0.44) place(lerp(JX + 6, stand, sm(0, 0.08, t)), PZ, -PI2, { lean: 0.1 * grip });
    else { const k = sm(0.44, 0.56, t); place(lerp(stand, JX + 7.3, k), PZ, lerp(-PI2, -0.6, sm(0.5, 0.6, t))); H.stride((stand + 1.3 * k) * H.STEP * 1.5, bump(0.44, 0.56, t) * 0.5); }
    if (grip > 0) { H.hold(0, [mx + 0.28, my, PZ - 0.59], grip); H.hold(1, [mx + 0.28, my, PZ + 0.59], grip); }
    H.blendExpression('neutral', 'surprised', sm(0.46, 0.5, t)); H.blendExpression('surprised', 'understanding', sm(0.8, 0.86, t));
  },
  shot(t) { return { at: [JX + 3.4, 4.8, 0.5], dist: 29, az: -16 + view.drag + 3 * ptr.nx, el: 8 - 2 * ptr.ny, sx: 0.0, sy: 0.14 }; },
};

// 5. Nothing renders until the checks pass: hand 1 follows the pointer, and the hold checks of the clay kit
// run on every frame, with their real messages. Without a pointer, the scroll moves the hand onto the cart.
const KK = 2.4, CX = 112;
const msgEl = $('.msg'), ringEl = $('.ring');
C[5] = {
  start: [0, 0, -PI2], end: [0, 0, -PI2],
  build() {
    this.c = model('cart', { x: CX, k: KK });
    this.face = CX + (0.3 + 0.82) * KK + 0.04; this.start[0] = this.end[0] = this.face + 1.75;
    this.body = this.c.groups.body.userData.f; this.target = new THREE.Vector3(this.face + 1.1, 3.9, 0.62); this.ok = null;
  },
  act(t) {
    const F = this.face, mine = state.i === 5 && state.u === 0;
    let want;
    if (mine && fresh(4000)) { const hit = rayAt().ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.62), new THREE.Vector3()); if (hit) want = new THREE.Vector3(clamp(hit.x, F - 0.05, F + 3.2), clamp(hit.y, 0.6, 6.4), 0.62); }
    const on = sm(0.3, 0.55, t);
    want ??= new THREE.Vector3(lerp(F + 1.1, F + 0.02, on), lerp(3.9, 2.6, on), 0.62);
    this.target.lerp(want, still ? 1 : 0.25);
    if (!H) return;
    H.pose.rest(); place(F + 1.75, 0, -PI2, { lean: 0.1 });
    H.hold(0, [F + 0.02, 2.6, -0.62], 1); H.hold(1, this.target.toArray(), 1);
    // The checks, as in styles/library/clay.js: out of reach, holds nothing, or does not touch.
    const reach = (H.grips || []).filter((g) => g.i === 1).reduce((a, g) => Math.max(a, g.gap), 0);
    const l = this.c.root.worldToLocal(this.target.clone()), gap = Math.max(0, this.body(l.x, l.y, l.z) * KK - 0.25);
    let text, ok = false;
    if (reach > 0.3) text = `hand 1 misses what it holds, by ${reach.toFixed(1)}`;
    else if (gap > 0.8) text = 'hand 1 holds nothing';
    else if (gap > 0.04) text = `hand 1 does not touch the cart body that it holds (gap ${gap.toFixed(2)})`;
    else { text = 'no faults: both hands touch the cart'; ok = true; }
    if (msgEl.textContent !== text) msgEl.textContent = text;
    if (ok !== this.ok) { if (this.ok === false && ok) sfx('chime', 0.55); else if (this.ok && !ok) sfx('thud', 0.5); this.ok = ok; msgEl.classList.toggle('ok', ok); ringEl.classList.toggle('ok', ok); }
    const [sx, sy] = toScreen(this.target);
    ringEl.style.transform = `translate(${sx}px, ${sy}px)`; msgEl.style.transform = `translate(${Math.min(sx + 50, innerWidth - msgEl.offsetWidth - 20)}px, ${sy - 90}px)`;
    const vis = state.i === 5 ? 1 : 0; ringEl.style.opacity = vis; msgEl.style.opacity = vis;
    H.blendExpression('neutral', ok ? 'smile' : 'worried', 0.8);
  },
  shot(t) { return { at: [CX + 1.2, 3.8, 0], dist: 32, az: -20 + 4 * ptr.nx, el: 9 - 2 * ptr.ny, sx: 0.14, sy: 0.12 }; },
};

// 6. The result is a real MP4: a film strip rolls out of his hands, from the title card of the visitor's own
// topic to frames of six finished videos. A frame under the pointer plays its clip.
const CLIPS = ['bayes', 'ruler', 'knn', 'shadow', 'lever', 'servo'];
const FX = 140, FW = 7.2, FH = 4.05, GAP = 8.1;
let film = null;
C[6] = {
  start: [FX + 10.6, 1.4, -PI2 + 0.35], end: [FX + 10.6, 1.4, -0.3],
  build() {
    film = this;
    this.strip = new THREE.Group(); put(this.strip);
    const plateGeo = new THREE.BoxGeometry(GAP, FH + 1.1, 0.12), plateMat = clayMat('#1c1d24', { roughness: 0.5 });
    const holeGeo = new THREE.BoxGeometry(0.32, 0.22, 0.05), holeMat = new THREE.MeshStandardMaterial({ color: '#e9e4da', roughness: 0.7 });
    this.title = card(FW, FH, (g, w, h) => {
      g.fillStyle = '#e4d3b7'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#57534c'; g.font = `700 ${h * 0.065}px "Plus Jakarta Sans"`; g.fillText('CLAYDUCATION', w * 0.07, h * 0.18);
      g.fillStyle = '#26262a'; g.font = `800 ${h * 0.12}px "Plus Jakarta Sans"`;
      const t = topic.charAt(0).toUpperCase() + topic.slice(1), lines = [''];
      for (const wd of t.split(' ')) { const l = lines.at(-1) + (lines.at(-1) ? ' ' : '') + wd; if (g.measureText(l).width > w * 0.84 && lines.at(-1)) lines.push(wd); else lines[lines.length - 1] = l; }
      lines.slice(0, 3).forEach((l, i) => g.fillText(l, w * 0.07, h * (0.34 + i * 0.14)));
      g.fillStyle = '#d6336c'; g.fillRect(w * 0.07, h * 0.82, w * 0.22, h * 0.025);
    }, { px: 960 });
    const loader = new THREE.TextureLoader();
    const pics = [this.title, ...CLIPS.map((c) => {
      const tex = loader.load(`film/${c}.jpg`); tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(FW, FH), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); m.poster = tex; m.clip = c; return m;
    })];
    // Each frame is one cell of the strip: a dark plate with its sprocket holes, and the picture.
    this.cells = pics.map((pic, i) => {
      const cell = new THREE.Group(), holes = new THREE.InstancedMesh(holeGeo, holeMat, 16), m4 = new THREE.Matrix4();
      for (let k = 0; k < 8; k++) for (const [y, n] of [[-(FH / 2 + 0.33), 0], [FH / 2 + 0.33, 1]]) holes.setMatrixAt(k * 2 + n, m4.makeTranslation(-GAP / 2 + 0.35 + k * 0.7, y, 0));
      pic.position.z = 0.07; cell.add(new THREE.Mesh(plateGeo, plateMat), holes, pic); cell.pic = pic; cell.i = i;
      this.strip.add(cell); return cell;
    });
    this.frames = pics;
    this.strip.position.set(0, 4.6, 0);
    shadow(16, 3, FX, 0, 0.3);
    this.playing = null;
  },
  act(t) {
    // The strip comes out of his hands and rolls to the left, so each frame passes the middle in turn.
    const roll = (still ? 0.5 : sm(0.04, 0.92, t)) * GAP * (CLIPS.length + 0.4), out = FX + 8.8;
    this.cells.forEach((c) => {
      const x = out - GAP * 0.6 - c.i * GAP + roll, k = sm(out + 0.4, out - GAP * 0.7, x);
      c.position.set(x, 0, 0); c.scale.set(Math.max(0.01, k), Math.max(0.01, k), 1); c.visible = k > 0.01;
      c.rotation.y = (1 - k) * -0.8;
    });
    let hov = null;
    if (fresh() && state.i === 6) { const h = rayAt().intersectObjects(this.frames.slice(1))[0]; if (h) hov = h.object; }
    if (hov !== this.playing) {
      if (this.playing) { this.playing.material.map = this.playing.poster; this.playing.video.pause(); }
      if (hov) {
        hov.video ??= Object.assign(document.createElement('video'), { src: `film/${hov.clip}.mp4`, muted: true, loop: true, playsInline: true });
        hov.vtex ??= Object.assign(new THREE.VideoTexture(hov.video), { colorSpace: THREE.SRGBColorSpace });
        hov.material.map = hov.vtex; hov.video.play().catch(() => {});
      }
      this.playing = hov;
      this.frames.forEach((f) => { f.material.needsUpdate = true; });
    }
    this.frames.forEach((f) => { const k = f === hov ? 1.1 : 1; f.scale.lerp(new THREE.Vector3(k, k, 1), 0.2); });
    if (!H) return;
    H.pose.rest(); place(FX + 10.6, 1.4, lerp(-PI2 + 0.35, -0.3, sm(0.92, 1, t)));
    const g = 1 - sm(0.9, 0.97, t);
    H.hold(0, [out + 0.4, 3.0, 0.3], g); H.hold(1, [out + 0.4, 5.6, 0.3], g);
    H.blendExpression('neutral', 'smile', 0.7);
    look(sm(0.92, 1, t) * 0.8);
  },
  shot(t) { return { at: [FX + 3.5, 4.6, 0.5], dist: 30, az: -4 + 4 * ptr.nx, el: 4 - 2 * ptr.ny, sx: 0.0, sy: 0.14 }; },
};

// 7. Install it with one command: he points at the command; a copy makes him wave.
C[7] = {
  start: [166, 0, 0.9], end: [166, 0, 0.9],
  build() {},
  act(t) {
    if (!H) return;
    H.pose.rest(); place(166, 0, 0.9);
    const h = happy();
    if (h > 0) { H.blendPose('rest', 'wave', h); H.arms[1].elbow.rotation.z += Math.sin(now() / 110) * 0.3 * h; }
    else H.blendPose('rest', 'point', sm(0.08, 0.25, t));
    H.blendExpression('neutral', 'smile', Math.max(h, sm(0.1, 0.3, t) * 0.7));
    look(h ? 0 : 0.5);
  },
  shot(t) { return { at: [166.6, 4.4, 0], dist: 28, az: -6 + 4 * ptr.nx, el: 6 - 2 * ptr.ny, sx: -0.18, sy: 0.17 }; },
};
$('.copy').addEventListener('click', (e) => {
  navigator.clipboard?.writeText('npx clayducation').catch(() => {});
  e.currentTarget.textContent = 'Copied'; happyAt = now(); sfx('chime', 0.6);
  setTimeout(() => { e.currentTarget.textContent = 'Copy'; }, 1800);
});

// ---------- the camera: one shot for each chapter; between two, it rises and swings across ----------
function shotAt(s) {
  const a = C[s.i].shot(s.t);
  if (!s.u) return a;
  const b = C[s.i + 1].shot(0), u = inOut(s.u), lift = still ? 0 : Math.sin(Math.PI * s.u);
  const mid = (k) => lerp(a[k], b[k], u);
  return { at: a.at.map((v, i) => lerp(v, b.at[i], u)), dist: mid('dist') * (1 + 0.55 * lift), az: mid('az') - 28 * lift, el: mid('el') + 26 * lift, sx: mid('sx'), sy: mid('sy') };
}
function aim(v) {
  const W = innerWidth, Hh = innerHeight, aspect = W / Hh, narrow = aspect < 1;
  // A narrow screen: the subject goes below the words, and the camera steps back.
  const dist = v.dist * (narrow ? 1.25 / Math.max(aspect, 0.45) : 1), sx = narrow ? 0 : v.sx, sy = narrow ? 0.14 : v.sy;
  const A = v.az * D, E = v.el * D, T = new THREE.Vector3(...v.at);
  cam.aspect = aspect; cam.fov = 30;
  cam.position.set(T.x + dist * Math.sin(A) * Math.cos(E), T.y + dist * Math.sin(E), T.z + dist * Math.cos(A) * Math.cos(E));
  cam.lookAt(T);
  cam.setViewOffset(W, Hh, -sx * W, -sy * Hh, W, Hh);
  cam.updateProjectionMatrix();
}
// Between two chapters he walks from the end of one set to the start of the next.
function walkBetween(s) {
  if (!H) return;
  const a = C[s.i].end, b = C[s.i + 1].start, u = inOut(s.u), x = lerp(a[0], b[0], u), z = lerp(a[1], b[1], u);
  const head = Math.atan2(b[0] - a[0], b[1] - a[1]), face = lerp(lerp(a[2], head, sm(0, 0.15, s.u)), b[2], sm(0.85, 1, s.u));
  H.pose.rest(); place(x, z, face);
  H.stride(Math.hypot(x - a[0], z - a[1]) * H.STEP, 0.55 * bump(0, 1, s.u));
  H.blendExpression('neutral', 'smile', 0.5);
}

// ---------- the frame loop ----------
let state = { i: 0, t: 0, u: 0 }, built = false;
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  state = where();
  words(state);
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === (state.u > 0.5 ? state.i + 1 : state.i)));
  if (!built) return;
  cross(`u${state.i}`, state.u, 0.5, () => sfx('whoosh', 0.35));
  if (state.i !== 1) document.querySelectorAll('.fly').forEach((f) => { f.style.display = 'none'; });
  if (H) { H.root.visible = true; H.root.scale.setScalar(1); }
  // The sets of the chapter in view, and of the next one while it pushes in. The mascot belongs to the
  // pinned chapter, or walks between two chapters.
  for (let j = 0; j < C.length; j++) {
    const live = j === state.i || (state.u > 0 && j === state.i + 1);
    if (C[j].g) C[j].g.visible = live;
    if (!C[j].ready || !live) continue;
    const keep = H; if (!(state.u === 0 && j === state.i)) H = null;
    C[j].act(j === state.i ? state.t : 0);
    H = keep;
  }
  if (state.u > 0 && C[state.i + 1]?.ready) walkBetween(state);
  aim(shotAt(state));
  R.render(scene, cam);
}

async function boot() {
  measure(); addEventListener('resize', () => { measure(); R?.setSize(innerWidth, innerHeight, false); });
  document.fonts?.ready.then(measure);
  requestAnimationFrame(frame);
  try {
    if (!canvas.getContext('webgl2') || typeof DecompressionStream === 'undefined') throw new Error('no WebGL 2');
    R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    R.setClearColor(0, 0); R.setPixelRatio(Math.min(devicePixelRatio, 1.5)); R.setSize(innerWidth, innerHeight, false);
    R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NoToneMapping;
    scene = new THREE.Scene(); studio(THREE, R, scene);
    cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 800);
    document.body.prepend(canvas);
    addEventListener('pointerdown', (e) => { if (state.i === 4 && e.pointerType === 'mouse' && !e.target.closest('a, button, [contenteditable]')) ptr.down = { x: e.clientX, drag: view.drag }; });
    addEventListener('pointerup', () => { ptr.down = null; });
    addEventListener('click', (e) => { if (H && !e.target.closest('a, button, [contenteditable]') && rayAt(e.clientX, e.clientY).intersectObject(H.root, true).length) { happyAt = now(); sfx('pop', 0.5); } });
    await document.fonts?.ready;
    // The lump first: it needs no download.
    const group = (j) => { C[j].g = new THREE.Group(); scene.add(C[j].g); put = (...o) => C[j].g.add(...o); };
    group(0); C[0].build(); C[0].ready = true; built = true;
    [index, VOICE] = await Promise.all([fetch(new URL('index.json', ROOT)).then((r) => r.json()),
      Promise.all([fetch('voice/wave.json').then((r) => r.json()), fetch('voice/words.json').then((r) => r.json())]).then(([wave, words]) => ({ wave, words }))]);
    await load('mascot');
    const m = createMascot(THREE, {}); m.root.position.set(0, 6.82, 0.6); scene.add(m.root);
    put = (...o) => scene.add(...o); m.shadow = shadow(3.8, 2.4, 0, 0.6, 0.45); H = m;
    for (const name of ['book', 'joint', 'cart']) await load(name);
    for (let j = 1; j < C.length; j++) { group(j); C[j].build(); C[j].ready = true; }
    R.compile(scene, cam);
    document.documentElement.classList.add('ready');
  } catch (e) {
    console.error(e);
    document.documentElement.classList.add('no3d');
  }
}
boot();
