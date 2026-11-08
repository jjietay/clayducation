// Shared visual library: common parts for every style.
// Import in scenes.js:  import { C, K, BG, header, showHeader, label, lab, pin, ... } from '/_lib/classic/common.js';
// The engine globals (E, clamp, lerp, mix, rng, set, el, wobble, strokeVar, iso, isoBox, bayer,
// pixelText, typed, goo, W, H) are on window, so library modules use them directly.
// See styles/library/classic/README.md for the catalogue and styles/classic/png/library-*.png for pictures of every item.

// ---------- one colour, one meaning, in every part of every video ----------
// Robotics roles (ROS 2 series).
export const C = {
  robot: '#f2773a', robotDark: '#b8501c', robotLight: '#ffb48a', // the robot, base_link, its pose
  map: '#f2b632', mapInk: '#a86f00',                              // map frame, saved map, global costmap
  odom: '#2a9d8f', odomInk: '#1d6f65',                            // odom frame, EKF, odometry, local costmap
  corr: '#7b2cbf', corrInk: '#5a189a',                            // a correction (map -> odom)
  scan: '#e63973', scanInk: '#b0204f',                            // a sensor and its points
  imu: '#3a86ff', imuInk: '#1f5fcc',                              // the IMU, yaw
  path: '#1982c4', pathInk: '#11618f',                            // a planned path
  goal: '#38b764', goalInk: '#23804a',                            // a goal; also SUCCESS
  fail: '#d62828',                                                // FAILURE
  run: '#3a86ff',                                                 // RUNNING
  wall: '#4f5d75',                                                // walls, obstacles
  ink: '#2b2d42',                                                 // text and outlines on light backgrounds
  ghost: '#9aa0b4',                                               // greyed, before it matters
  paperInk: '#1c1c1c',
  light: '#e8e9f3',                                               // text on dark backgrounds
  // Networks (DDS and Foxglove video): the viewer's laptop, multicast, unicast, a WebSocket link.
  viewer: '#3a3f6b', viewerLight: '#dfe3f5',                      // the laptop that views the robot (the Mac)
  mcast: '#ffb000', mcastInk: '#a86f00',                          // multicast, discovery announcements
  ucast: '#3a86ff', ucastInk: '#1f5fcc',                          // unicast
  ws: '#7b2cbf', wsInk: '#5a189a', wsOnDark: '#b388ff',           // a bridge or WebSocket link
};
// Data and software roles (Zarr vs HDF5 video). Same hues as C where the meaning is close.
export const K = {
  file: '#2a9d8f', fileInk: '#1d6f65', fileLight: '#8fd3c8',      // one file (HDF5)
  folder: '#f2b632', folderInk: '#a86f00', folderLight: '#ffd97a', // a folder or a store (Zarr), the file around a chunk
  chunk: '#e63973', chunkInk: '#b0204f',                          // a chunk, a window, a sample, a record
  index: '#7b2cbf', indexInk: '#5a189a', indexOnDark: '#b388ff',  // an index, metadata, a header, a config
  source: '#f2773a', sourceInk: '#b8501c',                        // where data comes from (a drone, a sensor)
  worker: '#3a86ff', workerInk: '#1f5fcc',                        // a worker, a process, training, a GPU
  ok: '#2b8a3e', bad: '#c1121f', ink: '#2b2d42',
};

// One background per style. At most two dark parts in a video.
export const BG = {
  cream: '#fdf6ec',   // flat-vector
  paper: '#faf7f0',   // single-line, light Manim
  grey: '#eef2f3',    // isometric
  pink: '#f6e6e4',    // toy-3d
  offwhite: '#fffaf0',// line-boil
  card: '#efe7d6',    // paper-cutout
  swiss: '#f2f0eb',   // swiss-type
  data: '#f7f7f2',    // data-story
  navy: '#0d1b2a',    // shape-morph (dark)
  pixel: '#1a1c2c',   // pixel-art (dark)
};
export const FONT = { pjs: 'Plus Jakarta Sans', sg: 'Space Grotesk', hand: 'Patrick Hand', mono: 'JetBrains Mono' };

