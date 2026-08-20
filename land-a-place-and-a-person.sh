#!/bin/bash
# land-a-place-and-a-person.sh — "A place and a person can be sent."
#
# MessageType.LOCATION and .CONTACT have been in the enum since the schema was
# written, the socket has always accepted them, and chat.gateway's previewOf has
# always known how to label them ('📍 Location', '👤 Contact'). Nothing could
# make one. This is the way in.
#
# NO MIGRATION, NO ROUTE, NO SOCKET EVENT. A location and a contact are cards,
# and `shareJson` has carried cards since it was written — tombstoned on delete,
# copied by forwardMessage, already parsed on the way out. What was missing was
# three typed fields, because the two things a card of this sort must carry are
# a coordinate and a citizen, and neither survives being written into `meta` as
# prose. `kind` on ShareCardSchema is deliberately an OPEN string (its own
# comment says so, in the commit that fixed the Entertainment hub), so 'location'
# and 'citizen' need no enum edit either.
#
# A CONTACT IS A CITIZEN, NOT A PHONE NUMBER. Picked from the people you already
# chat with, carrying a handle so the card opens /social/u/:handle where Message
# and Connect already live. The browser cannot read an address book, a typed-in
# number would be a phone number pasted into an attachment surface that is
# currently public and permanent, and a card that names somebody outside the
# city is a card that cannot be tapped. Name, avatar, handle — nothing else.
#
# THE COORDINATE IS A NUMBER. `lat`/`lng` are typed and range-checked on the
# server rather than smuggled through `meta: string[]` or parsed back out of the
# deepLink. A coordinate that travels as prose is a coordinate somebody
# eventually parses wrong, and it is not the kind of wrong that shows up in a
# screenshot — it is the kind that puts a pin in the sea.
#
# LIVE LOCATION IS NOT IN THIS COMMIT. It is the next one: it needs an expiry
# the server can enforce, a socket event per update, and an honest answer for
# what a shared position means once the tab that was broadcasting it is closed.
# The static pin is complete on its own and does not become wrong when live
# arrives — a live card is this card with a clock on it.
#
# APPLY-shape, idempotent. Frontend plus three lines of backend validation.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-chat ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

# Park EVERY stale lock, not just index.lock. The last script cleared
# .git/index.lock, ran every gate green, and then died on .git/HEAD.lock at the
# commit — a second lock left by the same interrupted run through the bridge.
mkdir -p _to_delete
for L in .git/HEAD.lock .git/index.lock .git/config.lock .git/refs/heads/main.lock; do
  if [ -e "$L" ] && [ ! -s "$L" ]; then
    mv "$L" "_to_delete/$(basename "$L").$(date +%s)" && echo "== Parked a stale $L"
  fi
done

LOG="$(git log --oneline -100)"
NEEDS="A message can be answered without words"
case "$LOG" in
  *"$NEEDS"*) ;;
  *) echo "!! This lands on top of \"$NEEDS\" — run land-a-message-can-be-answered-without-words-3.sh first."; exit 1 ;;
esac
MARK="A place and a person can be sent"
case "$LOG" in
  *"$MARK"*) echo "== \"$MARK\" is already here. Nothing to do."; exit 0 ;;
esac

OWNED_TMP="$(mktemp)"; trap 'rm -f "$OWNED_TMP"' EXIT
# Directory forms included: git status collapses a wholly untracked directory to
# one entry with a trailing slash and never names the file inside it, which is
# what stopped the previous script's second run.
cat > "$OWNED_TMP" <<'EOF'
together-city-chat/src/messages/dto/messages.dto.ts
together-city-react/src/api/schemas.ts
together-city-react/src/api/chat.api.ts
together-city-react/src/types/index.ts
together-city-react/src/features/chat/share.tsx
together-city-react/src/features/chat/components/Composer.tsx
together-city-react/src/features/chat/components/AttachPanels.tsx
together-city-react/src/features/chat/pages/Chats.tsx
together-city-react/src/app/a-place-and-a-person.test.ts
EOF

