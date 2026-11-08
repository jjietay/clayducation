// Paper cut-out parts (style: styles/paper-cutout.md). Card pieces with a rough white edge and a hard shadow.
// Characters move in stop motion: draw their poses from s.tq(12); the camera drifts smoothly.
// import { PAPER, paperPiece, rectPts, circlePts, paperGrain, paperPerson, paperReceipt, paperCard } from '/_lib/classic/paper.js';
import { K } from './common.js';

export const PAPER = { red: '#e76f51', teal: '#2a9d8f', sand: '#f4a261', ink: '#1b1b1b', cream: '#fbf6ea', neutral: '#d9cfbb', skin: '#f1c9a5' };

// A card piece: closed point list pts, flat fill, rough white cut edge and a hard shadow.
// The seed is fixed per piece (paper does not boil).
export function paperPiece(c, pts, fill, seed, { shadow = 7, edge = 6, alpha = 1 } = {}) {
  const rough = wobble(pts, 1.6, seed);
  c.save(); c.globalAlpha *= alpha;
  const path = (P, dx = 0, dy = 0, grow = 0) => {
    let cx = 0, cy = 0; for (const p of P) { cx += p[0]; cy += p[1]; } cx /= P.length; cy /= P.length;
    c.beginPath();
    P.forEach(([x, y], i) => { const a = Math.atan2(y - cy, x - cx); const X = x + Math.cos(a) * grow + dx, Y = y + Math.sin(a) * grow + dy; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath();
  };
  c.fillStyle = 'rgba(0,0,0,0.25)'; path(rough, shadow, shadow, edge / 2); c.fill();
  c.fillStyle = '#ffffff'; path(rough, 0, 0, edge / 2); c.fill();
  c.fillStyle = fill; path(rough); c.fill();
  c.restore();
}
export const rectPts = (x, y, w, h, n = 8) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push([x + (w * i) / n, y]);
  for (let i = 0; i < n; i++) out.push([x + w, y + (h * i) / n]);
  for (let i = 0; i < n; i++) out.push([x + w - (w * i) / n, y + h]);
  for (let i = 0; i < n; i++) out.push([x, y + h - (h * i) / n]);
  return out;
};
export const circlePts = (x, y, r, n = 32) => Array.from({ length: n }, (_, i) => [x + r * Math.cos((i / n) * Math.PI * 2), y + r * Math.sin((i / n) * Math.PI * 2)]);
// Seeded paper grain over the whole stage.
export function paperGrain(c, seed = 5, color = 'rgba(60,40,20,0.05)') {
  const r = rng(seed); c.fillStyle = color;
  for (let i = 0; i < 1300; i++) c.fillRect(r() * W, r() * H, 2, 2);
}
// A cut-out person: body, head with eyes, one arm on a split pin at the shoulder.
// (x, y) = feet. arm = angle in radians (-1.2 hangs down, 0.9 raised). prop: null | 'stop' (a red stop sign in the hand).
export function paperPerson(c, x, y, { body = K.worker, arm = -1.2, prop = null, seed = 70 } = {}) {
  paperPiece(c, rectPts(x - 55, y - 210, 110, 170), body, seed);
  paperPiece(c, circlePts(x, y - 260, 50), PAPER.skin, seed + 1);
  c.fillStyle = PAPER.ink; c.beginPath(); c.arc(x - 16, y - 266, 6, 0, Math.PI * 2); c.arc(x + 16, y - 266, 6, 0, Math.PI * 2); c.fill();
  c.save(); c.translate(x - 50, y - 190); c.rotate(arm);
  paperPiece(c, rectPts(-130, -14, 130, 28), mix(body, '#000000', 0.2), seed + 2, { shadow: 3 });
  if (prop === 'stop') { paperPiece(c, circlePts(-150, 0, 46), '#b3261e', seed + 3, { shadow: 3 }); c.fillStyle = '#ffffff'; c.fillRect(-176, -8, 52, 16); }
  c.restore();
}
// A receipt slip with a zigzag bottom and grey lines. Top left (x, y).
export function paperReceipt(c, x, y, { w = 90, h = 160, seed = 30 } = {}) {
  const pts = [[x, y], [x + w, y], [x + w, y + h]];
  for (let i = 1; i <= 6; i++) pts.push([x + w - i * (w / 6), y + h + (i % 2 ? 10 : 0)]);
  paperPiece(c, pts, '#ffffff', seed, { shadow: 4 });
  c.strokeStyle = '#9a9a9a'; c.lineWidth = 3;
  for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x + 12, y + 26 + i * 22); c.lineTo(x + w - 12, y + 26 + i * 22); c.stroke(); }
}
// A card with a short mark on it ('{ }', 'json', a colour bar). Top left (x, y).
export function paperCard(c, x, y, { w = 110, h = 140, fill = K.index, mark = '{ }', markColor = '#ffffff', seed = 40 } = {}) {
  paperPiece(c, rectPts(x, y, w, h), fill, seed, { shadow: 4 });
  if (mark) { c.fillStyle = markColor; c.font = '700 32px JetBrains Mono'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.fillText(mark, x + w / 2, y + h * 0.58); }
}
