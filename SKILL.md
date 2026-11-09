---
name: clayducation
description: Make a narrated learning-explainer video (MP4) that teaches a concept, in one soft 3D clay look with a silent mascot, with its script checked by one agent before the voice is made. Use when the user asks for a video, an explainer, an animation or a visual walkthrough of an idea, such as "make a video explaining eigenvectors", "generate an explainer on I2C", "animate how attention works". Uses what the current conversation and project already show, so run it in the conversation where the topic came up.
---

# Explainer video

You make a video that helps the user **learn** a concept. You have one big advantage
over a fresh tool: you know this conversation and this project. Use that knowledge.

The engine is in `~/.claude/skills/clayducation/engine/`. In this file, `make` means:

```bash
node ~/.claude/skills/clayducation/engine/make.mjs <command> <project-dir>
```

## Step 0: ask first (every time the skill starts)

Whether the user typed `/clayducation` or asked for a video in words, the first thing you do is
ask the questions below with AskUserQuestion, with clickable options. Leave out each question that
the user's message or this conversation already answers (for example "as a newsreel" answers the
look, and "with lo-fi music" answers the music). Put the recommended option first and mark it
"(Recommended)". Ask all four questions in one call (the tool takes at most 4). If the topic
itself is unclear and no question is skipped, ask about the topic first, in its own call.

| Question | Header | Options (first = default) |
|---|---|---|
| Which look should the video use? | Look | **Clay 3D**: one soft clay look, with the silent mascot doing the work · **Classic 2D, mixed**: a different 2D style for each part · **Classic 2D, one style**: the user names it (newsreel, whiteboard, ...) |
| Who is the video for, and how long? | Viewer | **Exam revision, standard**: the lecture's notation, worked numbers, exam traps, 5 to 6 min · **Exam revision, deep**: the same, 8 to 9 min, every step of the derivation · **First-time learner, short**: intuition first, fewer symbols, 2 to 4 min · (Other: the user names a viewer and a length, for example "expert refresher, short") |
| When should I check with you? | Checkpoint | **One shot**: come back with the finished video · **After the storyboard**: show the plan and wait for approval · **After the first look**: show the first frames and wait |
| Which music? | Music | **Calm** (`current`): soft pad, no beat · **Lo-fi** (`lofi`): light beat, more energy · **None** |