// ---------- text that names things ----------
// Kicker (small capitals, the part and a source) and a title of at most 8 words, top left.
export function header(s, { kicker, title, kColor = C.robotDark, color = C.ink, font = 'Plus Jakarta Sans', kFont, tSize = 60, tWeight = 700, x = 110 }) {
  const k = s.text(kicker, { x, y: 86, size: 30, font: kFont || font, weight: 700, color: kColor, anchor: 'tl' });
  k.style.letterSpacing = '0.06em';
  const t = title ? s.text(title, { x, y: 128, size: tSize, font, weight: tWeight, color, anchor: 'tl' }) : null;
  k.style.opacity = 0; if (t) t.style.opacity = 0;   // hidden until showHeader
  return { k, t };
}
// Wipe a text in from the left (k = 0..1).
export function wipeIn(node, k) {
  if (!node) return;
  k = clamp(k);
  node.style.clipPath = `inset(-20% ${100 - 100 * k}% -20% -4%)`;
  node.style.opacity = k > 0.001 ? 1 : 0;
}
// Both header lines: the kicker at t0, the title 0.25 s later; optional wipe-out at `out`.
export function showHeader(s, h, t0 = 0.15, out = null) {
  const o = out == null ? 1 : 1 - s.p(out, 0.3);
  wipeIn(h.k, s.p(t0, 0.5, E.out) * o);
  if (h.t) wipeIn(h.t, s.p(t0 + 0.25, 0.6, E.out) * o);
}
// A label of 1 to 4 words, hidden until lab() shows it.
export function label(s, str, { x, y, anchor = 'l', size = 40, font = 'Plus Jakarta Sans', weight = 600, color = C.ink, z = 3 }) {
  const n = s.text(str, { x, y, size, font, weight, color, anchor, z });
  n.style.opacity = 0;
  return n;
}
// At most one caption line at the bottom, above the subtitle band (bottom 140 px).
export function caption(s, str, { size = 36, font = 'Plus Jakarta Sans', weight = 500, color = C.ink, y = 872 } = {}) {
  const n = s.text(str, { x: 960, y, size, font, weight, color, anchor: 'c' });
  n.style.opacity = 0;
  return n;
}
// Wipe a label in at `cue` and (optionally) out at `out`. Returns the progress 0..1.
export function lab(s, n, cue, out = null, d = 0.45) {
  const k = s.p(cue, d, E.out) * (out == null ? 1 : 1 - s.p(out, 0.3));
  wipeIn(n, k);
  return k;
}
// Move an HTML element so its anchor sits at stage px xy (+ offset).
export function pin(n, xy, dx = 0, dy = 0) { if (!xy) return; n.style.left = `${xy[0] + dx}px`; n.style.top = `${xy[1] + dy}px`; }
// Hide many labels at once (call at the top of draw for parts that are not active).
export function hideAll(nodes) { for (const n of nodes) wipeIn(n, 0); }

