# Getting mail to actually arrive

**Review items: p19, p20, p21.** "We can't email external addresses — fix."

The code side of this is done: a provider seam
(`src/mail/messaging-provider.ts`), a Resend adapter for email, a Twilio adapter
for SMS, and six-digit verification wired to both. None of it will deliver
anything until the DNS below exists, because the part that decides whether a
message reaches a Gmail inbox is not in this repository. It is in the domain's
records, and it takes a day or two to warm up.

This is the runbook for that. It is written to be followed once, by whoever owns
the domain.

## The week nothing was delivered (2026-07-23 → 2026-07-30)

Recorded because the diagnosis was slow and the cause was one character.

`EMAIL_FROM` was set to:

```
Together City <hello@togethercity.app
```

No closing `>`. That is not a valid RFC 5322 sender, so Resend refused every
message with `422 validation_error` — thirteen consecutive rejections over seven
days, including every password-recovery code anybody asked for.

Three things kept it hidden, and all three are now fixed:

1. **The provider threw the reason away.** `ResendEmailProvider` destructured
   `{ data, error }` and returned `status: 'failed'` without ever reading
   `error`. Resend explained the problem thirteen times and the code discarded
   the explanation every time, so every failure looked identical from inside the
   application. It now logs the reason, the configured sender, and the
   recipient's *domain* — not their address, because an error log should not
   become a list of people's email addresses.
2. **Nothing validated the sender.** A malformed `EMAIL_FROM` cannot work and is
   knowable at boot, so `describeFromAddress()` now checks it when the provider
   is constructed and logs loudly if it will never send. `messaging-provider.spec.ts`
   pins the exact broken value as a regression case.

   It also **repairs** that one shape rather than only refusing it — an opening
   `<`, a valid address, no closing `>`. Railway's variable editor was observed
   dropping that character, which makes it a fault the configuration UI can
   inflict on you rather than one you can avoid by typing carefully, and
   refusing to send in that situation punishes the operator for someone else's
   bug. The repair is logged every time and is deliberately narrow: if what
   follows `<` is not an address, the value could have meant more than one
   thing, and it is refused instead of guessed.
3. **"Configured" was mistaken for "working".** `POST /auth/forgot` reports
   `delivery: 'live'`, which means a real provider is wired — not that it can
   deliver. That check passed throughout the outage. It is still the right first
   probe; it is not the last one.

The lesson worth keeping: an outbound integration needs a failure path that is
noisier than its success path. This one had a success path that logged and a
failure path that was silent.

## Setting it on Railway

The API reads these at boot. Set them in the Railway dashboard on the API
service → **Variables**, then redeploy — Railway restarts the container on a
variable change, and nothing is read until it does.

| Variable | Value |
|---|---|
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | from Resend → API Keys |
| `EMAIL_FROM` | `Together City <no-reply@togethercity.app>` |
| `WEB_APP_URL` | `https://togethercity.app` |

Two of those are easy to get subtly wrong.

**`EMAIL_FROM` must sit on the domain Resend shows as Verified.** That is
`togethercity.app` — the apex, verified 2026-07-23. Resend rejects an
unverified sender at the API rather than downgrading it, so a wrong value here
fails every send with an error visible only in the log.

This value is also the code's default, so strictly it can be left unset. Set it
anyway: a default that happens to be correct is indistinguishable from a
configuration that was thought about, right up until someone changes the
default.

**`WEB_APP_URL` is not cosmetic.** Unset, it falls back to the raw
`together-ai-five.vercel.app` hostname, and links in your email point at a
domain that does not match the brand, the sender or the site. Recipients read
that as phishing and so do spam filters.

Leave `SMS_PROVIDER` unset for now. Unset means the stub, phone verification
says "no SMS provider is configured on this environment" rather than pretending,
and nothing else is affected.

## The short version

