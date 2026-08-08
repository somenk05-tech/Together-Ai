# Animation plans

Produced by `improve-animations deep` against commit `30675c9`.

Recon: no motion library anywhere — every animation in Together City is a hand-written CSS
transition, a CSS `@keyframes`, or an inline `animation:` string in a `.tsx` style object. The
entire motion token set is three durations and two curves at `src/styles/tokens.css:382-384`.
The design system is enforced by `src/app/relief.spec.ts` (26 assertions); **every plan below must
leave it passing**, and several of them depend on it to catch their own mistakes.

## The plans

| # | Title | Severity | Status |
|---|---|---|---|
| 001 | Gate every hover transform behind `@media (hover: hover)` | HIGH | TODO |
| 002 | Retire `--spring`; the component library should not bounce | HIGH | TODO |
| 003 | Bring `.rise` under budget and make `d1`–`d4` real | HIGH | TODO |
| 004 | Stop `tc-pop` scaling a full-width card from 0.4 to 1.15 | HIGH | TODO |
| 005 | Press feedback must shrink, and the touch primitives must have it | HIGH | TODO |
| 006 | Complete the reduced-motion allowlist | MEDIUM | TODO |
| 007 | Collapse a deleted chat message in visible time | MEDIUM | TODO |
| 008 | Give toasts an exit, and stop the stack teleporting | MEDIUM | TODO |
| 009 | Close-then-reopen on the share sheet is a dead button | MEDIUM | TODO |
| 010 | Animate `transform`, not layout, on the two thrashing surfaces | MEDIUM | TODO |
| 011 | Put a ceiling on motion-token drift, then lower it | LOW→HIGH | TODO |
| 012 | Modals teleport while sheets animate | MEDIUM | TODO |
| 013 | Give drag-to-reorder some account of where the tiles went | MEDIUM | TODO |
| 014 | Disclosures should open, not shove the page | MEDIUM | TODO |
| 015 | When a tab changes, the content should say so | LOW | TODO |

## Execution order

**002 first, and alone.** It introduces `--ease-out` at `:root`, which nine of the remaining
fourteen plans reference. Nothing else can land until it has.

Then, in this order:

1. **002** — retire `--spring`, add `--ease-out`. *Blocks: 003, 004, 005, 007, 008, 009, 010, 012, 013, 014, 015.*
2. **001 + 005 together, in one commit.** 001 removes the false-hover lift that touch users
   currently get as their only tap feedback; 005 gives them a real press state. Landing 001 alone
   leaves touch with no feedback at all for however long 005 takes.
3. **003** — `.rise` and the phantom stagger. Independent of 001/005; can run in parallel.
4. **006** — the reduced-motion allowlist. Must come **after** 001, because 001 moves the hover
   rules into `@media (hover: hover)` blocks and 006 needs to read them in their final form.
5. **004** — `tc-pop`. Independent.
6. **007, 008, 009, 010** — the correctness set. Independent of each other and of everything above
   except 002. 009 must land before 011 (it removes two of the easing values 011 counts).
7. **011** — the motion ceiling. **Last of the corrective work**, because it counts easings and
   durations and every plan above changes those counts. Running it earlier means recording a
   ceiling that is immediately wrong.
8. **012, 013, 014, 015** — the additive set. These add motion to an app whose main problem is
   having too much of it, so they should land after the corrective work and be judged on the
   result. 015 is explicitly rejectable at its feel check.

## Dependencies

- 002 → everything (the `--ease-out` token).
- 001 → 006 (006 reads the hover rules 001 restructures).
- 001 ↔ 005 (ship together; see above).
- 009 → 011 (009 removes `cubic-bezier(.16,1,.3,1)`, which 011 counts).
- 007 ↔ 014 (both use the `grid-template-rows: 1fr → 0fr` height idiom; whichever lands second
  should read the first and match it).
- 002 → 011 (002 removes `--spring`, one of the eight easing values).

## Correction — plan 012 shipped onto classes nobody wears

**Plan 012 ("Modals teleport while sheets animate") is landed and does nothing.**
It added `modalOvIn` + `sheetIn` to `.modal-ov` and `.modal` at
`src/index.css:283-296`. Verified after the fact:

    grep -rn "modal-ov" src/ --include=*.tsx   ->   0 hits

Every dialog in this application is a hand-rolled `position:'fixed'; inset:0`
**inline style object** — 16 files, including `components/ui/Modal.tsx`, the
payment sheet, the call centre and the chat starter. None of them carries the
class the plan animated. The finding was right (modals do snap in); the fix
targeted a selector with no wearers, and every gate passed because a rule for
an unused class is perfectly valid CSS. The lesson is narrow and worth keeping:
**a plan that changes a stylesheet must name the component that wears the
class, and the verification must grep for it.**

The repair is not "re-do 012" — it is giving those 16 overlays real class names
so the rules that already exist apply. One pair of names, twelve real dialogs,
no new keyframes.

## Standing constraints for every executor

- **Never invent a colour.** `relief.spec.ts` fails on any hex, `rgb()` or `hsl()` outside
  `src/styles/tokens.css`. Its regex does **not** catch `rgba()` in `.tsx` — do not exploit that.
- **Never invent a sixth shadow depth.** Five named depths exist; use them or use nothing.
- **Never reference an undefined custom property.** The spec catches it; declare new tokens at
  `:root` in `tokens.css` first.
- **No new dependencies.** There is no motion library in this project and none of these plans needs
  one.
- **Run `npx vitest run src/app/relief.spec.ts` before claiming a plan is done.** 26 tests.
- If a plan's cited code does not match what you find, **STOP and report**. Do not improvise.
