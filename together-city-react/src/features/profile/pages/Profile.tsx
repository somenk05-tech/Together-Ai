import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { resizeAvatar } from '@/lib/resizeAvatar';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/store/auth.store';
import { ModuleChips } from '@/features/connections/components/ModuleToggles';
import { Avatar, Card, Button, Spinner, EmptyState, ValueOrEmpty } from '@/components/ui';
import { useProfileSummary, useProfileCompletion, useHealthScore } from '../hooks';
import { profileApi } from '../api';
import { useWebPush } from '@/hooks/useWebPush';
import { useConnections, useRespondConnection, useUnreadChatCount, useIncomingRequestCount } from '@/api';
import { useMailAccount } from '@/features/mail/api';
import { VerificationCard } from '@/features/auth/components/VerificationCard';
import { DeleteAccountCard } from '@/features/settings/components/DeleteAccountCard';
import { MasterProfileSections } from './MasterProfile';
import { useMasterProfile } from '../hooks';
import { Field, Visa } from '../components/Passport';
import { CitizenCard } from '../components/CitizenCard';
import { DesignYourServices } from '../components/DesignYourServices';
import { CityProfiles } from '../components/CityProfiles';
import { codeBand, sexMark, splitName, visaPages } from '../passport';

/* The Photo tab is gone: the passport's portrait IS the picker, and a second
   door to the same file input is a second thing to keep in step.

   The account tab is gone too, for the opposite reason — see the surrender
   section at the foot of the page. It was never a tab's worth of content and
   a tab is a place things go to not be found. */
type Tab = 'overview' | 'notifications';

/**
 * A wellness summary of recorded measurements.
 *
 * Renders the three states honestly rather than flattening them into a number:
 * `computed` shows the score, `incomplete` says what is missing and shows none,
 * and `unavailable` says nothing has been recorded yet. A component the citizen
 * has not filled in is listed as not counted — never as a zero dragging the
 * total down.
 */
function HealthScoreCard() {
  const q = useHealthScore();
  const d = q.data;
  if (!d) return null;

  const pct = d.score ?? 0;
  const ring = `conic-gradient(var(--accent) ${pct * 3.6}deg, var(--line) 0deg)`;

  return (
    <Card style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {d.state === 'computed' ? (
          <div style={{ position: 'relative', width: 68, height: 68, flex: 'none', borderRadius: '50%', background: ring, display: 'grid', placeItems: 'center' }}>
            <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 800 }}>{d.score}</div>
          </div>
        ) : (
          <div style={{ width: 68, height: 68, flex: 'none', borderRadius: '50%', border: '2px dashed var(--line)', display: 'grid', placeItems: 'center', fontSize: 22 }}>—</div>
        )}
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            Wellness summary{d.band ? ` · ${d.band}` : ''}
          </h3>
          <p className="muted" style={{ fontSize: 12.5, margin: '2px 0 0', lineHeight: 1.55 }}>{d.basis}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(190px,1fr))', gap: '10px 16px', marginTop: 16 }}>
        {d.components.map((c) => (
          <div key={c.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ fontWeight: 600 }}>{c.label}</span>
              <span className="muted">{c.state === 'computed' ? c.value : 'not counted'}</span>
            </div>
            <div style={{ height: 5, borderRadius: 'var(--r-full)', background: 'var(--line)' }}>
              <div style={{ height: 5, borderRadius: 'var(--r-full)', width: `${c.state === 'computed' ? (c.value ?? 0) : 0}%`, background: c.state === 'computed' ? 'var(--accent)' : 'transparent' }} />
            </div>
            <div className="muted" style={{ fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{c.detail}</div>
          </div>
        ))}
      </div>

      <p className="muted" style={{ fontSize: 11, lineHeight: 1.55, marginTop: 14 }}>{d.disclaimer}</p>
    </Card>
  );
}

/* ProfileCompletionCard is gone. Its ring is now the "Validity" line in the
   passport's crest, and its per-hub bars are the "Complete N%" on each visa
   page — where the number is beside the thing it describes rather than in a
   second grid of the same fourteen hubs. */

