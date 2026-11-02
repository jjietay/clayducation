// Pixel-art parts (style: styles/pixel-art.md). Draw on s.canvas({ w: 320, h: 180, pixel: true }) from s.tq(10).
// All positions are whole canvas pixels; 1 canvas px = 6 stage px.
// import { PX, pxR, pxText, pxWorker, pxPadlock, pxGpu, pxShelf, pxCrate, pxDialog, pxFloor } from '/_lib/pixel.js';

// The fixed palette, plus two colour roles kept from the other styles: tl = a file (teal), pk = a chunk (pink).
export const PX = { k: '#1a1c2c', p: '#5d275d', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', lg: '#a7f070', g: '#38b764', b: '#41a6f6', g1: '#333c57', g2: '#566c86', g3: '#94b0c2', w: '#f4f4f4', tl: '#2a9d8f', pk: '#e63973' };
// A filled rectangle; col is a PX key or a colour.
export const pxR = (c, x, y, w, h, col) => { c.fillStyle = PX[col] || col; c.fillRect(Math.round(x), Math.round(y), w, h); };
// Pixel text that also draws "_" (the engine font has none). Upper case. Returns the x after the text.
export function pxText(c, str, x, y, color, scale = 1) {
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    if (ch === '_') { c.fillStyle = color; c.fillRect(cx, y + 6 * scale, 5 * scale, scale); cx += 6 * scale; continue; }
    cx = pixelText(c, ch, cx, y, color, scale);
  }
  return cx;
}
// A dithered floor band from y0 to y1.
export function pxFloor(c, y0 = 112, y1 = 122, col = 'g1') {
  for (let y = y0; y < y1; y++) for (let x = 0; x < 320; x++) if ((y - y0) / (y1 - y0) > bayer(x, y)) pxR(c, x, y, 1, 1, col);
}
// A worker sprite (8 x 11): head with eyes, body, two legs that step with frame. carry = holds a pink tile.
export function pxWorker(c, x, y, frame, { carry = false, dim = false, col = 'b' } = {}) {
  x = Math.round(x); y = Math.round(y);
  pxR(c, x + 1, y, 6, 5, dim ? 'g2' : col);
  pxR(c, x + 2, y + 2, 1, 1, 'k'); pxR(c, x + 5, y + 2, 1, 1, 'k');
  pxR(c, x, y + 5, 8, 4, dim ? 'g1' : 'g2');
  const lg = frame % 2;
  pxR(c, x + 1 + lg, y + 9, 2, 2, 'g3'); pxR(c, x + 5 - lg, y + 9, 2, 2, 'g3');
  if (carry) { pxR(c, x + 8, y + 3, 5, 6, 'w'); pxR(c, x + 9, y + 4, 3, 4, 'pk'); }
}
// A small padlock (5 x 7), top left (x, y).
export function pxPadlock(c, x, y, col = 'g3') {
  pxR(c, x + 1, y, 3, 1, col); pxR(c, x, y + 1, 1, 2, col); pxR(c, x + 4, y + 1, 1, 2, col);
  pxR(c, x, y + 3, 5, 4, col); pxR(c, x + 2, y + 4, 1, 2, 'k');
}
// A GPU (56 x 46) with a face; eat = mouth open. t = seconds (the lights run).
export function pxGpu(c, x, y, t, { eat = false, label = 'GPU' } = {}) {
  pxR(c, x, y, 56, 46, 'g3'); pxR(c, x + 2, y + 2, 52, 42, 'g1');
  pxR(c, x + 8, y + 8, 40, 22, 'k');
  pxR(c, x + 17, y + 14, 3, 4, 'lg'); pxR(c, x + 36, y + 14, 3, 4, 'lg');
  pxR(c, x + 21, y + 22, 14, eat ? 3 : 1, 'lg');
  for (let i = 0; i < 6; i++) pxR(c, x + 8 + i * 7, y + 36, 4, 4, (Math.floor(t * 6) + i) % 3 ? 'g2' : 'b');
  if (label) pxText(c, label, x + 28 - label.length * 3, y - 10, PX.g3);
}
// A shelf of separate tiles (a folder store), 80 x 80 by default; hot(r, q) = true makes a tile flash white.
export function pxShelf(c, x, y, { rows = 4, cols = 5, frame = 'y', tile = 'pk', hot = () => false } = {}) {
  const w = 6 + cols * 13 + 9, h = rows * 18 + 8;
  pxR(c, x, y, w, h, frame); pxR(c, x + 2, y + 2, w - 4, h - 4, 'k');
  for (let r = 0; r < rows; r++) {
    pxR(c, x + 2, y + 18 + r * 18, w - 4, 2, frame);
    for (let q = 0; q < cols; q++) { const tx = x + 6 + q * 13, ty = y + 4 + r * 18; pxR(c, tx, ty, 10, 12, hot(r, q) ? 'w' : frame); pxR(c, tx + 1, ty + 1, 8, 10, tile); }
  }
}
// One closed crate (one file), dithered, with a name plate.
export function pxCrate(c, x, y, w = 80, h = 80, { col = 'tl', name = 'HDF5' } = {}) {
  pxR(c, x, y, w, h, col);
  for (let yy = y + 3; yy < y + h - 3; yy++) for (let xx = x + 3; xx < x + w - 3; xx++) if (0.3 > bayer(xx, yy)) pxR(c, xx, yy, 1, 1, 'k');
  if (name) { const tw = name.length * 6 + 8; pxR(c, x + (w - tw) / 2, y + h / 2 - 7, tw, 13, 'k'); pxText(c, name, x + (w - tw) / 2 + 4, y + h / 2 - 4, PX.w); }
}
// A dialogue box above the subtitle band. lines = [[t0, speaker, text], ...]; t = s.tq(10).
export function pxDialog(c, t, lines, { cps = 34 } = {}) {
  const cur = [...lines].reverse().find((l) => t >= l[0]);
  pxR(c, 8, 124, 304, 30, 'w'); pxR(c, 9, 125, 302, 28, 'k');
  if (!cur) return;
  pxText(c, cur[1], 16, 130, PX.y);
  pxText(c, typed(cur[2], t - cur[0], cps), 16, 141, PX.w);
  if (Math.floor(t * 3) % 2) pxR(c, 302, 146, 4, 3, 'w');
}
