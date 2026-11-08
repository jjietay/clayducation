# Clay: the one look of every video

Every picture is 3D: soft matte clay, large rounded shapes, little small detail, soft studio light
and one plain background. The silent mascot is in every video, and every object comes from our own
kit, so all videos look like one world. The code is in `styles/library/clay/`.

**Good for:** everything. An idea with no natural shape (a rule, a protocol) needs a physical
picture: a pulse that travels between objects, a block that drops into a slot, a gauge that fills.

## Scene code

```js
import { BG } from '/_lib/clay.js';

scene('stay', {
  bg: BG.sky,                                  // the same colour as below, for a clean first frame
  async setup(s) {
    s.g = await s.clay({ bg: BG.sky });        // the studio. All scenes share one renderer
    s.hero = await s.g.mascot({ x: -4 });      // x and z on the floor
    s.bot = await s.g.model('tank', { x: 3, ry: -0.5, k: 1.3 });   // ry turn, k size
    s.label = s.text('LiDAR', { size: 34, weight: 600, color: '#26262a' });
    await s.g.ready();                         // always last in setup
  },
  draw(s) {
    s.g.orbit(-6 + 12 * s.p(0, s.dur), 10, 42, [0, 3, 0]);   // azimuth, elevation, distance, look at
    s.hero.blendExpression('neutral', 'surprised', s.p('#wow', 0.4));
    s.hero.blendPose('rest', 'point', s.p('#show', 0.6));
    s.bot.setPose(s.p('#drive', 1));           // 0 rest, 1 its moving pose
    const [x, y] = s.g.screen(s.bot.groups.lidarHead);       // stage px of a 3D thing
    set(s.label, { x: x - 960 + 90, y: y - 540 - 40, opacity: s.p('#show', 0.3) });
    s.g.render();                              // always last in draw
  },
});
```

Draw only from `s.t`, because a render seeks to any frame. Use `s.trace('name', x, y)` with
`g.screen()` for a thing that moves, so `make review` measures its motion.

Three simple props: `g.arrow(color)` returns an arrow for a force or a gap (`a.set(from, to)` each frame),
`g.post(color, h)` marks a place on the floor, and `g.ball(color, r)` is a pulse or a signal. Use these, and do
not add your own meshes: the collision measures see only what the kit made.

## Backgrounds

`BG` holds one plain colour for each part: `sage`, `cream`, `sand`, `sky`, `blush`, `clay`, `lilac`,
and `navy` for one dark part at most. Two parts next to each other never share one. Check the object
against it: the green target block is weak on `sage`. Text is `#26262a`, or `#f0e7d6` on `navy`.

## The mascot

He stands for the viewer, and **he does the physical work**: he pulls the cart, pushes the robot, drags
the target and closes the laptop. A force in the script is his hands whenever it can be. He walks between
things, and he never only stands and watches for a whole part: `make check` WARNs when he stays in one
spot. He does not speak and has no lip sync, because the narrator is a voice-over. He is deadpan by default: an expression is an event, so use one at a moment that earns
it. He stands about 8.6 units tall with his feet on the floor.

| Control | Use |
|---|---|
| `blendExpression(a, b, k)` | `neutral`, `smile`, `surprised`, `confused`, `thinking`, `worried`, `unimpressed`, `understanding`, `sleepy` |
| `blendPose(a, b, k)` | `rest`, `wave`, `point`, `think` |
| `blink(k)` | after the expression, 0 open to 1 closed |
| `place(x, z, { face, lean, y })` | stand at (x, z), raised by `y` when he stands on a plate. `face`: 0 looks at +z, `Math.PI / 2` looks at +x, `-Math.PI / 2` looks at -x. `lean`: + forward, - back |
| `route(t, [[time, x, z, face], ...], { lean, keep })` | walk through the keys, eased, with legs and arms swinging. He looks where he walks; `keep: true` keeps his `face` while he walks backwards and pulls. Call it after `blendPose` |
| `hold(i, [x, y, z], k)` | `reach` for a thing that he holds. Put the point on the surface of the part, not beside it: when k ≥ 0.95, the hand's shape must touch that part. It is a fault if the hand cannot get there. Use `reach` only to point, or for a hand that moves to or from a hold |
| `stride(phase, amp)` | swing the legs yourself, when he follows something that moves. `phase` comes from the distance walked |
| `reach(i, [x, y, z], k)` | put hand `i` on a world point, `k` from 0 to 1. A far point gives a straight pointing arm. Call it last |
| `arms[i].shoulder`, `.elbow`, `.wrist`; `legs[i].hip`, `.ankle`; `headPivot`; `root` | set rotations yourself. `i = 0` is at his right, on the viewer's left |

