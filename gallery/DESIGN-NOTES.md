# Design notes for the gallery page

These notes record why `index.html` looks the way it does. Read them before you change the page.

## What makes a page look generated

Studies and guides of "AI-generated" pages list the same defaults again and again:

- A centred hero in a generic sans (Inter), with a pill badge above the title and a row of badges or stats below it.
- Purple or blue gradients, gradient text, coloured glows and glass cards.
- A grid of identical cards with an icon on top, often with a coloured top or left border.
- Numbered "1, 2, 3" steps, all-caps section labels, emoji bullets.
- The same padding, radius and card height everywhere.
- Copy that could describe any product ("build the future of video").

Sources: [Scoring 500 Show HN pages for AI design patterns (Adrian Krebs)](https://adriankrebs.ch/blog/design-slop/),
[AI slop web design guide (925 Studios)](https://www.925studios.co/blog/ai-slop-web-design-guide),
[AI slop fonts and gradients (925 Studios)](https://www.925studios.co/blog/ai-slop-design-tells),
[Why your AI keeps building the same purple gradient website](https://prg.sh/ramblings/Why-Your-AI-Keeps-Building-the-Same-Purple-Gradient-Website).

The old page had several of these: a centred hero, a row of pill badges, four pastel panels with the same radius, identical bordered cards and chips.

## Techniques used on this page

1. **Real content first.** The first screen shows a real frame that the engine drew (the newsreel), not an illustration of the idea. Good tool sites lead with output: the Manim example gallery puts the rendered picture before the code, and the 3Blue1Brown home page is mostly lesson pictures with short labels.
   Sources: [Manim example gallery](https://docs.manim.community/en/stable/examples.html), [3Blue1Brown](https://www.3blue1brown.com/), [925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide) ("replace stock imagery with real product screenshots").

2. **A concept that comes from the product.** Lemo-Opuscar presents its styles as award nominees, so the page has its own voice. This page borrows from the newsreel style that it shows: a left-aligned masthead with a double rule and a dateline, like the newspaper in the frame, and numbered figure captions, like the owner's paper-style pipeline figure with its (a) and (b) panels.
   Source: [Lemo-Opuscar gallery](https://lemomo-ai.github.io/lemo-opuscar/).

3. **Left-aligned, asymmetric layout.** No centred hero, no badge row, no stat banner. The text column and the picture column have different widths (5 : 7). Section headings sit in a narrow left column and the content sits in a wide right column, as in a printed report.
   Source: [Krebs](https://adriankrebs.ch/blog/design-slop/) (centred hero, badge above the H1, stat rows).

4. **One role for each typeface.** Newsreader (a serif with optical sizes) for the masthead and headings, IBM Plex Sans for body text, IBM Plex Mono for file names, commands and style names. The frames themselves label things in a monospace font, so the mono text on the page matches them. The page does not use Inter everywhere, and it avoids the new defaults that the studies list (Space Grotesk, Instrument Serif, Geist, a single italic accent word).
   Sources: [925 Studios](https://www.925studios.co/blog/ai-slop-design-tells), [Krebs](https://adriankrebs.ch/blog/design-slop/).

5. **Readable body text.** Body text is 17 px with a line height of 1.55, and paragraphs stop at about 64 characters a line. Butterick gives 15 to 25 px on the web, 120 to 145 % line spacing and 45 to 90 characters a line.
   Sources: [Butterick, summary of key rules](https://practicaltypography.com/summary-of-key-rules.html), [Butterick, line length](https://practicaltypography.com/line-length.html).

6. **Restrained colour with fixed roles.** Warm paper, warm ink, hairline rules and one signal red. The red is the colour of the fix loop in the pipeline figure, and it marks links and figure numbers only. No gradients, no glows. The frames give the page its colour. One dark band (like a light table) holds the sample frames so that the light frames stand out.
   Sources: [925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide) (colours named by purpose), [Stripe style reference (Refero)](https://styles.refero.design/style/48e5de76-05d5-4c4e-a269-c7c245b291ec) (restrained colour, hairline rules).

7. **Rules and rows, not cards.** Lists are lists. The pipeline steps, the reviewer agents and the music tracks are rows split by 1 px rules. The 29 styles are an index with one line each, like the plain dated list on Bartosz Ciechanowski's archive page, not a cloud of chips.
   Sources: [Ciechanowski archives](https://ciechanow.ski/archives/), [Krebs](https://adriankrebs.ch/blog/design-slop/) (identical feature cards, coloured card borders).

8. **Varied rhythm.** The sample frames sit in a row of two large pictures and then rows of three. Sections change between paper and the dark band. Spacing changes with the weight of the content.
   Source: [925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide) (uniform sizing).

9. **Specific copy.** Each sentence states a fact from the repo: 72 BPM, a 320 × 180 canvas, `make check`, NVENC, 48 kHz. Test: if a sentence could describe a different product, rewrite it. Each section links to the repo file that holds its facts.
   Source: [925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide) ("if the copy would make sense on a competitor's site, rewrite it").

10. **Motion only for state.** The page has no scroll or entrance animation. Only links and focus rings change, so that the frames are the only things that move the eye.
    Source: [925 Studios](https://www.925studios.co/blog/ai-slop-web-design-guide) (purposeful motion only).

## Rules for later edits

- Keep all text in ASD-STE100 Simplified Technical English: short sentences, active voice, sentence-case headings, no em dashes.
- Do not add numbers, users or features that are not in the repo.
- Check the page at 1280 px and at 390 px (16 px gutter, no sideways scroll) after each change.
