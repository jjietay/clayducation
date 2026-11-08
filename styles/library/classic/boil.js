// Line-boil (hand-drawn) parts (style: styles/line-boil.md). Every line boils: 3 jitter variants at 12 fps.
// Draw from s.tq(12). import { INK, BOIL, inkLine, inkShape, ring, rrect, inkFace, pencil, stamp, inkJar, inkFolder, envelope } from '/_lib/classic/boil.js';
import { K } from './common.js';

export const INK = '#1c1c1c';
export const BOIL = { blue: '#1982c4', yellow: '#ffca3a', red: '#c1121f', green: '#2b8a3e', fill: '#ff595e' };

// A boiling ink line through pts (variable width). Returns the jittered points.
export function inkLine(s, c, pts, seed, { w = 4, color = INK, amp = 2.2 } = {}) {
  const P = wobble(pts, amp, seed * 10 + s.boil(3, 12));
  strokeVar(c, P, (u) => w * (0.7 + 0.6 * Math.sin(Math.PI * u)), color);
  return P;
}
// A boiling filled shape with an ink outline.
export function inkShape(s, c, pts, seed, fill, { w = 4, amp = 2.2 } = {}) {
  const P = wobble(pts, amp, seed * 10 + s.boil(3, 12));
  c.save(); c.fillStyle = fill; c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.fill(); c.restore();
  strokeVar(c, [...P, P[0]], (u) => w * (0.75 + 0.5 * Math.sin(Math.PI * 3 * u)), INK);
}
// Point lists: an ellipse arc and a rounded rectangle.
export const ring = (x, y, rx, ry, n = 28, a0 = 0, a1 = Math.PI * 2) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [x + rx * Math.cos(a), y + ry * Math.sin(a)]; });
export const rrect = (x, y, w, h, r = 20, n = 6) => {
  const P = [], arc = (cx, cy, a0) => { for (let i = 0; i <= n; i++) { const a = a0 + (Math.PI / 2) * i / n; P.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + h - r, 0); arc(x + r, y + h - r, Math.PI / 2); arc(x + r, y + r, Math.PI);
  return P;
};
// A hand-drawn face. mood: 'calm' | 'happy' | 'surprised' | 'dead'. r = eye spacing.
export function inkFace(s, c, x, y, r, mood, seed) {
  for (const sx of [-1, 1]) {
    const ex = x + sx * r, ey = y;
    if (mood === 'dead') {
      inkLine(s, c, [[ex - 11, ey - 11], [ex + 11, ey + 11]], seed + sx, { w: 4 });
      inkLine(s, c, [[ex + 11, ey - 11], [ex - 11, ey + 11]], seed + sx + 3, { w: 4 });
    } else if (mood === 'surprised') {
      inkShape(s, c, ring(ex, ey, 13, 15, 14).slice(0, 14), seed + sx, '#ffffff', { w: 3, amp: 1.2 });
      c.fillStyle = INK; c.beginPath(); c.arc(ex, ey, 4, 0, Math.PI * 2); c.fill();
    } else if (mood === 'happy') {
      inkLine(s, c, ring(ex, ey + 4, 10, 9, 8, Math.PI, Math.PI * 2), seed + sx, { w: 4 });
    } else {
      c.fillStyle = INK; c.beginPath(); c.ellipse(ex + (s.boil(3, 12) - 1) * 0.6, ey, 6, 8, 0, 0, Math.PI * 2); c.fill();
    }
  }
  const my = y + r * 1.1;
  if (mood === 'happy') inkLine(s, c, ring(x, my - 8, r * 0.7, r * 0.5, 10, 0.15 * Math.PI, 0.85 * Math.PI), seed + 7, { w: 4 });
  else if (mood === 'surprised') inkShape(s, c, ring(x, my + 4, 9, 12, 12).slice(0, 12), seed + 7, INK, { w: 2, amp: 1 });
  else if (mood === 'dead') inkLine(s, c, [[x - r * 0.6, my + 6], [x - r * 0.2, my], [x + r * 0.2, my + 6], [x + r * 0.6, my]], seed + 7, { w: 4 });
  else inkLine(s, c, [[x - r * 0.4, my], [x, my + 4], [x + r * 0.4, my]], seed + 7, { w: 4 });
}
// A yellow pencil, tip at (x, y), turned by ang (radians).
export function pencil(s, c, x, y, ang, seed) {
  c.save(); c.translate(x, y); c.rotate(ang);
  inkShape(s, c, [[0, 0], [16, -10], [110, -10], [110, 10], [16, 10]], seed, BOIL.yellow, { w: 3, amp: 1.2 });
  inkShape(s, c, [[0, 0], [16, -10], [16, 10]], seed + 1, '#f2d0a9', { w: 2, amp: 0.8 });
  c.restore();
}
// A rubber stamp with a word (KILL, DONE, FAILED). Centre (x, y), scale sc, alpha a.
export function stamp(s, c, x, y, word = 'KILL', { sc = 1, a = 1, color = BOIL.red, rot = -0.08, seed = 5 } = {}) {
  if (a <= 0.01) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(sc, sc); c.rotate(rot);
  const P = rrect(-120, -55, 240, 110, 18);
  c.fillStyle = '#ffffff'; c.beginPath(); P.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.fill();
  inkLine(s, c, [...P, P[0]], seed, { w: 6, color });
  c.fillStyle = color; c.font = '400 64px Patrick Hand'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(word, 0, 4);
  c.restore();
}
// A jar character (one file): body, lid, n pink pages stacked inside, a face. Bottom centre (x, y).
export function inkJar(s, c, x, y, { h = 300, w = 230, fill = K.file, mood = 'calm', pages = 0, seed = 10 } = {}) {
  inkShape(s, c, rrect(x - w / 2, y - h, w, h, 40), seed, fill);
  inkShape(s, c, rrect(x - w / 2 - 12, y - h - 30, w + 24, 40, 14), seed + 1, mix(fill, '#ffffff', 0.35));
  for (let i = 0; i < pages; i++) inkShape(s, c, rrect(x - 80, y - 30 - i * 8, 160, 6, 3, 2), seed + 10 + i, K.chunk, { w: 1.4, amp: 0.8 });
  inkFace(s, c, x, y - h + 100, 34, mood, seed + 2);
}
// A folder character (one folder): back panel with a tab, n pink sheets, a front panel, a face. Bottom centre (x, y).
export function inkFolder(s, c, x, y, { h = 250, w = 300, fill = K.folder, mood = 'calm', sheets = 0, seed = 40 } = {}) {
  inkShape(s, c, [[x - w / 2, y], [x - w / 2, y - h - 30], [x - w / 2 + 100, y - h - 30], [x - w / 2 + 120, y - h], [x + w / 2, y - h], [x + w / 2, y]], seed, mix(fill, '#000000', 0.1));
  for (let i = 0; i < sheets; i++) {
    const sx = x - 130 + (i % 10) * 26, sy = y - h - 40 + Math.floor(i / 10) * 26 + (i % 2) * 6;
    inkShape(s, c, rrect(sx, sy, 40, 70, 4, 2), seed + 10 + i, K.chunk, { w: 1.6, amp: 0.8 });
  }
  inkShape(s, c, [[x - w / 2 - 6, y], [x - w / 2 - 6, y - h * 0.62], [x + w / 2 + 6, y - h * 0.62], [x + w / 2 + 6, y]], seed + 1, fill);
  inkFace(s, c, x, y - h * 0.38, 34, mood, seed + 2);
}

// A frame or packet as an envelope (WiFi frames in the DDS video), centre (x, y), fill col.
// broken 0..1: a red crack, it tips over, drops 60 px and fades (a lost frame).
export function envelope(s, c, x, y, col, seed, { k = 1, broken = 0 } = {}) {
  if (k <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(k, k);
  if (broken > 0) { c.rotate(broken * 0.8); c.translate(0, broken * 60); c.globalAlpha = 1 - clamp((broken - 0.6) / 0.4); }
  inkShape(s, c, rrect(-34, -22, 68, 44, 6, 2), seed, col, { w: 3, amp: 1.4 });
  inkLine(s, c, [[-30, -18], [0, 4], [30, -18]], seed + 1, { w: 3, amp: 1.2 });
  if (broken > 0) inkLine(s, c, [[-8, -24], [4, -4], [-6, 8], [6, 26]], seed + 2, { w: 4, color: BOIL.red, amp: 1 });
  c.restore();
}
