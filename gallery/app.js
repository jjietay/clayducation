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
    const cmd = $('.cmd', c); if (cmd) { const k = still ? 1 : sm(-0.2, 0.06, q); cmd.style.opacity = k; cmd.style.translate = `0 ${(1 - k) * 40}px`; }
  });
}

// Chapter dots: one for each chapter, to jump there.
const dots = $('.dots');
chs.forEach((c, j) => {
  const b = document.createElement('button'); b.type = 'button'; b.innerHTML = `<span>${c.dataset.name}</span>`; b.title = c.dataset.name;
  b.addEventListener('click', () => scrollTo({ top: tops[j] + (j ? 0.04 * (c.offsetHeight - innerHeight) : 0), behavior: still ? 'instant' : 'smooth' }));
  dots.append(b);
});

// ---------- the pointer ----------
const ptr = { x: innerWidth / 2, y: innerHeight / 2, at: -1e9, nx: 0, ny: 0, mouse: false, down: null, pressed: false };
addEventListener('pointermove', (e) => {
  Object.assign(ptr, { x: e.clientX, y: e.clientY, at: now(), nx: e.clientX / innerWidth * 2 - 1, ny: e.clientY / innerHeight * 2 - 1, mouse: e.pointerType === 'mouse' });
  if (ptr.down) { view.drag = clamp(ptr.down.drag + (e.clientX - ptr.down.x) * 0.15, -50, 50); }
}, { passive: true });
const fresh = (ms = 2500) => ptr.mouse && now() - ptr.at < ms;
// A damped copy of the pointer, so the camera drifts and the head turns without steps.
const pn = { x: 0, y: 0, sx: 0, sy: 0 };
let lastT = now(), dt = 1 / 60;
const damp = (a, b, rate) => a + (b - a) * (1 - Math.exp(-rate * dt));

// ---------- the world ----------
const canvas = document.createElement('canvas'); canvas.className = 'world'; canvas.setAttribute('aria-hidden', 'true');
let R, scene, cam, H = null, put = null, heroReady = false;   // put: adds to the group of the chapter that builds now
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
const gaze = { yaw: 0, pitch: 0, k: 0 };
function look(k) {
  if (!H) return;
  // Where the pointer is, as a turn of the head. The head follows it with a damped spring, never in steps.
  const head = H.headPivot, at = head.getWorldPosition(new THREE.Vector3());
  ray.setFromCamera(new THREE.Vector2(pn.sx, pn.sy), cam);
  const target = cam.position.clone().addScaledVector(ray.ray.direction, cam.position.distanceTo(at)), d = head.parent.worldToLocal(target).sub(head.position);
  gaze.yaw = damp(gaze.yaw, clamp(Math.atan2(d.x, d.z), -0.6, 0.6), 6); gaze.pitch = damp(gaze.pitch, clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.35, 0.35), 6);
  gaze.k = damp(gaze.k, k, 4);
  if (gaze.k <= 0.01) return;
  head.rotation.y += gaze.yaw * gaze.k; head.rotation.x -= gaze.pitch * gaze.k;
  const b = (now() / 1000) % 3.9; if (b < 0.16) H.blink(Math.sin(b / 0.16 * Math.PI));
}
let happyAt = -1e9;
const happy = () => clamp(1 - Math.abs((now() - happyAt) / 1000 - 0.9) / 0.9);

// ---------- the chapters' sets ----------
// Each: start / end [x, z, face] of the mascot, build(), act(t) (sets the scene and the mascot for t) and
// shot(t) -> { at: [x, y, z], dist, az, el, sx, sy }. sx, sy move the subject on the screen (a fraction of
// its width and height), so the set sits beside the chapter's words.
const C = [];

// 0. A lump of clay in a spotlight. It is not a perfect ball: it has a flat bottom, finger marks and uneven
// colour. The pointer presses it, and a press with the button down leaves a dent that stays, as in real
// clay. The scroll squashes and stretches it, and the mascot comes out of it in a burst of crumbs.
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d);
  return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v), lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.28 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.12;
