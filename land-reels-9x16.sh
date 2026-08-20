#!/bin/bash
# land-reels-9x16.sh — the reel is the screen (9 Aug 2026).
# The reels viewer capped video width at 58vw — sized for the desktop page
# with its side rail, and on a 390px phone that is a 226px thumbnail with a
# screen of white around it. On phones the player is now 9:16 full-bleed:
# the card fills the screen, the video draws WHOLE on black (object-fit:
# contain — never cropped, same rule as the hub art), the action rail and
# the author/caption move onto the picture in white. Desktop is untouched.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The reel is the screen"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

P = 'together-city-react/src/features/social/ReelsView.tsx'

patch(P,
  "  const video = post.media.find((m) => m.kind === 'video');",
  "  // Phone: the reel IS the screen — 9:16 full-bleed like every reels player.\n  // The action rail and caption move ONTO the video in white; desktop keeps\n  // the white-page card with the rail beside it. Mount-time matchMedia, the\n  // same pattern the sign-in backdrop and the poster walk use.\n  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;\n  const video = post.media.find((m) => m.kind === 'video');")

patch(P,
  "<div style={{ position: 'relative', width: 'fit-content', height: 'fit-content', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', background: '#000', borderRadius: 14, overflow: 'hidden', lineHeight: 0 }}>",
  "<div style={phone\n        ? { position: 'relative', width: '100%', height: '100%', background: '#000', overflow: 'hidden', lineHeight: 0, display: 'grid', placeItems: 'center' }\n        : { position: 'relative', width: 'fit-content', height: 'fit-content', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', background: '#000', borderRadius: 14, overflow: 'hidden', lineHeight: 0 }}>")

patch(P,
  "            style={{ display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', minWidth: 260, minHeight: 200, background: 'var(--media-bg)' }} />",
  "            style={phone\n              ? { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }\n              : { display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)', minWidth: 260, minHeight: 200, background: 'var(--media-bg)' }} />")

patch(P,
  "            style={{ display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)' }} />",
  "            style={phone\n              ? { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }\n              : { display: 'block', width: 'auto', height: 'auto', maxHeight: '82dvh', maxWidth: 'min(760px, 58vw)' }} />")

patch(P,
  "      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>",
  "      style={{ background: 'none', border: 'none', cursor: 'pointer', color: phone ? '#fff' : 'var(--ink)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>")

patch(P,
  "        <div style={{ position: 'absolute', left: '100%', bottom: 4, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>",
  "        <div style={phone\n          ? { position: 'absolute', right: 10, bottom: 96, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }\n          : { position: 'absolute', left: '100%', bottom: 4, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>")

patch(P,
  "        <div style={{ position: 'absolute', top: '100%', left: 0, marginTop: 12, width: '100%', color: 'var(--ink)' }}>",
  "        <div style={phone\n          ? { position: 'absolute', left: 12, right: 64, bottom: 14, color: '#fff' }\n          : { position: 'absolute', top: '100%', left: 0, marginTop: 12, width: '100%', color: 'var(--ink)' }}>")

patch(P,
  "            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>",
  "            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: phone ? '#fff' : 'var(--ink)', display: 'flex', alignItems: 'center', gap: 8 }}>")

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
npx vitest run
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/features/social/ReelsView.tsx
git commit -m "$MARK

The reels viewer sized videos for the desktop page — max 58vw so the side
rail and arrows fit beside the card — and a phone inherited that arithmetic:
a 226px thumbnail floating in white (owner, from a phone screenshot).

On phones the player is 9:16 full-bleed: the card fills the screen, the
video draws whole on black (object-fit: contain, never cropped — the same
sentence the hub art speaks), and the like/comment/share rail and the
author line move onto the picture in white, reels-grammar. Landscape video
letterboxes; portrait fills. Decided at mount via the same matchMedia the
sign-in backdrop uses. Desktop keeps the white-page card unchanged."
git push
echo "LANDED."
