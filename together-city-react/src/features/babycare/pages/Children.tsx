/**
 * ── YOUR CHILDREN ───────────────────────────────────────────────────────────
 *
 * The record the whole district reads, and the shortest form in the city: a
 * name, a birthday, and a box of the parent's own words that nothing reads.
 *
 * THE FORM SAYS WHAT THE NOTES ARE FOR AND WHAT THEY ARE NOT. A parent typing
 * "eczema — fragrance free only" has told the city something true and useful to
 * them, and the temptation to filter the catalogue on it is exactly the thing
 * this hub must not do: a store deciding which products are safe for a child's
 * skin from a sentence in a text box is practising medicine with a substring
 * match. The Pet District's medical card carries the same promise for the same
 * reason, and says so on the card rather than in a comment.
 *
 * THE BIRTHDAY IS OPTIONAL, and the empty case is a real one — a parent who
 * would rather not put a child's date of birth into an application. The shelf
 * says "showing everything" for them and works. Making it required would buy a
 * band and cost the parents who would then not add a child at all.
 */

import { useState } from 'react';
import { Fold } from '@/components/ui/Fold';
import { useBabyCare } from '../store';
import { ageWords, BAND_LABEL, bandForDob, monthsOld } from '../age';
import type { Child } from '../types';

const TODAY = () => new Date().toISOString().slice(0, 10);

function Row({ child }: { child: Child }) {
  const editChild = useBabyCare((s) => s.editChild);
  const removeChild = useBabyCare((s) => s.removeChild);
  const [name, setName] = useState(child.name);
  const [dob, setDob] = useState(child.dob ?? '');
  const [notes, setNotes] = useState(child.notes);
  const [confirming, setConfirming] = useState(false);

  const band = bandForDob(child.dob);
  const said = child.dob
    ? (monthsOld(child.dob) === null ? 'birthday not yet arrived' : `${ageWords(child.dob)} · ${BAND_LABEL[band ?? '7-10y']}`)
    : 'no birthday on file';

  /* THE CITY'S ONE DISCLOSURE, rather than a fourth copy of its four lines.
     `Fold` exists because a section that folds is state, an id and two ARIA
     attributes done together, and a second implementation still LOOKS correct
     while a screen reader is told nothing at all — the argument is on the
     component and a-read-section-folds-itself.test.ts counts the copies.
     CONTROLLED, because saving closes it, which a fold holding its own state
     cannot know about — the daybook's reason, one hub over. */
  const [open, setOpen] = useState(false);

  const save = () => {
    void editChild(child.id, { name: name.trim() || child.name, dob: dob || null, notes });
    setOpen(false);
  };

  return (
    <article className="card">
      <Fold title={child.name} meta={said} open={open} onOpenChange={setOpen}>
        <div className="bc-stack-tight">
          <label className="bc-field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </label>
          <label className="bc-field">
            Birthday
            <input type="date" value={dob} max={TODAY()} onChange={(e) => setDob(e.target.value)} />
            <span className="bc-hint">
              Optional. It is the only thing the shelf reads, and the age is worked out from it every
              time rather than saved — so the shop keeps up on its own.
            </span>
          </label>
          <label className="bc-field">
            Your own notes
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
            <span className="bc-hint">
              Kept for you and read by nothing. The shop does not filter, rank or recommend on what
              you write here — deciding what is safe for a child’s skin from a sentence in a box is
              not something a store should do.
            </span>
          </label>
          <div className="bc-row">
            <button type="button" className="btn btn-accent" onClick={save}>Save</button>
            {confirming
              ? (
                <>
                  <button type="button" className="btn" onClick={() => { void removeChild(child.id); }}>
                    Yes, remove {child.name}
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirming(false)}>Keep</button>
                </>
              )
              : <button type="button" className="btn" onClick={() => setConfirming(true)}>Remove</button>}
          </div>
        </div>
      </Fold>
    </article>
  );
}

export function Children() {
  const children = useBabyCare((s) => s.children);
  const loaded = useBabyCare((s) => s.loaded);
  const addChild = useBabyCare((s) => s.addChild);
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');

  const add = () => {
    const n = name.trim();
    if (!n) return;
    void addChild({ name: n, dob: dob || null, notes: '' });
    setName('');
    setDob('');
  };

  return (
    <div className="bc-stack">
      <header className="bc-head">
        <h1>Your children</h1>
        <p className="bc-lede">
          A name and a birthday. That is the whole record, and it is all the shop reads — the age is
          worked out from the birthday every time it is asked for, so the shelf moves with the child
          instead of with whatever was true the day you typed it.
        </p>
      </header>

      <section className="card bc-stack-tight">
        <strong className="bc-title">Add a child</strong>
        <div className="bc-row-end">
          <label className="bc-field bc-field-grow">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Aarav" />
          </label>
          <label className="bc-field bc-field-date">
            Birthday (optional)
            <input type="date" value={dob} max={TODAY()} onChange={(e) => setDob(e.target.value)} />
          </label>
          <button type="button" className="btn btn-accent" onClick={add} disabled={!name.trim()}>Add</button>
        </div>
      </section>

      {!loaded && <p className="bc-quiet" role="status" aria-live="polite">Reading your children…</p>}

      {loaded && children.length === 0 && (
        <p className="bc-lede">
          Nobody yet. The shop works without this — it shows everything and says so at the top of
          every shelf — and it gets shorter and more useful the moment a birthday is here.
        </p>
      )}

      <div className="bc-stack-tight">
        {children.map((c) => <Row key={c.id} child={c} />)}
      </div>
    </div>
  );
}
