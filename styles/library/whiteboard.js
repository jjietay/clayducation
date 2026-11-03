// Whiteboard parts (style: styles/whiteboard.md). Formulas written in marker, glyph by glyph behind a diagonal clip.
// import { WBI, tk, wbLayout, wbWrite, wbMarker, wbBox } from '/_lib/whiteboard.js';
export const WBI = { ink: '#23262c', blue: '#2a5cb3', hl: '#d97757', font: 'Architects Daughter' };
// A token of a hand-written formula: text, colour, kind ('' | 'sub' | 'sup' | 'sig' = a drawn sigma), tag (to find it later).
export const tk = (s, col = WBI.ink, kind = '', tag = '') => ({ s, col, kind, tag });
// Lay out a line L = { x, y, size, toks } once (in setup, after the font loaded). Returns { toks (with x, y, w), x0, x1 }.
export function wbLayout(c, L, font = WBI.font) {
  let x = L.x; const out = [];
  for (const q of L.toks) {
    const sz = q.kind === 'sub' || q.kind === 'sup' ? L.size * 0.6 : L.size;
    c.font = `${sz}px "${font}"`;
    const w = q.kind === 'sig' ? L.size * 0.62 : c.measureText(q.s).width;
    const y = L.y + (q.kind === 'sub' ? L.size * 0.28 : q.kind === 'sup' ? -L.size * 0.42 : 0);
    out.push({ ...q, x, y, w, sz }); x += w + (q.kind === 'sig' ? 6 : 0);
  }
  return { toks: out, x0: L.x, x1: x, font };
}
// Write a laid-out line to fraction u (use the hand curve u - sin(2πu)/2π · 0.8). Returns the pen point while writing.
export function wbWrite(c, Lay, u, size) {
  if (u <= 0) return null;
  const xr = lerp(Lay.x0, Lay.x1, u), xe = u >= 1 ? W + 400 : xr;
  c.save(); c.beginPath(); c.moveTo(Lay.x0 - 20, 0); c.lineTo(xe + 120, 0); c.lineTo(xe + 40, H); c.lineTo(Lay.x0 - 20, H); c.closePath(); c.clip();
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.94; c.textBaseline = 'alphabetic';
  for (const q of Lay.toks) {
    if (q.kind === 'sig') { const h = size * 0.72, x = q.x + 4, y = q.y; c.strokeStyle = q.col; c.lineWidth = 5; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x + h * 0.66, y - h * 0.86); c.lineTo(x + 2, y - h * 0.88); c.lineTo(x + h * 0.38, y - h * 0.42); c.lineTo(x, y + 2); c.lineTo(x + h * 0.7, y + 2); c.stroke(); continue; }
    c.fillStyle = q.col; c.font = `${q.sz}px "${Lay.font || WBI.font}"`; c.fillText(q.s, q.x, q.y);
  }
  c.restore();
  return [xr, Lay.toks[0].y - size * 0.3];
}
// The floating marker (white barrel, cap in col) with its tip at p.
export function wbMarker(c, p, col) { if (!p) return; c.save(); c.translate(p[0] + 30, p[1] - 40); c.rotate(-0.6);
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-14, 6, 130, 26); c.fillStyle = '#fafafa'; c.strokeStyle = '#9aa0a8'; c.lineWidth = 2; c.beginPath(); c.roundRect(-12, -12, 120, 24, 10); c.fill(); c.stroke();
  c.fillStyle = col; c.beginPath(); c.roundRect(70, -14, 44, 28, 8); c.fill(); c.beginPath(); c.moveTo(-12, -6); c.lineTo(-30, 0); c.lineTo(-12, 6); c.closePath(); c.fill(); c.restore(); }
// A marker box: four strokes with 6 px corner overshoot, drawn to k.
export function wbBox(c, x0, y0, x1, y1, k, col = WBI.ink) {
  const sides = [[[x0 - 6, y0], [x1 + 6, y0]], [[x1, y0 - 6], [x1, y1 + 6]], [[x1 + 6, y1], [x0 - 6, y1]], [[x0, y1 + 6], [x0, y0 - 6]]];
  c.save(); c.strokeStyle = col; c.lineWidth = 6; c.lineCap = 'round'; c.globalCompositeOperation = 'multiply';
  sides.forEach((sd, i) => { const u = clamp(k * 4 - i); if (u > 0) { c.beginPath(); c.moveTo(...sd[0]); c.lineTo(lerp(sd[0][0], sd[1][0], u), lerp(sd[0][1], sd[1][1], u)); c.stroke(); } }); c.restore(); }
