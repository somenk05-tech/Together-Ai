import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationSync } from '@/api';
import type { NotificationItem } from '@/api/schemas';
import { Icon, type IconName } from '@/components/ui/Icon';

interface Toast { id: string; icon: IconName; title: string; body?: string; href?: string }
/**
 * A toast in flight. `leaving` flips the moment it is dismissed — by tap, by the
 * lifetime timer, or by a fourth toast displacing it. The row stays mounted for
 * EXIT_MS afterwards so its exit transition can play, then it is swept.
 */
type Shown = Toast & { leaving?: boolean };

const MAX_STACK = 3;      // at most three cards on screen at once
const EXIT_MS = 200;      // how long a dismissed toast stays mounted to animate out
const LIFETIME_MS = 5000; // auto-expiry, unchanged

const prefersReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Pure: flag one toast as leaving. Shared by dismissal and by stack eviction. */
const markLeaving = (list: Shown[], id: string): Shown[] =>
  list.map((x) => (x.id === id ? { ...x, leaving: true } : x));

const ICON_FOR: Record<string, IconName> = {
  like: 'heart', comment: 'comment', follow: 'follow', connection_request: 'connection',
  connection_accepted: 'accepted', post_live: 'sparkles', mention: 'mention',
  message: 'comment', dating_like: 'heart', dating_match: 'sparkles',
  // The Till. Every one of these is money arriving or moving, so they share
  // the wallet mark rather than each inventing a glyph.
  invoice_sent: 'wallet', invoice_paid: 'wallet', invoice_paid_business: 'wallet',
  invoice_cancelled: 'wallet', invoice_refunded: 'wallet',
  payout_settled: 'wallet', payout_failed: 'wallet',
};

/**
 * App-wide live toaster: pops a transient card in the corner whenever a new
 * notification (like / comment / follow / connection request or accept) or a new
 * chat message arrives — anywhere in the app, no manual refresh. Tapping it
 * deep-links to the relevant page.
 */
export function NotificationToaster() {
  const nav = useNavigate();
  const [toasts, setToasts] = useState<Shown[]>([]);
  const timers = useRef<Set<number>>(new Set());
  const sweeping = useRef<Set<string>>(new Set());

  // No leaked timers if the shell unmounts with toasts still on screen.
  useEffect(() => {
    const pending = timers.current;
    return () => { pending.forEach((id) => window.clearTimeout(id)); pending.clear(); };
  }, []);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);

  /** Phase one of removal: flag it, let the CSS play. Phase two is the sweep below. */
  const dismiss = useCallback((id: string) => setToasts((prev) => markLeaving(prev, id)), []);

  // Phase two: once a toast is flagged `leaving`, drop it from state after its
  // exit transition — immediately under reduced motion. Scheduled from an effect
  // rather than inside `dismiss` so that eviction, which flags its victim from
  // within a state updater, gets the same treatment without an impure updater.
  useEffect(() => {
    toasts.forEach((t) => {
      if (!t.leaving || sweeping.current.has(t.id)) return;
      sweeping.current.add(t.id);
      after(prefersReduced() ? 0 : EXIT_MS, () => {
        sweeping.current.delete(t.id);
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      });
    });
  }, [toasts, after]);

  const push = useCallback((t: Toast) => {
    setToasts((prev) => {
      const live = prev.filter((x) => !x.leaving);
      // Still at most three stacked — but a fourth now flags the oldest live one
      // for exit instead of yanking it out of the DOM mid-frame.
      const next = live.length >= MAX_STACK ? markLeaving(prev, live[0].id) : prev;
      return [...next, t];
    });
    after(LIFETIME_MS, () => dismiss(t.id));
  }, [after, dismiss]);

  // App-wide notifications — social, connections, dating AND new chat messages
  // (messages now flow through the in-app notification feed too, titled with the
  // sender's name, so there's a single toast source and no duplicates).
  useNotificationSync((n: NotificationItem) => {
    // Unique per toast — a grouped message notification reuses its row id when it
    // updates, so key it with a nonce to avoid React key collisions.
    push({ id: `${n.id}-${Math.random().toString(36).slice(2, 7)}`, icon: ICON_FOR[n.kind] ?? 'bell', title: n.title, body: n.body, href: n.href });
  });

  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', maxWidth: 340 }}>
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t}
          // Navigation is immediate; the card animates out behind it.
          onSelect={() => { dismiss(t.id); if (t.href) nav(t.href); }} />
      ))}
    </div>
  );
}

/**
 * One card. Owns its own mount flag so the entry is a *transition*, not a
 * keyframe: the first paint renders the out state, the next frame flips to the
 * in state and the transition carries it. A toast arriving while this one is
 * still moving retargets it rather than restarting it.
 *
 * The row that wraps the card collapses its own height on the way out, so the
 * survivors slide up over --dur-base instead of teleporting when the card is
 * finally unmounted. The 8px spacing lives inside the clipped row (rather than
 * as a `gap` on the column) so it collapses along with the card.
 */
function ToastRow({ toast: t, onSelect }: { toast: Shown; onSelect: () => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setMounted(true)); return () => cancelAnimationFrame(r); }, []);

  const reduce = prefersReduced();
  const out = !mounted || !!t.leaving;
  return (
    <div style={{ display: 'grid', gridTemplateRows: out ? '0fr' : '1fr',
      transition: reduce ? undefined : 'grid-template-rows var(--dur-base) var(--ease-out)' }}>
      <div style={{ minHeight: 0, overflow: 'hidden', paddingBottom: 8 }}>
        <button type="button" onClick={onSelect}
          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', width: '100%', cursor: 'pointer',
            background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 13px',
            boxShadow: '0 10px 32px rgba(0,0,0,.18)', fontFamily: 'inherit',
            opacity: out ? 0 : 1,
            // Reduced motion keeps the fade and drops the slide.
            transform: reduce ? undefined : (out ? 'translateX(12px)' : 'translateX(0)'),
            transition: 'opacity var(--dur-fast) var(--ease-out), transform var(--dur-base) var(--ease-out)' }}>
          <Icon name={t.icon} size={17} style={{ marginTop: 1, color: 'var(--accent-ink)' }} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 13, fontWeight: 700 }}>{t.title}</span>
            {t.body && <span className="muted" style={{ display: 'block', fontSize: 12, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.body}</span>}
          </span>
        </button>
      </div>
    </div>
  );
}