# SCOPE IS DECIDED BY PATH, NEVER BY STATUS PREFIX.
#
# This used to skip its own scratch files by matching '^?? land-*.sh' —
# untracked only. The moment a run got as far as `git add`, those same files
# became 'A  land-*.sh', stopped matching, and the NEXT run rejected them as
# another session's work. A guard whose verdict changes because an earlier
# attempt got further is a guard that punishes resuming, which is the one thing
# an APPLY-shape script exists to allow. `awk '{print $NF}'` already reduces
# every porcelain line to its path; the filtering belongs there and only there.
#
# The parallel mail session owns src/mail on both sides and index.css this
# evening. Tolerated rather than stashed: `git stash` is one stack shared by
# every session in this repo, and the last time two runs shared it, one popped
# entries it had not pushed.
BAD="$(git status --porcelain \
  | awk '{print $NF}' \
  | grep -Ev '^(land-[^/]*\.sh|push-[^/]*\.sh|[^/]*\.patch|apply-[^/]*\.py|[^/]*\.css|[^/]*\.log)$' \
  | grep -Ev '(together-city-chat/src/mail/|together-city-react/src/features/mail/|^together-city-react/src/index\.css$)' \
  | grep -Fxv -f "$OWNED_TMP" || true)"
if [ -n "$BAD" ]; then
  echo "!! Working tree has changes outside this script's scope and outside the mail session's. Commit first:"
  echo "$BAD"; exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "== Continuing over the mail session's files and this script's own."
fi

echo "== Applying anchored edits"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text(encoding='utf-8')
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:240]}")
    if present not in replacement:
        sys.exit(f"!! {path}: idempotence marker is not in the text it inserts.\n--- marker: {present}")
    p.write_text(s.replace(anchor, replacement), encoding='utf-8'); print(f"   + {path}")

DTO    = 'together-city-chat/src/messages/dto/messages.dto.ts'
SCH    = 'together-city-react/src/api/schemas.ts'
API    = 'together-city-react/src/api/chat.api.ts'
TYPES  = 'together-city-react/src/types/index.ts'
SHARE  = 'together-city-react/src/features/chat/share.tsx'
COMP   = 'together-city-react/src/features/chat/components/Composer.tsx'
CHATS  = 'together-city-react/src/features/chat/pages/Chats.tsx'

# ── 1 · three typed fields, validated on the server ─────────────────────────
apply(DTO, "lat: z.number().finite().min(-90).max(90).nullish()",
r'''  items: z.array(z.string().max(120)).max(16).nullish(),
});''',
r'''  items: z.array(z.string().max(120)).max(16).nullish(),
  /* A COORDINATE IS A NUMBER, AND IT IS RANGE-CHECKED HERE.
     The alternative was smuggling it through `meta: string[]` or parsing it
     back out of the deepLink, and a coordinate that travels as prose is one
     somebody eventually parses wrong — not the kind of wrong that shows up in
     a screenshot, the kind that puts a pin in the sea. Nullish like every
     other optional field on this card: the web sends explicit null. */
  lat: z.number().finite().min(-90).max(90).nullish(),
  lng: z.number().finite().min(-180).max(180).nullish(),
  /* CONTACT cards: the citizen the card is about. Bounded rather than .uuid()
     so this cannot start 400ing if an id format ever changes underneath it —
     nothing here dereferences it, it is carried so the recipient's client can
     recognise a person it may already know. */
  userId: z.string().max(64).nullish(),
});''')

# ── 2 · the same three on the client, in BOTH places ────────────────────────
apply(SCH, "lat: z.number().nullable().optional()",
r'''  items: z.array(z.string()).nullable().optional(),
});''',
r'''  items: z.array(z.string()).nullable().optional(),
  /* zod strips what a schema does not declare — the way quoted replies were
     lost between the wire and the component — so these are declared in the
     same breath as the type in types/index.ts. */
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  userId: z.string().nullable().optional(),
});''')

apply(TYPES, "lat?: number | null;",
r'''  /** Line items of a composite card — e.g. every dish in a shared meal. */
  items?: string[] | null;
}''',
r'''  /** Line items of a composite card — e.g. every dish in a shared meal. */
  items?: string[] | null;
  /** LOCATION cards only. Numbers, and only ever numbers. */
  lat?: number | null;
  lng?: number | null;
  /** CONTACT cards only — the citizen this card is about. */
  userId?: string | null;
}''')

