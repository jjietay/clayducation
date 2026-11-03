// Risograph parts (style: styles/risograph.md). Three inks multiply; each plate has a fixed offset.
// import { RI, rInk, halftone, kickAt } from '/_lib/riso.js';
export const RI = { blue: '#0078bf', pink: '#ff48b0', yellow: '#ffe800', paper: '#f5f1e8' };
const ROFF = { blue: [0, 0], yellow: [3, -2], pink: [-3, 3] };
// Print fn(c) on one ink plate ('blue' | 'pink' | 'yellow'); kick (0..3) pushes the plate off register on an accent.
export function rInk(c, ink, kick, fn) {
  const o = ROFF[ink]; c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = RI[ink]; c.strokeStyle = RI[ink];
  c.translate(o[0] * (1 + kick), o[1] * (1 + kick)); fn(c); c.restore();
}
// A halftone tint on one plate inside box [x0, y0, x1, y1]; dens(x, y) -> 0..1, screen angle ang, dot period P.
export function halftone(c, ink, ang, kick, box, dens, P = 8) {
  const o = ROFF[ink], ca = Math.cos(ang), sa = Math.sin(ang);
  c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = RI[ink];
  const [x0, y0, x1, y1] = box, R = Math.hypot(x1 - x0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let v = -R; v < R; v += P) for (let u = -R; u < R; u += P) {
    const x = cx + u * ca - v * sa, y = cy + u * sa + v * ca;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    const d = dens(x, y); if (d < 0.03) continue;
    c.beginPath(); c.arc(x + o[0] * (1 + kick), y + o[1] * (1 + kick), d >= 0.9 ? P * 0.75 : P * 0.56 * Math.sqrt(d), 0, 7); c.fill();
  }
  c.restore();
}
// A registration kick: 0 before t0, a damped ring for 0.4 s after it.
export const kickAt = (t, t0) => { const d = t - t0; return d > 0 && d < 0.4 ? 3 * Math.exp(-d * 12) * Math.cos(d * 40) : 0; };
