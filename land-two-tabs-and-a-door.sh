#!/usr/bin/env bash
# land-two-tabs-and-a-door.sh  ·  run from the REPO ROOT
#
# Two changes, two commits, one verified run — they share no files:
#
# 1 · THE DRAWER CLOSES AT A TAP. The mobile sidebar slid in over the page
#     and the only way back was the burger; a tap on the page went THROUGH to
#     the page. Now: transparent scrim (outside tap), leftward swipe, Escape
#     — every one through the same toggleSidebar(false). One shared file
#     (drawerDismiss.tsx), both drawers (city + hub rail). The slide itself
#     was already there and is untouched; nothing visual changes.
#
# 2 · MIRA IS TWO TABS, AND A DOOR ON EVERY PAGE. Friend (chart, numerology
#     life path, palm/face reading as honest lenses — she reads descriptions,
#     never invents what she has not been shown) and City assistant (the
#     operator). Same thread, same day store, same meter — the tab changes
#     her register on the wire. And her mark now floats on every page: a
#     press pops the chat up over the page, with the path sent along so
#     "what is this page?" means THIS page, and she walks them through it
#     field by field.
#
# Verified through the bridge: web tsc clean, lint 0, a11y 0, motion at
# ceiling, nav clean, new guards 15+19 green, relief/stage-ink green over the
# css; api tsc clean, all 15 mira suites green (578 tests).
set -uo pipefail
W=together-city-react
A=together-city-chat

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] && [ -d "$A" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -60)"
printf '%s\n' "$LOG" | grep 'Mira is two tabs' >/dev/null
[ $? -ne 0 ] || die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep 'Mira can actually talk' >/dev/null
[ $? -eq 0 ] || die "base commit 'Mira can actually talk' is not here - this lands on top of it"
ok "base is here, this is not"

say "2 - scope"
STRAY="$(git status --porcelain -- "$W/src/layouts/" "$W/src/styles/" "$W/src/features/chat/mira/" "$A/src/mira/" \
  | grep -Ev '(src/layouts/(drawerDismiss\.tsx|CityDrawer\.tsx|Sidebar\.tsx|MiraDock\.tsx|AppShell\.tsx)|src/styles/(layout\.css|mira\.css)|src/features/chat/mira/(MiraThread\.tsx|api\.ts)|src/mira/(persona\.ts|mira\.service\.ts|mira\.controller\.ts|she-can-actually-talk\.spec\.ts))$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m these carry changes this script did not write:\n%s\n' "$STRAY"; \
  die "another session may be working here - do not force past this"; }
ok "the touched surfaces carry only this change"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/layouts/drawerDismiss.tsx"                  dbee4a2005e7082c523f326bf75997cedf6a35e4fb005900a58c594d59507d4c
check "$W/src/layouts/CityDrawer.tsx"                     672c81f9a62f5b5e36784bd9856530fc2375be6a45bb81da1cf3c2702ffa9861
check "$W/src/layouts/Sidebar.tsx"                        0be8fe3816184a22ef9961228764d319141be76a999d481394ffb722cbbbbcea
check "$W/src/styles/layout.css"                          1ac5d9b6717f6d4d0045f943d39760afb5e0866319a6b478410e61ad59ce5e06
check "$W/src/app/the-drawer-closes-at-a-tap.test.ts"     a56ca4114eeb8f028dc99cd49494da3bcc4c7769fd9d235e4830c262ec7e9934
check "$W/src/layouts/MiraDock.tsx"                       ab33971e6b1381ba53a665a4c0eb0a97c4c3e7e42c65918c8baea54f2de0dd90
check "$W/src/layouts/AppShell.tsx"                       21833d405e04f7a2bfff8898c85efd68c508cc3a7b5f8533ba2576784c7adc25
check "$W/src/features/chat/mira/MiraThread.tsx"          8d896b46cf593eea6b0be49c38da8e7b5e34ada3ae0472aa630d7763c0190b28
check "$W/src/features/chat/mira/api.ts"                  207e52c844b0e76e7572ef82a7fb5976471c30eed6e4f43d2a78cf1104866414
check "$W/src/styles/mira.css"                            be4f68c87696602c7149a3b32b961d7d2f270ebfb9a830052aabd645c932e2de
check "$W/src/app/mira-is-two-tabs-and-a-door.test.ts"    f8a3812872074098bf40e03d4f9c8034418e9aa808e026e4e0b2ee017e137d24
check "$A/src/mira/persona.ts"                            b0f0e08e13371786e5a0629534773999cff7fc79fa367b916424eb5489c9b1e4
check "$A/src/mira/mira.service.ts"                       c958ead78a61a7a4764f6fac470aa358fb9bcb789bdc6e0167b3b37ed12317ff
check "$A/src/mira/mira.controller.ts"                    c5c97491cac012d05d50b074d3f7a345cbb005a3bc9a9b4c2193f19795848570
check "$A/src/mira/she-can-actually-talk.spec.ts"         045c6e072cc93ad617be54bdbcc17e1e9c287ea7e1393e38cfb122515d43f0ac

