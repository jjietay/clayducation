# Isometric infographic (a process map with numbers)

**Good for:** a process laid out as one map, where each station carries a number and the numbers add
up to a total: a data pipeline (collect, label, train, deploy) with the samples at each stage, a
dataset by source, the latency budget of a request (ms per hop), the cycle times of a production
line, the cost of a robot by subsystem. Pick it over `isometric.md` when the numbers and their total
are the point and the part ends on a finished map that reads like a printed infographic. Pick
`isometric.md` to show what happens inside one machine (roofs lift, no totals).

## Look

| Role | Colour |
|---|---|
| ground (background) | cream `#f2e6d0` with a faint isometric dot lattice |
| board top (top / left / right) | `#fbf4e6` / `#f2e6d0` / `#d9c8a9` |
| board edge strata | soil `#a77850` / `#8a5b3a` / `#6a432a` |
| ink: route, leaders, pins, labels | `#2e2522` |
| hues, three tones each | red `#cf5140` / `#b3352b` / `#8c2620`; green `#7ba75f` / `#5e8c4a` / `#476f37`; blue `#5a9bcb` / `#3c7fb1` / `#2d6390`; mustard `#e9be5c` / `#d9a53a` / `#b0832a` |

- True isometric through the engine's `iso()` (x down-right, y down-left, z up, axes at 30°). The projection never rotates or tilts. Draw back to front by x + y + z.
- Three tones per face, no outlines on solids: top light, left mid, right dark. Derive other hues with `tri`: top = mix toward `#fff7e6` by 20 %, right = mix toward `#231a2c` by 22 % (shadows slightly cool).
- 5 to 7 hues, one meaning each (water is always the same blue). Objects with a colour role use it (library `C`, `K`). No legend: every hue is named on the map.
- The board floats on the ground with a soft shadow; its two front faces show strata (soil, a cable duct, a floor slab). Lay the route as a Z across a square board: a square board projects to almost exactly 16:9, so the final pull-back fills the frame.
- A station: a pale cream plate with a dashed ink outline and one accent hue; keep other buildings low. People are minimal billboards (round head, tapered two-tone body, a thick arm stroke), stepping at 12 fps. Only the hero gets a face (see below).
- Ink lines (2 px) only for infographic furniture: the dashed route, leaders, pins, cut lines, tracking rings.
- Label pin: a dot (ink ring, cream fill), a vertical leader, a horizontal rule, then a name in caps (`Space Grotesk` 700, 36 px, tracking 0.12 em) and a number (`Inter` 300, 64 px, unit at half size). All text has a 7 px halo in the ground colour.
- Isotype numbers: identical icons, one icon = one stated unit, in a new arrangement at each station (a grid, a bar, a shape made of the icons). The station numbers add up to the total; the end shows the total with one bar in the same proportions.
- Word budget: at most 4 stations in one part, one word and one number each; at most 3 labels in view at once.

## Motion

- Nothing moves without a line leading it: the route draws a little ahead of the story, a leader grows before an inset opens, a cut line draws before a skin slides away.
- Cutaway: cut line in 0.3 s, the near skin slides out along its normal in 0.35 s (`E.out`), hatched section rims remain.
- Isotype fill: icons pop with a back-ease (overshoot 2.2), one every 0.1 s; the counter runs over the same span and lands on the exact value.
- Accumulation is acceleration: arrivals one at a time, then in pairs, then in waves. Solids arrive by motion, never by fading.
- Objects perform: 18 % squash on landing and two small bounces; a colour change shows a process step (raw → done). Vehicles follow polylines with `E.inOut` and face their tangent.
- Focus and context: at the key moment everything except the subject fades toward warm grey.
- Camera: a world centre plus a zoom k (px per unit), with zoom interpolated in log scale. Follow the route, hold wide with a circular inset for a detail, end with a fast pull-out to the whole board: every station, the route and the total in one frame. Fade tall objects in by zoom (`clamp((80 − k) / 40)`) so a pull-out never sweeps a giant shape through the frame.
- With sound effects on (`SOUND.md`), `s.sfx` marks each icon that pops.

## With the house look

- **Header**: `header()` in `Space Grotesk`, kicker in ink, for example `THE PIPELINE · DATA CARD`. The total can be the title on the final map.
- **Words**: one word and one number per station, at most 3 stations labelled in one frame; the pull-out frame shows names and the total only.
- **Character**: the tracked subject (a parcel, a sample, a robot) carries a `face()` and follows the route; the people stay faceless billboards.
- **Background**: cream ground, light.
- **Colour roles**: hues follow the video's roles (library `C`, `K`); the hero's hue is the same as in the other parts.
- **Hand-over**: end on the pull-out to the whole board, then `endWipe()` from the total in the next part's background.

## Avoid

Perspective or rotation, outlines on solids, semi-transparent moving solids (they look like ghosts), numbers that do not add up, a colour legend, giant detail behind a close-up (skip small detail at high zoom), a machine with a house silhouette, bullet lists.

## Build

One canvas with `iso()` and `isoBox()` (library `iso.js` has `isoPlate`). Port `pin`, `inset`, `iconGrid`, `cutLine`, `hatch`, `ring` and `tri` from the source `engine.js` (see `opuscar-porting-notes.md`).
```js
scene('pipeline', { bg: '#f2e6d0', setup(s) { s.ctx = s.canvas(); },
  draw(s) { const c = s.ctx, u = s.p('#push', 1.2, E.inOut), k = Math.exp(lerp(Math.log(18), Math.log(42), u)); // zoom in log scale
    const [cx, cy] = [lerp(0, 3, u), lerp(0, -2, u)], O = { tile: k, ox: 960 - (cx - cy) * k * 0.866, oy: 470 - (cx + cy) * k * 0.5 };
    c.clearRect(0, 0, W, H); isoBox(c, { ...O, x: -6, y: -6, z: -1, w: 12, d: 12, h: 1, ...TRI.cream });       // the board
    for (const b of [...STATIONS].sort((p, q) => p.x + p.y - q.x - q.y))
      isoBox(c, { ...O, ...b, z: 7 * (1 - E.settle(s.p(b.cue, 0.6, E.linear), 2)), ...TRI[b.hue] });       // drops in, lands, settles twice
    route(c, O, ROUTE, s.p('#route', 6, E.linear));                                                     // dashed ink, a little ahead of the story
    STATIONS.forEach((b) => pin(c, iso(b.x + b.w / 2, b.y + b.d / 2, b.h, O), b.name, b.value, s.p(b.cue, 1.2, E.linear)));
    iconRow(c, 1180, 820, TOTAL, TOTAL * s.p('#total', 1.5, E.linear));                                 // lit count may be fractional: the next icon pops
  } });
```

Adapted from lemo-opuscar `styles/iso-infographic/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
