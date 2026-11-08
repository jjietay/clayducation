# Signal graph

**Good for:** neural networks (forward pass, backprop), attention and transformers, message
passing, multimodal model architecture (image encoder → projector → LLM), agent and tool-call
loops, robot software pipelines.

Things are nodes, data is pulses. The viewer follows a pulse along an edge and sees where
the computation happens.

## Look

| Role | Colour |
|---|---|
| background | `#0b1020` |
| idle edge | `#2c3550`, 2 to 3 px |
| node | fill `#1a2240`, outline `#e8ecf8` 3 px |
| active signal / pulse | `#ffb000` |
| second signal type (e.g. image tokens vs text tokens) | `#39d0c8` |
| negative / error / gradient | `#ff5d73` |
| labels | `#e8ecf8`, `Space Grotesk` 600, 36 to 44 px, thin leader lines `#55607f` 2 px |

- Layers in columns from left to right, data flows left to right.
- Node radius 22 to 36 px. Blocks (encoders, the LLM) are rounded rectangles, radius 18 px.
- Edge width or opacity = weight (attention strength). State this mapping in the narration.

## Motion

- A pulse is a 10 to 14 px dot that travels an edge linearly in 0.4 to 0.6 s.
- A node fills with the signal colour when its pulse arrives (0.2 s), then stays lit.
- Activation moves one layer at a time: the next layer starts when the previous one ends.
- For attention, first show all edges from one query token at equal width, then let the
  widths grow to the attention weights over 1 s on the cue word.
- Backprop: the same edges, right to left, in the error colour.

## Avoid

All edges active at once (the eye cannot follow). Edges crossing a label. More than about
40 visible edges: group them into a block. Random weights: use numbers that make the point.

## Build

```js
const layers = [3, 4, 4, 2], X0 = 360, DX = 400, nodes = [];
layers.forEach((n, L) => { for (let i = 0; i < n; i++) nodes.push({ L, i, x: X0 + L * DX, y: 540 + (i - (n - 1) / 2) * 150 }); });
const edges = [];
for (const a of nodes) for (const b of nodes) if (b.L === a.L + 1) edges.push([a, b]);

scene('forward', {
  bg: '#0b1020',
  setup(s) { s.ctx = s.canvas(); },
  draw(s) {
    const c = s.ctx, t0 = s.at('#go'), per = 0.6;
    c.clearRect(0, 0, W, H);
    for (const [a, b] of edges) {
      c.strokeStyle = '#2c3550'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
      const k = (s.t - t0 - a.L * per) / per;            // this layer's pulses
      if (k > 0 && k < 1) { c.fillStyle = '#ffb000'; c.beginPath(); c.arc(lerp(a.x, b.x, k), lerp(a.y, b.y, k), 7, 0, 7); c.fill(); }
    }
    for (const n of nodes) {
      const lit = s.t - t0 >= n.L * per;
      c.fillStyle = lit ? '#ffb000' : '#1a2240'; c.strokeStyle = '#e8ecf8'; c.lineWidth = 3;
      c.beginPath(); c.arc(n.x, n.y, 28, 0, 7); c.fill(); c.stroke();
    }
  },
});
```
