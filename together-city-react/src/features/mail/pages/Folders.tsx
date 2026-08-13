import { useEffect, useMemo, useState } from 'react';
import { useScaleLock } from '@/hooks/useScaleLock';
import { Link, NavLink, useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import {
  useMailAccount, useMailList, useFlagMail, useRemoveMail, useSetPrimary, useOutbox,
  useMailProjects, useUpdateProject, useDeleteProject,
  humanBytes, mailTime, initials, avatarHue, useRetryMail, useDiscardDraft,
  type Folder, type MailProject,
} from '../api';
import { groupByThread, type Convo } from '../threading';
import { iconForName, tintOf, FOLD_TINTS } from '../folderLook';

/** Outbound delivery log — every email/SMS sent through the messaging provider. */
function DeliveryLog() {
  const q = useOutbox();
  const rows = q.data ?? [];
  if (!rows.length) return <div className="muted" style={{ fontSize: 12.5, padding: '4px 0' }}>Nothing dispatched yet — bills and recovery codes will show here.</div>;
  return (
    <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
      {rows.map((d) => (
        <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 9 }}>
          <span style={{ fontSize: 14 }}>{d.channel === 'sms' ? '📱' : '📧'}</span>
          <span style={{ fontWeight: 600 }}>{d.subject}</span>
          <span className="muted">→ {d.to}</span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-soft)', background: 'var(--line)', borderRadius: 999, padding: '1px 8px' }}>via {d.provider}</span>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: d.status === 'sent' ? 'var(--ok-ink)' : d.status === 'failed' ? 'var(--danger-ink)' : 'var(--warn-ink)', background: d.status === 'sent' ? 'var(--ok-soft)' : d.status === 'failed' ? 'var(--danger-soft)' : 'var(--warn-soft)', borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase' }}>{d.status}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Address, primary-email row, and the 10 GB storage meter, shown atop every folder. */
export function AccountBar() {
  const q = useMailAccount();
  const setPrimary = useSetPrimary();
  const a = q.data;
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const pct = a ? Math.max(a.usedPct, a.usedBytes > 0 ? 0.5 : 0) : 0;
  const inp = { padding: '8px 10px', border: '1.5px solid var(--line)', borderRadius: 9, fontSize: 13, fontFamily: 'inherit' } as const;

  const openEdit = () => { setEmail(a?.primaryEmail ?? ''); setPhone(a?.phone ?? ''); setEditing(true); };

  /**
   * ON A PHONE THIS CARD IS NOT THE MAIL.
   *
   * At 390px the account card ran to roughly two hundred pixels — a 42px
   * envelope tile, the address, a storage meter, a Compose button and a
   * primary-email line — all of it above the first message. Every mail client
   * on a phone puts one thin bar at the top and then the mail, because the
   * mail is what you opened the app for; your own address is not news to you.
   *
   * It folded behind a "Details" word first. The owner shut that door on
   * 10 Aug: on a phone the bar is the address, and that is all it is. A
   * disclosure control is still a control — it is a word to read, a thing to
   * wonder about, and a tap that costs a screen — and none of what was behind
   * it is anything a citizen opens their mail to see.
   *
   * NOTHING IS DELETED. The storage meter, the primary email, the phone
   * number and the delivery log are all still stored, still returned by
   * /mail/account, and still ON THIS CARD at desk width, where the space is
   * free. Below 560 the meter and Compose hide (Compose becomes the floating
   * button the folder draws) and the rest of the card does not render its
   * door. Setting a primary email is a desk job now, which is where somebody
   * types an address they need to get right.
   */
  return (
    <div className="card mail-account">
      <div className="mail-account-top">
        <div className="mail-account-mark">✉️</div>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow mail-account-eyebrow" style={{ margin: 0 }}>Your city address</div>
          <div className="mail-account-addr">{a?.address ?? '…'}</div>
        </div>
        <div className="mail-account-meter">
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }} className="muted">
            <span>Storage</span>
            <span>{a ? `${humanBytes(a.usedBytes)} of ${humanBytes(a.quotaBytes)}` : '…'}</span>
          </div>
          <div style={{ height: 7, borderRadius: 999, background: 'var(--line)', overflow: 'hidden', marginTop: 4 }}>
            <div style={{ width: `${Math.min(100, Math.max(pct, a && a.usedBytes ? 2 : 0))}%`, height: '100%', background: pct > 90 ? 'var(--danger-ink)' : 'var(--accent)' }} />
          </div>
        </div>
        <Link to="/mail/compose" className="mail-account-compose"><Button variant="accent" size="sm">✍️ Compose</Button></Link>
      </div>

      <div className="mail-account-rest" style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 12.5 }}>
            {a?.primaryEmail ? (
              <span className="muted">📧 Bills & recovery also go to your primary email <strong style={{ color: 'var(--ink)' }}>{a.primaryEmail}</strong>{a.phone ? ` · 📱 ${a.phone}` : ''}</span>
            ) : (
              <span className="muted">No primary email set — add one so bills & recovery reach you outside the city.</span>
            )}
            {a && a.counts.emailed > 0 && (
              <button type="button" onClick={() => setShowLog((v) => !v)} style={{ background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{showLog ? 'Hide' : `${a.counts.emailed} sent`}</button>
            )}
            <button type="button" onClick={openEdit} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--accent-ink)', fontWeight: 600, cursor: 'pointer', fontSize: 12.5 }}>{a?.primaryEmail ? 'Edit' : 'Add primary email'}</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" style={{ ...inp, flex: 1, minWidth: 180 }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" style={{ ...inp, width: 160 }} />
            <Button variant="accent" size="sm" disabled={setPrimary.isPending} onClick={() => setPrimary.mutate({ email, phone }, { onSuccess: () => setEditing(false) })}>Save</Button>
            <Button variant="line" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        )}
        {showLog && !editing && <DeliveryLog />}
      </div>
    </div>
  );
}