Keep him clear of labels and of the thing that the voice names. His hands must reach what they hold, so
look at a still of each contact. His head must stay clear of the title, in the far lanes too.

## Models

`await g.model(name, { x, y, z, ry, k, shadow })` makes a new one each time. It stands on `y = 0` and
faces `+z`. `y` above zero (on a table) turns its floor shadow off. `m.setPose(k)` blends to its moving
pose. `m.groups.<part>` are the named parts; each pivots at its joint, so `rotation` or `position` move
it in the right way. See them in `make clay m-<name>`.

| Name | Object | Parts that move (`groups`) |
|---|---|---|
| `tank` | tank-drive robot | `wheel-1-1`, `wheel-11`, `wheel1-1`, `wheel11`, `lidarHead` |
| `drone` | drone | `prop-1-1`, `prop-11`, `prop1-1`, `prop11` |
| `arm`, `armShort`, `armTall` | robot arm: floor, short, tall stand | `turret`, `shoulder`, `elbow`, `wrist`, `finger-1`, `finger1` |
| `lidar` | LiDAR | `head` |
| `imu` | IMU board | none |
| `sbc` | single-board computer, no brand | none |
| `camera`, `cameraShort`, `cameraTall` | depth camera: medium, short, tall tripod | `bar` |
| `rack` | server rack | `ledA0` to `ledA4`, `ledB0` to `ledB4` (blink with scale) |
| `laptop` | laptop | `lid`, `screen` |
| `shelf` | shelf with barrels | `barrel0-1`, `barrel01`, `barrel1-1`, `barrel11`, `barrel2-1`, `barrel21` |
| `orange` | orange | none |
| `target` | target block and flag | `cloth` |
| `table` | table, top at y = 2.76 | none |
| `crate` | cardboard box | none |
| `clock` | clock | `hour`, `minute` |
| `map` | folded map with a pin | `pin` |
| `tag` | marker tag on a stand (a made-up pattern) | none |
| `cart` | cart on a spring | `body`, `spring` (scale x stretches it) |
| `disk` | open disk drive | `platter`, `reader` |
| `book` | book and pen | `pen` |
| `conveyor` | conveyor | `roller0` to `roller5` |
| `radio` | radio with an antenna | `knob` |
| `servo` | servo motor | `horn` |
| `node` | network node | `light` |
| `door`, `sign` | classroom door with a frosted window; school sign board | `leaf` swings; `board` turns 180° |
| `pawnA`, `pawnB` | student token, blue and plum | none |
| `stadiometer` | height-measuring post | `slider` moves on y |
| `balance` | beam balance with level pans | `beam` tips, `panL`, `panR` stay level |
| `apple`, `pear` | fruit for class clouds | none |
| `tape` | tape measure | `strip` scales in x, and its marks stretch with it |
| `fence` | waist-high fence panel and post, 4 long; set copies 4 apart | none |
| `filmstrip` | film strip of 6 almost equal frames | none |
| `beadA`, `beadB` | training-sample bead, blue and plum | none |
| `abacus` | abacus with 2 rods of 10 beads | `b0-0` … `b1-9` slide in x |
| `hoop` | striped hoop on the floor, radius 1 | scale the root in x and z |
| `thermometer` | thermometer | `fill` scales in y |
| `compass` | drawing compass | `hinge`, `legA`, `legB` |
| `portrait` | made-up clay face in a frame on an easel | none |
| `salmon`, `seabass` | fish for class clouds | none |
| `lamp` | spotlight on a stand | `head` aims |
| `screen` | projection screen | `panel` turns |
| `gauge` | dial gauge | `needle` turns about z |
| `humanoid` | orange biped robot, no brand | `pelvis`, `torso`, `head`, `armL/R`, `foreL/R`, `thighL/R`, `shinL/R`, `footL/R` |
| `vat`, `jar` | vat full of sample balls; jar with a few | `lid` of the jar lifts off |
| `seesaw` | playground seesaw, plank 14 long | `plank` tips |
| `discs` | two overlapping plates and their lens | none |
| `scoreboard` | board with a dark face and 4 bars | `bar0` … `bar3` scale in y |
| `neuron` | neuron with 3 inputs and 1 output | `glow` scales |
| `pipe` | pipe with a valve | `wheel` turns, `gate` scales |
| `rampStep`, `rampSigmoid`, `rampRelu` | ramps whose tops follow the activations, for a rolling ball | none |
| `tokenCone`, `tokenCube` | XOR tokens, blue and plum | none |
| `bowl`, `terrain` | error bowl; bumpy slab with a local minimum, for a rolling ball | none |