# ── 3 · the send path carries a card, and names what kind of message it is ──
apply(API, "const SHARE_MESSAGE_TYPE",
r'''export function useChatRealtime(''',
r'''/* A CARD THAT IS THE WHOLE MESSAGE GETS ITS OWN TYPE.
   A shared film is a TEXT message with a card attached to it — somebody wrote a
   line and hung a poster on it. A location and a contact are not: the card IS
   the message, which is why MessageType has had LOCATION and CONTACT in it
   since the schema was written and why previewOf already knows to render them
   as '📍 Location' and '👤 Contact' in a push. Every other kind stays TEXT, so
   no existing share changes behaviour. */
const SHARE_MESSAGE_TYPE: Record<string, 'LOCATION' | 'CONTACT'> = {
  location: 'LOCATION',
  citizen: 'CONTACT',
};

export function useChatRealtime(''')

apply(API, "replyToMessageId?: string, share?: ShareCard)",
r'''  const send = useCallback((body: string, attachments?: OutgoingAttachment[], replyToMessageId?: string) => {
    if (!conversationId) return;
    const list = attachments?.length ? attachments : undefined;
    socketClient.emit(WS.SEND_MESSAGE, {
      conversationId,
      body,
      clientId: crypto.randomUUID(),
      ...(list ? { attachments: list, messageType: messageTypeFor(list) } : null),
      // SocketSendSchema has accepted this since it was written.
      ...(replyToMessageId ? { replyToMessageId } : null),
    });
  }, [conversationId]);''',
r'''  const send = useCallback((body: string, attachments?: OutgoingAttachment[], replyToMessageId?: string, share?: ShareCard) => {
    if (!conversationId) return;
    const list = attachments?.length ? attachments : undefined;
    socketClient.emit(WS.SEND_MESSAGE, {
      conversationId,
      body,
      clientId: crypto.randomUUID(),
      ...(list ? { attachments: list, messageType: messageTypeFor(list) } : null),
      /* The card, and the type only when the card IS the message. An unknown
         kind falls through to TEXT rather than to undefined — the send schema
         defaults it anyway, and a hub coining a new kind should never start
         failing here. */
      ...(share ? { share, ...(SHARE_MESSAGE_TYPE[share.kind] ? { messageType: SHARE_MESSAGE_TYPE[share.kind] } : null) } : null),
      // SocketSendSchema has accepted this since it was written.
      ...(replyToMessageId ? { replyToMessageId } : null),
    });
  }, [conversationId]);''')

# ── 4 · the card renders as what it is ──────────────────────────────────────
apply(SHARE, "location: { icon: '📍', label: 'Location' }",
r'''  post: { icon: '📝', label: 'Post' },
};''',
r'''  post: { icon: '📝', label: 'Post' },
  location: { icon: '📍', label: 'Location' }, citizen: { icon: '👤', label: 'Citizen' },
};''')

apply(SHARE, "const isLocation =",
r'''export function ShareCardView({ card, compact, clickable }: { card: ShareCard; compact?: boolean; clickable?: boolean }) {
  const meta = KIND_META[card.kind] ?? { icon: '🔗', label: 'Shared' };
  const ctaText = KIND_META[card.kind] ? `View ${meta.label} →` : 'View in hub →';
  const asLink = Boolean(clickable && card.deepLink);''',
r'''export function ShareCardView({ card, compact, clickable }: { card: ShareCard; compact?: boolean; clickable?: boolean }) {
  const meta = KIND_META[card.kind] ?? { icon: '🔗', label: 'Shared' };
  const ctaText = KIND_META[card.kind] ? `View ${meta.label} →` : 'View in hub →';
  /* A location card is not a link, and that is the one exception here. Wrapping
     a draggable map in an <a> means every attempt to look around it navigates
     away instead — so the map keeps its own gestures and the way out is a small
     explicit link under it. The check is on the NUMBERS, not on the kind alone:
     a card claiming to be a location without a coordinate is a card that would
     render an empty grey square, and it falls back to the ordinary shape. */
  const isLocation = card.kind === 'location'
    && typeof card.lat === 'number' && typeof card.lng === 'number';
  const isCitizen = card.kind === 'citizen';
  const asLink = Boolean(clickable && card.deepLink && !isLocation);''')

