# Notes on the six ported styles

Source: lemo-opuscar (MIT, (c) 2026 LemoLab). All paths below are relative to the source repo
root. Sizes are line counts in the source. I read the code; I did not run any of it.

## General points

- **Shared helpers in the source.** Most demo code imports `core/lib.js`: `clamp`, `lerp`, `seg`,
  `ss`, `eio`, `eo`, `back`, `spring`, `mulberry`, `hash`, `vnoise`, `monotone`, `track`. The
  engine already has `clamp`, `lerp`, `rng` (use it for `mulberry`) and `E.*`. Port `vnoise`
  (1 line, slow 1D noise for hand wobble) and `monotone` + `track` (`core/lib.js` lines 18 to 43,
  26 lines: monotone cubic keyframes with no overshoot) into `common.js`. Teardown and the
  whiteboard camera need them.
- **Port as functions with arguments.** The demos keep state in module globals (a shared canvas,
  `cam`, `scene`, window objects such as `NET`, `DATA`, `TL`, `X`). The library rule is "no time
  except through arguments", so each port must take `ctx`, the camera and `t` as arguments.
- **Subtitles and sound.** Every demo burns in subtitles and has its own score and foley code
  (`mix.py`, `music.py`, `audio/`). Do not port them: the target has soft subtitles and engine music.
- **Third-party material in the posters.** The posters show demo frames. The briefing-board poster
  has CC BY photos, the telestrator poster has CC BY 3.0 broadcast footage and a CC BY 2.0 photo,
  and the teardown poster shows a keyboard from CC BY 4.0 / MIT CAD files (foostan). The MIT licence
  covers LemoLab's code and text, not those assets. Each poster's credits are in the
  source's `styles/<name>/demo/CREDITS`; this repo copies no poster.
- **Fonts in the target** (from `~/.explainroo/fonts/fonts.json`): `Inter` 100 to 900 (variable,
  no italic), `JetBrains Mono` 400 and 700 only, `Space Grotesk` 500 and 700, `Plus Jakarta Sans`
  600 and 800, `Cabin Sketch` 400 and 700, `Kalam` 400 and 700, `Patrick Hand` 400,
  `Architects Daughter` 400, `Instrument Serif` 400 (normal and italic). No CJK font: drop every
  second-language (Chinese) line of the source styles.
- **Three.js version.** The engine vendors three r160 (`engine/vendor/three.module.min.js`) with no
  add-ons. The teardown demo uses r170 plus `RGBELoader`, `RectAreaLight` and its own post stack.

## whiteboard

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/whiteboard/demo/engine/wb.js` | `Stroke` (class) | resampled stroke with slow hand wobble (`vnoise`), end overshoot and hook, arc-length table, hand-speed `prog(t)` | 50 |
| same | `ribbon` | variable-width marker ribbon: chisel width by direction, pressure ramp, end taper, dots for short strokes | 30 |
| same | `line`, `circle`, `rect`, `arrow`, `dashed`, `hatch` | hand shapes: bowed line, circle that overlaps its start, 4-stroke rectangle with overshoot, arrow, dashed line, zig-zag fill | 46 |
| same | `text`, `EXTRA`, `loadFont` | single-line lettering in stroke order with per-glyph jitter; hand-made glyphs μ ≈ → × − ✓ ² ↓ ± ° | 42 |
| same | `Timeline.draw`, `Timeline.erase` | schedules strokes for a pen; `by` mode solves hand speed so the writing ends on a deadline | 36 |
| same | `penPose`, `drawMarker`, `drawEraser`, `drawPinMagnet` | floating marker with lift and shadow, felt eraser, glossy map-pin magnet | 24 + 29 + 20 + 13 |
| same | `Board.render`, `noiseTile`, `boardTile` | board gradient, scuffs, ghosts, ink layer with `multiply`, dry-marker speckle (`destination-out`), window sheen | 85 + 23 |
| same | `Camera`, `applyCam` | keyed 2D camera, zoom interpolated in log scale with a stable midpoint | 16 |

Care:
- **Single-line font.** The source writes with `EMS Tech` (`demo/fonts/EMSTech.json`, 35 KB, SIL
  OFL 1.1, a single-line derivative of Architects Daughter by Sheldon B. Michaels, SVG by Windell
  H. Oskay). The target has only outline fonts, so the ported file reveals `Architects Daughter`
  glyph by glyph with a clip. To get true stroke order, add `EMSTech.json` and `text()` to the
  library and keep the OFL notice from the JSON `meta` field.
- **Seeds by order.** `wb.js` gives each stroke `SEED++` from a module counter, so the wobble
  depends on the order in which strokes are made. Pass an explicit `seed` to every shape in a port.
- **Speed.** `Board.render` and the props use `OffscreenCanvas` and `ctx.filter = blur(...)` for
  shadows every frame. This is slow on the CPU render path; bake textures once in setup.

## transit-map

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/transit-map/demo/film.js` | `rounded` | octilinear polyline → dense polyline with circular fillets and an arc-length table | 21 |
| same | `pointAt`, `dirAt`, `subPath` | point and direction at a length; trace part [a, b] of a path | 12 |
| same | `stopDot`, `capsule`, `tipGlow`, `train`, `pier` | stop disc, interchange stadium, glowing pen tip, vehicle capsule, ferry pier | 22 |
| same | `surfaceLine` | hollow (bus) and lane (ferry) line forms with paper cut out by `destination-out` | 18 |
| same | `fallingCapsule`, `dropRing` | interchange that falls with a sharpening shadow, shock rings in the line colours | 23 |
| same | `placeLabels` | places every label once against the finished network (8 candidates, scored) | 29 |
| same | `paperTexture` | procedural paper tooth and fibres | 23 |

