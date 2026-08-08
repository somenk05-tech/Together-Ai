import { useState } from 'react';
import {
  useAddCvEntry, useDeleteCvEntry, useEditCvEntry, useReorderCvEntries, useSetCvEntryHidden,
  type CvEntry, type CvEntryInput, type CvKind, type JobProfile,
} from '../api';
import { EntryEditor } from './EntryEditor';
import { KIND_ONE, sectionLabel, webUrl } from '../cv-labels';

/**
 * THE PROFESSIONAL PROFILE — a citizen's record, set as the page it is.
 *
 * A dark column carrying the person: their photograph, their name large and
 * tight, the title they work under, and the three things somebody reading a CV
 * looks for before they read a word of it — how to reach them, what they speak,
 * and when they could start. Then a white column carrying the work, under ruled
 * heads, two columns to an entry: the title, the dates and the organisation on
 * the left, the prose on the right. That is how a printed CV is set, and it is
 * why the eye can find a date without reading a paragraph.
 *
 * THE DARK COLUMN IS A PANEL, NOT A GROUND. The ground is white at :root and
 * five hubs may re-point it; Jobs is not one of them. So the material is the
 * chat stage's, scoped under `.cv…` in relief.css, and the page around this
 * document — the breadcrumb, the rail, every other Jobs screen — stays white.
 * The argument is written out beside the rules.
 *
 * SECTION ORDER COMES FROM THE SERVER and is not second-guessed here. A record
 * with four projects and one internship leads with the projects; a filmmaker's
 * leads with credits. Rendering them in a fixed order would throw that away.
 * A section with nothing in it is not printed at all — an empty
 * "Certifications" heading is a profile telling a recruiter about an absence.
 */

const OFFERS: Record<string, string> = {
  actively: 'Actively looking', open: 'Open to offers',
  notLooking: 'Not looking right now', unsure: 'Undecided',
};
const STATUS: Record<string, string> = {
  employed: 'Employed', selfEmployed: 'Self-employed', freelancer: 'Freelancing',
  entrepreneur: 'Running a business', student: 'Studying', betweenRoles: 'Between roles',
  firstJob: 'Looking for a first job', retired: 'Retired', other: 'Something else',
};
const TYPES: Record<string, string> = {
  fullTime: 'Full time', partTime: 'Part time', contract: 'Contract',
  freelance: 'Freelance', consulting: 'Consulting', internship: 'Internship',
};
const MODES: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onSite: 'On site' };
const RELOCATE: Record<string, string> = { yes: 'Would relocate', no: 'Would not relocate', maybe: 'Might relocate' };

/** The dates exactly as they were written. "Mar 2019", "2019" and "Spring
 *  2019" are all real; none of them is a calendar date and none is made into
 *  one. Nothing at all is printed when nothing was said. */
function whenOf(e: CvEntry): string {
  const from = e.startText.trim();
  const to = e.current ? 'Present' : e.endText.trim();
  if (from && to) return `${from} — ${to}`;
  return from || to;
}

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

// ─────────────────────────── one entry ───────────────────────────
function Entry({ e, tools }: { e: CvEntry; tools?: React.ReactNode }) {
  const when = whenOf(e);
  const hasAbove = !!e.description || e.bullets.length > 0;
  const href = e.url ? webUrl(e.url) : null;
  return (
    <article className="cventry" data-hidden={e.hidden ? 'true' : undefined}>
      <div className="cvaside">
        {e.hidden && <span className="cvoff">Not printed</span>}
        {e.title && <h3>{e.title}</h3>}
        {when && <p className="cvwhen">{when}</p>}
        {e.organisation && <p className="cvorg">{e.organisation}</p>}
        {(e.qualifier || e.location) && (
          <p className="cvat">{[e.qualifier, e.location].filter(Boolean).join(' · ')}</p>
        )}
      </div>
      <div className="cvbody">
        {e.description && <p className="cvprose">{e.description}</p>}
        {e.bullets.length > 0 && (
          <ul className="cvpoints">{e.bullets.map((b, i) => <li key={`${e.id}-b${i}`}>{b}</li>)}</ul>
        )}
        {e.url && (
          <p className="cvlink" style={{ margin: hasAbove ? '10px 0 0' : 0 }}>
            {/* The text is always what they wrote; only a real web address
                becomes clickable. See webUrl. */}
            {href
              ? <a href={href} target="_blank" rel="noreferrer">{e.url}</a>
              : <span>{e.url}</span>}
          </p>
        )}
        {e.tags.length > 0 && (
          <div className="cvmarks">{e.tags.map((t) => <span key={`${e.id}-${t}`} className="cvmark">{t}</span>)}</div>
        )}
        {tools}
      </div>
    </article>
  );
}

