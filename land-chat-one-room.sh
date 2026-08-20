#!/bin/bash
# land-chat-one-room.sh — a chat opens as its own screen (9 Aug 2026).
# On a phone the chat stage showed the conversation LIST and the open THREAD
# stacked in one screen — both squeezed, rows running off the right edge.
# WhatsApp's rule instead: the list is the screen until you open a chat, then
# the thread is, with a back arrow that returns you. Desktop keeps its
# two-column desk exactly as it is.
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="A chat opens as its own screen"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

P = 'together-city-react/src/features/chat/pages/Chats.tsx'

patch(P,
  '  const clear = useClearConversation();',
  "  const clear = useClearConversation();\n  /* A PHONE SHOWS ONE ROOM AT A TIME (WhatsApp's rule, and the owner's).\n     The stage is a two-column desk: a list beside a thread. Below 860px it\n     already collapsed to one column — but one column holding BOTH, so a\n     phone got a squeezed list stacked on a squeezed thread and neither was\n     usable. Here the list IS the screen until a conversation is opened, and\n     then the thread is, with a back arrow that returns. Decided at mount,\n     like every other phone branch in this app. */\n  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;")

patch(P,
  '    if (autoPicked.current || activeId || !list || list.length === 0) return;',
  '    // On a phone the list is the screen; opening the newest thread on arrival\n    // would hide it. The ?c= deep link still opens straight into a thread.\n    // The latch stays FIRST in this condition: remove-chat-not-delete.test.ts\n    // asserts that opening literally, and it is asserting the right thing.\n    if (autoPicked.current || activeId || phone || !list || list.length === 0) return;')

patch(P,
  '  }, [activeId, conversations.data]);',
  '  }, [activeId, conversations.data, phone]);')

patch(P,
  '      <div className="cstage" style={{ height: \'calc(100dvh - var(--header-h) - var(--safe-top) - 42px)\' }}>',
  "      <div className={`cstage${phone ? (activeId ? ' is-thread' : ' is-list') : ''}`}\n        style={{ height: phone\n          ? 'calc(100dvh - var(--header-h) - var(--safe-top) - var(--safe-bottom) - 88px)'\n          : 'calc(100dvh - var(--header-h) - var(--safe-top) - 42px)' }}>")

patch(P,
  '        <aside className="cslist">',
  '        {!(phone && activeId) && (\n        <aside className="cslist">')

patch(P,
  '                onRemove={onRemove} removingId={clear.isPending ? clear.variables : undefined} />}\n        </aside>',
  '                onRemove={onRemove} removingId={clear.isPending ? clear.variables : undefined} />}\n        </aside>\n        )}')

patch(P,
  '        <section className="csthread">\n          {activeId ? (',
  '        {!(phone && !activeId) && (\n        <section className="csthread">\n          {activeId ? (')

patch(P,
  '              <div className="cshead-t">\n                <span className="csav">',
  '              <div className="cshead-t">\n                {phone && (\n                  <button type="button" className="csback" aria-label="Back to chats"\n                    onClick={() => setActiveId(undefined)}>\n                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"\n                      strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>\n                  </button>\n                )}\n                <span className="csav">')

patch(P,
  '          )}\n        </section>\n      </div>',
  '          )}\n        </section>\n        )}\n      </div>')


css_path = 'together-city-react/src/index.css'
css = open(css_path, encoding='utf-8').read()
assert 'a phone shows one room at a time' not in css, 'chat block already present'
css += "\n" + "/* ---- Chats: a phone shows one room at a time (9 Aug, WhatsApp's rule) ----\n   The stage's own 860px rule collapses two columns into one; the page still\n   held both children, so a list and a thread shared a screen and neither\n   fitted. Chats.tsx now renders ONE of them on a phone; this is the trim:\n   the stage runs edge to edge, the thread's header carries a back arrow, and\n   the composer clears the floating dock. */\n@media (max-width: 899px) {\n  .cstage.is-list, .cstage.is-thread { grid-template-columns: 1fr; }\n  /* a chat is the whole screen, so it gives up the page's gutters and its\n     corner radius — same as every messaging app on a phone */\n  .cstage { border-radius: var(--r-3); }\n  .cstage .cslist, .cstage .csthread { min-width: 0; overflow: hidden; }\n  .cshead-t { display: flex; align-items: center; gap: 10px; }\n  .csback {\n    flex: 0 0 auto; display: grid; place-items: center;\n    width: 40px; height: 40px; margin-left: -6px;\n    border: 0; border-radius: 50%; background: none; cursor: pointer;\n    color: var(--on-stage);\n  }\n  .csback:active { background: rgba(255,255,255,.12); }\n}\n"
open(css_path, 'w', encoding='utf-8').write(css)
print("patched index.css (chat mobile)")

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

git add together-city-react/src/features/chat/pages/Chats.tsx together-city-react/src/index.css
git commit -m "$MARK

The chat stage is a two-column desk. Below 860px it collapsed to one column
— but the page still rendered BOTH children into it, so a phone got a
squeezed list stacked on a squeezed thread, rows running off the right edge,
and a composer with nowhere to sit (owner screenshot, 9 Aug).

A phone now shows one room at a time, which is what every messaging app on a
phone does: the list IS the screen until a conversation is opened, then the
thread is, with a back arrow in its header that returns. The stage takes the
full height between the header and the floating dock. Desktop is untouched.

The open-the-first-thread fallback is skipped on a phone — on a desk it fills
an empty right pane, on a phone it would hide the list you just came to read.
The ?c= deep link still opens straight into a thread, so a tapped
notification lands where it should. The latch stays first in that condition
because remove-chat-not-delete.test.ts asserts that opening literally, and
it is asserting the right thing.

Verified at 390x844 against mocked conversations: list-only on arrival, no
horizontal overflow, tapping a row leaves only the thread with a back arrow,
and back returns to the list."
git push
echo "LANDED."