apply(SHARE, "aria-label={`Map showing",
r'''  const body = (
    <>
      {card.image && <div style={{ aspectRatio: '16 / 9', background: 'var(--line)' }}><img src={card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}''',
r'''  const body = (
    <>
      {/* THE MAP IS THE CARD. A location rendered as a title and a pair of
          decimals is a location nobody can read — the whole content of the
          message is where it is, and that is a picture. */}
      {isLocation && (
        <div aria-label={`Map showing ${card.title}`}>
          <SlippyMap lat={card.lat as number} lng={card.lng as number} zoom={15} height={150} pin />
        </div>
      )}
      {/* A person is a face and a name, not a 16:9 cover photo. The generic
          image block below would print an avatar as a letterboxed banner. */}
      {isCitizen && card.image && (
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12 }}>
          <img src={card.image} alt="" width={56} height={56}
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', background: 'var(--line)' }} />
        </div>
      )}
      {card.image && !isCitizen && <div style={{ aspectRatio: '16 / 9', background: 'var(--line)' }}><img src={card.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}''')

apply(SHARE, "import { SlippyMap }",
r'''import { Button, Spinner } from '@/components/ui';''',
r'''import { Button, Spinner } from '@/components/ui';
import { SlippyMap } from '@/components/SlippyMap';''')

# ── 5 · the page hands a card to the socket ─────────────────────────────────
apply(CHATS, "attachments?: OutgoingAttachment[], share?: ShareCard",
r'''  const sendWithReply = useCallback((body: string, attachments?: OutgoingAttachment[]) => {
    const answering = replyTo?.id;
    setReplyTo(null);
    send(body, attachments, answering);
  }, [send, replyTo]);''',
r'''  const sendWithReply = useCallback((body: string, attachments?: OutgoingAttachment[], share?: ShareCard) => {
    const answering = replyTo?.id;
    setReplyTo(null);
    send(body, attachments, answering, share);
  }, [send, replyTo]);''')

apply(CHATS, "import type { Message, ShareCard }",
r'''import type { Message } from '@/types';''',
r'''import type { Message, ShareCard } from '@/types';''')

print("== Wire and rendering applied.")
PYEOF

