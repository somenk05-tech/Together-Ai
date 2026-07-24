import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { chatApi, useConversations, useConnections, useChatContacts, isServerUnreachable, type ShareCard } from '@/api';

/* ------------------------------------------------------------------ *
 * Universal Share Sheet — a single, content-agnostic "send to people"
 * sheet meant to be reused across every hub (movies, restaurants,
 * recipes, grocery, travel, doctors, events, jobs, marketplace, music,
 * posts, profiles, …). The caller supplies a `preview` and an opaque
 * `shareKind` / `shareRef`; the sheet handles recipient discovery,
 * search, multi-select, a11y, loading and the "Sent ✓" confirmation.
 * ------------------------------------------------------------------ */

export interface SharePreview {
  imageUrl?: string | null;
  title: string;
  subtitle?: string;
  meta?: string[];
}

export type RecipientGroup = 'recent' | 'connection' | 'family' | 'group';

export interface ShareRecipient {
  id: string;
  name: string;
  subtitle?: string;
  avatarUrl?: string | null;
  initials: string;
  group: RecipientGroup;
  /** Send target — one of these is used by the send wiring (opaque to the sheet). */
  conversationId?: string;
  handle?: string;
}

export interface UniversalShareSheetProps {
  open: boolean;
  onClose: () => void;
  preview: SharePreview;
  /** What is being shared (opaque). e.g. 'movie', 'restaurant', 'recipe'. */
  shareKind: string;
  /** Reference to the shared item (opaque). e.g. an id, deep-link, or object. */
  shareRef: string | Record<string, unknown>;
  onSend: (recipients: ShareRecipient[], message: string) => Promise<void> | void;
  heading?: string;
}

/* ----------------------------- helpers ----------------------------- */

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Free-form connection.relationship labels that read as household/family.
const FAMILY_RE = /\b(family|mother|mom|father|dad|parent|sister|brother|sibling|spouse|wife|husband|partner|son|daughter|child|kid|cousin|aunt|uncle|grand|nani|nana|dada|dadi|bhai|behen|papa|mummy|maa)\b/i;

/**
 * Assembles the available recipients from whatever real data sources exist.
 * - Recent Chats / Groups ← GET /chat/conversations (useConversations)
 * - Connections           ← GET /connections?status=accepted (useConnections)
 * - Family                ← accepted connections whose free-form relationship
 *   label reads as household (no dedicated family recipient endpoint exists;
 *   the family model is a local, non-sendable household roster).
 */
export function useShareRecipients() {
  const convos = useConversations();
  const connections = useConnections('accepted');
  const contacts = useChatContacts();

  return useMemo(() => {
    const conversations = [...(convos.data ?? [])].sort(
      (a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''),
    );

    const recent: ShareRecipient[] = conversations.slice(0, 8).map((c) => ({
      id: `recent-${c.id}`,
      name: c.title ?? 'Conversation',
      subtitle: c.isGroup ? `${c.participantIds.length} members` : 'Recent chat',
      initials: c.isGroup ? '👥' : initialsOf(c.title ?? 'C'),
      group: 'recent',
      conversationId: c.id,
    }));

    const groups: ShareRecipient[] = conversations
      .filter((c) => c.isGroup)
      .map((c) => ({
        id: `group-${c.id}`,
        name: c.title ?? 'Group',
        subtitle: `${c.participantIds.length} members`,
        initials: '👥',
        group: 'group',
        conversationId: c.id,
      }));

    const conns = connections.data ?? [];
    const toPerson = (
      c: (typeof conns)[number],
      group: RecipientGroup,
    ): ShareRecipient => ({
      id: `${group}-${c.user.id}`,
      name: c.user.name,
      subtitle: c.relationship ? c.relationship : `@${c.user.handle}`,
      avatarUrl: c.user.profileImage ?? null,
      initials: initialsOf(c.user.name),
      group,
      handle: c.user.handle,
    });

    const connectionList: ShareRecipient[] = conns.map((c) => toPerson(c, 'connection'));
    const family: ShareRecipient[] = conns
      .filter((c) => c.relationship && FAMILY_RE.test(c.relationship))
      .map((c) => toPerson(c, 'family'));

    // Fallback: if the connections endpoint is unavailable but chat contacts
    // exist, surface those as connections so the sheet still degrades usefully.
    const fallbackConnections: ShareRecipient[] =
      connectionList.length === 0
        ? (contacts.data ?? []).map((c) => ({
            id: `connection-${c.id}`,
            name: c.name,
            subtitle: `@${c.handle}`,
            avatarUrl: c.profileImage ?? null,
            initials: initialsOf(c.name),
            group: 'connection' as const,
            handle: c.handle,
          }))
        : connectionList;

    return {
      recent,
      connections: fallbackConnections,
      family,
      groups,
      isLoading: convos.isLoading || connections.isLoading,
      isError: convos.isError && connections.isError,
    };
  }, [convos.data, convos.isLoading, convos.isError, connections.data, connections.isLoading, connections.isError, contacts.data]);
}

