# Engineering briefing board

**Good for:** a design trade-off judged against a limit (payload against motor torque, latency
against a budget), part or sensor selection with real photos, tests stamped pass or fail, a
measurement that grows until it breaks a spec. It differs from `whiteboard`: the subjects are
cut-out photos of real parts, and the argument is a measurement and a verdict.

## Look

| Role | Colour |
|---|---|
| enamel board; wall around it (wide shots only); tag paper | `#f3f1eb`; `#8f8b83`; `#fbfaf6` |
| graphite ink: names, rules, facts | `#23272e` |
| blue ink: dimensions, measured numbers | `#1f4fc8` |
| red ink: the decision only, 2 or 3 marks per frame at most | `#d33a21` |
| grey: extension lines, hatching | `#6c727b` |

- Board: enamel with a window light falloff, faint ghost strokes, a slow diagonal reflection.
- Prints: cut-out photos (PNG with alpha) in `assets/`, one grade for all (less saturation, a little warmer), 6 to 14 px above the board. Shadow: the blurred silhouette moved by (0.45, 0.8) × height. Never upscale a photo.
- Props: tags (paper card, 1 to 3 words, a magnet on the left), round magnets with a highlight, a steel ruler, a rubber stamp with pits. Ink: flat colour at 90 % with `multiply`, a lighter core (white at 10 %, 0.42 × width).
- Type: marker lettering in `Cabin Sketch` 700 or `Patrick Hand` (100 to 160 board px, a verdict 230 to 400); tags in `Space Grotesk` 700; numbers in `JetBrains Mono`. 36 px or more on screen.
- Accent marks follow the video's colour roles (library `C`, `K`). Red stays the verdict.

## Motion

- Prints come down from the camera side, land, bounce a little, and the shadow gets sharp (0.6 s). Magnets snap on with a small overshoot. Tags swing about their pin and settle. An impact jolts nearby items: an offset that springs back, `exp(−9τ) · cos(22τ)`.
- Ink draws at hand speed. A dimension line grows from A to B and lands with an arrowhead tap. Erase: a soft band sweeps across and leaves a 7 % blurred ghost.
- The stamp lands in 0.07 s from 1.18× to 1× with a small camera shake. One stamp per part.
- Camera: eased moves that start and stop at zero speed, with a hand-held drift of 3 px or less. Ride a dimension line; put each new item beside the last result; hold a judgement frame (item, limit, verdict) for 2.5 s or more. Show the whole wall only at the end.
- Something lands, draws or swings every 1 to 2 beats. With sound effects on (`SOUND.md`), `s.sfx` marks each landing and the stamp.
- Moves that fit: **ride the dimension line** (a quantity drawn as a real length at one scale; the camera rides its tip); **erase to a ghost** (the rejected option stays faintly under the chosen one); **the subject passes through the answer** (the real part moves through the chosen gap or route).

## With the house look

- **Header**: `header()` with `font: 'Cabin Sketch'`, `tWeight: 700`, kicker in graphite, for example `THE CHOICE · MOTOR DATASHEETS`. Write it on like marker.
- **Words**: one comparison per frame: the item, the limit and the verdict. Tags of 1 to 3 words; at most 15 words in view. The board grows by camera moves, not by a full wall of text: the final pull-back shows the whole board, but each frame still reads as one picture.
- **Character**: give the hero part a face on a magnet or a tag (`face()`, `mood` follows the verdict: `happy` on pass, `worried` on fail). Never draw a face on a photo of a real part.
- **Background**: light (enamel). The grey wall shows only in the last pull-back.
- **Colour roles**: magnets, tags and the hero's marker take the video's role colours (library `C`, `K`). Red stays the verdict.
- **Hand-over**: end on the stamp or the pull-back, then `endWipe()` from the verdict in the next part's background.

## Avoid

Generated images shown as real parts, photos with logos or text, upscaled photos (at least 1 source px per screen px), thin cables lost by the cut-out mask (redraw them as lines), text seen only while the camera passes, more than three red marks in a frame, dissolves, text that pops or fades in by itself, the whole wall before the end.

## Build

One canvas with a 2.5D camera: each item has a height z and moves by parallax `D / (D − z)`. Draw
board → shadows → prints → ink → tags and magnets. In setup, make each print's silhouette (draw it,
fill black with `source-in`) and the stamp texture (port `stampTexture`, see `opuscar-porting-notes.md`; the library
`stamp` in `boil.js` boils, so it does not fit). `tick` from `common.js` fits a pass mark.
```js
scene('verdict', { bg: '#f3f1eb',
  async setup(s) { s.ctx = s.canvas(); s.img = new Image(); s.img.src = '/assets/motor.png'; await s.img.decode();
    s.sil = silhouette(s.img); s.stampTex = stampTexture('PASS', '#d33a21'); },
  draw(s) {
    const c = s.ctx, u = s.p('#drop', 0.6, E.linear), L = 0.55;
    const z = 10 + (u < L ? 300 * (1 - (u / L) ** 2) : 10 * Math.sin((u - L) / (1 - L) * Math.PI) * (1 - u));
    c.clearRect(0, 0, W, H); drawBoard(c, s.t);
    c.save(); c.globalAlpha = 0.3; c.filter = `blur(${(z - 10) * 0.07}px)`; c.drawImage(s.sil, 700 + 0.45 * z, 300 + 0.8 * z); c.restore();
    c.drawImage(s.img, 700, 300 - (z - 10) * 0.2);
    dimLine(c, [700, 760], [1300, 760], s.p('#measure', 0.6), '#1f4fc8');      // grows A → B, arrowheads
    const k = s.p('#verdict', 0.07, E.out); if (k > 0) drawStamp(c, s.stampTex, 1500, 320, lerp(1.18, 1, k), -0.14);
  } });
```

Adapted from lemo-opuscar `styles/briefing-board/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
