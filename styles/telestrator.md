# Telestrator (draw on footage)

**Good for:** the user's own demo footage or lab video (a robot pick that fails, a drone landing,
a test rig), a photo of a board or a set-up, a screenshot of a plot or an oscilloscope, a
simulation recording. Show it, freeze it, draw on it: one finding per freeze.

## Look

| Role | Colour |
|---|---|
| the thing we follow (robot, gripper, signal) | `#ffd400`, or the object's colour role |
| the other side (an obstacle, a disturbance) | `#3fd8ff` |
| the gap or the fault | `#ff3b30`, fill at 0.34 to 0.38 with a dashed edge |
| traced lines, neutral marks; label card | chalk `#f4f1e8`; `rgba(8, 12, 14, 0.9)` with an 8 px bar in the role colour |

- The picture is a still or a short clip in `assets/`. It fills the frame and has one grade.
- Marker line: a dark outline (width + 6, black at 0.55), a coloured core 9 to 10 px with a glow (`shadowBlur` 18), a thin white highlight (0.28 × width), a small fixed wobble at the vertices. Solid for what happened; dashed `[26, 16]` for a planned or expected path.
- Ring under an object: a perspective ellipse (ry = 0.36 r) drawn clockwise, plus an outer dashed ring `[16, 14]` that turns at 60 px/s. Spotlight: darken outside a focus ellipse to 0.42 (even-odd hole), 0.3 s fade.
- Labels: printed type, no handwriting. `Inter` 800, 40 px, 1 to 4 words on the black card, in empty space, never over the action.
- Optional source clock, top left: `❚❚ 04.20 s  F106` in `JetBrains Mono` 700, 32 px. Times come from frame counts only.
- Footage is not a dark background, but a dark board page is. For the flattened top-down board, use paper `#f4f1e8`, grid `#d9d4c7`, lines `#2b2d42`.

## Motion

- Order: play at 1× → freeze → draw → slow play (0.6 to 0.85×, two neighbour frames blended) → a second freeze. The viewer sees the action before the explanation.
- Freeze entry: a white flash for 0.1 s (0.55 alpha), a punch from 1.035 to 1.0 in 0.35 s (`E.out`), 42 % less saturation, then a slow 1.2 % push. Overlays use the same transform as the picture.
- One freeze, one finding: 1.8 to 2.4 s, at most two groups of lines and one label. Draw ring (who) → line or area (what happened) → label, 0.3 to 0.6 s apart. The arrowhead pops in over the last 10 % of the line.
- Rewind: the clip reversed in 0.6 s with ±13 px horizontal jitter and a ◀◀ sign. Trails keep only the last 0.6 s.
- Perspective flatten (once, optional): fit a homography to 4 or more known points (a table's corners, floor tape) and move a triangle mesh of the image to a top-down board. A sound would mark each freeze and each ring.

## With the house look

- **Header**: `header()` with the default font over a dark card strip (`rgba(8, 12, 14, 0.9)`) at the top left of the footage, kicker in the role colour of the thing we follow, for example `THE FAILURE · RUN 14, FRAME 106`.
- **Words**: one finding per freeze: one label card of 1 to 4 words, the source clock, and the header. Nothing else on the footage.
- **Character**: the footage is real, so no face on it. A character from the other parts can appear in the label card's corner as a small `face()` that reacts to the finding.
- **Background**: footage is neither light nor dark; a dark board page counts as a dark part, so prefer the light board `#f4f1e8` for the flattened top-down view.
- **Colour roles**: the marker colour of the thing we follow is its role colour in the other parts (the tank stays orange).
- **Hand-over**: end on the last freeze, then `endWipe()` from the ring in the next part's background.

## Avoid

Explaining before the viewer sees the action, tracking points read off a scaled image, overlays outside the punch transform, numbers the footage cannot support, handwriting fonts, frozen bystanders, logos and broadcast graphics.

## Build

One canvas. Cut the clip to JPEG frames with ffmpeg (`assets/clip/0001.jpg`, 30 fps, about 4 s).
Load each frame on demand in an `async draw` with a small cache (120 decoded 1080p frames use
about 1 GB). Key the object's ground point by hand every 3 to 6 frames and interpolate (`track`).
```js
scene('fail', {
  setup(s) { s.ctx = s.canvas(); s.cache = new Map(); },
  async draw(s) {
    const c = s.ctx, fz = s.at('#freeze'), f = Math.min(119, Math.floor(Math.min(s.t, fz) * 30));  // play, then hold
    const im = await frame(s.cache, `/assets/clip/${String(f + 1).padStart(4, '0')}.jpg`);
    const z = s.after('#freeze') ? 1 + 0.035 * (1 - s.p('#freeze', 0.35, E.out)) : 1;
    c.setTransform(z, 0, 0, z, 960 * (1 - z), 540 * (1 - z)); c.drawImage(im, 0, 0, W, H);
    const [x, y] = track(GRIP, f); ring(c, x, y, 44, '#ffd400', s.p('#freeze', 0.4), s.t);   // same transform
    marker(c, PATH, s.p(fz + 0.4, 0.6), '#ff3b30', 10, { dash: [26, 16], arrow: true });
    c.setTransform(1, 0, 0, 1, 0, 0); flash(c, s.t - fz);
    s.trace('gripper', x * z + 960 * (1 - z), y * z + 540 * (1 - z), { r: 44 });   // stage px
  } });
```

Adapted from lemo-opuscar `styles/telestrator/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