say "4 - api gates"
cd "$A" || die cd
npx prisma validate        && ok "prisma validate" || die "prisma validate"
npx prisma generate        && ok "prisma generate" || die "prisma generate"
npx tsc --noEmit           && ok "api tsc"         || die "api tsc"
npx jest src/mira --silent && ok "api jest (mira)" || die "api jest (mira)"
API_BASELINE=127
API_LINT="$( { npx eslint 'src/**/*.ts' 'test/**/*.ts' -f json 2>/dev/null || true; } \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).reduce((n,f)=>n+f.errorCount,0))}catch{console.log(-1)}})" )"
[ "$API_LINT" -ge 0 ] || die "ESLint produced no readable report"
[ "$API_LINT" -le "$API_BASELINE" ] || die "API lint went UP: $API_LINT (main is at $API_BASELINE)"
ok "api lint $API_LINT (baseline: $API_BASELINE)"
npm run build              && ok "api build"       || die "api build"
cd ..

say "5 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
npm run build                   && ok "web build"      || die "web build"
say "   reported, not gated"
node scripts/dead-export-audit.mjs || true
cd ..

say "6 - commit 1/2 · the drawer"
git add "$W/src/layouts/drawerDismiss.tsx" \
        "$W/src/layouts/CityDrawer.tsx" \
        "$W/src/layouts/Sidebar.tsx" \
        "$W/src/styles/layout.css" \
        "$W/src/app/the-drawer-closes-at-a-tap.test.ts" || die "git add (drawer)"
git commit -F - <<'MSG' || die "commit (drawer)"
The drawer closes at a tap

The mobile sidebar slid in over the page and the only way back was the
burger. Worse: a tap on the page behind it went THROUGH to the page -
buttons pressed, links followed - while the drawer stayed open on top of
the damage.

Now the outside tap, a leftward swipe on the drawer, and Escape all put it
away, and every one goes through the same toggleSidebar(false) the burger
and the nav links already use. The dismissal is ONE file, drawerDismiss.tsx,
shared by the city drawer and the hub rail, because it is several things
done together and a second copy would still look correct while one of them
quietly stopped working.

The scrim is a transparent sibling of the drawer - a dismissal surface, not
a redesign, and a tap inside the drawer never touches it, so nothing has to
intercept events. The swipe is decided at touchend from the whole gesture,
so scrolling inside the drawer is never eaten. The slide itself is the
280ms transform the drawer has always had, both directions, and the aside
stays mounted through the close so the exit animates.

Nothing visual changes. Desktop is untouched - the scrim exists only below
the drawer breakpoint.
MSG
ok "committed the drawer"

say "7 - commit 2/2 · Mira's tabs and her door"
git add "$W/src/layouts/MiraDock.tsx" \
        "$W/src/layouts/AppShell.tsx" \
        "$W/src/features/chat/mira/MiraThread.tsx" \
        "$W/src/features/chat/mira/api.ts" \
        "$W/src/styles/mira.css" \
        "$W/src/app/mira-is-two-tabs-and-a-door.test.ts" \
        "$A/src/mira/persona.ts" \
        "$A/src/mira/mira.service.ts" \
        "$A/src/mira/mira.controller.ts" \
        "$A/src/mira/she-can-actually-talk.spec.ts" \
        land-two-tabs-and-a-door.sh || die "git add (mira)"
git commit -F - <<'MSG' || die "commit (mira)"
Mira is two tabs, and a door on every page

Two tabs, one Mira. FRIEND is the companion: the mystic register leads -
her Vedic chart, a numerology life path computed from the birth date the
astrology profile already holds (digits summed, reduced, masters 11/22/33
kept), and palmistry or face reading as honest lenses: she cannot see a
palm, so she asks for a description and reads THAT, saying so - never
inventing what she has not been shown. CITY ASSISTANT is the operator she
has always been. The tab rides the wire as `mode`; the thread, the day
store, the seed and the meter are shared, so a conversation started in one
tab continues in the other. The choice is remembered on the device.

In the friend tab the model outranks the one-liner oracle: "when will i
find love" - the second question ever asked of her - now gets the friend
with the chart, not a stock sentence. The crisis hand-off outranks both
tabs and the model, checked before any register; navigation keeps its
chance in both; the city tab keeps foretold(), because terse and honest is
the assistant's register. With the model off, every lane falls back to
exactly what the assistant would have said.

AND HER MARK IS NOW A DOOR ON EVERY PAGE. The Mira ring floats over the
city (signed-in only, never over /chats where she has the room to herself);
a press pops the chat up over whatever the citizen is doing - the same
thread, in her own room's material, bounded and scrollable. The page she
was opened over rides along as `page`, so "what is this page?" means THIS
page, and the persona tells her to walk them through it one control at a
time - and to say plainly that she cannot fill the form for them yet,
rather than pretend. Opened over a page she arrives as the assistant;
Escape, the outside tap and any navigation put her away.

Guards: mira-is-two-tabs-and-a-door.test.ts (19 assertions, web) and the
friend-tab cases in she-can-actually-talk.spec.ts, including: the model
answers the love question in friend mode; friend mode with the model off is
the assistant she was; and a violent sentence wrapped in a horoscope
request still reaches the hand-off, never the model.
MSG
ok "committed Mira"

say "review the two commits, then:  git push"
