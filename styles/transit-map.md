# Transit map (metro schematic)

**Good for:** data pipelines and message flows (a line = a data path, a station = a stage, an
interchange = a shared node), ROS topic graphs, network routing, a system that grows step by step,
a roadmap, "you are here" in a large architecture.

## Look

Light variant: the paper sheet fills the frame. Leave out the source's near-black table.

| Role | Colour |
|---|---|
| paper | `#f2eee5`; water band `#bcd6ea` with edge `#8fb5d6` |
| ink (text, interchange outlines) | `#1b1c1e`; secondary text `#4a4740` |
| accent ("you are here", the verdict); the thing compared against | `#e3002b`; navy `#24346e` |

- Line colours carry identity only. A line that stands for a known object takes its colour role (library `C`, `K`).
- Grid step G = 100 px at zoom 1. Segments only at 0°, 45° or 90°; every corner has a fillet r 0.34 G. Lines 0.15 G, round caps; parallel lines in one corridor at ±0.10 G.
- Stop: white disc r 0.085 G, ring 0.046 G in the line colour. Interchange: a white stadium around all line points at the station (+0.13 G), ink outline 0.055 G, never turned to 45°.
- Form shows the kind of path, never hue: solid = main path; thin 0.07 G = a second kind; hollow (two edges, paper core) = a slow or batch path; dashed with an ink casing = hidden or async.
- Pen tip: white core r 0.11 G, ring in the line colour, soft halo r 0.8 G at 45 %.
- Labels: `Inter` 600, 36 px or more on screen, with a paper halo (5 px stroke, paper at 92 %). Place them once, in setup, against the finished network.

## Motion

- A line exists only as far as its pen tip has gone. The tip moves at a steady speed and may slow at a station. Keep tip speed × zoom at 500 px/s or less on screen.
- Stops pop from 0.6× with a small overshoot in 0.28 s; a ring spreads from 0.10 to 0.42 G and fades in 0.6 s. An interchange appears only when the second line arrives: it falls from 3.4× in 0.4 s while its shadow sharpens, then rings in both line colours spread.
- Vehicles are the characters (a packet, a message, a task): white capsules 0.40 × 0.14 G with three windows in the line colour, about 2 G/s, only on finished track.
- Camera: ride the tip (aim 1.5 G ahead); pull back to show growth (minor names fade by zoom, hubs stay); push in under a 60 % paper veil for "you are here"; hold a locked frame 2.5 s or more for a verdict. End on the whole network.
- A sound would mark each stop that lights up and each interchange that lands.

## With the house look

- **Header**: `header()` in `Inter` 600, kicker in the accent `#e3002b`, for example `THE TOPICS · ros2 topic list`.
- **Words**: in a close shot, the names of the stations in view; in a wide shot, only hubs and the line names (minor names fade by zoom). About 15 words on screen.
- **Character**: the capsules are the characters; the hero capsule (the message the video follows) gets a small `face()` on its front window.
- **Background**: the paper sheet fills the frame, light.
- **Colour roles**: a line that stands for a known object takes its role colour (library `C`, `K`), the same as in the other parts.
- **Hand-over**: end on the whole network, then `endWipe()` from the last station in the next part's background.

## Avoid

Segments off 0/45/90°, labels that jump or sit on lines, too much text in wide shots, counters that interpolate (show whole stations only), a path kind shown by hue, one line on empty paper, invented counter values, the dark table.

## Build

One canvas. In setup, expand each route (station list plus bends, in G) to an octilinear polyline,
fillet the corners (port `rounded()`, see `opuscar-porting-notes.md`), keep its length and when the tip passes each station.
For a tilt, show the map canvas as a `CanvasTexture` on a plane in `s.three()` (tilt 30° or less).
```js
scene('pipeline', { bg: '#f2eee5',
  setup(s) { s.ctx = s.canvas(); s.net = buildNet(NET); },          // lines: [{pts, len, color, t0, t1}]
  draw(s) {
    const c = s.ctx, cam = mapCam(s.t); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    c.setTransform(cam.z, 0, 0, cam.z, 960 - cam.x * cam.z, 540 - cam.y * cam.z); c.lineCap = c.lineJoin = 'round'; c.lineWidth = 15;
    for (const L of s.net.lines) { const len = L.len * s.p(L.t0, L.t1 - L.t0, E.linear); if (len <= 0) continue;
      const p = polySlice(L.pts, len); c.strokeStyle = L.color; c.beginPath(); p.forEach((q, i) => i ? c.lineTo(...q) : c.moveTo(...q)); c.stroke();
      if (len < L.len) tipGlow(c, p.at(-1), L.color); }
    drawStops(c, s); drawInterchanges(c, s); drawLabels(c, s);
  } });
```

Adapted from lemo-opuscar `styles/transit-map/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