// Fine surface marks, as a normal map: soft bumps and the ridges of a few fingerprints.
function clayNormals() {
  const W = 1024, Hh = 512, h = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) h[y * W + x] = fbm(x / 34, y / 34, 0.5) * 0.5 + fbm(x / 9, y / 9, 3.1) * 0.18;
  for (const [cx, cy, r] of [[300, 210, 70], [690, 300, 60], [520, 120, 52]]) for (let y = cy - r; y < cy + r; y++) for (let x = cx - r; x < cx + r; x++) {
    const d = Math.hypot((x - cx) / 1.3, y - cy); if (d < r) h[y * W + x] += Math.sin(d * 0.9) * 0.16 * (1 - d / r);
  }
  const c = document.createElement('canvas'); c.width = W; c.height = Hh; const g = c.getContext('2d'), img = g.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = h[y * W + (x + 1) % W] - h[y * W + (x + W - 1) % W], dy = h[Math.min(Hh - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x];
    const n = [-dx * 4, -dy * 4, 1], l = Math.hypot(...n), o = (y * W + x) * 4;
    img.data[o] = (n[0] / l * 0.5 + 0.5) * 255; img.data[o + 1] = (n[1] / l * 0.5 + 0.5) * 255; img.data[o + 2] = (n[2] / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}
const FLOOR = -1.8;   // the lump's flat bottom, in its own units
C[0] = {
  start: [0, 0.6, 0], end: [0, 0.6, 0.35],
  build() {
    const g = new THREE.SphereGeometry(2, 180, 130), P = g.attributes.position, n = P.count;
    this.base = P.array.slice();
    // The fixed shape of this lump: uneven, with three soft thumb marks.
    this.shape = new Float32Array(n); this.perm = new Float32Array(n); this.temp = new Float32Array(n);
    const thumbs = [[0.55, 0.35, 0.76], [-0.7, 0.1, 0.7], [0.1, 0.8, 0.5]].map((d) => new THREE.Vector3(...d).normalize());
    const col = new Float32Array(n * 3), base = new THREE.Color('#c98f6b'), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.fromArray(this.base, i * 3).normalize();
      let r = 1 + 0.085 * fbm(v.x * 1.2 + 3, v.y * 1.2, v.z * 1.2) + 0.03 * fbm(v.x * 3, v.y * 3 + 7, v.z * 3);
      for (const d of thumbs) { const a = v.angleTo(d); r -= 0.07 * Math.exp(-((a / 0.33) ** 2)); }
      this.shape[i] = r;
      const k = 0.93 + 0.1 * fbm(v.x * 2.5 + 11, v.y * 2.5, v.z * 2.5);
      col[i * 3] = base.r * k; col[i * 3 + 1] = base.g * k; col[i * 3 + 2] = base.b * k;
    }
    this.col0 = col.slice();
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // A UV sphere repeats its seam and pole points; their normals are averaged, or the seam shows as a line.
    const key = new Map(); this.twins = [];
    for (let i = 0; i < n; i++) { const k = `${this.base[i * 3].toFixed(4)},${this.base[i * 3 + 1].toFixed(4)},${this.base[i * 3 + 2].toFixed(4)}`; if (key.has(k)) key.get(k).push(i); else key.set(k, [i]); }
    for (const list of key.values()) if (list.length > 1) this.twins.push(list);
    const nm = clayNormals();
    this.lump = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.74, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffd9bf'),
      specularIntensity: 0.25, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45) }));
    this.lump.position.set(0, 0, 0.6); put(this.lump);
    this.sh = shadow(5.5, 4.5, 0, 0.6, 0.55);
    // Crumbs: small bits of the lump that fly off when he comes out, and stay on the floor.
    const cg = new THREE.IcosahedronGeometry(0.2, 2), cm = this.lump.material.clone(); cm.vertexColors = false; cm.color = new THREE.Color('#c48a66'); cm.normalMap = null;
    this.crumbs = Array.from({ length: 26 }, (_, i) => {
      const m = new THREE.Mesh(cg, cm), a = hash3(i, 1, 2) * Math.PI * 2, s = 0.5 + hash3(i, 3, 4) * 0.9;
      m.dir = [Math.cos(a), Math.sin(a)]; m.reach = 1.8 + hash3(i, 5, 6) * 3.4; m.up = 3 + hash3(i, 7, 8) * 5; m.size = s; m.spin = hash3(i, 9, 1) * 6;
      m.scale.set(s, s * (0.6 + hash3(i, 2, 9) * 0.5), s); put(m); return m;
    });
    this.press = 0;
  },
  act(t) {
    const L = this.lump, born = heroReady ? sm(0.55, 0.7, t) : 0;
    // Squash, then stretch up, then give the mascot his shape.
    const sq = sm(0.05, 0.3, t) * (1 - sm(0.3, 0.42, t)), st = sm(0.34, 0.52, t), s = 1 - born;
    const jig = still ? 0 : Math.sin(t * 60) * 0.03 * bump(0.28, 0.48, t);
    L.visible = s > 0.01;
    L.scale.set((1 + 0.32 * sq - 0.22 * st + jig) * s, (1 - 0.34 * sq + 0.62 * st - jig) * s, (1 + 0.32 * sq - 0.22 * st + jig) * s);
    L.position.y = -FLOOR * L.scale.y + 0.03; L.rotation.y = t * 2.4 + 0.4;
    this.sh.scale.set(5.6 * L.scale.x + 2.5 * born, 4.6 * L.scale.z + 1.5 * born, 1);
    // The pointer: a soft press that springs back, and with the button down, a dent that stays.
    const hit = fresh(1500) && L.visible && state.i === 0 ? rayAt().intersectObject(L)[0] : null;
    const P = L.geometry.attributes.position, b = this.base, n = P.count, v = new THREE.Vector3();
    const dir = hit ? L.worldToLocal(hit.point.clone()).normalize() : null, hard = hit && ptr.pressed;
    let moved = false;
    for (let i = 0; i < n; i++) {
      v.fromArray(b, i * 3).normalize();
      let tp = this.temp[i] * (1 - Math.min(1, dt * 7));
      if (dir) { const a = v.angleTo(dir); if (a < 0.9) { const f = Math.exp(-((a / 0.36) ** 2)); tp = Math.max(tp, 0.16 * f); if (hard) this.perm[i] = Math.min(0.5, this.perm[i] + dt * 0.9 * f); } }
      if (Math.abs(tp - this.temp[i]) > 1e-5) moved = true;
      this.temp[i] = tp;
    }
    if (moved || hard || !this.done) {
      const col = L.geometry.attributes.color;
      for (let i = 0; i < n; i++) {
        v.fromArray(b, i * 3).normalize();
        const r = 2 * (this.shape[i] - this.perm[i] - this.temp[i]);
        let x = v.x * r, y = v.y * r, z = v.z * r;
        // The flat bottom: a soft floor, so the lump sits on the table and never cuts through its shadow.
        if (y < FLOOR + 0.5) y = FLOOR + Math.log1p(Math.exp((y - FLOOR) * 6)) / 6;
        P.setXYZ(i, x, y, z);
        const k = 1 - 0.5 * this.perm[i] - 0.25 * this.temp[i];
        col.setXYZ(i, this.col0[i * 3] * k, this.col0[i * 3 + 1] * k, this.col0[i * 3 + 2] * k);
      }
      P.needsUpdate = true; col.needsUpdate = true; L.geometry.computeVertexNormals();
      const N = L.geometry.attributes.normal, a = new THREE.Vector3();
      for (const list of this.twins) { a.set(0, 0, 0); for (const i of list) a.add(v.fromBufferAttribute(N, i)); a.normalize(); for (const i of list) N.setXYZ(i, a.x, a.y, a.z); }
      N.needsUpdate = true; this.done = true;
    }
    // The crumbs fly when he comes out, and stay on the floor.
    const ck = sm(0.6, 0.82, t);
    this.crumbs.forEach((m) => {
      m.visible = ck > 0.001;
      const h = 2.6 + m.up * ck - 9 * ck * ck;
      m.position.set(m.dir[0] * m.reach * ck, Math.max(0.12 * m.size, h), 0.6 + m.dir[1] * m.reach * ck * 0.7);
      m.rotation.set(m.spin * ck, m.spin * 1.3 * ck, 0);
    });
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
    return { at: [0, lerp(2, 4.3, o), 0.6], dist: lerp(13, 31, o), az: lerp(-12, -8, o) + 3 * pn.x, el: lerp(14, 8, o) - 2 * pn.y, sx: 0.16, sy: lerp(-0.04, 0.02, o) };
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
  shot(t) { return { at: [20.3, 4.4, -0.6], dist: 31, az: 10 + 3 * pn.x, el: 8 - 2 * pn.y, sx: 0.02, sy: -0.04 }; },
};

