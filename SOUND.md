# Sound: the background music

The engine makes the music itself, from code in `engine/music.mjs`. It uses no samples, no
AI models and no recordings, so there is no licence to clear. Read this file when you choose
the music for a video, or when the user asks for a new track.

## The rules the user chose

| Rule | Value |
|---|---|
| Level | audible and steady, about 16 dB under the voice: `musicVolume` 0.26 |
| Ducking | gentle: sidechain ratio 2, attack 250 ms, release 1.8 s. Rejected: a hard duck (ratio 8), which pumps loud-soft-loud between sentences |
| Too soft | rejected: music that the user cannot hear under the voice |
| Fades | 3 s in, 4 s out |
| Format | 48 kHz stereo; `verify` checks it |
| New tracks | the user approves each new track by ear before it goes into the engine |

## How to choose a track

Set `_render.music` in `video.json`:

| Value | Track |
|---|---|
| `true` or `"current"` (the default) | **current**: calm pad and slow arpeggio, no beat. Neutral, suits any video |
| `"lofi"` | **lofi**: lo-fi study beat. Relaxed, with a light groove; suits a calm video that needs more energy |
| `false` | no music |

The render makes the track at the video's length (`build/music.wav`). It makes the track
again only when the track, the length or `music.mjs` changes. To change the track after a
render: change `_render.music`, then `make render <dir> --remix` (no new frames), then
`make verify`.

To listen to the approved 30 s previews: `mpv gallery/music/*.flac`.

## Track recipes

Each track is a function of the length in seconds. Its chord loop repeats until the length
is full. A seeded random generator (xorshift32) makes the noise, so one track and one length
always give the same file, byte for byte. The mix-down applies the fades, then normalises
the peak to 0.8.

### current (approved 2026-11-02)

The first engine music. Mono (left and right are the same).

| Item | Value |
|---|---|
| Tempo | 72 BPM, 4/4, one chord a bar (3.33 s) |
| Chords | C – Am – F – G (bass C2, A2, F2, G2) |
| Pad | each chord tone as a sine, plus a sine 0.3 % higher at half level (slow beating); 1.2 s attack; each chord overlaps the next by a quarter bar |
| Bass | sine on the root, level 0.16 |
| Arpeggio | the 3 chord tones, then the middle one, one a beat, one octave up; sine with a 2.2 /s decay, level 0.07 |
| Tone | one-pole low-pass at 2.5 kHz |

### lofi (approved 2026-11-02)

| Item | Value |
|---|---|
| Tempo | 76 BPM, 4/4, swing: the off-beat 8th is at 0.6 of the beat |
| Chords | ii – V – I – vi in C, one a bar (3.16 s): Dm9, G13, Cmaj9, Am9 |
| Voicings | Dm9: F3 A3 C4 E4 · G13: F3 B3 E4 · Cmaj9: E3 G3 B3 D4 · Am9: G3 C4 E4 B4 |
| Electric piano | FM synthesis: modulation index 1.4·e^(−3t) + 0.25 (bright attack, round tail); pitch wobble 0.15 % at 0.5 Hz (tape feel). Hits on beat 1 (1.7 beats long) and on the swung "and" of 2 (1.2 beats, softer). Notes 10 to 14 ms apart, like a soft strum, spread from left to right |
| Bass | triangle-like wave (3 odd harmonics): the root on beat 1; the octave (odd bars) or the 5th (even bars) on the swung "and" of 2; low-pass 600 Hz |
| Kick | sine that falls from 125 Hz to 45 Hz, on beat 1 and the swung "and" of 2 |
| Snare | band-passed noise (900 Hz to 4.5 kHz) with a 185 Hz body, on beats 2 and 4, soft |
| Hats | high-passed noise (7 kHz), swung 8ths, off-beats at 55 % |
| Vinyl | low hiss and sparse random clicks, band-pass at 2.5 kHz |
| Effects | piano low-pass 3.2 kHz; reverb on the piano (room 0.7, damping 0.6) at 35 %; master low-pass 5 kHz; `tanh` saturation (drive 1.5) |
| Stem levels (K-weighted) | piano −20.4 dB, piano reverb −24.9 dB, bass −20.7 dB, drums −23.8 dB, vinyl −42.9 dB |

## Rejected tracks (2026-11-02)

The user listened to these and rejected them. Do not make them again in the same form.
The user gave no reason.

| Track | What it was |
|---|---|
| marimba | bouncy marimba pattern, plucked bass, shaker and rim click, G–Em–C–D, 100 BPM |
| ambient | no beat: slow saw pads that change every 8 s, glass bells on a random pentatonic line, big reverb |
| chip | soft chiptune: square-wave arpeggio, triangle bass, square lead with echo, noise hats, 112 BPM |
| guitar | fingerpicked plucked-string guitar (Karplus-Strong), quiet pad, brushed shaker, 84 BPM |

## How to add a track

1. Write the track as a new function in `TRACKS` in `engine/music.mjs`. Use the toolkit:
   `epiano`, `tri`, `kick`, `snare`, `hat` and `noise` for sounds; `biquad`, `filt` and `freeverb`
   for effects; `add` to place a note; `mixdown` for the fades and the peak. Add a new
   instrument when the track needs one.
2. Make 30 s previews of the new track and of `current`: `node engine/music.mjs <tmp-dir> 30 current <name>`.
   It prints the K-weighted level of each stem. Keep the melody stem the loudest, and the bass and drums under it.
3. Match its loudness to `current` (both at −12.5 LUFS), and make a demo under a real
   narration with the engine's mix chain:
   ```bash
   lufs() { ffmpeg -nostats -i "$1" -af ebur128 -f null - 2>&1 | grep -A1 Integrated | grep -oP 'I:\s+\K-?[0-9.]+'; }
   g=$(python3 -c "print($(lufs current.wav) - ($(lufs new.wav)))")
   ffmpeg -y -i new.wav -af "volume=${g}dB" new-30s.wav
   ffmpeg -y -ss 20 -t 34 -i <project>/build/narration.wav -i new-30s.wav -filter_complex \
     "[0:a]apad=pad_dur=4,aresample=48000,loudnorm=I=-16:TP=-1.5,aresample=48000,asplit=2[v][key];[1:a]volume=0.26[m];[m][key]sidechaincompress=threshold=0.03:ratio=2:attack=250:release=1800:knee=6[md];[v][md]amix=inputs=2:normalize=0:duration=shortest,alimiter=limit=0.95,atrim=0:30" \
     -ac 2 new-under-voice.wav
   ```
4. Give the user both files to listen to. Only the user approves a track.
5. When a track is approved: add its recipe to this file, and its 30 s preview to
   `gallery/music/<name>-30s.flac` (lossless). When a track is rejected: delete its function,
   any instrument that only it used, and its preview files, then add one row to
   "Rejected tracks".