const FOLDER_META: Record<Folder, { title: string; icon: string; eyebrow: string; empty: string }> = {
  inbox: { title: 'Inbox', icon: '📥', eyebrow: 'Mail · Inbox', empty: 'Your inbox is empty' },
  sent: { title: 'Sent', icon: '📤', eyebrow: 'Mail · Sent', empty: 'Nothing sent yet' },
  draft: { title: 'Drafts', icon: '✏️', eyebrow: 'Mail · Drafts', empty: 'Nothing half-written' },
  failed: { title: 'Failed', icon: '⚠️', eyebrow: 'Mail · Failed', empty: 'Nothing has failed to send' },
  // Two states, one question: what is still waiting on me?
  unsent: { title: 'Drafts & Failed', icon: '✏️', eyebrow: 'Mail · Unsent', empty: 'Nothing waiting — no drafts, nothing rejected' },
  starred: { title: 'Starred', icon: '⭐', eyebrow: 'Mail · Starred', empty: 'No starred mail' },
  trash: { title: 'Trash', icon: '🗑', eyebrow: 'Mail · Trash', empty: 'Trash is empty' },
};

function Row({ convo, folder, tag }: { convo: Convo; folder: Folder; tag?: string }) {
  const { head: m, count } = convo;
  const nav = useNavigate();
  const flag = useFlagMail();
  const remove = useRemoveMail();
  const retry = useRetryMail();
  const discard = useDiscardDraft();
  // A draft is not correspondence: it opens in the composer where it was left,
  // never in the reader, and it is thrown away rather than filed in Trash.
  const isDraft = m.folder === 'draft';
  const isSent = folder === 'sent' || folder === 'failed' || folder === 'unsent';
  const person = isSent ? { name: m.toName, addr: m.toAddr } : { name: m.fromName, addr: m.fromAddr };
  const hue = avatarHue(person.addr);
  const unread = convo.unread && folder === 'inbox';
  /**
   * THE ROW IS CLASSES NOW, NOT INLINE GEOMETRY, BECAUSE A PHONE NEEDS A
   * DIFFERENT SHAPE OF IT.
   *
   * On a desktop the subject and the snippet share one line and that reads
   * fine at 800px. On a 390px screen the same row spent about 150px on a star,
   * an avatar, a retry button and a bin before the words started — and then
   * capped the subject at 42% of what was left, which is roughly eighty
   * pixels. Nobody has ever read an email subject in eighty pixels.
   *
   * So below 560 the row takes the shape every mail client on a phone has
   * settled on: avatar, then sender / subject / snippet on three lines of
   * their own, each truncated once, with the star moved to the right edge
   * where a thumb reaches it without crossing the text.
   *
   * The bin leaves the row on a phone — but ONLY where there is another way to
   * do it. A message has Delete inside it; a draft has nothing yet, so the
   * draft keeps its bin. A control removed with no replacement is not a
   * simplification, it is a lost capability.
   */
  const binHasAnotherDoor = !isDraft; // MessageView carries Delete; the composer does not carry Discard
  return (
    <div className={`mail-row${unread ? ' unread' : ''}`}
      onClick={() => nav(isDraft ? `/mail/compose?draft=${m.id}` : `/mail/message/${m.id}`)}>
      <div className="mail-av" style={{ background: m.system ? 'var(--accent)' : `hsl(${hue},52%,45%)` }}>
        {m.system ? '🏙' : initials(person.name)}
      </div>
      <div className="mail-body">
        <div className="mail-l1">
          {isDraft && <span className="mail-draft">Draft</span>}
          <span className="mail-from">
            {isSent ? (person.name ? `To: ${person.name}` : 'No recipient yet') : person.name}
            {count > 1 && <span className="muted" style={{ fontWeight: 600, marginLeft: 6 }}>{count}</span>}
          </span>
        </div>
        <div className="mail-l2">
          {/* WHICH ROOM THIS CONVERSATION IS FILED IN — drawn in All Email and
              nowhere else. Inside a project every row is that project, and a
              chip that never varies is a chip that says nothing. A label
              rather than a control: the row is already a link to the message,
              and Move lives in the reader where the message can be read
              before it is filed. */}
          {tag && <span className="mail-ptag">{tag}</span>}
          <span className="mail-subj">{m.subject || (isDraft ? '(no subject)' : m.subject)}</span>
          <span className="mail-snip muted"><span className="mail-dash">— </span>{m.snippet}</span>
        </div>
        {/* The provider's own words. A failure the citizen cannot read the
            reason for is one they cannot do anything about. */}
        {m.failureReason && <div className="mail-fail">⚠ {m.failureReason}</div>}
      </div>
      {/* The time is a child of the ROW, not of the sender line.
          Gmail's desktop list is one line — sender, then subject and snippet
          running together, then the date hard against the right edge. With the
          date nested inside the sender line it can only ever sit next to the
          name, which is the two-line shape and not this one. */}
      <span className="mail-time muted">{mailTime(m.createdAt)}</span>
      {m.folder === 'failed' && (
        <button type="button" className="mail-retry" disabled={retry.isPending} title="Try sending this again"
          onClick={(e) => { e.stopPropagation(); retry.mutate(m.id); }}>
          {retry.isPending ? 'Sending…' : 'Try again'}
        </button>
      )}
      <button type="button" className="mail-star" title="Star" aria-label={m.starred ? 'Unstar' : 'Star'}
        style={{ color: m.starred ? 'var(--warn-ink)' : 'var(--line-2)' }}
        onClick={(e) => { e.stopPropagation(); flag.mutate({ id: m.id, starred: !m.starred }); }}>
        {m.starred ? '★' : '☆'}
      </button>
      <button type="button" className={`mail-bin${binHasAnotherDoor ? ' has-another-door' : ''}`}
        title={isDraft ? 'Discard this draft' : folder === 'trash' ? 'Delete forever' : 'Move to trash'}
        aria-label={isDraft ? 'Discard this draft' : folder === 'trash' ? 'Delete forever' : 'Move to trash'}
        disabled={discard.isPending}
        onClick={(e) => { e.stopPropagation(); if (isDraft) discard.mutate(m.id); else remove.mutate(m.id); }}>🗑</button>
    </div>
  );
}

