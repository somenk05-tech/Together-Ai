# Frontend lint debt — 2026-07-29

`npm run lint` in `together-city-react` has been failing for long enough that
nobody looks at it, which means the script gives no signal: a new error lands in
a sea of old ones and nothing tells anybody. This records where it stands, what
was cleared, and what each remaining category actually costs.

**150 errors across 41 files → 106 across 33.** Not green. The rest is real
typing work, not a sweep.

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

### `no-misused-promises` (36) — an afternoon, mechanical, low risk

Async functions passed where a void return is expected: `onClick={submit}`,
`onSubmit={handler}`. A rejection in one of these becomes an unhandled promise
rejection — nothing crashes, and the person sees a button that did nothing and
said nothing.

The fix per site is `onClick={() => void submit()}`, with care where the handler
takes the event. Deliberately not swept automatically: the transform differs
depending on whether the handler takes arguments, and a wrong one type-checks
while silently dropping the event.

### The `no-unsafe-*` family (57) — the real work

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

### Two parse errors, not code problems

`postcss.config.js` and `public/sw.js` are linted but not in `tsconfig.json`,
so the type-aware parser refuses them. Either add them to the ESLint
`ignorePatterns` or give them their own non-type-checked override. One line
either way; left alone here because it changes lint configuration rather than
code.

## The thing worth doing first

None of the above, actually: **make the script mean something again.** While it
reports 106 errors, fixing 40 of them changes nothing about whether anybody runs
it. The cheap move is to freeze the current count as a ceiling in CI — a lint
run that fails only when the number goes UP — so new code is held to zero while
the backlog is paid down whenever a file is touched for other reasons.

That is the same shape as the guards in `src/security/`: a frozen list nobody
may quietly grow.
