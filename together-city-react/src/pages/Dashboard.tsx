import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useProfileCompletion } from '@/features/profile/hooks';
import { useComposedPlan } from '@/features/nutrition/composed.api';
import { useLatestPanel } from '@/features/medical/api';
import { useDatingChats } from '@/features/dating/api';
import { useUnreadNotificationCount } from '@/api/notifications.api';
import { useUnreadChatCount } from '@/api/chat.api';

/**
 * The dashboard (§4).
 *
 * `/dashboard` is where the landing page's single gold call to action — "Enter
 * your city" — has always pointed. It rendered a shared placeholder component,
 * which printed:
 *
 *     🚧 On the migration backlog
 *     This page follows the Nutrition reference vertical pattern — see WeeklyPlanner.
 *
 * An engineering note, shown to citizens, on the app's primary CTA. The audit
 * called the dashboard dead-end the worst first-run moment in the product and
 * it was right, but the copy was the sharper problem: "migration backlog" and
 * "reference vertical" are words for us, and somebody who signed up to plan
 * their meals was reading them.
 *
 * WHAT THIS PAGE IS: where you are, and what to do next. Not a feed of numbers.
 * On day one a citizen has almost nothing, and that is exactly when the dead-end
 * bit hardest — so the page leads with the one thing that is always true and
 * always actionable (how much of their profile is filled in, and the next few
 * steps), and everything else appears only when there is something real to say.
 *
 * THE GOLDEN RULE, APPLIED HARDEST HERE. Every figure below comes from the
 * citizen's own records or the section is not rendered. There is no sample
 * activity, no placeholder chart, no "3 new matches" on an account with none.
 * A dashboard is the easiest screen in any app to fill with invented data
 * because it is a summary of everything, and a summary of nothing looks broken
 * unless you are honest about it being nothing.
 *
 * Blood values are counted, never quoted. "Two markers to look at" is the
 * useful part; the numbers belong on the medical page behind a deliberate click,
 * not on the first screen after sign-in where somebody may be sitting on a train.
 */
