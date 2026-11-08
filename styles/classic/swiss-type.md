# Swiss grid and kinetic type

**Good for:** title and chapter cards, definitions, recaps, key numbers.

## Look

- Background `#f2f0eb`, ink `#111111`, one signal colour `#e63312` on one element per shot.
- A 12-column grid with 4% margins (77 px at 1920). Type sits on the grid, left-aligned.
- One typeface: `Inter`, 700 for display (120 to 220 px), 500 for text.

## Motion

- Elements snap into place with `bezier(0.7, 0, 0.2, 1)` (`E.snap`), 10 to 14 frames.
- Entrances are wipes or clip reveals (`clip-path: inset(...)` driven by `s.p`).
- Deletions are hard cuts.

## Avoid

Overshoot, springs, drop shadows, more than one typeface, centred layouts, more than one signal-coloured element.

## Build

HTML text with `style.clipPath = \`inset(0 ${100 - 100 * k}% 0 0)\`` for a wipe from the left.
