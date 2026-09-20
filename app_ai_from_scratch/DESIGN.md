---
# gstack: design-md-format=spec
name: IA desde cero
description: A signed scientific plate. The rigour of a specimen book with a person's hand and a date on every entry.
colors:
  primary: "#0A5AD6"
  on-primary: "#FFFFFF"
  surface: "#FFFFFF"
  background: "#F2F2F2"
  text: "#000000"
  text-muted: "rgba(0,0,0,.66)"
  text-faint: "rgba(0,0,0,.58)"
  hairline: "rgba(0,0,0,.22)"
  hairline-soft: "rgba(0,0,0,.08)"
  fill: "rgba(120,120,128,.20)"
  accent: "#0A5AD6"
  accent-hover: "#0847A8"
  success: "#0C6B3E"
  warning: "#8A5000"
  error: "#C21B12"
typography:
  display:
    fontFamily: Bricolage Grotesque
    fontWeight: 800
    fontSize: clamp(34px, 6.6vw, 74px)
    letterSpacing: -0.045em
    lineHeight: 0.94
  body:
    fontFamily: -apple-system, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', system-ui, sans-serif
    fontSize: 1rem
    lineHeight: 1.5
  label:
    fontFamily: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace
    fontSize: 0.656rem
    letterSpacing: 0.14em
  mono:
    fontFamily: ui-monospace, 'SF Mono', SFMono-Regular, Menlo, monospace
    fontFeature: tnum
rounded:
  sm: 0px
  md: 0px
  lg: 0px
  full: 9999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  2xl: 64px
components:
  button-primary:
    backgroundColor: "#000000"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "#0847A8"
  input:
    borderColor: "{colors.hairline}"
    rounded: "{rounded.sm}"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
  nav-link:
    textColor: "{colors.text}"
---

# IA desde cero

## Overview

**Creative North Star:** A signed scientific plate — keep the rigour of the specimen
book this product already is, and put a person's hand and a date inside it.

**Product context:** A hands-on platform for learning to use AI, for people with no
programming background, built and taught by one working AI engineer. Spanish first,
bilingual ES/EN. Sold as a monthly subscription (39.990 COP), not a one-off course.
Peers looked at: master.dev (ex Frontend Masters), egghead.io, platzi.com,
joshwcomeau.com.

**Mode per surface:**
- Landing (`web/src/pages/index.astro`) — Persuade.
- Lessons and labs — Read, then Operate.
- Chat, panel, profile, admin — Operate.
- The twelve lesson scenes — Experience.

**The problem this system answers.** The billing is already recurring. The page was
not. It sold a finished artefact ("CURSO · 12 LECCIONES", "Fundamentos Vol. 1") with a
headline about a pain you cure once. Cured, cancelling is the rational move, and
month two is where a product like this dies. The design has to make continuity
credible with one course in the catalogue, no usable social proof, and no committed
publication frequency.

**Key characteristics:**
- Dated. Entries carry real dates; the page states when it was last updated.
- Signed. One named person, in the first person, once.
- Ruled, not boxed. Hairlines and a left-ruled single column carry structure.
- Monospace is the language of data: dates, tags, section marks, prices, labels.
- Accent appears in exactly four places, and nowhere else.

## Colors

**Strategy:** Restrained — one accent over neutrals; colour is rare and means something.

**These tokens are not new.** They are the ones already in
`web/src/lib/theme-css.ts`, documented here for the first time. This file does not
invent a palette, and a redesign that proposes one is out of scope until someone
decides to repaint all 31 pages.

**Nothing enforces this.** There is no lint gate on `main` that fails a build over a
hardcoded hex — `pnpm verify` runs `scripts/verify.mjs`, and no check for colour
literals exists in it. A `check-theme-literals.mjs` lives in uncommitted work on
another branch and was assumed here to be landed; it is not. Until it lands, the
token discipline is convention, held up by review, which is exactly the kind of rule
that rots quietly. Treat that as an open task, not a solved problem.

**Light or dark:** Light ("paper") is the default because the product is read, often on
a phone, often in daylight, and because the plate aesthetic is a paper aesthetic. Dark
is fully supported and hand-calibrated — it is not an inversion. Status colours are
redrawn per theme (`#0C6B3E` on paper becomes `#30D158` on black) so contrast holds on
both grounds rather than tracking the same hue through a filter.

