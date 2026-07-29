# Manual QA — new citizen smoke test

Written to be run by somebody who does not read the code. Ten minutes, in order,
on a **fresh account**. Every step says what should happen; if it doesn't, stop
and record the step number.

Set `BASE` to the environment under test (`https://togethercity.app`, or
`http://localhost:5173` locally). The API lives at `https://api.togethercity.app`.

---

## A · Getting in (2 min)

| # | Do this | Expect |
|---|---|---|
| 1 | Sign up with a **real external address** you can open — Gmail, Yahoo, anything not on the app's own domain | Account created. A verification email arrives **at that address**, not at an admin inbox |
| 2 | Before verifying, try a hub | You are told to confirm your email. Nothing private loads |
| 3 | Click the verification link | Account active |
| 4 | Open your profile | **Empty.** Name, photo, details all blank; completion is low, not 100% |

> Step 4 is the one that has failed before. A brand-new account showing somebody
> else's data, or a full profile, is a **stop-everything** result — note it and
> escalate rather than continuing.

## B · The isolation check (2 min) — the most important test here

| # | Do this | Expect |
|---|---|---|
| 5 | In the first account, save something identifiable — a thought at `/thoughts`, say "ABC123" | Saved |
| 6 | Log out. Sign up a **second** account in the same browser | New empty account |
| 7 | Open `/thoughts` | **Empty.** "ABC123" must not appear anywhere |
| 8 | Open Nutrition, Medical, Dating, Chat in turn | All empty. No meal plan, no records, no matches, no conversations |
| 9 | Log out, back into the first account | "ABC123" is still there |

## C · Nutrition (2 min)

| # | Do this | Expect |
|---|---|---|
| 10 | Fill in the food preferences, including at least one **allergy** | Saved |
| 11 | Generate a weekly meal plan | 7 days of meals. Nothing contains your allergen — check every day, not just the first |
| 12 | Swap one dinner | It changes and stays changed on reload |
| 13 | Reload the page | **Your swap is still there.** The plan does not regenerate itself |
| 14 | Open the grocery list | Items grouped, quantities present, nothing you already have in the pantry double-bought |

## D · Medical (1 min)

| # | Do this | Expect |
|---|---|---|
| 15 | Upload or enter a blood report | It parses; a panel appears |
| 16 | Look at "Your health over time" | The panel count matches how many you have entered |
| 17 | Delete the report from Health Records | It disappears from the records list **and** the panel count drops immediately — not after a wait |

## E · Medicines (2 min)

| # | Do this | Expect |
|---|---|---|
| 18 | Go to `/medical/medicines`, start a prescription | An empty prescription, asking you to add medicines |
| 19 | Try to confirm it with nothing in it | Refused, with a reason |
| 20 | Add a medicine — name, dosage, frequency `1-0-1` | Appears with times 09:00 and 21:00 |
| 21 | Confirm | Reminders set. Your medicine and its schedule are listed |

## F · Dating (1 min, needs two accounts)

| # | Do this | Expect |
|---|---|---|
| 22 | Complete a dating profile on both accounts | Curated Matches shows the other |
| 23 | Like from account A only | A sees "waiting for them"; **B is not told who liked them** beyond a generic nudge |
| 24 | Like back from B | Both see "It's a match" and the person stays on the Curated Matches page |
| 25 | Open Dating Chats | The match is listed, with Connect to chat |
| 26 | Open the **main** Chats (not dating) | The dating conversation is **not** there. It never appears in main Chats |

## G · Winding down

| # | Do this | Expect |
|---|---|---|
| 27 | Delete the second account from settings | Requires your password |
| 28 | Try to log back into it | Refused |
| 29 | From the first account, look anywhere the deleted person appeared | Shown as a deleted citizen. No name, no photo, no email |

---

## Error codes you may see

| Code | Means | Normal to see when |
|---|---|---|
| 401 | Not signed in, or the session expired | After logging out, or a very old tab |
| 403 | Signed in but not allowed | Opening a hub you have no grant for |
| 404 | Missing **or** somebody else's | Guessing an id. This is deliberate — it should not say "forbidden" |
| 409 | Conflicts with something | Signing up with an email already used |
| 422 | The form is wrong | A bad date, a missing field |
| 429 | Too fast | Rapid repeated requests |

A **500** is never normal. Record what you did and the time.

---

## Reproducing any of this with curl

```bash
BASE=https://api.togethercity.app

# Sign in and keep the token
TOKEN=$(curl -s -X POST $BASE/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"handle":"you","password":"..."}' | jq -r .accessToken)

AUTH="authorization: Bearer $TOKEN"

# Step 4 — a new account's profile should be empty
curl -s $BASE/api/profile/completion -H "$AUTH" | jq

# Step 7 — thoughts must only ever be your own
curl -s $BASE/api/thoughts -H "$AUTH" | jq '.items | length'

# Step 17 — panels before and after deleting a report
curl -s $BASE/api/medical/blood-tests -H "$AUTH" | jq length

# Step 26 — dating conversations must not appear in main chats
curl -s $BASE/api/chat/conversations -H "$AUTH" | jq length

# Health of the deployment itself (no token needed)
curl -s $BASE/api/health | jq
```

---

## Known, and not bugs

- **Sleep is not counted** in the health score — nothing records it yet, and the
  score says so rather than quietly weighting what it has.
- **A prescription photo cannot be read automatically.** No OCR provider is
  connected; typing the medicines in is the intended path, not a failure.
- **Dating chat costs money after three connections.** A matched pair who have
  not connected genuinely cannot message yet — that is the product, not a fault.
- **Demo inventory is off.** Empty restaurants, travel and jobs catalogues are
  correct in production; they fill only when `SEED_DEMO=true`.
