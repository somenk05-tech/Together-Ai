import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, Chip, Spinner } from '@/components/ui';
import { CopyAddress } from './CopyAddress';
import {
  CATEGORY_CHIPS, categoryLabel, recordKindLabel, useEmptyMedicalTrash, useMedicalMailHome, useMedicalMailList, whenLabel,
  type Folder, type MedicalEmailItem,
} from './api';

const FOLDERS: Array<{ key: Folder; label: string }> = [
  { key: 'inbox', label: 'Inbox' }, { key: 'archived', label: 'Archived' }, { key: 'attachments', label: 'Attachments' },
  { key: 'starred', label: 'Starred' }, { key: 'trash', label: 'Trash' },
];

/**
 * MEDICAL MAIL — the front door (owner, 16 Sep).
 *
 * "A permanent digital address for a user's healthcare life." The address at
 * the top, the four counts under it (every one counted, none invented), then
 * the mail — a folder, a chip, a search, a page at a time — and, on the plain
 * inbox, the recent documents and the timeline that the mail produced. A
 * medical records system that happens to have an intelligent inbox: nothing
 * here composes, replies or forwards. Drawn by medical-mail.css.
 */
export function MedicalMail() {
  const home = useMedicalMailHome();
  const [params, setParams] = useSearchParams();
  const folder = (FOLDERS.some((f) => f.key === params.get('folder')) ? params.get('folder') : 'inbox') as Folder;
  const chip = CATEGORY_CHIPS.find((c) => c.key === (params.get('category') ?? 'all')) ?? CATEGORY_CHIPS[0];
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const set = (next: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) { if (v) p.set(k, v); else p.delete(k); }
    setParams(p);
  };
  const list = useMedicalMailList({ folder, category: chip.categories.join(',') || undefined, q: q || undefined });
  const emptyTrash = useEmptyMedicalTrash();
  const plain = folder === 'inbox' && chip.key === 'all' && !q;

  if (home.isLoading) return <Spinner label="Opening Medical Mail…" />;
  if (home.isError || !home.data) {
    return (
      <div>
        <div className="eyebrow">Medical Hub · Medical Mail</div>
        <h1 className="mm-h1">We couldn’t open Medical Mail</h1>
        <p className="muted mm-lead">Your mail is untouched — we just couldn’t read it. Try again.</p>
        <div className="mm-section"><Button onClick={() => void home.refetch()}>Try again</Button></div>
      </div>
    );
  }
  const h = home.data;
  const items: MedicalEmailItem[] = list.data?.pages.flatMap((p) => p.items) ?? [];
  const stat = (n: number, label: string) => (
    <div className="card"><div className="mm-stat-n">{n}</div><div className="mm-stat-l">{label}</div></div>
  );

  return (
    <div>
      <div className="eyebrow">Medical Hub · Medical Mail</div>
      <h1 className="mm-h1">Medical Mail</h1>
      <p className="muted mm-lead">
        Your medical emails, reports and attachments — automatically connected to your Health Records. Give this address to your doctor, hospital, lab, pharmacy or insurer: if it’s medical, it comes here.
      </p>

      <div className="card mm-address">
        <div className="mm-eyebrow">Your medical email address</div>
        <CopyAddress address={h.address} />
        <div className="mm-address-foot">
          {h.status === 'paused' && <span className="mm-paused">Paused — new mail is refused until you switch it back on.</span>}
          <Link to="/medical/mail/settings" className="mm-link">Settings, sender rules & privacy →</Link>
        </div>
      </div>

      <div className="mm-stats">
        {stat(h.stats.total, 'Medical emails')}
        {stat(h.stats.unread, 'Unread')}
        {stat(h.stats.documents, 'Documents')}
        {stat(h.stats.recentReports, 'Recent reports')}
      </div>

      {/* Folders, search, categories — one toolbar. */}
      <div className="mm-toolbar">
        <nav aria-label="Folders" className="mm-folders">
          {FOLDERS.map((f) => (
            <button key={f.key} type="button" className="mm-folder" onClick={() => set({ folder: f.key === 'inbox' ? '' : f.key })} aria-pressed={folder === f.key}>
              {f.label}
            </button>
          ))}
        </nav>
        <form className="mm-search" onSubmit={(e) => { e.preventDefault(); set({ q: draft.trim() }); }}>
          <input className="mm-input" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Search medical mail" placeholder="Search — a doctor, a lab, a report, a month" />
          <Button size="sm" variant="line" type="submit">Search</Button>
          {q && <Button size="sm" variant="ghost" type="button" onClick={() => { setDraft(''); set({ q: '' }); }}>Clear</Button>}
        </form>
      </div>
      <div className="mm-chips">
        {CATEGORY_CHIPS.map((c) => (
          <Chip key={c.key} selected={chip.key === c.key} onClick={() => set({ category: c.key === 'all' ? '' : c.key })}>{c.label}</Chip>
        ))}
      </div>

      {/* The mail. */}
      <div className="card mm-list">
        {list.isLoading && <div className="mm-pad"><Spinner label="Reading your mail…" /></div>}
        {list.isError && (
          <div className="mm-pad">
            <p>We couldn’t read this folder.</p>
            <div className="mm-section"><Button size="sm" onClick={() => void list.refetch()}>Try again</Button></div>
          </div>
        )}
        {!list.isLoading && !list.isError && items.length === 0 && (
          <div className="mm-empty">
            <div className="mm-glyph">✉</div>
            <p>{q ? 'Nothing matches that search' : folder === 'inbox' ? 'No medical emails yet' : `Nothing in ${FOLDERS.find((f) => f.key === folder)?.label}`}</p>
            {plain && <p className="mm-hint">Share your medical address with a doctor, lab or hospital — the first report they send lands here and files itself.</p>}
          </div>
        )}
        {items.map((m, i) => {
          const medical = m.classification === 'medical' || m.classification === 'likely-medical';
          return (
            <Link key={m.id} to={`/medical/mail/${m.id}`} className={`mm-row${i === 0 ? ' mm-row-first' : ''}${m.read ? '' : ' mm-new'}`}>
              <span className={`mm-dot${m.read ? '' : ' mm-unread'}`} aria-label={m.read ? undefined : 'Unread'} />
              <span className="mm-main">
                <span className="mm-top">
                  <span className="mm-from">{m.fromName}</span>
                  <span className="mm-when">{whenLabel(m.receivedAt)}</span>
                </span>
                <span className="mm-subject">{m.subject}</span>
                <span className="mm-snip">
                  {m.attachmentCount > 0 && <span title={`${m.attachmentCount} attachment${m.attachmentCount === 1 ? '' : 's'}`}>📎 {m.attachments.map((a) => a.filename).join(', ')} · </span>}
                  {m.snippet}
                </span>
              </span>
              <span className="mm-side">
                {m.starred && <span aria-label="Starred">★</span>}
                <span className={`mm-tag${medical ? '' : ' mm-unsure'}`}>
                  {medical ? categoryLabel(m.category) : m.classification === 'personal' ? 'Personal?' : 'Unsure'}
                </span>
              </span>
            </Link>
          );
        })}
        {list.hasNextPage && (
          <div className="mm-more">
            <Button size="sm" variant="line" onClick={() => void list.fetchNextPage()} state={list.isFetchingNextPage ? 'loading' : undefined} loadingLabel="Loading…">Load more</Button>
          </div>
        )}
      </div>
      {folder === 'trash' && items.length > 0 && (
        <p className="mm-trash-note">
          <Button size="sm" variant="ghost" onClick={() => emptyTrash.mutate()} state={emptyTrash.isPending ? 'loading' : undefined} loadingLabel="Emptying…">Empty trash</Button>
          <span className="muted">Documents already in Health Records stay there.</span>
        </p>
      )}

      {plain && h.recentDocuments.length > 0 && (
        <>
          <div className="mm-eyebrow mm-gap">Recent documents</div>
          <div className="card mm-list mm-section">
            {h.recentDocuments.map((d, i) => (
              <div key={d.id} className={`mm-row${i === 0 ? ' mm-row-first' : ''}`}>
                <span className="mm-glyph-sm">📄</span>
                <span className="mm-main">
                  <span className="mm-title">{d.filename}</span>
                  <span className="mm-sub">{d.fromName} · Received {whenLabel(d.receivedAt)}{d.documentType ? ` · ${recordKindLabel(d.documentType)}` : ''}</span>
                </span>
                <Link to={`/medical/mail/${d.emailId}`} className="mm-link-plain">Open email</Link>
                <Link to={`/medical/records?folder=${d.documentType ?? ''}`} className="mm-link-plain">In Health Records →</Link>
              </div>
            ))}
          </div>
        </>
      )}

      {plain && h.timeline.length > 0 && (
        <>
          <div className="mm-eyebrow mm-gap">Medical timeline</div>
          <div className="card mm-tl">
            {h.timeline.map((t) => (
              <div key={t.id} className="mm-tl-row">
                <span className="mm-tl-when">{whenLabel(t.at)}</span>
                <span className="mm-tl-what">
                  {t.emailId ? <Link to={`/medical/mail/${t.emailId}`}>{t.title}</Link> : t.title}
                  <span className="mm-tl-src">{t.source === 'medical-mail' ? 'Medical Mail' : 'Uploaded'}</span>
                </span>
              </div>
            ))}
            <p className="muted mm-tl-foot"><Link to="/medical/mail/timeline" className="mm-link">The whole timeline →</Link></p>
          </div>
        </>
      )}
    </div>
  );
}
