// Models for the "r's in strawberry" video: a strawberry, a token bar (a sleeve over a row of blocks) and
// a letter block. Same rules as models.js: each part is a distance field, it stands on y = 0, +z is its front,
// and JOINS lists what each part must touch.
import { smin, smax, ell, cone, rbox } from '../sdf.js';
import { def, PAL } from '../models.js';

const C = { berry: '#d9483f', seed: '#f2d27a', leaf: '#4f9a4a', block: '#ede3cf', token: '#2f9e8f' };

// A point on the upper ellipsoid of the strawberry, for its seeds.
const BERRY = { cy: 1.75, rx: 1.3, ry: 1.05 };
// The seed pattern is turned by -0.225 rad, so that the side that faces +x (where the mascot puts his hands, at
// y 1.78 in model units) has a gap between seeds.
const seedAt = (a, v) => { const s = Math.sqrt(1 - v * v); a -= 0.225; return [BERRY.rx * s * Math.sin(a), BERRY.cy + BERRY.ry * v, BERRY.rx * s * Math.cos(a)]; };
const SEEDS = [];
for (const [v, n, off] of [[0.45, 6, 0], [0.05, 7, 0.45], [-0.35, 7, 0.1]]) for (let i = 0; i < n; i++) SEEDS.push(seedAt(off + (i * 2 * Math.PI) / n, v));

export const MODELS = {
  // A strawberry, about 3.2 tall (much larger than real size, so it reads next to the mascot).
  // The body is round on top and narrows to a round bottom that rests on the floor.
  strawberry: {
    label: 'Strawberry',
    make() {
      const m = def();
      // A round lower body (the user found the old cone tip too pointed, 2026-11-10); it rests on the floor at y 0.05.
      const body = (x, y, z) => smin(ell(x, y, z, 0, BERRY.cy, 0, BERRY.rx, BERRY.ry, BERRY.rx), ell(x, y, z, 0, 0.98, 0, 0.92, 0.93, 0.92), 0.55);
      m.add('berry', body, C.berry, { step: 0.03 });
      m.add('seeds', (x, y, z) => { let d = 9; for (const [sx, sy, sz] of SEEDS) d = Math.min(d, ell(x, y, z, sx, sy, sz, 0.09, 0.12, 0.09)); return d; }, C.seed, { step: 0.02 });
      m.add('leaves', (x, y, z) => {
        let d = 9;
        for (let i = 0; i < 5; i++) {
          const a = (i * 2 * Math.PI) / 5 + 0.3, c = Math.cos(a), s = Math.sin(a), u = c * x + s * z, w = -s * x + c * z;
          d = Math.min(d, ell(u, y, w, 0.55, 2.78 - 0.08, 0, 0.62, 0.1, 0.24));
        }
        return smin(d, ell(x, y, z, 0, 2.78, 0, 0.42, 0.14, 0.42), 0.1);
      }, C.leaf, { step: 0.025 });
      m.add('stem', (x, y, z) => cone(x, y, z, 0, 2.8, 0, 0.05, 3.3, 0.05, 0.11, 0.08), C.leaf, { step: 0.02 });
      return m;
    },
    moving: 'No moving parts',
  },
  // A token bar: a teal sleeve, 13.8 long, 1.6 tall and 1.7 deep, open at the bottom and at both ends. It fits
  // over a row of ten letter blocks set 1.36 apart (centres at x = -6.12 + 1.36 i). The sleeve slides off in x.
  tokenBar: {
    label: 'Token bar (sleeve over ten letter blocks)',
    step: 0.045,
    make() {
      const m = def();
      m.add('sleeve', (x, y, z) => smax(rbox(x, y, z, 0, 0.8, 0, 6.9, 0.8, 0.85, 0.12), -rbox(x, y, z, 0, 0, 0, 7.6, 1.42, 0.72, 0.04), 0.03), C.token, { free: true });
      return m;
    },
    pose(g) { g.sleeve.position.x = 14.5; },
    moving: 'Sleeve slides off in +x',
  },
  // A letter block, 1.3 on each side, for one letter (the letter is printed on the +z face by the scene).
  letterBlock: {
    label: 'Letter block',
    make() {
      const m = def();
      m.add('block', (x, y, z) => rbox(x, y, z, 0, 0.65, 0, 0.65, 0.65, 0.65, 0.14), C.block, { step: 0.025 });
      return m;
    },
    moving: 'No moving parts',
  },
  // A teal summary block, the same size as a letter block, with three cream lines of "text" on its +z face: the
  // short summary that replaces old messages when an agent's context window fills (agentic-harness video).
  summaryBlock: {
    label: 'Summary block',
    make() {
      const m = def();
      m.add('block', (x, y, z) => rbox(x, y, z, 0, 0.65, 0, 0.65, 0.65, 0.65, 0.14), C.token, { step: 0.025 });
      m.add('lines', (x, y, z) => { let d = 9; for (const [cy, hw] of [[0.95, 0.38], [0.65, 0.38], [0.35, 0.24]]) d = Math.min(d, rbox(x, y, z, hw - 0.38, cy, 0.655, hw, 0.06, 0.03, 0.025)); return d; }, C.block, { step: 0.015 });
      return m;
    },
    moving: 'No moving parts',
  },
};

export const JOINS = {
  summaryBlock: [['lines', 'block']],
  strawberry: [['seeds', 'berry'], ['leaves', 'berry'], ['stem', 'leaves']],
};
