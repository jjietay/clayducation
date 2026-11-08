# Paper cut-out collage

**Good for:** stories and demos: a robot doing a task step by step, "your case", a
history of an idea, the user's live demonstration.

## Look

- Card colours `#e9e3d5`, `#e76f51`, `#2a9d8f`, `#f4a261` with black `#1b1b1b` details.
- Every piece has a slightly rough white cut edge (draw the shape wobbled and 6 px larger in white under it) and a small hard shadow on the layer below (offset 6 px, `rgba(0,0,0,0.25)`, no blur).
- Paper texture: a seeded noise of small dots at 3% opacity on the background.

## Motion

- Characters move in stop-motion steps at 12 fps (`s.tq(12)`) with split-pin joints (parts turn about one pin point).
- The camera drifts smoothly (not stepped) across 3 to 6 parallax layers: a layer at depth d moves by `cam / d`.

## Avoid

Smooth character motion, soft shadows, gradients, perfect vector edges.

## Build

Canvas. Each piece is a point list; its rough edge is `wobble(pts, 2, fixedSeed)` with a
fixed seed (paper does not boil). Joints: `ctx.translate(pin); ctx.rotate(angle); ctx.translate(-pin)`.
