# 1920s newsreel

**Good for:** the history of an idea told as news (who did it first, where, in which year), a
result or a release announced as a headline (a paper, a record, a first flight), an old method
against the new one that replaced it, how an idea spread from one lab to many, the stages of an
early machine shown as a flip-book. Not for disasters or deaths: its cheerful grammar is wrong for them.

The newsreel is a dark style (black around the gate) and counts toward the two dark parts. It is
not `film-crt`: `film-crt` puts a film surface on any picture; this style is a full grammar of news
objects, place cards, grease pencil and the newsreel's own transitions.

## Look

| Role | Colour |
|---|---|
| outside the gate | pure black `#000` |
| picture (everything inside the gate) | warm silver: greyscale, then `multiply #efe7d6` and `screen #17140f` |
| desk under the papers | `#2a2622` → `#141210` |
| newsprint | paper `#d9d3c6`, ink `#1c1a17`, grey text bars `#8d877c` |
| grease pencil; underline on print | warm white `rgba(250, 248, 240, 0.92)`; soft lead `rgba(40, 36, 30, 0.85)` |
| place card | text `#f3eee4` on `rgba(12, 11, 10, 0.8)`, inset 2 px rule `#d8d0bf` |

- **The gate**: a 1480 × 1080 picture (1.37 : 1) at x 220, corner radius 26 px, black outside. Nothing is drawn outside the gate.
- **Two layers**: the picture (canvas) gets the film look; place cards and labels (`s.text`) stay sharp. Grease-pencil marks weave with the picture.
- **Film look**, seeded from the frame index: vignette, flicker ±3.5 % plus a 3 Hz drift, gate weave ±1.6 / ±2.2 px, 0 to 3 vertical scratches that live 9 frames, 0 to 4 one-frame dust specks.
- **News objects explain**: a front page, a magazine page, a telegram, a map, a book. They are filmed (spun, slammed, pushed, underlined), never laid out as slides.
- **Real or drawn**: real print or film only when the user gives it or its licence is clear (public domain, CC0, CC BY), with each source in `storyboard.md`. Otherwise draw it in code with an invented masthead (`THE DAILY EXPLAINER`), never a real paper's or newsreel's name. A drawn headline states a checked fact; body copy is grey bars, never invented sentences. Things are drawn as newspaper pictures: halftone dots or line engraving in ink.
- **Type**: `Limelight` for an item title card (104 to 118 px, silver gradient `#fff → #d9d4ca │ #9e978a → #efebe2`, black outline 0.12 em); `Oswald` 600 for place cards and labels (32 to 40 px, upper case, letter-spacing 4 to 6 px). All text above y 940.

## Motion

- **One continuous take inside the gate.** The newsreel's cuts become camera moves on the news objects: the paper spins in and slams, the camera pushes to the headline, punches in to the photo in it, and a map or a grid of stills grows from there.
- **The narration is the clock**: each slam, label and underline lands on the word that names it (`s.at('word')`). Print stays still 2.5 s or more so it can be read; nothing else is static longer than about 1 s.
- **Spinning paper**: it grows by `u^2.3` and turns by `(1 − u)^1.25` over 2.5 turns, with three ghost copies 18 ms apart; on the slam a damped 16 px jolt and a 3 % bounce.
- **Moves that fit** (each once): the **map spread** (dotted arcs from the source city draw on the spoken name, a corner odometer rolls the years); **grid deal → flip-book** (stills land one per beat, then play as stop motion with `s.tq(8)`); **document underline** (soft-lead lines under the exact words the voice quotes); **grease-pencil freeze** (freeze, jolt, ring and arrow on the detail); **split-screen duel → push-over** (old against new, the winner pushes the loser out).
- **Transitions are punctuation**, each used once: an iris, a diagonal hard wipe with a bright 6 px edge, a vertical flip, venetian blinds or a clock wipe. No cross-dissolves, whip pans or zoom blur.
- A still always gets a move with a purpose; real archive footage moves 6 % at most. With sound effects on (`SOUND.md`), `s.sfx` marks each slam and each pencil line.

## With the house look

- **Header**: the place card is the kicker: `header()` with `font: 'Oswald'`, `x: 268`, kicker `PLACE · DATE` (for example `NATURE · OCTOBER 1986`) on the dark card; the headline on the paper or the Limelight title card is the title, at most 8 words.
- **Words**: one headline or one card at a time; at most 3 labels in view (place cards on a map, panel labels in a split).
- **Character**: a figure in a newspaper picture can get a `face()` in ink (`eyeFill` = the paper colour). Never on real archive footage.
- **Background**: dark; plan it as one of the two dark parts.
- **Colour roles**: monochrome. The hero object is the brightest thing in the gate and gets the grease-pencil ring; name its colour once in the voice if it matters.
- **Hand-over**: the iris closes on the subject, then the next part opens from black, or `endWipe()` from the iris centre in the next part's background.

