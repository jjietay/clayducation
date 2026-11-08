# Isometric miniature world

**Good for:** robot cells, hardware boards and wiring, a pipeline where each stage is a
building, data flowing through a system, "what happens inside" explanations.

## Look

| Role | Colour |
|---|---|
| background | `#eef2f3` |
| ink (lines, labels) | `#2d3142` |
| accent (the thing under study) | `#ef8354` |
| shades | `#4f5d75`, `#bfc0c0` |

- Orthographic camera at true isometric angles. It slides but never rotates into perspective.
- Every block has three flat tones: light top, mid left, dark right.
- Labels use thin leader lines (2 px, `#2d3142`) to a label in `Space Grotesk` 600, 36 to 44 px.

## Motion

- Pieces drop in from 40 px above with a small bounce (`E.settle`), staggered by 3 frames (0.1 s).
- To explain a step, lift the roof off a building (up 120 px, 0.5 s, `E.inOut`) and show the process inside.
- The camera slides (pans) with `E.inOut` over 1 to 1.5 s between buildings.

## Avoid

Perspective, rotation, gradients, shadows other than the flat dark side, labels without leaders.

## Build

Canvas: `isoBox(ctx, { x, y, z, w, d, h, top, left, right, tile: 48, ox, oy })`. Draw back to front (sort by x + y, then z).
A drop: `z: base + (1 - E.settle(s.p(cue + i * 0.1, 0.5, E.linear))) * (40 / tile)`.
Three.js: `await s.three({ ortho: true, view: 12 })`; pan by moving the camera and its target together, never orbiting.