The rows from `door` down are in `styles/library/clay/models/ipcv-*.js`. The head comment and the
notes of each file give their sizes, joint positions and surface formulas.

Small objects are larger than real size, so they stay readable. Set `k` for each scene.

**Large objects stay near real size against the mascot.** He is 8.6 units tall for about 1.7 m, so
1 m is about 5 units. A door, a fence, a table, a seesaw or a robot keeps its real size against him;
only small things (fruit, tokens, beads, boards) are made larger. The user found a fence that came only
to his knee. Each model sheet shows the model next to the mascot: look at that cell.

**Colour roles, the same in every video** (`PAL`): robot orange, map yellow, target green.

## Add a model

Add it to `MODELS` in `styles/library/clay/models.js`. Each part is a distance function in model
space, built from `rbox`, `rcyl`, `ell`, `cone`, `torus` and `smin`. Give a moving part a `pivot` and a
`parent`, and give a part that travels away from its place `free: true`, so it leaves no saved shadow
behind. **Mesh step.** The mesh step comes from the size of each part (at most 0.032), so a large flat face
gets many triangles and a thin tube can get too few. Set `step` on the model (`step: 0.06`) or on one
part (`m.add(name, f, color, { step: 0.015 })`) to choose it. Always build a model at its true size.
Never bake a part small and scale its group up in `rest` to save triangles: the collision measures use
the distance field times the root scale only, so a scaled group gives wrong depths and gaps.

Then run `make bake` and `make clay m-<name>`, and read the sheet. Keep the forms large and
round, with few small details. Never download a model: the user wants consistency.

## Formulas act out the voice

A fixed formula is no better than reading notes, and `make look` fails one that sits still. Use `eqn()` from
`/_lib/eqn.js` (its head comment has the API). Terms **build** one at a time as they are said (`drop`), **move**
when the voice moves them (`hop`), **cancel** with a strike and a burst when the voice says cancel (`cancel`),
**become one term** when the voice combines them (`merge`), and **bounce** only when the voice names something
important (`bounce`). For a force or an object that cancels, use `rays()` and `s.cancelling()`.

The mascot never raises a straight arm: it can read as a salute, and it is a fault on every frame. He gestures
with a bent arm below the shoulder.

## Rules learned

- **Show what the voice does to a formula.** If the voice moves a term across the equals sign, the term moves on screen and the computation appears. Build the formula from separate pieces (`partition-clay`, scene `error`).
- **Things collide for real.** `make review` measures the mascot against every object on every frame, each object against each other object, and text against 3D ink. A fault there is an ERROR. If a true response overshoots into an object, change the motion, not the check.
- **Text stays flat.** Titles, labels and formulas are HTML, because they stay sharp and are measured.
  A label that follows an object must not cross other things when the camera moves. Move the camera
  slowly, and prefer labels on things that stay still.
- **Formulas sit beside the object they describe,** never alone (`reference/script.md`, "Formulas").
- **No antialiasing.** On the GPU path it drops whole objects at random, so the renderer draws twice
  the pixels. Do not turn it on.
- **Hide with a tiny scale, not `visible = false`,** and `await g.ready()` at the end of `setup`.
- **Use the whole frame.** Do not crowd things together while most of the frame is empty.