Care:
- **WebGL pass.** `demo/gl.js` is a custom WebGL2 shader (paper, raking light, depth of field on a
  tilted plane). It does not fit the engine. Use the canvas map, or a `CanvasTexture` on a Three.js plane.
- **Coupled code.** `film.js` reads `window.NET` and `DATA` and its own hooks; extract the functions
  above and pass the network as an argument. `placeLabels` needs the label metrics table `LBL`.
- **Fonts.** `Inter` is available. `Noto Sans SC` is not: drop the second-language line.
- **Facts.** The source requires real, cross-checked network data and a `FACTS.md`. For an
  engineering topic drawn as a network, this means the real topics, nodes and rates of the system.

## briefing-board

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/briefing-board/demo/kit/board.js` | `motion` | arrivals and exits: `drop` (lowered, lands, bounces), `swing` (tags), `snap` (magnets), `slide`, `pop`; impact `jolts` | 40 |
| same | `bease` | ease whose speed is `u^a (1 − u)^b`: smooth start and stop, `b > a` gives inertia | 9 |
| same | `drawPrintShadow` | soft shadow from the photo silhouette along one light vector, softer with height | 13 |
| same | `magnet`, `drawTag`, `drawRuler` | glossy round magnet, paper tag with magnet and red strike-through, brushed steel ruler | 8 + 21 + 18 |
| same | `stampTexture`, `drawStamp` | rubber stamp with double border and pits (seeded), lands from 1.18× in 0.07 s | 23 |
| same | `inkStroke`, `polyPath`, `arrowHead` | marker stroke with lighter core; partial path with tip and angle; arrowhead | 22 |
| same | `drawInkCore` | ink kinds: line, hatch, dimension line with extension lines, ring, arc, wake | 52 |
| same | `drawInk` | eraser band that leaves a blurred 7 % ghost | 15 |
| same | `writeLayout`, `drawWrite` | marker font revealed glyph by glyph with seeded tilt and baseline jitter | 31 |
| same | `lightOverlay` | window light falloff and the slow diagonal reflection on the enamel | 30 |

Care:
- **Fonts.** `LXGW Marker Gothic`, `Archivo`, `IBM Plex Mono` and `Noto Sans SC` are not in the
  target. Use `Cabin Sketch` 700 or `Patrick Hand` for marker lettering, `Space Grotesk` 700 for tags,
  `JetBrains Mono` for numbers.
- **Cut-outs.** The kit cuts photos with a BiRefNet ONNX model (about 970 MB) and Python tools
  (`demo/kit/tools/prep_object.py`). Do not run them from the source folder. Ask the user for PNG
  cut-outs, or cut with a hand polygon in setup (clip path).
- **Photo licences.** Each photo needs its licence checked and a credit line (the source rule:
  CC0, public domain or CC BY; ask for anything else).
- **Overlap with whiteboard.** Both are marker boards. Keep briefing-board for photos plus
  measurement plus verdict, and whiteboard for drawings and derivations.

## blueprint

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/blueprint/demo/draw.js` | `line`, `trunc` | draw-on polyline with dash conventions, width × zoom^0.65, nib point | 14 + 10 |
| same | `solid` | closed outline with oblique extrusion and hidden-line removal by fill order | 21 |
| same | `hatch` | 45° section hatching clipped to a polygon, drawn on by progress | 17 |
| same | `gearPts` | gear outline with trapezoidal teeth (module, tooth count, rotation) | 11 |
| same | `dim`, `arrow`, `balloon` | dimension line with extension lines and lettered value; part balloon with leader | 24 + 5 + 15 |
| same | `nibs` | glowing pen tips at the heads of lines being drawn | 6 |
| `styles/blueprint/demo/sheet.js` | `titleBlock`, `border`, `header` | title block with status and revision fields, sheet border, header | 30 + 20 |
| same | `revCloud`, `revImprint` | revision cloud (lobed outline) and its pale imprint | 87 + 10 |
| same | `stamp`, `handShadow` | rubber stamp; soft hand shadow with a pen | 12 + 20 |

