# Frontend lint debt — 2026-07-29

`npm run lint` in `together-city-react` has been failing for long enough that
nobody looks at it, which means the script gives no signal: a new error lands in
a sea of old ones and nothing tells anybody. This records where it stands, what
was cleared, and what each remaining category actually costs.

**150 errors across 41 files → 68.** Not green. What remains is real typing
work rather than a sweep, and it is held to a ceiling so it cannot grow (see
the last section).

## Cleared

**`react-hooks/rules-of-hooks` (1) — was a false positive worth fixing anyway.**
`CreatePost.tsx` had a local helper called `usePreset` which is not a hook — it
just calls four setters. The lint rule cannot know that, and neither can a
reader: a `use` prefix is a promise about when a function may be called. Renamed
to `applyPreset`.

**`no-unnecessary-type-assertion` (22) — removed.** Every one was a `!` or an
`as X` that TypeScript could already prove redundant. They are worth removing
rather than tolerating, because a codebase where assertions are routine is one
where the assertion that IS load-bearing goes unnoticed.

**`no-floating-promises` (21) — now explicit.** Almost all were
`qc.invalidateQueries(...)` inside TanStack Query `onSuccess` callbacks:
deliberately fire-and-forget, but written in a way that reads identically to
having forgotten. They are `void`-prefixed now, which is what the rest of the
codebase already did, so the deliberate ones are visibly deliberate.

## Remaining, and what it would take

### `no-misused-promises` (36) — done

Async functions passed where a void return is expected: `onClick={submit}`,
`onSubmit={handler}`. A rejection in one of those becomes an unhandled promise
rejection — nothing crashes, and the person sees a button that did nothing and
said nothing about it.

Every site was checked before it was changed, because the transform depends on
the handler's own signature and the wrong one type-checks while silently
dropping the event:

  - zero-argument handlers → `onClick={() => void submit()}`
  - form handlers taking a `FormEvent` → `onSubmit={(e) => void submit(e)}`,
    which is the case where a careless sweep would have broken
    `preventDefault()` and started reloading the page on every submit
  - two inline async blocks (the account-delete button in Settings, the
    handle-availability debounce in RegisterForm) were extracted and named,
    because a `setTimeout(async () => …)` is a promise nobody is watching
  - `useMealSwapHistory` was being handed an async `mutate` where it declares
    `(fn) => void`

### The `no-unsafe-*` family (57) — the real work, and now the whole remainder

`no-unsafe-member-access` (34), `no-unsafe-assignment` (14),
`no-unsafe-argument` (6), `no-unsafe-return` (3), `no-unsafe-call` (3), plus
`no-explicit-any` (8). These all trace to the same root: values crossing the API
boundary as `any` and then being read field by field.

This is not a lint problem, it is a missing-types problem, and the fix is the
one the codebase already has a pattern for — `src/api/http.ts` parses responses
through Zod schemas, so anything fetched that way is typed all the way down. The
files with the worst counts are the ones that bypass it.

Worst offenders: `features/fitness/pages/Trainer.tsx` (45 before this pass),
`features/nutrition/hooks.ts`, `features/nutrition/pages/Onboarding.tsx`,
`components/CityHeader.tsx`.

### Two parse errors — fixed

`postcss.config.js` and `public/sw.js` were being linted while not in
`tsconfig.json`, so the type-aware parser refused them outright: two "errors"
that were never about the code. Both are in `ignorePatterns` now, along with
`scripts/`.

## The ceiling — do this before any of the above

Fixing forty more errors changes nothing about whether anybody runs the script
while it still reports a hundred. So the count is frozen as a ceiling that CI
enforces:

    npm run lint:ceiling

It fails when the number goes **up**, which holds new code to zero — any error
a change introduces pushes the count past the ceiling — while leaving the
backlog to be paid down whenever somebody is in one of those files anyway.

It also fails when the number goes **down** without the ceiling being lowered.
That looks pedantic and is the entire mechanism: a ceiling nobody ratchets is
just a high number that drifts back up to meet it. When you fix some, run

    node scripts/lint-ceiling.mjs --update

and commit `scripts/lint-ceiling.json`.

Wiring plain `npm run lint` into CI instead would fail every run, which does not
fix anything — it teaches people that a red pipeline is normal, and that is a
worse position than having no pipeline at all.

Same shape as the frozen lists in the API's `src/security/`: a number nobody may
quietly grow.
