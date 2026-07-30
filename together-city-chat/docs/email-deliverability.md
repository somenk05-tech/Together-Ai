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

## The short version

| Setting | Value |
|---|---|
| Sending subdomain | `mail.togethercity.app` |
| `EMAIL_PROVIDER` | `resend` |
| `EMAIL_FROM` | `Together City <no-reply@mail.togethercity.app>` |
| `RESEND_API_KEY` | from the Resend dashboard |
| `SMS_PROVIDER` | `twilio` |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | from the Twilio console |
| `TWILIO_MESSAGING_SERVICE_SID` | preferred over `TWILIO_FROM` in India |

Until `EMAIL_PROVIDER` is set, the stub provider runs, logs every message and
delivers none — and the app says so rather than pretending: the verification
screen shows "no provider is configured on this environment" instead of "check
your inbox".

## Why a subdomain and not the apex

Send from `mail.togethercity.app`, not from `togethercity.app`.

Reputation attaches to the sending domain. If transactional mail goes out from
the apex and something later goes wrong — a compromised form, a bulk send to a
stale list, a spike of complaints — the damage lands on the domain that also
serves the website and any future business correspondence. A subdomain is a
firebreak. It also means the apex's own SPF record (which may need to list a
CRM, a helpdesk, an invoicing tool) does not have to share a ten-lookup budget
with the transactional stream.

## The four records

Add these to the DNS for `togethercity.app`. Resend's dashboard generates the
exact values for the first two; the shapes are below so you can check them.

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
