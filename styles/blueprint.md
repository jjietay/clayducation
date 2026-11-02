# Blueprint drafting

**Good for:** a mechanism or a part drawn in drafting order (a gearbox, a gripper, a bracket),
dimensions that measure moving parts, an exploded view, a section cut that shows the inside,
design revisions (REV A → REV B), a mechanism that steps like an escapement.

## Look

The blueprint is a dark style and counts toward the two dark parts. For a light part, use the
whiteprint variant: the same rules, blue lines on cream paper.

| Role | Blueprint (dark) | Whiteprint (light) |
|---|---|---|
| sheet | `#18336b` → `#2a58a6` (soft noise between them) | `#f4f1e8` → `#ebe6d8` |
| lines | `#e7f0f9` | `#1d3f80` |
| the one stamp, used once (the verdict) | `#c8363a` | `#c8363a` |

- Two colours only: value changes, hue does not. The video's colour roles show as line weight or hatching, not as a new hue.
- Line weights: outline 3.2, detail 2.0, thin 1.25, hair 0.9 sheet units. On screen: width × zoom^0.65, so close-ups do not get fat and wide shots do not fade. All lines are solid: draw no dashed or dotted lines (no centre, hidden or phantom lines).
- Fill each solid with the sheet colour before you stroke its outline: painter's order hides the lines behind it. Hatch sections at 45°, 8 to 14 units apart, hair weight.
- Dimension lines with extension lines and arrowheads (16 × 4.5), the value lettered above. Part balloons: a leader with a dot, a circle r 22 with the number. The title is the sheet header; a title block (bottom right, above y 940) holds status and revisions.
- Type: `Architects Daughter` for header, labels and notes; `JetBrains Mono` for title-block fields; 28 px or more on screen.
- 2D only: orthographic or oblique projection. No 3D shading.

## Motion

- Drafting order, one layer per beat: outlines → detail → hatching → dimensions → balloons → labels. Each line draws on by length with a glowing nib at its head.
- Exploded views: parts leave one after another, eased, to the side (never up into the header), and come back one at a time with a click. A gear advances one tooth per step with a short ease-out, and the teeth mesh.
- The machine is the character: angles, sag and gauge needles show its mood. Failure: it slows and sags over about 1.5 s. Success: it snaps upright and a needle overshoots (`E.overshoot`).
- The oblique depth factor can go from 0 to 0.5: the flat drawing gets thickness.
- Camera: close shots; a solid section line sweeps across for a cutaway; a pan from Fig. 1 to Fig. 2, or strike through "FIG. 1" and write "FIG. 2". No cuts inside the part. Show the whole sheet only at the start or for the verdict. With sound effects on (`SOUND.md`), `s.sfx` marks each part click and the stamp.
- Moves that fit: **live annotations** (a dimension measures a moving part and its number changes); **the title block as story** (the status field is the verdict, the revision rows are the history); **a symbol made real**, once at most (a dimension arrow leaves the drawing and flies).

## With the house look

- **Header**: `header()` with `font: 'Architects Daughter'` and the kicker in the line colour, for example `FIG. 1 · GRIPPER DATASHEET`. It is the sheet's own header, written on with the nib.
- **Words**: one figure per frame; at most 4 balloons and 2 dimensions in view; part names are 1 to 4 words on leaders. No notes column, no paragraph in the title block.
- **Character**: the machine acts through its parts (sag, needles, speed). If the hero part needs a face, draw `face()` in line work: `ink` = the line colour, `eyeFill` = the sheet colour.
- **Background**: the blueprint is dark. Use the whiteprint for a light part when the video already has its two dark parts.
- **Colour roles**: no new hue. The hero object keeps its role by the heaviest line weight; name its colour once in the voice if it matters.
- **Hand-over**: end on the finished figure, then `endWipe()` from the hero part in the next part's background.

## Avoid

3D shading or glowing wireframes, dashed or dotted lines of any kind (centre, hidden, phantom), a second hue, lines with one width at every zoom, the main figure near the sheet edge, parts that explode up into the header, the main figure closer than `960 / zoom` to a sheet edge you will frame, more than one stamp, dissolves.

## Build

One canvas; all geometry is point lists in sheet units. Draw-on is `polySlice(pts, u * polyLength(pts))`;
the nib is the last point. Port `gearPts`, `dim` and `balloon` from the source (see `opuscar-porting-notes.md`).
```js
scene('gearbox', { bg: '#18336b',
  setup(s) { s.ctx = s.canvas(); s.gear = gearPts(800, 540, 18, 12); },
  draw(s) {
    const c = s.ctx, z = 1, ink = '#e7f0f9'; c.clearRect(0, 0, W, H); drawSheet(c);
    const line = (pts, w, u) => { if (u <= 0) return; const p = polySlice(pts, u * polyLength(pts));   // solid lines only
      c.lineWidth = w * z ** 0.65; c.strokeStyle = ink;
      c.beginPath(); p.forEach((q, i) => i ? c.lineTo(...q) : c.moveTo(...q)); c.stroke();
      if (u < 1) nib(c, p.at(-1)); };
    if (s.after('#outline')) { c.fillStyle = '#18336b'; fillPoly(c, s.gear); }   // knock out the lines behind
    line([...s.gear, s.gear[0]], 3.2, s.p('#outline', 1.2));
  } });
```

Adapted from lemo-opuscar `styles/blueprint/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
