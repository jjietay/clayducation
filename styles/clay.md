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

**Push, pull or hold a model: use the stance helper, never tune it by hand.** `g.pushOn(hero, model, part,
{ side: '-z' })` (after `blendPose`) stands him off that face of the part, facing it, with his feet clear of every
floor-level part (rails, bases), and puts both hands on the face at a height he reaches. Where a rail runs along
that line, he stands beside it and reaches with the near hand. `g.stance(...)` gives the same numbers without
moving him: `{ x, z, face, hands, low }`, for `route()` keys. Call it every frame for a model that moves. The
computed torque video lost 4 look rounds to hands that missed a cart and shoes in its rail before this existed.

**Use a different action in each part, not only pushOn (the user asked, 2026-11-10).** In the strawberry video he
pushed in four of five parts, because pushOn was the only helper that passed the contact measures. These helpers
place him and his hands the same safe way. Call them after `blendPose` (and after `route` when he walks); call
`hero.stride()` before them, never after, or the arm swing undoes the hold. A point on a part is in model coordinates.

| Helper | He does | Notes |
|---|---|---|
| `g.carry(hero, model, part, { k, grip, rest, restRy, height })` | lifts a thing off its rest place (k 0) into his hands (k 1), and carries it as he walks | a hand on each side of the part; `grip` brings the hands in first; set down by moving k back to 0 at the new `rest`. Rest it on a `pedestal` (top y 2.2, at his hips), with his feet 1.35 + the part's half depth from its centre |
| `g.knock(hero, model, part, t, { side, at, count, gap, y })` | stands at a face and knocks `count` times | returns `{ hits }`, the times for `s.sfx('click', t)` |
| `g.press(hero, model, part, k, { side })` | puts one hand on the top of a part | for `bigButton` by `cap`; set the model's pose from k |
| `g.grip(hero, model, part, points, { k, hand, standOff, dir })` | holds one or two points on a part, and walks with them | a lever knob, a door handle, two points on a wheel rim. With `standOff` he stands that far along `dir` (floor direction) and faces the points, so he follows a part that moves |
| `g.partPoint(model, part, P)` | (no action) | the world point of a model-space point on a part, as it moves now |
| `g.pointAt(hero, point, { k, hand })` | points with a bent arm below the shoulder, and looks | never a straight raised arm |
| `g.lookAt(hero, point, k)` | turns his head to a point | after `blendExpression` |
| `g.sitOn(hero, model, part, { k, face, hands })` | sits on a seat (k 0 standing in front of it, 1 seated), hands resting on the seat beside him | a seat about 0.75 high and at most about 0.8 deep (`bench`); his hips and legs may touch it. Walk him to the returned `stand` point first |
| `g.reachTo(hero, hand, point, k)` | moves a hand to any point by the safe path | up and out beside his chest, to 0.8 before the point, then onto it as a hold |
| `g.tap(hero, hand, point, t, { at, count, gap })` | taps a point (a key, a screen) | returns the hit times |
| `g.typeOn(hero, model, part, t, { at, dur })` | types with both hands on the top of a part | the fingers hover, so it is not a checked hold; a laptop on his knees (`sitOn`) works |
| `g.trace(hero, hand, pts, u, { k })` | moves a hand along a path of points on a surface: writing, drawing | returns the hand's point; draw the ink to it on a canvas texture |
| `g.toss(hero, obj, t, { at, dur, to, height })` | an underhand throw of a `g.ball()` to a point | the ball rests on his palm until `at` |
| `g.handsOnHips(hero, k)` | hands on hips, elbows out | |
| `g.kick(hero, ball, t, { at, from, to, leg, roll, spin })` | kicks a `kickball` from `from` to `to` ([x, z]): the leg swings back (hip +0.4, knee 1.2, 0.6 s), then through (hip +0.4 to -0.9 in 0.6 s, the knee straight at the contact, hip -0.25, at `at`); the ball rolls with a constant slowing for `roll` s (2.0) | returns `{ stand, face, end, roll }`: route him to `stand` before at - 0.9. Kick back: `from`/`to` swapped, `spin: -first.roll`. The shoe may touch the ball for 0.12 s round `at` (`hero.touch`) |
| `g.walkPath(hero, t, { t0, t1, pts, face0, face1 })` | one smooth walk along a curve through pts ([x, z]): a constant pace, eased only at its two ends, facing along the path; turns from face0 and to face1 within the first and last 0.6 s | use it for any walk with corners (route() stops at each key). Put a round turn (radius 2 or more) into pts where he must turn round, so he turns at about 2 rad a second |
| `g.jump(hero, t, { at, x, z, to, face, height, air })` | a crouch (0.45 s, crouch 0.55), both feet off the floor for `air` s (0.7) in an arc `height` high (1.3), the arms bent up beside his head, a landing crouch (0.5 s, 0.45) | from (x, z) to `to`; returns `{ end }`. Jump back: the same with `face` turned and `to` swapped |
| `g.hammer(hero, hammer, nailboard, t, { at, mode, count, gap, hand })` | `mode: 'drive'`: takes the `hammer` from the bench, hits the nail `count` (3) times `gap` (0.75 s) apart, the nail sinking a third each time, and puts the hammer back. `'pull'`: turns the hammer, slides the claw's slot round the nail under its head, and pulls the handle toward him (the head rocks on the bench, the handle from 0.95 to 0.16 rad off upright) so the claw levers the nail out | the bench at size 1; he stands at its +z side. Returns `{ stand, face, hits, end }` (`hits` for `s.sfx('thud', t)`). The nail's height in the pull comes from the claw's own shape |
| `g.sweep(hero, broom, dust, t, { at, dur, strokes, from, dist, dir, face, rest })` | takes the `broom` from its `broomStand` (`rest`: its head; `stand`: the stand, placed by sweep), out of the hook first, walks with the head lifted to the strokes, and pushes `strokes` (4) times in `dur` s (4) along `dir`: the bristles on the floor while they push, lifted on the way back. The `dust` pile moves only while it is pushed, touching the bristles, `dist` (2.4) in all. Then he walks back and stands the broom up again | left hand high (4.6 up the handle), right hand low (3.8); the strokes run 2.6 to his right, 4.3 in front of him. Returns `{ stand, face, end, pileEnd, rest }`: the sweep back uses `from: pileEnd`, `rest: first.rest` and the opposite `dir` |
| `g.water(hero, can, plant, t, { at, effect, drops, hand, rest })` | takes the `wateringCan` from a `pedestal` (`restAt`), walks sideways to the pot, tilts the can (0 to 1.15 rad) until the rose is 0.5 over the soil, drops fall, walks back and sets the can down | `effect`: `'grow'`, `'open'` or `'close'`. `drops`: about 6 `g.ball('#5d9bd6', 0.06)` made in setup. Call it once in setup with t -1 for `restAt` (put the pedestal there). Returns `{ stand, face, end, restAt }` |
| `g.lieDown(hero, rug, t, { k, sleep })` | k 0 to 0.3: a crouch; 0.3 to 0.55: he sits on the floor, legs straight out (`legsPose('sitFloor')`); 0.55 to 1: he leans back about his hips until he lies flat, and breathes (3.6 s a breath). `sleep` 0 to 1: the sleepy face, eyes shut. k back to 0 gets him up | his hips 1.5 from the rug's middle toward its +x end, his feet to +x. Walk onto the rug with `route(..., { y: 0.08 })`. His body may touch the rug while k > 0 (`hero.touch`); his hands stay on the rug beside his hips, so his arms stay bent |
| `hero.legsPose('sit' \| 'crouch' \| 'kneel' \| 'sitFloor', k)` | bends his knees and lowers him to the floor | after `place` or `route`, before the hands. `carry` crouches by itself for a thing on the floor. `sitFloor`: on the floor with the legs straight out. `hero.plant(y, { body: true })` puts his lowest point (of any part, not only the legs) at y |
| `hero.nod(t, { at, count })`, `hero.shake(t, ...)` | yes and no with his head | after `blendExpression` |
| `blendPose('rest', 'shrug', k)` | a shrug | |