Put a recommended option first when the conversation suggests one (an exam the next week: Exam
revision, deep). If the message answers only one half of the Viewer question (for example "for my
exam"), keep the question and offer only the options that agree with that half. The viewers are
exam revision, first-time learner and expert refresher (fast and dense); the lengths are short
(2 to 4 min), standard (5 to 6 min) and deep (8 to 9 min). Write the answers into `video.json`
at step 4: `"_look"` (`clay` or `classic`),
`"_brief": { "viewer": ..., "length": ..., "checkpoint": ..., "style": ... }` and
`"_render": { "music": "current" | "lofi" | false }`. Every later step, and a rebuild, reads them
there and does not ask again. If the user dismisses the questions, use the first option of each.

## One shot, unless the user chose a checkpoint

After step 0, **do every step below without stopping, and come back only with the finished,
checked video**. Do not ask "shall I continue?", do not show drafts, do not wait between steps.
Every check below is yours to run and to act on. The only stops are the checkpoint that the user
chose: "After the storyboard" stops after step 7 (show the storyboard and the script agent's
verdict, then wait), and "After the first look" stops at the first `make look` of step 9 (show its
images, then wait).

## The look the user wants (read before step 6)

**Clay for things that act, Manim for plots, and the mascot is in every video.** Read `styles/clay.md`.
The user chose the clay look over the old style mix for consistency across videos. The 2D styles are an opt-in classic look; see the section below.

- **Do not force a plot into clay (the user asked).** When a 2D Manim picture helps the viewer understand
  more than clay does (a curve, a distribution, a contour, a projection or other geometry in a plane),
  make that part a Manim part, on Manim's dark background (`styles/math-manim.md`). Never build a clay
  model that copies a mathematical curve: the user had those removed. Objects that act, and the mascot's physical work, stay in clay. A video
  can go from a clay part to a Manim part and back, with the same colour for the same thing.

- **One look, many parts.** The video is split into parts of about 15 to 40 s (hook, each idea,
  your case, close). Each part has its own plain background, camera and setting. Next to each
  other, two parts never share a background.
- **The mascot does the work.** He is silent, with no lip sync, and the narrator is a voice-over. He
  walks, pulls, pushes, carries and turns things off with his own hands, so a force in the script is
  something the viewer sees him do. The user asked for this after a video where he only stood and
  watched. He stays deadpan by default, and `make check` WARNs when he stays in one spot.
- **Things must connect.** A spring reaches its wall, a pin touches its map, a hand touches what it
  holds. The user found a spring that missed its wall after every check had passed. `make bake` measures
  every join in `models.js` (`JOINS`), so add new joins there, and look for contact in the stills.
- **Our own models only.** Use the kit in `styles/library/clay`. Never download a model. If a video
  needs a new object, add it to the kit in the same look.
- **Each part is one continuous shot.** Inside a part there are no cuts and no new slides: objects
  arrive, move and join as the voice speaks, and the camera moves slowly. A part ends in the state
  the next part starts from, or with a wipe in the next part's background.
- **The picture explains; text only names.** Text stays flat and sharp, in HTML over the 3D. Per
  frame: a kicker (small capitals, the part and a source), a title of at most 8 words, a few labels
  of 1 to 4 words each with thin leader lines, and at most one caption line at the bottom. **Never
  a column of sentences, never a bullet list, never a legend of what the colours mean.** About 15
  words on screen at most.
- **Formulas act out the voice (the user asked for this).** A fixed formula is no better than reading notes.
  Build each one with `eqn()`: terms arrive as they are said, move when the voice moves them, strike and burst
  when it says cancel, and bounce only when it names something important. `make look` gives a fault for a
  formula that sits still, and for a "cancels" sentence with no cancel on screen. See `styles/clay.md`.
- **Physical motion.** Things move like objects: an arm reaches, a ball falls and bounces, a block
  drops and settles, a pulse travels. No build-up of static boxes.
- **The same object keeps its colour in every video** (the robot is always orange, the map always
  yellow).

If a storyboard breaks one of these, change the storyboard before you write code.

## Hard rules

- **Parallel by default (the user asked, 2026-11-09).** Whatever can run at the same time does: a 13-minute
  video took 3 hours when every frame was measured in one Chrome page (one core busy, GPU at 10 %).
  The engine now measures `look`, `collide`, `review` and `stable` in several pages at once (the render's
  `workers`: half the cores, at most 8, and only as many as free memory allows;), and `build` runs sheet, stable and review together. When you add a step that
  visits frames, split it over pages too (`measureParallel`, `traceParallel`, `idParallel` in `make.mjs`).
  In your own work: start independent jobs together (a look and a selftest, a Manim render and a check),
  and never wait on one job while another could run.

- **Do the thinking here, in the main conversation.** You write the script, the storyboard
  and the scenes yourself, because the context is here. Never give those steps to a
  subagent: a subagent starts with no context. The script agent in step 7 is the one
  exception, and it starts cold on purpose.
- **Never hurry the core explanation.** The user learns from these videos. Follow the
  pacing rules in `reference/script.md` and fix every pacing WARN.
- **Never make up a fact.** Each number, formula and claim comes from a source you checked:
  the user's code, a datasheet, a spec, a paper, the docs. List them in `storyboard.md`.
  Report anything you could not check.
- **"Your case" is optional.** Add it only when this conversation or project really holds
  a matching example (a bug the user hit, a fix, a measured number). Never invent one.
- **No overlaps.** No visual may cover another: text on text, text on a graphic, or a
  graphic that hides another graphic. Each label, formula, arrow and object gets its own
  space. `check` WARNs on overlapping texts, and `review` writes every measured overlap to
  `overlaps.md`. Crowding is the user's judgement, so look for it in the frames at full size. The ID
  pass helps: `make look` adds an image of the tightest gaps, and WARNs for text closer than 12 px
  to another thing, text on a drawing, low text contrast and a model that others hide.
  Fix every overlap before `make final`.
- **Subtitles have one line.** Each cue is at most 42 characters and no two cues show at
  the same time, so a player never shows two lines. The engine does this; `verify` reports
  a cue that breaks the rule. Do not change `SUB_MAX` in `make.mjs` to make a cue fit.
- **The closed loop (the user asked for this, and the engine enforces it).** After every edit:
  `make look`, read every image it lists, fix what you see, and look again. Only then build. Never edit
  and build blindly, because a build is long and a look takes seconds. Each image has a CHECK digit at its
  top right, and the gates open only with the digits of all images, in order:
  1. Edit. If you changed `script.md`, run `make voice`. If the video has Manim parts and you changed
     `manim_scenes.py` or the voice, run `make manim`: `make look` draws the Manim frames, it does not make them.
  2. `make look <dir>`: it measures each changed scene on every frame, and draws its near frames and its
     moving parts. Read them all. Then `make look <dir> --ok <digits>`. `make build` stops without this.
     An image with the same frames and labels as one already read and confirmed shows READ BEFORE and needs no
     digit (`--ok -` when every image is read before). Read every new image; the same rule holds for the strips.
  3. `make build <dir>`. It stops on any collision.
  4. Read every strip in `build/review/moving.md`. Then `make look <dir> --moving-ok <digits>`.
  5. `make final <dir>`. It stops if the source changed after the look or the build, or if a collision or
     an overlap is open.
  Run each step as its own command, stop on the first failure, and confirm that an edit applied.
- **Every reader checks near frames and moving parts.** Any agent or session that judges a video reads the
  near frames of each edited part, and all frames of each thing that moves: the mascot and objects, during
  their whole movement. A sample of the video does not count: a hand went through a table between the
  sampled frames.
- **A new fault gets a guardrail.** When the user finds a fault, first add it to `reference/faults.md` and to
  `engine/test/selftest.mjs`, and confirm that the test fails on it. Then fix the video. Do not only fix the
  video. Run `make selftest` after each change to a check.

## What the user asked for (keep these)

Each was asked for or chosen by ear. The engine does most of them by itself.

| Topic | What | Automatic? |
|---|---|---|
| Voice | Chatterbox's built-in voice, slowed to about 160 words a minute by `engine/tts/slow-reference.wav`; each paragraph read in one go so the tone carries | yes |
| Pauses | every full stop exactly 0.6 s, every comma at most 0.3 s, set from the script's punctuation | yes; `voice` WARNs if a pause could not be placed |
| Bad takes | a part whose words differ from the script (Whisper check) is retaken with a new seed, up to 3 times; the best take is kept | yes; WARN if still wrong |
| Fast spots | a clause more than 1.3 times the video's usual pace (symbol words count double) is retaken; the user found "lambda v is v, scaled by lambda" too fast | yes; WARN "fast": give it its own short sentence and a `[pause]` |
| Negative numbers | read "negative", never "minus" | `voice` stops with an ERROR |
| Repeated words | "one one" gets a comma ("one, one"), or the voice slips | yes |
| Writing | connected paragraphs; `[pause]` only where an idea ends or an animation plays. Rejected: a pause after every sentence, choppy sentences, a fast voice, a stretched (muffled) voice, Kokoro | you, see `reference/script.md` |
| Music | audible, steady, about 13 dB under the voice (`musicVolume` 0.37; the user raised it 3 dB from 0.26), gentle ducking; two approved tracks, `current` (default) and `lofi`. Rejected: loud-soft pumping, music too soft to hear, 4 other tracks | yes; you choose the track, see `SOUND.md` |
| Sound effects | the kit in `engine/sfx.mjs`, approved by ear; the fly-in whoosh 4 dB under the other accents (the user found it a bit too loud). On for new videos (`_render.sfx: true`), off for old ones | you add `s.sfx` at the cues; the engine mixes them |
| Audio | 48 kHz stereo | yes; `verify` checks it |
| Subtitles | soft, never burned in; the user's mpv shows them small (`sub-scale=0.7`) | yes |
| One subtitle line | one line per cue, at most 42 characters, no two cues at the same time. The user saw two lines in video 1 of the ROS 2 set | yes; `verify` reports a cue that breaks it |
| No overlaps | no text or graphic covers another one | `check` WARN for texts, `overlaps.md` and your frame checklist for the rest |
| Look | one 3D clay look with the silent mascot, and our own models; Manim parts on the dark background for curves and plots (the user asked: do not force a plot into clay). Rejected: downloaded models, a whole dark video, text columns, colour legends, build-up slides | `make check` ERROR for a scene that is neither clay nor Manim, or a video with no mascot; the rest is you, see "The look the user wants" |
| Maths | the five formula steps (need, picture, formula, meaning, test). Manim for a curve, a plot or a formula that changes step by step: `manim()` in 2D, or `manim({ threeD: true })` for a 3D picture, not hand-drawn canvas | `make check` WARNs on a formula alone; the rest is you, see `reference/script.md` and `styles/math-manim.md` |
| Quiz | none in the storyboard | you |
| Watching | `mpv <dir>/out/<slug>.mp4` | put it in the report |

## Machine settings

Run `make config` before step 1. It prints this machine's settings, which the installer or
`/setup-clayducation` wrote.

The `voice` line names the voice: Chatterbox (natural, best on an NVIDIA GPU or Apple
silicon) or Kokoro (small and fast on a CPU, at about 150 words a minute). A project can
choose its own in `video.json`: `"_tts": {"engine": "kokoro"}`. Without a GPU, Chrome draws
the frames with SwiftShader and ffmpeg encodes with libx264; a render takes longer, and the
frames are the same.

## The classic 2D look (only when the user asks)

Clay is the default for every video. Use the classic 2D styles only when the user asks for them, or
names one of them ("tell its history as a newsreel"). The workflow is the same for both looks:
every step below, the one script agent, `make look` after each edit and the gates. Only steps 6 and
8 change: read `styles/classic/README.md` in place of `styles/clay.md`, and set
`"_look": "classic"` in `video.json`. A classic video mixes styles, one per part. It has no mascot.
Never mix clay and classic in one video. The clay measures (body shapes, holds) do not apply to it;
every other check does, and formulas must act out the voice in both looks.

## Workflow

1. **Collect context (no tool calls needed).** Note what the user already knows (level,
   words they use, projects), what this conversation or project shows about the topic,
   and whether a real "your case" exists ("none" if not).

2. **Use the answers of step 0.** The viewer sets the depth and the notation (write it as "the
   viewer" in the storyboard, so the script agent reads it), and the length sets the minutes. Say
   in the report what was chosen.

3. **Check the facts.** Read the user's code, datasheets or docs that the video depends on.
   For maths, derive or check every formula and every example number.

4. **Create the project** where the topic lives: `<repo>/videos/<topic-slug>/` in a project
   repo, else `~/Videos/explainers/<topic-slug>/`.
   ```bash
   make init <dir> --title "Eigenvectors and eigenvalues"
   ```
   Then write the step 0 answers into `video.json` (`_look`, `_brief`, `_render.music`).

5. **Write `script.md`.** Read `reference/script.md` first: learning order, how the voice
   reads, pacing, **formulas**, writing rules, markup, voice traps. Compute each number with
   code where you can, and do not type it from memory.
   Then run `make pace <dir>` (instant): it estimates each scene's pace from the text and lists clauses made
   mostly of symbol words. Fix them before any voice exists; `make voice` runs the same check first and stops
   on a scene clearly over the limit. A voice run costs 10 to 25 min, a pace fix in the text costs nothing.
   A part that used all its retakes is not retaken again while its text stays the same.

6. **Write `storyboard.md`.** Read `styles/clay.md` (classic: `styles/classic/README.md`). Then:
   - Split the script into **parts** (about 15 to 40 s each; a part can hold several
     `## scene` ids that share one picture).
   - For each part, write: the background, the camera, what the mascot does, the objects, how
     they move on each cue, the kicker and title, the labels (1 to 4 words each), the caption
     (one line or none), and how the part hands over to the next one.
   - For each formula, write the five steps and the cue that carries each one.
   - List "Facts and sources", "Your case" and "## Viewer" (what the user knows before this
     video). **No quiz**: the user asked for none.

7. **Check the plan with one agent.** Start one `video-script` agent. Give it the project folder
   and the report path `<dir>/build/reports/script.md`. It checks every fact and every formula
   before any voice exists, when a fix costs almost nothing. Read its report, fix every true
   "must" and each "should" that serves the learning goal. Check a claim before you act on it: a
   reviewer can be wrong. Do not run it a second time unless a fix changes the facts.

8. **Build the scenes.** Read `reference/engine.md` and `styles/clay.md` (classic: the style files you chose). Each "## id" in
   `script.md` needs one `scene('id', ...)` in `scenes.js`. Show each thing when the voice says it
   (`s.p('#cue')`, `s.p('word')`). When one part holds several scene ids, the next scene starts
   from the exact last frame of the one before, so the part looks like one shot. Load fonts before
   canvas text: use only the fonts listed in `reference/engine.md`.
   **Sound effects**: in each scene's `setup`, add `s.sfx(...)` at the moments of contact (a
   landing, a stamp), about one sound a beat at most. The kit and its rules are in `SOUND.md`.
   **Maths scenes that use Manim**: write them in `manim_scenes.py`, and put
   `scene('<id>', manim({ threeD: true }))` in `scenes.js` when the picture is 3D.
   **Start every clay scene from the fixed layout** in `styles/clay.md` ("Fixed layout"): the camera, the
   zones for the 3D, the formulas and the labels, and the hold heights.

8b. **Frame each scene first (seconds, not minutes).** Before the first `make look`, take one still of
   every clay scene at a busy cue, in one command: `make still <dir> hook@end idea@#step ...`. Read them
   all. Then run `make zones <dir>` (seconds): for each clay scene it shades where the mascot and the models go
   at any time, and prints the free boxes for formulas and labels, in stage px. Put every formula inside a free
   box; never guess a position. Fix the camera when a scene has no free box. Only then run `make look`.
   Auto-fit in the runtime pushes any text that leaves the safe area back in (and shrinks one that is too wide),
   and `check` and `look` WARN about each fit: place that text yourself. The user asked for this on 2026-11-09: in the computed torque video the first `make look`
   found 115 faults, because every camera was too close, and each full look pass took 10 minutes.
   While you fix faults, measure only the scenes that you changed: `make collide <dir> --scene a,b`.
   An edit to a helper that all scenes share makes `make look` measure every scene again, so put
   scene-only code inside its scene.

9. **Build and look.**
   ```bash
   make build <dir>     # voice, manim, check, sheet, stable, review: stops at the first ERROR
   ```
   Run `make look` first (see "The closed loop"). Never chain `make build` and `make final`: the user found
   5 renders that started before anyone had looked at a frame, and the gates now refuse this.
   The voice comes first, and the scenes follow its measured word times, so the picture
   never runs ahead of the voice. Then act on everything it prints, and run it again
   (finished steps are cached):
   - **voice:** pacing WARN (cut words or add a `[pause]` after a key point); "could not
     place the pause" or "still says something else" (read the line it prints; reword the
     part or set a seed: `"_tts": {"seeds": {"stay#5": 20}}`). Read the transcript of any
     scene below 100 % confirmed: digits for spelt-out numbers are fine, a changed word is not.
   - **manim / check:** "started late" (shorten the animation before the cue), text outside
     the safe area or too small, scene errors, a formula with no picture, symbols with no plain sentence.
   - **overlap:** `check` prints `"A" overlaps "B"` and `review` prints "measured
     overlap(s)". Move, resize or re-time one of the two things. Do not accept an overlap
     because it is short: the viewer pauses videos to read.
   - **collisions:** `review` gives an ERROR when the mascot goes into an object, an object goes into
     another, or a 3D thing covers text. After each edit, run `make collide <dir> --scene <id>` before you
     build. The user found a hand through a table and a robot through a target between the frames.
   - **motion:** `review` prints jumps, pops and speeds. A pop or a jump needs a fix, unless it is
     on purpose.
   - **stable:** an ERROR means that two draws of one frame differ, so the GPU dropped something.
     Read the frame it names, and do not render until it passes.
   - **sheet:** read every `build/sheet-N.png`. Look for clipped or tiny text, overlaps, empty
     frames, the same picture too long in a core scene, a picture that does not match the words.
     `make sheet <dir> --scene <id>` and `make still <dir> <scene>@<cue>` look closer.