// 2. Three files fan out of his hands. The script agent strikes a wrong fact and writes the fix.
const FILES = [
  ['storyboard.md', ['## cancel  ·  sand', '', 'He holds the weight,', 'then lets go.', '', '[#beta]  a plum ring', '         round the hub', '[#sub]   M q̈ + β = M v + β', '[#cancel] β cancels,', '          then M'], 'mono'],
  ['script.md', ['## cancel', '', 'Now choose the torque as', 'τ equals M v, plus β.', '', 'The β part supplies the', 'inertia torque.', 'gravity and friction torques.', '', 'So with v equal to zero,', 'the link stays where it is.'], 'serif'],
  ['scenes.js', ["scene('cancel', {", '  bg: BG.sand,', '  async setup(s) {', "    s.j = await s.g.model('joint');", '    s.hero = await s.g.mascot();', '  },', '  draw(s) {', '    s.hero.hold(0, massAt(a));', "    s.e.draw(); s.g.render();", '  },', '});'], 'mono'],
];
C[2] = {
  start: [40, 1.4, 0.2], end: [40, 1.4, 0.2], via: [[47, 3]],
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
    const fk = still ? 1 : sm(0.45, 0.8, t);
    if (Math.abs(fk - this.fix) > 0.004) { this.pages[1].redraw(fk); this.fix = fk; }
    if (!H) return;
    H.pose.rest(); place(40, 1.4, 0.2);
    H.blendPose('rest', 'point', bump(0.04, 0.3, t) * 0.8);
    H.blendExpression('neutral', 'thinking', sm(0.35, 0.45, t)); H.blendExpression('thinking', 'understanding', sm(0.75, 0.85, t));
    look(sm(0.85, 0.95, t) * 0.8);
  },
  shot(t) { return { at: [40.4, 4.8, -0.4], dist: 29, az: -3 + 4 * pn.x, el: 6 - 2 * pn.y, sx: 0.15, sy: 0.1 }; },
};

