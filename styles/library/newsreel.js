// Newsreel parts (style: styles/newsreel.md). The gate, the film look and the grease pencil; f = frame index.
// import { NR, nHash, gate, filmLook, greasePencil, ringPts } from '/_lib/newsreel.js';
export const NR = { GX: 220, GW: 1480, GH: 1080, FPS: 30, paper: '#d9d3c6', ink: '#1c1a17', bar: '#8d877c' };
export const nHash = (n) => rng(Math.floor(n * 9973))();
// Black outside the 1.37:1 gate; clips the canvas to the gate (call inside c.save()).
export function gate(c) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.beginPath(); c.roundRect(NR.GX, 0, NR.GW, NR.GH, 26); c.clip(); }
// Warm silver, vignette, flicker, scratches and dust for frame f. Draw after the content, before the grease pencil.
export function filmLook(c, f) {
  const { GX, GW, GH, FPS } = NR, hash = nHash;
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#efe7d6'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'screen'; c.fillStyle = '#17140f'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(GX + GW / 2, GH / 2, GH * 0.42, GX + GW / 2, GH / 2, GH * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = g; c.fillRect(GX, 0, GW, GH);
  c.fillStyle = `rgba(0,0,0,${Math.max(0, 0.035 * (hash(f) - 0.5) * 2 + 0.03 * Math.sin(f / FPS * 6 * Math.PI))})`; c.fillRect(GX, 0, GW, GH);
  for (let k = 0; k < 3; k++) { const id = Math.floor((f + k * 5) / 9) * 7 + k; if (hash(id * 1.3) > 0.55) continue;
    c.fillStyle = hash(id) > 0.5 ? 'rgba(255,250,240,.22)' : 'rgba(0,0,0,.28)'; c.fillRect(GX + hash(id * 2.1) * GW, 0, 1.5, GH); }
  const n = Math.floor(hash(f * 0.91) * 5);
  for (let k = 0; k < n; k++) { const q = f * 13 + k * 3.1; c.fillStyle = hash(q + 3) > 0.35 ? 'rgba(10,8,6,.55)' : 'rgba(255,252,245,.45)';
    c.beginPath(); c.arc(GX + hash(q) * GW, hash(q + 1) * GH, 1 + hash(q + 2) * 4, 0, 2 * Math.PI); c.fill(); }
}
// A warm-white grease-pencil line through pts, drawn to fraction u of its length; lw = width of the main stroke.
export function greasePencil(c, pts, u, lw = 7) {
  u = clamp(u); if (u <= 0) return; const p = polySlice(pts, u * polyLength(pts));
  for (const [dx, dy, a, w] of [[0, 0, 0.92, lw], [1.6, -1.2, 0.41, lw * 0.56]]) {
    c.save(); c.strokeStyle = `rgba(250,248,240,${a})`; c.lineWidth = w; c.lineCap = c.lineJoin = 'round'; c.beginPath();
    p.forEach(([x, y], i) => { const j = (nHash(i * 1.7 + x * 0.01) - 0.5) * 1.6; i ? c.lineTo(x + dx + j, y + dy + j) : c.moveTo(x + dx, y + dy); });
    c.stroke(); c.restore(); }
}
// A hand-drawn ring (a little more than one turn) around (cx, cy).
export const ringPts = (cx, cy, rx, ry) => [...Array(64).keys()].map((i) => { const a = -2.2 + (i / 63) * 2 * Math.PI * 1.12, r = 1 + 0.05 * Math.sin(i * 0.7); return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]; });