9b. **Look after each edit.** This is "The closed loop" above. `make look` finds what changed by itself, from
    `scenes.js`, `script.md`, the kit and the runtime. A change that all scenes share means a look at all
    scenes. Say in your status line which scenes you looked at. In a Three.js scene, hide an object with a
    tiny scale (`1e-4`), not with `visible = false`, because an object first drawn mid-scene can miss its
    first frame.

10. **Frame checklist.** The reviewers are gone, so this check is yours, and it must be honest.
    For each part, read the full-size still at its end (`make still`) and its cue grids
    (`build/review/cues/`, listed with the spoken words in `build/review/cues.md`). Write one
    line for each answer to `build/self-check.md`:
    1. With the sound off, what does this picture show? Write it before you read the script again.
    2. At each cue, does the screen show what the voice says, at that moment?
    3. Does each formula sit on an object, with its meaning said in plain words?
    4. Does any text touch a graphic or another text? Which gap is the tightest, and is the frame
       crowded while other space is empty?
    5. What physical work is the mascot doing here? Is he clear of the title and labels, and do his
       hands touch what they hold? Does every spring, wire and joint connect at both ends?
    6. Is there a pop, a jump or an object that floats?
    Fix each "no", then repeat step 9b for what you changed.

    **Moving things get the closest look (the user asked).** `build/review/moving.md` lists every movement
    of the mascot and of each object, measured from the frames, and each has a dense strip. Read every strip,
    in order: contact, clearance, feet, and whether the thing moves the way the voice says.