/** Error thrown when some (but not necessarily all) recipients could not be reached. */
export class PartialShareError extends Error {
  constructor(public readonly failed: number, public readonly total: number) {
    super(`Failed to send to ${failed} of ${total} recipients`);
    this.name = 'PartialShareError';
  }
}

/**
 * Retry a delivery step ONLY when the request never reached the server (no HTTP
 * response — DNS failure, timeout, offline, CORS block). In that case no write
 * happened, so retrying cannot create a duplicate. If the server DID respond
 * (even with an error), we do NOT retry — the request may have been persisted,
 * and a blind retry would double-send.
 */
async function withTransientRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isServerUnreachable(err) || i === attempts - 1) throw err;
      // Exponential-ish backoff: 250ms, 600ms.
      await new Promise((res) => setTimeout(res, 250 + i * 350));
    }
  }
  throw lastErr;
}

/** The two calls the send flow needs — injectable so the algorithm is unit-testable. */
export interface ShareSendApi {
  startDirect: (handle: string) => Promise<{ id: string }>;
  sendShare: (conversationId: string, body: string, card: ShareCard) => Promise<unknown>;
}

/**
 * Core send algorithm — pure aside from the injected `api` and the `delivered`
 * set it mutates. Exported for direct testing (see UniversalShareSheet.send.spec).
 *
 * Hardening for the "Send" button:
 *  - Deduplicates within a single send (a person in both Recent and
 *    Connections is only sent to once) via `seen`.
 *  - `delivered` carries conversations already sent to, so a retry after a
 *    partial failure — or a second click — never re-sends to someone who
 *    already received the card (cross-request idempotency, no DB migration).
 *  - Retries only transient (never-reached-server) failures, so temporary
 *    network blips recover without producing duplicates.
 *  - Attempts EVERY recipient even if some fail, then throws PartialShareError
 *    naming how many failed, so the UI can report precisely instead of aborting
 *    on the first error.
 */
export async function deliverShareCard(
  recipients: ShareRecipient[],
  message: string,
  card: ShareCard,
  delivered: Set<string>,
  api: ShareSendApi = chatApi,
): Promise<void> {
  const seen = new Set<string>();
  const body = message.trim();
  let failed = 0;
  let attempted = 0;

  for (const r of recipients) {
    const key = r.conversationId ? `c:${r.conversationId}` : r.handle ? `h:${r.handle}` : r.id;
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      let convId = r.conversationId;
      // Skip conversations already delivered to (retry / re-click idempotency)
      // before spending a network call.
      if (convId && delivered.has(convId)) continue;
      attempted++;
      if (!convId && r.handle) {
        const handle = r.handle;
        const conv = await withTransientRetry(() => api.startDirect(handle));
        convId = conv.id;
      }
      if (!convId) { failed++; continue; }
      if (delivered.has(convId)) continue; // resolved to an already-delivered convo
      const cid = convId; // const so the closure sees a non-undefined string
      await withTransientRetry(() => api.sendShare(cid, body, card));
      delivered.add(cid);
    } catch {
      failed++;
    }
  }

  if (failed > 0) throw new PartialShareError(failed, attempted);
}