The six play and tool actions (kick, jump, hammer, sweep, water, lieDown; added 2026-11-10) start and end with him
standing, so they chain. A held tool rests at its own place until the action takes it, and goes back there. Call
only the helper that runs now last in draw: each call also sets its objects (a kick sets the ball). A short contact
(a shoe on the ball, his back on the rug) is allowed through `hero.touch`, which a helper fills for those frames only.
See `~/Videos/explainers/mascot-actions-test-3/scenes.js` for each one, both ways.

His legs have a hip, a knee and an ankle (the knees were added 2026-11-10), so he can sit, crouch and kneel. His shoulders are at y 4.52 and his hip joints
at y 2.26: keep holds and knocks below the shoulders, and stands or tables below the hips when he works close to them. Face the object to the camera's side
(turn the model with `ry`), so the viewer sees him from the side and not from the back. See
`~/Videos/explainers/mascot-actions-test/scenes.js`, `mascot-actions-test-2/scenes.js` and `mascot-actions-test-3/scenes.js` (kick, jump, hammer, sweep, water, lieDown, walkPath) for each helper in use.

Three simple props: `g.arrow(color)` returns an arrow for a force or a gap (`a.set(from, to)` each frame),
`g.post(color, h)` marks a place on the floor, and `g.ball(color, r)` is a pulse or a signal. Use these, and do
not add your own meshes: the collision measures see only what the kit made.

