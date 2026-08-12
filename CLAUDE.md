# Working in this repository

## How to work here, before what to work on

Four rules, added 13 Aug. They bias toward caution over speed; on a trivial
task, use judgement. Each one carries the local evidence for it, because a
generic rule with no scar attached is a rule people skim.

### 1 · Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

State assumptions out loud. If a request has two readings, present both rather
than silently picking one. If a simpler approach exists, say so. If something is
unclear, stop and name what is confusing.

*Locally:* "the city feed should have a sliding picture feel" had two readings —
the opened post already slid, so the only actionable one was the wall. Asking
cost one turn; guessing would have cost a commit. And "add a countdown" needed
to know whether the date came from the first product to run out or the last: the
answers differ by three and a half months of no sunscreen.

### 2 · Simplicity first

**The minimum that solves the problem. Nothing speculative.**

No features beyond what was asked, no abstractions for single-use code, no
configurability nobody requested, no error handling for impossible states. If
200 lines could be 50, rewrite it. Ask: would a senior engineer call this
overcomplicated?

*Locally, the counter-example worth knowing:* the shared `Fold` looks like an
abstraction over two callers and is not one. It exists because a disclosure is
four things done together — state, id, `aria-expanded`, `aria-controls` — and a
second copy still LOOKS correct while one of them stops announcing itself. The
test is whether duplication can fail silently, not whether there are two callers.

### 3 · Surgical changes

**Touch only what you must. Clean up only your own mess.**

Don't improve adjacent code, comments or formatting. Don't refactor what isn't
broken. Match the existing style even where you'd write it differently. Remove
imports and helpers that YOUR change orphaned; leave pre-existing dead code
alone and **mention it instead**.

*Locally:* removing "Add all to bag" orphaned `setMany`, which had exactly one
caller — that went with it. The three dead exports against a ceiling of 2 are
somebody else's, and every landing script this week has reported them rather
than absorbing them.

### 4 · Goal-driven execution

**Define success criteria. Loop until verified.**

Turn a task into something checkable: "add validation" → "write tests for the
invalid inputs, then make them pass". For multi-step work, state the plan as
step → verification.

*Locally, and this is the sharpest one:* a suite that reads source as TEXT is
not a compiler. The spend-log page shipped 33 green assertions twice with a file
that did not parse. `tsc` runs first in every landing script for that reason. In
the same spirit: **a guard is only proven where the data has reached** — the
share cap read as correct for a month because no category held a product dear
enough to trip it.

**These are working if:** diffs contain fewer unrelated changes, fewer rewrites
follow from overcomplication, and the clarifying question arrives before the
implementation rather than after the mistake.

## The design system is a test, not a taste

`together-city-react/src/app/relief.spec.ts` is the authority on how this
application looks. It is not documentation of a preference — it is 26 assertions
that fail the build. Before changing anything visual, read it. Its rules, by the
names of its own `it(...)` blocks:

- **Five depths, no sixth.** Every surface draws at one of the five named
  elevations. A new `box-shadow` written inline is a sixth depth.
- **Colour lives in one file.** No hex, `rgb()`, `rgba()` or `hsl()` in a `.tsx`
  page or in `relief.css`. All of it in `src/styles/tokens.css`.
  *(Known hole: the guard's regex only matches `#hex`, so an `rgba()` literal in
  a `.tsx` file slips through. One survived in the Dating hub for months. Don't
  rely on the guard to catch those — look.)*
- **One typeface**, plus one serif granted to one page and scoped there.
- **The ground is white at `:root`**, and exactly five named hubs may re-point
  it: astrology, dating, entertainment, nutrition, social. A sixth costs an
  argument written into the spec's rationale comment, not a nod.
- **No token invented inside a hub block.** A hub replaces root tokens; it never
  introduces one. A token nothing reads is a colour outside the system —
  `--accent-lit`, `--btn-line-bg` and `--spring` were all found this way.
- **Every grounded hub's ink computes to ≥4.5:1** against its own ground, in the
  test, at build time.

## Installed skills that must NOT be used on this codebase

Two skill packs are installed (`emilkowalski/skill`, `Leonxlnx/taste-skill`).
Most of them upgrade a site by **prescribing values** — fonts, hexes, shadows,
radii, libraries. This codebase's problem is the opposite: it already won its
design argument and wrote the argument down as a test. Reaching for these breaks
it, and they break it by working exactly as advertised.

