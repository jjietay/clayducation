# Watercolour and ink

**Good for:** gentle intuition scenes, nature analogies, a reflective "why this matters" part; one
specimen with hand-written notes (a sensor, a gear, a tool kit); a gradient read across space and
painted as a transect (heat along a heat sink, signal strength across a room, rainfall by region);
a painted map whose fills change in time.

## Look

| Role | Colour |
|---|---|
| paper (the only white) | `#f4efe6`, seeded noise ±3.5 %, a few thousand short fibres, 5 % vignette |
| ink: lines, text, edges; branches and stems | `#2e2a26`; `#3d3129` |
| washes | `#7fa7c9`, `#d98e73`, `#9bbf85`, `#e7c46b` |
| one accent for one recurring thing | vermilion `#cf4f2c` or rain blue `#3f7fa8` |

- Paper is the white: never paint pure white or pure black. 3 to 5 hues per scene plus ink. Darker means more passes, not a darker pigment. An object with a colour role (library `C`, `K`) keeps that hue as its pigment.
- Everything is a brush stroke: a ribbon whose width follows a profile (brush, leaf, even, tip, trunk) with ±22 % roughness, filled at 0.55 to 0.6 opacity, plus 3 to 9 thin bristle tracks at 30 to 85 % opacity with random dash patterns and early ends (dry-brush streaks). Strokes darken where they cross.
- No vector outlines. A darker edge stroke along one side of a form is the only line.
- Washes: low opacity (0.25 to 0.45), layered; the same polygon painted in 3 passes with jittered vertices at a third of the opacity each, so the edges pool darker. Washes bleed 4 to 8 px past the ink.
- Depth by layers: farther is smaller, lighter and less saturated, with paper-coloured mist bands between layers.
- Colour may carry the data: blend sky or ground by a measured value, quantised into 4 to 6 bands. A continuous ramp reads as software.
- Notes in `Kalam` (36 to 48 px) over a paper halo, with a pen leader that grows to the subject; titles in `Instrument Serif`; measured values in `JetBrains Mono` 28 px with wide tracking.

## Motion

- Painting-in is the main motion: each object's strokes take slices of its progress, structure first (outline wash, then shadow, then accent; trunk, then branches, then leaves). A stroke can stop at any fraction of its length: the brush tip moves.
- Washes reveal over 15 to 25 frames. A whole group may burst in within 1 s for a peak.
- Finished objects hold still or sway: a horizontal skew of `0.006 · (sin(1.15t + φ) + 0.4 sin(2.7t + 2φ))` for a tree, up to 0.03 for grass.
- Ink linework may boil 12 times a second from a seed (`s.boil(3, 12)`) when the part needs a hand-made feel; washes never boil. The source keeps everything still.
- Transitions: a brush-edge wipe (a wavy vertical clip), a mist erase (a paper-coloured layer with a wavy rising edge), a new sheet that slides over. No hard cuts, no dissolves.
- Camera on one painted sheet: a long lateral dolly for a transect, a tilt along one tall object, a locked sheet while things paint in, a slow push into a note, a pull back to a map.
- With sound effects on (`SOUND.md`), `s.sfx` marks each brush pass.

## With the house look

- **Header**: `header()` with `font: 'Instrument Serif'`, `tWeight: 400`; kicker in the ink colour, for example `WHY IT MATTERS · FIELD NOTES`.
- **Words**: one specimen or one landscape; at most 3 hand-written notes in view, 1 to 4 words each.
- **Character**: a painted creature or object can get a `face()` in ink (`ink: '#2e2a26'`, `eyeFill` = the paper colour), painted in with the last stroke.
- **Background**: paper, light.
- **Colour roles**: an object with a role keeps that hue as its pigment; the one accent is a recurring thing from the other parts.
- **Hand-over**: a brush-edge wipe or a mist erase in the next part's background, or `endWipe()` from the last painted object.

## Avoid

Hard vector edges, saturated colour, flat fills, painted white, continuous colour ramps, a wash that ends at its canvas edge (extend it past the frame and fade it to paper), strokes made in `draw` without a fixed seed.

## Build

Canvas. Make the paper and every stroke in setup with `rng(seed)`; cache each finished object as an offscreen canvas and draw stroke by stroke only what is painting in (port `mk`, `drawS`, `drawList`, see `opuscar-porting-notes.md`). A wash: several `wobble`d copies of the shape filled at low opacity, each 4 to 8 px larger, revealed with a growing clip. A stroke painted to fraction p:
```js
const n = Math.max(2, Math.ceil(pts.length * clamp(p))), part = pts.slice(0, n);              // pts: centre line from setup
strokeVar(c, part, (u) => w * Math.min(1, u / 0.1 + 0.3) * Math.pow(1 - u * 0.85, 0.6), `rgba(127,167,201,${0.55 * a})`);  // brush profile
```

Details added from lemo-opuscar `styles/watercolor/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
