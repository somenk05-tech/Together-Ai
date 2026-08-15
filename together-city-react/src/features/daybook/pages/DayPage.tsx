import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { Fold, Spinner } from '@/components/ui';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { MiraDay } from '@/features/daybook/MiraDay';
import { uploadErrorMessage } from '@/api/media.api';
import {
  useDay, useSaveDay, useAddDayItem, usePatchDayItem, useRemoveDayItem,
  useAddDayPhoto, useRemoveDayPhoto,
  type DayItemKind, type Reflection, type ReflectionKey,
} from '@/api/daybook.api';

/**
 * ONE DAY, AS THE PERSON WHO LIVED IT KEEPS IT.
 *
 * The Master Calendar was a grid with nothing behind it — `activities` was a
 * hardcoded empty array waiting for hub bookings that never arrived. The
 * owner's answer (15 Aug) was not to go and fetch the bookings: it was that a
 * calendar tells you what is scheduled, and what people actually want is a
 * record of the day. So the grid became the map, and this is the place.
 *
 * SIX LAYERS, IN THE ORDER A DAY IS ACTUALLY LIVED: how it feels, what is on
 * it, what you want to remember of it, what you make of it looking back, what
 * you write about it, and — quietly at the end — Mira, who can read this one
 * day back to you.
 *
 * THE LOOKING-BACK SHEET is the owner's reference (15 Aug), a printed
 * self-reflection page: what went well, what you are proud of, three things
 * you are grateful for, what was difficult, what it taught you, the win, the
 * challenge, tomorrow's focus. Its prompts are the product's words, which is
 * the one thing this page has refused from the start — so they are QUESTIONS
 * and never suggestions, every box is optional, and nothing is counted,
 * scored, chained or compared with yesterday. A sheet you can leave blank is a
 * sheet you can be honest on.
 *
 * THE PICTURES ARE THE ONE THING HERE THAT LEAVES THE DEVICE AS A FILE, and
 * they go to the private vault, never the public bucket: signed links that
 * expire, no permanent address, the coordinates taken out of the bytes before
 * they leave. A photograph in somebody's diary is the most private image in
 * this application and the storage has to say so, not the copy.
 *
 * WHAT THIS PAGE REFUSES TO DO. It does not score the day. No "2 of 5 done",
 * no streak, no empty-state cheerleading, no prompt written by the product
 * pretending to be a thought. A diary that grades you is a diary you stop
 * telling the truth in, and every one of those would have been easy to add.
 */

const MOODS = ['happy', 'calm', 'energised', 'okay', 'low', 'frustrated', 'loved', 'tired', 'inspired'];

const KINDS: Array<{ id: DayItemKind; label: string }> = [
  { id: 'task', label: 'To do' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'reminder', label: 'Reminder' },
  { id: 'appointment', label: 'Appointment' },
];

/** "Saturday, 15 August 2026" — from the date STRING, never from a parsed
 *  instant: `new Date('2026-08-15')` is midnight UTC, which is the 14th for
 *  anybody west of Greenwich, and a diary that renames your day is broken in
 *  the one way a diary may not be. */
function longDate(date: string): { weekday: string; rest: string } {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, (m ?? 1) - 1, d ?? 1);
  return {
    weekday: at.toLocaleDateString(undefined, { weekday: 'long' }),
    rest: at.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

function shift(date: string, by: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, (m ?? 1) - 1, (d ?? 1) + by);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
}

/** The clock, as HH:MM in the citizen's own zone. The line box opens on the
 *  time it is — the owner, 15 Aug: "the time should start from live time". An
 *  empty time field is where the half-written-time problem came from, and a
 *  field that opens already filled cannot be half-written. */
function nowHHMM(): string {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
}

