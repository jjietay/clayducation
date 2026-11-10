# Clayducation logo

A pebble of clay with a play button pressed into it: a video, made of clay.

| File | Use |
| --- | --- |
| `mark.svg`, `mark-512.png`, `mark-256.png` | The mark alone, with the fingerprint rings and a soft shadow. |
| `logo.svg`, `logo-1200.png` | The mark and the word, on a light background ("clay" in ink, "ducation" in clay). |
| `logo-dark.svg`, `logo-dark-1200.png` | The mark and the word, on a dark background. |
| `favicon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Icons: a simpler mark (no rings, no shadow, a larger play shape), so it stays clear at 16 px. |

The word is Plus Jakarta Sans ExtraBold (SIL Open Font License), set with its kerning at -0.035 em and
turned into outlines, so the SVG files need no font.

To make the files again: `outline.py <PlusJakartaSans[wght].ttf> > word.json` (needs `fonttools` and
`uharfbuzz`), then `python3 logo.py <folder with word.json> <output folder>`. The PNG files are the SVG files drawn by
Chrome at those sizes, on a clear background (`apple-touch-icon.png` on #f3ede2).

## The 3D logo (`3d/`)

The word "clayducati_n" as thick clay letters, with the clay play pebble for the "o" and a ball of coral clay
for the dot on the "i", in the same clay and studio light as the mascot. Clear backgrounds.

| File | Use |
| --- | --- |
| `3d/logo-3d-ink.png` | Dark clay letters, clay pebble. |
| `3d/logo-3d-clay.png` | All the letters in clay. |
| `3d/logo-3d-pop.png` | Each letter a different bright clay. |
| `3d/mark-3d.png` | The pebble alone. |

To render again: serve the site, open `3d/render.html?v=ink` (or `clay`, `pop`, or `?mark=1`) in a window of
2400 x 640 (1024 x 1024 for the mark), save it with a clear background, and trim it. `glyphs.json` comes from
`glyphs.py <PlusJakartaSans[wght].ttf> 0.03` (the letters are set 0.03 em apart, because their sides add weight).