**Where the accent is allowed.** Four places, and a fifth is a bug:
1. Links.
2. The rule above a call to action.
3. The PASS state of a lab.
4. The most recent entry in the log.

Everything else is black, white, and the greys between them. The accent means
"something happened here", so spending it on decoration spends the signal.

## Typography

**Display — Bricolage Grotesque, weight 800, self-hosted.** The one addition. Its
drawing is deliberately irregular, so it reads as set by a person rather than issued by
an operating system, which is the whole argument of the page. Verified in session: the
served `latin` subset (`U+0000-00FF`) covers every Spanish glyph this product needs —
`á é í ó ú ü ñ Ñ ¿ ¡ « » —` — so one file covers the language.

**Cost, measured, not estimated:**

| build | latin subset |
| -- | -- |
| variable, 3 axes (`opsz`,`wdth`,`wght`) | 128.2 KB |
| variable, `opsz` only, w800 | 38.0 KB |
| **static w800** | **21.3 KB** |

The static instance ships. The variable axes are an elegant argument that costs six
times as much, and this page does not spend them: labels and data are monospace, so the
second optical size has no job. For reference, the whole landing HTML is 53 KB.

**Loading.** Self-host the single `.woff2` (SIL OFL permits it) rather than linking
Google Fonts: one request to our own origin instead of a DNS and TLS handshake to two
new ones, and it keeps working inside the Docker image with no outbound network.
`font-display: swap`, and `<link rel="preload">` the one file, because the h1 is the
first thing anybody reads.

**Body and UI — the Apple system stack, unchanged.** Operate and Read surfaces keep it
deliberately: zero bytes, already calibrated, and it is the native register for a
product that people use rather than admire. This is the documented exception to the
rule that a system stack is a typography surrender: it applies to the display voice,
and the display voice is now a real face.

**Data — `ui-monospace` with tabular numerals.** Dates, tags, section marks (`§ 01`,
`FIG. 01`), prices, and every label. The monospace is not decoration, it is the
notation of the plate.

**Scale.** Display and body differ by more than a weight: `clamp(34px, 6.6vw, 74px)`
against 17px. Nothing sits a step apart from its parent.

## Layout

One column, ruled on the left, measure capped at 68ch. Nothing is centred. The page
keeps its asymmetric rhythm: sections differ in height because their content differs in
weight, which is the opposite of the cookie-cutter section loop.

**Section order, and what each one has to prove:**

| § | Section | Proves | Evidence on screen |
| -- | -- | -- | -- |
| — | Dateline | This page is maintained | `última actualización <fecha real>`, from real data |
| 1 | Hero | Someone is inside | First person, and the newest log entry with its real date pinned underneath |
| 2 | El registro | Continuity already happened | Reverse-chronological dated entries, tagged, newest in accent |
| 3 | Quién está dentro | The named person exists | One documentary photograph, once, with a mono caption |
| 4 | Especímenes | You learn by doing | The tokenizer and the temperature slider, already built |
| 5 | Índice | What is in the notebook today | The twelve lessons, demoted from "the product" to "the current state" |
| 6 | El harness | The tool is alive | The creator's own Claude Code setup, promoted out of a small BONUS label |
| 7 | Acceso | No trap | Price, renewal, and the cancellation path at the same size |
| 8 | FAQ | The real objections | Already asks about subscription, cancelling and auto-renewal |

**The mechanism, stated plainly.** The log replaces a claim about the future with a
record of the past, plus an invitation to check again. It is the only honest way to sell
permanence with one course and no promised cadence, and it is the only section a
subscriber can re-verify in month two, which is exactly where this product dies.

Two rules keep it honest. **No future dates, ever** — the moment "próximamente" appears
the log stops being evidence and becomes a promise. And **it is generated from real
platform data**, never hand-written, because a hand-maintained changelog is the first
thing to go stale.

## Elevation & Depth

There is almost none, and that is the system. Depth comes from hairlines and from the
paper ground, not from shadow. Where a surface must lift, it lifts with `--panel`
against `--bg` and a `--hair` border. No zero-offset coloured halo on dark: a glow is
decoration wearing depth's clothes.

## Shapes

Square. `rounded.sm/md/lg` are all `0px` on purpose — a plate has corners. `full` exists
for the one round thing on the platform, the progress ring. A nested radius would equal
the outer radius minus the gap, but there are no nested radii here because there are
almost no boxes.

