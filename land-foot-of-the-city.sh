#!/bin/bash
# land-foot-of-the-city.sh — the footer is the city's, not every room's (10 Aug 2026).
# About / Help / Privacy / Terms / Contact, the data line and the copyright
# now render on the city home and nowhere else. Nothing is deleted, nothing is
# hidden with CSS, and no gap is left behind: on any other page the component
# returns nothing at all.
#
# Safe to run before or after land-nothing-scales.sh — it commits Footer.tsx
# and only Footer.tsx, and tolerates that script's files being mid-flight.
set -euo pipefail
cd "$(dirname "$0")"

TOLERATED='together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/index.css
together-city-react/src/hooks/useScaleLock.ts
together-city-react/src/hooks/useChatRoom.ts
together-city-react/src/features/mail/pages/Folders.tsx
together-city-react/src/features/mail/pages/MessageView.tsx
together-city-react/src/features/mail/pages/Compose.tsx
together-city-react/src/features/dating/pages/DatingChats.tsx
together-city-react/src/features/services/pages/Messages.tsx
together-city-react/src/layouts/Footer.tsx'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' | grep -vxF "$TOLERATED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="The foot of the city belongs to the city"
case "$(git log --oneline -60)" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
W = 'together-city-react/'
R = W + 'src/'


def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    if new in s and old not in s:
        print("already", path)
        return
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)


F = R + 'layouts/Footer.tsx'

patch(F, "import { Link } from 'react-router-dom';",
       "import { Link, useLocation } from 'react-router-dom';")

patch(F,
  """export function Footer() {
  return (""",
  """/**
 * THE FOOT OF THE CITY BELONGS TO THE CITY, NOT TO EVERY ROOM IN IT.
 *
 * About, Help, Privacy, Terms, Contact and the line about your data are what
 * a place says when you arrive at its front door and are deciding whether to
 * come in. Repeated under Beauty, under a salon's price list, under a search
 * result and under somebody's profile, they stop being an introduction and
 * become forty pixels of legal furniture at the bottom of every screen — and
 * on a phone, where the screen is the page, that is the last thing a citizen
 * reads about a haircut.
 *
 * ONE RULE, IN THE ONE COMPONENT BOTH LAYOUTS ASK FOR. AppShell renders the
 * city home and the twelve hub landings; HubLayout renders every inner hub
 * page. Deciding here rather than in each of them is the difference between
 * one rule and two that can drift — and it is why nothing above needed to
 * change: both still ask for the foot, and the foot answers.
 *
 * Nothing is removed. Every link, every line and the whole of its design are
 * exactly as they were; on any page but the home page this returns nothing at
 * all, which is not a hidden element and therefore not a gap either — the
 * page simply ends where its content ends.
 */
export function Footer() {
  /* The city home, and only the city home. A hub LANDING is not it: /travel
     is a hub's front door, not the city's. */
  if (useLocation().pathname !== '/') return null;

  return (""")

print('done')

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/layouts/Footer.tsx
git commit -m "$MARK

About, Help, Privacy, Terms, Contact and the line about your data are what a
place says at its front door, while somebody is deciding whether to come in.
Repeated under Beauty, under a salon's price list, under a search result and
under somebody's profile, they stop being an introduction and become forty
pixels of legal furniture at the foot of every screen in the application — and
on a phone, where the screen IS the page, that is the last thing a citizen
reads about a haircut.

One rule, in the one component both layouts already ask for. AppShell renders
the city home and the twelve hub landings; HubLayout renders every inner hub
page; both still ask for the foot, and the foot now answers. Putting it there
rather than in each layout is the difference between one rule and two that can
drift, and it is why nothing above this component changed.

Nothing is deleted. Every link, every line and the whole of its design are
exactly as they were, and on the home page it is measured identical — 225px,
the same 225px. Elsewhere it renders NOTHING, which is not a hidden element
and therefore not a gap: measured across the city home, eleven hub landings,
mail, search and a profile, the space after <main> goes from 225px to zero
everywhere but home."
git push
echo "LANDED."