11. **Render and verify.**
    ```bash
    make final <dir>     # render (out/<slug>.mp4, soft subtitles, .srt) and verify. The gates must pass first
    ```
    A 3-minute video renders in about 2 minutes on a GPU. `verify` must print "no problems found".
    It also checks the `.srt`: one line per cue, at most 42 characters, no two cues at once.
    Then check the rendered file itself: take frames from the MP4 in each part
    (`ffmpeg -ss <t> -i out/<slug>.mp4 -frames:v 1 build/final-<t>.png`, or a tile of
    `fps=1` for a short range) and read them. Report this check with the result.

12. **Report** in a few lines:
    - `mpv <dir>/out/<slug>.mp4` and the length,
    - any default you chose at step 2,
    - "your case": what you used, or that there was none,
    - facts you could not verify, and what the script agent found,
    - the overlap result, the tightest moments, and the two weakest moments, so the user knows
      where to look.

13. **Grow the kit.** After the video passes `verify`, move each new object that a later video
    could use from `scenes.js` into `styles/library/clay/models.js`. Run `make bake` and
    `make clay m-<name>`, read its sheet, and say in the report what you added.

## Files in this skill

| File | Read it |
|---|---|
| `reference/script.md` | before step 5: learning order, how the voice reads, pacing, writing rules, markup, voice traps |
| `reference/faults.md` | every fault that has happened, and what stops it now. Read it before you change a check |
| `styles/clay.md` | at step 6: the look, the mascot and his controls, every model and its moving parts |
| `styles/library/clay/` | the kit: `sdf.js` (shapes), `mascot.js`, `models.js`; `make bake` saves the shapes, `make clay` draws vetting sheets |
| `styles/math-manim.md` | only for a formula that changes step by step |
| `styles/classic/` | only when the user asks for the classic 2D look: `README.md` (choose a style per part), one guide per style, the drawing code in `styles/library/classic/` |
| `reference/engine.md` | before step 8: the scene API and every command |
| `SOUND.md` | when you choose the music or add sound effects, or the user asks for a new track or sound: the rules, the tracks and their recipes, the sound kit and its levels |
| `agents/video-script.md` | the script agent (step 7), linked from `~/.claude/agents/`. You do not need to read it |
| `setup/SKILL.md` | the `/setup-clayducation` skill, which writes `config.json` (voice, GPU) with `make config` |

