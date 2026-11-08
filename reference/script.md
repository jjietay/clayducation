# Writing script.md

The narration sets the timing for everything. Each picture appears on a word of the
narration. Write the script first, then make the voice, then the pictures.

## Learning order

Use the parts that fit the topic, in this order. Each part is one or more scenes.

| Part | What it does | Notes |
|---|---|---|
| hook | One question the viewer wants answered | 1 scene, under 15 s. A real problem, not a slogan. |
| intuition | A picture of the idea before any symbol | Concrete first: a real example, real numbers. |
| mechanism `{core=yes}` | How it works, step by step | The main part. Slowest pace. One step per sentence. |
| formal `{core=yes}` | The formula or the precise rule | Follow "Formulas" below: every symbol sits on something already on screen. |
| worked example `{core=yes}` | The rule with real numbers | Small numbers that the viewer can check in their head. |
| your case | The user's own example from this project | **Only when it is real.** Skip it otherwise. |
| pitfalls | One or two common mistakes | Good place for "your case" bugs. |
| recap | Three short points | Same words as the core scenes, so they connect. |

A concept the user has never used gets a longer intuition part and no "your case".

## How the voice reads (the user chose all of this by ear)

The voice is Chatterbox (`engine/tts`). It reads **a whole part in one go**: the words between
two `[pause]` marks or paragraph breaks. Inside a part the tone carries from sentence to
sentence, and each full stop gets 0.6 s of silence, so a fact has time to sink in.

What the user rejected, so never do it again:
- **A pause after every sentence.** It cut each sentence off on its own and made the voice
  sound the same all the time; with long gaps it spoke only half the video.
- **Short, choppy sentences** (6 words on average). They sound robotic.
- **A fast voice.** Chatterbox's normal pace (about 200 words a minute) was too fast; the
  skill slows it to about 160 with `engine/tts/slow-reference.wav`.
- **Stretched audio** to slow it down: it sounds muffled, "like a voice in another room".

## Pacing

- Slow comes from **fewer ideas a minute and the picture holding**, not from silence.
- `make voice` checks the rate: at most **145 words a minute in core scenes**, 170 elsewhere
  (pauses included). Fix a WARN by cutting words or adding a `[pause]` after a key point.
- `[pause 0.6]` to `[pause 1.6]` only where an idea ends or an animation needs time to play
  ("Apply M, and watch. [pause 1.6]"). An empty line between paragraphs gives 1 s.
- Give core scenes `{hold=2}` or more, so the last picture stays after the voice stops.
- **In core scenes, show at most one new thing every 2 s.**
- **Say each key definition twice**: once in the mechanism, once in the recap, with the same words.
- Never only read a formula aloud. Follow "Formulas" below.
- Length: from `_brief.length` in `video.json` (step 0 of SKILL.md): short 2 to 4 minutes, standard 5 to 6,
  deep 8 to 9. A topic that needs more than the length allows becomes two videos.

## Formulas

The nonlinear control video read formulas aloud and gave no reason, and the user learned little
from it. So each formula or rule gets these five steps, in this order:

1. **Need:** the problem we have, before any symbol. "The arm's weight pulls harder at some
   angles, so one fixed gain cannot suit every angle."
2. **Picture:** show the idea with objects and no symbols. The viewer sees it happen first.
3. **Formula:** bring in the terms one at a time, each on the thing it names.
4. **Meaning:** say what each term does in the real system, in plain words.
5. **Test:** change or remove a term, and show what happens. "Remove this term, and the arm sags."

Never write "Here is the rule" with no reason. A sentence that only reads symbols does not
count as a step. `make check` WARNs on a formula with no picture, and on three sentences in a
row that only read symbols. These steps take time: a longer video is fine when the topic needs it.

## Writing rules

- **Write the way a good tutor talks: connected sentences in short paragraphs.** 10 to 20
  words a sentence, joined with "and", "so", "which" where the ideas connect. Two or three
  sentences a paragraph, one idea a paragraph.
- Every sentence adds a fact or a step. No filler ("Let's dive in", "It's important to note").
- "You", plain words, active voice.
- Introduce each term before you use it. Use the user's own words for things in their project.
- Do not use en or em dashes in narration: use a full stop or a comma.
- Spell symbols the way they are said: `{λ|lambda}`, `{Σ|sigma}`, `{I2C|I squared C}`,
  `{x_1|x one}`, `{RL|R L}`, `{SAM|Sam}`.

