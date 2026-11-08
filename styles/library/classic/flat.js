// Flat-vector props (style: styles/flat-vector.md). Canvas 2D, flat fills, 4 px ink outlines.
// import { tile, barrel, folderBack, folderLip, drone, tankSide, tankTop, card, gpuBox, laptop } from '/_lib/classic/flat.js';
import { C, K, roundRect, face } from './common.js';

// A chunk tile: rounded square with a small white wave (a signal window, a record). Centre (x, y).
export function tile(c, x, y, sz, { k = 1, fill = K.chunk, ink = C.ink, wave = true, lw = 3 } = {}) {
  if (k <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = fill; c.strokeStyle = ink; c.lineWidth = lw;
  roundRect(c, -sz / 2, -sz / 2, sz, sz, sz * 0.18); c.fill(); c.stroke();
  if (wave) {
    c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, sz * 0.05); c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 16; i++) { const u = i / 16; const px = -sz * 0.32 + u * sz * 0.64, py = Math.sin(u * Math.PI * 4) * sz * 0.14; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.stroke();
  }
  c.restore();
}

// A file as a barrel (one file, for example HDF5). Bottom centre (x, y).
// squash > 0 squashes it (landing), cut > 0 opens a window that shows an index bar and chunks inside.
export function barrel(c, x, y, w, h, { k = 1, squash = 0, text = 'HDF5', fill = K.file, ink = C.ink, cut = 0 } = {}) {
  if (k <= 0.01) return;
  const rx = w / 2, ry = w * 0.16;
  c.save(); c.translate(x, y); c.scale(k * (1 + squash), k * (1 - squash));
  c.lineWidth = 4; c.strokeStyle = ink; c.lineJoin = 'round';
  c.fillStyle = fill;
  c.beginPath(); c.moveTo(-rx, -h); c.lineTo(-rx, 0); c.ellipse(0, 0, rx, ry, 0, Math.PI, 0, true); c.lineTo(rx, -h); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = mix(fill, '#000000', 0.25); c.lineWidth = 3;
  for (const f of [0.3, 0.7]) { c.beginPath(); c.ellipse(0, -h * f, rx, ry, 0, 0.05 * Math.PI, 0.95 * Math.PI); c.stroke(); }
  c.strokeStyle = ink; c.lineWidth = 4;
  c.fillStyle = mix(fill, '#ffffff', 0.35);
  c.beginPath(); c.ellipse(0, -h, rx, ry, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  if (cut > 0.01) {
    const ww = w * 0.7, wh = h * 0.58, wx = -ww / 2, wy = -h * 0.8;
    c.save(); c.globalAlpha *= clamp(cut);
    c.fillStyle = '#fdf6ec'; roundRect(c, wx, wy, ww, wh, 12); c.fill(); c.stroke();
    c.fillStyle = K.index; roundRect(c, wx + 14, wy + 14, 24, wh - 28, 6); c.fill();
    const ts = Math.min(40, ww * 0.2);
    for (let r = 0; r < 3; r++) for (let q = 0; q < 2; q++) tile(c, wx + ww * 0.42 + q * ts * 1.4, wy + wh * 0.2 + r * wh * 0.3, ts, { wave: false, lw: 2 });
    c.restore();
  } else if (text) {
    c.fillStyle = '#ffffff'; c.font = `800 ${Math.round(w * 0.2)}px Plus Jakarta Sans`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 0, -h * 0.5);
  }
  c.restore();
}

