// Shape-morph parts (style: styles/shape-morph.md). SVG with the engine's goo() metaball filter.
// import { blobRow } from '/_lib/morph.js';
import { K } from './common.js';

// A row of n rounded rects inside a goo group: touching, they melt into one bar; with gaps, they split into chunks.
// Make it in setup; call row.draw({ pitch, w, h, y, cx, lift(i), kin(i) }) in draw.
export function blobRow(s, { n = 12, color = K.chunk, rx = 24, blur = 9, id = 'blobrow' } = {}) {
  const svg = s.svg();
  const gg = el('g', { filter: goo(svg, id, blur) }, svg);
  const blobs = Array.from({ length: n }, () => el('rect', { fill: color, rx }, gg));
  return {
    svg, blobs,
    // pitch = centre distance; w, h = blob size; lift(i) = px up; kin(i) = 0..1 entrance scale. Returns the centres.
    draw({ pitch = 112, w = 116, h = 96, y = 540, cx = 960, lift = () => 0, kin = () => 1 }) {
      return blobs.map((b, i) => {
        const x = cx + (i - (n - 1) / 2) * pitch, yy = y - lift(i), k = Math.max(0, kin(i));
        const ww = w * Math.min(1.1, k), hh = h * k;
        b.setAttribute('x', x - ww / 2); b.setAttribute('y', yy - hh / 2); b.setAttribute('width', Math.max(0, ww)); b.setAttribute('height', Math.max(0, hh));
        return [x, yy];
      });
    },
  };
}