/**
 * ONE BOX ON THE LOOKING-BACK SHEET: a question, and room to answer it.
 *
 * DECLARED OUT HERE, not inside DayPage, and that is not tidiness. A component
 * defined inside a render function is a NEW TYPE on every render, so React
 * unmounts and remounts it — which for a box somebody is typing into means the
 * caret jumps to the end of their sentence every time anything else on the page
 * re-renders.
 *
 * IT IS CONTROLLED BY THE SHEET NOW, not by its own state. The sheet has one
 * Save button (owner, 15 Aug) rather than eleven silent saves on blur, so the
 * answers have to live where the button can see them.
 */
function AskBox({ label, value, rows, onChange }: {
  label: string; value: string; rows: number; onChange: (text: string) => void;
}) {
  return (
    <label className="dayb-box">
      <span className="dayb-lab">{label}</span>
      <textarea className="dayb-ans" rows={rows} value={value}
        onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/**
 * A SECTION OF THE DAY, WITH A LID — AND IT IS THE CITY'S FOLD, NOT A NEW ONE.
 *
 * "All the other tabs need to have a save button, and once saved it gets
 * collapsed" — the owner, 15 Aug, and the reason he is right is that every
 * field on this page saved silently when you clicked away. Silent is invisible,
 * and a page that never says "kept" is a page you cannot trust with a diary.
 * The fix is not a toast that fades: it is the section closing, which is what a
 * notebook does when you have finished with a page.
 *
 * THE FIRST VERSION OF THIS WROTE ITS OWN DISCLOSURE — face, panel, state,
 * `aria-expanded` — and `a-read-section-folds-itself.test.ts` refused it, which
 * is the entire reason that test exists: a second implementation of a fold is
 * how one of them quietly stops announcing itself to a screen reader. So `Fold`
 * learned two things instead (a caller-held open state, and a control beside
 * the face), and the city still has exactly one disclosure in it.
 *
 * Nothing is destroyed by closing, and nothing waits for the button: moods,
 * lines and pictures write themselves the moment they are touched, because
 * those are ACTIONS. The button is for the boxes somebody types into.
 */
function Sec({ id, title, summary, open, onToggle, action, children }: {
  id: string; title: string; summary?: string; open: boolean; onToggle: () => void;
  action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="card rise dayb-sec" data-sec={id}>
      <Fold title={title} meta={!open && summary ? summary : undefined}
        open={open} onOpenChange={onToggle} action={action}
        face="dayb-lid" panel="dayb-panel">
        {children}
      </Fold>
    </section>
  );
}

export function DayPage() {
  const { date = '' } = useParams();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const day = useDay(valid ? date : '1970-01-01');
  const save = useSaveDay(date);
  const add = useAddDayItem(date);
  const patch = usePatchDayItem(date);
  const remove = useRemoveDayItem(date);
  const addPhoto = useAddDayPhoto(date);
  const dropPhoto = useRemoveDayPhoto(date);

  const [feelNote, setFeelNote] = useState('');
  const [journal, setJournal] = useState('');
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<DayItemKind>('task');
  /* THE TIME BOX OPENS ON THE TIME IT IS (owner, 15 Aug). An empty time field
     is where the half-written-time problem came from in the first place, and a
     field that starts filled cannot be half-written. It is still optional —
     clearing it adds the line without an hour, which most lines want. */
  const [at, setAt] = useState(nowHHMM);
  const [askMira, setAskMira] = useState(false);
  const [timeErr, setTimeErr] = useState('');
  const [photoErr, setPhotoErr] = useState('');
  const timeRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /* Which sections are open. Everything opens open; Save shuts the one it is
     in; the header opens it again. Not persisted — a lid is about this visit. */
  const [open, setOpen] = useState<Record<string, boolean>>({
    feel: true, todo: true, keep: true, look: true, write: true,
  });
  const lid = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const shut = (k: string) => setOpen((o) => ({ ...o, [k]: false }));

  /* THE SERVER'S COPY IS THE TRUTH, AND IT ARRIVES AFTER THE FIRST PAINT. The
     typed fields hold local state — seeded once the day lands, and never
     re-seeded under somebody mid-sentence. */
  const [sheet, setSheet] = useState<Reflection>({});
  const loaded = day.data?.date;
  useEffect(() => {
    if (!loaded) return;
    setFeelNote(day.data?.feelNote ?? '');
    setJournal(day.data?.journal ?? '');
    setSheet(day.data?.reflection ?? {});
  }, [loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const { weekday, rest } = useMemo(() => longDate(valid ? date : '1970-01-01'), [date, valid]);
  const items = day.data?.items ?? [];
  const photos = day.data?.photos ?? [];
  const look = day.data?.reflection ?? {};

  /** A box on the looking-back sheet, wired to its one key in the local sheet.
   *  Nothing is written until Save. */
  const ask = (k: ReflectionKey, label: string, rows = 3) => (
    <AskBox key={k} label={label} rows={rows} value={String(sheet[k] ?? '')}
      onChange={(text) => setSheet((s) => ({ ...s, [k]: text }))} />
  );

  /**
   * SAVE THE SHEET — AND ONLY WHAT CHANGED ON IT.
   *
   * The server merges the keys it is given, so sending all eleven would
   * overwrite a box filled in another tab five minutes ago with the blank this
   * screen happens to be holding. Diffing against the day's own copy means the
   * button writes what this person just wrote and nothing else.
   */
  const saveSheet = () => {
    const patchSheet: Record<string, string> = {};
    for (const k of Object.keys(sheet) as ReflectionKey[]) {
      if (k === 'feeling') continue; // a tap, saved when it is tapped
      const was = String(look[k] ?? '');
      const now = String(sheet[k] ?? '');
      if (now !== was) patchSheet[k] = now;
    }
    if (Object.keys(patchSheet).length) save.mutate({ reflection: patchSheet });
    shut('look');
  };

  /** The one-line summary a shut section shows. Facts about what is inside —
   *  never a mark, never a fraction of a target, never a comparison. */
  const answered = (Object.keys(look) as ReflectionKey[])
    .filter((k) => k !== 'feeling' && String(look[k] ?? '').trim()).length;
  const words = journal.trim() ? journal.trim().split(/\s+/).length : 0;

  /**
   * KEEP A PICTURE. One at a time through the mutation, so a failure names the
   * file it happened to rather than failing the whole selection silently.
   */
  const keep = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoErr('');
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) { setPhotoErr(`${file.name} is not a picture.`); continue; }
      try {
        await addPhoto.mutateAsync(file);
      } catch (e) {
        setPhotoErr(uploadErrorMessage(e));
        break;
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  if (!valid) {
    return (
      <div className="page">
        <p className="muted">That is not a day. <Link to="/calendar">Back to the calendar</Link>.</p>
      </div>
    );
  }

  return (
    <div className="page daybook">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <Link to="/calendar" className="btn btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 44 }}>
            <Icon name="back" size={15} /> Back to the calendar
          </Link>
          <div className="eyebrow">{weekday}</div>
          <h1 className="dayb-date">{rest}</h1>
        </div>
      </div>

      {day.isLoading ? <Spinner label="Opening the day…" /> : day.isError ? (
        /* WHAT A FAILED REQUEST WOULD OTHERWISE HAVE SAID. With no branch here,
           `day.data` is undefined and every `?? []` below reads as an answer:
           no mood, no lines, an empty page — the city quietly telling somebody
           that a day they lived and wrote is blank. That is the one sentence a
           diary may not say by accident, so the page says the opposite, out
           loud, and offers the only useful action. */
        <section className="card rise dayb-sec">
          <h2 className="dayb-h">We couldn&rsquo;t open this day</h2>
          <p className="muted">
            Nothing has been lost — whatever you kept here is still kept. We just couldn&rsquo;t reach it
            just now.
          </p>
          <button type="button" className="btn btn-sm" onClick={() => void day.refetch()}>
            Try again
          </button>
        </section>
      ) : (
        <>
          {/* ── 01 · FEEL ────────────────────────────────────────────────── */}
          <Sec id="feel" title="How did today feel?" open={open.feel} onToggle={() => lid('feel')}
            summary={[day.data?.mood, look.feeling ? `${look.feeling} out of 10` : null].filter(Boolean).join(' · ')}
            action={(
              <button type="button" className="btn btn-sm" onClick={() => {
                if (feelNote !== (day.data?.feelNote ?? '')) save.mutate({ feelNote });
                shut('feel');
              }}>Save</button>
            )}>
            <div className="dayb-moods" role="group" aria-label="How today felt">
              {MOODS.map((m) => (
                <button key={m} type="button"
                  className={day.data?.mood === m ? 'cstab on' : 'cstab'}
                  aria-pressed={day.data?.mood === m}
                  onClick={() => save.mutate({ mood: day.data?.mood === m ? '' : m })}>
                  {m}
                </button>
              ))}
            </div>
            {/* THE 1–10, FROM THE REFERENCE'S TOP ROW — and it belongs HERE,
                beside the mood words, rather than on the looking-back sheet
                where the sheet prints it. Both are the same question, and a
                page that asks how the day felt twice, four sections apart,
                gets two different answers from the same person.

                IT IS A FEELING, NOT A MARK. Nothing computes it, nothing
                averages it across days, nothing draws a line through it, and
                Mira is told in as many words that it is not a score. Tapping
                the number again takes it back — a day you cannot un-rate is a
                day you rate carefully, which is the opposite of a diary. */}
            <span className="dayb-lab dayb-scale-lab">How am I feeling today?</span>
            <div className="dayb-scale" role="group" aria-label="How I am feeling today, one to ten">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n} type="button"
                  className={look.feeling === n ? 'dayb-dot on' : 'dayb-dot'}
                  aria-pressed={look.feeling === n}
                  aria-label={`${n} out of 10`}
                  onClick={() => save.mutate({ reflection: { feeling: look.feeling === n ? null : n } })}>
                  <span aria-hidden>{n}</span>
                </button>
              ))}
            </div>

            <label className="dayb-label" htmlFor="dayb-feel">What&rsquo;s behind it?</label>
            <textarea id="dayb-feel" className="dayb-note" rows={2} value={feelNote}
              onChange={(e) => setFeelNote(e.target.value)}
              placeholder="Optional — a line, if there is one." />
          </Sec>

          {/* ── 02 · DO ──────────────────────────────────────────────────── */}
          <Sec id="todo" title="On this day" open={open.todo} onToggle={() => lid('todo')}
            summary={items.length ? `${items.length} line${items.length === 1 ? '' : 's'}` : undefined}
            action={(
              /* SAVE HERE MEANS "PUT THE LINE I HAVE TYPED ON THE DAY, THEN
                 CLOSE". The ticks and the removals write themselves the moment
                 they happen — they are actions, and a tick that waited for a
                 button would be a tick you could lose. What can be pending in
                 this section is the half-typed line in the box, so that is
                 what the button commits. */
              <button type="button" className="btn btn-sm" onClick={() => {
                const clean = title.trim();
                if (clean) {
                  add.mutate({ kind, title: clean, at: at || null });
                  setTitle(''); setAt(nowHHMM());
                }
                setTimeErr(''); shut('todo');
              }}>Save</button>
            )}>
            {items.length === 0 && <p className="muted dayb-empty">Nothing down yet.</p>}
            <ul className="dayb-items">
              {items.map((it) => (
                <li key={it.id} className={it.done ? 'dayb-item is-done' : 'dayb-item'}>
                  <button type="button" className="dayb-tick"
                    aria-label={it.done ? `Mark "${it.title}" as not done` : `Mark "${it.title}" as done`}
                    aria-pressed={it.done}
                    onClick={() => patch.mutate({ id: it.id, done: !it.done })}>
                    {it.done ? '●' : '○'}
                  </button>
                  <span className="dayb-when">{it.at ?? ''}</span>
                  <span className="dayb-what">
                    <span className="dayb-kind">{KINDS.find((k) => k.id === it.kind)?.label ?? it.kind}</span>
                    {it.title}
                  </span>
                  <button type="button" className="dayb-drop" aria-label={`Remove "${it.title}"`}
                    onClick={() => remove.mutate({ id: it.id })}>
                    <Icon name="close" size={14} />
                  </button>
                </li>
              ))}
            </ul>

            {/* THE TIME IS OPTIONAL, AND THE BROWSER HAD NOT BEEN TOLD.
                A half-typed time field — :30 with no hour, which is what you
                get by tabbing in and typing the minutes first — is `badInput`:
                its value is empty and native validation refuses to submit the
                form, so Safari answered "Add" with a red "Invalid value"
                bubble and the line was never added. The field was never
                required; the browser was enforcing a rule nobody wrote.

                `noValidate` hands the decision back to us, and we make it out
                loud: a finished time is used, no time at all is used (most of
                what people mean to do has no hour), and a HALF-WRITTEN time
                stops and says so rather than being quietly dropped — because
                somebody who typed 30 meant something by it. */}
            <form className="dayb-add" noValidate onSubmit={(e) => {
              e.preventDefault();
              const clean = title.trim();
              if (!clean) return;
              if (timeRef.current?.validity.badInput) {
                setTimeErr('That time is half-written — finish it, or clear it and add this without one.');
                timeRef.current.focus();
                return;
              }
              setTimeErr('');
              add.mutate({ kind, title: clean, at: at || null });
              setTitle(''); setAt(nowHHMM());
            }}>
              <select aria-label="What kind" value={kind} onChange={(e) => setKind(e.target.value as DayItemKind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <input aria-label="What is it" value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder="Add something to this day…" maxLength={300} />
              <input ref={timeRef} aria-label="At what time (optional)" type="time" value={at}
                onChange={(e) => { setAt(e.target.value); if (timeErr) setTimeErr(''); }} />
              <button type="submit" className="btn btn-sm" disabled={!title.trim() || add.isPending}>Add</button>
            </form>
            {timeErr && <p className="dayb-say" role="alert">{timeErr}</p>}
            {/* AND IF THE WRITE ITSELF FAILS, THE PAGE SAYS SO. A line typed,
                a button pressed and nothing appearing is indistinguishable
                from a broken product — which is exactly what it looked like
                from the outside when the time field was refusing the submit. */}
            {add.isError && (
              <p className="dayb-say" role="alert">
                That line didn&rsquo;t reach your day — nothing was saved. Try again in a moment.
              </p>
            )}
          </Sec>

          {/* ── 03 · REMEMBER ────────────────────────────────────────────── */}
          <Sec id="keep" title="Something to remember" open={open.keep} onToggle={() => lid('keep')}
            summary={photos.length ? `${photos.length} picture${photos.length === 1 ? '' : 's'}` : undefined}
            action={<button type="button" className="btn btn-sm" onClick={() => shut('keep')}>Done</button>}>
            {photos.length > 0 && (
              <ul className="dayb-pics">
                {photos.map((p) => (
                  <li key={p.id} className="dayb-pic">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noreferrer">
                        <img src={p.url} alt={`A picture kept on ${rest}`} loading="lazy" />
                      </a>
                    ) : (
                      // Not a broken frame: a picture that is there and cannot
                      // be shown right now is a different fact from no picture.
                      <span className="dayb-pic-away muted">Kept — can&rsquo;t be shown just now</span>
                    )}
                    <button type="button" className="dayb-drop" aria-label="Remove this picture"
                      onClick={() => dropPhoto.mutate({ id: p.id })}>
                      <Icon name="close" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className="btn btn-sm dayb-keep">
              {/* The formats the vault actually stores, named rather than
                  `image/*`. Two reasons, and the second is the real one: the
                  server refuses anything else anyway, so the picker should not
                  offer it — and `image/*` puts the characters that open a
                  comment inside a string, which every guard in this repo that
                  strips comments before reading source would swallow the rest
                  of the file on. */}
              <input ref={fileRef} type="file" multiple
                accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
                onChange={(e) => void keep(e.target.files)} />
              {addPhoto.isPending ? 'Keeping…' : 'Keep a picture'}
            </label>
            <p className="dayb-foot">
              Private — only you. Where a photo was taken is removed before it leaves this device.
            </p>
            {photoErr && <p className="dayb-say" role="alert">{photoErr}</p>}
          </Sec>

          {/* ── 04 · LOOK BACK ───────────────────────────────────────────── */}
          <Sec id="look" title="Looking back on today" open={open.look} onToggle={() => lid('look')}
            summary={answered ? `${answered} answered` : undefined}
            action={<button type="button" className="btn btn-sm" onClick={saveSheet}>Save</button>}>
            <div className="dayb-sheet">

            {ask('wentWell', 'What went well today?', 4)}
            <div className="dayb-two">
              {ask('proudOf', 'Something I’m proud of', 4)}
              <div className="dayb-box">
                <span className="dayb-lab">Three things I am grateful for</span>
                <ol className="dayb-grat">
                  <li><span aria-hidden>(01)</span>{ask('grateful1', 'First thing I am grateful for', 1)}</li>
                  <li><span aria-hidden>(02)</span>{ask('grateful2', 'Second thing I am grateful for', 1)}</li>
                  <li><span aria-hidden>(03)</span>{ask('grateful3', 'Third thing I am grateful for', 1)}</li>
                </ol>
              </div>
            </div>

            {/* The reference puts MINDSET RESET in a ring at the centre of the
                lower six boxes — the hinge the sheet turns on: what went wrong
                on the left of it, what you carry forward on the right. It is a
                label rather than a control, so it is `aria-hidden` and every
                box beside it still carries its own question. */}
            <div className="dayb-six">
              {ask('difficult', 'What was difficult or didn’t go as planned?')}
              {ask('win', 'Win of today')}
              {ask('challenge', 'Challenge')}
              {ask('learned', 'What can I learn from it?')}
              {ask('tomorrow', 'Tomorrow’s focus')}
              <span className="dayb-reset" aria-hidden>Mindset<br />reset</span>
            </div>
            </div>
          </Sec>

          {/* ── 05 · WRITE ───────────────────────────────────────────────── */}
          <Sec id="write" title="Write about today" open={open.write} onToggle={() => lid('write')}
            summary={words ? `${words} word${words === 1 ? '' : 's'}` : undefined}
            action={(
              <button type="button" className="btn btn-sm" onClick={() => {
                if (journal !== (day.data?.journal ?? '')) save.mutate({ journal });
                shut('write');
              }}>Save</button>
            )}>
            <textarea className="dayb-journal" rows={10} value={journal}
              aria-label="Write about today"
              onChange={(e) => setJournal(e.target.value)}
              placeholder="What do you want to remember about today?" />
            <p className="dayb-foot">
              {words ? `${words} word${words === 1 ? '' : 's'} · ` : ''}
              Private — only you. {save.isPending ? 'Saving…' : 'Save keeps it and closes the page.'}
            </p>
          </Sec>

          {/* ── 06 · MIRA ────────────────────────────────────────────────── */}
          <section className="dayb-mira">
            <button type="button" className="mira-door" onClick={() => setAskMira(true)}
              aria-label="Ask Mira about this day" title="Mira can read this day back to you">
              <MiraMark size={48} state="waiting" />
            </button>
            <span className="muted">Ask Mira about this day</span>
          </section>
          {askMira && <MiraDay date={date} onClose={() => setAskMira(false)} />}

          <nav className="dayb-nav" aria-label="Other days">
            <Link to={`/daybook/${shift(date, -1)}`}>← The day before</Link>
            <Link to={`/daybook/${shift(date, 1)}`}>The day after →</Link>
          </nav>
        </>
      )}
    </div>
  );
}