## Components

**Call to action — a cut in the document, not a button.** A 2px accent rule spanning the
text column, with the label on it. It names the outcome (`Empieza la lección 01 —
gratis, sin tarjeta`), never "Empezar" alone. Hover deepens the accent to
`accent-hover`; `:focus-visible` shows a 2px outline offset by 5px; disabled drops to
`text-faint` and `cursor: not-allowed`, and the DOM keeps it so the layout never jumps.

**Log entry.** Three columns on desktop (date · tag · text), stacked on mobile below
700px. The newest carries the accent on both its date and its tag border. Empty state
is not decorative: if there are no entries, the section does not render at all — an
empty log is worse than no log.

**Tag.** A hairline box, monospace, uppercase, tracked. Never a filled pill, never a
rounded chip.

**Lock / paywalled states** already exist and stay as built: `role="note"`, a real SVG
padlock, the composer disabled from the server, and no way to dismiss the notice.

## Do's and Don'ts

- **Do** put a real date on anything claiming to be recent.
- **Do** keep the accent to its four jobs.
- **Do** write labels, dates and numbers in monospace, uppercase, tracked.
- **Do** design the empty, loading, error and long-content states with the component.
- **Do** state the cancellation path at the same size as the price.
- **Don't** use a statistic. Not one. The product teaches people to distrust
  confident-sounding numbers, and an invented "12.000 alumnos" refutes the thing it is
  selling.
- **Don't** add testimonials, stars or avatars. The page says so out loud instead:
  *"No te voy a mostrar testimonios. Te muestro el producto funcionando y lo que he
  cambiado adentro."* Revisit only when real students give real permission.
- **Don't** promise a publication frequency. The operations brief commits to
  "incluidos mientras el acceso esté activo" with "sin frecuencia de publicación
  comprometida", and the copy must not outrun it.
- **Don't** write "ACTUALIZACIONES · INCLUIDAS" unqualified. It already forced one
  terms rollback. It reads "mientras tu acceso siga activo" or it does not ship.
- **Don't** say "cursos" in the plural as if a catalogue existed. One course today, and
  what gets published later enters your access.
- **Don't** reach for the category's tempting catalogue entries: the three-card icon
  grid, the logo strip, the countdown, the crossed-out price, the stat row under the
  hero.

## Motion

- **Approach:** intentional. Entrances that aid comprehension, nothing that performs.
- **Easing:** enter `ease-out`, exit `ease-in`, move `ease-in-out`.
- **Duration:** micro 50-100ms, short 150-250ms, medium 250-400ms, long 400-700ms.
- **The one authored moment:** the intro that builds the monogram out of particles, on
  first visit only. It already skips on `prefers-reduced-motion`, on a missing GSAP, and
  on a session flag.
- **Open defect, fix with this work:** `index.astro:944` (`initScroll`) never checks
  `prefers-reduced-motion`, so a visitor who asked for less motion still gets 26 fade-up
  entrances and a scrubbed parallax on the cover. `runIntro` checks it at
  `index.astro:902`; `initScroll` must too. Content is not hidden by this — elements
  are born at `opacity: 1` and GSAP sets them to 0, so a missing bundle fails safe.

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-19 | Design system documented, not invented | The palette, themes and spacing already existed in `web/src/lib/theme-css.ts` and were undocumented. Repainting 31 pages was out of scope and was not asked for. |
| 2026-09-19 | Bricolage Grotesque w800 added for display only | The display voice was `-apple-system`, which reads as an operating system, not a person — and "there is someone inside" is the one thing the page must say. Static instance at 21.3 KB over the variable build at 128.2 KB, both measured. |
| 2026-09-19 | The dated log becomes the spine of the landing | Two independent design proposals converged on it without seeing each other. It is the only mechanism that makes continuity credible with one course, no usable social proof, and no committed cadence. |
| 2026-09-19 | No statistics, no testimonials, said out loud | The product's entire thesis is that AI fabricates confident-sounding figures. Borrowed credibility would refute the argument being sold. |
| 2026-09-19 | The cancellation path prints next to the price | Adopted from the independent Claude proposal. Somebody who knows the exit is easy stops rehearsing it, and it is the strongest available signal that the operator expects them in month three. |