export function Dashboard() {
  const completion = useProfileCompletion();
  const plan = useComposedPlan();
  const panel = useLatestPanel();
  const datingChats = useDatingChats();
  const notifications = useUnreadNotificationCount();
  const unreadChats = useUnreadChatCount();

  if (completion.isLoading) return <Spinner label="Opening your city…" />;

  const c = completion.data;

  /**
   * A FAILED REQUEST IS NOT AN EMPTY CITY, AND THIS PAGE COULD NOT TELL THEM APART.
   *
   * There was no branch here at all. `isLoading` was the only state this screen
   * knew about, so a profile request that failed fell straight through into the
   * normal render with `c` undefined — and every downstream expression treated
   * "we don't know" as "there isn't any".
   *
   * Returning early is the whole fix: past this line `c` exists, so the greeting
   * and the completion meter stop being conditional on data that was never
   * optional in the first place.
   *
   * NO SALUTATION HERE, DELIBERATELY. Every other message in the city opens with
   * the citizen's name, and this is the one screen that must not: we are here
   * precisely because the record holding their name did not arrive. `Dear ,` is
   * what shared/salutation.ts exists to prevent, and a hardcoded fallback
   * greeting is the same bug wearing a default value.
   */
  if (completion.isError || !c) {
    return (
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px 48px' }}>
        <div className="eyebrow">Your city</div>
        <h1 style={{ fontSize: 28, margin: '2px 0 0' }}>We couldn’t open your city just now</h1>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.65, margin: '10px 0 0', maxWidth: '54ch' }}>
          Your profile didn’t come back from the server, and everything on this page is
          built out of it — so rather than draw you a city we’d be guessing at, we’ve
          stopped here. Nothing has been lost or changed. This is ours, not yours.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <button type="button" onClick={() => void completion.refetch()} style={{ ...startStyle, background: 'none', cursor: 'pointer' }}>
            Try again
          </button>
          <Link to="/profile" style={startStyle}>Open your profile</Link>
        </div>
      </div>
    );
  }

  const today = plan.data?.days?.[0] ?? null;
  const meals = today?.meals ?? [];
  const flagged = (panel.data?.markers ?? []).filter((m) => m.status !== 'normal');
  const pendingChats = (datingChats.data ?? []).filter((x) => x.pending).length;
  const openChats = (datingChats.data ?? []).filter((x) => !x.pending).length;
  const countsUnknown = datingChats.isError || notifications.isError;

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '28px 16px 48px' }}>
      <div className="eyebrow">Your city</div>
      {/* From the server's salutation(), the same one that opens a blood report.
          This used to fall back to a bare “Welcome,” whenever `c` was undefined,
          and that fallback is how an orphan comma reached a real screen: not an
          empty name — a failed request, defaulted into a greeting addressed to
          nobody. The early return above is what makes the fallback unnecessary. */}
      <h1 style={{ fontSize: 28, margin: '2px 0 0' }}>{c.greeting}</h1>
      <p className="muted" style={{ fontSize: 14, lineHeight: 1.6, margin: '8px 0 0', maxWidth: '54ch' }}>
        Everything here is yours — what you’ve told us, what you’ve planned, what’s waiting.
        Nothing on this page is a sample.
      </p>

      {/* ── Where you are ─────────────────────────────────────────────
          Not conditional any more. This block is the spine of the page — the
          header above calls it "the one thing that is always true and always
          actionable" — and `{c && …}` quietly made it the first thing to
          disappear when the request behind it failed, leaving a page whose whole
          argument for existing had silently gone. */}
      <section className="card" style={{ marginTop: 22, padding: '18px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>Your profile is {c.percent}% complete</h2>
            <Link to="/profile" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>Open your profile →</Link>
          </div>
          <div style={{ height: 8, borderRadius: 999, background: 'var(--line)', marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${c.percent}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '10px 0 0' }}>
            {c.complete
              ? 'Everything we ask for is filled in. Every hub is reading from it — you won’t be asked twice.'
              : 'Each hub reads from this one profile, so anything you add here saves you answering it somewhere else.'}
          </p>

          {c.nextUp.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--muted)', margin: '16px 0 8px' }}>
                What’s next
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {c.nextUp.map((n) => (
                  <Link key={n.key} to={n.href}
                    style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 10, border: '1px solid var(--line)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                    {n.label} →
                  </Link>
                ))}
              </div>
            </>
          )}
      </section>

      {/* ── Today's plan. Rendered only when a plan exists. ────────── */}
      {meals.length > 0 && (
        <section style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>Today’s meals</h2>
            <Link to="/nutrition/weekly" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>The whole week →</Link>
          </div>
          <div className="card" style={{ marginTop: 10, padding: '6px 18px' }}>
            {meals.map((m) => (
              <div key={m.key} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '11px 0', borderTop: '1px solid var(--line)' }}>
                <span className="muted" style={{ fontSize: 11.5, width: 74, flex: 'none', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{m.label}</span>
                <span style={{ fontSize: 13.5, flex: 1, minWidth: 0 }}>{m.title}</span>
                <span className="muted" style={{ fontSize: 12, flex: 'none' }}>{m.scheduledTime}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Health. Counts, not values. ───────────────────────────── */}
      {panel.data && (panel.data.markers?.length ?? 0) > 0 && (
        <section style={{ marginTop: 22 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h2 style={{ fontSize: 17, margin: 0 }}>Your last blood panel</h2>
            <Link to="/medical/blood" style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: 'var(--accent-ink)' }}>Read it →</Link>
          </div>
          <div className="card" style={{ marginTop: 10, padding: '16px 18px' }}>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              {flagged.length === 0
                ? panel.data.inRangeLine
                : `${flagged.length} marker${flagged.length === 1 ? '' : 's'} to look at${panel.data.takenOn ? `, from your panel on ${panel.data.takenOn}` : ''}.`}
            </p>
            {/* The numbers stay on the medical page. This is the screen somebody
                opens on a train; a lab value is not a thing to meet in passing. */}
            <p className="muted" style={{ fontSize: 11.5, lineHeight: 1.55, margin: '8px 0 0' }}>
              The values are on your medical page, where the ranges and what they mean are with them.
            </p>
          </div>
        </section>
      )}

      {/* ── Waiting for you. Only the counts that are real. ──────────
          A count that failed to load is not a count of zero. When one of these
          requests falls over, the thing waiting for the citizen — a match who
          reached out, an unread message — does not appear here and nothing says
          why, so the page reads as "nobody wanted you" rather than "we couldn't
          check". The line below is small, and it is the difference between those
          two sentences. */}
      {(notifications.data || unreadChats > 0 || pendingChats > 0 || openChats > 0 || countsUnknown) ? (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ fontSize: 17, margin: '0 0 10px' }}>Waiting for you</h2>
          {countsUnknown && (
            <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.6, margin: '0 0 10px', maxWidth: '54ch' }}>
              Some of these didn’t load just now, so this list may be short. Alerts and Dating
              will have the real answer.
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {unreadChats > 0 && <Waiting to="/chats" n={unreadChats} one="unread message" many="unread messages" />}
            {(notifications.data ?? 0) > 0 && <Waiting to="/social/notifications" n={notifications.data ?? 0} one="notification" many="notifications" />}
            {pendingChats > 0 && <Waiting to="/dating/chats" n={pendingChats} one="match to connect with" many="matches to connect with" />}
            {openChats > 0 && <Waiting to="/dating/chats" n={openChats} one="dating chat" many="dating chats" />}
          </div>
        </section>
      ) : null}

      {/* ── The honest empty state, when there is genuinely nothing. ─
          "GENUINELY" IS DOING ALL THE WORK IN THAT SENTENCE, AND IT WASN'T CHECKED.
          The condition was absence alone — no meals, no flagged markers — which is
          equally true when the plan and panel requests fail, and equally true while
          they are still in flight. So a citizen with a full week planned and a blood
          panel on file could be told, warmly and at length, "there's nothing here yet
          because you haven't put anything here yet."

          That is the golden rule inverted. The rule forbids inventing data; this was
          the same failure with the sign flipped — asserting an ABSENCE we had not
          established, about the citizen's own records, in the most reassuring voice
          on the page. isSuccess is the difference between knowing and assuming. */}
      {plan.isSuccess && panel.isSuccess && meals.length === 0 && flagged.length === 0 && !panel.data?.markers?.length && (
        <section className="card" style={{ marginTop: 22, padding: '20px' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Your city is quiet so far</h2>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.65, margin: '8px 0 14px', maxWidth: '52ch' }}>
            That’s not a mistake — there’s nothing here yet because you haven’t put anything here yet.
            Start anywhere; the rest of the city will read from it.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/nutrition/preferences" style={startStyle}>Plan your meals</Link>
            <Link to="/medical/records" style={startStyle}>Add a health record</Link>
            <Link to="/profile" style={startStyle}>Finish your profile</Link>
          </div>
        </section>
      )}
      {/* ── Bring someone ── the city is better with your people in it. */}
      <section className="card" style={{ marginTop: 22, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Bring someone with you</h2>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>Meals, plans and households work better with your people in the city.</p>
        </div>
        <button type="button" onClick={() => void invite()} style={{ ...startStyle, background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
          Invite a friend
        </button>
      </section>
    </div>
  );
}

/** Share (or copy) the front-door link — no referral machinery, just the door. */
async function invite(): Promise<void> {
  const url = `${window.location.origin}/join`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Together City', text: 'Join me in Together City — one city for your whole life.', url }); return; }
  } catch { return; /* the citizen closed the share sheet — nothing to do */ }
  try {
    await navigator.clipboard.writeText(url);
    window.alert('Invite link copied — send it to anyone.');
  } catch {
    window.prompt('Copy your invite link:', url);
  }
}

function Waiting({ to, n, one, many }: { to: string; n: number; one: string; many: string }) {
  return (
    <Link to={to} className="card"
      style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 16px', textDecoration: 'none', borderRadius: 12 }}>
      <strong style={{ fontSize: 15 }}>{n}</strong>
      <span style={{ fontSize: 13 }}>{n === 1 ? one : many}</span>
    </Link>
  );
}

const startStyle: React.CSSProperties = {
  minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 16px',
  borderRadius: 10, border: '1px solid var(--accent)', color: 'var(--accent-ink)',
  fontSize: 13, fontWeight: 700, textDecoration: 'none',
};