To put a letter or a number on a model, use `await g.print(model, part, 'R', { at: [0, 0.66, 0.662], w: 1.05, h: 1.05, color })`
in setup: a cut-out print on the part's +z face that moves with the part. To change a print (a black R that turns red),
make both and move the one not in use inside the part (`mesh.position.z = 0`); do not shrink it to a speck.

## Label plain items (the user asked, 2026-11-14)

A plain item that stands for something in the story (a `parcel`, a `crate`) gets a label on its front, so the viewer
sees what it is without the text column. In the JEV video the mascot carried three plain boxes (a ticket, a LoRA
adapter, an unsure ticket), and no box said what it was. In setup, print one to three short words on the +z face:

```js
await s.g.print(s.parcel, 'box', 'ticket', { at: [0, 0.6, 0.66], w: 1.3, h: 0.5 });   // parcel: front at z 0.65, 1.6 wide, 1.2 tall
await s.g.print(s.crate, 'box', 'JEV', { at: [0, 0.95, 0.81], w: 1.2, h: 0.5 });      // crate: front at z 0.8, 1.9 wide, 1.64 tall
```

Turn the item so its front faces the camera's side while it is on screen (`ry`, and `restRy` for `carry`). For a
common item that later videos use again, add its label to the kit. `make check` gives an ERROR for a scene that makes
a parcel or a crate and prints no label (`engine/labels.mjs`).

## Fixed layout (start every clay scene from it)

The user asked for a fixed frame for each scene on 2026-11-09, after the first look of the computed
torque video found 115 faults: every camera was too close, so the mascot's head and the models lay
under the formulas. Start from these values, take one still of each scene (SKILL.md, step 8b), and change
them only when that still shows a reason.

| Zone (stage px, 1920 x 1080) | What goes there |
|---|---|
| top left, x 110 to 900, y 70 to 180 | the kicker and the title (`head()`) |
| top band, y 230 to 420, on the side away from the mascot | formulas: two rows at most, about 90 px apart (a fraction needs 100) |
| right column, x 1150 to 1800, y 230 to 700 | formulas and labels when the 3D sits at the left |
| bottom band, y 900 to 1000 | lists and labels, only when the floor ends above y 880 in the still |
| the rest, mostly lower left and centre | the 3D: mascot and models |

| Setting | Start value |
|---|---|
| camera | `orbit(az -14 to 4, el 10 to 22, dist 46 to 52, look)` |
| look point | y 4.6 to 4.8 (above his waist), and x 5 to 8 units to the right of the middle of the 3D, so the 3D sits left of centre and the right column stays free |
| scale at dist 46 | about 27 px a unit, so the mascot is about 230 px tall and his head stays below y 380 |
| hold heights | `hold` points at y 3.0 or more: below about 2.5 his hands do not reach, even with a lean |
| distance to a rail or a base | stand 1.6 or more from its edge, measured to his centre. Closer, his shoes go into it while he walks |
| label on a moving object | above it or below it, never on it; hide a label when its arrow is shorter than the label |