// A folder (a store, for example Zarr): draw folderBack, then the contents, then folderLip.
// (x, y) = bottom centre. Contents sit between y - h and y - lipHeight.
export function folderBack(c, x, y, w, h, { k = 1, fill = K.folder, ink = C.ink } = {}) {
  if (k <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.lineWidth = 4; c.strokeStyle = ink; c.lineJoin = 'round';
  c.fillStyle = mix(fill, '#000000', 0.12);
  c.beginPath(); c.moveTo(-w / 2, 0); c.lineTo(-w / 2, -h - 30); c.lineTo(-w / 2 + w * 0.32, -h - 30); c.lineTo(-w / 2 + w * 0.38, -h); c.lineTo(w / 2, -h); c.lineTo(w / 2, 0); c.closePath(); c.fill(); c.stroke();
  c.restore();
}
export function folderLip(c, x, y, w, lh = 44, { k = 1, fill = K.folder, ink = C.ink } = {}) {
  if (k <= 0.01) return;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.lineWidth = 4; c.strokeStyle = ink; c.fillStyle = fill;
  roundRect(c, -w / 2 - 8, -lh, w + 16, lh, 10); c.fill(); c.stroke();
  c.restore();
}

// A quadcopter drone with a face. Centre of the body (x, y). t = seconds (propellers spin).
export function drone(c, x, y, sc, t, { mood = 'calm', look = [0, 0], blink = 0, color = K.source } = {}) {
  c.save(); c.translate(x, y); c.scale(sc, sc);
  c.lineWidth = 5; c.strokeStyle = C.ink; c.lineJoin = 'round'; c.lineCap = 'round';
  for (const sx of [-1, 1]) {
    c.beginPath(); c.moveTo(sx * 60, -14); c.lineTo(sx * 130, -48); c.stroke();
    c.fillStyle = C.ink; roundRect(c, sx * 130 - 9, -62, 18, 16, 4); c.fill();
    const pw = 12 + 54 * Math.abs(Math.cos(t * 23 + sx));
    c.fillStyle = 'rgba(43,45,66,0.35)'; c.beginPath(); c.ellipse(sx * 130, -66, pw, 7, 0, 0, Math.PI * 2); c.fill();
  }
  c.beginPath(); c.moveTo(-42, 34); c.lineTo(-58, 66); c.moveTo(42, 34); c.lineTo(58, 66); c.stroke();
  c.fillStyle = color; roundRect(c, -86, -44, 172, 82, 34); c.fill(); c.stroke();
  c.restore();
  face(c, x, y - 4 * sc, 20 * sc, { mood, look, blink });
}

// A box character: rounded box with a face (a node, a server, a GPU, a worker). Centre (x, y).
export function card(c, x, y, w, h, fill, { mood = 'calm', look = [0, 0], k = 1, stroke = C.ink, faceR = 18, blink = 0 } = {}) {
  if (k <= 0.01) return;
  c.save();
  c.translate(x, y); c.scale(k, k);
  c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = 5; c.lineJoin = 'round';
  roundRect(c, -w / 2, -h / 2, w, h, 22); c.fill(); c.stroke();
  c.restore();
  if (k > 0.5) face(c, x, y - 4 * k, faceR * k, { mood, look, blink });
}
// The GPU / training box used in the Zarr video: a blue card with a happy face.
export const gpuBox = (c, x, y, { k = 1, look = [-1, 0] } = {}) => card(c, x, y, 140, 140, K.worker, { k, mood: 'happy', look, faceR: 20 });

// The tank robot, side view. (x, y) = middle of the ground contact. Faces +x (or -x with flip).
// roll = how far the tracks have moved (px). Returns the lidar centre [x, y].
export function tankSide(c, x, y, sc = 1, { roll = 0, mood = 'calm', look = [1, 0], blink = 0, flip = false, color = C.robot, lidar = true, lidarColor = C.scan, ink = C.ink, faceOn = true } = {}) {
  c.save();
  c.translate(x, y); c.scale(sc * (flip ? -1 : 1), sc);
  c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = ink;
  c.fillStyle = '#3d4152';
  roundRect(c, -120, -56, 240, 56, 28); c.fill(); c.stroke();
  for (let i = 0; i < 4; i++) {
    const wx = -84 + i * 56, wy = -28;
    c.fillStyle = '#9aa0b4';
    c.beginPath(); c.arc(wx, wy, 20, 0, Math.PI * 2); c.fill(); c.stroke();
    const a = roll / 20;
    c.beginPath(); c.moveTo(wx + Math.cos(a) * 14, wy + Math.sin(a) * 14); c.lineTo(wx - Math.cos(a) * 14, wy - Math.sin(a) * 14); c.stroke();
  }
  c.fillStyle = color;
  roundRect(c, -100, -136, 200, 84, 18); c.fill(); c.stroke();
  c.fillStyle = mix(color, '#ffffff', 0.35);
  roundRect(c, -60, -158, 120, 24, 8); c.fill(); c.stroke();
  let lid = null;
  if (lidar) {
    c.fillStyle = lidarColor;
    roundRect(c, -4, -190, 52, 34, 10); c.fill(); c.stroke();
    lid = [22, -173];
  }
  c.restore();
  if (faceOn) {
    const fx = x + (flip ? -1 : 1) * 30 * sc, fy = y - 96 * sc;
    face(c, fx, fy, 20 * sc, { mood, look: [look[0] * (flip ? -1 : 1), look[1]], blink, ink });
  }
  return lid ? [x + (flip ? -1 : 1) * lid[0] * sc, y + lid[1] * sc] : null;
}
// The tank robot, top view, for maps. (x, y) = centre, heading in radians (0 = +x, screen y down).
export function tankTop(c, x, y, heading = 0, sc = 1, { color = C.robot, ink = C.ink, lidar = true, lidarColor = C.scan, alpha = 1, nose = true } = {}) {
  c.save();
  c.globalAlpha *= alpha;
  c.translate(x, y); c.rotate(heading); c.scale(sc, sc);
  c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = ink;
  c.fillStyle = '#3d4152';
  roundRect(c, -34, -30, 68, 12, 5); c.fill(); c.stroke();
  roundRect(c, -34, 18, 68, 12, 5); c.fill(); c.stroke();
  c.fillStyle = color;
  roundRect(c, -28, -20, 56, 40, 8); c.fill(); c.stroke();
  if (nose) { c.fillStyle = ink; c.beginPath(); c.moveTo(30, 0); c.lineTo(18, -8); c.lineTo(18, 8); c.closePath(); c.fill(); }
  if (lidar) { c.fillStyle = lidarColor; c.beginPath(); c.arc(4, 0, 9, 0, Math.PI * 2); c.fill(); c.stroke(); }
  c.restore();
}

// The viewer's laptop as a character (the Mac in the DDS video): a face on the right half of the screen,
// a map panel on the left that fills with map (0..1), or a terminal with lines of text (term: ['line', ...]).
// (x, y) = bottom centre of the base. From the DDS and Foxglove video (tank series, video 5).
export function laptop(c, x, y, sc = 1, { mood = 'calm', look = [-1, 0], blink = 0, map = 0, mapColor = C.map, screen = C.viewerLight, body = C.viewer, term = null } = {}) {
  c.save(); c.translate(x, y); c.scale(sc, sc);
  c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = C.ink;
  c.fillStyle = body; roundRect(c, -150, -210, 300, 200, 18); c.fill(); c.stroke();
  c.fillStyle = screen; roundRect(c, -134, -194, 268, 168, 10); c.fill();
  c.fillStyle = body; c.beginPath(); c.moveTo(-190, 0); c.lineTo(190, 0); c.lineTo(160, -14); c.lineTo(-160, -14); c.closePath(); c.fill(); c.stroke();
  if (map > 0) {
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [2, 2], [0, 2], [2, 0], [1, 3], [0, 3], [2, 3]];
    const n = Math.round(cells.length * clamp(map));
    c.fillStyle = mapColor;
    for (let i = 0; i < n; i++) { const [i0, j0] = cells[i]; c.fillRect(-122 + i0 * 34, -182 + j0 * 36, 32, 34); }
  }
  if (term) {
    c.fillStyle = '#1b1e2e'; roundRect(c, -134, -194, 268, 168, 10); c.fill();
    c.fillStyle = '#9ef0c0'; c.font = '500 26px "JetBrains Mono"'; c.textAlign = 'left'; c.textBaseline = 'top';
    term.forEach((ln, i) => c.fillText(ln, -120, -180 + i * 34));
  }
  c.restore();
  if (!term) face(c, x + 62 * sc, y - 120 * sc, 22 * sc, { mood, look, blink });
}