## If something fails

- Claude Code reads agent files (`~/.claude/agents/video-*.md`) when a session starts. After you
  add or change an agent, the change applies only in a new session. In the old session, start a
  `general-purpose` agent and give it the text of `agents/video-script.md`.
- An old 2D project imports modules that are deleted, so it does not build now. Get them from the git
  history before 2026-11-08 if the user wants to change one.
- "the clay shapes are missing": run `make bake`. It takes about a minute on few cores.

- `make doctor` checks Node 22+, ffmpeg, Chrome, explainroo at `~/.explainroo` (Whisper),
  Chatterbox (in `engine/tts/.venv`, GPU), Three.js, MathJax, Manim (in `engine/manim/.venv`) and LaTeX.
- explainroo is used **only** for word timing inside `voice`. Never run `explainroo render`,
  `check` or `preview` in these projects: `scenes.js` here is for this engine.
- **The voice env can use another environment's PyTorch** (linked through `engine/tts/.venv/shared-torch`)
  to save 7 GB of disk. If `make doctor` shows Chatterbox
  failing after a change to that environment, see INSTALL.md ("Optional, to save about 7 GB").
- To change only the music track or level (`_render.music`, `musicVolume`): `make render <dir> --remix` (no new frames), then `make verify`.
- The render uses the NVIDIA GPU (Chrome drawing and WebGL, NVENC encode) when the engine finds one; the probe
  result is cached in `/tmp/xv-gpu-<chrome version>.json` (delete it after a driver change). If frames look wrong or
  Chrome fails on the GPU, run with `XV_GPU=0` (the old CPU path). Never make a render faster by lowering the fps,
  or the capture size: the user asked for speed from the GPU only.
