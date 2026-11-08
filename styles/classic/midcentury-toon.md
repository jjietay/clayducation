# Mid-century cartoon (1950s how-to)

**Good for:** how to do a thing, step by step: set up a board and flash it, wire a sensor to a
microcontroller, calibrate a camera, mount a part on a lab bench, solder a joint, the safety rules of
a lab, a checklist before a test run, a "do and don't" pair. Pick it when the viewer must come away
able to do the thing; to show why it works, use `whiteboard` or `flat-vector`.

## Look

| Role | Colour |
|---|---|
| paper; paper shades | `#f4ead5`; `#e6d8bc`, `#d4c29f` |
| ink (warm black) | `#2b2420` |
| the product (one colour for the whole part) | turquoise `#3fa7a0` / dark `#257a74` |
| accent: the presenter's garment, stars | coral `#e4613f` / dark `#b8452b` |
| step grounds (one per step) | mustard `#e8b43a`, dusty blue `#7f9cc0`, avocado `#a7ae5b`, pink `#f0b4a8` |

- Off-register cels: every fill is printed 6 px right and 4 px down from its ink line; the offset jitters ±1.6 px and re-rolls 12 times a second. Keep it on everything, text included; switch it off only for a crisp diagram.
- Ink: ribbons 3 to 5 px wide (characters 4 px, props 3 to 4.5 px), width breathing ±40 %, 12 to 25 % of the line broken, so a shape never quite closes.
- Shading: one flat darker plane clipped inside a shape. Drop shadow: a copy of the shape offset (12, 12) in a paper shade at 50 %. No gradients.
- Rooms are not drawn: one ground colour per step (wall `mix(col, '#ffffff', 0.45)`, floor `mix(col, '#2b2420', 0.16)`), a horizon line with gaps, one or two props. Never put the product on its own colour.
- The product keeps one colour through the part: its colour role (library `C`, `K`) if it has one. The accent is a different hue.
- People are geometric: an egg head whose nose is part of one face outline, two or three flat garment colours, four-finger gloves (open, flat, point, grip). The presenter's body is a held drawing.
- Ornaments: four-point sparkles, 8- to 18-point starbursts, a sunburst (30 wedges at 55 %), boomerang and kidney shapes.
- Type: kicker in `Instrument Serif` italic; titles and numerals in `Plus Jakarta Sans` 800, ink over a paper or colour plate offset 4 to 7 px; labels `Plus Jakarta Sans` 600, 36 px or more. A step header is an ink disc with a paper numeral and the step title.

## Motion

- On twos: poses, hand shapes and the register jitter change at 12 fps (`s.tq(12)`). The camera, circles, arrows and routes move at 30 fps.
- Held body, moving hands: one hand action per step, with anticipation (pull back or lift 20 to 60 px), a fast action (0.15 to 0.25 s, `E.out`) that lands on the cue word, and a follow-through (recoil 6 to 10 px, settle, lift away).
- Pop-ins (medallions, tags, labels): scale with a back-ease, overshoot 1.9, in 0.24 to 0.3 s.
- The camera is the stand: slow pushes (1.00 → 1.07), trucks, tilts that follow a pointing finger; never handheld.
- One part is one shot: keep the steps on one stage. Each step gets a numbered medallion and a round call-out (a circle with a dashed leader to its subject) that shows the hands and the step's value (a pin number, a torque, a voltage) on the action beat. Draw close-ups inside the call-out at native scale, so the ink stays 4 px.
- Payoff: a real process draws itself region by region (a robot's coverage path, a cable route) and, seen whole, reads as a 1950s textile; pull back with a small counter-rotation (−6° → 0°). Hold the summary dead still for 3 s.
- Hand over to the next part with an iris through a medallion or a round object, or a colour-block wipe.
- With sound effects on (`SOUND.md`), `s.sfx` marks each medallion stamp; a short silence before the main action makes it land.

## With the house look

- **Header**: `header()` with `kFont: 'Instrument Serif'` for the kicker and `tWeight: 800` for the title, for example `HOW TO · FLASH THE BOARD`. The numbered step medallion is the only other heading.
- **Words**: one step on screen at a time: the medallion, one call-out with its value, at most 2 labels. A summary is a picture of the finished thing, never a list of steps.
- **Character**: the presenter (egg head, gloves) does each step; the product can also get a small `face()` that reacts (`worried` before a mistake, `happy` after the fix).
- **Background**: paper and pastel step grounds, light.
- **Colour roles**: the product's colour is its colour role from the other parts (library `C`, `K`); the accent is a different hue.
- **Hand-over**: an iris through a medallion or a round object: `endWipe()` centred on it, in the next part's background.

## Avoid

Gradients, closed perfect outlines, a nose drawn as a separate wedge, thin stick arms from the neck (put shoulders at the torso corners), zooming the world for a close-up (it triples the ink), detail text without reading time, routes that cross obstacles, a summary drawn as a bullet list.

## Build

One canvas. Port `shape`, `ink` and `reg` from `engine/toon.js` (see `opuscar-porting-notes.md`), or start from this:
```js
function toonShape(c, pts, fill, seed, f, ink = '#2b2420', w = 4) {             // f = Math.floor(s.t * 12): re-roll on twos
  const r = rng(f * 97 + seed), dx = 6 + (r() - 0.5) * 3.2, dy = 4 + (r() - 0.5) * 3.2;
  c.save(); c.translate(dx, dy); c.fillStyle = fill; c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p))); c.closePath(); c.fill(); c.restore();
  const pr = resample(pathFrom(pts, true), 180), gap = rng(seed); let run = [], on = true;   // the gaps stay fixed for the shape
  pr.forEach((p, i) => { if (i % 15 === 0) on = gap() > 0.18; if (on) run.push(p);
    if ((!on || i === pr.length - 1) && run.length > 1) { strokeVar(c, run, (u) => w * (0.8 + 0.4 * Math.sin(u * 9 + seed)), ink); run = []; } });
}
scene('flash', { bg: '#f4ead5', setup(s) { s.ctx = s.canvas(); },
  draw(s) { const c = s.ctx, f = Math.floor(s.t * 12), hit = s.at('press'); c.fillStyle = '#e8b43a'; c.fillRect(0, 0, W, H);
    toonShape(c, BOARD, '#3fa7a0', 3, f);
    const dy = -40 * s.p(hit - 0.45, 0.25, E.out) + 40 * s.p(hit - 0.2, 0.2, E.out) - 8 * Math.sin(Math.PI * s.p(hit, 0.3, E.linear)); // lift, press on the word, recoil
    drawHand(c, 1040, 520 + dy, 'point', f); } });
```

Adapted from lemo-opuscar `styles/midcentury-toon/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