// 3. The voice: the real waveform of one sentence, and each word drops onto the timeline at its time.
// With the sound on, the pointer plays the word under it.
let VOICE;
const WX0 = 54, WX1 = 78, WZ = 1.2;
C[3] = {
  start: [WX0 - 1, -2.6, PI2], end: [WX1, -2.6, PI2], via: [[81, -1], [84, 4.6], [96, 4]],
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
    // The pointer on the wave: the word under it lifts, and its bars light up.
    let hov = -1;
    if (fresh() && state.i === 3) { const h = rayAt().intersectObject(this.bars)[0]; if (h) { const tt = (h.instanceId + 0.5) / n * this.dur; hov = words.findIndex((w) => tt >= w.a - 0.05 && tt <= w.b + 0.05); } }
    for (let i = 0; i < n; i++) { const tt = (i + 0.5) / n * this.dur, w = words[hov]; this.bars.setColorAt(i, c.set(w && tt >= w.a && tt <= w.b ? '#2f7d45' : tt < T ? '#d6336c' : '#3d3a44')); }
    this.bars.instanceColor.needsUpdate = true;
    this.chips.forEach((m, j) => {
      const w = words[j], k = still ? 1 : back((T - w.a) / 0.35);
      m.visible = k > 0.01; m.scale.setScalar(Math.max(0.01, k) * (hov === j ? 1.25 : 1));
      m.position.set(m.x, m.y + 2.5 * (1 - clamp(k)) + (hov === j ? 0.3 : 0), WZ + 0.2);
      m.lookAt(cam.position.x, m.position.y, cam.position.z);
    });
    if (!H) return;
    H.pose.rest(); place(x - 0.8, -2.6, PI2 - 0.25);
    H.stride((x - WX0) * H.STEP * 0.8, t > 0.08 && t < 0.9 ? 0.45 : 0);
    H.blendExpression('neutral', 'smile', 0.6);
  },
  shot(t) { const x = lerp(WX0 + 5, WX1 - 5, sm(0.08, 0.9, t)); return { at: [x, 3.6, 0.6], dist: 27, az: -8 + 4 * pn.x, el: 8 - 2 * pn.y, sx: 0.1, sy: 0.15 }; },
};