// ---------- timing ----------
export const pop = (s, t0, d = 0.45) => s.p(t0, d, E.overshoot);                    // 0 before t0, overshoot to 1
export const bump = (t, t0, d = 0.25) => { const u = (t - t0) / d; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; };  // 0 -> 1 -> 0
export const blinkAt = (t, times) => Math.max(0, ...times.map((b) => bump(t, b, 0.18)));   // blink a face at fixed times
// A seeded shuffle of 0..n-1 (same in every frame and worker).
export function shuffled(n, seed) {
  const r = rng(seed), a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- canvas lines ----------
// A thin leader line from a label to the thing it names, drawn up to k, with a dot at the thing.
export function leader(c, x1, y1, x2, y2, k = 1, color = C.ink, w = 2) {
  k = clamp(k);
  if (k <= 0) return;
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(lerp(x1, x2, k), lerp(y1, y2, k)); c.stroke();
  if (k > 0.95) { c.beginPath(); c.arc(x2, y2, 5, 0, Math.PI * 2); c.fill(); }
  c.restore();
}
// Same as leader, with points as [x, y] pairs.
export const lead = (c, a, b, k = 1, color = C.ink, w = 2) => leader(c, a[0], a[1], b[0], b[1], k, color, w);
// Underline a label (anchor 'l' labels only), then a leader from the nearer end of the underline to `to`.
export function underLeader(c, n, to, k = 1, color = C.ink, w = 2) {
  k = clamp(k);
  if (k <= 0 || !n) return;
  const x = parseFloat(n.style.left), y = parseFloat(n.style.top), bw = n.offsetWidth, bh = n.offsetHeight;
  const uy = y + bh / 2 + 3;
  c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = w; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, uy); c.lineTo(x + bw * Math.min(1, k * 1.5), uy); c.stroke();
  const kl = clamp(k * 2 - 1);
  if (kl > 0) {
    const sx = Math.abs(to[0] - x) < Math.abs(to[0] - (x + bw)) ? x : x + bw;
    c.beginPath(); c.moveTo(sx, uy); c.lineTo(lerp(sx, to[0], kl), lerp(uy, to[1], kl)); c.stroke();
    if (kl > 0.95) { c.beginPath(); c.arc(to[0], to[1], 5, 0, Math.PI * 2); c.fill(); }
  }
  c.restore();
}
// An arrow from (x1, y1) to (x2, y2), drawn up to k.
export function arrow(c, x1, y1, x2, y2, { color = C.ink, w = 6, head = 22, k = 1, dash = null } = {}) {
  k = clamp(k);
  if (k <= 0.01) return;
  const x = lerp(x1, x2, k), y = lerp(y1, y2, k), a = Math.atan2(y - y1, x - x1);
  const len = Math.hypot(x - x1, y - y1), h = Math.min(head, len * 0.6);
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x - Math.cos(a) * h * 0.6, y - Math.sin(a) * h * 0.6); c.stroke();
  c.setLineDash([]);
  c.beginPath();
  c.moveTo(x, y);
  c.lineTo(x - Math.cos(a - 0.45) * h, y - Math.sin(a - 0.45) * h);
  c.lineTo(x - Math.cos(a + 0.45) * h, y - Math.sin(a + 0.45) * h);
  c.closePath(); c.fill();
  c.restore();
}
export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
}
// A green tick (ok) drawn up to k, bottom of the stem at (x, y).
export function tick(c, x, y, k = 1, { color = K.ok, w = 12, size = 1 } = {}) {
  k = clamp(k); if (k <= 0.01) return;
  c.save(); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x - 30 * size, y - 30 * size); c.lineTo(x, y); c.lineTo(x + 50 * size * k, y - 70 * size * k); c.stroke(); c.restore();
}

