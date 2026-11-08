# Gallery

`index.html` is the public gallery page: the pipeline figure, frames from a finished clay video, the
music previews and the install steps. It uses only files in this folder, so the folder can be published
as it is. `DESIGN-NOTES.md` says why the page looks the way it does, with sources. Read it before you
change the page.

| Picture | What it shows |
|---|---|
| `png/clay-cancel.png`, `clay-push.png`, `clay-formula.png`, `clay-key.png`, `clay-servo.png` | frames from `~/Videos/explainers/partition-clay` ("Why computed torque works") at 421.0, 141.9, 175.6, 106.8 and 259.5 s |
| `png/check-strip.png` | one movement strip from that video's build (`build/review/moving/443.8-close2-52.jpg`) |
| `png/mascot.png` | the nine expressions, from the `make clay` sheet `expressions.png` |
| `png/clay-room.png` | the mascot and models in one room |
| `png/pipeline.png` | the README figure, made from `pipeline.html` |

Take a frame from a rendered video (no rebuild is needed):

```bash
ffmpeg -ss <seconds> -i out/<name>.mp4 -frames:v 1 -vf scale=1280:-2 gallery/png/<picture>.png
```

Render `pipeline.html` to `png/pipeline.png` with Chrome:

```bash
google-chrome --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1.5 \
  --window-size=2000,1190 --screenshot="$PWD/gallery/png/pipeline.png" "file://$PWD/gallery/pipeline.html"
```

`music/` holds 30 s previews of the music tracks, and `sfx/` holds short previews of the sound effects
(see `SOUND.md`).