echo "== Writing the two panels"
python3 <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/features/chat/components/AttachPanels.tsx')
src = '''import { useMemo, useState } from 'react';
import { LocationPicker, type LocationValue } from '@/components/LocationPicker';
import { geoApi } from '@/api/geo.api';
import { useChatContacts } from '@/api';
import type { ShareCard } from '@/types';

/**
 * TWO MORE WAYS TO PUT SOMETHING IN A MESSAGE THAT IS NOT TYPING.
 *
 * Both are sheets rather than inline panels, for the same reason the bulk bar
 * is not: the composer is fixed to a locked visual viewport on a phone, and
 * anything that grows upward from it grows under a keyboard. A sheet owns the
 * screen while it is open, and the keyboard is dismissed by the act of opening
 * it.
 *
 * They wear `card`, which is the one global class the chat stage deliberately
 * scopes — `.cstage .card` restores the city's ink, so a white sheet on the
 * dark stage is readable rather than near-white on white. See
 * a-stage-does-not-export-its-ink.test.ts, which exists because that went
 * wrong twice.
 */

function Sheet({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(20,18,12,.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div className="card" style={{ width: 'min(460px, 100%)', maxHeight: '84vh', overflowY: 'auto', padding: '20px 22px' }}
        onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 17, flex: 1 }}>{title}</h3>
          <button type="button" className="btn btn-line btn-sm" onClick={onClose}>Cancel</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * WHERE YOU ARE, OR WHEREVER YOU POINT AT.
 *
 * LocationPicker is reused whole — search an address, drag the pin, or press
 * the button — because "where is this" is the same question the Services hub
 * already asks, and a second answer to it would be a second thing to keep
 * right. The address is fetched ONCE, on send, rather than on every drag: it is
 * needed for the card's title and nowhere else, and Nominatim is donated
 * hardware.
 */
export function LocationSheet({ onClose, onSend }: {
  onClose: () => void;
  onSend: (card: ShareCard) => void;
}) {
  const [value, setValue] = useState<LocationValue>({ lat: '', lng: '', accuracy: null });
  const [busy, setBusy] = useState(false);
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  const pinned = value.lat !== '' && value.lng !== '' && Number.isFinite(lat) && Number.isFinite(lng);

  const send = async () => {
    if (!pinned || busy) return;
    setBusy(true);
    // A failed lookup is not a failed send. The coordinate is the message; the
    // address is a courtesy, and "Shared location" is an honest stand-in.
    const label = await geoApi.reverse(lat, lng).then((p) => p?.label ?? null).catch(() => null);
    onSend({
      kind: 'location',
      title: label ?? 'Shared location',
      subtitle: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      lat,
      lng,
      deepLink: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
    });
  };

  return (
    <Sheet title="Send a location" onClose={onClose}>
      <LocationPicker value={value} onChange={setValue}
        hint="Search an address, drag the pin, or use your current position." />
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
        <button type="button" className="btn btn-sm" disabled={!pinned || busy}
          onClick={() => { void send(); }}>
          {busy ? 'Sending…' : 'Send this location'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * A CONTACT IS A CITIZEN.
 *
 * Picked from the people you already chat with, and carrying a handle so the
 * card opens the profile where Message and Connect already live. The browser
 * cannot read an address book; a typed-in number would be a phone number
 * pasted into an attachment surface that is currently public and permanent;
 * and a card naming somebody outside the city is a card that cannot be tapped.
 *
 * Somebody with no handle is still sendable — the card just does not link.
 * Dropping them from the list instead would be a contact picker that silently
 * cannot find a person the citizen can see in their own chat list.
 */
export function ContactSheet({ onClose, onSend }: {
  onClose: () => void;
  onSend: (card: ShareCard) => void;
}) {
  const contacts = useChatContacts();
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const all = contacts.data ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) =>
      c.name.toLowerCase().includes(needle) || (c.handle ?? '').toLowerCase().includes(needle));
  }, [contacts.data, q]);

  const pick = (c: { id: string; name: string; handle?: string | null; profileImage?: string | null }) => {
    onSend({
      kind: 'citizen',
      title: c.name,
      subtitle: c.handle ? `@${c.handle}` : null,
      image: c.profileImage ?? null,
      userId: c.id,
      deepLink: c.handle ? `/social/u/${c.handle}` : null,
    });
  };

  return (
    <Sheet title="Send a contact" onClose={onClose}>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus
        aria-label="Search your contacts" placeholder="Search by name or handle…"
        className="input" style={{ width: '100%', fontSize: 16, marginBottom: 12 }} />
      {contacts.isLoading && <p className="muted" style={{ fontSize: 13, margin: 0 }}>Loading…</p>}
      {contacts.isError && <p role="alert" style={{ fontSize: 13, margin: 0 }}>Your contacts could not be loaded just now.</p>}
      {contacts.data && list.length === 0 && (
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          {q.trim() ? 'Nobody here matches that.' : 'You are not connected to anybody yet.'}
        </p>
      )}
      <div style={{ display: 'grid', gap: 6 }}>
        {list.map((c) => (
          <button key={c.id} type="button" className="btn btn-line btn-sm"
            style={{ justifyContent: 'flex-start', gap: 10, minHeight: 44 }}
            onClick={() => pick(c)}>
            {c.profileImage
              ? <img src={c.profileImage} alt="" width={26} height={26}
                  style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
              : <span aria-hidden style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%',
                  display: 'grid', placeItems: 'center', background: 'var(--line)', fontSize: 11, fontWeight: 700 }}>
                  {c.name.slice(0, 1).toUpperCase()}
                </span>}
            <span style={{ minWidth: 0, textAlign: 'left' }}>
              <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
              {c.handle && <span className="muted" style={{ display: 'block', fontSize: 11 }}>@{c.handle}</span>}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
'''
if p.exists() and p.read_text(encoding='utf-8') == src:
    print('   = AttachPanels: already written')
else:
    p.write_text(src, encoding='utf-8')
    print(f'   + {p}')
PYEOF

echo "== Wiring the composer"
python3 <<'PYEOF'
import pathlib, sys

def apply(path, present, anchor, replacement):
    p = pathlib.Path(path); s = p.read_text(encoding='utf-8')
    if present in s:
        print(f"   = {path}: already applied"); return
    if s.count(anchor) != 1:
        sys.exit(f"!! {path}: anchor matched {s.count(anchor)}x (need 1).\n--- anchor:\n{anchor[:240]}")
    if present not in replacement:
        sys.exit(f"!! {path}: idempotence marker is not in the text it inserts.\n--- marker: {present}")
    p.write_text(s.replace(anchor, replacement), encoding='utf-8'); print(f"   + {path}")

