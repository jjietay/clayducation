# Risograph and halftone

**Good for:** a printed-poster look for overviews, history, comparisons; two sets whose overlap is the
finding (two inks, and a third colour where they meet); a part where a new element arrives as a new
ink; a title or a recap.

## Look

| Role | Colour |
|---|---|
| paper | `#f5f1e8`: warm off-white, never pure white; paper white is a colour too (knockouts, highlights) |
| inks (two or three, never more) | `#ff48b0` (pink), `#0078bf` (blue), `#ffe800` (yellow) |
| other ink sets | teal `#00838a` + orange `#ff7477`; navy `#3d5588` + red `#ff665e` + sunflower `#ffb511` |
| overprints | blue + yellow = green, blue + pink = violet, yellow + pink = orange-red, all three ≈ black |

- Inks multiply where they overlap (`ctx.globalCompositeOperation = 'multiply'`). Every other colour is an overprint or a tint. Give each colour role of the video (library `C`, `K`) one ink or one overprint for the whole part.
- Each area uses at most two plates, at most one of them as a tint: three halftones on top of each other turn to mud.
- Plates are offset 2 to 4 px from each other, with one fixed offset per plate for the part.
- Tones are halftone dots, no smooth gradients: each plate on its own screen angle (15°, 0°, 75°), a dot period of 7 to 8 px, densities of 0.9 or more print solid. Use a few steps (20, 40, 60, 100 %). Add grain on the dot edge and a few pinholes in solids.
- Flat shapes, no outlines: colour fields and silhouettes. One horizon, one big field or disc, one small figure with its head against the flattest colour. A figure gets a 4 to 5 px paper knockout halo, so fringes show where the plates miss.
- Design for one plate: every main colour contains some of the first ink, so a one-ink frame still reads.
- Type is printed on one plate: titles `Space Grotesk` 700 (a double hit on two plates, 6 to 10 px apart), labels `Plus Jakarta Sans` 600, 36 px or more.

## Motion

- Characters move on twos (`s.tq(12)`); the camera moves at the full 30 fps (a stepped camera judders).
- Registration is not jittered every frame. A kick (8 to 14 px, decaying in about 0.25 s with a small ring) marks an accent; a slow drift of up to 25 px goes through a held moment and snaps back on the cue word.
- Grain boils partly: about a third re-rolls every 1/12 s.
- The dots are fixed to the screen, not to objects: a pan slides the image under the dot grid, as if each frame were printed anew.
- A plate can arrive mid-shot with a roller sweep (a moving edge with a slightly heavier ink band). Overprint transition: a shape of one ink grows over the frame, then shrinks into the next key shape. Prints never fade: titles arrive with a roller wipe.
- Camera: a wide lateral track with a small figure, a locked composition for the one pause, a push into a halftone field until the dots become shapes.
- With sound effects on (`SOUND.md`), `s.sfx` marks each plate that arrives.

## With the house look

- **Header**: `header()` in `Space Grotesk` 700; print the title on one plate with a second hit on another plate 6 to 10 px away. The kicker is one ink, for example `THE OVERLAP · SURVEY 2024`.
- **Words**: a poster: one field, one figure, at most 3 labels.
- **Character**: the small figure carries the scene; a hero object can get a `face()` knocked out in paper white.
- **Background**: paper, light.
- **Colour roles**: each role of the video gets one ink or one overprint for the whole part, matching its hue in the other parts as close as the ink set allows.
- **Hand-over**: the overprint transition: a shape grows over the frame in the next part's background colour (`endWipe()` from the shape's centre).

## Avoid

Smooth gradients, more than three inks, three halftones in one area, perfect registration, registration jitter on every frame, outlines, cross-dissolves, the RISO brand or machine.

## Build

Canvas. Draw each ink as its own pass with a fixed 2 to 4 px offset. Halftone: a dot grid whose radius follows the tone. For a full print, draw the densities into one canvas (R, G, B = plates 1, 2, 3; `source-over` knocks out, `'lighter'` overprints) and print it with a full-screen `ShaderMaterial` in `s.three()` (port the source shader, see `opuscar-porting-notes.md`). One plate on the CPU path:
```js
function plate(c, dens, ink, ang, off, P = 7) {                // dens(x, y) → 0..1 from the separation canvas
  c.save(); c.globalCompositeOperation = 'multiply'; c.fillStyle = ink; const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let v = -1110; v < 1110; v += P) for (let u = -1110; u < 1110; u += P) {
    const x = 960 + u * ca - v * sa, y = 540 + u * sa + v * ca, d = dens(x, y); if (d < 0.03 || x < -P || x > W + P || y < -P || y > H + P) continue;
    c.beginPath(); c.arc(x + off[0], y + off[1], d >= 0.9 ? P * 0.75 : P * 0.56 * Math.sqrt(d), 0, 7); c.fill(); }
  c.restore(); }
```

Details added from lemo-opuscar `styles/risograph/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
