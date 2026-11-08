# Gallery

`index.html` is the public gallery page: the pipeline figure, frames from a finished clay video, the
music previews and the install steps. It uses only files in this folder, so the folder can be published
as it is. `DESIGN-NOTES.md` says why the page looks the way it does, with sources. Read it before you
change the page.

| Picture | What it shows |
|---|---|
| `png/clay-cancel.png`, `clay-formula.png`, `clay-servo.png` | frames from the computed torque video at 421.0, 175.6 and 259.5 s |
| `png/ipcv/*.png` | frames from the six the course videos in `~/Videos/explainers/ipcv-*`: bayes-scale 43.5 s (video 1), ruler 154.5 s and boundary 398.5 s (video 2), knn 347 s (video 3), shadow 55.5 s, eigen 218 s and fisher 543 s (video 4), lever 259.5 s (video 5) |
| `png/classic/*.png` | six of the classic 2D styles, from `styles/classic/png/` |
| `png/check-strip.png` | one movement strip from that video's build (`build/review/moving/443.8-close2-52.jpg`) |
| `png/mascot.png` | the nine expressions, from the `make clay` sheet `expressions.png` |
| `png/clay-room.png` | the mascot and models in one room |
| `png/pipeline.png` | the README figure, made from `pipeline.html` |
| `clip/cancel.mp4` | the muted opening loop: 418.8 to 425.2 s of the same video, 1280 px, no sound |

Take a frame from a rendered video (no rebuild is needed):

```bash
ffmpeg -ss <seconds> -i out/<name>.mp4 -frames:v 1 -vf scale=1280:-2 gallery/png/<picture>.png
```

Cut the opening loop:

```bash
ffmpeg -ss 418.8 -t 6.4 -i out/<name>.mp4 -an -vf scale=1280:-2 -c:v libx264 -crf 30 -pix_fmt yuv420p -movflags +faststart gallery/clip/cancel.mp4
```

Render `pipeline.html` to `png/pipeline.png` with Chrome:

```bash
google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1.5 \
  --window-size=2000,1190 --screenshot="$PWD/gallery/png/pipeline.png" "file://$PWD/gallery/pipeline.html"
```

`music/` holds 30 s previews of the music tracks, and `sfx/` holds short previews of the sound effects
(see `SOUND.md`).
