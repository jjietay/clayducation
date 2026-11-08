// Blueprint / whiteprint parts (style: styles/blueprint.md). Solid lines only, drawn on with a nib.
// import { BP, bpLine, bpArrowHead, balloon, bpRect } from '/_lib/classic/blueprint.js';
import { drawTo } from './common.js';
export const BP = { ink: '#1d3f80', sheet: '#f4f1e8', red: '#c8363a' };   // whiteprint; the dark sheet is '#18336b' with ink '#e7f0f9'
// A line through pts drawn to fraction u, width w, with a glowing nib at its tip while it draws.
export function bpLine(c, pts, w, u, nib = true, ink = BP.ink) {
  u = clamp(u); if (u <= 0) return;
  c.save(); c.strokeStyle = ink; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  const e = drawTo(c, pts, u);
  if (nib && u < 1 && e) { c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(e[0], e[1], 7, 0, 7); c.fill(); c.fillStyle = ink; c.beginPath(); c.arc(e[0], e[1], 3.5, 0, 7); c.fill(); }
  c.restore();
}
// A closed rectangle as points (for bpLine).
export const bpRect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
// A filled arrowhead at b, pointing from a; shown once k reaches 1.
export function bpArrowHead(c, a, b, k = 1, ink = BP.ink) { if (k < 0.98) return; const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  c.save(); c.fillStyle = ink; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(b[0] - 16 * Math.cos(ang - 0.28), b[1] - 16 * Math.sin(ang - 0.28)); c.lineTo(b[0] - 16 * Math.cos(ang + 0.28), b[1] - 16 * Math.sin(ang + 0.28)); c.closePath(); c.fill(); c.restore(); }
// A part balloon (circle r 26 with a short name), popped in by k.
export function balloon(c, x, y, txt, k, ink = BP.ink, sheet = BP.sheet) { if (k <= 0) return; c.save(); c.globalAlpha = clamp(k * 2); c.fillStyle = sheet; c.strokeStyle = ink; c.lineWidth = 2;
  c.beginPath(); c.arc(x, y, 26 * (0.6 + 0.4 * k), 0, 7); c.fill(); c.stroke(); c.fillStyle = ink; c.font = '30px "Architects Daughter"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, x, y + 2); c.restore(); }