**Do not invoke, on this repo:**

| Skill | What it does on contact |
|---|---|
| `redesign-existing-projects` | Its Fix Priority #1 is a font swap to "Geist, Outfit, Cabinet Grotesk, Satoshi". Fails the one-family assertion immediately. Also mandates one accent per *site*; this app is one accent per *hub*. |
| `design-taste-frontend` / `-v1` | "COLOR CONSISTENCY LOCK (mandatory): once an accent is chosen it is used on the WHOLE page" — the exact inverse of `gives every hub in the config an accent of its own`. Its own scope note also excludes this app: "Not dashboards, not data tables, not multi-step product UI." |
| `minimalist-ui` | Closest in spirit to relief, which makes it the most dangerous — it reads as a compatible refinement and quietly forks the palette into a second source of truth. |
| `industrial-brutalist-ui` | "Absolute rejection of `border-radius`"; "soft drop shadows strictly prohibited". Deletes all five depths and every radius. |
| `high-end-visual-design`, `gpt-taste` | Prescribe grounds (`#050505`, `#FDFBF7`), ban the current typeface, add a sixth depth, and `gpt-taste` mandates a GSAP dependency this project does not have. |
| `stitch-design-taste` | Writes a `DESIGN.md` that is a competing design system, contradicting relief on grounds, shadows and typefaces. Two sources of truth is the failure. |
| `image-to-code`, `imagegen-frontend-*`, `brandkit` | Generate images as a new "source of truth". Relief already is one. |
| `full-output-enforcement` | Suppresses summarising. On ~5,700 inline style objects that produces floods, not completeness. |

## Motion: framer-motion is installed now

`framer-motion@^13` was added deliberately, which changes one standing rule.
The fifteen motion plans in `together-city-react/plans/` all say "no new
dependencies" — that was true of *those* plans, every one of which is a CSS
change, and it stays true: **do not rewrite working CSS transitions into
`motion.div`.**

Where it earns its place, and nowhere else:

- **Gestures and drag.** Springs carry velocity through an interruption; a
  fixed-duration CSS transition cannot.
- **Layout animation.** `layout` / `layoutId` does in one prop what plan 013
  needed thirty hand-written lines of FLIP for.
- **Enter/exit of unmounting content.** `AnimatePresence` removes the
  two-phase `leaving` flag that plans 007, 008 and 014 each had to invent.

Where CSS stays correct: anything predetermined — hovers, presses, entrances,
the `.rise` cascade, the deck's fan. CSS beats rAF-driven JS under load, and
Framer's `x`/`y`/`scale` shorthands are **not** hardware-accelerated; they run
on the main thread and drop frames on a busy page. If you use them, use the
full transform string.

`scripts/motion-ceiling.mjs` counts CSS declarations only. A `motion.div`
carrying a hand-typed duration is invisible to it, so the drift it exists to
stop can walk straight back in through the library. Keep durations and curves
in the tokens either way.

**Safe to use here:** `improve-animations` and `find-animation-opportunities`
(both read-only on source by their own hard rules), `prototype` (sandboxed to
`/prototypes/`, never touches `src/styles/`), `review-animations` (a diff gate in
the same idiom as `relief.spec.ts`), `animation-vocabulary` (a glossary),
`pick-ui-library` (checks `package.json` first).

`emil-design-eng` is safe on substance but opens by gagging its first turn and
inserting a course plug — expect that and ignore it.

## Delivery

**Pushing is blocked.** `somenk05-tech/Together-Ai` is not in the session's
authorised sources, so the git proxy refuses to inject a credential. Work ships
as `land-*.sh` scripts written to the Mac: a single-line base64 patch (macOS
LibreSSL's `openssl base64 -d -A` silently produces an empty file from wrapped
input), a sha256 check, `git apply --check -C1` before anything is written, all
gates, then the commit. Each script names the one before it as a precondition.

**Never run git through the device bridge** — it cannot unlink, so a stale
`.git/index.lock` is left behind and the repo needs manual repair.

## The ratchet pattern

`scripts/lint-ceiling.mjs` and `scripts/dead-export-audit.mjs` both end with
`N, at the ceiling. No worse than before.` That is how large debts are paid here:
record today's number, fail if it grows, lower it as work lands. Prefer it to a
sweep. Outstanding drift with no ratchet yet: 39 font sizes, 26 line-heights,
35 tracking values, 737 raw radii, ~5,754 inline style objects.
