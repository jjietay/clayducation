# Choosing styles

A style is there to make an idea easier to understand. The user also wants variety: a
**mix of styles, one per part**, like the reference video
`~/Documents/(a local folder)` (see SKILL.md, "The look
the user wants"). Choose a style for each part by the **type of idea** in it (table below),
then read only the style files you chose.

## Rules for mixing

- **One part, one style.** A part is one idea, about 15 to 40 s, shown as one continuous
  shot. Inside a part, keep the style; between parts, change it.
- **Never the same style in two parts in a row.** A 3-minute video has about 5 to 8 parts,
  so it uses about 5 to 8 styles. A style may come back later in the video.
- **Keep the meaning, change the look.** The same object keeps its colour in every part
  (for example the robot always orange, the map always yellow, the correction always
  violet), and the kicker sits at the same place. The style changes the drawing, not the
  meaning.
- **Hand over each change.** End a part with a wipe in the next part's background, or with
  a shape that the next part starts from (see `reference/engine.md`, "Carry one scene into
  the next").
- **Mostly light backgrounds.** At most two dark parts in a video. The dark styles are `shape-morph` (navy), `pixel-art`, `dark-keynote`, `hud-terminal`, `newsreel` and `blueprint` (its whiteprint variant is light).
- If the user names a style for a part, use it.

## By type of idea

| Type of idea | First choice | Also good |
|---|---|---|
| Vectors, matrices, linear maps, eigenvectors, PCA, SVD | `math-manim` | `shape-morph` for one shape becoming another |
| Probability, Gaussians, covariance, Mahalanobis distance | `math-manim` (ellipses, point clouds) | `data-story` for real numbers |
| Image processing: pixels, kernels, convolution, thresholds, morphology | `pixel-grid` | `data-story` for histograms |
| Camera models, projection, coordinate frames, hand-eye, kinematics | `toy-3d` | `isometric` |
| Robot cells, hardware layout, wiring, pipelines with physical parts | `isometric` (lift the roof to show inside) | `toy-3d`, `teardown` (the hardware taken apart) |
| Neural networks, attention, transformers, message passing | `signal-graph` | `flat-vector` |
| Multimodal LLMs, agents, tool calls, system architecture | `signal-graph` or `flat-vector` | `hud-terminal` for the actual text, `desktop-flythrough` (tools as cards, the request as a toy) |
| Tokens, embeddings, prompts, model output | `hud-terminal` | `math-manim` for embedding space |
| Training: loss, gradient descent, overfitting | `math-manim` (loss surface, steps) | `data-story` for curves |
| Reinforcement learning: agent, reward, policy, value | `pixel-art` grid world | `data-story` for returns |
| Signals and protocols: I2C, UART, PWM, timing | `single-line` (the waveform draws itself) | `hud-terminal`, `isometric` for the board, `transit-map` for a bus with many devices (each device a station) |
| A process or cause → effect chain | `flat-vector` | `isometric`, `whiteboard` (the pen leads the camera), `iso-infographic` (when each step has a number) |
| A debugging story, "your case", a mistake | `line-boil` | `paper-cutout`, `pixel-art`, `telestrator` (when there is real footage of the failure) |
| Results, measurements, comparisons | `data-story` | `swiss-type`, `data-physical` (when the size matters more than the exact value) |
| Two options compared, a trade-off, "which one?" | `shape-morph` (shapes split, grow, sit on a balance) | `flat-vector`, `briefing-board` (both against one limit) |
| A loop of steps an agent or a program runs | `single-line` with handwritten labels | `signal-graph`, `desktop-flythrough` |
| A model or a node that "speaks" or decides | `pixel-art` with a character and a dialogue box | `line-boil` |
| A real demo, a photo, a log | `paper-cutout` (photo on paper, cut-out characters) | `hud-terminal`, `telestrator` (freeze and draw on it) |
| Title, hook | `flat-vector` with characters that act out the problem | `swiss-type`, `risograph` (a printed poster) |
| Close, plan, timeline, recap | `toy-3d` (soft blocks, a book, a calendar) | `swiss-type`, `transit-map` (end on the whole network), `iso-infographic` (end on the finished map with the total) |
| A derivation, a formula built term by term, a proof | `whiteboard` | `math-manim` |
| Data pipelines, message flows, ROS topic graphs, a system that grows | `transit-map` | `signal-graph` |
| A choice against a limit: part selection, a spec check, pass or fail tests | `briefing-board` (photo, dimension line, stamp) | `data-story` |
| A mechanism or a part design: gears, linkages, brackets, revisions | `blueprint` (whiteprint for a light part) | `isometric` |
| How a device is built: layers, hidden parts, real dimensions | `teardown` | `toy-3d`, `isometric` |
| The user's demo video or photo, analysed frame by frame | `telestrator` | `paper-cutout` |
| A size to feel: a dataset, a compute budget, storage, two counts compared | `data-physical` | `data-story` |
| A process whose stages carry numbers that add up: a latency budget, a cost, a dataset by source | `iso-infographic` | `transit-map` |
| A software or toolchain setup, a request that travels between programs, a code base tour | `desktop-flythrough` | `hud-terminal`, `flat-vector` |
| How to do it: a setup procedure, lab safety rules, a checklist before a test | `midcentury-toon` | `whiteboard` |
| The history of an idea as news: who did it first, where and when; a paper or a release as a headline; how a method spread | `newsreel` | `film-crt`, `transit-map` (when the history is a network that grows) |

When the first choice is the style of the part just before, use the "Also good" style.
The reference video's choices, part by part: title `flat-vector` (cartoon), the question
`shape-morph` (navy), the setup `isometric`, architecture A `single-line`, architecture B
`pixel-art`, the failure story `line-boil`, the demo `paper-cutout`, the close `toy-3d`.

## All styles

Styles listed under "Styles adapted from lemo-opuscar" below are adapted from lemo-opuscar (MIT).
A sample picture of the newsreel style, made with this engine, is `../gallery/png/newsreel.png`.

| File | Look in one line |
|---|---|
| `math-manim.md` | Manim (3Blue1Brown look): the plane itself moves, formulas morph; rendered by `make manim` |
| `pixel-grid.md` | zoomed-in pixel grid with values; a kernel window slides over it |
| `signal-graph.md` | nodes and edges; pulses travel along edges, edge width = weight |
| `flat-vector.md` | flat shapes, overshoot entrances, a growing shape changes the scene |
| `shape-morph.md` | no cuts; each idea grows out of the previous shape; metaball liquid |
| `single-line.md` | one line draws everything at a steady speed and never lifts |
| `isometric.md` | miniature world, three-tone blocks, roofs lift off to show insides |
| `toy-3d.md` | soft pastel Three.js objects that land with weight and a contact shadow |
| `line-boil.md` | hand-drawn ink that boils, animated on twos, faces act |
| `pixel-art.md` | 320 x 180 canvas scaled 6 times, fixed palette, dithering, typed dialogue |
| `paper-cutout.md` | card layers with cut edges, stop motion, parallax camera |
| `data-story.md` | one chart per screen, drawn mark by mark by a pencil; notes pinned to the data; counters land on exact values |
| `hud-terminal.md` | monospace on a character grid, numbers roll, brackets lock on |
| `swiss-type.md` | 12-column grid, kinetic type, hard snaps, one signal colour |
| `dark-keynote.md` | near-black, one giant number, slow light sweeps |
| `watercolour.md` | brush strokes with dry-brush streaks paint themselves in; washes bleed past the ink; hand-written notes |
| `risograph.md` | 2 to 3 inks that multiply, halftone dots fixed to the paper, offset plates that kick on accents |
| `film-crt.md` | one era of film or tape: grain, gate weave, chroma shift |
| `whiteboard.md` | dry-erase marker on a glossy board, written stroke by stroke; the camera travels, magnets move, the eraser rewinds |
| `transit-map.md` | octilinear metro map on paper; lines grow from glowing pen tips, interchanges fall into place, capsules run on finished track |
| `briefing-board.md` | enamel board with cut-out photos, tags and magnets; blue dimension lines measure, one red stamp gives the verdict |
| `blueprint.md` | white line work on Prussian blue (dark) or blue on cream (whiteprint, light), drawn in drafting order with dimensions and balloons |
| `teardown.md` | a real product in Three.js from its CAD files; layers lift apart on one axis, leader labels carry real numbers |
| `telestrator.md` | footage or a photo, frozen and drawn on: rings, marker arrows, a red gap, one finding per freeze |
| `data-physical.md` | numbers built as stacks of metal, acrylic and brass pieces on a wooden base, lit like a product |
| `desktop-flythrough.md` | apps as printed paper cards on a sunlit desk; pixel voxel toys hop between them in one camera take |
| `midcentury-toon.md` | 1950s flat colour printed off a broken ink line; a held presenter whose hands do each step |
| `iso-infographic.md` | a floating isometric board with a route, label pins and icon counts that add up to a total |
| `newsreel.md` | a 1920s newsreel in a silver film gate: a paper spins in and slams, place cards, grease pencil, iris and wipes |

## Styles adapted from lemo-opuscar

Eleven style files here are adapted, and three have details merged in, from lemo-opuscar by
LemoLab: https://github.com/lemomo-ai/lemo-opuscar

| Our file | Source in lemo-opuscar | Source poster |
|---|---|---|
| `whiteboard.md` | `styles/whiteboard/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/whiteboard/poster.jpg |
| `transit-map.md` | `styles/transit-map/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/transit-map/poster.jpg |
| `briefing-board.md` | `styles/briefing-board/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/briefing-board/poster.jpg |
| `blueprint.md` | `styles/blueprint/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/blueprint/poster.jpg |
| `teardown.md` | `styles/teardown/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/teardown/poster.jpg |
| `telestrator.md` | `styles/telestrator/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/telestrator/poster.jpg |
| `data-physical.md` | `styles/data-physical/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/data-physical/poster.jpg |
| `desktop-flythrough.md` | `styles/desktop-flythrough/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/desktop-flythrough/poster.jpg |
| `midcentury-toon.md` | `styles/midcentury-toon/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/midcentury-toon/poster.jpg |
| `iso-infographic.md` | `styles/iso-infographic/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/iso-infographic/poster.jpg |
| `newsreel.md` | `styles/newsreel/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/newsreel/poster.jpg |
| `watercolour.md` (details merged in) | `styles/watercolor/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/watercolor/poster.jpg |
| `risograph.md` (details merged in) | `styles/risograph/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/risograph/poster.jpg |
| `data-story.md` (details merged in) | `styles/dataviz/STYLE.md` | https://github.com/lemomo-ai/lemo-opuscar/blob/main/styles/dataviz/poster.jpg |

- Each of these files is the source guide edited to this skill's look: the source's materials, motion and best moves are kept where they fit, and each file has a section "With the house look" (header, words, character, background, colour roles, hand-over).
- The source code and guides are MIT (`LICENSE-opuscar`). The posters and demo films are CC BY 4.0 (LemoLab), and some contain third-party material. They are not copied here: open them at the links above.
- Our files keep the source's rules where they fit, and change what conflicts with this skill (light backgrounds, no burned-in subtitles, the engine's own music and sound kit in place of the source's scores and foley, 28 px text, the fonts this engine has).
- `opuscar-porting-notes.md` lists the source demo functions worth porting. Its paths are relative to the lemo-opuscar repo.
- `blueprint.md` draws no dashed or dotted lines (no centre, hidden or phantom lines), on purpose (the source draws them).
- `newsreel.md` keeps the newsreel's grammar but drops what this skill does not have: the band score, the recorded foley (the engine's sound kit marks the slams and pencil lines instead), the announcer's period voice treatment and the burned-in bilingual subtitles. The source cuts real archive film; here news objects are drawn in code unless the user gives material with a clear licence. Its fonts (Limelight, Oswald, both OFL) are in `engine/fonts/`.
- Their demo code is not copied. Port a drawing into `library/` only after a style has worked in a real video (see `library/README.md`).
