# Whiteboard marker explainer

**Good for:** a derivation or a formula written term by term, a control loop or a data
pipeline drawn as one connected board, a proof step by step, a callback to an earlier result,
two quantities drawn side by side by two pens (a setpoint and the step response).

## Look

| Role | Colour |
|---|---|
| board | warm white, diagonal gradient `#fbfbf9` → `#eeede9`; ghost marks `#9aa0a8` at 5 to 10 % |
| ink 1: things and structure | `#23262c` |
| ink 2: signals, measurement, process | `#2a5cb3` |
| ink 3: the one thing that matters (one per region) | `#d97757` |

- Three marker colours at most, each with one meaning for the whole part. An object with a colour role in the video (library `C`, `K`) keeps that colour as its marker.
- Ink: lines 6 to 11 px, alpha 0.94, `multiply` so overlaps go darker. Each stroke has a slow wobble, a thicker start, a small end taper and a dark ink dot inside the start. Circles start at an angle and overlap by 0.22 rad; rectangles are four strokes with 6 px corner overshoot.
- A diagonal window sheen (white, 10 to 16 %) moves at 0.35 × the camera speed: the board looks glossy.
- Props: a floating marker (white barrel, cap in the ink colour) with a soft shadow, a felt eraser, round magnets. A magnet can carry the hero (draw a `face` from `common.js` on it). No hands or cursors.
- Type: handwriting only, written on the board in `Architects Daughter`: labels 40 to 70 px, title 100 px or more, all above y 940 on screen.

## Motion

- Each stroke follows a slow-fast-slow hand curve, `h = u − sin(2πu) / 2π × 0.8`. A label takes 0.3 to 0.8 s, a title about 3 s. Writing ends on the word the narrator says (`s.at('word')`).
- Between strokes the pen lifts in proportion to the distance and its shadow grows. After a long gap it parks outside the frame.
- Only magnets move on the board: they drop (the shadow shrinks) or slide with a small lift. The eraser moves at constant speed on a 150 px zig-zag at 90 % strength, so a ghost stays; erasing backwards reads as "undo".
- One large board (about 4000 × 2250 px), no cuts. The camera rides the line the pen draws, holds still on an equation and returns to an earlier region for a callback. Interpolate zoom in log scale.
- A sound would mark each stroke start and each magnet click.

## With the house look

- **Header**: `header()` with `font: 'Architects Daughter'`, `tWeight: 400`, kicker in ink 3 `#d97757`, for example `THE RULE · PROPOSAL §4.1`. Write both on with the pen.
- **Words**: one region of the board per frame: a formula or a diagram, at most 3 hand-written labels. Older regions leave the frame as the camera travels; they are not erased into a text wall.
- **Character**: a magnet can carry the hero with a `face()`; draw faces in marker (ink 1).
- **Background**: the warm white board, light.
- **Colour roles**: an object with a role keeps it as its marker colour; ink 3 is still the one thing that matters.
- **Hand-over**: end on the finished region, then `endWipe()` from the last magnet in the next part's background.

## Avoid

Hands or cursors, more than three inks, text that fades in as a block, perfect circles and straight lines, labels cut by the frame edge, an eraser path across labels that must stay.

## Build

One canvas. In `setup`, make each stroke a point list with a fixed seed and give it `t0`, `t1` from
cues. A hand line: `resample(pathFrom(wobble(coarse, 3, seed), false), n)`, coarse points 60 px apart.
Write text glyph by glyph behind a diagonal clip. Check canvas text on the contact sheet.
```js
scene('board', { bg: '#f4f3ef',
  setup(s) { s.ctx = s.canvas(); s.strokes = buildStrokes(s); },             // [{pts, t0, t1, color, w}]
  draw(s) {
    const c = s.ctx, cam = boardCam(s.t); c.setTransform(1, 0, 0, 1, 0, 0); drawBoard(c, cam);
    c.setTransform(cam.z, 0, 0, cam.z, 960 - cam.x * cam.z, 540 - cam.y * cam.z); c.globalCompositeOperation = 'multiply';
    for (const k of s.strokes) { const u = clamp((s.t - k.t0) / (k.t1 - k.t0)); if (u <= 0) continue;
      const h = u - Math.sin(2 * Math.PI * u) / (2 * Math.PI) * 0.8;
      strokeVar(c, polySlice(k.pts, h * polyLength(k.pts)), (v) => k.w * Math.min(1, 0.75 + v * 2), k.color); }
    c.globalCompositeOperation = 'source-over';
  } });
```

Adapted from lemo-opuscar `styles/whiteboard/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
