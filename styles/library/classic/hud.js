// HUD terminal parts (style: styles/hud-terminal.md).
// import { HU, roll, hudBrackets } from '/_lib/classic/hud.js';
export const HU = { bg: '#0a0f0d', txt: '#9ef0c0', dim: '#16332a', hi: '#ffcc33', mono: 'JetBrains Mono' };
// Digits of str roll through seeded random digits until tLock, then show the real value.
export function roll(str, t, tLock, seed) {
  if (t >= tLock) return str;
  const f = Math.floor(t * 30), r = rng(seed * 131 + f);
  return str.replace(/[0-9]/g, () => '0123456789'[Math.floor(r() * 10)]);
}
// Four corner brackets around a box (L = corner length). Lock on in steps by drawing a smaller box each step.
export function hudBrackets(c, x0, y0, x1, y1, col = HU.hi, w = 4, L = 28) {
  c.save(); c.strokeStyle = col; c.lineWidth = w; c.beginPath();
  c.moveTo(x0, y0 + L); c.lineTo(x0, y0); c.lineTo(x0 + L, y0); c.moveTo(x1 - L, y0); c.lineTo(x1, y0); c.lineTo(x1, y0 + L);
  c.moveTo(x1, y1 - L); c.lineTo(x1, y1); c.lineTo(x1 - L, y1); c.moveTo(x0 + L, y1); c.lineTo(x0, y1); c.lineTo(x0, y1 - L); c.stroke(); c.restore();
}
