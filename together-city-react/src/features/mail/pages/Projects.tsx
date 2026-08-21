import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useScaleLock } from '@/hooks/useScaleLock';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import {
  useMailAccount, useMailProjects, useCreateProject, useUpdateProject, useDeleteProject,
  PROJECT_CAP, mailError, type MailProject,
} from '../api';
import { iconForName, tintOf, FOLD_TINTS } from '../folderLook';
import { SkinSwatches } from '@/components/SkinSwatches';

/**
 * TOGETHER CITY MAIL — THE DOOR, AS A WALL OF FOLDERS.
 *
 * /mail used to be a hub landing that redirected past itself on every visit
 * after the first, so the mailbox had a front door nobody ever stood in. This
 * is that door: All Emails at the top, then one folder per project, then the
 * way to make another.
 *
 * THEY ARE DRAWN AS FOLDERS, WITH THE TAB, because that is the object they
 * are. A row in a list is a thing you scan; a folder is a thing you open, and
 * the whole point of this screen is that you choose a room BEFORE you read any
 * mail. The shape does the explaining that a paragraph would otherwise have to.
 *
 * COLOUR IS THE ONE EXCEPTION THIS CITY MAKES. Everything else here is black,
 * white and one grey — but nine folders in a grid are told apart by hue long
 * before they are told apart by name, which is exactly what the reference was
 * showing. The tints live in tokens.css with their contrast measured; nothing
 * chromatic is decided in this file.
 *
 * THE MARK IS DERIVED FROM THE NAME and is allowed to fail to a plain folder —
 * see folderLook.ts. All Emails is slate, never one of the nine: the whole
 * mailbox is not a room inside itself.
 */

const keyFrom = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

/** The overflow key. Open is the card itself, so the menu carries the two
 *  things the card cannot: putting a finished project away, and closing it. */
function FolderMenu({ p }: { p: MailProject }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const nav = useNavigate();
  const box = useRef<HTMLSpanElement>(null);

  // A menu that outlives the pointer is a menu somebody closes by reloading.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) { setOpen(false); setConfirming(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setConfirming(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <span className="mfold-menu-wrap" ref={box}>
      <button type="button" className="mfold-menu-key" aria-label={`More for ${p.name}`}
        aria-haspopup="menu" aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}>
        <Icon name="more" size={16} />
      </button>
      {open && (
        <div className="mfold-menu">
          <button type="button" onClick={() => nav(`/mail/p/${p.key}`)}>Open</button>
          <button type="button" disabled={update.isPending}
            onClick={() => update.mutate({ id: p.id, archived: !p.archived }, { onSuccess: () => setOpen(false) })}>
            {p.archived ? 'Bring back' : 'Archive'}
          </button>
          {/* Archive and Delete both closed the menu on success and did nothing
              at all on failure — the menu simply stayed open, which reads as a
              press that missed rather than a request that was refused. */}
          {(update.isError || remove.isError) && (
            <p className="mfold-menu-mishap" role="alert">
              ⚠ {update.isError
                ? mailError(update.error, 'That did not save.')
                : mailError(remove.error, 'The project could not be closed.')}
            </p>
          )}
          {!confirming ? (
            <button type="button" className="mfold-menu-del" onClick={() => setConfirming(true)}>Delete…</button>
          ) : (
            <div className="mfold-menu-confirm">
              <p>
                {p.total === 0
                  ? 'This project holds nothing. Deleting it closes the room and nothing else.'
                  : `${plural(p.total, 'conversation')} return to All Emails, where they have been all along. Nothing is deleted.`}
              </p>
              <Button variant="line" size="sm" disabled={remove.isPending}
                onClick={() => remove.mutate(p.id, { onSuccess: () => setOpen(false) })}>
                {remove.isPending ? 'Closing…' : 'Delete project'}
              </Button>
            </div>
          )}
        </div>
      )}
    </span>
  );
}

