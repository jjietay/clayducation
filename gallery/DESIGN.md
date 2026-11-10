# Design of the gallery page

Read this before you change `index.html` or `app.js`.

## The idea

The page is one clay world that the scroll plays. The mascot is the one thing that stays on the screen:
he comes out of a lump of clay and walks through the whole pipeline, from one sentence to a finished MP4.
Each chapter is pinned while the scroll plays it. Between two chapters, the camera rises and swings to the
next set while he walks there round the objects, and the next chapter's colour grows out of him as a clay
blob with a round edge that moves (a smooth curve, no blur). The colours are the clay backgrounds of the videos (`BG` in `styles/library/clay.js`).

The only words are one large statement for each chapter, with the key word marked by the pink strike of a
cancel in `eqn.js`. The demos keep the words that are part of them. There is no sound.

## The chapters

| # | Statement | Scroll | Pointer |
|---|---|---|---|
| 0 | Teaching videos, made of clay and code. | the lump squashes and morphs into a clay statue of him (his own outside skin, measured from his shapes); fine cracks open all over it at once; it bursts into about 180 chunks of clay (cut on the statue, with an inner wall and a broken edge) that fly off together, each at its own random speed and spin, on paths tested at load so that no piece goes through him; he jumps out of it in a star (arms and legs out) and lands with a small squash; the pieces and crumbs land, squash and shrink away, so only he is left; then he waves | a press dents the clay; with the button down the dent stays |
| 1 | It starts with one sentence. | the prompt types itself; its words fly into the book on the table; the pen taps, vibrates faster and faster, and flies to the camera; the camera moves in on its barrel until the pen's own blue fills the frame, and the cut to chapter 2 happens there | the topic can be typed (at most 3 rows); it becomes the title card in chapter 6 |
| 2 | Claude writes three files. | the camera moves straight back out of the pen while the pen spins in the plane of the screen and comes to rest; his face is still the surprised face of chapter 1; the pen flies to the first page and writes the pages line by line with its nib on the line, held as in a right hand; the script agent strikes a wrong fact and writes the fix; he watches the pen | a click brings a page to the camera, in front of the statement (which stays); a click outside sends it back |
| 3 | Whisper times every word. | he walks in without a stop, smiling, behind the bars and the words, and carries the playhead along the real waveform of one sentence; each word drops in at its Whisper time; he turns his head to the words; his hand goes along behind the words at one height, as if it touches each one; at the end the playhead sinks into the floor and he walks on without a stop | the word under the pointer lifts and its bars turn green |
| 4 | Code draws every frame. | he pushes the cart against its spring and lets go; the graph of x(t) draws itself with a frame counter | on the graph, a ghost cart shows where the cart was at that time |
| 5 | Click anything, and he does one of his 12 moves. | the scroll only moves the story on; the actions run on time. A ring of things, one for each action: kneel by the strawberry and point; kick the ball to its other place and back; sit on the bench and type (a laptop grows on his knees); turn the wheel one way and back; hammer the nail in and pull it out with the claw; write a wave on the whiteboard and wipe it off; throw the ball in a high arc into the basket (it bounces once and settles), and take it out and set it back on its stand by hand; carry the box to the stand and back; water the plant (it grows, its flower opens, and closes); sweep the dust pile with the broom from its stand, and back; jump on the spot; lie down on the rug and get up. The camera shows the whole ring while he walks; during an action it eases in to frame him and the thing he uses and eases out after it (damped on time; the statement fades while it is close; reduced motion keeps the whole ring). Each action is one entry of `ACTS` in `app.js`; the six newer ones use the kit's helpers (`play`: kick, jump, hammer, water, lieDown, walkPath). Each use changes its thing back and forth. Every walk is the shortest clear path on the floor: the things' footprints grown by 2.1 (his fists reach 1.7 from his middle), a visibility graph and Dijkstra, the corners rounded with arcs; he turns on the spot toward the path, walks it forward (walkPath: one pace, eased at its two ends), and turns on the spot to face the thing. After 4 s with no click he goes to the next thing by himself (not with reduced motion). A click while he is busy ends his action cleanly first (it plays back to its start, or on to its end when its thing has already changed), then he goes. Leaving the chapter, the scroll plays the same clean ending | a click or a tap on a thing sends him to it; the thing under the pointer shows the name of its helper beside it, never over the statement; each hit area is the thing's screen box, 24 px larger, at least 48 by 48 px |
| 6 | Nothing renders until the checks pass. | the 11 other objects sink into the floor; he walks to the rug, sits down with his legs straight forward and lies back; the console of `make look` beside him shows three checks of his pose (his back on the rug, no part of him in the rug, his hands on the rug), which turn from red to green as he lands; the scroll alone sets his pose here, so the lines are set by the scroll too (`C[6].checks()`), not measured; then his eyes close and he breathes slowly. The way out is his dream: three clay puffs rise from above and in front of his head, then a round bubble in chapter 7's colour; the camera goes into the bubble, and inside it (the whole screen is chapter 7's colour) the cut to the film roll happens; the camera then pulls back on one straight line at chapter 7's own angle, and he holds the roll from the first frame | none |
| 7 | The result is a real MP4. | he holds a roll of film as a pole is held (palms on it, one hand over the other), and the strip, with sprocket holes, comes out of it and stays in it: the title card, then frames of six finished videos; then a red balloon comes in at the top right, the wind takes it to the left and then the roll out of his hands, and the roll turns on its axis as the film rolls back into it, the strip turning with the roll as it flies; the statement goes behind them; he is shocked in the wind, reaches after it and leans, then is unbothered | a click brings a frame to the camera and plays its clip (8 s, 1080p, with motion); a frame does not move on hover |
| 8 | Install it with one command. | the balloon and the roll come back from the right; he is surprised; the balloon's string (one length, with its own weight) trails behind the balloon, meets the black bar of the command, and stays caught on its top by friction (nothing pins it); he catches the roll in the air in his right hand, arm out, brings it down to his side, level with the ground, his arm hanging straight down and his palm on top of the roll (one point of contact), turns more towards the viewer with the roll in his hand, and points at the command | the pointer pushes the balloon and it swings back; Copy makes him wave; More styles is a folder along the whole bottom edge (a tab with slanted sides, and the top of its content, stick up); a slanted red NEW tag is beside the Manim heading; the chapter dots go under it while it is open; a click on any part of it slides it up until its top is at a quarter of the screen, over the darkened page, with Manim parts and the older 2D styles; a click on its tab or on the dark page, or Escape, slides it back down |

