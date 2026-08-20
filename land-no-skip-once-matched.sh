#!/bin/bash
# land-no-skip-once-matched.sh — no skip once you are matched (11 Aug 2026).
# The match card drops its Skip button in the matched state. Connect to Chat
# takes the width it leaves; Unmatch is unchanged. Skip is untouched on the
# not-yet-matched card, where it belongs.
set -euo pipefail
cd "$(dirname "$0")"

OWNED='together-city-react/src/features/dating/pages/DatingMatchDetail.tsx
together-city-react/src/components/RecentPanel.tsx
together-city-react/src/pages/Home.tsx
together-city-react/src/features/mail/pages/Folders.tsx
together-city-react/src/index.css
together-city-react/src/app/mail-reads-on-a-phone.test.ts
together-city-react/public/assets/img/tc-icon-1024.png
together-city-react/public/assets/img/tc-icon-512.png
together-city-react/public/assets/img/tc-icon-192.png
together-city-react/public/assets/img/tc-icon-maskable-512.png
together-city-react/public/assets/img/apple-touch-icon-180.png
together-city-react/public/downloads/TogetherCity.apk
together-city-react/public/manifest.webmanifest'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' | grep -vxF "$OWNED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="No skip once you are matched"
case "$(git log --oneline -40)" in *"$MARK"*) echo "already landed?"; exit 0;; esac

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


patch(R + 'features/dating/pages/DatingMatchDetail.tsx',
  """          {matched ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'stretch' }}>
              <Button variant="line" size="md" onClick={() => pass.mutate(targetUserId, { onSuccess: () => navigate('/dating/matches') })} disabled={pass.isPending}>✕ Skip</Button>
              <Button variant="accent" size="md" disabled={connect.isPending} onClick={doConnect}>""",
  """          {matched ? (
            /* NO SKIP ONCE YOU ARE MATCHED.
               Skip is what you do to a stranger the city is offering you: it
               passes, and the queue moves on. After a match it sat beside
               Connect and Unmatch as a third thing that also removed the
               person, in a quieter word — two doors out of one room, one of
               them ambiguous. Somebody who wants out has Unmatch, which says
               what it does and asks before it does it. */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'stretch' }}>
              <Button variant="accent" size="md" disabled={connect.isPending} onClick={doConnect}>""")

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

git add together-city-react/src/features/dating/pages/DatingMatchDetail.tsx
git commit -m "$MARK

On a curated match that has already matched, the card offered three actions:
Skip, Connect to Chat, Unmatch. Two of them removed the person, and the
quieter of the two did not say so — Skip is the word for a stranger the city
is offering you, and it means pass, next. Aimed at somebody you have already
matched with it is the same act as Unmatch wearing softer clothes, sitting to
the LEFT of the primary button where a thumb finds it first.

So it goes, in the matched state only. Connect to Chat takes the width it
leaves. Anybody who wants out has Unmatch, which names what it does and asks
before it does it.

Skip is untouched on the not-yet-matched card, beside Like, which is the one
place the word is honest — and `pass` is still wired there, so nothing is
orphaned."
git push
echo "LANDED."