**Font size matters (the user asked, 2026-11-14).** Content text (labels, captions, notes, the right column) is 34 px
or more; 36 to 40 px is better. Only the kicker (30 px) and the title (58 px) in the top-left head zone keep their own
sizes. In the JEV video the right-column labels were 30 to 32 px and hard to read. A smaller label is an ERROR in
`make check`. When a column of labels does not fit at 34 px, cut words or use fewer labels; never shrink the text.

**Text keeps to a grid (the user asked, 2026-11-09; an ERROR since 2026-11-14).** Words scattered "all over the page" lose the harmony of
the frame. Stack the formulas and labels of one zone on one column: the same left edge (or the same centre for a
centred block), with even row gaps. Texts side by side share a top or a middle. Exact or clearly apart, never a
few pixels off: `make check` gives an ERROR for nearby texts 4 to 40 px out of column or row (a WARN in the classic look). In the JEV video nine of these WARNs were left open: fix each one, do not pass it by. A label pinned to a 3D object
follows the object and is judged only against its neighbours.

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
pose. A model can have more named poses (`poses: { bloom(g) {...} }` in its spec): `m.setPose(k, 'bloom')`
blends only the parts that pose moves, so call `m.setPose(k)` first. `m.groups.<part>` are the named parts; each pivots at its joint, so `rotation` or `position` move
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
| `pawnA`, `pawnB`, `pawnQ` | student token: blue, plum, and grey for a class not known yet | none |
| `stadiometer` | height-measuring post | `slider` moves on y |
| `balance` | beam balance with level pans | `beam` tips, `panL`, `panR` stay level |
| `apple`, `pear` | fruit for class clouds | none |
| `tape` | tape measure | `strip` scales in x, and its marks stretch with it |
| `fence` | waist-high fence panel and post, 4 long; set copies 4 apart | none |
| `filmstrip` | film strip of 6 almost equal frames | none |
| `beadA`, `beadB` | training-sample bead, blue and plum | none |
| `pointer` | pointer stick, 2.6 long, for pushing small things (abacus beads) | none |
| `abacus` | abacus with 2 rods of 10 beads | `b0-0` … `b1-9` slide in x |
| `hoop` | striped hoop on the floor, radius 1 | scale the root in x and z |
| `thermometer` | thermometer | `fill` scales in y |
| `compass` | drawing compass | `hinge`, `legA`, `legB` |
| `portrait` | made-up clay face in a frame on an easel | none |
| `salmon`, `seabass` | fish for class clouds | none |
| `lamp` | spotlight on a stand | `head` aims |
| `screen` | projection screen | `panel` turns |
| `rig` | a screen and a flat light panel on one turning frame, so the light's rays stay parallel to the screen's normal | `arms` turns about the column |
| `gauge` | dial gauge | `needle` turns about z |
| `humanoid` | orange biped robot, no brand | `pelvis`, `torso`, `head`, `armL/R`, `foreL/R`, `thighL/R`, `shinL/R`, `footL/R` |
| `vat`, `jar` | vat full of sample balls; jar with a few | `lid` of the jar lifts off |
| `seesaw` | playground seesaw, plank 14 long | `plank` tips |
| `discs` | two overlapping plates (gold and slate) and the red lens where they meet | `overlap` lifts off |
| `scoreboard` | board with a dark face and 4 bars (grey and teal) | `bar0` … `bar3` scale in y, from their rest heights |
| `neuron` | neuron with 3 inputs and 1 output | `glow` scales |
| `pipe` | pipe with a valve | `wheel` turns, `gate` scales |
| `rampStep`, `rampSigmoid`, `rampRelu` | ramps whose tops follow the activations, for a rolling ball | none |
| `tokenCone`, `tokenCube` | XOR tokens, blue and plum | none |
| `bowl`, `terrain` | error bowl; bumpy slab with a local minimum, for a rolling ball | none |
| `cat`, `mat` | sitting tabby cat, 3.05 tall; striped floor mat 5.2 by 3.4 (`models/attention.js`) | cat: `head` lifts and turns (pivot at the neck), `tail` swings |
| `strawberry` | strawberry, 3.3 tall, round bottom; a seed gap faces +x for hands at y 2.85 when k 1.6 (`models/tokens.js`) | none |
| `tokenBar`, `letterBlock` | a teal sleeve 13.8 long over ten letter blocks 1.3 wide, set 1.36 apart; print letters on the blocks with a canvas texture (`models/tokens.js`) | `sleeve` slides off in x |
| `summaryBlock` | a teal block the size of a `letterBlock`, three cream text lines on its +z face: the summary that replaces old messages (`models/tokens.js`) | none |
| `pedestal` | stand with its top at y 2.2, at his hips, for `carry` (`models/actions.js`) | none |
| `parcel` | taped box 1.6 by 1.2 by 1.3, to carry by `box` | none |
| `lever` | floor lever; grip the `arm` at [0, 4.1, 0.32] | `arm` tips 0.3 rad back (rest) to 0.3 rad forward (pose) |
| `handwheel` | wheel on a post, centre (0, 4.2, 0.62), rim radius 1.0; grip `wheel` at [±1.12, 4.2, 0.62] | `wheel` turns a quarter turn per pose step |
| `bigButton` | button on a post, cap top at y 3.3; `press` it by `cap` | `cap` sinks 0.18 |
| `bench` | bench 4.8 long, 0.76 deep, seat top at y 0.74: `sitOn` it by `seat` | none |
| `whiteboard` | whiteboard, face at z 0.09, x -2.5 to 2.5, y 3.1 to 6.0; `trace` on it by `board`, the wave inside x -1.6 to 1.2 | none |
| `basket` | open basket 1.0 tall, inner radius 0.85: `toss` into it (land at y 0.42) | none |
| `kickball` | ball to kick, radius 0.55, centre at y 0.55, two red bands (`models/play.js`) | its root rolls (`kick`) |
| `hammer` | claw hammer, origin at the handle's end, handle along +z (1.62 to the head); face down at y -0.37, the claw up with a slot 0.13 wide | held (`hammer`) |
| `nailboard` | workbench, top 3.6 by 1.2 at y 2.6, a nail at (0.9, 2.6, -0.3), head at y 3.1 | `nail` sinks 0.3 (pose) |
| `broom` | broom 5.1 tall (1 m): a fan of five straw bundles 1.5 wide at the floor, three bands, a steel ferrule, a round knob; root at the bottom of the head | held (`sweep`) |
| `dust` | dust pile 1.3 wide, 0.45 high | its root is pushed (`sweep`) |
| `wateringCan` | watering can; handle top (the grip) at (-0.1, 1.53, 0), rose at (1.52, 1.15, 0) | held (`water`) |
| `plant` | plant in a pot, soil at y 0.91, stem to 2.25, a flower of 5 petals at y 2.3 | `setPose(k)`: the stem grows (scale 0.45 to 1); then `setPose(k, 'bloom')`: the petals open (named pose, sets only the petals) |
| `broomStand` | post 3.8 tall with a U hook at y 3.5: the broom leans into it at rest (`sweep` places both) | none |
| `rug` | rug 9.6 by 3.8, top at y 0.08; its parts are named `floor...`, so his shoes may stand on it | none |
| `wall` | hallway wall panel 8 wide, 7 tall, 0.5 deep (front face at z 0.25), a pale band at y 2.4 to 3.6 for a LiDAR beam to hit; turn it with `ry` (`models/sensing.js`) | none |

The rows from `door` down are in `styles/library/clay/models/ipcv-*.js`, `cat`, `mat` in `models/attention.js`, `kickball` to `rug` in `models/play.js`, and `wall` in `models/sensing.js`. The head comment and the
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
- **Labels arrive with opacity and a short move, not with scale.** A scaled HTML label can keep an old raster, so
  `make stable` sees two different draws of one frame (the strawberry video).
- **Use the whole frame.** Do not crowd things together while most of the frame is empty.