The scroll is a timeline (`plan()` in `app.js`): each chapter has its own length, and each walk between two
sets has a length that matches its distance, so he always walks at the same pace. The wheel scroll is
smoothed. Each statement stays in place on the screen: it fades out before a transition and rises in after
it, so no text moves between chapters. A colour change is a blob that grows out of the mascot, except from chapter 6 to 7, where it is his dream bubble. Between chapters, the old set sinks into
the floor and the next one grows out of it. The mascot's face, head, arms, legs, turn and place ease towards
what each chapter wants, on every frame (`settle()` in `app.js`), so nothing on him changes in one frame.
A hand that holds something is put on it after the body has eased, so it stays on the book, the cart or the
roll while he moves.

Checks: a full scroll is recorded at 60 fps and the change between every two frames is measured; a frame
that changes much more than its neighbours is looked at and fixed. A second check walks the whole scroll and
tests his body against every object in view (`window.__claySets`, `__clayHero`, `__clayState`, `__clayProbe` are for these).
`engine/test/gallery-check.mjs` runs both (`scroll`), and for chapter 5 each action from three start points and a click
during each action (`clicks`, with `window.__clayPlayer`), a walk between every pair of stand points (`walks`), and the hover labels, clicks and taps (`input`); `shots` and `strip` take pictures. `--shard i/n`, `--acts` and `--pairs` run part of a check. With `?check` the page steps one
frame at a time (`window.__clayFrame(dt)`), on its own clock, so a check gives the same result each time.
Other checks: no word of a statement touches the set, every point of him is inside the clay figure, and each
holding hand is on its point.

Motion rules: the head and the camera follow the pointer through damped springs, never in steps. With
reduced motion, nothing moves by itself; the scroll still plays each chapter. On a narrow screen the set
goes below the statement and the camera steps back. On a phone (at most 760 px wide; `phone()` in `app.js` and the same
`@media` rule in `index.html`) the scroll alone plays the page: the pointer does nothing in the world, the hints
that ask for a press, a tap or the pointer are hidden, and the topic and the graph only show. Each chapter has its
own phone framing (`PHONE_VIEW` in `app.js`: distance, shift and height of the camera). In chapter 5 the statement
says "Scroll", and the scroll plays one action (`p5Phone()`): he walks to the strawberry, kneels and points, and
walks back, so the walk to the rug starts where it always did. The console of chapter 6 goes along the bottom,
the graph of chapter 4 below the statement, and the command of chapter 8 above the folder's tab. A wider
screen does not use any of this. Without WebGL 2, three chapters show a still frame.
