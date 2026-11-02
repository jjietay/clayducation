# Data story

**Good for:** results, measurements, before and after, model accuracy, latency, training
curves, returns in RL, histograms; one run or one sample followed among many (one dot is one fact);
a long record drawn mark by mark (loss per epoch, a sensor reading per day).

## Look

| Role | Colour |
|---|---|
| background (paper) | `#f7f7f2`; a faint 24 px dot grid `#e4ddcf` |
| ink, axes | `#22223b`, axes 2 px; gridlines `#ddd6c9` 1 px; zero line `#bdb4a5` |
| the series that matters | `#e85d04` |
| other series | `#9a8c98` |
| values around a reference (diverging) | `#2166ac` → `#92c5de` → `#f2eee8` (centre) → `#f4a582` → `#b2182b` |
| pencil leads: notes; records and warnings | blue `#2f5d8a`; red `#a8283a` |

- One chart per screen, the one the data asks for: bars for categories, a scatter for two measures, a line or dots for time, a histogram for a distribution, a slope chart for before and after, a unit chart for parts of a whole.
- Colour encodes one thing: the value, or the object's colour role (library `C`, `K`). A diverging ramp centres on the mean of a stated reference period with a symmetric span. Pale values stay pale; never stretch a ramp to make a change look bigger.
- Axis labels at least 28 px; tick numbers `JetBrains Mono` 28 px `#6e665c`; values 36 px or more, `Inter` 600.
- Start bar axes at zero. Label the series on the chart, not in a legend. Data dots have a thin ink ring, so pale values show on the paper.
- Notes: `Kalam` 36 to 40 px in a pencil colour, pinned in data space (value + pixel offset) so a rescale keeps the layout. A wobbly leader ends in an open ring around the mark. Earlier notes move to a memory zone.
- The title is the chart's headline: `header()` with `font: 'Instrument Serif'`, above the plot.
- A performer draws the marks: a red and blue pencil (hex body, wood cone `#e3c79c`) that enters from the lower right; its shadow drifts farther and softer as it lifts.

## Motion

- Bars grow in 20 frames with `E.out`, staggered by 3 frames.
- Lines draw left to right over 1 to 2 s, or mark by mark on a beat grid; to speed up, divide the beat, not the tempo.
- A mark lands with a short pop and a thin ripple; leave out ripples when marks come closer than 0.1 s.
- Counters roll and land on the exact value (format with the right decimals).
- The important value gets the accent colour on the word that names it.
- The pencil acts: it lifts before each tap, lands with its shadow meeting the tip, rebounds a little, hurries as the data gets dense and hovers before a key mark. A change of lead (blue → red) marks a turn.
- The y axis grows when the narration first names the unit. A rescale is a few eased steps. A morph (bars into a unit chart) is a staggered sweep. When a value breaks out of the plot, hold the broken frame for half a beat before the rescale.
- Camera: a 2D view over one sheet. Track the newest mark at 60 % of the width, dive from the full view to one mark, pull back as the axes grow. When an axis scrolls off, pin its ticks at the frame edge. No fades to blank.
- A dashed empty cell marks the next value that nobody knows yet.
- A sound would mark each mark that lands, its pitch from the value.

## With the house look

- **Header**: `header()` with `font: 'Instrument Serif'`, `tWeight: 400`; the kicker names the source of the data, for example `THE EVIDENCE · I-JEPA TABLE 7`.
- **Words**: one chart, labels on the series, at most 2 pencil notes in view (older notes move to the memory zone and fade). About 15 words with the axis titles.
- **Character**: the pencil is the performer. The mark that matters can get a small `face()` (a bar or a dot with eyes), as in the JEPA video.
- **Background**: paper, light.
- **Colour roles**: a series that is a known object takes its role colour; the accent `#e85d04` is only for the value that matters.
- **Hand-over**: end on the full chart with the key value ringed, then `endWipe()` from that value in the next part's background.

## Avoid

Made-up numbers (only use the data you were given or measured), 3D charts, pie charts with more than 3 slices, dual axes, legends, stretched colour ramps, notes that collide with later data, a pencil body over fresh marks (steepen it).

## Build

Canvas, with scales written by hand: `const y = (v) => y0 - (v / vmax) * h`. A counter:
`(target * s.p(cue, 0.67, E.out)).toFixed(1)`. Port `pencilStroke`, `handText`, `dataDot` and `drawPencil` (see `opuscar-porting-notes.md`). A mark that lands:
```js
const fresh = s.t - m.tLand; if (fresh >= 0) { const r = 9 * (1 + 0.35 * Math.sin(Math.PI * clamp(fresh / 0.18)));
  c.fillStyle = m.color; c.beginPath(); c.arc(x(m.t), y(m.v), r, 0, 7); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#22223b'; c.stroke();
  if (fresh < 0.6 && m.ripple) { c.globalAlpha = 1 - fresh / 0.6; c.beginPath(); c.arc(x(m.t), y(m.v), 9 + 40 * fresh, 0, 7); c.stroke(); c.globalAlpha = 1; } }
```

Details added from lemo-opuscar `styles/dataviz/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