| Setting | Value |
|---|---|
| Sending domain | `togethercity.app` (apex, verified) |
| Envelope sender | `send.togethercity.app` (Resend's own subdomain) |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | `Together City <no-reply@togethercity.app>` |
| `RESEND_API_KEY` | from the Resend dashboard |
| `WEB_APP_URL` | `https://togethercity.app` |
| `SMS_PROVIDER` | unset for now — see §2's open items |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | from the Twilio console, when SMS is turned on |
| `TWILIO_MESSAGING_SERVICE_SID` | preferred over `TWILIO_FROM` in India |

Until `EMAIL_PROVIDER` is set, the stub provider runs, logs every message and
delivers none — and the app says so rather than pretending: the verification
screen shows "no provider is configured on this environment" instead of "check
your inbox".

## What is actually set up (verified 2026-07-23)

The domain is **`togethercity.app`**, the apex, and it is Verified in Resend
with sending and receiving both enabled.

This document originally recommended a `mail.` subdomain, and the apex is a
defensible different choice — but the reason for the recommendation is worth
knowing, because it decides what to do if reputation ever goes wrong.
Reputation attaches to the sending domain, so mail from the apex shares a fate
with anything else that ever sends as `togethercity.app`. A subdomain is a
firebreak. On a young domain with one transactional stream, there is nothing to
firebreak from yet; the moment a second stream exists — a newsletter, a CRM, an
invoicing tool — split it onto its own subdomain rather than adding it here.

Resend has already done part of that split without being asked. Look at the
records: SPF and the feedback MX are on **`send.togethercity.app`**, not on the
apex. That subdomain is the envelope sender (the `Return-Path`), so bounce
handling and the SPF lookup budget are already isolated, while the `From:`
header the recipient reads stays `togethercity.app`.

That arrangement is also why DMARC will pass. Alignment is checked between the
`From:` domain and the authenticated one:

- **DKIM** signs with `d=togethercity.app` — the same domain, so it aligns
  strictly.
- **SPF** authenticates `send.togethercity.app` — a subdomain, which aligns in
  *relaxed* mode because the organisational domain matches.

DMARC passes if *either* aligns, and here both do.

The records currently in place:

| Record | Name | Purpose | Status |
|---|---|---|---|
| TXT | `resend._domainkey` | DKIM public key | Verified |
| MX | `send` | bounce & complaint feedback | Verified |
| TXT | `send` | SPF for the envelope sender | Verified |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | set |
| MX | `@` | inbound receiving | Verified |

Two notes on those.

**SPF ends in `~all`, which is correct for now.** Softfail rather than hardfail
while the domain is new: a `-all` on a record with a mistake in it does not
degrade delivery, it stops it. Tighten to `-all` once the DMARC reports show
only your own sources.

**DMARC is at `p=none` with no `rua`.** `p=none` is the right starting policy —
it publishes the intent without changing how anything is delivered. But with no
`rua=mailto:` there is nowhere for the reports to go, which means the one thing
`p=none` is *for* is currently switched off. Add
`rua=mailto:dmarc@togethercity.app` to that record; the reports are what tell
you whether moving to `p=quarantine` is safe, and without them the policy will
sit at `none` indefinitely because nobody will ever have evidence to raise it.

**The apex MX points at Resend inbound.** That is real email to
`@togethercity.app` arriving at Resend — worth being aware of alongside the
in-app Together City Mail feature, which is a separate thing that does not use
these records. §14 is where that distinction has to be settled.

## The records in detail

Already in place — kept here so the shapes can be checked, and so a rebuild on
another domain does not start from nothing.

**1. SPF** — says which servers may send as this domain.

```
mail.togethercity.app.   TXT   "v=spf1 include:amazonses.com ~all"
```

`~all` (softfail) rather than `-all` (hardfail) for the first two weeks. A
hardfail on a record with a mistake in it does not degrade delivery, it stops
it. Tighten to `-all` once the DMARC reports show only your own sources.

SPF permits at most 10 DNS lookups, and each `include:` costs one. Two includes
is fine; six is a record that silently stops evaluating.

**2. DKIM** — signs each message so a receiver can tell it was not altered.

```
resend._domainkey.mail.togethercity.app.   TXT   "p=MIIBIjANBgkq…"
```

Use a 2048-bit key. Some DNS providers will not accept a TXT value that long in
one string — split it into 255-character chunks and the resolver reassembles it.
If the dashboard says "not verified" for an hour after you are sure the record
is right, that is almost always what happened.

**3. DMARC** — tells receivers what to do when SPF and DKIM disagree, and asks
them to report back.

```
_dmarc.togethercity.app.   TXT   "v=DMARC1; p=none; rua=mailto:dmarc@togethercity.app; pct=100; adkim=r; aspf=r"
```

Start at `p=none`. That publishes the policy and turns on the reports without
changing how anything is delivered, so you find out what is sending as you
before you start rejecting it. Move to `p=quarantine` after two weeks of clean
reports, which is what the spec asks for. Do not start there — `p=quarantine` on
day one with a DKIM record that has a typo in it puts your own OTPs in spam.

**4. Reverse DNS** — only if you use a dedicated IP. On Resend's shared pool
this is theirs, not yours.

## Two streams, not one

Configure two Resend audiences / API keys:

- **transactional** — OTP, verification, receipts, password resets
- **bulk** — digests, announcements, anything a person could reasonably not want

They must not share a reputation. The failure this prevents is specific and
common: somebody sends a newsletter to a list with old addresses, complaints
spike, the sending reputation drops, and the thing that breaks is password reset
codes. People cannot get into their accounts because of a marketing email. Split
streams mean a bad bulk send degrades bulk delivery and nothing else.

## Warming up

A brand-new sending domain has no reputation, and mailbox providers treat
volume from an unknown domain as suspicious. Send low and build:

- Days 1–3: under 50 a day
- Days 4–7: a few hundred
- Week 2 onward: double daily while bounce stays under 2% and complaints under 0.1%

If you are launching to a waiting list, this is the constraint that decides the
launch schedule — not the code.

## How to know it worked

The acceptance criterion from the spec is concrete, and it is worth running
exactly as written rather than approximating it:

> a code reaches a real Gmail inbox in under 30 seconds and lands in Primary,
> not Spam

Check it against a real Gmail, a real Yahoo, a real Outlook and, if you have
one, a corporate Microsoft 365 address. Those four fail differently, and passing
on Gmail alone tells you very little about the other three.

Then open one of the received messages and look at the headers. You want to see:

```
spf=pass       smtp.mailfrom=mail.togethercity.app
dkim=pass      header.d=mail.togethercity.app
dmarc=pass     header.from=togethercity.app
```

Three passes. Two passes and a `dmarc=fail` means alignment is wrong — usually
the `From:` domain and the signing domain do not match, which `adkim=r`
(relaxed) is there to tolerate across a subdomain.

## What is deliberately still missing

**The delivery-state machine (BE-2.2).** Right now a dispatch is recorded as
`queued` or `failed` at the moment we hand it to the provider, and nothing
updates it afterwards. That is honest as far as it goes — the Twilio adapter
refuses to claim `sent` at dispatch time for exactly this reason — but it is not
the full fix for p21. A message that Resend accepts and Gmail then bounces stays
recorded as `queued` forever.

Closing that needs a signed webhook endpoint per provider, idempotent on the
provider's message id, moving each row through
`queued → accepted → delivered | deferred | bounced | complained | failed`. That
endpoint cannot be written blind: it has to be verified against the real
signature scheme and the real payload shape, which means it comes after the
account exists. It is the first thing to do once these records are live.

**The deliverability dashboard (BE-2.3 in §14).** Accepted / delivered / bounce
/ complaint rates per stream, alarming at 2% bounce or 0.1% complaint. Same
dependency: the numbers come from the webhook.