/**
 * SEARCH IN MAIL, WHERE EVERY MAIL CLIENT PUTS IT: a bar above the list.
 *
 * Typed here, filtered on the SERVER over subject, both names, both addresses
 * and the body — a client-side filter over the rows already fetched would only
 * ever search the newest page of one folder and would quietly fail to find the
 * message a citizen is sure they have.
 *
 * DEBOUNCED, AND THAT IS THE WHOLE COMPONENT. The input holds what is typed and
 * the query holds what has settled; without the gap between them the list
 * re-sorts under somebody's hands on every keystroke, which reads as breakage
 * rather than as speed. 250ms is the standard beat — long enough that a normal
 * typist issues one request for a word, short enough that nobody waits.
 */
function MailSearch({ value, onChange, scope }: { value: string; onChange: (v: string) => void; scope?: string }) {
  // "Search in ABG" rather than "Search in mail" when you are in ABG: the box
  // searches the room you are standing in, and saying so is cheaper than
  // finding out.
  const label = scope ? `Search in ${scope}` : 'Search in mail';
  return (
    <div className="mail-search">
      <span aria-hidden className="mail-search-icon"><Icon name="search" size={17} /></span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-label={label}
        className="mail-search-input"
      />
      {value && (
        <button type="button" className="mail-search-clear" aria-label="Clear search"
          onClick={() => onChange('')}>×</button>
      )}
    </div>
  );
}