function NotificationsTab() {
  const push = useWebPush();
  const connections = useConnections();
  const respond = useRespondConnection();
  const incoming = (connections.data ?? []).filter((c) => c.status === 'pending' && c.incoming);
  const unreadChats = useUnreadChatCount();
  const mail = useMailAccount();
  const unreadMail = mail.data?.counts.inboxUnread ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Push opt-in */}
      {push.supported && (
        <Card style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h4 style={{ margin: '0 0 4px' }}>🔔 Message notifications</h4>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>
              {push.permission === 'granted' ? 'On — you’ll be notified of new messages even with the app closed.'
                : push.permission === 'denied' ? 'Blocked in your browser settings — allow notifications for this site to enable.'
                : 'Get notified of new messages even when Together City is closed.'}
            </p>
          </div>
          {push.permission !== 'granted' && push.permission !== 'denied' && (
            <Button variant="accent" size="sm" disabled={push.busy} onClick={() => void push.enable()}>{push.busy ? 'Enabling…' : 'Enable'}</Button>
          )}
          {push.permission === 'granted' && <span className="tag" style={{ alignSelf: 'center' }}>Enabled</span>}
        </Card>
      )}

      {/* Connection requests */}
      <Card>
        <h4 style={{ margin: '0 0 10px' }}>Connection requests {incoming.length > 0 && <span className="tag">{incoming.length}</span>}</h4>
        {incoming.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>No pending requests.</p>
        ) : incoming.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)', flexWrap: 'wrap' }}>
            <Avatar src={c.user.profileImage} name={c.user.name} size={38} />
            <div className="flex-min">
              <div style={{ fontWeight: 600, fontSize: 14 }}>{c.user.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>@{c.user.handle} wants to connect</div>
              {/* The hubs were on this object all along and never drawn. The
                  requester picks them and the accepter cannot change them
                  first — so an Accept button with nothing beside it was asking
                  somebody to grant access they had not been shown. */}
              <ModuleChips modules={c.modules ?? []} caption="Hubs they want to open:" />
            </div>
            <Button size="sm" variant="accent" disabled={respond.isPending} onClick={() => respond.mutate({ id: c.id, accept: true })}>Accept</Button>
            <Button size="sm" variant="line" disabled={respond.isPending} onClick={() => respond.mutate({ id: c.id, accept: false })}>Decline</Button>
            <p className="muted" style={{ flexBasis: '100%', fontSize: 11.5, margin: 0, lineHeight: 1.55 }}>
              They chose these. Accepting opens exactly them &mdash; you can change them, or
              disconnect, any time afterwards.
            </p>
          </div>
        ))}
      </Card>

      {/* Unread */}
      <Card>
        <h4 style={{ margin: '0 0 10px' }}>Unread</h4>
        <Link to="/chats" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', color: 'inherit' }}>
          <span>💬 Chat messages</span>
          <span style={{ fontWeight: 700, color: unreadChats ? 'var(--accent)' : 'var(--muted)' }}>{unreadChats || 'None'}</span>
        </Link>
        <Link to="/mail/inbox" style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderTop: '1px solid var(--line)', color: 'inherit' }}>
          <span>✉ Mail</span>
          <span style={{ fontWeight: 700, color: unreadMail ? 'var(--accent)' : 'var(--muted)' }}>{unreadMail || 'None'}</span>
        </Link>
      </Card>
    </div>
  );
}

/**
 * THE PASSPORT — one identity, and a visa page per hub.
 *
 * This is a rewrite of the page's SHAPE and nothing else. Every value it draws
 * was already coming from /profile/summary, /profile/master and
 * /profile/completion; no endpoint changed, nothing new is requested, and the
 * photo picker, the sign-out, the verification and sex/gender cards, the
 * connection requests and the delete-account door are all still here.
 */