function ProjectFolder({ p }: { p: MailProject }) {
  const tint = tintOf(p.color);
  return (
    <div className={`mfold${p.archived ? ' is-archived' : ''}`} data-tint={tint}>
      <Link to={`/mail/p/${p.key}`} className="mfold-face">
        <span className="mfold-top">
          <span className="mfold-mark" aria-hidden><Icon name={iconForName(p.name)} size={19} /></span>
          <span className="mfold-count">{p.total.toLocaleString()}</span>
        </span>
        <span className="mfold-name">{p.name}</span>
        <span className="mfold-sub">
          {p.description
            ? p.description
            : p.total === 0
              ? 'Nothing yet — write the first message'
              : `${p.unread > 0 ? `${p.unread} unread · ` : ''}${plural(p.total, 'message')}`}
        </span>
      </Link>
      {p.archived && <span className="mfold-flag">Archived</span>}
      <FolderMenu p={p} />
    </div>
  );
}

function NewProject({ used, onDone }: { used: number; onDone: () => void }) {
  const create = useCreateProject();
  const acct = useMailAccount();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState<string>('blue');
  // ON BY DEFAULT: every project has an id, and it is the same mailbox.
  const [subAddress, setSubAddress] = useState(true);
  // What will actually be created: what they typed, or the name turned into a
  // key if they left the field alone. The box shows the first; this is the second.
  const finalKey = keyFrom(key) || keyFrom(name);
  const full = used >= PROJECT_CAP;
  const inp = { padding: '9px 11px', border: '1.5px solid var(--line-2)', borderRadius: 'var(--r-1)', fontSize: 13, fontFamily: 'inherit', width: '100%' } as const;
  const sub = acct.data?.address
    ? acct.data.address.replace('@', `+${finalKey || 'key'}@`)
    : `you+${finalKey || 'key'}@togethercity.app`;

  return (
    <div className="card mproj-sheet">
      <h3 style={{ margin: '0 0 3px', fontSize: 16 }}>New project</h3>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 12.5 }}>
        {used} of {PROJECT_CAP} used. A project files mail; it never hides it.
      </p>

      {/* The folder being made, drawn as it will look. A colour picked from
          nine swatches is a guess until you see it on the object. */}
      <div className="mfold mfold-preview" data-tint={tintOf(color)}>
        <span className="mfold-face" aria-hidden>
          <span className="mfold-top">
            <span className="mfold-mark"><Icon name={iconForName(name)} size={19} /></span>
            <span className="mfold-count">0</span>
          </span>
          <span className="mfold-name">{name.trim() || 'New project'}</span>
          <span className="mfold-sub">{description.trim() || 'Nothing yet — write the first message'}</span>
        </span>
      </div>

      <div className="mproj-fields">
        <label style={{ display: 'block' }}>
          <span className="eyebrow">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ABG Project" style={inp} />
        </label>
        <label style={{ display: 'block' }}>
          <span className="eyebrow">Short key</span>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={keyFrom(name) || 'abg'} style={inp} />
        </label>
      </div>
      <label style={{ display: 'block', marginBottom: 12 }}>
        <span className="eyebrow">What it is for <span className="muted" style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 500 }}>(optional)</span></span>
        <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={80}
          placeholder="Campaigns, production & communication" style={inp} />
      </label>

      <fieldset className="mfold-swatches">
        <legend className="eyebrow">Colour</legend>
        {FOLD_TINTS.map((t) => (
          <button key={t} type="button" className={`mfold-swatch${color === t ? ' on' : ''}`} data-tint={t}
            aria-label={t} aria-pressed={color === t} onClick={() => setColor(t)} />
        ))}
      </fieldset>

      {/* The id, shown in full rather than described. It is on because mail
          sent from this project is sent Reply-To it — which is what makes a
          reply come home to the room instead of merely usually doing so. */}
      <label className="mproj-check">
        <input type="checkbox" checked={subAddress} onChange={(e) => setSubAddress(e.target.checked)} />
        <span>
          Give this project the id <strong>{sub}</strong>. Mail you send from here replies to
          it, so answers come back to this folder.
          <span className="muted"> Same mailbox, same 10 GB — the tag only says which room.</span>
        </span>
      </label>
      <p className="muted" style={{ fontSize: 12, margin: '12px 0 0', lineHeight: 1.55 }}>
        Nothing is imported. The project opens empty and fills with what you send from it — and every reply comes back to it.
      </p>
      {create.isError && (
        <p style={{ fontSize: 12.5, margin: '10px 0 0', color: 'var(--danger-ink)' }}>
          {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'That project could not be created.'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button variant="accent" size="sm"
          disabled={create.isPending || full || !name.trim() || !finalKey}
          onClick={() => create.mutate(
            { name: name.trim(), key: finalKey, subAddress, color, description: description.trim() || undefined },
            { onSuccess: onDone },
          )}>
          {create.isPending ? 'Creating…' : 'Create project'}
        </Button>
        <Button variant="line" size="sm" onClick={onDone}>Cancel</Button>
      </div>
      {full && (
        <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          You already have {PROJECT_CAP} projects, which is the limit. Deleting one never deletes its mail.
        </p>
      )}
    </div>
  );
}

export function MailProjects() {
  useScaleLock();
  const acct = useMailAccount();
  const q = useMailProjects();
  const [making, setMaking] = useState(false);
  const projects = q.data ?? [];
  const a = acct.data;
  const all = a ? a.counts.inbox + a.counts.sent : 0;

  return (
    <div className="mproj-page">
      <header className="mproj-head">
        <h1>All Emails</h1>
        <p className="muted">All your emails in one place — {a?.address ?? '…'}</p>
        {/* THE COLOUR OF THE ROOM, CHANGED IN THE ROOM. It is also in Settings
            → Appearance, and this is the same component reading the same store
            rather than a second control — but a colour is a thing you judge by
            looking at it, and sending somebody to a settings page to pick one
            means choosing blind and walking back to check. Chat has had its
            swatches beside its own header since the day palettes arrived; the
            mailbox having to be different was an accident of where the picker
            got built first, not a decision. */}
        <div className="mproj-skin">
          <span className="eyebrow">Colour</span>
          <SkinSwatches hub="mail" compact />
        </div>
      </header>

      {/* "No projects yet" is a claim about this citizen's mailbox, and when the
          request failed it was made without checking. Somebody who has built
          nine rooms opened this page on a bad connection and was shown the
          first-run copy inviting them to make their first one. */}
      {q.isError ? (
        <EmptyState icon="⚠️" title="Couldn't open your projects"
          hint="Nothing has been deleted — we couldn’t reach your mailbox just now. Your mail is all still in All Emails. Try again in a moment." />
      ) : q.isLoading ? <Spinner label="Opening your mailbox…" /> : (
        <>
          {/* The whole mailbox, and never one of the nine tints: it is not a
              room inside itself. Larger than the projects, and centred, so the
              way back to everything is the first thing on the screen. */}
          <div className="mfold mfold-all" data-tint="slate">
            <Link to="/mail/inbox" className="mfold-face">
              <span className="mfold-top">
                <span className="mfold-mark" aria-hidden><Icon name="mail" size={22} /></span>
                <span className="mfold-count">{all.toLocaleString()}</span>
              </span>
              <span className="mfold-name">All Emails</span>
              <span className="mfold-sub">
                {a && a.counts.inboxUnread > 0
                  ? `${a.counts.inboxUnread} unread · all incoming and general emails`
                  : 'All incoming and general emails'}
              </span>
            </Link>
          </div>

          <h2 className="mproj-h2">Projects</h2>
          {projects.length === 0 ? (
            <p className="muted mproj-none">
              No projects yet. A project is a room inside this mailbox: what you send from it comes
              back to it, and nothing else is ever filed there.
            </p>
          ) : (
            <div className="mfold-grid">
              {projects.map((p) => <ProjectFolder key={p.id} p={p} />)}
            </div>
          )}

          {!making && (
            <button type="button" className="mfold-new" onClick={() => setMaking(true)}>
              <span className="mfold-new-plus" aria-hidden><Icon name="plus" size={18} /></span>
              <span className="mfold-new-said">
                <b>Create New Project</b>
                <span className="muted">You can create up to {PROJECT_CAP} projects</span>
              </span>
              <span className="mfold-new-count">
                <span className="mfold-new-pill">{projects.length} / {PROJECT_CAP}</span>
                <span className="muted">projects used</span>
              </span>
            </button>
          )}
        </>
      )}

      {making && <div style={{ marginTop: 14 }}><NewProject used={projects.length} onDone={() => setMaking(false)} /></div>}
    </div>
  );
}
