// Watercolour parts (style: styles/watercolour.md). Washes in 3 jittered passes that multiply; seeds fixed.
// import { WC, wcBlob, wcRect, wcWash, wcArrow } from '/_lib/watercolour.js';
export const WC = { paper: '#f4efe6', ink: '#2e2a26', blueW: '#7fa7c9', finger: '#8a98b5' };
// A wobbly ellipse outline (n points) and a wobbly rectangle outline, both seeded.
export function wcBlob(cx, cy, rx, ry, seed, n = 40) { const r = rng(seed), out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, j = 1 + (r() - 0.5) * 0.08; out.push([cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j]); } return out; }
export function wcRect(x, y, w, h, seed) { const r = rng(seed), out = []; const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4]; for (let i = 0; i < 8; i++) { const u = i / 8; out.push([lerp(a[0], b[0], u) + (r() - 0.5) * 4, lerp(a[1], b[1], u) + (r() - 0.5) * 4]); } } return out; }
// A wash of colour col over the outline pts, opacity a, painted in to k (three passes appear one after another).
export function wcWash(c, pts, col, a, seed, k = 1) { if (k <= 0) return; const r = rng(seed); c.save(); c.globalCompositeOperation = 'multiply';
  for (let pass = 0; pass < 3; pass++) { c.globalAlpha = a / 3 * clamp(k * 3 - pass); c.fillStyle = col; c.beginPath();
    pts.forEach((p, i) => { const q = [p[0] + (r() - 0.5) * 8, p[1] + (r() - 0.5) * 8]; i ? c.lineTo(...q) : c.moveTo(...q); }); c.closePath(); c.fill(); }
  c.globalAlpha = a * 0.5 * k; c.strokeStyle = col; c.lineWidth = 3; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.stroke(); c.restore(); }
// A brush arrow a -> b drawn to k (the head shows near the end).
export function wcArrow(c, a, b, col, w, k) { k = clamp(k); if (k <= 0) return; const e = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)], an = Math.atan2(b[1] - a[1], b[0] - a[0]);
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.globalCompositeOperation = 'multiply'; c.beginPath(); c.moveTo(...a); c.lineTo(...e); c.stroke();
  if (k > 0.9) { c.beginPath(); c.moveTo(e[0] + Math.cos(an) * w, e[1] + Math.sin(an) * w); c.lineTo(e[0] - Math.cos(an - 0.5) * w * 3.2, e[1] - Math.sin(an - 0.5) * w * 3.2); c.lineTo(e[0] - Math.cos(an + 0.5) * w * 3.2, e[1] - Math.sin(an + 0.5) * w * 3.2); c.closePath(); c.fill(); } c.restore(); }