export function Profile() {
  const { user, signOut } = useAuth();
  const { data, isLoading, isError } = useProfileSummary();
  const master = useMasterProfile();
  const completion = useProfileCompletion();
  const [tab, setTab] = useState<Tab>('overview');
  const reqCount = useIncomingRequestCount();
  const qc = useQueryClient();
  const photoRef = useRef<HTMLInputElement>(null);
  const [photoOverride, setPhotoOverride] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);

  const name = user?.name ?? 'You';
  const photo = photoOverride ?? data?.profileImage ?? user?.profileImage ?? null;

  const changePhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const data64 = await resizeAvatar(file);
      const res = await profileApi.setAvatar(data64);
      const nextPhoto = res?.profileImage ?? data64;
      setPhotoOverride(nextPhoto);
      // Update the auth store so the header/master avatar refreshes everywhere.
      useAuthStore.setState((s) => ({ user: s.user ? { ...s.user, profileImage: nextPhoto } : s.user }));
      void qc.invalidateQueries({ queryKey: ['profile', 'me'] });
      void qc.invalidateQueries({ queryKey: ['profile', 'summary'] });
      void qc.invalidateQueries({ queryKey: ['auth', 'me'] });
    } catch { /* ignore — keep old photo */ } finally { setPhotoBusy(false); }
  };
  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: 'overview', label: 'The document' },
    { key: 'notifications', label: 'Notifications', badge: reqCount },
  ];

  /* ── The data page's own values. All of it already fetched. ───────────── */
  const m = master.data;
  const { surname, given } = splitName(name);
  /* Read from the two answers SexAndGenderCard actually writes — see the note
     on sexMark(). `declined` is a real answer and gets an inert rule; null
     means nobody asked yet and gets a rule that links to the form. */
  const mark = sexMark(m);
  const issued = data?.memberSince ?? null;
  const asDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : null);
  const place = [m?.birthCity, m?.birthCountry].filter(Boolean).join(', ') || null;
  const residence = [m?.city, m?.country].filter(Boolean).join(', ') || null;
  const mrz = codeBand({ surname, given, handle: user?.handle ?? 'citizen', dob: m?.dateOfBirth, sex: mark === 'M' || mark === 'F' || mark === 'X' ? mark : '<', issued });
  const pages = visaPages(data?.hubs ?? [], completion.data?.sections ?? []);
  const validity = completion.data?.percent;

  return (
    <div className="page">
      <div className="pbook" id="top">
        <div className="eyebrow">Together City</div>
        {/* ONE NAME FOR THE ONE RECORD (owner, 28 Aug). This page was "Your
            passport" and the fields that fill it were a second page called
            "Master Profile" — so the city had two names for one thing, and the
            document was the half a citizen actually landed on. The record is
            what this page is; the passport is how it is drawn. */}
        <h1 style={{ margin: '0 0 16px' }}>Master Profile</h1>

        {/* ── THE DATA PAGE ─────────────────────────────────────────────── */}
        {/* No hand-typed crest: the artwork prints the mark, the tagline, the
            series number and the seal itself, and re-typing them in HTML on
            top of a texture is two documents fighting. The padding that
            clears the printed header lives in .pdata. */}
        <div className="pdoc">
        <div className="pdata">
          <div className="pgrid">
            {/* The portrait IS the picker. One door, not two. */}
            <input ref={photoRef} type="file" accept="image/*" hidden onChange={(e) => void changePhoto(e.target.files?.[0])} />
            <button type="button" className="pphoto" data-empty={photo ? 'false' : 'true'}
              onClick={() => photoRef.current?.click()} disabled={photoBusy}
              aria-label="Change your passport photograph" title="Change your passport photograph">
              {photo ? <img src={photo} alt="" /> : <em>No photograph</em>}
              <i>{photoBusy ? 'Uploading…' : photo ? 'Change' : 'Add photo'}</i>
            </button>

            <div className="pfields">
              <Field label="Type" value="P" />
              <Field label="City code" value="TC" />

              <Field span="half" label="Citizen no." value={user?.handle ? `@${user.handle}` : null} />
              {/* A BLANK LINE IS A LINK TO ITS OWN BOX, and that box is now on
                  this page — so these are anchors down the page rather than a
                  navigation to a second screen that showed the same fields. */}
              <Field span="half" label="Surname / Nom (1)" value={surname} fill="#identity" big />
              <Field span="half" label="Given names (2)" value={given} fill="#identity" big />

              <Field label="Nationality (3)" value="Together City" />
              <Field label="Sex (5)" value={mark === 'declined' ? null : mark}
                fill={mark === null ? '#identity' : undefined} />

              <Field label="Date of birth (4)" value={asDate(m?.dateOfBirth)} fill="#identity" />
              <Field label="Place of birth (6)" value={place} fill="#birth" />

              <Field label="Date of issue (7)" value={asDate(issued)} />
              <Field label="Authority (8)" value="Together City" />

              <Field label="Residence (9)" value={residence} fill="#contact" />
              <Field label="Languages (11)" value={m?.languages ?? null} fill="#identity" />

              <Field span="half" label="Correspondence (10)" value={user?.handle ? `${user.handle}@togethercity.app` : null} />

              {/* Validity used to sit in a hand-typed crest. The artwork
                  prints its own header, so it is a field — which is where a
                  document would have put it anyway. */}
              <Field span="half" label="Validity (12)"
                value={validity == null ? null : validity === 100 ? 'Fully endorsed' : `${validity}% endorsed`} />
            </div>
          </div>

          {/* Not a real machine-readable zone and not pretending to be one —
              see the note in Passport.tsx. It is a texture that says the city
              knows who you are. */}
          <div className="pmrz" aria-hidden="true">{mrz[0]}<br />{mrz[1]}</div>
        </div>

        {/* THE OPEN BOOKLET. The sheet is portrait, so the width it does not
            use goes to the visa pages rather than to margin — a document on
            the left and its endorsements on the right, which is what an open
            passport actually looks like. */}
        <div>
          <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.65, margin: '2px 0 14px', maxWidth: '46ch' }}>
            Entered once — every hub in the city reads from it. Nothing is
            asked for twice.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 26 }}>
            {/* The boxes are on this page now, so this scrolls rather than
                navigates. A plain anchor, because the browser already knows how
                to reach a heading on the page it is showing. */}
            <a href="#your-details"><Button variant="accent" size="sm">Edit your details</Button></a>
            <Link to="/profile/avatar"><Button variant="line" size="sm">Use a drawn face</Button></Link>
            <Button variant="line" size="sm" onClick={signOut}>Sign out</Button>
          </div>

          <div className="eyebrow">Visas &amp; permits</div>
          <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 14px', maxWidth: '48ch', lineHeight: 1.55 }}>
            One page per hub, stamped by what it knows about you — blank until
            you’ve been there.
          </p>
          {isLoading && <Spinner />}
          {isError && <EmptyState title="Couldn't load your pages" hint="Reload in a moment." />}
          {pages.length > 0 && (
            <div className="pvisas">
              {pages.map((pg) => <Visa key={pg.href} page={pg} />)}
            </div>
          )}
        </div>
        </div>

        <div className="mp-gap" />

        {/* ── THE RECORD ITSELF ──────────────────────────────────────────
            The document above is a drawing of these boxes. They were a second
            page at /profile/master until 28 Aug, which meant the line reading
            DATE OF BIRTH and the field that sets it were one click and one
            page title apart — and the title a citizen landed on named the
            drawing rather than the record. Directly beneath it now, on the
            page that shares its name. */}
        <MasterProfileSections />

        <div className="mp-gap" />

        {/* ── EVERY OTHER PROFILE, LINKED TO THIS ONE ────────────────────
            The record above is the source. This is what reads from it, and
            what each hub has added of its own — one collapsed panel per
            store, so the citizen can finally answer "what do you have on me"
            without opening fourteen pages.

            It sits directly beneath the boxes rather than at the foot of the
            page for the same reason the boxes sit beneath the document: the
            claim and its evidence belong next to each other. Read-only by
            design — every panel ends at the door to the hub that owns the
            writing. */}
        <CityProfiles />

        <div className="mp-gap" />

        {/* ── THE VISA PAGES ────────────────────────────────────────────── */}
        {/* ── ENDORSEMENTS ─────────────────────────────────────────────
            Four doors that are not hubs. They were four identical cards in a
            column reading "Open →" four times; as a strip of endorsements
            they stop competing with the visa pages above them. */}
        <div className="eyebrow">Endorsements</div>
        <div className="pvisas" style={{ margin: '10px 0 30px' }}>
          {[
            { to: '/connections', code: 'CIT', label: 'Other citizens', body: 'Find people, follow them, and answer the requests waiting on you.', badge: reqCount },
            { to: '/calendar', code: 'CAL', label: 'Calendar', body: 'Your appointments, bookings and reminders across the city.' },
            { to: '/profile/astrology', code: 'SKY', label: 'Astrology profile', body: 'Birth date, time and place — entered once, read by horoscopes, matchmaking and compatibility.' },
            { to: '/profile/avatar', code: 'FCE', label: 'Avatar', body: 'A drawn face for beside your name and in calls, if you would rather not use a photograph.' },
          ].map((e) => (
            <Link key={e.to} to={e.to} className="pvisa" style={{ minHeight: 0 }}>
              <div className="phead">
                <span className="pcode">{e.code}</span>
                <b>{e.label}</b>
              </div>
              <p className="psum" style={{ marginRight: 0 }}>{e.body}</p>
              <div className="pfoot">
                <span>{e.badge ? `${e.badge > 9 ? '9+' : e.badge} waiting` : 'Endorsement'}</span>
                <span>Open →</span>
              </div>
            </Link>
          ))}
        </div>

        {/* ── DESIGN YOUR SERVICES ─────────────────────────────────────────
            The control room. The passport above says who you are; this says
            which parts of the city you keep. It sits on the profile because
            the profile is the one page that is about YOU rather than about a
            hub — and because the section that can hide a hub's doors must
            never live behind one of them. */}
        <div style={{ margin: '0 0 30px' }}>
          <DesignYourServices />
        </div>

        {/* ── THE BACK PAGES ───────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              style={{ position: 'relative', cursor: 'pointer', background: 'none', border: 'none', padding: '10px 14px', fontFamily: 'inherit',
                fontSize: 14, fontWeight: 600, color: tab === t.key ? 'var(--accent)' : 'var(--muted)',
                borderBottom: `2px solid ${tab === t.key ? 'var(--accent)' : 'transparent'}`, marginBottom: -1 }}>
              {t.label}
              {t.badge ? <span className="tag" style={{ marginLeft: 6, background: 'var(--danger-ink)', color: 'var(--on-accent)' }}>{t.badge}</span> : null}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            {/* The card that can CHANGE something comes first. The rows below
                restate values read-only; here is where they get fixed.

                SexAndGenderCard IS GONE FROM THIS TAB (28 Aug). It edited
                sexAtBirth and genderIdentity, and the Identity section further
                up this page now edits the same two columns — two editors for
                one field, on one screen, is the exact defect the Master
                Profile exists to undo, and last-blur-wins is not a merge
                strategy. The two questions are still asked separately, with
                the same "why we ask" beside each, where the rest of the
                record is. */}
            <VerificationCard />

            {/* OFFICIAL OBSERVATIONS — the reference passport's page 3, and
                the honest name for a list of read-only rows. */}
            {data && data.sections.length > 0 && (
              <div className="pobs" style={{ marginTop: 16 }}>
                <h3>Official observations</h3>
                <div style={{ marginTop: 8 }}>
                  {data.sections.map((sec) => (
                    <div key={sec.key} className="oline">
                      <span>{sec.label}</span>
                      <span style={{ color: sec.value ? 'var(--ink)' : 'var(--muted)' }}>
                        <ValueOrEmpty value={sec.value} label={sec.label} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 16 }}><HealthScoreCard /></div>
          </>
        )}

        {tab === 'notifications' && <NotificationsTab />}

        {/* The one part of the passport that is meant to leave the city. */}
        <CitizenCard
          name={name}
          handle={user?.handle ?? 'citizen'}
          email={user?.handle ? `${user.handle}@togethercity.app` : ''}
          photo={photo}
          since={issued ? `Citizen since ${new Date(issued).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}` : null}
        />

        {/* ── SURRENDER THE DOCUMENT ────────────────────────────────────────
            A permanent section at the foot, not a tab.

            Deleting your account was the third tab on this page, which meant
            it was invisible until you went looking for the word "delete" —
            and a page whose whole subject is "here is everything the city
            holds about you" owes the way out the same visibility as the way
            in. It reads plainly rather than in red: this is a decision
            somebody arrives at, not one they need frightening away from. The
            protections are DeleteAccountCard's own, shared with Settings, so
            the danger zone cannot drift between its two doors. */}
        <section className="esec" style={{ marginTop: 34 }}>
          <h2>Surrender the document</h2>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 4px', maxWidth: '62ch', lineHeight: 1.6 }}>
            Deleting your account deletes your one identity across every hub —
            the data page above, every visa in it, and everything each hub has
            recorded. It cannot be undone and nobody at Together City can
            restore it for you.
          </p>
          <p className="muted" style={{ fontSize: 13, margin: '0 0 4px', maxWidth: '62ch', lineHeight: 1.6 }}>
            If you only want a quieter city, you can{' '}
            <button type="button" onClick={signOut}
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: 'var(--accent-ink)', textDecoration: 'underline' }}>
              sign out
            </button>{' '}
            instead, or turn things off one at a time in{' '}
            <Link to="/settings" style={{ fontWeight: 700 }}>Settings</Link>. Nothing is lost either way.
          </p>
          <DeleteAccountCard />
        </section>
      </div>
    </div>
  );
}
