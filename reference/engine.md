# The engine: scenes.js API and commands

The stage is 1920 x 1080 px. Headless Chrome draws each frame by calling `seek(t)`, so
**every picture must be a function of time only**:

- No CSS transitions or animations, no `requestAnimationFrame`, no `setTimeout`.
- No `Math.random()`. Use `rng(seed)`.
- `setup` must not depend on time. Several browsers render parts of the video in parallel,
  and each one runs `setup` when it first reaches the scene.

## Project files

| File | Who writes it | What |
|---|---|---|
| `script.md` | you | narration, scenes, cues (see `script.md` reference) |
| `scenes.js` | you | one `scene()` per "## id" |
| `storyboard.md` | you | plan, facts and sources, your case |
| `video.json` | `init` | `_tts`: the voice (`exaggeration`, `cfg_weight`, `stopGap`, `paragraphGap`, `seeds`); fps, lead, hold. `_render`: `music` (`true` = `"current"`, `"lofi"`, or `false`; see `SOUND.md`), `musicVolume` (0.26), `sfx` (sound effects, `false`), `sfxVolume` (1), `workers` |
| `assets/` | you | images the scenes load as `/assets/name.png` |
| `build/` | engine | voice, timeline, sheets, stills (gitignored) |
| `out/` | engine | `<slug>.mp4` and `<slug>.srt` (gitignored) |

## A scene

```js
scene('mechanism', {
  bg: '#fdf6ec',                        // background colour of the scene
  async setup(s) {                      // once: build elements, load TeX, make Three.js objects
    s.title = s.text('Eigenvectors', { x: 960, y: 140, size: 84, weight: 700, color: '#2b2d42' });
    s.eq = await s.tex('A\\mathbf{v} = \\lambda \\mathbf{v}', { y: 900, size: 72 });
    s.ctx = s.canvas();
  },
  draw(s) {                             // every frame: set everything from s.t
    set(s.title, { opacity: s.p(0.2, 0.5) });
    set(s.eq, { y: (1 - s.p('#formula', 0.6, E.overshoot)) * 40, opacity: s.p('#formula', 0.3) });
    const c = s.ctx; c.clearRect(0, 0, W, H);
    // ... draw with c, from s.t
  },
});
```

Store what you build on `s` (`s.title`, `s.ctx`, ...). Draw functions can be `async`.

**A scene with two or more parts (styles) in one `scene()`:** the review pack draws frames out of time order,
so set every element of every part on every frame, at the top of `draw`, before any part branch or early
return (wipes, labels, headers). Hide the canvas (and Three.js `renderer.domElement`) of each part that is not
active with `style.display = 'none'`: a canvas that is only cleared can keep its old image in a capture.

## The scene object `s`

| Member | What it gives you |
|---|---|
| `s.t` | seconds since the scene started |
| `s.dur` | length of the scene in seconds |
| `s.at(cue, n=1)` | time of a cue: `'#name'` (a marker) or a spoken word (`n`-th time it is said). A number passes through. Throws if missing, so `check` finds typos. |
| `s.p(cue, dur=0.6, ease=E.inOut)` | progress 0 to 1 of something that starts at `cue` and lasts `dur` s |
| `s.after(cue)` | true once the cue has passed |
| `s.tq(fps=12)` | time quantised to `fps`: stop motion, pixel art, animation on twos |
| `s.boil(n=3, fps=12)` | which of `n` jitter variants to draw now: line boil |
| `s.canvas({w, h, pixel, z})` | a 2D context on a canvas that fills the stage. `pixel: true` with `w: 320, h: 180` gives crisp scaled pixels |
| `s.svg({z})` | an `<svg>` with viewBox 0 0 1920 1080 |
| `s.text(str, {x, y, size, font, weight, color, anchor, width, align, html, z})` | an HTML text box placed at (x, y). anchor: `c` centre (default), `tl`, `tc`, `tr`, `l`, `r`, `bc`. `width` wraps text |
| `await s.tex(tex, {x, y, size, color, anchor, display, z})` | TeX as SVG. Wrap a term in `\class{name}{...}` and colour it with `node.querySelectorAll('.name')` → `n.style.fill = ...` |
| `await s.three({ortho, view, bg, z})` | Three.js: returns `{THREE, renderer, scene, camera, render, screen}`. `screen(obj)` gives the object's stage px, for `s.trace`. Call `render()` at the end of `draw`. `ortho: true` gives a true isometric camera, `view` = world units visible top to bottom |
| `s.trace('name', x, y, {r})` | in `draw`: where a thing drawn on a canvas or in Three.js is now (stage px), so `make review` can measure its motion. `r` = radius, for the collision check. In `setup`, `s.trace(element, 'name')` names an HTML or SVG element. Text, formulas and elements moved with `set()` are traced already |
| `s.sfx(sound, cue, {at, x, gain, pitch, dur, peak})` | in `setup`: a sound effect at a cue (`at` s after it; `x` = stage x for the pan). Sounds: pop, click, tick, whoosh, swish, thud, stamp, paper, marker, pencil, chime, typing. Mixed only when `video.json` has `_render.sfx: true`. See `SOUND.md` |
| `s.root` | the scene's `<div>`, for your own elements |
| `s.words`, `s.marks` | the word timings and markers, in scene seconds |
| `W`, `H`, `s.SAFE` | 1920, 1080, and the safe area `{x: 96, y: 72, w: 1728, h: 936}` |

