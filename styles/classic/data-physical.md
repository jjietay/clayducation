# Data physicalization (stacked pieces)

**Good for:** a number the viewer must feel, built as real objects: the size of a dataset (1 plate
= 10,000 images), the GPU hours of a training run, memory or disk use, samples per class, two counts
on one base (train against test, two sensors), a code base that grows month by month. For axes,
curves and exact readings use `data-story`.

## Look

| Role | Colour |
|---|---|
| studio sweep (background, fog) | `#c4beb4` |
| base (wood, inlaid marks) | walnut `#a88d78`; inlay `#efe4cf` |
| series 1: metal | aluminium `#c8ccd1` |
| series 2: tinted acrylic | teal `#9fd3d6` |
| ruler piece (every 10th, all series) | brass `#d2b07a` |
| ink; labels | `#1c1d20`; the same at 64 % |
| accent: the one reading or verdict that matters | `#d4521c` |

- The unit is an object. One plate, block or coin is one stated quantity; say the rule once on screen ("1 plate = 10 GB"). Every tenth piece is brass, so the stack is its own ruler.
- Scale is exact: counts and heights come from the data; rounding is one piece at most. Two series on one base use the same unit. Where two values are within one piece, say so.
- Material, not paint, separates series: metal against acrylic, pale wood against dark stone. If a series is a known object, tint its material to its colour role (library `C`, `K`). Check the two series apart at thumbnail size.
- Pieces: thin boxes in an `InstancedMesh`, each with a 3 to 4 mm random offset, a small yaw, a ±7 % shade and a hairline gap. This makes a stack read as stacked, not as a bar.
- Light: a warm key `#fff1dc` low from the side (20 to 35°, long soft shadows, the only shadow light), one cool rim `#b9d2ff` from behind so metal and acrylic separate from the wood.
- A reading: a dot on the stack top, a 2 px leader, a small swatch of the material, the category, then the value (`Inter` 300, 48 to 56 px; the hero figure 120 to 150 px) and its unit (`JetBrains Mono` 28 px), on a paper plate at 84 %. A pair stacks in one column, larger value on top.
- The source goes in the kicker (see below), not in a separate line.

## Motion

- Growth is assembly: pieces are placed one after another; a stack never scales or morphs.
- Cascade: a stack builds bottom to top in 0.5 to 1.0 s; piece k lands at `b + L · ((k + 1) / n)^0.85` after a 0.12-unit drop with `E.out`.
- Feed: one period's increase arrives piece by piece from above (height × (1 − u)⁵), its yaw unwinding, 8 to 16 pieces a second. The counter shows landed pieces × unit, never a value by time.
- The last object (a brass puck engraved with the total) falls with gravity and lands with one small damped bounce, `0.012 · e^(−9b) · |sin 26b|`.
- Readings fade in with a 16 px rise while the leader draws; they leave by fading. A verdict appears only after its readings have held still for 2.5 s.
- Never moves: the base, a landed piece, a ruler piece.
- One take; the camera never stops (2 to 5 % creep in holds): a dolly along a stack edge for the unit, a low track along the series, a locked three-quarter view for a pair, a crane that rises with the top, a pull back to a near top view where the stacks become one object.
- With sound effects on (`SOUND.md`), `s.sfx` marks each brass piece as it lands.

## With the house look

- **Header**: `header()` with the default font, kicker in the accent `#d4521c`, for example `THE DATASET · 1 PLATE = 10,000 IMAGES`. The unit rule lives in the kicker, so the picture needs no extra text.
- **Words**: at most 2 readings and one hero figure in view. Each reading is a category of 1 to 3 words and a value.
- **Character**: the stacks are the actors. The last object (the brass puck with the total) can carry a `face()` engraved in ink, `mood: 'happy'` when it lands.
- **Background**: the studio sweep is a light warm grey; keep it light.
- **Colour roles**: tint each series' material to its role colour (library `C`, `K`); the material, not the hue, still separates the series.
- **Hand-over**: end on the pull-back where the stacks become one object, then `endWipe()` from the puck in the next part's background.

## Avoid

Stacks that scale, counters driven by time, two materials that look alike, glow, outlines, fake UI, rainbow series, a dark stage, a legend. On the engine path: `transmission` (slow on the CPU) and metalness 1 with no environment map (it renders black).

## Build

Three.js through `world(s, { bg: '#c4beb4' })` (library `toy3d.js`). Base: `g.cyl(3.35, 0.11, '#a88d78')` with the inlay drawn on a `CanvasTexture` in setup. Use metalness 0.5 for metal, or make an environment once with `PMREMGenerator.fromScene` of a box with two bright panels. One `InstancedMesh` per material; set every matrix from `s.t`.
```js
scene('dataset', { bg: '#c4beb4',
  async setup(s) { const g = s.g = await world(s, { bg: '#c4beb4' }), { THREE } = g, r = rng(7); s.ctx = s.canvas({ z: 5 });
    s.P = PIECES.map((p) => ({ ...p, jx: (r() - 0.5) * 0.007, jz: (r() - 0.5) * 0.007, yaw: p.a + (r() - 0.5) * 0.016 }));   // {x, z, a, k, land}
    s.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.0123, 0.42), g.mat('#c8ccd1', { metalness: 0.5, roughness: 0.3 }), s.P.length);
    s.mesh.castShadow = s.mesh.receiveShadow = true; g.scene.add(s.mesh); s.M = new THREE.Matrix4(); s.Q = new THREE.Quaternion(); s.Y = new THREE.Vector3(0, 1, 0);
    await g.ready(); },
  draw(s) { const g = s.g, { THREE } = g; let n = 0; s.ctx.clearRect(0, 0, W, H);
    s.P.forEach((p, i) => { const u = clamp((s.t - p.land + 0.11) / 0.11), k = u > 0 ? 1 : 1e-4; if (s.t >= p.land) n++;   // hidden by scale before it falls
      s.M.compose(new THREE.Vector3(p.x + p.jx, 0.11 + 0.0125 * (p.k + 0.5) + 0.12 * (1 - E.out(u)), p.z + p.jz), s.Q.setFromAxisAngle(s.Y, p.yaw), new THREE.Vector3(k, k, k));
      s.mesh.setMatrixAt(i, s.M); });
    s.mesh.instanceMatrix.needsUpdate = true; g.orbit(30 + 6 * s.t / s.dur, 24, 9, [0, 0.6, 0]);
    reading(s.ctx, g.proj(TOP), [380, 300], `${(n * UNIT).toLocaleString('en')} GB`, s.p('#total', 0.4)); g.render(); } });
```

Adapted from lemo-opuscar `styles/data-physical/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
