# Gallery

One catalogue project (`script.md`, `scenes.js`, `storyboard.md`, `video.json`) and its pictures. It is not a teaching video.

| Scenes | What they show | Picture |
|---|---|---|
| the first | a sample part of the newsreel style | `png/newsreel.png` |
| the last 15 | every item of the shared drawing code in `styles/library/`, one scene per module, with its function name | `png/library-<module>.png` |

`png/all.png` shows these 9 pictures in one grid (3 columns of 640 × 360 tiles, the newsreel first).
`png/contact-sheet.png` is the top of the gallery's first contact sheet (`make sheet gallery`).

The newsreel scene shows Rumelhart, Hinton and Williams, *Nature* 323, 533–536, 1986.
The library scenes show drawings only.

Rebuild a picture from the skill folder (`make` is `node engine/make.mjs`):

```bash
make build gallery
make still gallery <scene>@end
cp gallery/build/stills/<scene>@end.png gallery/png/<name>.png
```

`index.html` is the public gallery page: the pipeline figure, these pictures, the music previews
and the style list. It uses only files in this folder, so the folder can be published as it is.
`DESIGN-NOTES.md` says why the page looks the way it does, with sources. Read it before you change the page.

`sfx/` holds short previews of the sound effects (see `SOUND.md`).

`pipeline.html` is the source of the README figure `png/pipeline.png`. Render it with Chrome:

```bash
google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1.5 \
  --window-size=2000,1190 --screenshot="$PWD/gallery/png/pipeline.png" "file://$PWD/gallery/pipeline.html"
```

`build/`, `out/` and `assets/` are ignored by git. After you change a picture, make `all.png` again.
