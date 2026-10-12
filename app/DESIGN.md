# Headcount design system: Ballot paper

Hallmark · genre: editorial · theme: custom tuned (vibe: "census ballot, newsprint, ink tally") · paper light / roman-serif / warm accent

The app is a printed ballot. Every screen should look like it came off a newspaper's opinion desk: warm paper, ink, one red pencil. Nothing glows, nothing floats, nothing is a rounded SaaS card.

## Tokens (constants/theme.ts is the only place these values live)

```
color.paper        #F3EEE3   page ground (warm newsprint)
color.paper2       #E9E2D3   pressed rows, inset areas
color.ink          #17150F   text, rules, filled bars
color.ink2         #4A453B   secondary text
color.ink3         #8A8374   captions, disabled text
color.rule         #17150F   hairlines (use at 1px), double rule under masthead
color.tally        #C7361F   the red pencil: the one accent. Checkmarks, Seeker bar, primary action fill, streak
color.tallyInk     #F3EEE3   text on tally
color.ok           #2F6B3A   confirmed state only (answer landed)
color.warn         #A8571B   attention (Seekers-only gate)

font.display       Newsreader (600, 700) roman only. Questions, masthead, big numbers in results
font.mono          IBM Plex Mono (400, 500, 600). Labels, buttons, counts, addresses, metadata

text.masthead      Newsreader 700, 22, letterSpacing 2, UPPERCASE
text.question      Newsreader 600, 30/34 (short questions), 26/30 (> 60 chars)
text.option        Newsreader 500, 20/26
text.body          Newsreader 400, 17/24
text.label         IBM Plex Mono 500, 12, letterSpacing 1.2, UPPERCASE
text.count         IBM Plex Mono 600, 15, tabular
text.bigNumber     Newsreader 700, 56/56, tabular

space              4 8 12 16 24 32 48 64
radius             0 everywhere (paper has corners). Exception: tally checkbox 2
border             1px ink rules; masthead uses a double rule (2px + 3px gap + 1px)
```

Fonts via `@expo-google-fonts/newsreader` and `@expo-google-fonts/ibm-plex-mono`, loaded in the root layout before hiding the splash.

## Signature moves (these are what make it Headcount)

1. **Masthead**: wordmark HEADCOUNT left, right side `OCT 12 · №<issue>` in mono, where issue = number of polls you have answered + 1. Double rule underneath. Every screen starts with it.
2. **Ballot rows**: an option is a full-width row separated by 1px ink rules (no boxes, no cards). Left: a 22px square tally box. Tapping draws an ink check (animated stroke, 180ms) in tally red and the row ground shifts to paper2. One choice at a time.
3. **Cast**: primary action is a full-width ink-filled bar with mono label `CAST ANSWER · +5 SKR ▸`. Pressed: tally red fill. Loading: label becomes `COUNTING…` with an ink tick-mark row that fills left to right (5 marks, the fifth slashes across the four: real tally marks).
4. **Results print**: after answering, the ballot flips to a results strip per option: option text, then two horizontal bars printed as hatched ink: `SEEKER PHONES` bar in tally red, `ALL ANSWERS` bar in ink. Percentages in mono at the right. Bars grow from 0 with a 400ms ease-out once. The gap between the two bars is the story: label it "bot gap" when the two differ by more than 10 points.
5. **Receipt**: answer confirmation is a torn-paper receipt block (zigzag top edge drawn with an SVG path) listing: poll, choice, reward `+5.00 SKR`, short signature linking to the explorer. Haptic success on land.
6. **Tally counts**: answer counts render as tally marks for numbers up to 20 (groups of five), mono digits above.

## Screens

- **Today**: masthead, one-line standfirst in body serif ("Every answer here comes from a different phone. Answer, get paid in SKR."), then polls as a newspaper column: question in display serif, a mono meta line `5 SKR · 197 LEFT · CLOSES IN 6D · SEEKERS ONLY`, a rule between polls. No cards.
- **Poll**: masthead, question, ballot rows, cast bar pinned to bottom with safe-area padding. Seekers-only polls show a mono stamp `SEEKER PHONES ONLY` boxed in tally red at the top right of the question, slightly rotated -2deg like an ink stamp.
- **Not a Seeker** (tier 0 on seekers-only): a printed notice. Headline "This ballot counts phones, not wallets." Body explains the Seeker Genesis Token in two sentences. Action: `SEE OPEN POLLS`.
- **Create**: a form that looks like a ballot being drafted: question field is the display serif on a ruled line, options are ruled lines with mono numbering, reward and max answers in mono, the Seekers-only toggle is a tally box with label. Total cost line printed under a rule: `TOTAL 1,000.00 SKR`.
- **Me**: your record. Big number (polls answered) in display, streak as tally marks, earned SKR in mono, list of answered polls as receipt lines.

## States (every pressable)

default · pressed (paper2 ground or tally fill) · focus (2px tally outline, no animation) · disabled (ink3 text, no fill) · loading (tally-mark progress) · error (warn text under the row with the reason in plain words) · success (ok check + receipt).

## Motion

Only: the check stroke (180ms), bar growth (400ms ease-out, once), receipt slide-up (240ms). Respect reduced motion (Accessibility.isReduceMotionEnabled): skip to end state.

## Copy voice

Short, declarative, newsroom. Verbs on buttons. Never "Oops", never "No data". Empty Today: "No open ballots right now. Draft one, or check back after the next issue." Errors name what happened and what to do.

## Bans

No gradients. No shadows. No rounded cards. No italic anywhere in headings. No emoji icons. No stat-grid of four tiles. No em dashes. No Inter. No purple. No glassmorphism. Icons: none, or simple stroked glyphs in ink at 1.5px.
