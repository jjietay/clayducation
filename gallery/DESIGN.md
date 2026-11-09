# Design of the gallery page

Read this before you change `index.html` or `app.js`.

## The idea

The page is one clay world that the scroll plays. The mascot is the one thing that stays on the screen:
he comes out of a lump of clay and walks through the whole pipeline, from one sentence to a finished MP4.
Each chapter is pinned while the scroll plays it. Between two chapters, the camera rises and swings to the
next set while he walks there round the objects, and the next chapter's colour grows out of him as a soft
clay blob. The colours are the clay backgrounds of the videos (`BG` in `styles/library/clay.js`).

The only words are one large statement for each chapter, with the key word marked by the pink strike of a
cancel in `eqn.js`. The demos keep the words that are part of them. There is no sound.

## The chapters

| # | Statement | Scroll | Pointer |
|---|---|---|---|
| 0 | Teaching videos, made of clay and code. | the lump squashes and stretches; he pops out in a burst of crumbs and waves | a press dents the clay; with the button down the dent stays |
| 1 | It starts with one sentence. | the prompt types itself; its words fly into the book he holds | the topic can be typed; it becomes the title card in chapter 6 |
| 2 | Claude writes three files. | three pages fan out; the script agent strikes a wrong fact and writes the fix | a page lifts to be read |
| 3 | Whisper times every word. | he walks along the real waveform of one sentence; each word drops in at its Whisper time | the word under the pointer lifts and its bars light |
| 4 | Code draws every frame. | he holds the link; the β ring grows; he lets go and the link stays; β cancels, then M | a drag turns the camera |
| 5 | Nothing renders until the checks pass. | hand 1 moves onto the cart; the message goes from red to green | hand 1 follows the pointer; the hold checks of the clay kit run with their real messages |
| 6 | The result is a real MP4. | a film strip rolls out of his hands: the title card, then frames of six finished videos | a frame plays its clip |
| 7 | Install it with one command. | he points at the command | Copy makes him wave |

Motion rules: the head and the camera follow the pointer through damped springs, never in steps. With
reduced motion, nothing moves by itself; the scroll still plays each chapter. On a narrow screen the set
goes below the statement and the camera steps back. Without WebGL 2, three chapters show a still frame.
