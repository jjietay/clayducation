// Isometric parts (style: styles/isometric.md). Canvas 2D with the engine's iso() and isoBox().
// O = { tile, ox, oy } is the projection: world (x, y, z) in tiles -> stage px. Draw back to front.
// import { ISO_INK, tone, isoBuilding, isoFileBlock, isoPlate } from '/_lib/iso.js';
import { K } from './common.js';

export const ISO_INK = '#2d3142';
// Three flat tones for one colour: light top, mid left, dark right.
export const tone = (hex) => ({ top: mix(hex, '#ffffff', 0.25), left: hex, right: mix(hex, '#000000', 0.22) });

// A building you can open: floor, low walls, contents(), roof. roofK = 0 closed .. 1 lifted and slid back (shows inside).
// (x, y, z) = back corner, w x d footprint. contents(box) draws what is inside (back to front) with box(spec).
export function isoBuilding(c, O, { x = 0, y = 0, z = 0, w = 6, d = 4, wall = 1.2, color = K.file, floor = K.fileInk, roof = K.fileLight, roofK = 0, lift = 1.6, slide = 4.5, contents = null } = {}) {
  const box = (b) => isoBox(c, { ...O, ...b });
  const T = tone(color);
  box({ x, y, z, w, d, h: 0.2, ...tone(floor) });
  box({ x, y, z: z + 0.2, w, d: 0.2, h: wall, ...T });                 // back walls
  box({ x, y: y + 0.2, z: z + 0.2, w: 0.2, d: d - 0.2, h: wall, ...T });
  if (contents) contents(box, { x, y, z: z + 0.2 });
  box({ x, y: y + d - 0.2, z: z + 0.2, w, d: 0.2, h: wall, ...T });       // front walls
  box({ x: x + w - 0.2, y, z: z + 0.2, w: 0.2, d: d - 0.2, h: wall, ...T });
  box({ x: x - slide * roofK, y, z: z + 0.2 + wall + roofK * lift, w, d, h: 0.25, ...tone(roof) });   // roof
}
// A flat plate (a folder, a board).
export function isoPlate(c, O, { x = 0, y = 0, z = 0, w = 6, d = 4, h = 0.2, color = K.folder } = {}) {
  isoBox(c, { ...O, x, y, z, w, d, h, ...tone(color) });
}
// One file holding one chunk: a dark amber tile with a pink block on it. (x, y) = the block's back corner.
export function isoFileBlock(c, O, { x, y, z = 0, size = 0.9, h = 0.6, tileColor = K.folderInk, color = K.chunk } = {}) {
  isoBox(c, { ...O, x: x - 0.12, y: y - 0.12, z, w: size + 0.24, d: size + 0.24, h: 0.14, ...tone(tileColor) });
  isoBox(c, { ...O, x, y, z: z + 0.14, w: size, d: size, h, ...tone(color) });
}
