# Design notes for the gallery page

Read this before you change `index.html`.

## The idea

The page is built like one of the videos. A video is a row of parts, and each part has its own plain
clay background. The page does the same: each section is a part, in the exact background colours of
the clay kit (`BG` in `styles/library/clay.js`), and two sections next to each other never share a
colour, as two parts in a video never do.

| Section | Background |
|---|---|
| opening | sky `#a9c4cf` |
| how a video is made | sand `#e4d3b7` |
| frames | navy `#27324a` (light text, the only dark part, so the frames stand out) |
| checks | lilac `#b9b3cf` |
| sound | blush `#e6bfae` |
| install | clay `#c98f6b` |
| footer | navy |

## Choices

1. **Real output first.** The opening shows a muted loop from a finished video: the mascot holds the
   cart while the terms cancel. It plays only when the viewer allows motion, and a button pauses it.
2. **One typeface, the one in the videos.** Plus Jakarta Sans sets every title card in the videos, so it
   sets every word here, at 400, 500, 700 and 800. JetBrains Mono is only for real commands and file names.
3. **One accent from the product.** Links are underlined in the pink of a cancel strike in `eqn.js`.
   Text stays dark ink, because pink text is too faint on the pastel backgrounds.
4. **The memorable element.** Each picture sits on a soft contact shadow, like a model on the floor of
   the clay studio. Nothing else has a shadow.
5. **Soft, but not one radius everywhere.** Large pictures have a 22 px radius, small ones and panels
   14 px, buttons are pills. No borders and no hairline rules.
6. **Numbers only for a sequence.** The six pipeline steps are numbered because they run in order.
   Nothing else has numbers, labels above headings or capital-letter labels.
7. **Readable text.** Body text is 17 px with a line height of 1.6, and lines stop at about 60
   characters. On a phone every section is one column with a 16 px gutter.

## What this page replaced

Until 2026-11-08 the page was a printed report: cream paper, a serif display face, hairline rules
and monospace labels. That fitted the old 2D styles and looked like many other generated pages.
