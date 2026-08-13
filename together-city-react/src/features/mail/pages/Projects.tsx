import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useScaleLock } from '@/hooks/useScaleLock';
import { Button, Spinner } from '@/components/ui';
import {
  useMailAccount, useMailProjects, useCreateProject, mailTime,
  PROJECT_CAP, type MailProject,
} from '../api';

/**
 * TOGETHER CITY MAIL — THE DOOR.
 *
 * Mail opens on its rooms rather than on an inbox. /mail used to be a hub
 * landing: a photograph, an Explore button, and a redirect straight past
 * itself on every visit after the first — so the mailbox had a front door
 * nobody ever stood in. This is the screen that replaces it, and it is the
 * whole reason a project reads as a place you enter rather than a filter you
 * applied.
 *
 * ALL EMAIL IS FIRST AND IT IS INKED, because it is the mailbox and every
 * project is a room inside it. Nothing is ever hidden from it — a filed
 * conversation is still in All Email, wearing a chip — and the card says so
 * in those words, because the fear a folder system creates is that mail has
 * gone somewhere you will not find it again.
 *
 * NO NEW VISUAL LANGUAGE. These are the city's `.card`s in the grid the
 * districts screen already uses; the only new classes are the geometry this
 * grid needs, and they carry no colour of their own.
 */

/** A key is a URL segment and half an email address. Suggested from the name,
 *  never silently corrected under somebody's hands — the field stays theirs
 *  the moment they touch it. */
const keyFrom = (name: string): string =>
  name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);

function ProjectCard({ p }: { p: MailProject }) {
  return (
    <Link to={`/mail/p/${p.key}`} className="card lift mproj-card" data-quiet={p.total === 0 ? '1' : undefined}>
      <div className="mproj-top">
        <span className="mproj-dot" aria-hidden />
        <span className="mproj-key">{p.key}</span>
        {p.archived && <span className="mproj-flag">Archived</span>}
      </div>
      <h3 className="mproj-name">{p.name}</h3>
      <div className="mproj-met">
        {p.total === 0
          ? 'Nothing yet'
          : `${p.unread > 0 ? `${p.unread} unread · ` : ''}${p.total} message${p.total === 1 ? '' : 's'}`}
      </div>
      <div className="mproj-foot">
        {p.last
          ? `${p.last.outbound ? 'To ' : ''}${p.last.who || 'Someone'} · ${mailTime(p.last.at)}`
          : 'Write the first message'}
      </div>
    </Link>
  );
}

function NewProject({ used, onDone }: { used: number; onDone: () => void }) {
  const create = useCreateProject();
  const acct = useMailAccount();
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [touchedKey, setTouchedKey] = useState(false);
  const [subAddress, setSubAddress] = useState(false);
  const shownKey = touchedKey ? key : keyFrom(name);
  const full = used >= PROJECT_CAP;
  const inp = { padding: '9px 11px', border: '1.5px solid var(--line-2)', borderRadius: 10, fontSize: 13, fontFamily: 'inherit', width: '100%' } as const;
  const sub = acct.data?.address
    ? acct.data.address.replace('@', `+${shownKey || 'key'}@`)
    : `you+${shownKey || 'key'}@togethercity.app`;

  return (
    <div className="card mproj-sheet">
      <h3 style={{ margin: '0 0 3px', fontSize: 16 }}>New project</h3>
      <p className="muted" style={{ margin: '0 0 14px', fontSize: 12.5 }}>
        {used} of {PROJECT_CAP} used. A project files mail; it never hides it.
      </p>
      <div className="mproj-fields">
        <label style={{ display: 'block' }}>
          <span className="eyebrow">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ABG" style={inp} />
        </label>
        <label style={{ display: 'block' }}>
          <span className="eyebrow">Short key</span>
          <input value={shownKey} onChange={(e) => { setTouchedKey(true); setKey(e.target.value); }} placeholder="abg" style={inp} />
        </label>
      </div>
      {/* The sub-address is the ONE inbound path that does not begin with the
          citizen, so it is off until they ask for it and it is shown in full
          rather than described. */}
      <label className="mproj-check">
        <input type="checkbox" checked={subAddress} onChange={(e) => setSubAddress(e.target.checked)} />
        <span>
          Also accept mail addressed to <strong>{sub}</strong>, so somebody outside can start a
          conversation here. <span className="muted">Off by default — still one mailbox, not a second account.</span>
        </span>
      </label>
      <p className="muted" style={{ fontSize: 12, margin: '12px 0 0', lineHeight: 1.55 }}>
        Nothing is imported. The project opens empty and fills with what you send from it.
      </p>
      {create.isError && (
        <p style={{ fontSize: 12.5, margin: '10px 0 0', color: 'var(--danger-ink)' }}>
          {(create.error as { response?: { data?: { message?: string } } })?.response?.data?.message
            ?? 'That project could not be created.'}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <Button variant="accent" size="sm"
          disabled={create.isPending || full || !name.trim() || !shownKey.trim()}
          onClick={() => create.mutate(
            { name: name.trim(), key: shownKey.trim(), subAddress },
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
  const projects = useMemo(() => q.data ?? [], [q.data]);
  const a = acct.data;

  return (
    <div>
      <div style={{ margin: '4px 0 14px' }}>
        <div className="eyebrow">Together City Mail</div>
        <h1 style={{ fontSize: 24, margin: '2px 0 4px' }}>Your mailbox</h1>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          {a?.address ?? '…'} — All Email holds everything. A project is a room inside it.
        </p>
      </div>

      {q.isLoading ? <Spinner label="Opening your mailbox…" /> : (
        <div className="mproj-grid">
          <Link to="/mail/inbox" className="card lift mproj-card is-all">
            <div className="mproj-top"><span className="mproj-key">All</span></div>
            <h3 className="mproj-name">All Email</h3>
            <div className="mproj-met">
              {a ? `${a.counts.inboxUnread > 0 ? `${a.counts.inboxUnread} unread · ` : ''}${a.counts.inbox + a.counts.sent} messages` : '…'}
            </div>
            <div className="mproj-foot">Every message in the city, always</div>
          </Link>

          {projects.map((p) => <ProjectCard key={p.id} p={p} />)}

          {!making && (
            <button type="button" className="card mproj-card is-add" onClick={() => setMaking(true)}>
              <span className="mproj-add-l">+ New project</span>
              <span className="muted" style={{ fontSize: 11.5 }}>{projects.length} of {PROJECT_CAP} used</span>
            </button>
          )}
        </div>
      )}

      {making && <div style={{ marginTop: 14 }}><NewProject used={projects.length} onDone={() => setMaking(false)} /></div>}
    </div>
  );
}