// ---------- faces ----------
// Two eyes with pupils, brows and a mouth, centred on (x, y), r = eye spacing.
// mood: 'calm' | 'happy' | 'worried' | 'surprised' | 'sad' | 'focus'. look = [-1..1, -1..1].
export function face(c, x, y, r = 22, { mood = 'calm', look = [0, 0], blink = 0, ink = C.ink, eyeFill = '#ffffff' } = {}) {
  const er = r * 0.42, pr = r * 0.2;
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (const sx of [-1, 1]) {
    const ex = x + sx * r, ey = y;
    const open = 1 - clamp(blink);
    c.fillStyle = eyeFill; c.strokeStyle = ink; c.lineWidth = Math.max(2, r * 0.12);
    c.beginPath(); c.ellipse(ex, ey, er, Math.max(1, er * open), 0, 0, Math.PI * 2); c.fill(); c.stroke();
    if (open > 0.3) {
      c.fillStyle = ink;
      c.beginPath(); c.arc(ex + look[0] * er * 0.45, ey + look[1] * er * 0.45, pr, 0, Math.PI * 2); c.fill();
    }
    const by = ey - er - r * 0.28;
    const tilt = { calm: 0, happy: -0.1, worried: 0.35, surprised: -0.05, sad: 0.3, focus: -0.35 }[mood] || 0;
    const lift = { surprised: -r * 0.25, worried: -r * 0.05 }[mood] || 0;
    c.lineWidth = Math.max(2, r * 0.13);
    c.beginPath();
    const inner = ex - sx * er, outer = ex + sx * er;
    c.moveTo(outer, by + lift + tilt * er * 0.6);
    c.lineTo(inner, by + lift - tilt * er * 0.6);
    c.stroke();
  }
  const my = y + r * 0.95, mw = r * 0.7;
  c.strokeStyle = ink; c.lineWidth = Math.max(2, r * 0.13);
  c.beginPath();
  if (mood === 'happy') { c.arc(x, my - r * 0.25, mw, 0.15 * Math.PI, 0.85 * Math.PI); }
  else if (mood === 'calm' || mood === 'focus') { c.arc(x, my - r * 0.45, mw * 0.7, 0.3 * Math.PI, 0.7 * Math.PI); }
  else if (mood === 'surprised') { c.ellipse(x, my, r * 0.2, r * 0.27, 0, 0, Math.PI * 2); }
  else if (mood === 'sad') { c.arc(x, my + r * 0.35, mw * 0.7, 1.25 * Math.PI, 1.75 * Math.PI); }
  else if (mood === 'worried') { c.moveTo(x - mw * 0.7, my); c.quadraticCurveTo(x - mw * 0.35, my - r * 0.18, x, my); c.quadraticCurveTo(x + mw * 0.35, my + r * 0.18, x + mw * 0.7, my); }
  c.stroke();
  c.restore();
}

// ---------- hand-over between parts ----------
// A full-frame cover in the next part's background. Show it in the last ~0.6 s of a part.
export function makeWipe(s, color, z = 50) {
  const d = el('div');
  d.style.cssText = `position:absolute;inset:0;background:${color};z-index:${z};clip-path:circle(0px at 50% 50%);pointer-events:none`;
  s.root.appendChild(d);
  return d;
}
// Circle wipe growing from (cx, cy).
export function showWipe(d, k, cx = 960, cy = 540) {
  k = clamp(k);
  d.style.clipPath = `circle(${(k * 2300).toFixed(1)}px at ${cx}px ${cy}px)`;
  d.style.display = k > 0 ? 'block' : 'none';
}
// Straight wipe from the left (swiss, pixel and paper parts).
export function showSlide(d, k) {
  k = clamp(k);
  d.style.clipPath = `inset(0 ${(100 - 100 * k).toFixed(2)}% 0 0)`;
  d.style.display = k > 0 ? 'block' : 'none';
}
// The hand-over at the end of a scene: circle from (cx, cy), or a slide.
export function endWipe(s, d, cx = 960, cy = 540, slide = false, dur = 0.6) {
  const k = s.p(s.dur - dur, dur, E.inOut);
  if (slide) showSlide(d, k); else showWipe(d, k, cx, cy);
}

// ---------- point lists and partial lines ----------
// A path through points (call fill() or stroke() after it).
export function polyPath(c, pts, close = false) { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); if (close) c.closePath(); }
// Stroke a polyline up to fraction u of its length. Returns the end point (the pen tip), or null.
export function drawTo(c, pts, u) { u = clamp(u); if (u <= 0) return null; const p = polySlice(pts, u * polyLength(pts)); polyPath(c, p); c.stroke(); return p.at(-1); }
// n + 1 points on a quadratic curve a -> b with control point m.
export function bez(a, m, b, n = 40) { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; out.push([v * v * a[0] + 2 * v * u * m[0] + u * u * b[0], v * v * a[1] + 2 * v * u * m[1] + u * u * b[1]]); } return out; }
// n + 1 points on a circular arc.
export function arcPts(cx, cy, r, a0 = 0, a1 = Math.PI * 2, n = 60) { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
