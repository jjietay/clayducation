# Exploded teardown

**Good for:** how a device is built (a sensor module, a robot joint, a keyboard, a drone arm), a
stack of layers (case, PCB, plate), where a hidden part sits, the real dimensions of a part, one
real mechanical motion (a key press, a hinge, a latch).

## Look

Light studio variant. The source uses a dark graphite sweep `#34363a` → `#0d0e10` with ink
`#f1efe9`; that version counts as a dark part.

| Role | Colour |
|---|---|
| studio background | `#ece9e3`, a soft vignette to `#d9d5cd` at the corners |
| label names; spec lines | `#23262c`; `#5b5e66` |
| accent: dimension lines, label index, one matching detail on the product | `#ff6b3d` |

- Build the geometry from Three.js primitives (boxes, cylinders, extrusions) at published dimensions; the engine has no STEP, STL or glTF loader. Say in the narration that it is a model, and show no number you cannot source (datasheet, BOM, your own measurement).
- Materials (`MeshStandardMaterial`): plastic roughness 0.55 to 0.7; metal roughness 0.35, metalness 1; matte rubber. Lift black plastic to dark grey. Product colours follow the video's colour roles; the product is the most saturated thing in the frame.
- Light: a warm key from front-top (the only shadow light), a cool rim from behind, a soft hemisphere fill. Contact shadow only.
- Labels: an anchor dot, a leader (diagonal, then horizontal), a two-digit index in the accent, the name, one spec line. Names `Inter` 600, 36 to 40 px; specs and index `JetBrains Mono`, 28 px or more (the source used 15 to 22 px). Labels stand in a column on the free side, above y 940.
- Dimension lines follow the scene's perspective, with end ticks; the value sits on a small plate, never upside down.

## Motion

- Separation: smooth start, fast middle, long settle (cubic in-out, 1.25 s per layer). The top layer leaves first, the next 0.15 to 0.2 s later. Repeated parts (keys, screws, cells) rise in a wave ordered by distance from one corner.
- While apart, layers float 1 to 2 mm with offset phases; in a close-up they hold still.
- Closing: bottom first, about 1 s per layer. The last layer lands with its real response (a key travels its 4 mm stroke and comes back). Only rubber bounces.
- Labels draw in (dot, leader grows in 0.38 s, text slides 10 px) and fade out before parts move again. At most 3 labels in view; a short label (one word) still needs its full reading time.
- The camera keeps moving: orbit while layers separate, push in on the part that matters, go between two layers, pull back fast to close. Use a monotone curve through camera keys, so a held stop holds. With sound effects on (`SOUND.md`), `s.sfx` marks each lift and each landing.

## With the house look

- **Header**: `header()` with the default font, kicker in the accent `#ff6b3d`, for example `INSIDE · BNO085 DATASHEET`.
- **Words**: one layer or one part explained at a time: at most 3 labels (index, name, one spec line each) and one dimension in view.
- **Character**: no face on the model of a real product. If the video has a hero character, it can watch from the side in the closing pull-back.
- **Background**: the light studio. The dark graphite variant counts as one of the two dark parts.
- **Colour roles**: product colours follow the video's roles; the accent is only for dimensions and the label index.
- **Hand-over**: close the stack, let the one real motion play, then `endWipe()` from the product in the next part's background.

## Avoid

Invented numbers, logos on chips and parts, parts from two revisions, camera splines that overshoot, text on a busy part without a backing plate, more than one accent, fast spins.

## Build

Three.js through `world(s, { bg })` from the library `toy3d.js`. Hide parts with `showK`, never
`visible = false`. Draw labels on a canvas above it at projected points (`g.wp(obj)`).
```js
scene('stack', {
  async setup(s) { const g = s.g = await world(s, { bg: '#ece9e3' }); s.ctx = s.canvas({ z: 5 });
    s.layers = LAYERS.map((L) => { const m = g.box(8, L.h, 5, L.color); m.position.y = L.y; g.scene.add(m); return m; });
    await g.ready(); },
  draw(s) {
    const g = s.g, c = s.ctx, n = s.layers.length; c.clearRect(0, 0, W, H);
    s.layers.forEach((m, i) => {
      const up = s.p(s.at('#apart') + (n - 1 - i) * 0.18, 1.25, E.inOut) * (1 - s.p(s.at('#close') + i * 0.36, 1.0, E.inOut));
      m.position.y = LAYERS[i].y + up * LAYERS[i].lift; });
    g.orbit(35 + 20 * s.p('#apart', 4, E.inOut), 28, 18, [0, 2, 0]);
    leaderLabel(c, g.wp(s.layers[1]), [1380, 420], '02', 'PCB', '1.6 mm', s.p('#pcb', 0.4));
    s.trace('pcb', ...g.wp(s.layers[1]), { r: 60 }); g.render();
  } });
```

Adapted from lemo-opuscar `styles/teardown/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