function FolderView({ folder, project }: { folder: Folder; project?: MailProject }) {
  // A mailbox is read, not zoomed. Scrolling is untouched.
  useScaleLock();
  const meta = FOLDER_META[folder];
  const [typed, setTyped] = useState('');
  const [needle, setNeedle] = useState('');
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setNeedle(typed.trim()), 250);
    return () => clearTimeout(t);
  }, [typed]);
  const q = useMailList(folder, needle, project?.key);
  const rows = q.data ?? [];

  /**
   * The chip a row wears in All Email. Built from the project list rather than
   * carried on the message, so renaming a project renames it everywhere at
   * once — and skipped entirely inside a project, where every row is that
   * project and the chip would be a word repeated down the page.
   */
  const projects = useMailProjects();
  const tags = useMemo(() => {
    const m = new Map<string, string>();
    if (!project) for (const p of projects.data ?? []) m.set(p.id, p.name);
    return m;
  }, [projects.data, project]);

  const composeTo = project ? `/mail/compose?project=${project.key}` : '/mail/compose';

  return (
    <div>
      {project
        ? <ProjectBar project={project} settingsOpen={settings} onSettings={() => setSettings((v) => !v)} />
        : <AccountBar />}
      {project && <ProjectFolders project={project} />}
      {project && settings && <ProjectSettings project={project} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 10px' }}>
        <div>
          <div className="eyebrow">{project ? `${project.name} · ${meta.title}` : meta.eyebrow}</div>
          <h1 style={{ fontSize: 24, margin: 0 }}>{meta.icon} {meta.title}</h1>
        </div>
      </div>
      <MailSearch value={typed} onChange={setTyped} scope={project?.name} />
      {q.isLoading ? <Spinner label="Loading mail…" />
        : q.isError ? <EmptyState title="Couldn't load mail" hint="Nothing has been deleted — we couldn’t reach your mailbox. Try again in a moment." />
        : rows.length === 0 ? (
          needle
            // A search that finds nothing is not an empty mailbox, and saying
            // "no mail yet" to somebody looking at a full inbox is a lie the
            // interface tells about itself.
            ? <EmptyState icon="🔍" title={`Nothing in ${meta.title} matches “${needle}”`}
                hint="Search looks at the sender, the recipients, the subject and the words in the message — in this folder." />
            /* A NEW PROJECT IS EMPTY, AND THE EMPTY STATE IS THE INSTRUCTION.
               No mail is swept in when a project is made, so the first thing
               somebody sees here has to say how it fills — otherwise an empty
               room reads as a broken one. */
            : project
              ? <EmptyState icon="✉️" title={`Nothing in ${project.name} yet`}
                  hint="Mail you write from inside this project lands in its Sent — and every reply to it arrives here. Old mail is not moved in automatically; open a conversation in All Email and move it here if it belongs." />
              : <EmptyState icon={meta.icon} title={meta.empty} hint={folder === 'inbox' ? 'City mail will appear here.' : undefined} />
        )
        : <div className="card mail-list" style={{ padding: 0, overflow: 'hidden' }}>
            {groupByThread(rows).map((c) => (
              <Row key={c.head.id} convo={c} folder={folder}
                tag={c.head.projectId ? tags.get(c.head.projectId) : undefined} />
            ))}
          </div>}
      {/* The thing you came to do, under your thumb. Phone-only — on a desktop
          Compose is already in the bar above, and a button floating over a
          page with room to spare is just a button in the way. */}
      <Link to={composeTo} className="mail-fab" aria-label="Compose">
        <span aria-hidden>✍️</span><span>Compose</span>
      </Link>
    </div>
  );
}