Care:
- **Compositor.** `demo/paper.js` is a WebGL2 shader (cyanotype noise, folds, wet stains, shadows,
  stamp ink). The ink canvas is a mask (white = line, black = sheet) that the shader colours. In the
  engine, draw lines in the ink colour and knock out with the sheet colour. Make the sheet noise once
  in setup as a canvas pattern.
- **Global state.** `draw.js` shares `cam`, `proj` and three module canvases; port with arguments.
- **Fonts.** `Architects Daughter` is available. `B612` and `B612 Mono` → `JetBrains Mono`.
  `Allura` (signature) → `Instrument Serif` italic.
- **Subtitles as notes.** The source letters each subtitle into a NOTES box on the sheet. Drop this:
  it is on-screen text over the word budget, and subtitles are soft.
- **Dark.** The source look is dark. The ported file adds a whiteprint (light) variant.

## teardown

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/teardown/demo/src/overlay.js` | `label` | anchor dot with a growing ring, two-segment leader, index, name and spec line | 29 |
| same | `dimension` | perspective dimension line with extension lines, end ticks and a value plate | 22 |
| `styles/teardown/demo/src/main.js` | `layerE`, `gapE`, `layerY`, `capY` | layer separation (top first), gap opening, float, wave order, one real key stroke | about 25 |
| `styles/teardown/demo/src/parts.js` | `loft`, `keycapGeometry`, `shapeFrom` | lofted shell; keycap with a dished top; extrusion from an outline with holes | 14 + 21 + 8 |
| `styles/teardown/demo/src/pcbtex.js` | `paintPCB` | PCB colour, roughness, metalness and bump maps from extracted layout data | 64 |
| `core/lib.js` | `monotone`, `track` | camera keys without overshoot | 26 |

Care:
- **Rendering.** The demo uses three r170, `core/three/post.js` (2× SSAA, ambient occlusion, depth
  of field, bloom), an HDRI and `RectAreaLight`. The engine has r160 without add-ons and must also
  run on the CPU. Use `world()` from `toy3d.js`, one shadow light, a rim `DirectionalLight` without
  shadow, and no post effects.
- **CAD tools.** STEP import needs `occt-import-js` (LGPL-2.1); KiCad import is Python
  (`tools/extract_pcb.py`, `kicad_geom.py`, `sexp.py`). Run them only in a separate, empty folder,
  never from the source tree, and keep their output (JSON, meshes) in the project's `assets/`.
- **Text size.** The source specs are 15 to 22 px. The target minimum is 28 px; the ported file says so.
- **Fonts.** `Inter` and `JetBrains Mono` are available (`JetBrains Mono` 500 is not: use 400 or 700).
  `Noto Sans SC` is not.
- **Dark.** The source look is dark. The ported file is a light studio variant.

## telestrator

| Source file | Function | What it draws | Size |
|---|---|---|---|
| `styles/telestrator/demo/index.html` | `marker`, `wob`, `partial` | marker line (dark outline, glowing core, highlight), fixed vertex wobble, arrowhead pop | 19 + 4 + 5 |
| same | `ring` | perspective ring under an object, turning dashed outer ring, optional light beam | 20 |
| same | `tag` | black label card with a colour bar, revealed by a wipe | 15 |
| same | `spot`, `flash`, `grade` | spotlight with an even-odd hole, white flash, freeze grade (desaturate, cool, vignette) | 6 + 1 + 8 |
| same | `drawSrc` | footage frame with neighbour cross-blend for slow motion, zoom about a point | 10 |
| same | `stopwatch` | frame-counting stopwatch card | 9 |
| same | `rewindFx` | rewind jitter and tracking bars | 8 |
| same | `Hap`, `drawTri` | homography point map; affine-mapped image triangle for the perspective flatten | 1 + 10 |

Care:
- **One page.** `index.html` (936 lines) keeps everything in globals (`X`, `TL`, `COL`, `TRK`).
  Port the functions above with `ctx` as an argument.
- **Footage frames.** The demo frames are not in the repo (fetched at build time). In the engine,
  extract frames into `assets/` and load them on demand in an `async draw`; wait for
  `img.decode()` before drawing, or a frame can render blank.
- **Homography.** The fit is offline Python (`demo/tools/homography.py`). For the engine, fit it
  in setup from 4 or more point pairs (a small least-squares solve) or compute it once by hand.
- **Fonts.** `Noto Sans SC` 900 → `Inter` 800 or 900. `Barlow Condensed` 800 italic has no match:
  use `Inter` 800 (no italic) or `Space Grotesk` 700. `IBM Plex Mono` → `JetBrains Mono` 700.
- **Packaging.** The corner bug, score bar, sting and yellow wipe exist to cover broadcaster logos.
  The ported file drops them. Use a library wipe (`makeWipe`, `endWipe`) for the hand-over between parts.
- **Rights.** Use the user's own footage first. Do not freeze on an identifiable bystander.


# Notes on the second set of ported styles

Source: lemo-opuscar (MIT, (c) 2026 LemoLab). All paths are relative to the source repo root.
Sizes are line ranges in the source. I read the code; I did not run any of it.

## General points

- **Same rules as the first set.** See the first set above: port functions with `ctx`,
  the camera and `t` as arguments (the demos keep state in module globals); drop burned-in subtitles,
  scores and foley (`mix.py`, `music/`, `audio/`); `core/lib.js` `monotone` + `track` (lines 18 to 43)
  are still the first helpers to port, because three of these demos use them for camera keys.
- **Three.js.** The demos use three r170 with add-ons: `RoomEnvironment`, `RGBELoader`,
  `RoundedBoxGeometry` and the library post stack `core/three/post.js` (SSAA, GTAO, depth of field,
  bloom). The engine has r160 core only and must run on SwiftShader. Use `world()` from `toy3d.js`,
  `BoxGeometry` or `CylinderGeometry`, one shadow light with a 1024 map, no post. An environment for
  metal can be made once with `PMREMGenerator.fromScene` (core) from a box with two bright panels.
- **Fonts.** Not in the target: Inter Tight, IBM Plex Mono, Noto Sans SC / Serif SC, Jost, Oleo Script,
  Alfa Slab One, Instrument Sans, Cormorant Garamond, Caveat, Newsreader, Bricolage Grotesque. The
  ported files use `Inter` (Inter Tight), `JetBrains Mono` (IBM Plex Mono), `Plus Jakarta Sans` or
  `Space Grotesk` (Jost, Instrument Sans, Bricolage), `Instrument Serif` (Cormorant, Newsreader, and
  the italic for Oleo Script), `Kalam` (Caveat), `Plus Jakarta Sans` 800 (Alfa Slab One). Every
  second-language (Chinese) line is dropped.
- **Text size.** The source labels are often 18 to 26 px. The ported files set 28 px or more and
  36 px for labels.
- **Poster material.** The `data-physical`
  poster shows IRENA / Our World in Data figures (CC BY 4.0); the `watercolor` demo uses a CC BY 4.0
  music track. The posters and demo films are not copied here.

## data-physical

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/data-physical/demo/set.js` | schedule loop, `landed` | landing time, jitter, shade and ruler flag for every piece; landed count at time t | 27 to 49 |
| same | `pose` (in `buildSet`) | one piece's matrix at time t: cascade drop, or a feed with a quintic fall and an unwinding yaw | 137 to 149 |
| same | `update` (in `buildSet`) | instanced matrices; the last object's gravity fall and damped bounce | 150 to 159 |
| same | inlay block (in `buildSet`) | the base inlay on a canvas: tick ring, series paths, year labels | 79 to 101 |
| same | puck block (in `buildSet`) | the last object with the total engraved on a canvas texture | 119 to 135 |
| `styles/data-physical/demo/film.js` | `pairLabels`, `stackLabel`, `plate`, `swatch`, `verdict` | readings pinned to stack tops, sorted, clamped to a safe box; the accent verdict | 85 to 129 |