COMP = 'together-city-react/src/features/chat/components/Composer.tsx'

apply(COMP, "import { LocationSheet, ContactSheet }",
r'''import type { OutgoingAttachment } from '@/api';''',
r'''import type { OutgoingAttachment } from '@/api';
import type { ShareCard } from '@/types';
import { LocationSheet, ContactSheet } from './AttachPanels';''')

apply(COMP, "share?: ShareCard) => void;",
r'''  onSend: (body: string, attachments?: OutgoingAttachment[]) => void;''',
r'''  onSend: (body: string, attachments?: OutgoingAttachment[], share?: ShareCard) => void;''')

apply(COMP, "const [sheet, setSheet]",
r'''  const [recSec, setRecSec] = useState<number | null>(null);''',
r'''  const [recSec, setRecSec] = useState<number | null>(null);
  /* One at a time, by construction: a place and a person are both answers to
     "what goes in this message", and two sheets open at once is two answers. */
  const [sheet, setSheet] = useState<'location' | 'contact' | null>(null);''')

apply(COMP, "const sendCard =",
r'''  const submit = (e: FormEvent) => {''',
r'''  /* A CARD IS THE WHOLE MESSAGE, so it does not take the typed text with it.
     Somebody halfway through a sentence who stops to send a pin should find the
     sentence still there afterwards — the alternative is a composer that eats
     what you were writing every time you attach something. */
  const sendCard = (card: ShareCard) => {
    setSheet(null);
    onSend('', undefined, card);
  };

  const submit = (e: FormEvent) => {''')

apply(COMP, 'aria-label="Send a location"',
r'''              <button type="button" className="cstool" aria-label="Record a voice note"
                disabled={Boolean(busy)} onClick={() => void startRec()}>🎙</button>''',
r'''              <button type="button" className="cstool" aria-label="Record a voice note"
                disabled={Boolean(busy)} onClick={() => void startRec()}>🎙</button>
              {/* Alongside the paperclip and the microphone, because all four
                  are the same act: put something in the message that is not
                  typing. The right-hand corner still belongs to Send alone. */}
              <button type="button" className="cstool" aria-label="Send a location"
                disabled={Boolean(busy)} onClick={() => setSheet('location')}>📍</button>
              <button type="button" className="cstool" aria-label="Send a contact"
                disabled={Boolean(busy)} onClick={() => setSheet('contact')}>👤</button>''')

apply(COMP, "{sheet === 'location' &&",
r'''      </form>
    </div>
  );
}''',
r'''      </form>
      {sheet === 'location' && <LocationSheet onClose={() => setSheet(null)} onSend={sendCard} />}
      {sheet === 'contact' && <ContactSheet onClose={() => setSheet(null)} onSend={sendCard} />}
    </div>
  );
}''')

print("== Composer wired.")
PYEOF