export function Inbox() { return <FolderView folder="inbox" />; }
export function Sent() { return <FolderView folder="sent" />; }
export function Failed() { return <FolderView folder="failed" />; }
export function Unsent() { return <FolderView folder="unsent" />; }
export function Starred() { return <FolderView folder="starred" />; }
export function Trash() { return <FolderView folder="trash" />; }

/**
 * THE BAR THAT SAYS WHICH MAILBOX YOU ARE STANDING IN.
 *
 * It takes the account bar's place rather than sitting under it. Your own
 * address is not news to you at the best of times; inside ABG it is the wrong
 * fact entirely, and two bars would leave the screen saying "you" louder than
 * it says "ABG". Same card, same geometry, same 42px mark — what changes is
 * what is written in it.
 */
function ProjectBar({ project, onSettings, settingsOpen }: {
  project: MailProject; onSettings: () => void; settingsOpen: boolean;
}) {
  return (
    <div className="card mail-account mproj-bar">
      <div className="mail-account-top">
        <div className="mail-account-mark" aria-hidden><Icon name={iconForName(project.name)} size={20} /></div>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow mail-account-eyebrow" style={{ margin: 0 }}>Together City Mail · Project</div>
          <div className="mproj-bar-name">
            {project.name}
            {project.address && <span className="muted mproj-bar-addr"> · {project.address}</span>}
          </div>
        </div>
        <div className="mproj-bar-keys">
          <Button variant="line" size="sm" onClick={onSettings} aria-expanded={settingsOpen}>
            {settingsOpen ? 'Close settings' : 'Project settings'}
          </Button>
          <Link to={`/mail/compose?project=${project.key}`} className="mail-account-compose">
            <Button variant="accent" size="sm">✍️ Compose in {project.name}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** The project's own folders, on the chip rail the hub already uses for its
 *  sections. Nothing new for a phone: this is the shape that is there. */
function ProjectFolders({ project }: { project: MailProject }) {
  const items: Array<[Folder, string]> = [
    ['inbox', 'Inbox'], ['sent', 'Sent'], ['unsent', 'Drafts & Failed'],
    ['starred', 'Starred'], ['trash', 'Trash'],
  ];
  return (
    <nav className="mproj-rail" aria-label={`${project.name} folders`}>
      {items.map(([f, label]) => (
        <NavLink key={f} end to={f === 'inbox' ? `/mail/p/${project.key}` : `/mail/p/${project.key}/${f}`}
          className={({ isActive }) => `chip${isActive ? ' on' : ''}`}
          style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          {label}
        </NavLink>
      ))}
      <Link to="/mail" className="chip mproj-out" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
        ↩ All Email
      </Link>
    </nav>
  );
}

/**
 * Rename, the sub-address, archive, delete.
 *
 * DELETE SAYS WHAT IT DOES BEFORE IT DOES IT, and what it does is nothing to
 * the mail: the count of conversations that will return to All Email is read
 * out of the project itself, so the sentence cannot drift from the truth.
 * Archive is offered first because most "delete this project" impulses are
 * really "I have finished with this project".
 */
function ProjectSettings({ project }: { project: MailProject }) {
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const nav = useNavigate();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [confirming, setConfirming] = useState(false);
  const inp = { padding: '9px 11px', border: '1.5px solid var(--line-2)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', width: '100%', maxWidth: 280 } as const;

  return (
    <div className="card mproj-settings">
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="eyebrow">Name</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
          <Button variant="line" size="sm" disabled={update.isPending || !name.trim() || name === project.name}
            onClick={() => update.mutate({ id: project.id, name: name.trim() })}>Save</Button>
        </div>
        {/* The key is a URL people bookmark and an address they hand out, so it
            does not change. Said here rather than left to be discovered. */}
        <span className="muted" style={{ fontSize: 11.5, display: 'block', marginTop: 6 }}>
          The key <strong>{project.key}</strong> stays as it is — it is this project's address in the app.
        </span>
      </label>

      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="eyebrow">What it is for</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80}
            placeholder="Campaigns, production & communication" style={{ ...inp, maxWidth: 380 }} />
          <Button variant="line" size="sm" disabled={update.isPending || description === (project.description ?? '')}
            onClick={() => update.mutate({ id: project.id, description })}>Save</Button>
        </div>
      </label>

      {/* The tint is saved on the press rather than behind a Save: it is one
          value, it is visible the instant it lands, and a colour you have to
          confirm is a colour you pick twice. */}
      <fieldset className="mfold-swatches" style={{ marginBottom: 14 }}>
        <legend className="eyebrow">Colour</legend>
        {FOLD_TINTS.map((t) => (
          <button key={t} type="button" className={`mfold-swatch${tintOf(project.color) === t ? ' on' : ''}`}
            data-tint={t} aria-label={t} aria-pressed={tintOf(project.color) === t} disabled={update.isPending}
            onClick={() => update.mutate({ id: project.id, color: t })} />
        ))}
      </fieldset>

      <label className="mproj-check">
        <input type="checkbox" checked={project.subAddress} disabled={update.isPending}
          onChange={(e) => update.mutate({ id: project.id, subAddress: e.target.checked })} />
        <span>
          Accept mail addressed to <strong>{project.address ?? `your address +${project.key}`}</strong>.
          <span className="muted"> The one way in that does not start with you.</span>
        </span>
      </label>

      <div className="mproj-settings-foot">
        <Button variant="line" size="sm" disabled={update.isPending}
          onClick={() => update.mutate({ id: project.id, archived: !project.archived })}>
          {project.archived ? 'Bring back' : 'Archive'}
        </Button>
        <span className="muted" style={{ fontSize: 12 }}>
          {project.archived
            ? 'Archived: out of the rail, filing kept, accepting nothing new.'
            : 'Finished with it? Archiving keeps the filing and stops new mail arriving here.'}
        </span>
      </div>

      <div className="mproj-danger">
        {!confirming ? (
          <button type="button" className="mproj-del" onClick={() => setConfirming(true)}>Delete this project</button>
        ) : (
          <div>
            <p style={{ margin: '0 0 10px', fontSize: 13, lineHeight: 1.55 }}>
              {project.total === 0
                ? 'This project holds nothing. Deleting it removes the room and nothing else.'
                : `${project.total} conversation${project.total === 1 ? '' : 's'} will return to All Email, where they have been all along. Nothing is deleted.`}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="line" size="sm" disabled={remove.isPending}
                onClick={() => remove.mutate(project.id, { onSuccess: () => nav('/mail') })}>
                {remove.isPending ? 'Closing…' : 'Delete project'}
              </Button>
              <Button variant="line" size="sm" onClick={() => setConfirming(false)}>Keep it</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A project's mailbox: the same folder view, one room in.
 *
 * The URL carries the key, and an unknown key is a real "no such project"
 * rather than an empty inbox — the API answers the same way, for the same
 * reason.
 */
export function ProjectMailbox({ folder = 'inbox' }: { folder?: Folder }) {
  const { key = '' } = useParams();
  const q = useMailProjects();
  const project = (q.data ?? []).find((p) => p.key === key.toLowerCase());
  if (q.isLoading) return <Spinner label="Opening the project…" />;
  if (!project) {
    return (
      <EmptyState icon="✉️" title={`No project called “${key}”`}
        hint="It may have been deleted — which never deletes mail. Everything it held is in All Email." />
    );
  }
  return <FolderView folder={folder} project={project} />;
}

export function ProjectInbox() { return <ProjectMailbox folder="inbox" />; }
export function ProjectFolderRoute() {
  const { folder = 'inbox' } = useParams();
  const known: Folder[] = ['inbox', 'sent', 'unsent', 'starred', 'trash'];
  return <ProjectMailbox folder={(known as string[]).includes(folder) ? (folder as Folder) : 'inbox'} />;
}
