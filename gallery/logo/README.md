# Clayducation logo

The word "clayducati_n", hand-set: each letter upright on one straight line, with its own small lift and size.
The o is a pebble of clay with a play button pressed into it (a video, made of clay), and the dot on the i is
a ball of coral clay. The pebble alone is the mark and the icon.

| File | Use |
| --- | --- |
| `mark.svg`, `mark-512.png`, `mark-256.png` | The mark alone, with the fingerprint rings and a soft shadow. |
| `logo.svg`, `logo-1200.png` | The word, with ink letters, for a light background. |
| `logo-dark.svg`, `logo-dark-1200.png` | The word, with cream letters, for a dark background. |
| `favicon.svg`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | Icons: a simpler mark (no rings, no shadow, a larger play shape), so it stays clear at 16 px. |

The letters are Plus Jakarta Sans ExtraBold (SIL Open Font License), turned into outlines, so the SVG files
need no font. The lifts and sizes come from a fixed seed: the same files come out each time.

To make the files again:

- `python3 glyphs.py <PlusJakartaSans[wght].ttf> 0 > glyphs.json` (needs `fonttools` and `uharfbuzz`): the
  outline and the place of each letter.
- `python3 hand.py glyphs.json .`: `logo.svg` and `logo-dark.svg`.
- `python3 logo.py .`: `mark.svg` and `favicon.svg`.
- The PNG files are the SVG files drawn by Chrome on a clear background (`apple-touch-icon.png` on #f3ede2),
  and trimmed.
