#!/usr/bin/env bash
# land-together-city-trust.sh  ·  run from the REPO ROOT
#
# Four verification levels, a tab under a listing to get verified, and five new
# enquiries a day until it is - then free.
#
# THE TIER IS NEVER STORED. It is computed from evidence rows by one pure
# function (local-services/trust.ts) every time anybody asks. A tier column goes
# wrong the first time a document expires and no job re-runs - silently, on a
# badge, which is the worst place in this product for a stale value to sit.
#
# ONE MIGRATION, AND ONE LINE OF IT IS NOT ADDITIVE: ServiceEnquiry.openedAt is
# backfilled to createdAt for every row that exists. Those conversations HAVE
# been given away, some of them mid-job, and a bare NULL default would empty
# every business inbox in the city on deploy.
#
# `prisma generate` runs first below because the service writes three new
# columns and a new model - that step cannot run in a sandbox (the engine
# download is blocked), which is why it is gated here rather than pre-checked.
# verification.spec.ts is one of the suites that needs it.
#
# RUN AFTER "A name is the asker's to give" - not optional. That commit touched
# four of the same files and this change was written on top of it.
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
note(){ printf '   \033[33m~\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -40)"
printf '%s\n' "$LOG" | grep 'Together City Trust' >/dev/null \
  && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep "A name is the asker's to give" >/dev/null \
  || die "run land-a-name-is-the-askers-to-give.sh first - this is written on top of it"
ok "the base is here, this is not"

say "2 - scope"
# `git add` below names twenty-three exact paths, so nothing else can enter this
# commit however many files appear beside them, and step 3 verifies the bytes
# of all twenty-three. What this adds is awareness of concurrent work: a TRACKED file
# in these folders carrying edits this script did not write means somebody is in
# the same code, and that stops the run. Untracked files from another session
# cannot be swept into an explicit `git add`, so they are reported and stepped
# around.
MINE='(prisma/schema\.prisma|prisma/migrations/20260816190000_together_city_trust/migration\.sql|local-services/trust\.ts|local-services/trust\.spec\.ts|local-services/trust-gate\.ts|local-services/trust-gate\.spec\.ts|local-services/verification\.service\.ts|local-services/verification\.controller\.ts|local-services/verification\.spec\.ts|local-services/dto/verification\.dto\.ts|local-services/local-services\.module\.ts|local-services/local-services\.service\.ts|local-services/anonymity\.spec\.ts|local-services/menu\.spec\.ts|local-services/regulars-offers\.spec\.ts|admin/permissions\.ts|admin/admin\.service\.ts|admin/admin\.controller\.ts|admin/admin\.module\.ts|services/Verification\.tsx|services/api\.ts|services/pages/MyBusiness\.tsx|services/pages/BusinessPage\.tsx)$'
DIRTY="$(git status --porcelain -uall -- "$A/src/local-services" "$A/src/admin" "$A/prisma" "$W/src/features/services")"
OTHERS="$(printf '%s\n' "$DIRTY" | grep -Ev "$MINE" | grep -v '^[[:space:]]*$' || true)"
TRACKED_STRAY="$(printf '%s\n' "$OTHERS" | grep -v '^??' | grep -v '^[[:space:]]*$' || true)"
[ -z "$TRACKED_STRAY" ] || { printf '   \033[31mx\033[0m these tracked files carry edits this script did not write:\n%s\n' "$TRACKED_STRAY"; \
  die "another session is editing the same code - do not force past this"; }
if [ -n "$OTHERS" ]; then
  printf '   \033[33m~\033[0m new files from another session are here and are NOT being committed:\n%s\n' "$OTHERS"
else
  ok "the twenty-three files this commit touches are the only ones it will add"
fi

say "3 - sha256"
FILES=(
  "${A}/prisma/schema.prisma"
  "${A}/prisma/migrations/20260816190000_together_city_trust/migration.sql"
  "${A}/src/local-services/trust.ts"
  "${A}/src/local-services/trust.spec.ts"
  "${A}/src/local-services/trust-gate.ts"
  "${A}/src/local-services/trust-gate.spec.ts"
  "${A}/src/local-services/verification.service.ts"
  "${A}/src/local-services/verification.controller.ts"
  "${A}/src/local-services/verification.spec.ts"
  "${A}/src/local-services/dto/verification.dto.ts"
  "${A}/src/local-services/local-services.module.ts"
  "${A}/src/local-services/local-services.service.ts"
  "${A}/src/local-services/anonymity.spec.ts"
  "${A}/src/local-services/menu.spec.ts"
  "${A}/src/local-services/regulars-offers.spec.ts"
  "${A}/src/admin/permissions.ts"
  "${A}/src/admin/admin.service.ts"
  "${A}/src/admin/admin.controller.ts"
  "${A}/src/admin/admin.module.ts"
  "${W}/src/features/services/Verification.tsx"
  "${W}/src/features/services/api.ts"
  "${W}/src/features/services/pages/MyBusiness.tsx"
  "${W}/src/features/services/pages/BusinessPage.tsx"
)
for f in "${FILES[@]}"; do [ -f "$f" ] || die "missing: $f"; done
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "${A}/prisma/schema.prisma"                                               0f2c4d0e7afaee558682268ed72ba9469fe8ebbca4d96a0caf9876e2a00e4680
check "${A}/prisma/migrations/20260816190000_together_city_trust/migration.sql" cd7c6f8a5ac629cf09b12afabe1144045b5940f14a6a88100923c6ad4e443e2e
check "${A}/src/local-services/trust.ts"                                        e8b3492ab1f0a1b17233e436b1a53d20f35d2ce5814973cd2f3bbcfc9869611c
check "${A}/src/local-services/trust.spec.ts"                                   97b30f807f26c1cf6c8bae6d6ab715c25030825fd0a4441eccd4526fef174c33
check "${A}/src/local-services/trust-gate.ts"                                   6abdf3ed4b04b0aef175b863d9ef8444996f2df44e8eda266648311cd5bdc898
check "${A}/src/local-services/trust-gate.spec.ts"                              126c1ae57bd49cea7e6328bf53f948443d6c120280d0fba004f8e4fb39fd8396
check "${A}/src/local-services/verification.service.ts"                         cfdf62504b676eea04b73eee0348d60682c9b6b953a54b6be2ede61ad1b9bcc0
check "${A}/src/local-services/verification.controller.ts"                      d760cd3847d8fff949e726807add65e966427bacad5232693fb647a2e35b2f51
check "${A}/src/local-services/verification.spec.ts"                            2922a5375850d95f780bcd4646a01cff2eb346fceca6f6d2d6832970f6a3d904
check "${A}/src/local-services/dto/verification.dto.ts"                         deb39cdd1378eaf494f172d8ac7a160cdcfac5184f524cd42cb50e0bf9ff9f05
check "${A}/src/local-services/local-services.module.ts"                        107ac24ecc1939db6ed02947cd5e43de5ac7383b5ba770aeddf4c872d209b901
check "${A}/src/local-services/local-services.service.ts"                       6b16f865663fadc05d389b53bd65f4717cf55f11eb9277524124c1f7fb9ee09e
check "${A}/src/local-services/anonymity.spec.ts"                                     dc925fb9e69cf6d6cb27c70e308be9657154953a9c2c76b9cd9b51e05ca598fd
check "${A}/src/local-services/menu.spec.ts"                                          652637404def4cffb8fd5b09e96d1bd12e465f649ffc33cd3d88d71467a162b7
check "${A}/src/local-services/regulars-offers.spec.ts"                               b4214ce7ff149933fee31eb9c8026fd9f5c7193ab87902d383fa6eba92d73a8f
check "${A}/src/admin/permissions.ts"                                           a6bb931662d6c6384472cbbf8fc2679a0f4aa1e658c4c4f8af7a9a8d27b43890
check "${A}/src/admin/admin.service.ts"                                         b8347c50fdc846786f6b7985059f2b8599f88023e430f2be6da534c542bae897
check "${A}/src/admin/admin.controller.ts"                                      92e86f1c01ab39f0d01c3be60f276b49ed09bc082138f4b9b71b0f77afbed3f9
check "${A}/src/admin/admin.module.ts"                                          e13d8400427e6a8c0556660776f7a7efe6988e1ab29673c3cf157c0c1ed0c72b
check "${W}/src/features/services/Verification.tsx"                            2b3a7fa0963673a1a9526a61265adc786212d5ca7a066dc7e210c32379cc83e3
check "${W}/src/features/services/api.ts"                                      ea00ef4c6e38a4a490bd54a4c0ef70eec11e22a0b1900b05313aaad360ce6b88
check "${W}/src/features/services/pages/MyBusiness.tsx"                        ea9336ecf3e57a54398b06d9f4e35efec779c513a6e3b8ddbdefef625466f2b3
check "${W}/src/features/services/pages/BusinessPage.tsx"                      776bc3b1b4f0e410aabb9fd7fbdc61e4750d22c88126cea9ed6c78788c6fa3cd

say "4 - api gates"
cd "$A" || die cd
npx prisma generate                  && ok "prisma generate"      || die "prisma generate"

# The type-check judges this commit, not the working tree: errors located in
# UNTRACKED files belong to another session and cannot be in an explicit
# `git add`. Anything in a tracked file is fatal, mine or otherwise.
FOREIGN="$(cd .. && git status --porcelain -uall -- "$A/src" "$A/prisma" | sed -n "s|^?? $A/||p")"
TSC_API="$(npx tsc --noEmit 2>&1 || true)"
FILTERED_API="$TSC_API"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED_API="$(printf '%s\n' "$FILTERED_API" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED_API" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED_API"
  die "api tsc"
fi
printf '%s\n' "$TSC_API" | grep -q "error TS" \
  && ok "api tsc - clean in every tracked file (another session's untracked files still have errors, and are not in this commit)" \
  || ok "api tsc"

# Scoped to the spec files git knows about plus the four this commit adds -
# a bare `jest src/local-services` would also compile any neighbouring
# session's untracked specs.
SPECS="$(git ls-files 'src/local-services/*.spec.ts' 'src/admin/*.spec.ts' | tr '\n' ' ')"
[ -n "$SPECS" ] || die "no tracked specs found - refusing to pass a gate that ran nothing"
# shellcheck disable=SC2086
npx jest $SPECS src/local-services/trust.spec.ts src/local-services/trust-gate.spec.ts src/local-services/verification.spec.ts \
  && ok "local-services + admin suites" || die "local-services + admin suites"
cd ..

say "5 - web gates"
cd "$W" || die cd
FOREIGN="$(cd .. && git status --porcelain -uall -- "$W/src" | sed -n "s|^?? $W/||p")"
TSC_OUT="$(npx tsc --noEmit 2>&1 || true)"
FILTERED="$TSC_OUT"
while IFS= read -r f; do
  [ -n "$f" ] && FILTERED="$(printf '%s\n' "$FILTERED" | grep -vF "$f" || true)"
done <<EOF
$FOREIGN
EOF
if printf '%s\n' "$FILTERED" | grep -q "error TS"; then
  printf '%s\n' "$FILTERED"
  die "web tsc"
fi
printf '%s\n' "$TSC_OUT" | grep -q "error TS" \
  && ok "web tsc - clean in every tracked file" \
  || ok "web tsc"

npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npx vite build                  && ok "web build (vite)" || die "web build"
# NOT A GATE, AND REPORTED RATHER THAN ABSORBED. dead-export-audit stands at 3
# against a ceiling of 2; all three (useGemCommission, MedicalAdvisories,
# PlanGuidanceBanner) predate this change and belong to other hubs. Nothing
# this commit adds is among them.
node scripts/dead-export-audit.mjs >/dev/null 2>&1 || note "dead-export-audit is over its ceiling by 3 pre-existing exports - somebody else's, untouched here"
cd ..

say "6 - commit"
git add "${FILES[@]}" land-together-city-trust.sh || die "git add"
git commit -F - <<'MSG' || die commit
Together City Trust

The owner, 16 Aug: four verification levels, a tab under a listing to get
it verified, and five new enquiries a day before verification - free
after.

A BADGE THAT MEANS "TYPED A NUMBER INTO A BOX" IS WORSE THAN NO BADGE,
because it launders an unverified claim into a platform endorsement and
the platform is what gets held to it after the first bad job. Dating's
Verified was hidden for that reason and this hub's own plan logged the
same call in August - drop the badge until there is something behind it.
So every rung here is evidence a citizen could be shown, every label
says WHAT WAS CHECKED rather than "verified", and two of the three say
in the same breath that it is not a recommendation.

IDENTITY IS NOT BUSINESS, AND THEY ARE SEPARATE RUNGS. Someone can prove
exactly who they are and still invent a plumbing company. Identity lives
on User - one person, proved once, carried across every listing they own
- and the document lives per listing. Only the VERDICT is stored, never
a scan: there is no product reason to hold somebody's passport and every
reason not to.

THE TIER IS NEVER STORED. `tierOf()` is pure, takes no clock and no
database, and is called everywhere the answer is needed. A tier column
is a second source of truth that goes wrong the first time a document
expires and nothing re-runs - silently, on a badge.

FIVE NEW THREADS A DAY, NOT FIVE MESSAGES. Counting messages would eat
the allowance on a back-and-forth and charge a business for answering
the neighbour it already has. A conversation already open is never
touched.

AND IT IS A QUEUE, NOT A WALL. The sixth citizen sends normally and is
told nothing; the thread exists and the message is stored. It is the
BUSINESS that waits - no thread in the inbox, no notification, and a
count of people waiting on its verification tab, which is the only true
thing on that screen and the only reason the form gets filled in. Held
threads are released oldest-first into the next day's allowance, lazily,
when the owner opens their inbox: no scheduler, nothing to drift, one
pure function with a test. Verifying releases every one of them at once.

The cost of that shape, named in trust-gate.ts rather than discovered
later: the sixth citizen writes into a room nobody is in and hears
nothing. They will think the business ignored them. The alternative -
refusing them at the door - is worse, and if it is ever softened the
line belongs in the thread and must not say "unverified" out loud.

WHICH RUNG OPENS THE INBOX IS IDENTITY, NOT THE CERTIFICATE. The fraud
the cap exists to stop is one person standing up seventeen plumbers, and
what stops that is knowing who the person is; a registered company can
run a scam and does. It also makes the freelancer case come out right -
a tutor has no business document to give and never will, and capping
every honest freelancer in the city at five a day forever would be the
wrong answer to a question they cannot be asked.

Per-trade proof: a clinic is verified on its practitioner registration
and a GST certificate will not do; a kitchen on FSSAI. That table is
data keyed by business-types.ts, not branches.

The migration backfills openedAt to createdAt for every existing row -
those conversations had been given away, some mid-job, and a bare NULL
default would have emptied every business inbox in the city on deploy.

Three existing spec harnesses gain a stubbed-open gate - anonymity,
menu and regulars-offers each build the service with Object.create and
assign its collaborators, and this adds one. reviews.spec never reaches
enquire, inbox or detail and is untouched.

Console: a new `business.verify` permission (held by admin and
business_success, on MUST_AUDIT in both directions), a queue drained
oldest-first, and the decision through act() so no verification can
happen without a permission and a written reason. The refusal reason is
what the owner is shown, verbatim.

Not in this commit, deliberately: badges on directory cards and ranking
by tier (a query per page of results, and it belongs with the ranking
work); place confirmation and phone reputation; reporting a business,
which needs Report.targetType to learn about listings. See
Together-City-Trust-16-Aug.md for the sequence and the three decisions
left to the owner - the KYC provider, whether the sixth neighbour is
told anything, and whether verification stays free.

Gates: prisma generate, api tsc, the local-services and admin suites
(35 new tests: 15 on the ladder, 8 on the gate, 12 on the service); web
tsc, the
whole vitest suite, the four audits at their ceilings, and the web
build.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018wnHW4SL446MrzLXdUgBrY
MSG
ok "committed"
say "done - now push (Railway runs the migration on deploy)"