Text must stay inside the safe area and be at least 28 px (labels 36 px or more is better).
`check` warns about HTML text that breaks these. It cannot see canvas text, so check that
on the contact sheet.

## Helpers (global in scenes.js)

| Helper | Use |
|---|---|
| `E.linear, E.inOut, E.out, E.in, E.snap, E.overshoot, E.settle(x, n, amp)` | easings. `settle` = falls, lands with weight, settles `n` times |
| `bezier(x1, y1, x2, y2)` | any CSS cubic-bezier as an easing function |
| `clamp, lerp, invLerp, mix(hexA, hexB, t)` | numbers and colours |
| `rng(seed)` | seeded random generator: `const r = rng(7); r()` |
| `set(el, {x, y, scale, rot, opacity})` | move by (x, y) from where it was placed, scale and turn about its centre. HTML or SVG |
| `el(tag, attrs, parent)` | create an element. SVG when the parent is SVG. `attrs.text` sets text |
| `resample(d, n)` | n points evenly along an SVG path `d` |
| `lerpPoints(a, b, t)`, `align(points, to)`, `pathFrom(points, closed)` | morph two shapes: resample both to the same n, `align` the start points, lerp, draw with `pathFrom` |
| `polyLength(pts)`, `polySlice(pts, len)` | draw a line up to a length: single-line drawing at a fixed px/s |
| `wobble(pts, amp, seed)`, `strokeVar(ctx, pts, widthFn, color)` | hand-drawn: jitter (seed + `s.boil()`) and variable-width ink |
| `goo(svg, id, blur)` | metaball filter: `<g filter="${goo(svg)}">` melts shapes together |
| `iso(x, y, z, {tile, ox, oy})`, `isoBox(ctx, {x, y, z, w, d, h, top, left, right, tile, ox, oy})` | isometric projection and three-tone blocks. Draw from back (small x + y) to front |
| `bayer(x, y)` | ordered-dither threshold: fill a pixel when `value > bayer(x, y)` |
| `pixelText(ctx, str, x, y, color, scale)` | 5 x 7 bitmap font for pixel canvases (upper case) |
| `typed(str, t, cps)` | text typed out by time `t` |
| `manim(extra)` | a scene drawn by Manim: `scene('formula', manim())` shows the frames of class `formula` in `manim_scenes.py`. `extra.setup` / `extra.draw` add HTML on top. See `styles/math-manim.md` |

Fonts (loaded already): `Inter`, `Space Grotesk`, `Plus Jakarta Sans`, `JetBrains Mono`,
`Instrument Serif`, `Kalam`, `Patrick Hand`, `Architects Daughter`, `Cabin Sketch`, and from the
skill's own `engine/fonts/`: `Limelight` (Art Deco titles) and `Oswald` (200 to 700, condensed labels).

## Shared library

The engine serves the skill's `styles/library/` folder at `/_lib/`. Import from it in `scenes.js`:
```js
import { K, BG, header, showHeader, label, lab, makeWipe, endWipe } from '/_lib/common.js';
import { barrel, folderBack, folderLip, tile } from '/_lib/flat.js';
import { world, showK } from '/_lib/toy3d.js';
```
One module per style (`common`, `flat`, `morph`, `iso`, `boil`, `paper`, `pixel`, `toy3d`).
`styles/library/README.md` lists every item; `gallery/png/library-*.png` shows them. In Three.js, hide an
object with `showK(obj, k)` (a tiny scale), never `visible = false`, and `await g.ready()` at
the end of `setup`: on the GPU path an object first drawn mid-scene can miss its first frame.