/**
 * Reusable send wiring. Holds a per-mounted-button `delivered` set so retries
 * and re-clicks stay idempotent for the life of the button.
 */
export function useShareSend() {
  const deliveredRef = useRef<Set<string>>(new Set());
  return useCallback(
    (recipients: ShareRecipient[], message: string, card: ShareCard) =>
      deliverShareCard(recipients, message, card, deliveredRef.current),
    [],
  );
}

/* ------------------------------ styles ----------------------------- */

const SHEET_CSS = `
.uss-overlay{position:fixed;inset:0;z-index:9500;background:rgba(10,8,20,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px;animation:uss-fade .18s ease}
.uss-sheet{display:flex;flex-direction:column;width:min(520px,96vw);max-height:88vh;background:var(--card,#fff);border:1px solid var(--line);border-radius:20px;box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden;font-family:inherit;color:var(--ink)}
.uss-head{flex:0 0 auto;padding:16px 18px 12px;border-bottom:1px solid var(--line);background:var(--card,#fff)}
.uss-body{flex:1 1 auto;overflow-y:auto;padding:6px 18px 10px}
.uss-foot{flex:0 0 auto;display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid var(--line);background:var(--card,#fff)}
.uss-row{display:flex;align-items:center;gap:11px;width:100%;text-align:left;padding:9px 10px;border-radius:12px;border:1.5px solid transparent;background:none;cursor:pointer;font-family:inherit;color:inherit}
.uss-row:hover{background:var(--accent-soft)}
.uss-row:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
.uss-row[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft)}
.uss-search:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
@keyframes uss-fade{from{opacity:0}to{opacity:1}}
@keyframes uss-spin{to{transform:rotate(360deg)}}
@media (max-width:560px){
  .uss-overlay{align-items:flex-end;padding:0}
  .uss-sheet{width:100vw;max-height:92vh;border-radius:20px 20px 0 0;animation:uss-up .22s ease}
}
@keyframes uss-up{from{transform:translateY(40px);opacity:.6}to{transform:translateY(0);opacity:1}}
`;

const FOCUSABLE = 'a[href],button:not([disabled]),textarea,input,[tabindex]:not([tabindex="-1"])';

/* --------------------------- component ----------------------------- */

