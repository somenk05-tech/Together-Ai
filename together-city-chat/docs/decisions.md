# Open product decisions

Every item here is a decision only you can make. Each one is a real fork found
while building — not a hypothetical — with what the code does today, what the
options cost, and a recommendation where I have one.

Last updated 2026-07-29.

---

## Blocking, or close to it

### 1. Which OCR provider reads a prescription

**Today:** none. `ManualEntryExtractor` reads nothing and claims no confidence,
so every upload lands in `review_required` and the citizen types what the paper
says. That is deliberate — inventing a plausible medicine name would be far
worse than admitting we cannot read it — and the feature is fully usable this
way.

**The decision:** whether to connect a vision model or a specialist medical-OCR
service, and who is liable when it misreads a dose. Swapping it in is one line
(`{ provide: PrescriptionExtractor, useClass: … }`); the review flow stays either
way, because no reader is ever fully trusted.

**Recommendation:** ship with manual entry. It is honest, it works, and it makes
the accuracy question a later, smaller decision instead of a launch blocker.

### 2. Deleted accounts are never purged

**Today:** `deleteAccount` soft-deletes — anonymises the name, nulls the email,
tombstones the handle, deletes posts, follows and connections, revokes sessions.
The row then stays forever. **There is no hard-delete job.** The brief specified a
30-day retention window; the retention sweep that exists (`GRACE_DAYS = 7`)
covers spent credentials, not accounts.

**The decision:** the retention window, and what "purge" means for rows other
people can still see — a group chat someone left, a family meal plan they
created.

**Recommendation:** decide this before launch rather than after, because it is
much harder to delete data you have already promised to keep than the reverse.
A GDPR/DPDP request would currently have no automated answer.

### 3. Nutrition targets are not clinically signed off

**Today:** `RELEASE-GATE.md` still lists "clinician sign-off on targets, caps and
supplement logic" as a Phase-4 requirement, and calorie adherence is at 68.2%
within ±10% against a ≥90% gate. The clinical safety gates (allergen leaks, diet
violations, supplement contraindications) all pass at zero.

**The decision:** whether the hub ships with the "not certified for unsupervised
clinical use" caveat visible, or waits.

---

## Design choices worth confirming

### 4. Dating chat is paid, and a match does not open one

A mutual like creates a match; opening the chat is a separate Connect to Chat
step, free for the first three then ₹199. So there is a state — matched, not
connected — where two people have chosen each other and cannot talk. Both screens
now surface it clearly, but it is a revenue decision, not a bug, and I did not
change it.

**If you want a match to open the chat immediately**, that is one change in
`like()`.

### 5. Pseudonyms are per-person, not per-conversation

`nickname()` is deterministic on the user id, so somebody shows the *same*
pseudonym in every dating chat. Good for consistency within a thread; it means
two matches comparing notes would recognise the same name. Per-conversation
would fix that and would also mean the name changes if a chat is ever recreated.

### 6. Chat deletion is per-participant

`DELETE /api/chat/:id` clears the thread for the person who asked and leaves
everyone else's copy intact. The alternative — an owner deleting for everyone —
was not built, deliberately. Confirm this matches what you want for group chats.

### 7. The health score saturates at 0

Penalties are summed and clipped, so a plan that is very over its caps and one
that is catastrophically over both read 0/100. The number is honest; it just
cannot distinguish degrees at the bottom. Every alternative curve shifts *every*
score in the hub, and the RELEASE-GATE thresholds are calibrated against this
one, so it should be changed deliberately with the numbers in front of you — not
as a side effect.

### 8. How a kidney condition gets inferred

A profile seen during this session had renal caps applied (sodium 2000,
potassium 3000, phosphorus 1000 — the `ckdEarly` rule), which drove both the
score and which foods the planner would pick. Those caps come from `conditions`,
which can be set from bloodwork. **Worth tracing how a citizen acquires a kidney
diagnosis in this system**, because if it can be inferred too readily, the app is
restricting people's food on a diagnosis they do not have.

---

## Infrastructure decisions

