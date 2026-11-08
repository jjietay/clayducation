// Signed distance helpers and a surface-nets mesher. The mascot's soft, blended forms
// come from these: smooth unions give the clay look that plain primitives cannot.
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const mix = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
export function smax(a, b, k) { return -smin(-a, -b, k); }

export function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}

// A capsule whose radius changes from ra at a to rb at b.
export function cone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, pax = x - ax, pay = y - ay, paz = z - az;
  const t = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * t, pay - bay * t, paz - baz * t) - mix(ra, rb, t);
}

// Surface nets: one vertex in each cell that the surface crosses, joined into quads.
export function mesh(f, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const v = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) v[id(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  const vid = new Int32Array(nx * ny * nz).fill(-1), pos = [], tri = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of edges) {
      const A = corners[a], B = corners[b], va = v[id(i + A[0], j + A[1], k + A[2])], vb = v[id(i + B[0], j + B[1], k + B[2])];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; n++;
    }
    if (!n) continue;
    vid[id(i, j, k)] = pos.length / 3;
    pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) tri.push(a, c, b, a, d, c); else tri.push(a, b, c, a, c, d); };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const c = v[id(i, j, k)] < 0;
    if (c !== (v[id(i + 1, j, k)] < 0)) quad(vid[id(i, j - 1, k - 1)], vid[id(i, j, k - 1)], vid[id(i, j, k)], vid[id(i, j - 1, k)], !c);
    if (c !== (v[id(i, j + 1, k)] < 0)) quad(vid[id(i - 1, j, k - 1)], vid[id(i - 1, j, k)], vid[id(i, j, k)], vid[id(i, j, k - 1)], !c);
    if (c !== (v[id(i, j, k + 1)] < 0)) quad(vid[id(i - 1, j - 1, k)], vid[id(i, j - 1, k)], vid[id(i, j, k)], vid[id(i - 1, j, k)], !c);
  }
  return { pos: new Float32Array(pos), tri: new Uint32Array(tri) };
}

export function normalAt(f, x, y, z, e = 0.012) {
  const nx = f(x + e, y, z) - f(x - e, y, z), ny = f(x, y + e, z) - f(x, y - e, z), nz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// Occlusion, from the distance field of everything nearby: 1 is open, 0 is fully hidden.
export function ao(world, x, y, z, n) {
  let o = 0, w = 1;
  for (let i = 1; i <= 5; i++) { const h = 0.05 * i * i * 0.55 + 0.02; o += w * Math.max(0, h - world(x + n[0] * h, y + n[1] * h, z + n[2] * h)); w *= 0.62; }
  return clamp(1 - 2.1 * o, 0, 1);
}

// How thin the form is behind this point: 1 is thin (ear, nose tip), 0 is thick. Used to fake
// light that passes through the skin.
export function thin(self, x, y, z, n) {
  let s = 0;
  for (let i = 1; i <= 4; i++) { const h = 0.11 * i; s += clamp(-self(x - n[0] * h, y - n[1] * h, z - n[2] * h) / h, 0, 1); }
  return clamp(1 - s / 4, 0, 1);
}

// Rounded box: c is its centre, h its half sizes, r the corner radius.
export function rbox(x, y, z, cx, cy, cz, hx, hy, hz, r) {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
// Rounded cylinder along 'x', 'y' or 'z'.
export function rcyl(x, y, z, cx, cy, cz, axis, rad, half, r) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const a = axis === 'x' ? px : axis === 'y' ? py : pz, h = axis === 'x' ? Math.hypot(py, pz) : axis === 'y' ? Math.hypot(px, pz) : Math.hypot(px, py);
  const d1 = h - rad + r, d2 = Math.abs(a) - half + r;
  return Math.min(Math.max(d1, d2), 0) + Math.hypot(Math.max(d1, 0), Math.max(d2, 0)) - r;
}
export function torus(x, y, z, cx, cy, cz, axis, R, r) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const a = axis === 'x' ? px : axis === 'y' ? py : pz, h = axis === 'x' ? Math.hypot(py, pz) : axis === 'y' ? Math.hypot(px, pz) : Math.hypot(px, py);
  return Math.hypot(h - R, a) - r;
}