// ─────────────────────────── the document ───────────────────────────
export interface ProfessionalProfileProps {
  p: JobProfile;
  /** The toolbar above the document — tabs, "Edit details", a re-upload. The
   *  page owns those; this owns the record. */
  toolbar?: React.ReactNode;
}

export function ProfessionalProfile({ p, toolbar }: ProfessionalProfileProps) {
  const [editing, setEditing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<CvKind | null>(null);
  /** "Add something else" — the editor opens with the kind still a question,
   *  because a patent, a residency or a film credit is not one of the seven
   *  buttons and should not need a migration to be written down. */
  const [addFree, setAddFree] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = useAddCvEntry();
  const edit = useEditCvEntry();
  const hide = useSetCvEntryHidden();
  const remove = useDeleteCvEntry();
  const reorder = useReorderCvEntries();
  const busy = add.isPending || edit.isPending || hide.isPending || remove.isPending || reorder.isPending;

  const failed = (e: unknown) => {
    const m = e as { response?: { data?: { message?: string | string[] } } };
    const raw = m?.response?.data?.message;
    setError(Array.isArray(raw) ? raw.join(', ') : raw ?? 'That change could not be saved.');
  };
  const done = () => { setError(null); setOpenId(null); setAddingTo(null); setAddFree(false); setConfirmId(null); };
  const openAdd = (kind: CvKind, free = false) => { setError(null); setOpenId(null); setAddingTo(kind); setAddFree(free); };
  const openEdit = (id: string) => { setError(null); setAddingTo(null); setAddFree(false); setOpenId(id); };

  const save = (input: CvEntryInput, id?: string) => {
    setError(null);
    if (id) edit.mutate({ id, input }, { onSuccess: done, onError: failed });
    else add.mutate(input, { onSuccess: done, onError: failed });
  };

  /** One section's running order, sent whole. Moving the third entry up is the
   *  same gesture as dragging it, and the server takes the ids in their new
   *  order for ONE kind — Experience must never renumber Education. */
  const move = (kind: CvKind, list: CvEntry[], from: number, by: -1 | 1) => {
    const to = from + by;
    if (to < 0 || to >= list.length) return;
    const ids = list.map((e) => e.id);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    setError(null);
    reorder.mutate({ kind, ids }, { onError: failed });
  };

  const entriesOf = (kind: string) => p.entries[kind] ?? [];
  const shown = (list: CvEntry[]) => (editing ? list : list.filter((e) => !e.hidden));

  const languages = shown(entriesOf('language'));
  /** Languages print in the dark column, where a reader looks for them. They
   *  keep their place in `sectionOrder` on the server — this is where the
   *  section is SET, not a decision to drop it.
   *
   *  Everything else prints in the white column, in the order the server gave,
   *  and a section with nothing visible in it does not print at all. */
  const sections = p.sectionOrder
    .filter((kind) => kind !== 'language')
    .map((kind) => ({ kind, list: shown(entriesOf(kind)) }))
    .filter(({ kind, list }) => list.length > 0 || (!addFree && addingTo === kind));
  const printed = new Set(sections.map((s) => s.kind));

  /** The entry open for editing, when it does not sit in a printed section —
   *  a language, or a kind whose only entry is hidden. It gets a slot of its
   *  own at the foot of the white column rather than an editor on the dark. */
  const strayOpen = openId && !sections.some((s) => s.list.some((e) => e.id === openId))
    ? [...languages, ...Object.values(p.entries).flat()].find((e) => e.id === openId) ?? null
    : null;
  const strayAdd = addingTo && (addFree || !printed.has(addingTo)) ? addingTo : null;

  const contact = [
    p.location ? { k: 'City', v: p.location } : null,
    ...p.links.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4).map((l) => ({ k: 'Link', v: l })),
  ].filter(Boolean) as { k: string; v: string }[];

  const availability = [
    p.openToOffers && OFFERS[p.openToOffers] ? { k: 'Right now', v: OFFERS[p.openToOffers] } : null,
    p.employmentStatus && STATUS[p.employmentStatus] ? { k: 'Currently', v: STATUS[p.employmentStatus] } : null,
    p.employmentTypes.length ? { k: 'Open to', v: p.employmentTypes.map((t) => TYPES[t] ?? t).join(', ') } : null,
    p.workModes.length ? { k: 'Would work', v: p.workModes.map((m) => MODES[m] ?? m).join(', ') } : null,
    p.relocate && RELOCATE[p.relocate] ? { k: 'Moving', v: RELOCATE[p.relocate] } : null,
    p.preferredPlaces.length ? { k: 'Places', v: p.preferredPlaces.join(', ') } : null,
    p.noticeDays != null ? { k: 'Notice', v: p.noticeDays === 0 ? 'Available immediately' : `${p.noticeDays} days` } : null,
  ].filter(Boolean) as { k: string; v: string }[];

  const entryTools = (kind: CvKind, list: CvEntry[], e: CvEntry, i: number) => {
    if (!editing) return null;
    if (confirmId === e.id) {
      return (
        <div className="cvtools">
          <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>
            Delete this for good? Hiding keeps it.
          </span>
          <button type="button" className="cvctl" disabled={busy}
            onClick={() => { setError(null); remove.mutate(e.id, { onSuccess: done, onError: failed }); }}>
            Yes, delete
          </button>
          <button type="button" className="cvctl" onClick={() => setConfirmId(null)}>Keep it</button>
        </div>
      );
    }
    return (
      <div className="cvtools">
        <button type="button" className="cvctl" onClick={() => openEdit(e.id)}>Edit</button>
        <button type="button" className="cvctl" disabled={busy}
          onClick={() => { setError(null); hide.mutate({ id: e.id, hidden: !e.hidden }, { onError: failed }); }}>
          {e.hidden ? 'Put it back' : 'Hide'}
        </button>
        <button type="button" className="cvctl" disabled={busy || i === 0}
          aria-label={`Move ${e.title || sectionLabel(kind)} up`} onClick={() => move(kind, list, i, -1)}>Up</button>
        <button type="button" className="cvctl" disabled={busy || i === list.length - 1}
          aria-label={`Move ${e.title || sectionLabel(kind)} down`} onClick={() => move(kind, list, i, 1)}>Down</button>
        <button type="button" className="cvctl" onClick={() => setConfirmId(e.id)}>Delete</button>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <button type="button" className="cvctl" aria-pressed={editing}
          onClick={() => { setEditing((v) => !v); done(); }}>
          {editing ? 'Done editing' : 'Edit my record'}
        </button>
        {toolbar}
        {editing && (
          <span className="muted" style={{ fontSize: 12.5 }}>
            Every change saves as you make it.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" style={{ color: 'var(--danger-ink)', fontSize: 13, margin: '0 0 12px' }}>{error}</p>
      )}

      <div className="cvdoc">
        <aside className="cvside">
          <div className="cvid">
            {p.photoUrl
              ? <img className="cvportrait" src={p.photoUrl} alt={p.fullName ? `${p.fullName}` : 'Your profile photograph'} />
              : <div className="cvnoface" aria-hidden>{initialsOf(p.fullName || p.headline) || '—'}</div>}
            <div style={{ minWidth: 0 }}>
              {/* A NAME, OR THE QUESTION. An empty name used to be filled with
                  the headline, and the headline is whatever the CV's first line
                  said — which is how a profile came to announce itself as
                  "APPLICATION LETTER Applicant:". */}
              <h2 className="cvname">{p.fullName || 'Your name'}</h2>
              {(p.currentTitle || p.headline) && (
                <p className="cvrole">{p.currentTitle || p.headline}</p>
              )}
            </div>
          </div>

          <div className="cvmeta">
            {contact.length > 0 && (
              <div className="cvruled">
                <h3>Contact</h3>
                <ul className="cvlines">
                  {contact.map((c, i) => (
                    <li key={`c${i}`}><b>{c.k}</b><span>{c.v}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {/* SKILLS PRINT, because a CV that does not list them is not a CV.
                They already existed on the profile and the completion score
                already graded somebody on having eight of them; the document
                simply never showed one, so the sidebar sat half empty next to
                a "still to add: eight skills" note about skills the reader
                could not see. They live on the dark column with the languages
                for the same reason: a reader scans for them, they are not read
                in sequence. */}
            {p.skills.length > 0 && (
              <div className="cvruled">
                <h3>Skills</h3>
                <div className="cvskills">
                  {p.skills.map((s) => <span key={s.key}>{s.label}</span>)}
                </div>
              </div>
            )}

            {(languages.length > 0 || editing) && (
              <div className="cvruled">
                <h3>Languages</h3>
                {languages.length === 0
                  ? <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Nothing here yet.</p>
                  : (
                    <ul className="cvlines">
                      {languages.map((e, i) => (
                        <li key={e.id}>
                          <b>{e.hidden ? 'Not printed' : (e.qualifier || 'Speaks')}</b>
                          <span>{e.title || e.organisation}</span>
                          {entryTools('language', languages, e, i)}
                        </li>
                      ))}
                    </ul>
                  )}
                {editing && addingTo !== 'language' && (
                  <div className="cvtools">
                    <button type="button" className="cvctl" onClick={() => openAdd('language')}>
                      Add a language
                    </button>
                  </div>
                )}
              </div>
            )}

            {availability.length > 0 && (
              <div className="cvruled">
                <h3>Availability</h3>
                <ul className="cvlines">
                  {availability.map((a, i) => (
                    <li key={`a${i}`}><b>{a.k}</b><span>{a.v}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>

        <div className="cvmain">
          {p.summary && (
            <section className="cvsec">
              <h2>Profile</h2>
              <div className="cventry">
                <div className="cvaside" />
                <div className="cvbody"><p className="cvprose">{p.summary}</p></div>
              </div>
            </section>
          )}

          {sections.map(({ kind, list }) => (
            <section className="cvsec" key={kind}>
              <h2>{sectionLabel(kind)}</h2>
              {list.map((e, i) => (
                openId === e.id
                  ? <EntryEditor key={e.id} entry={e} kind={kind} busy={busy} error={null}
                      onSave={(input) => save(input, e.id)} onCancel={done} />
                  : <Entry key={e.id} e={e} tools={entryTools(kind, list, e, i)} />
              ))}
              {!addFree && addingTo === kind && (
                <EntryEditor kind={kind} busy={busy} error={null}
                  onSave={(input) => save(input)} onCancel={done} />
              )}
              {editing && addingTo !== kind && (
                <div className="cvtools">
                  <button type="button" className="cvctl" onClick={() => openAdd(kind)}>
                    Add {(KIND_ONE[kind] ?? sectionLabel(kind)).toLowerCase()}
                  </button>
                </div>
              )}
            </section>
          ))}

          {strayOpen && (
            <EntryEditor entry={strayOpen} kind={strayOpen.kind} busy={busy} error={null}
              onSave={(input) => save(input, strayOpen.id)} onCancel={done} />
          )}
          {strayAdd && (
            <EntryEditor kind={strayAdd} chooseKind={addFree} busy={busy} error={null}
              onSave={(input) => save(input)} onCancel={done} />
          )}

          {editing && !addingTo && (
            <div className="cvtools" style={{ marginTop: 22 }}>
              <button type="button" className="cvctl" onClick={() => openAdd('experience', true)}>
                Add something else
              </button>
            </div>
          )}

          {sections.length === 0 && !p.summary && !editing && (
            <section className="cvsec">
              <h2>Your record</h2>
              <div className="cventry">
                <div className="cvaside" />
                <div className="cvbody">
                  <p className="cvprose">
                    Nothing has been added yet. Upload a CV and we will read it into this page,
                    or press <strong>Edit my record</strong> and write the first entry yourself.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
