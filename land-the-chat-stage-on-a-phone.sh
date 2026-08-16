#!/usr/bin/env bash
# land-the-chat-stage-on-a-phone.sh  ·  run from the REPO ROOT
#
# The owner, from a phone screenshot: the name is not visible, the thread pans
# sideways, and the bubbles should be left for incoming and right for outgoing.
#
# Requires 'A draft is not a reading' in the log.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }

[ -d "$W" ] || die "run me from the repo root"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
LOG="$(git log --oneline -80)"
printf '%s\n' "$LOG" | grep -q 'The chat stage on a phone' && die "already landed - re-running is a no-op by design"
printf '%s\n' "$LOG" | grep -q 'A draft is not a reading' || die "base commit 'A draft is not a reading' is not here"
ok "base is here, this is not"

say "2 - scope"
PATHS=("$W/src/styles/relief.css" \
       "$W/src/index.css" \
       "$W/src/features/chat/pages/Chats.tsx" \
       "$W/src/features/chat/components/MessageThread.tsx" \
       "$W/src/app/the-chat-stage-on-a-phone.test.ts")
STRAY="$(git status --porcelain -- "${PATHS[@]}" \
  | grep -Ev '(src/styles/relief\.css|src/index\.css|src/features/chat/pages/Chats\.tsx|src/features/chat/components/MessageThread\.tsx|src/app/the-chat-stage-on-a-phone\.test\.ts)$' || true)"
[ -z "$STRAY" ] || { printf '   \033[31mx\033[0m unexpected:\n%s\n' "$STRAY"; die "Another session may be working here. Do not force past this."; }
ok "only this change moves"

say "3 - sha256"
check(){
  got="$(shasum -a 256 "$1" | awk '{print $1}')"
  [ "$got" = "$2" ] && ok "$1" || die "$1 is not the reviewed file (sha256 $got)"
}
check "$W/src/styles/relief.css"                              bbdbce0f5351b681da49d332ffa5f1a456a0cde39b28f6379cb3fa6bcad111f1
check "$W/src/index.css"                                      0e788fb8fa08d846513e94d23b1817f3e2cd85a3501fa2a9c8b9584db142521b
check "$W/src/features/chat/pages/Chats.tsx"                   6f208a6ba13b3e753375ac401fdecd9c1cfa42351d2d1431b8dba986ac2c6f24
check "$W/src/features/chat/components/MessageThread.tsx"      57d74a5cb4a724c9456f9d8d8fe5c6488506c8efdc743ef7747295adda172cc7
check "$W/src/app/the-chat-stage-on-a-phone.test.ts"           a596a8d36501a44ad17256716b8ef711fbc8d247775f3ce79ec23166b05550f6

say "4 - web gates"
cd "$W" || die cd
npx tsc --noEmit                && ok "web tsc"        || die "web tsc"
npx vitest run                  && ok "web vitest"     || die "web vitest"
node scripts/lint-ceiling.mjs   && ok lint-ceiling     || die lint-ceiling
node scripts/nav-audit.mjs      && ok nav-audit        || die nav-audit
node scripts/a11y-audit.mjs     && ok a11y-audit       || die a11y-audit
node scripts/motion-ceiling.mjs && ok motion-ceiling   || die motion-ceiling
node scripts/dead-export-audit.mjs || printf '   (dead-export is report-only; main already fails it)\n'
npm run build                   && ok "web build"      || die "web build"
cd ..

say "5 - commit"
git add "${PATHS[@]}" land-the-chat-stage-on-a-phone.sh || die "git add"
git commit -F - <<'MSG' || die commit
The chat stage on a phone

"the name is not visible, the thread pans sideways, and the bubbles should
be left for incoming and right for outgoing" - the owner, from a
screenshot of his own phone.

MEASURED, NOT GUESSED. The header was rendered in a browser at 320, 360,
375, 390 and 430 before a line was changed. Its eight controls - back,
avatar, name, unread, search, Mira, call, video - wanted 398px before the
name block was given a single pixel, so on every phone made the name was
ZERO WIDE, which is why `online` survived it: the status is the shorter
string. Below 372px the video key was cut off the end of the row. The name
block already had `flex: 1; min-width: 0` and the ellipsis; there was
nothing wrong with how it shrank, only with how much was left.

So the row gives up, in order: the avatar - a phone shows one room at a
time and the name sits directly above the thread, so the disc was saying
it twice - then the spacing, then the size of her lockup, which is scaled
in the stylesheet because mira-reads-one-chat pins `size={48}` in the page
and 48 is the size the word stops being legible below on a desk. Unread
and search FOLD behind one key rather than leaving: "mark unread" is
reachable from nowhere else in the application, and a control only a desk
can find is a feature a phone does not have. The name goes from 0px to
138px on a 390 phone, 68px on a 320, and nothing is clipped at any width.

THE BUBBLES WERE AN INLINE STYLE BEATING THE CASCADE. The row already
carried `alignSelf: mine ? 'flex-end' : 'flex-start'`, and it was already
correct - but the same style object said `maxWidth: '100%'`, and an inline
declaration outranks every rule in a stylesheet. It beat `min(66%, 560px)`
on a desk AND 86% on a phone, so every long message ran the full width of
the stage, and a row that wide cannot read as right-aligned however
`align-self` is set. The measure goes back to the stylesheet; a share card
still states its own 320, because that is a card of a fixed size rather
than a measure for prose.

AND FOUR PHONE RULES IN index.css HAD NEVER ONCE APPLIED. main.tsx imports
index.css and then relief.css, so at equal specificity relief takes the
tie - and the phone's 14px gutters, its 86% measure, the header's 10px gap
and the composer's margin were each tying with a rule stated
unconditionally below. A phone has been reading at the desk's 66%, inside
the desk's 24px gutters, since 10 Aug. They are in relief.css now, scoped
under `.cstage` so they outrank what they correct rather than merely
following it, and the dead copies are gone with a note saying why.

The axis is locked as well. `overflow-y: auto` alone leaves overflow-x
computing to `auto`, not `visible`, so anything a shade too wide made the
thread pannable sideways; `.csmsgs` says `overflow-x: hidden` and `.csb`
says `overflow-wrap: anywhere`, so a pasted link breaks inside its bubble
instead of pushing the room.

the-chat-stage-on-a-phone.test.ts holds all of it - twelve assertions,
each pinning a measurement rather than a taste, because every one of these
failures looked like a working chat.
MSG
ok committed
say "review, then:  git push"