Could not convert well:
- **Materials.** The look depends on an HDRI (`RGBELoader`), acrylic with `transmission`, a 4096
  shadow map and GTAO. Without them, metal is darker and the acrylic is opaque. The ported file
  sets metalness 0.5 or a `PMREMGenerator` environment.
- **Textures.** The walnut veneer is a Poly Haven texture set (CC0) in `core/assets/`, not in the
  repo style folder. Draw a wood grain on a canvas in setup, or add the CC0 texture to `assets/`.

## desktop-flythrough

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/desktop-flythrough/demo/src/voxel.js` | `makeMonster` | pixel sprite → instanced voxel toy: depth by distance from the edge, eyes that stand proud and blink, hinge (sticker ↔ toy), squash, extrude ripple | 13 to 69 |
| `styles/desktop-flythrough/demo/src/anim.js` | `squash`, `hops`, `beatBounce`, `pop` | squash and stretch from landings; hops along a list; bounce on the beat; the sticker pop | 9 to 54 |
| `styles/desktop-flythrough/demo/src/camera.js` | `makeRig` | one-take camera: Hermite target over live subjects, log distance, bank on whips, shakes, 110 px view offset | 11 to 42 |
| `styles/desktop-flythrough/demo/src/cards.js` | `canvas`, `txt`, `tag`, `grain`, `cardBase`, `dotTile`, `tick`, `cross` | card print: 3× canvas, spaced mono caps, a two-line head, seeded grain, the dot tile | 10 to 65 |
| `styles/desktop-flythrough/demo/src/world.js` | `woodTile`, `card`, `pill` | light oak planks; a card slab with a printed top; a camera-facing pill | 43 to 72, 103 to 114 |
| `styles/desktop-flythrough/demo/src/film.js` | `phone`, `pix` | a whole phone interface on a card; pixel art with an optional blur ("blurry, then sharp") | 54 to 102 |

Could not convert well:
- **Post.** The demo renders 16 to 24 sub-frames with Halton jitter per frame (anti-aliasing and
  motion blur), then depth of field and bloom (`src/post.js`). The engine renders one frame, so
  edges are harder and fast whips have no blur.
- **Add-ons.** `RoundedBoxGeometry` and `RoomEnvironment` are add-ons: cards and voxels become
  plain boxes, which lose the bevel that catches the low sun.
- **Beat grid.** The style puts every action on a 16th note of the score and gives each action a
  sound. With narration only, keep the grid for rhythm, but the sync to music is lost.
- **Hiding.** `makeMonster.set` uses `root.visible`; the port must use `showK`.

## midcentury-toon

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/midcentury-toon/demo/engine/toon.js` | `reg`, `setClock` | the register offset of the colour cel, re-rolled on twos | 46 to 55 |
| same | `ink` | pressure ink ribbon: breathing width, taper, seeded breaks, draw-on by `upto` | 152 to 200 |
| same | `shape`, `plane`, `grainIn` | any shape in the style: off-register fill, flat shade planes, tooth, broken ink line | 142 to 219 |
| same | `starPts`, `star`, `sparkle`, `rays`, `atom`, `boomerang`, `kidney` | mid-century ornaments | 220 to 259 |
| same | `arrow`, `dashed`, `text`, `fit` | the manual arrow with a bobbing head; dashed line; two-plate lettering; wrap and shrink to fit | 261 to 312 |
| `styles/midcentury-toon/demo/engine/chars.js` | `drawHand` | four-finger glove: open, flat, point, grip (one union outline) | 26 to 49 |
| same | `drawOwner` and its helpers | the presenter: held body, arms by 2-bone IK, kneel pose, head with the nose in the outline, faces | 12 to 184 |
| `styles/midcentury-toon/demo/engine/icons.js` | `icon`, `ICONS` | 18 icons in the style (dock, phone, plug, cable, gear, bulb and more) | 7 to 72 |
| `styles/midcentury-toon/demo/film.js` | `callout`, `medallionAt`, `tag`, `stepHeader` | round call-out with a dashed leader; numbered medallion stamp; detail tag; step header | 80 to 128 |
| same | `laneY`, `buildPath` | potential-flow coverage lanes that bend round obstacles and never cross | 461 to 547 |

