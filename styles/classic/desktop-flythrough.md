# Desktop flythrough (paper cards and voxel toys)

**Good for:** a software or toolchain setup step by step (install, configure, build, run), a
request or a message that travels between programs (client, server, queue, database), a CI
pipeline, a tour of a code base (one card per module), a terminal session whose output goes
somewhere, a file that is compressed, uploaded and stored. Pick it when the stations are apps or
tools; for physical parts use `isometric` or `teardown`.

## Look

| Role | Colour |
|---|---|
| paper mat; its dots | `#e2e8f5`; `#c4cde3` (0.03 units apart) |
| desk (light oak, planks with soft grain) | `#deccb2` |
| card; print ink; muted print | `#fbfcff`; `#171c2e`; `#7d8597` |
| accent: what matters now (the route, the step badge) | `#2f5bff` |
| support (cast, props) | mustard `#f2c14e`, brown `#a8744a` |
| failure only; success only | `#e2483d`; `#3fa57a` |

- The desk is the world: a dotted paper mat on a light oak desk, one low warm sun `#ffdcb4` from the back-left about 20° up (a toy's shadow is 2 to 3 times its height), a hemisphere fill with a cool sky `#c8d6ff` and a warm ground `#f3e3cc`, so shadows read blue. A pen, a sticky note or a mug at the edges gives each close shot a soft foreground.
- Interfaces are paper cards: rounded slabs about 5 mm thick, 0.3 to 0.7 units wide, with the print on top from a canvas drawn at 3×: one ink, a mono head in spaced caps, bold numerals, thin rules. A phone or terminal card shows a whole interface (status bar, header, content, controls). No real app chrome, no logos, no cursor.
- The cast are pixel sprites made solid: one box per pixel, deeper inside than at the edge (depth 2.2 + 1.15 · min(d − 1, 3.2) cells); pure black pixels are eyes that stand proud and blink. A character is 1/5 to 1/3 of its card wide, and 35 px or more on screen in the widest shot. The moving thing keeps its colour role (library `C`, `K`).
- Text in the world only names: a step badge (an accent pill with a digit and one word, facing the camera, no shadow), a size, a name on a screen, a title card on the desk. `JetBrains Mono` 700 caps for labels and numbers, `Space Grotesk` 700 for pills and titles, 36 px or more on screen. Read flat print only from 55 to 70° down; a low camera reads a standing tent card.

## Motion

- One tempo, 120 BPM (a beat is 0.5 s). Actions sit on the 16th grid (0.125 s); big moments on beats.
- Hop: an arc `h · 4u(1 − u)`, 14 % stretch in the air, 30 % squash for 0.2 s on landing, a small squash 0.09 s before take-off. Followers trail one 16th behind.
- Sticker pop: a flat sticker stands up and extrudes into a toy in 0.25 to 0.5 s (hinge with overshoot, cells grow from the centre out, a small jump, squash on landing). Reverse pop when a thing is stored or delivered.
- Native moves: press (a plate slams down, debris bursts, a half-size copy pops out: compression), drawer (a tower slab slides open and a toy hops in: storage, a queue), messenger (a small object flies an arc with a dotted trail: a notification), data run (small bright cubes run along the route: a download, a sync), blurry then sharp (loading).
- A slam lands on a beat, jolts the card and spreads a flat accent ring over the paper that fades in about 1 s.
- Every stop is busy with one or two small movers that do not compete with the narration. Idle is a bounce on the beat or a blink, never a dead hold over 1.5 s. Cards move only for a jolt.
- One take. Macro glide 20 to 45° down; a whip from card to card in 0.3 to 0.5 s, banking into the turn (roll from the rate of azimuth change, at most 0.12 rad), arcing up between far stops; a rise to 55 to 70° to read; a pull back over the whole desk to close (each stop hops once, left to right). The target rests at the key where a whip starts. The subject sits 110 px above centre, clear of the subtitles.
- With sound effects on (`SOUND.md`), `s.sfx` marks each pop and each landing.

## With the house look

- **Header**: `header()` in `Space Grotesk` 700, kicker in the accent `#2f5bff`, for example `THE SETUP · README §2`. It stays in screen space while the camera flies; the title card on the desk is optional.
- **Words**: one step badge and at most 3 short labels in view; the print on cards is texture, not text to read, except one name or number per card.
- **Character**: the voxel toys are the cast; their pure black pixels are eyes that blink. The hero keeps its role colour in every part.
- **Background**: the mat and desk are light.
- **Colour roles**: the moving thing keeps its colour role (library `C`, `K`); the blue accent marks only the current step.
- **Hand-over**: the curtain call (each stop hops once, left to right), then `endWipe()` from the last stop in the next part's background.

## Avoid

Depth of field and motion blur (the engine has no post pass, and blur turns print to mush), real logos, a cursor, a glowing monitor, dead stations, flat text read from a low angle, pills that cast shadows over print, a sprite seen edge-on, grey on grey, red or green for anything but failure or success.

## Build

Three.js through `world(s, { bg: '#e2e8f5', floor: false })`; move its key light low to the back-left. Port `makeMonster`, `hops`, `squash`, `pop`, `card` (see `opuscar-porting-notes.md`) with `BoxGeometry` (no `RoundedBoxGeometry` add-on) and `showK` in place of `visible`.
```js
scene('request', { bg: '#e2e8f5',
  async setup(s) { const g = s.g = await world(s, { bg: '#e2e8f5', floor: false });
    g.scene.children.find((o) => o.isDirectionalLight).position.set(-9, 3.7, -4.6);              // low sun, back-left
    s.mat = new g.THREE.Mesh(new g.THREE.PlaneGeometry(4.2, 2.4), new g.THREE.MeshStandardMaterial({ map: dotTex(g.THREE), roughness: 0.92 }));
    s.mat.rotation.x = -Math.PI / 2; s.mat.receiveShadow = true; g.scene.add(s.mat);
    s.cards = CARDS.map((k) => { const m = card(g, k); g.scene.add(m); return m; });                 // slab + printed CanvasTexture
    s.toy = makeMonster(g, PACKET16, 0.0065); g.scene.add(s.toy.root); await g.ready(); },
  draw(s) { const g = s.g, h = hops(s.t, HOPS), pp = pop(s.t, s.at('#send'), 0.4);                 // HOPS: [{t0, t1, from, to, h}] on the 16th grid
    s.toy.set({ pos: h.pos.setY(h.pos.y + pp.y), e: pp.e, hinge: pp.hinge, sq: pp.sq * squash(s.t, h.lands, h.takeoffs, h.air) });
    rig(g, s.t, SHOTS);                                                                              // [t, target, dist, az, el] keys, Hermite target, bank on whips
    s.trace('packet', ...g.wp(s.toy.root), { r: 40 }); g.render(); } });
```

Adapted from lemo-opuscar `styles/desktop-flythrough/STYLE.md` (MIT, (c) 2026 LemoLab); see styles/LICENSE-opuscar.
