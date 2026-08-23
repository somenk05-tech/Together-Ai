import { Link } from 'react-router-dom';
import { useState, type ReactNode } from 'react';

/**
 * The page the letter is printed on.
 *
 * IT WAS A CARD ON THE ROOM'S GROUND. The astrology hub is near-black, and the
 * letter sat in it as a raised charcoal panel with a drop cap — which read, the
 * owner said, as a long article inside a dashboard. It is a PAGE now: its own
 * paper, its own ink, its own measure, and no container. The room around it is
 * unchanged; the sidebar is untouched, deliberately and by instruction.
 *
 * `label` is where you are — TODAY, AUGUST 2026 — set small and quiet, because
 * the sidebar has already said it once and a second shout is a heading. `title`
 * is what the letter is ABOUT, which is the only thing on the page allowed to
 * be large. It is optional: letters written before titles existed are still in
 * the archive, and the composition simply closes up around a missing one.
 */
export function LetterSky({ label, title, children }: { label?: string; title?: string; children: ReactNode }) {
  return (
    <section className="letter-page">
      <div className="letter-inner">
        {label && <p className="letter-label">{label}</p>}
        {title && <h1 className="letter-title">{title}</h1>}
        {children}
      </div>
    </section>
  );
}

/**
 * One letter.
 *
 * Paragraphs come from the server already split, and are rendered as they
 * arrive. Nothing here reformats them, adds a heading or inserts a divider —
 * the point of the whole exercise is that the writing is the only thing with a
 * say in how it reads.
 */
export function LetterBody({ salutation, body, signOff }: { salutation: string; body: string; signOff: string }) {
  const paragraphs = body.split('\n\n').map((p) => p.trim()).filter(Boolean);
  return (
    <>
      <p className="letter-open">{salutation}</p>
      {paragraphs.map((p, i) => <p key={i} className="letter-p">{p}</p>)}
      {/* "With care," and nothing under it. The company does not sign its own
          letters — see SIGN_OFF in the backend for why. */}
      <p className="letter-sign">{signOff}</p>
    </>
  );
}

/**
 * Every letter before this one — as a list of DATES, not a stack of letters.
 *
 * What was here before was a card-shaped toggle that unrolled seven whole
 * letters underneath today's. That is a scroll with nothing to aim at: nobody
 * remembers a scroll position, they remember a Tuesday. So the foot of the
 * page is the dates, and choosing one prints that letter in the composition
 * above — same paper, same measure, same type, same title treatment. A letter
 * you kept is not displayed differently from the letter that arrived this
 * morning; it is the same object, on a different date.
 *
 * ONE COMPONENT FOR BOTH LETTERS, and the pages hand it rows rather than
 * letters. The daily writes out "Monday, 10 August" from an ISO day; the
 * monthly prints the `month` string the server wrote at the time. Formatting a
 * month from a key in whatever timezone the browser happens to be in is how
 * you end up showing somebody a letter labelled with the wrong month, so the
 * conversion stays where the knowledge is and this component only lays out.
 *
 * It renders nothing at all when there is nothing behind you. A heading called
 * "Earlier letters" over an empty rule, on your first day, is the interface
 * pointing at an absence.
 */
export interface ArchiveRow {
  /** The period key — 2026-08-10 for a day, 2026-08 for a month. Also the id. */
  date: string;
  /** What the row says. "Monday, 10 August" · "July 2026". */
  label: string;
  /** Letters written before titles existed have none, and the row says the
   *  date and stops rather than inventing one. */
  title?: string;
}

/** "Monday, 10 August" → "10 August" — the piece a range is written from. */
const dayPart = (label: string) => (label.includes(', ') ? label.slice(label.indexOf(', ') + 2) : label);

/** "3 August – 10 August" folds to "3 – 10 August" when the month is shared. */
function spanLabel(older: string, newer: string): string {
  const [a, b] = [dayPart(older), dayPart(newer)];
  const [aDay, ...aRest] = a.split(' ');
  const [bDay, ...bRest] = b.split(' ');
  if (aRest.join(' ') === bRest.join(' ')) return `${aDay} – ${bDay} ${aRest.join(' ')}`;
  return `${a} – ${b}`;
}

