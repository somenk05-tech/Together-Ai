# Working in this repository

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
