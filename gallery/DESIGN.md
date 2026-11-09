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
| 0 | Teaching videos, made of clay and code. | the lump squashes and becomes a clay figure in his shape (head, body, legs), which hides all of him; the figure cracks, without a shake, and its pieces fall away from the top down, show him inside, and land as crumbs | a press dents the clay; with the button down the dent stays |
| 1 | It starts with one sentence. | the prompt types itself; its words fly into the book on the table; the pen taps, vibrates faster and faster, and flies to the camera; the camera moves in on its barrel until the pen's own blue fills the frame, and the cut to chapter 2 happens there | the topic can be typed (at most 3 rows); it becomes the title card in chapter 6 |
| 2 | Claude writes three files. | the camera moves back out of the pen; his face is still the surprised face of chapter 1; the pen flies to the first page and writes the pages line by line with its nib on the line, held as in a right hand; the script agent strikes a wrong fact and writes the fix; he watches the pen | a click brings a page to the camera, in front of the statement (which stays); a click outside sends it back |
| 3 | Whisper times every word. | he walks in without a stop, smiling, behind the bars and the words, and carries the playhead along the real waveform of one sentence; each word drops in at its Whisper time; he turns his head to the words; his hand goes along behind the words at one height, as if it touches each one; at the end the playhead sinks into the floor and he walks on without a stop | the word under the pointer lifts and its bars turn green |
| 4 | Code draws every frame. | he pushes the cart against its spring and lets go; the graph of x(t) draws itself with a frame counter | on the graph, a ghost cart shows where the cart was at that time |
| 5 | Nothing renders until the checks pass. | the same cart, closer: hand 1 moves onto it; the console of `make look` is at his hand, over everything, and goes from red to green | hand 1 follows the pointer, as a real arm can (the elbow points down and back): back only to a set angle, forward as far as the arm reaches, and it stops on the cart (closer to him) when it comes down onto it; the hold checks of the clay kit run with their real messages |
| 6 | The result is a real MP4. | he holds a roll of film as a pole is held (palms on it, one hand over the other), and the strip, with sprocket holes, comes out of it and stays in it: the title card, then frames of six finished videos; then a red balloon comes in at the top right, the wind takes it to the left and then the roll out of his hands, and the roll turns on its axis as the film rolls back into it, the strip turning with the roll as it flies; the statement goes behind them; he is shocked in the wind, reaches after it and leans, then is unbothered | a click brings a frame to the camera and plays its clip (8 s, 1080p, with motion); a frame does not move on hover |
| 7 | Install it with one command. | the balloon and the roll come back from the right; he is surprised; the balloon's string (one length, with its own weight) trails behind the balloon, meets the black bar of the command, and stays caught on its top by friction (nothing pins it); he catches the roll in the air in his right hand, arm out, brings it down to his side, level with the ground, his arm hanging straight down and his palm on top of the roll (one point of contact), and points at the command | the pointer pushes the balloon and it swings back; Copy makes him wave; the More styles tab (bottom right) opens a panel over the darkened page with Manim parts and the older 2D styles; a click outside it, or Escape, goes back |

The scroll is a timeline (`plan()` in `app.js`): each chapter has its own length, and each walk between two
sets has a length that matches its distance, so he always walks at the same pace. The wheel scroll is
smoothed. Each statement stays in place on the screen: it fades out before a transition and rises in after
it, so no text moves between chapters. A colour change is a blob that grows out of the mascot. Between chapters, the old set sinks into
the floor and the next one grows out of it. The mascot's face, head, arms, legs, turn and place ease towards
what each chapter wants, on every frame (`settle()` in `app.js`), so nothing on him changes in one frame.
A hand that holds something is put on it after the body has eased, so it stays on the book, the cart or the
roll while he moves.

Checks: a full scroll is recorded at 60 fps and the change between every two frames is measured; a frame
that changes much more than its neighbours is looked at and fixed. A second check walks the whole scroll and
tests his body against every object in view (`window.__claySets`, `__clayHero`, `__clayState`, `__clayProbe` are for these).
Other checks: no word of a statement touches the set, every point of him is inside the clay figure, and each
holding hand is on its point.

Motion rules: the head and the camera follow the pointer through damped springs, never in steps. With
reduced motion, nothing moves by itself; the scroll still plays each chapter. On a narrow screen the set
goes below the statement and the camera steps back. Without WebGL 2, three chapters show a still frame.