### 9. There is no test database, so isolation is proven only structurally

`src/security/` proves, from source, that every route is authenticated, that every
id-taking handler receives the current user, and that every query against a
citizen-owned table names an owner. None of it executes a query. A runtime suite —
user A creates a full data set, user B gets 403/404 on every resource — needs a
test database, factories and a transactional harness the repo does not have.

**This is the largest untested guarantee in the backend.** The structural guards
are a floor under it, not a substitute.

### 10. Single-instance assumptions

Both cron services (`RetentionService`, `MedicineRemindersService`) assume one
instance, which is what the deployment runs. Scaled out, every replica would run
the same minute. Reminder dispatch is safe under that — it claims each row by
moving `pending → sent` — but the duplicated work would want a lock or leader
election before autoscaling.

### 11. Demo inventory must stay off

Restaurants, entertainment, jobs and travel serve invented catalogues only when
`SEED_DEMO=true`. **Confirm it is unset in production** — with it on, citizens can
pay for bookings that correspond to nothing.

### 12. `npm run lint` is red on main

`DatingProfile.tsx` has 5 pre-existing errors (misused promises, unnecessary
assertions, an unsafe `any`) and the script runs with `--max-warnings 0`. Not
introduced by any recent change, but it means lint cannot currently gate a merge.

---

## Unresolved from the brief itself

### 13. Which pages were being removed

Item 13 of the backend brief ("Remove Pages and Backend Routes") refers to slides
17, 19, 24 and 28 without naming the pages. Nothing has been removed, and
`docs/removed-routes.md` is therefore empty of removals.

**Name the pages and this becomes a small, safe change**: confirm no active
frontend route calls the endpoint, delete the route, keep the model if the data
must be retained, and return `410 FEATURE_DISABLED` for anything deprecated but
still live.

### 14. Two identical blood panels

A Medical Hub screenshot showed two panels a year apart with byte-identical
values across four markers (HbA1c 6.7, Hb 14.8, LDL 132, triglycerides 427).
Either the same report was ingested twice under different dates, or `takenOn` is
being assigned wrongly. Worth checking against the real data before trusting the
trend view.

---

## Still unbuilt

Nothing on the brief. The last two — calls and avatars — landed on 2026-07-29,
alongside beauty routines, the makeup-photo decode, and gems and remedies with
a real catalogue.

Two of them ship with a stated limit rather than a hidden one, and both limits
are money decisions somebody should make deliberately:

### Avatars are drawn, not generated

There is no image model behind avatar creation. A deterministic renderer draws
an SVG portrait from the citizen's catalogue choices — free, instant, nothing
to queue and nothing to moderate. It is a real avatar, and every response says
`generatedBy: 'deterministic'` so no screen can imply otherwise.

Adding a hosted model means one class implementing AvatarProvider and one line
in avatars.module.ts. What it also means is a per-image bill and a moderation
question that the closed catalogue currently answers for free: there is no
free-text input anywhere in the feature, so there is no prompt to abuse. A
model that accepts a photo or a description reopens that, and the answer would
have to be a real one before it ships.

### The one decision calls still need: a TURN relay

Calls are built and work, with one honest caveat that is an infrastructure
decision rather than a code one. The API relays the WebRTC handshake and the
media goes peer to peer, so it never touches this server — which is why calling
is cheap to run. STUN alone (the free public server is the default) is enough
for most home networks. It is not enough for symmetric NAT: some office wifi and
some mobile carriers. Those calls will ring, connect, and stay silent.

Fixing that means paying for a TURN relay — a hosted one (Twilio, Cloudflare,
Metered) or coturn on a small box — and setting `TURN_URL`, `TURN_USERNAME` and
`TURN_CREDENTIAL`. Until then `GET /api/calls/ice` returns `relayAvailable:
false` with a plain-language note, so the frontend can warn a citizen up front
instead of leaving them saying "hello?" into a call that was never going to
connect. That is the decision: pay for a relay, or ship with a stated gap. What
is not acceptable is shipping the gap silently, which is the default every
WebRTC tutorial hands you.