/** A titled row, or a RUN of consecutive untitled ones folded into one line. */
type ArchiveEntry = { kind: 'day'; row: ArchiveRow } | { kind: 'quiet'; rows: ArchiveRow[] };

export function LetterArchive(
  { rows, current, onPick }: { rows: ArchiveRow[]; current: string | null; onPick: (date: string) => void },
) {
  /* QUIET DAYS FOLD (23 Aug, evening). Letters written before titles existed
     rendered as bare full-width date rows — on the walked site, eight of them
     in a run, each drawing a rule and saying nothing. A list where half the
     rows are blank reads as a list that is broken, not a list that is quiet.
     So consecutive untitled rows fold into one muted line naming the span,
     and open on request: every letter stays exactly one click further than it
     was, and none is hidden. A run of one is not a run; it renders as itself.
     Hooks stay above the early return — rows.length can change between
     renders, and a conditional hook is the one thing React never forgives. */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  if (rows.length === 0) return null;
  const entries: ArchiveEntry[] = [];
  for (const r of rows) {
    const last = entries[entries.length - 1];
    if (!r.title && last?.kind === 'quiet') { last.rows.push(r); continue; }
    if (!r.title) { entries.push({ kind: 'quiet', rows: [r] }); continue; }
    entries.push({ kind: 'day', row: r });
  }
  const dayButton = (r: ArchiveRow) => (
    <button
      type="button"
      className="letter-archive-day"
      aria-current={r.date === current ? 'true' : undefined}
      onClick={() => onPick(r.date)}
    >
      <span className="d">{r.label}</span>
      {r.title && <span className="t">{r.title}</span>}
    </button>
  );
  return (
    <nav className="letter-archive" aria-label="Earlier letters">
      <h2 className="letter-archive-head">Earlier letters</h2>
      <ul>
        {entries.map((e) => {
          if (e.kind === 'day' || e.rows.length === 1) {
            const r = e.kind === 'day' ? e.row : e.rows[0];
            return <li key={r.date}>{dayButton(r)}</li>;
          }
          const newest = e.rows[0]; const oldest = e.rows[e.rows.length - 1];
          const key = `${oldest.date}..${newest.date}`;
          const open = Boolean(opened[key]) || e.rows.some((r) => r.date === current);
          return (
            <li key={key}>
              {open ? (
                e.rows.map((r) => <span key={r.date} style={{ display: 'block' }}>{dayButton(r)}</span>)
              ) : (
                <button
                  type="button"
                  className="letter-archive-day letter-archive-quiet"
                  aria-expanded={false}
                  onClick={() => setOpened((o) => ({ ...o, [key]: true }))}
                >
                  <span className="d">{spanLabel(oldest.label, newest.label)}</span>
                  <span className="t">{e.rows.length} quiet letters — open the days</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The way back, INSIDE the letter rather than in a bar above it.
 *
 * You are reading a letter from a past date; the thing you want next is the
 * current one, and it belongs at the end of the one you just finished rather
 * than as a control you have to scroll back up to find.
 */
export function LetterReturn({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <p className="letter-return">
      <button type="button" className="letter-link" onClick={onClick}>{children}</button>
    </p>
  );
}

/**
 * Everything that is not a letter, said in the letter's own voice.
 *
 * These states used to be a spinner, an EmptyState titled "Couldn't reach the
 * stars", and a card telling the citizen to complete their birth details. On
 * this surface they are sentences, because a modal-looking box appearing on the
 * paper is exactly the furniture the page was stripped of.
 */
export function LetterNote({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <>
      <p className="letter-p" style={{ marginBottom: action ? 22 : 0 }}>{children}</p>
      {action}
    </>
  );
}

/** The one thing we cannot write a letter without. */
export function NeedsBirthDetails() {
  return (
    <LetterNote action={<Link className="letter-link" to="/profile/astrology">Add your details</Link>}>
      There is no letter here yet, because writing one to you means knowing when and where you were
      born. It is asked once and shared across everything else you use, so you will not be asked
      again.
    </LetterNote>
  );
}