export function UniversalShareSheet({
  open, onClose, preview, shareKind, shareRef, onSend, heading = 'Share with',
}: UniversalShareSheetProps) {
  const groupsData = useShareRecipients();
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // Synchronous in-flight guard. React state (`phase`) updates asynchronously,
  // so two clicks fired within the same tick could both read phase==='idle'
  // and double-send. This ref flips synchronously and blocks the second click.
  const sendingRef = useRef(false);

  // Focus management: initial focus, focus trap, Esc-to-close, focus restore.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const nodes = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  const allRecipients = useMemo(
    () => [...groupsData.recent, ...groupsData.connections, ...groupsData.family, ...groupsData.groups],
    [groupsData],
  );
  const byId = useMemo(() => new Map(allRecipients.map((r) => [r.id, r])), [allRecipients]);

  const filterList = useCallback((list: ShareRecipient[]) => {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => r.name.toLowerCase().includes(q) || (r.subtitle ?? '').toLowerCase().includes(q));
  }, [query]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectedRecipients = useMemo(
    () => [...selected].map((id) => byId.get(id)).filter(Boolean) as ShareRecipient[],
    [selected, byId],
  );
  const count = selected.size;

  const handleSend = useCallback(async () => {
    // Guard synchronously (ref) AND on rendered state (phase) so rapid repeat
    // clicks and no-selection clicks never trigger a second send.
    if (count === 0 || phase !== 'idle' || sendingRef.current) return;
    sendingRef.current = true;
    setPhase('sending');
    setError(null);
    try {
      await onSend(selectedRecipients, message);
      setPhase('sent');
      window.setTimeout(() => { onClose(); }, 900);
    } catch (err) {
      // Precise messaging: partial failure names the count; a total network
      // outage explains the connection; anything else is a generic retry.
      const e = err as { name?: string; failed?: number; total?: number };
      if (e?.name === 'PartialShareError' && typeof e.failed === 'number') {
        setError(
          e.failed === e.total
            ? 'Couldn’t send — please check your connection and try again.'
            : `Sent to some, but ${e.failed} of ${e.total} didn’t go through. Tap Send to retry the rest.`,
        );
      } else if (isServerUnreachable(err)) {
        setError('Can’t reach the server right now — please try again in a moment.');
      } else {
        setError('Couldn’t send. Please try again.');
      }
      setPhase('idle');
    } finally {
      sendingRef.current = false;
    }
  }, [count, phase, onSend, selectedRecipients, message, onClose]);

  if (!open) return null;

  const avatar = (r: ShareRecipient) => (
    <span className="tc-avatar" aria-hidden style={{ width: 38, height: 38 }}>
      {r.avatarUrl
        ? <img src={r.avatarUrl} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
        : <span>{r.initials}</span>}
    </span>
  );

  const Row = (r: ShareRecipient) => {
    const on = selected.has(r.id);
    return (
      <button
        key={r.id}
        type="button"
        className="uss-row"
        aria-pressed={on}
        aria-label={`${on ? 'Selected' : 'Select'} ${r.name}${r.subtitle ? ', ' + r.subtitle : ''}`}
        onClick={() => toggle(r.id)}
      >
        {avatar(r)}
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</span>
          {r.subtitle && <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.subtitle}</span>}
        </span>
        <span aria-hidden style={{
          flex: '0 0 auto', width: 22, height: 22, borderRadius: 6,
          border: `2px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
          background: on ? 'var(--accent)' : 'transparent', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
        }}>{on ? '✓' : ''}</span>
      </button>
    );
  };

  const Section = ({ label, list, emptyHint }: { label: string; list: ShareRecipient[]; emptyHint?: string }) => {
    const filtered = filterList(list);
    return (
      <section style={{ marginTop: 12 }} aria-label={label}>
        <h3 style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', margin: '0 0 4px' }}>{label}</h3>
        {filtered.length > 0
          ? <div style={{ display: 'grid', gap: 2 }}>{filtered.map(Row)}</div>
          : <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '2px 2px 0' }}>{query.trim() ? 'No matches.' : (emptyHint ?? 'No one here yet.')}</p>}
      </section>
    );
  };

  const previewMeta = (preview.meta ?? []).filter(Boolean);

  return (
    <div
      ref={overlayRef}
      className="uss-overlay"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <style>{SHEET_CSS}</style>
      <div
        ref={sheetRef}
        className="uss-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${heading} — share ${shareKind}`}
        data-share-kind={shareKind}
        data-share-ref={typeof shareRef === 'string' ? shareRef : JSON.stringify(shareRef)}
      >
        {phase === 'sent' ? (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, color: '#2e7d4f', fontWeight: 800, lineHeight: 1 }}>{'✓'}</div>
            <p style={{ fontWeight: 700, fontSize: 16, marginTop: 10 }}>Sent</p>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
              Shared with {count} {count === 1 ? 'person' : 'people'}.
            </p>
          </div>
        ) : (
          <>
            {/* ---- Sticky header: title, preview, message, search ---- */}
            <div className="uss-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 17 }}>{heading}</h2>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close share sheet"
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 22, lineHeight: 1, cursor: 'pointer', color: 'var(--muted)' }}
                >{'×'}</button>
              </div>

              {/* Content preview */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12, padding: 10, border: '1px solid var(--line)', borderRadius: 14, background: 'var(--paper)' }}>
                {preview.imageUrl
                  ? <img src={preview.imageUrl} alt="" style={{ width: 46, height: 66, borderRadius: 8, objectFit: 'cover', flex: '0 0 auto', background: 'var(--line)' }} />
                  : <div aria-hidden style={{ width: 46, height: 66, borderRadius: 8, background: 'var(--accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flex: '0 0 auto' }}>{'🎬'}</div>}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview.title}</div>
                  {preview.subtitle && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>{preview.subtitle}</div>}
                  {previewMeta.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                      {previewMeta.map((m, i) => (
                        <span key={i} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 8px' }}>{m}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Optional message */}
              <label htmlFor="uss-message" style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', margin: '12px 0 4px' }}>Add a message (optional)</label>
              <textarea
                id="uss-message"
                aria-label="Add an optional message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                maxLength={8192}
                placeholder="Say something…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical', background: 'var(--card,#fff)', color: 'var(--ink)' }}
              />

              {/* Prominent search */}
              <label htmlFor="uss-search" className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Search people, chats and groups</label>
              <div style={{ position: 'relative', marginTop: 10 }}>
                <span aria-hidden style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 15, color: 'var(--muted)' }}>{'🔍'}</span>
                <input
                  id="uss-search"
                  ref={searchRef}
                  className="uss-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search people, chats, groups…"
                  aria-label="Search people, chats and groups"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '11px 12px 11px 36px', border: '1.5px solid var(--line)', borderRadius: 12, fontSize: 14, fontFamily: 'inherit', background: 'var(--card,#fff)', color: 'var(--ink)' }}
                />
              </div>
            </div>

            {/* ---- Scrollable body: recipient sections ---- */}
            <div className="uss-body">
              {groupsData.isLoading ? (
                <div role="status" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 32, color: 'var(--muted)', justifyContent: 'center' }}>
                  <span aria-hidden style={{ width: 18, height: 18, border: '2px solid var(--line)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'uss-spin .7s linear infinite' }} />
                  Loading recipients…
                </div>
              ) : (
                <>
                  <Section label="Recent Chats" list={groupsData.recent} emptyHint="No recent chats yet." />
                  <Section label="Connections" list={groupsData.connections} emptyHint="No connections yet." />
                  <Section label="Family" list={groupsData.family} emptyHint="No family members tagged yet." />
                  <Section label="Groups" list={groupsData.groups} emptyHint="No groups yet." />
                </>
              )}
            </div>

            {/* ---- Sticky footer: Send + Cancel ---- */}
            <div className="uss-foot">
              <span style={{ fontSize: 13, fontWeight: 600, color: count ? 'var(--ink)' : 'var(--muted)' }} aria-live="polite">
                {count ? `${count} selected` : 'Select recipients'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-line"
                style={{ marginLeft: 'auto' }}
              >Cancel</button>
              <button
                type="button"
                className="btn btn-accent"
                disabled={count === 0 || phase === 'sending'}
                aria-busy={phase === 'sending'}
                onClick={() => { void handleSend(); }}
                aria-label={count ? `Send to ${count} ${count === 1 ? 'recipient' : 'recipients'}` : 'Send (select at least one recipient)'}
              >
                {phase === 'sending'
                  ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <span aria-hidden style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,.5)', borderTopColor: '#fff', borderRadius: '50%', animation: 'uss-spin .7s linear infinite' }} />
                      Sending…
                    </span>
                  : `Send${count ? ` (${count})` : ''}`}
              </button>
            </div>
            {error && (
              <p role="alert" style={{ color: '#c0392b', fontSize: 12.5, fontWeight: 600, margin: 0, padding: '0 18px 12px' }}>{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