## Patterns

**Show a thing on its word, with an overshoot:**
```js
const k = s.p('eigenvector', 0.4, E.overshoot);
set(s.arrow, { scale: k, opacity: Math.min(1, k * 3) });
```

**Highlight a formula term when it is said:**
```js
for (const n of s.eq.querySelectorAll('.lambda')) n.style.fill = mix('#2b2d42', '#ff6b35', s.p('lambda', 0.3));
```

**Carry one scene into the next (no hard cut):** end scene A with the shape that scene B
starts with: for example, grow a circle in B's background colour until it fills the frame
in the last 0.5 s of A, and give B that `bg`. Each scene draws only itself.

**Three.js scene:**
```js
scene('frames', {
  async setup(s) {
    const g = s.g = await s.three({ bg: '#f6e6e4' });
    const { THREE, scene } = g;
    scene.add(new THREE.HemisphereLight('#ffffff', '#f6e6e4', 1.2));
    const key = new THREE.DirectionalLight('#ffffff', 2.2);
    key.position.set(4, 8, 5); key.castShadow = true; scene.add(key);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    s.box = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshStandardMaterial({ color: '#ff8fab', roughness: 0.55 }));
    s.box.castShadow = true; scene.add(s.box);
  },
  draw(s) {
    s.box.position.y = 1 + 6 * (1 - E.settle(s.p(0.3, 1.0, E.linear)));
    s.trace('box', ...s.g.screen(s.box), { r: 90 });
    s.g.render();
  },
});
```
Chrome draws the frames and WebGL on the NVIDIA GPU when the engine finds one (ANGLE on EGL, PRIME offload on a
hybrid laptop), and NVENC encodes the video; `make render` prints which device it uses. `XV_GPU=0` forces the CPU
path (SwiftShader and libx264). The CPU path must still work, so keep scenes simple: a few thousand triangles,
one shadow-casting light, shadow map 1024.

## Commands

`make` = `node ~/.claude/skills/kaleidoscope/engine/make.mjs`

| Command | Does |
|---|---|
| `make build <dir>` | **one shot**: voice, manim, check, sheet, review pack, in order; stops at the first ERROR. Finished steps are cached |
| `make final <dir>` | **one shot**: render, verify |
| `make doctor` | checks the tools |
| `make init <dir> --title "..."` | new project |
| `make voice <dir>` | voice + timings + narration track + subtitles + pacing table |
| `make manim <dir>` | renders each `Timed` class in `manim_scenes.py` whose code or timing changed, to frames in `build/manim/<id>/` (in parallel). `--all` every scene, `--scene id` one scene, `--draft` half size. Prints "started late" warnings |
| `make check <dir>` | scene errors, cues that do not exist, text outside the safe area or too small, pacing. Exit 1 on errors |
| `make sheet <dir>` | contact sheets, 3 frames a scene. `--scene id` one frame a second, `--every 2` whole video |
| `make still <dir> 12.5 intro@end idea@#step idea@lambda` | full-size PNGs in `build/stills/` |
| `make review <dir>` | `build/review/`: the pack the 5 reviewer agents read. Transcript with a still a sentence, a grid at each cue, the motion of every traced thing at every frame, film strips |
| `make subtitles <dir>` | `build/subtitles.srt` again from `build/timeline.json`, with no new voice run. One line per cue, at most 42 characters. Then `make render <dir> --remix` puts it in the MP4 |
| `make render <dir>` | `out/<slug>.mp4` (soft subtitles) + `.srt`. `--draft` half size, `--from s --to s` one part to `build/`, `--workers n`, `--remix` new audio on the last render's frames. Makes `build/music.wav` at the video's length first (cached) |
| `make verify <dir>` | duration, streams, loudness, black frames |
| `make preview <dir>` | prints a URL: the video in a browser with the voice (space, arrow keys) |

`voice` must run again after any change to `script.md`. The other commands stop with an
error if `script.md` is newer than the timeline.