Could not convert well:
- **Fonts.** The look leans on Oleo Script (kicker) and Alfa Slab One (titles). The substitutes
  (`Instrument Serif` italic, `Plus Jakarta Sans` 800) lose most of the 1950s lettering.
- **Shot grammar.** The source changes step through an iris on each medallion, which is a cut. The
  skill wants one continuous shot per part, so the ported file keeps the steps on one stage and uses
  the iris only for the hand-over to the next part.
- **Length.** A full set-up film is 30 to 40 s for 3 steps. Within one part, plan 2 or 3 steps.
- **Music.** The cool-jazz score carries the rhythm (one vibraphone chord per step). It is dropped.

## iso-infographic

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/iso-infographic/demo/engine.js` | `tri` | three tones from one colour (toward warm white and a cool dark) | 26 |
| same | `Iso` (class) | projection, log-zoom camera, depth-sorted queue, `box`, `prism`, `cyl`, `cone`, `roof`, `sphere`, `flat`, `line3`, `bill`, `text3`, local frames, the desaturate-except-subject hook | 39 to 244 |
| same | `haloText`, `pin` | text with a ground-colour halo; label pin with a staged reveal and an icon row | 252 to 285 |
| same | `inset`, `ring`, `cutLine`, `hatch` | circular inset with a leader; turning "you are here" ring; cut line; hatched section face | 286 to 324 |
| same | `ICON`, `iconGrid` | Isotype icons in three tones; a grid whose lit count can be fractional (the next icon pops) | 325 to 345 |
| same | `person`, `shape` | minimal people for billboards; any 2D outline as a shaded isometric solid | 346 to 383 |
| `styles/iso-infographic/demo/hero.js` | `palm`, `pinch`, `cup`, `kmTag` | faceted close-up of a hand in three tones; a tag for the echo shot | 10 to 109 |

Could not convert well:
- This style converts well; its projection is the same as the engine's `iso()`.
- **Word budget.** The demo has 8 labelled stations and a legend end card. The skill allows about
  15 words and no legends, so a part has 4 or 5 stations and ends on the total and one bar.
- **The dive.** The demo dives through nested cutaways (zoom 3.75 to 8,000) and hides a time jump in
  it. This needs level-of-detail code (skip detail above a zoom, a flat backdrop); port it only when
  a video needs a scale dive.

## watercolor (merged into watercolour.md)

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/watercolor/demo/engine.js` | `mk` | a stroke: centre line, width profile (brush, leaf, even, tip, trunk), roughness, bristle tracks with dash patterns | 61 to 86 |
| same | `drawS`, `drawList` | paint a stroke to fraction p (moving brush tip); paint a list in order, structure first | 87 to 115 |
| same | `sprite`, `bbox`, `clump`, `edgeOf` | cache a finished object; a cluster of leaves; an ink edge along one side of a stroke | 116 to 142 |
| same | `withSeed`, `qcurve`, `qctrl` | seeded stroke building; curved centre lines | 7, 47 to 57 |
| `styles/watercolor/demo/scene.js` | `washPoly` | wash in 3 passes with jittered vertices (pooled edges) | 149 to 155 |
| same | `hand`, `leader`, `note` | hand-written note revealed left to right, a pen leader that grows to its subject | 408 to 430 |
| same | `mistBand` | paper-coloured mist between depth layers | 277 to 284 |
| `styles/watercolor/demo/main.js` | `drawMist` | erase to paper with a wavy rising edge | 129 to 140 |
| `styles/watercolor/demo/paper.py` | (script) | paper texture: noise octaves, fibres, grain, vignette | 1 to 27 |