// 4. Code draws every frame: he holds the link, β appears as a plum ring, he lets go and the link stays.
// The formula above does what the voice would say: β cancels on both sides, then M. Drag turns the camera.
const JX = 88, JK = 1.5, JL = 3.9, PY = 5.4, PZ = 0.93;
const eqnEl = $('.eqn');
C[4] = {
  start: [JX + 6, PZ, -PI2], end: [JX + 7.3, PZ, -0.6], via: [[100, 4.6], [118, 4.6]],
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
  shot(t) { return { at: [JX + 3.4, 4.8, 0.5], dist: 29, az: -16 + view.drag + 3 * pn.x, el: 8 - 2 * pn.y, sx: 0.0, sy: 0.14 }; },
};

// 5. Nothing renders until the checks pass: hand 1 follows the pointer, and the hold checks of the clay kit
// run on every frame, with their real messages. Without a pointer, the scroll moves the hand onto the cart.
const KK = 2.4, CX = 112;
const msgEl = $('.msg'), ringEl = $('.ring');
C[5] = {
  start: [0, 0, -PI2], end: [0, 0, -PI2], via: [[119, 4.6], [150, 4.6]],
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
    if (ok !== this.ok) { this.ok = ok; msgEl.classList.toggle('ok', ok); ringEl.classList.toggle('ok', ok); }
    const [sx, sy] = toScreen(this.target);
    ringEl.style.transform = `translate(${sx}px, ${sy}px)`; msgEl.style.transform = `translate(${Math.min(sx + 50, innerWidth - msgEl.offsetWidth - 20)}px, ${sy - 90}px)`;
    const vis = state.i === 5 ? 1 - sm(0, 0.15, state.u) : 0; ringEl.style.opacity = vis; msgEl.style.opacity = vis;
    H.blendExpression('neutral', ok ? 'smile' : 'worried', 0.8);
  },
  shot(t) { return { at: [CX + 1.2, 3.8, 0], dist: 32, az: -20 + 4 * pn.x, el: 9 - 2 * pn.y, sx: 0.14, sy: 0.12 }; },
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
    // The strip comes out of his hands and rolls to the left: the title card first, then each frame, past the middle.
    const roll = (still ? 0.5 : sm(0.04, 0.92, t)) * GAP * (CLIPS.length + 0.4), out = FX + 8.8;
    this.cells.forEach((c) => {
      const x = out - GAP * 0.6 - roll + c.i * GAP, k = sm(out + 0.4, out - GAP * 0.7, x);
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
  shot(t) { return { at: [FX + 3.5, 4.6, 0.5], dist: 30, az: -4 + 4 * pn.x, el: 4 - 2 * pn.y, sx: 0.0, sy: 0.14 }; },
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
  shot(t) { return { at: [166.6, 4.4, 0], dist: 28, az: -6 + 4 * pn.x, el: 6 - 2 * pn.y, sx: -0.18, sy: 0.17 }; },
};
$('.copy').addEventListener('click', (e) => {
  navigator.clipboard?.writeText('npx clayducation').catch(() => {});
  e.currentTarget.textContent = 'Copied'; happyAt = now();
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
// The route goes round the sets, through the points in "via" of the chapter that he leaves.
function walkBetween(s) {
  if (!H) return;
  const a = C[s.i].end, b = C[s.i + 1].start, pts = [a, ...(C[s.i].via || []), b];
  const seg = pts.slice(1).map((p, k) => Math.hypot(p[0] - pts[k][0], p[1] - pts[k][1])), total = seg.reduce((x, y) => x + y, 0);
  let d = inOut(s.u) * total, k = 0;
  while (k < seg.length - 1 && d > seg[k]) { d -= seg[k]; k++; }
  const f = seg[k] ? d / seg[k] : 0, p0 = pts[k], p1 = pts[k + 1], x = lerp(p0[0], p1[0], f), z = lerp(p0[1], p1[1], f);
  const head = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  let face = head;
  if (s.u < 0.12) face = lerp(a[2], head, sm(0, 0.12, s.u)); else if (s.u > 0.88) face = lerp(head, b[2], sm(0.88, 1, s.u));
  H.pose.rest(); place(x, z, face);
  H.stride(inOut(s.u) * total * H.STEP, 0.55 * bump(0, 1, s.u));
  H.blendExpression('neutral', 'smile', 0.5);
}

// ---------- the frame loop ----------
let state = { i: 0, t: 0, u: 0 }, built = false;
// The colour change: the next chapter's colour grows out of the mascot as a soft blob with a moving edge,
// so the world changes round him. Without the mascot it grows from the middle of the screen.
const bgEl = $('#bg'), wipeEl = $('#wipe');
function colours(s) {
  bgEl.style.background = chs[s.i].dataset.bg;
  if (!(s.u > 0) || !chs[s.i + 1]) { wipeEl.style.display = 'none'; return; }
  let cx = innerWidth / 2, cy = innerHeight / 2;
  if (H && cam) { const p = H.root.getWorldPosition(new THREE.Vector3()); [cx, cy] = toScreen(p); cx = clamp(cx, 0, innerWidth); cy = clamp(cy, 0, innerHeight); }
  const far = Math.hypot(Math.max(cx, innerWidth - cx), Math.max(cy, innerHeight - cy)) * 1.12, r = far * (still ? (s.u > 0.5 ? 1 : 0) : inOut(sm(0.08, 0.92, s.u)));
  const T = now() / 1000, pts = [];
  for (let k = 0; k < 72; k++) {
    const a = k / 72 * Math.PI * 2, w = 1 + 0.07 * Math.sin(3 * a + T * 1.7) + 0.045 * Math.sin(7 * a - T * 2.3) + 0.025 * Math.sin(13 * a + T);
    pts.push(`${(cx + Math.cos(a) * r * w).toFixed(1)}px ${(cy + Math.sin(a) * r * w).toFixed(1)}px`);
  }
  wipeEl.style.display = 'block'; wipeEl.style.background = chs[s.i + 1].dataset.bg; wipeEl.style.clipPath = `polygon(${pts.join(',')})`;
}
function frame() {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  const tNow = now(); dt = Math.min(0.1, (tNow - lastT) / 1000); lastT = tNow;
  pn.x = damp(pn.x, ptr.nx, 3); pn.y = damp(pn.y, ptr.ny, 3);
  pn.sx = damp(pn.sx, ptr.x / innerWidth * 2 - 1, 9); pn.sy = damp(pn.sy, 1 - ptr.y / innerHeight * 2, 9);
  state = where();
  words(state);
  [...dots.children].forEach((d, j) => d.classList.toggle('on', j === (state.u > 0.5 ? state.i + 1 : state.i)));
  if (!built) { colours(state); return; }
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
  colours(state);
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
    addEventListener('pointerdown', (e) => { if (!e.target.closest('a, button, [contenteditable]')) ptr.pressed = true; });
    addEventListener('pointerup', () => { ptr.down = null; ptr.pressed = false; });
    addEventListener('click', (e) => { if (H && !e.target.closest('a, button, [contenteditable]') && rayAt(e.clientX, e.clientY).intersectObject(H.root, true).length) { happyAt = now(); } });
    await document.fonts?.ready;
    // The lump first: it needs no download.
    const group = (j) => { C[j].g = new THREE.Group(); scene.add(C[j].g); put = (...o) => C[j].g.add(...o); };
    group(0); C[0].build(); C[0].ready = true; built = true;
    [index, VOICE] = await Promise.all([fetch(new URL('index.json', ROOT)).then((r) => r.json()),
      Promise.all([fetch('voice/wave.json').then((r) => r.json()), fetch('voice/words.json').then((r) => r.json())]).then(([wave, words]) => ({ wave, words }))]);
    await load('mascot');
    const m = createMascot(THREE, {}); m.root.position.set(0, 6.82, 0.6); scene.add(m.root);
    put = (...o) => scene.add(...o); m.shadow = shadow(3.8, 2.4, 0, 0.6, 0.45); H = m; heroReady = true;
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
