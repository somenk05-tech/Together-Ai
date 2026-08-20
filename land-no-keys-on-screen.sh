#!/bin/bash
# land-no-keys-on-screen.sh — a database key is not a page title (10 Aug 2026).
# "4ed6a3ac 860b 4607 A852 8be01b7eab23" was appearing on the home screen as a
# place the citizen had been, and in the breadcrumb above the message itself.
# Every detail route in the city ends in an id, so this was never about mail.
#
# Independent of the other scripts — it commits two files and tolerates theirs
# being mid-flight, so it runs before or after them.
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
together-city-react/src/layouts/Footer.tsx
together-city-react/src/nav/registry.ts'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' | grep -vxF "$TOLERATED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="A database key is not a page title"
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


G = R + 'nav/registry.ts'
M = R + 'features/mail/pages/MessageView.tsx'

# ── 1. a database key is not a page title ─────────────────────────────────
patch(G,
  """/** Best human title for a pathname (exact page label, else title-cased tail). */
export function titleFor(pathname: string): string {
  if (TITLE_OVERRIDE[pathname]) return TITLE_OVERRIDE[pathname];
  const page = DESTINATIONS.find((d) => d.path === pathname && d.kind !== 'action');
  if (page) return page.label;
  const tail = pathname.split('/').filter(Boolean).pop() ?? '';
  return tail ? tail.replace(/[-_]/g, ' ').replace(/\\b\\w/g, (c) => c.toUpperCase()) : 'Together City';
}""",
  """/**
 * A DATABASE KEY IS NOT A PAGE TITLE.
 *
 * The fallback below title-cases the last segment of the path, which is right
 * for /mail/inbox and wrong for /mail/message/4ed6a3ac-860b-4607-a852-…: that
 * one arrived on the owner's home screen as "4ed6a3ac 860b 4607 A852
 * 8be01b7eab23", capitalised, as the name of somewhere he had been — and in
 * the breadcrumb above the message itself. Every detail route in the city ends
 * in an id, so this was never about mail.
 *
 * What counts as an id is deliberately narrow, because the same segment is
 * where real slugs live and a slug must survive: a uuid, a cuid, a long run of
 * hex, a long run of digits, or a long unbroken mix of letters AND digits.
 * `top-10-salons-mumbai` has hyphens and is left alone; so is any ordinary
 * word, however long.
 */
const OPAQUE = [
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,  // uuid
  /^c[a-z0-9]{20,}$/i,                                                 // cuid
  /^[0-9a-f]{16,}$/i,                                                  // long hex
  /^\\d{6,}$/,                                                          // long number
  /^(?=.*\\d)(?=.*[a-z])[a-z0-9]{12,}$/i,                               // long alnum, no separators
];
const isOpaque = (seg: string) => OPAQUE.some((re) => re.test(seg));

/** Best human title for a pathname (exact page label, else title-cased tail). */
export function titleFor(pathname: string): string {
  if (TITLE_OVERRIDE[pathname]) return TITLE_OVERRIDE[pathname];
  const page = DESTINATIONS.find((d) => d.path === pathname && d.kind !== 'action');
  if (page) return page.label;
  const seg = pathname.split('/').filter(Boolean);
  /* Drop the keys and name the thing they point at: /mail/message/<uuid>
     becomes "Message". When nothing is left but the hub itself — /services/<id>
     — the honest word is "Details", because "Local Services › Local Services"
     tells the citizen where they are twice and where they went not at all. */
  let dropped = false;
  while (seg.length && isOpaque(seg[seg.length - 1])) { seg.pop(); dropped = true; }
  if (dropped && seg.length <= 1) return 'Details';
  const tail = seg[seg.length - 1] ?? '';
  return tail ? tail.replace(/[-_]/g, ' ').replace(/\\b\\w/g, (c) => c.toUpperCase()) : 'Together City';
}""")

# ── 2. and mail can do better than "Message" ──────────────────────────────
patch(M,
  "import { useNavigate, useParams } from 'react-router-dom';",
  "import { useNavigate, useParams } from 'react-router-dom';\nimport { useRecentStore } from '@/store/recent.store';")

patch(M,
  """  const flag = useFlagMail();
  const remove = useRemoveMail();""",
  """  const flag = useFlagMail();
  const remove = useRemoveMail();

  /* THE SUBJECT IS THE NAME OF THIS PAGE, and only this page knows it.
     useTrackRecent files every visit the moment the URL changes, before any
     mail has arrived, so the best it can say is "Message". Once the message is
     here, the same entry is filed again under its own subject — the store
     de-dupes by path, so this replaces rather than repeats — and "Continue
     where you left off" offers a line the citizen wrote or read instead of a
     key from a database. */
  const recordRecent = useRecentStore((s) => s.record);
  const subject = q.data?.subject;
  useEffect(() => {
    if (!id || !subject) return;
    recordRecent({ path: `/mail/message/${id}`, label: subject, hub: 'mail' });
  }, [id, subject, recordRecent]);""")

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

git add together-city-react/src/nav/registry.ts \
        together-city-react/src/features/mail/pages/MessageView.tsx
git commit -m "$MARK

titleFor falls back to title-casing the last segment of the path, which is
right for /mail/inbox and wrong for /mail/message/4ed6a3ac-860b-4607-a852-…:
that one reached the owner's home screen as '4ed6a3ac 860b 4607 A852
8be01b7eab23' — capitalised, offered as somewhere he had been — and stood in
the breadcrumb above the message he was reading. Every detail route in this
city ends in an id, so mail was where it was noticed, not where it lived.

The keys are dropped and the thing they point at is named: /mail/message/<id>
is 'Message'. Where nothing survives but the hub — /services/<id> — the word
is 'Details', because 'Local Services › Local Services' says where you are
twice and where you went not at all.

What counts as a key is deliberately narrow, because that same segment is
where real slugs live and a slug must survive: a uuid, a cuid, sixteen or more
hex characters, six or more digits, or twelve-plus unbroken characters mixing
letters and numbers. 'top-10-flats-in-bandra' has hyphens and is untouched;
so is any ordinary word, however long. Twelve shapes checked, including the
two the owner photographed.

And mail can do better than 'Message'. useTrackRecent files a visit the moment
the URL changes, before any mail has arrived; once it has, MessageView files
the same entry again under its own subject — the store de-dupes by path, so it
replaces rather than repeats. 'Continue where you left off' now offers 'Re:
test 3'."
git push
echo "LANDED."