Could not convert well:
- **Engine RNG.** `mk` draws from a global RNG, so strokes built in `render(t)` must use `withSeed`.
  In the engine, build every stroke in setup with `rng(seed)`.
- **Frame rate.** The source paints at 60 fps for a fluid brush; the engine runs at 30 fps.
- **Line boil.** The target file kept its optional boil; the source keeps everything still. The
  merged file allows boil on ink lines only.
- **Paper.** `paper.py` is Python; make the paper once in setup on a canvas.

## risograph (merged into risograph.md)

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/risograph/demo/riso.js` | `FS` (GLSL) | the print: per-plate offset and rotation, halftone on its own angle, grain, pinholes, feed streaks, blots, gates, roller sweep, water reflection | 17 to 107 |
| same | `makeRiso` | WebGL2 setup and the `print(plate, opts)` call with all uniforms | 109 to 154 |
| `styles/risograph/demo/draw.js` | `layer` | a character with a paper knockout halo (12 offset stamps with `brightness(0)`) | 11 to 24 |
| same | `ink`, `inkA`, `over`, `clear` | colour as plate densities; overprint with `'lighter'` | 25 to 33 |
| same | `blob`, `limb`, `ik` | smooth closed shape; a striped limb; 2-bone IK | 41 to 83 |

Could not convert well:
- **Print shader.** `riso.js` is a raw WebGL2 program on its own canvas. Port it as a Three.js
  `ShaderMaterial` (`glslVersion: THREE.GLSL3`) on a full-screen quad with the separation canvas as
  a `CanvasTexture`. The CPU dot loop in the merged file is slower (about 100,000 dots a plate).
- **Encoding.** Saturated dots smear in 4:2:0 video. The source encodes yuv444 with
  `-tune grain`; the engine's encoder settings are fixed, so keep the dot period at 7 px or more and
  check the render at 100 %.

## dataviz (merged into data-story.md)

| Source file | Function | What it draws | Lines |
|---|---|---|---|
| `styles/dataviz/demo/engine.js` | `rampRGB`, `valueColor` | diverging ramp around a reference mean, symmetric span | 15 to 31 |
| same | `paperTile`, `grainTile`, `drawPaper` | cream paper with fibres and a dot grid fixed in world space | 52 to 93 |
| same | `pencilStroke` | any polyline in pencil: wobble, taper, graphite grain, write-on; returns the tip | 102 to 131 |
| same | `leader`, `ringPath`, `bracketPath` | curved note leader; open hand-drawn ring; bracket | 133 to 159 |
| same | `textImage`, `handText` | handwriting with per-glyph jitter and grain, revealed left to right | 160 to 188 |
| same | `dataDot`, `inkLine`, `morphMark` | a mark that lands with a pop and a ripple; series line; dot → stripe morph | 210 to 241 |
| same | `dashedCell` | the dashed "next value" cell, drawn on | 244 to 259 |
| same | `pencilBody`, `drawPencil` | the red and blue pencil with lift, lead flip and shadow | 260 to 321 |
| same | `plotShape`, `inkShape` | any path as a dot-and-line series; any closed shape as a hatched mark | 354 to 394 |

Could not convert well:
- **Sonification.** In the source the data is the music (pitch = value). The skill has narration
  and engine music only, so the merged file keeps one line on what a sound would mark.
- **Figure caption.** The source subtitle is a figure caption drawn on the paper. Subtitles here
  are soft, so the caption is dropped.
- **Colour.** The source allows colour only for the value. The skill keeps one colour per object
  across parts, so the merged file allows the value or the object's colour role.