echo "== Writing the guard"
python3 <<'PYEOF'
import pathlib
p = pathlib.Path('together-city-react/src/app/a-place-and-a-person.test.ts')
src = '''import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p: string[]) => readFileSync(join(web, ...p), 'utf8');
const strip = (s: string) =>
  s.replace(/\\/\\*[\\s\\S]*?\\*\\//g, ' ').replace(/(^|[^:])\\/\\/.*$/gm, '$1 ');

const schemas = strip(read('api', 'schemas.ts'));
const types = strip(read('types', 'index.ts'));
const api = strip(read('api', 'chat.api.ts'));
const share = strip(read('features', 'chat', 'share.tsx'));
const panels = strip(read('features', 'chat', 'components', 'AttachPanels.tsx'));
const composer = strip(read('features', 'chat', 'components', 'Composer.tsx'));

/**
 * A PLACE AND A PERSON CAN BE SENT.
 *
 * MessageType.LOCATION and .CONTACT were in the enum from the beginning and
 * nothing could make one. The things that would quietly undo that are pinned
 * here: a coordinate turning back into prose, a card losing its type on the
 * way to the socket, and zod stripping a field the type still claims exists.
 */
describe('a coordinate is a number', () => {
  it('is typed on the wire, not smuggled through meta or the deepLink', () => {
    expect(schemas).toMatch(/lat: z\\.number\\(\\)\\.nullable\\(\\)\\.optional\\(\\)/);
    expect(schemas).toMatch(/lng: z\\.number\\(\\)\\.nullable\\(\\)\\.optional\\(\\)/);
    expect(types).toMatch(/lat\\?: number \\| null/);
    expect(types).toMatch(/lng\\?: number \\| null/);
  });

  it('renders a map only when the numbers are really there', () => {
    // A card claiming to be a location without a coordinate would draw an
    // empty grey square; it falls back to the ordinary card shape instead.
    expect(share).toMatch(/typeof card\\.lat === 'number' && typeof card\\.lng === 'number'/);
    expect(share).toMatch(/<SlippyMap/);
  });

  it('never wraps the map in a link', () => {
    // Wrapping a draggable map in an <a> means every attempt to look around it
    // navigates away instead.
    expect(share).toMatch(/const asLink = Boolean\\(clickable && card\\.deepLink && !isLocation\\)/);
  });
});

describe('a contact is a citizen', () => {
  it('carries the citizen id and links by handle', () => {
    expect(types).toMatch(/userId\\?: string \\| null/);
    expect(panels).toMatch(/kind: 'citizen'/);
    expect(panels).toMatch(/\\/social\\/u\\/\\$\\{c\\.handle\\}/);
  });

  it('is picked from people, never typed as a phone number', () => {
    expect(panels).toMatch(/useChatContacts/);
    expect(panels).not.toMatch(/phone|tel:/i);
  });

  it('still sends somebody who has no handle', () => {
    // Dropping them would be a picker that cannot find a person the citizen
    // can see in their own chat list.
    expect(panels).toMatch(/deepLink: c\\.handle \\? .* : null/);
  });

  it('draws a face as a face, not a 16:9 banner', () => {
    expect(share).toMatch(/isCitizen && card\\.image/);
    expect(share).toMatch(/card\\.image && !isCitizen/);
  });
});

describe('the card is the message', () => {
  it('names its own message type, and leaves every other kind as TEXT', () => {
    expect(api).toMatch(/const SHARE_MESSAGE_TYPE/);
    expect(api).toMatch(/location: 'LOCATION'/);
    expect(api).toMatch(/citizen: 'CONTACT'/);
  });

  it('reaches the socket through send, with the card as its own argument', () => {
    expect(api).toMatch(/share\\?: ShareCard/);
    expect(api).toMatch(/SHARE_MESSAGE_TYPE\\[share\\.kind\\]/);
  });

  it('does not eat the half-typed sentence beside it', () => {
    expect(composer).toMatch(/const sendCard =/);
    expect(composer).toMatch(/onSend\\('', undefined, card\\)/);
  });

  it('offers both ways in from the tool row, not a floating panel', () => {
    expect(composer).toMatch(/aria-label="Send a location"/);
    expect(composer).toMatch(/aria-label="Send a contact"/);
  });
});
'''
if p.exists() and p.read_text(encoding='utf-8') == src:
    print('   = guard: already written')
else:
    p.write_text(src, encoding='utf-8')
    print(f'   + {p}')
PYEOF

echo "== Standing in for the excluded suite: did THIS change add a findMany?"
ADDED_FINDMANY="$(git diff -- together-city-chat/src | grep -E '^\+.*\.findMany\(' || true)"
if [ -n "$ADDED_FINDMANY" ]; then
  echo "!! This change adds a findMany while shared/unbounded-reads is excluded. Check it by hand:"
  echo "$ADDED_FINDMANY"; exit 1
fi
echo "   None. The backend change is three zod fields."

echo "== Gates: backend (prisma validate + generate, tsc, jest)"
echo "   dev/dev, security/route-reach and privacy/purge-plan stay excluded — red on"
echo "   origin/main, still someone else's to fix."
echo "   shared/unbounded-reads is STILL excluded only because the mail session's"
echo "   uncommitted mail/mail.service.ts:1403 is in this tree. Once that has landed"
echo "   with its take:/unbounded: annotation, delete it from this pattern."
( cd together-city-chat \
  && npx prisma validate \
  && npx prisma generate >/dev/null \
  && npx tsc --noEmit \
  && npx jest --silent --testPathIgnorePatterns='(dev/dev|security/route-reach|privacy/purge-plan|shared/unbounded-reads)\.spec\.ts$' )