## Avoid

Colour, text outside the gate or below y 940, slide layouts or bullet columns on the "paper", invented body copy, a real newspaper's or newsreel's name or logo, a "vintage filter" on modern graphics, slow Ken Burns drifts, modern lower-third bars, cross-dissolves, the same transition twice, old material upscaled more than 2.5×, per-frame auto-levels (footage pumps), a `destination-in` iris without black painted behind it (`destination-over`).

## Build

One canvas for the picture, clipped to the gate. Draw the content first, then the film look, then the
grease pencil. Put place cards and labels on `s.text` so `check` can measure them. Seed every random
value with the frame index (`rng(f * 7 + k)`), never `Math.random`. Before you draw text on a
canvas (a masthead, a headline), load its font in an `async setup`:
`await document.fonts.load('84px Limelight'); await document.fonts.load('700 88px Oswald');`.
Without this, the first frames draw the canvas text in a fallback serif.
Keep a pushed-in headline inside the gate, and keep the grease-pencil ring clear of the letters.
```js
const GX = 220, GW = 1480, GH = 1080, FPS = 30;
const hash = (n) => rng(Math.floor(n * 9973))();
function gate(c) { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.beginPath(); c.roundRect(GX, 0, GW, GH, 26); c.clip(); }
function filmLook(c, f) {                                   // picture layer only, after the content
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#efe7d6'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'screen'; c.fillStyle = '#17140f'; c.fillRect(GX, 0, GW, GH);
  c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(GX + GW / 2, GH / 2, GH * 0.42, GX + GW / 2, GH / 2, GH * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.5)'); c.fillStyle = g; c.fillRect(GX, 0, GW, GH);
  c.fillStyle = `rgba(0,0,0,${0.035 * (hash(f) - 0.5) * 2 + 0.03 * Math.sin(f / FPS * 6 * Math.PI)})`; c.fillRect(GX, 0, GW, GH);
  for (let k = 0; k < 3; k++) { const id = Math.floor((f + k * 5) / 9) * 7 + k; if (hash(id * 1.3) > 0.55) continue;   // scratches
    c.fillStyle = hash(id) > 0.5 ? 'rgba(255,250,240,.22)' : 'rgba(0,0,0,.28)'; c.fillRect(GX + hash(id * 2.1) * GW, 0, 1.5, GH); }
}
scene('first-headline', { bg: '#000',
  async setup(s) { await document.fonts.load('84px Limelight'); await document.fonts.load('700 88px Oswald');
    s.ctx = s.canvas(); s.place = s.text('NATURE · OCTOBER 1986', { x: GX + 48, y: 80, anchor: 'tl', size: 34, font: 'Oswald', weight: 600, color: '#f3eee4' }); },
  draw(s) {
    const c = s.ctx, f = Math.floor(s.t * FPS); c.save(); c.clearRect(0, 0, W, H); gate(c);
    c.translate(1.6 * Math.sin(f * 0.7), 2.2 * Math.sin(f * 0.43));                          // gate weave
    const u = s.p(s.at('#fly'), s.at('#slam') - s.at('#fly'), E.linear);                     // spinning paper
    const d = s.t - s.at('#slam'), jolt = d > 0 ? Math.exp(-d * 14) * Math.sin(d * 70) * 16 : 0;
    drawPaper(c, 0.06 + 0.94 * u ** 2.3, -((1 - u) ** 1.25) * 2.5 * 2 * Math.PI, jolt);      // masthead, headline, grey bars
    filmLook(c, f); pencil(c, ringPts, s.p('#ring', 0.3)); c.restore();
    set(s.place, { opacity: s.p('#place', 0.22), x: (1 - s.p('#place', 0.22, E.out)) * -40 });
    s.trace('paper', GX + GW / 2, GH / 2 + jolt);
  } });
```
`drawPaper`, `pencil` and `ringPts` are your own. The source demo's `pencil()` draws a 7 px warm-white
stroke plus a second stroke offset by (1.6, −1.2) at 45 % alpha, with a small per-vertex jitter.

Adapted from lemo-opuscar `styles/newsreel/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
