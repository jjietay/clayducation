// Mid-century cartoon parts (style: styles/midcentury-toon.md). Fills print off-register; f = Math.floor(s.t * 12).
// import { MC, regOff, toonDot, medallion, presenter } from '/_lib/toon.js';
export const MC = { paper: '#f4ead5', ink: '#2b2420', coral: '#e4613f', coralD: '#b8452b', mustard: '#e8b43a', blue: '#7f9cc0', avocado: '#a7ae5b', shade: '#e6d8bc' };
// The fill offset of one shape for frame f (about 6, 4 px, re-rolled on twos).
export function regOff(f, seed) { const r = rng(f * 97 + seed); return [6 + (r() - 0.5) * 3.2, 4 + (r() - 0.5) * 3.2]; }
// A dot with an off-register fill and a broken ink ring; ring = true draws only a coloured ring.
export function toonDot(c, x, y, r, fill, f, seed, ring = false) {
  const [dx, dy] = regOff(f, seed); c.save();
  if (!ring) { c.fillStyle = fill; c.beginPath(); c.arc(x + dx, y + dy, r, 0, 7); c.fill(); }
  c.strokeStyle = ring ? fill : MC.ink; c.lineWidth = ring ? 4 : 3; c.beginPath(); c.arc(x, y, r, 0.3 + seed % 3, 0.3 + (seed % 3) + Math.PI * 1.7); c.stroke(); c.restore();
}
// A numbered step medallion, popped in by k.
export function medallion(c, x, y, n, k, f) { if (k <= 0) return; const [dx, dy] = regOff(f, 70 + n); c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = MC.coral; c.beginPath(); c.arc(dx * 0.6, dy * 0.6, 40, 0, 7); c.fill(); c.fillStyle = MC.ink; c.beginPath(); c.arc(0, 0, 36, 0, 7); c.fill();
  c.fillStyle = MC.paper; c.font = '800 44px "Plus Jakarta Sans"'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(n), 0, 3); c.restore(); }
// The presenter at the left of the stage (body held, x 180..400, head at 290, 450); one arm reaches to hand = [x, y].
// mood: 'happy' or 'calm'. shirt colours default to grey (keep orange for the objects).
export function presenter(c, hand, f, mood, { shirt = '#8a96a8', shirtDark = '#6b778a' } = {}) {
  const [dx, dy] = regOff(f, 3);
  c.save(); c.fillStyle = MC.shade; c.globalAlpha = 0.5; c.beginPath(); c.moveTo(232, 560); c.lineTo(372, 560); c.lineTo(412, 870); c.lineTo(192, 870); c.closePath(); c.fill(); c.restore();
  c.save(); c.fillStyle = shirt; c.beginPath(); c.moveTo(220 + dx, 548 + dy); c.lineTo(360 + dx, 548 + dy); c.lineTo(400 + dx, 858 + dy); c.lineTo(180 + dx, 858 + dy); c.closePath(); c.fill();
  c.fillStyle = shirtDark; c.beginPath(); c.moveTo(300 + dx, 548 + dy); c.lineTo(360 + dx, 548 + dy); c.lineTo(400 + dx, 858 + dy); c.lineTo(320 + dx, 858 + dy); c.closePath(); c.fill();
  c.strokeStyle = MC.ink; c.lineWidth = 4; c.beginPath(); c.moveTo(220, 548); c.lineTo(360, 548); c.lineTo(400, 858); c.moveTo(180, 858); c.lineTo(214, 600); c.stroke();
  c.fillStyle = '#f7d9b8'; c.beginPath(); c.ellipse(290 + dx, 450 + dy, 72, 88, -0.12, 0, 7); c.fill();
  c.beginPath(); c.ellipse(290, 450, 72, 88, -0.12, 0.5, 5.6); c.stroke();
  c.beginPath(); c.moveTo(352, 440); c.quadraticCurveTo(384, 462, 356, 478); c.stroke();
  c.fillStyle = MC.ink; c.beginPath(); c.arc(318, 425, 6, 0, 7); c.arc(270, 422, 6, 0, 7); c.fill();
  c.beginPath(); if (mood === 'happy') c.arc(312, 488, 20, 0.2, 2.6); else c.arc(312, 500, 14, 3.6, 5.8); c.stroke();
  c.fillStyle = MC.ink; c.beginPath(); c.ellipse(280, 372, 70, 22, -0.1, Math.PI, 0); c.fill();
  c.lineCap = 'round'; c.strokeStyle = MC.ink; c.lineWidth = 30; c.beginPath(); c.moveTo(350, 580); c.quadraticCurveTo((350 + hand[0]) / 2, Math.min(580, hand[1]) - 40, hand[0], hand[1]); c.stroke();
  c.strokeStyle = shirt; c.lineWidth = 22; c.stroke();
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(hand[0] + dx * 0.5, hand[1] + dy * 0.5, 26, 0, 7); c.fill(); c.strokeStyle = MC.ink; c.lineWidth = 4; c.beginPath(); c.arc(hand[0], hand[1], 26, 0.4, 5.9); c.stroke();
  c.beginPath(); c.moveTo(hand[0] + 20, hand[1] - 6); c.lineTo(hand[0] + 50, hand[1] - 10); c.stroke(); c.restore();
}