## Markup (explainroo format)

```markdown
# Title

> A line that starts with ">" is a note and is not spoken.

## scene-id {core=yes hold=2}
First sentence. [pause 0.8] The matrix [#stretch] stretches this arrow.
The stretch factor is {λ|lambda}.
```

| Markup | Meaning |
|---|---|
| `## id` | New scene. The id must match `scene('id', ...)` in scenes.js. Use letters, digits, `-`. |
| `{core=yes}` | A core scene: stricter pacing check. |
| `{hold=2}` | The picture stays 2 s after the voice ends. |
| `{min=6}` | The scene lasts at least 6 s (for a scene with little or no narration). |
| `[#name]` | A cue at this point in the speech. Use it in scenes.js as `s.p('#name')`. |
| `[pause 0.8]` | 0.8 s of silence. It also ends a part: the voice starts the next words fresh. |
| `{shown|spoken}` | Subtitles show the first part, the voice says the second. |
| empty line | A paragraph break: 1 s of silence, and a new part. |

Any spoken word is also a cue: `s.p('eigenvector')` is the first time the voice says it,
`s.at('eigenvector', 2)` the second. Use `[#name]` when the word is common or repeated.

## After `make voice`

`make voice` already does these by itself:
- puts a comma between a repeated short word ("one one" → "one, one"),
- stops with an ERROR when a negative number would be read "minus",
- compares Whisper's transcript of every part with its text and **retakes a part that says
  something else** with a new seed (up to 3 times), keeping the good seed for next time,
- sets every pause from the script's punctuation (full stop 0.6 s, comma at most 0.3 s)
  and WARNs when it cannot place one.

What is left for you:
- Each scene shows "% confirmed", from Whisper. **Read the transcript of any scene below
  100%** (`build/voice/<scene>.json`, "transcript"): Whisper writes numbers as digits, so
  "3, 3" for "three three" is fine, but a changed word is a bad take.
  Example: the voice said "one minus one" for "one one". Fix it by changing the spoken
  text (`{(1, 1)|one, one}`: repeated words trip it), or by giving that scene a new seed
  in `video.json`: `"_tts": {"seeds": {"recap": 8}}` for a whole scene, or `{"stay#5": 8}` for
  one part (parts are numbered in `build/_voice/tts-jobs.json`).
- **A repeated phrase that sounds mechanical** ("negative three, negative three" with the same
  melody twice): try another seed for that part first. The user chose a new take over
  changing the words.
- The table shows each scene's length. Write the storyboard with these lengths.

## Voice traps (Chatterbox)

- **Repeated short words** ("one one"): `make voice` adds the comma itself.
- **Symbols run fast.** The voice says short symbol words ("lambda v is v") much faster than
  normal words, and a symbol needs more time, not less. Give each new symbol its own short
  sentence and a `[pause]`: "On the right is lambda v. [pause 0.6] That is v, scaled by
  lambda." `make voice` measures every clause and WARNs "fast" when one is more than 1.3
  times the usual pace after 3 retakes.
- A bar in the shown part breaks the markup: write "∣" (U+2223), as in `{p(x∣ω_i)|p of x, given omega i}`. `make voice` stops on a second "|".
- **A symbol that ends in a number, right before more words**, can come out with the number twice ("one over lambda one, one, which ..."), and Whisper cannot hear the repeat. End the sentence after it.
- **A long sentence that ends in short words** can start slow and race at the end. Split it, with a `[pause]` between.
- Numbers in brackets: `{(1, 0)|one zero}`. Decimals: `{0.5|zero point five}`.
- **A negative number is "negative", never "minus"** (the user asked): `{(1, -1)|one, negative one}`,
  `{-3|negative three}`. Say "minus" only for a subtraction: `{5 - 3|five minus three}`.
- Acronyms letter by letter: `{CNN|C N N}`, `{PCA|P C A}`, `{RGB|R G B}`.
- **It sometimes changes a small word** ("Pick" for "Take"). The transcript shows it.
- Technical words: listen to the first video with a new word, or check the transcript.
  It says "eigenvector" correctly (the old Kokoro voice did not).
