// Transit-map parts (style: styles/transit-map.md).
// import { TM, tmLine, tmStop, capsule } from '/_lib/classic/transit.js';
import { drawTo, roundRect, face } from './common.js';
export const TM = { paper: '#f2eee5', ink: '#1b1c1e', red: '#e3002b', grey: '#9a958a' };
// A line through pts grown to fraction k, with a glowing pen tip while it grows. Returns the tip.
export function tmLine(c, pts, k, col, w = 15) { k = clamp(k); if (k <= 0) return null; c.save(); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
  const e = drawTo(c, pts, k); c.restore(); if (k < 1 && e) { c.save(); c.fillStyle = col; c.globalAlpha = 0.25; c.beginPath(); c.arc(e[0], e[1], 40, 0, 7); c.fill(); c.globalAlpha = 1;
    c.fillStyle = '#fff'; c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.arc(e[0], e[1], 11, 0, 7); c.fill(); c.stroke(); c.restore(); } return e; }
// A stop (or an interchange) that pops from 0.6x with a ring as k goes 0 -> 1.
export function tmStop(c, x, y, col, k, inter = false) { if (k <= 0) return; const sc = 0.6 + 0.4 * E.overshoot(clamp(k)); c.save(); c.translate(x, y); c.scale(sc, sc);
  if (inter) { c.fillStyle = '#fff'; c.strokeStyle = TM.ink; c.lineWidth = 5.5; roundRect(c, -26, -26, 52, 52, 26); c.fill(); c.stroke(); }
  else { c.fillStyle = '#fff'; c.strokeStyle = col; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 9, 0, 7); c.fill(); c.stroke(); } c.restore();
  const rk = clamp(k * 1.5 - 0.3); if (rk > 0 && rk < 1) { c.save(); c.strokeStyle = col; c.globalAlpha = 1 - rk; c.lineWidth = 3; c.beginPath(); c.arc(x, y, 10 + 32 * rk, 0, 7); c.stroke(); c.restore(); } }
// A white capsule (the vehicle) with windows in the line colour and a small face at the front; a = opacity.
export function capsule(c, x, y, col, a = 1) { if (a <= 0) return; c.save(); c.globalAlpha = a; c.translate(x, y); c.fillStyle = '#fff'; c.strokeStyle = TM.ink; c.lineWidth = 3; roundRect(c, -42, -16, 84, 32, 16); c.fill(); c.stroke();
  c.fillStyle = col; for (const wx of [-24, 0]) { roundRect(c, wx - 8, -8, 16, 16, 4); c.fill(); } c.restore(); face(c, x + 24, y, 6, { mood: 'happy', ink: TM.ink }); }