echo "== Gates: frontend (tsc, vitest, lint-ceiling, nav-audit, a11y-audit, motion-ceiling, build)"
( cd together-city-react \
  && npx tsc --noEmit \
  && npx vitest run --silent \
  && node scripts/lint-ceiling.mjs \
  && node scripts/nav-audit.mjs \
  && node scripts/a11y-audit.mjs \
  && node scripts/motion-ceiling.mjs \
  && npm run -s build )

echo "== Report-only ratchet (main already fails dead-export at 3 vs 2; not a blocker)"
( cd together-city-react && node scripts/dead-export-audit.mjs || true )

echo "== Committing"
for L in .git/HEAD.lock .git/index.lock .git/refs/heads/main.lock; do
  [ -e "$L" ] && [ ! -s "$L" ] && mv "$L" "_to_delete/$(basename "$L").$(date +%s)" || true
done
git add \
  together-city-chat/src/messages/dto/messages.dto.ts \
  together-city-react/src/api/schemas.ts \
  together-city-react/src/api/chat.api.ts \
  together-city-react/src/types/index.ts \
  together-city-react/src/features/chat/share.tsx \
  together-city-react/src/features/chat/components/Composer.tsx \
  together-city-react/src/features/chat/components/AttachPanels.tsx \
  together-city-react/src/features/chat/pages/Chats.tsx \
  together-city-react/src/app/a-place-and-a-person.test.ts \
  land-a-place-and-a-person.sh

git commit -F - <<'MSGEOF'
A place and a person can be sent

MessageType.LOCATION and .CONTACT have been in the enum since the schema was
written, the socket has always accepted them, and previewOf has always known
to label them in a push. Nothing could make one. This is the way in.

NO MIGRATION, NO ROUTE, NO SOCKET EVENT. A location and a contact are cards,
and shareJson has carried cards from the start — tombstoned on delete,
copied by forwardMessage, already parsed on the way out. What was missing
was three typed fields, because the two things a card of this sort must
carry are a coordinate and a citizen and neither survives being written into
meta as prose. `kind` is deliberately an open string, so 'location' and
'citizen' need no enum edit either.

THE COORDINATE IS A NUMBER, range-checked on the server. The alternative was
smuggling it through meta or parsing it back out of the deepLink, and a
coordinate that travels as prose is one somebody eventually parses wrong —
not the kind of wrong that shows up in a screenshot, the kind that puts a
pin in the sea. The card renders a map only when both numbers are really
there; a location without a coordinate falls back to the ordinary card
rather than drawing an empty grey square.

A location card is the one card that is NOT a link. Wrapping a draggable map
in an anchor means every attempt to look around it navigates away instead,
so the map keeps its gestures and the way out is a small explicit link.

A CONTACT IS A CITIZEN, picked from the people you already chat with and
carrying a handle so the card opens /social/u/:handle, where Message and
Connect already live. The browser cannot read an address book; a typed-in
number would be a phone number pasted into an attachment surface that is
currently public and permanent; and a card naming somebody outside the city
is a card that cannot be tapped. Somebody with no handle is still sendable —
the card just does not link, because dropping them would be a picker that
cannot find a person the citizen can see in their own chat list. A face is
drawn as a face, not as the 16:9 cover the generic card would have made of
an avatar.

The card is the whole message, so it gets its own MessageType — a shared
film is a TEXT message with a poster hung on it, a location is not. Every
other kind stays TEXT, so no existing share changes behaviour. And sending
a card does not take the half-typed sentence beside it: somebody who stops
mid-sentence to send a pin finds the sentence still there.

Both ways in sit in the composer's tool row beside the paperclip and the
microphone — the same act, put something in the message that is not typing —
and both open a sheet rather than growing upward from a composer that is
fixed to a locked visual viewport.

LIVE LOCATION IS THE NEXT COMMIT. It needs an expiry the server can enforce,
a socket event per update, and an honest answer for what a shared position
means once the tab broadcasting it is closed. The static pin is complete on
its own and does not become wrong when live arrives: a live card is this
card with a clock on it.

shared/unbounded-reads is still excluded from the backend run, and still
only because the parallel mail session's uncommitted mail/mail.service.ts:1403
is in this tree. Delete it from the pattern once that lands.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TvSk8yA3rcp4MtLPLrnCY9
MSGEOF

echo "== Landed: \"$MARK\". Push when ready."
