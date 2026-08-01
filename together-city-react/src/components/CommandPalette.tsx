import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DESTINATIONS, type Dest } from '@/nav/registry';
import { useRecentStore } from '@/store/recent.store';
import { useAuthStore } from '@/store/auth.store';
import { http } from '@/api/client';
import { Icon } from '@/components/ui/Icon';

/** Lightweight subsequence + token score — good enough for a nav palette. */
function score(d: Dest, q: string): number {
  const hay = `${d.label} ${d.sub ?? ''} ${d.keywords ?? ''}`.toLowerCase();
  const needle = q.toLowerCase().trim();
  if (!needle) return 0;
  if (d.label.toLowerCase().startsWith(needle)) return 100;
  if (hay.includes(needle)) return 60;
  // token coverage
  const toks = needle.split(/\s+/).filter(Boolean);
  const hit = toks.filter((t) => hay.includes(t)).length;
  if (hit === toks.length && toks.length > 1) return 40;
  // subsequence on label
  let i = 0;
  for (const c of d.label.toLowerCase()) if (c === needle[i]) i++;
  return i === needle.length ? 20 : -1;
}

const KIND_LABEL: Record<Dest['kind'], string> = { hub: 'Hub', page: 'Page', account: 'Account', action: 'Quick action' };

/**
 * Global command palette (⌘K / Ctrl+K) — the super-app's "jump to anything".
 * Searches every hub, page, setting and quick action, shows recent pages when
 * empty, and navigates on Enter. The single highest-leverage nav fix (audit 3.1).
 */
const NO_TRAIL: never[] = [];

export function CommandPalette() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trail = useRecentStore((s) => s.items);
  // Private trail: shown only to the signed-in citizen who made it. A shared
  // machine's next visitor gets suggestions, not the last user's movements.
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const recents = authed ? trail : NO_TRAIL;

  // Your own messages join the search (three letters up, debounced). Server-
  // side scope rules apply — dating chats never surface here. The /chats page
  // opens a thread via its ?c= deep link.
  const [msgHits, setMsgHits] = useState<Array<{ id: string; conversationId: string; text: string | null; senderName: string | null }>>([]);
  useEffect(() => {
    const kw = q.trim();
    if (!open || !authed || kw.length < 3) { setMsgHits([]); return; }
    const t = setTimeout(() => {
      http.get<unknown>('/messages/search', { params: { keyword: kw, limit: 5 } })
        .then((r) => {
          const rows = Array.isArray(r.data) ? (r.data as Array<Record<string, unknown>>) : [];
          setMsgHits(rows.slice(0, 5).map((m) => ({
            id: String(m.id ?? ''),
            conversationId: String(m.conversationId ?? ''),
            text: typeof m.text === 'string' ? m.text : typeof m.body === 'string' ? m.body : null,
            senderName: typeof (m.sender as { name?: string } | undefined)?.name === 'string' ? (m.sender as { name: string }).name : null,
          })).filter((m) => m.conversationId));
        })
        .catch(() => setMsgHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open, authed]);

  // Global hotkey + a custom event so the header button can open it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('tc:command', onOpen as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('tc:command', onOpen as EventListener);
    };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 20); }
  }, [open]);

  const results = useMemo<Dest[]>(() => {
    if (!q.trim()) {
      const recentDests = recents
        .map((r) => DESTINATIONS.find((d) => d.path === r.path))
        .filter((d): d is Dest => Boolean(d))
        .slice(0, 6);
      const suggested = DESTINATIONS.filter((d) => d.kind === 'action').slice(0, 6);
      const seen = new Set(recentDests.map((d) => d.id));
      return [...recentDests, ...suggested.filter((d) => !seen.has(d.id))].slice(0, 12);
    }
    return DESTINATIONS
      .map((d) => ({ d, s: score(d, q) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map((x) => x.d);
  }, [q, recents]);

  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;

  const go = (d?: Dest) => {
    if (!d) return;
    setOpen(false);
    nav(d.path);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  const showingRecent = !q.trim();

  return (
    <div role="dialog" aria-label="Command palette" onMouseDown={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(10,10,12,.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh' }}>
      <div onMouseDown={(e) => e.stopPropagation()}
        style={{ width: 'min(620px, 92vw)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16,
          boxShadow: '0 24px 70px rgba(0,0,0,.32)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <Icon name="search" size={18} style={{ color: 'var(--muted)' }} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onListKey}
            placeholder="Search hubs, pages, settings — or try “Book a doctor”"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit', color: 'var(--ink)' }} />
          <kbd style={{ fontSize: 11, color: 'var(--muted)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px' }}>Esc</kbd>
        </div>

        <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {showingRecent && (
            <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '8px 10px 4px' }}>
              {recents.length ? 'Recent & suggested' : 'Suggested'}
            </div>
          )}
          {results.length === 0 && (
            <p className="muted" style={{ fontSize: 13.5, padding: '26px 12px', textAlign: 'center' }}>No matches for “{q}”.</p>
          )}
          {results.map((d, i) => (
            <button key={d.id} type="button" onMouseEnter={() => setActive(i)} onClick={() => go(d)}
              style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: 'none',
                borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit',
                background: i === active ? 'var(--accent-soft)' : 'transparent' }}>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--paper)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <Icon name={d.icon ?? 'place'} size={16} style={{ color: 'var(--accent)' }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.label}</span>
                {d.sub && <span className="muted" style={{ display: 'block', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.sub}</span>}
              </span>
              <span className="muted" style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', flexShrink: 0 }}>{KIND_LABEL[d.kind]}</span>
            </button>
          ))}

          {msgHits.length > 0 && (
            <>
              <div className="muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', padding: '10px 10px 4px' }}>
                In your messages
              </div>
              {msgHits.map((m) => (
                <button key={m.id} type="button" onClick={() => { setOpen(false); nav(`/chats?c=${m.conversationId}`); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', border: 'none',
                    borderRadius: 10, padding: '10px 12px', cursor: 'pointer', fontFamily: 'inherit', background: 'transparent' }}>
                  <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--paper)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="comment" size={16} style={{ color: 'var(--accent)' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.text ?? 'Attachment'}</span>
                    {m.senderName && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{m.senderName}</span>}
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
