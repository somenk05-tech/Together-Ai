import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useScaleLock } from '@/hooks/useScaleLock';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useDirectory, useSendMail, useMailAccount, useSaveDraft, useDiscardDraft, useMailMessage, useMailThread, useMailProjects, type DirectoryEntry } from '../api';
import { quoteBlock, withQuote } from '../replyQuote';
import { payError } from '@/features/financial/api';
import { DrivePicker } from '../DrivePicker';
import { fmtBytes, fileIcon, type DriveFile } from '@/features/drive/api';

/** Compose — write to a connected citizen (directory autocomplete, which only
 *  lists your connections) OR any external/global email address (delivered via
 *  the email provider). City mail to a stranger is refused by the API. */
export function Compose() {
  /* The composer is where the zoom actually hurt: tapping To on an iPhone
     scaled the page and left the send key off the right-hand edge. */
  useScaleLock();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const dir = useDirectory();
  const acct = useMailAccount();
  const send = useSendMail();
  const saveDraft = useSaveDraft();
  const discard = useDiscardDraft();

  /**
   * Resuming a draft. `?draft=<id>` loads what was left; the fields are seeded
   * ONCE, when it arrives, and never again — re-seeding on every render would
   * overwrite what the citizen is typing with what they had typed.
   */
  const draftParam = params.get('draft') ?? undefined;
  const loaded = useMailMessage(draftParam ?? '');
  const [seeded, setSeeded] = useState(!draftParam);

  const [to, setTo] = useState(params.get('to') ?? '');
  const [subject, setSubject] = useState(params.get('subject') ?? '');
  /**
   * CC AND BCC, HIDDEN UNTIL ASKED FOR.
   *
   * Most messages go to one person. Two more always-visible fields make the
   * common case look like the uncommon one, so they arrive on a press — and
   * stay open once anything is in them, or a citizen who typed an address and
   * collapsed the row would send a message to somebody they could no longer
   * see.
   */
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showCopies, setShowCopies] = useState(false);
  /** Commas or spaces, because both are what people type. */
  const addrs = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
  const [body, setBody] = useState('');
  const [showSug, setShowSug] = useState(false);
  /** Which suggestion the keyboard is on. -1 is "none", which is also what the
   *  mouse leaves it at — nothing is preselected, so Enter sends what was
   *  typed unless somebody has actually arrowed down to a name. */
  const [sugAt, setSugAt] = useState(-1);
  const [attachments, setAttachments] = useState<DriveFile[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /**
   * WHO DID NOT GET IT.
   *
   * `send()` throws only when EVERY recipient is refused; otherwise it returns
   * 200 with a `failed` list. This composer never read that list, so a message
   * to five people where two were rejected closed the page and navigated to
   * Sent, and nobody was ever told. Half the recipients got nothing and the
   * screen said the message had gone.
   *
   * It stays on the page when that happens. Navigating away and putting the
   * news in a toast is the same silence with an animation on it — the failed
   * addresses are here, next to the field they were typed into.
   */
  const [refused, setRefused] = useState<Array<{ to: string; reason: string }>>([]);
  /** The draft row these words live in. Set on resume, or on first autosave. */
  const draftId = useRef<string | undefined>(draftParam);
  const threadId = params.get('threadId') ?? (loaded.data?.threadId ?? undefined); // reply → append to trail
  /**
   * COMPOSE WAS OPENED INSIDE A PROJECT, so the conversation this starts is
   * born filed there and every reply comes home to the same room. That is the
   * FIRST of the two ways mail is ever filed, and it is why no rule engine is
   * needed for the common case.
   *
   * The API ignores this when the thread is already filed — replying to an ABG
   * conversation from All Emails does not move it out of ABG.
   *
   * THE KEY GOES TO THE API, NOT THE ID. The key is in the URL and is known
   * the instant this page mounts; the id needs the project list, and somebody
   * who opens Compose from a project, types fast and presses Send before that
   * list resolves would send an UNFILED message from inside a project, with
   * nothing on screen to say so. The lookup below is for the LABEL only, so
   * the worst it can do late is say "in …" a moment after the page.
   */
  const projectKey = params.get('project') ?? undefined;
  const projects = useMailProjects();
  const project = projectKey ? (projects.data ?? []).find((p) => p.key === projectKey) : undefined;

  useEffect(() => {
    if (seeded || !loaded.data) return;
    setTo(loaded.data.toAddr ?? '');
    setSubject(loaded.data.subject ?? '');
    setBody(loaded.data.body ?? '');
    setSeeded(true);
  }, [loaded.data, seeded]);

  /**
   * AUTOSAVE — the promise a draft folder makes.
   *
   * Debounced 1.2s after the last keystroke, and skipped entirely while the
   * message is empty: a citizen who opens Compose, reads it and leaves should
   * not find a blank draft waiting for them.
   *
   * "SKIPPED WHILE SENDING" ONLY EVER STOPPED THE TIMER BEING ARMED, and that
   * is not the same as stopping a save. A request already in the air kept
   * going, and its onSuccess set `draftId.current` — after the send had
   * already read it:
   *
   *   t+1.2s  autosave fires with id: undefined  →  CREATE, in flight
   *   t+1.3s  Send reads draftId.current (still undefined) and clears nothing
   *   t+1.4s  autosave lands and creates the row
   *
   * A full copy of the message that just went out sits in Drafts & Failed for
   * good, and resuming it sends the whole thing a second time — which is the
   * exact outcome `draftId` exists to prevent.
   *
   * TWO REFS FIX IT, and neither is a timer.
   *
   * `sentRef` records that a send has been ACCEPTED. Any draft that lands
   * after that is a ghost of a message already delivered, so it is discarded
   * the moment it arrives rather than left for somebody to find.
   *
   * `savingRef` records that a CREATE is in flight. Without it, a second
   * autosave firing before the first resolves also carries `id: undefined`
   * and creates a second row — the "thirty near-identical drafts" this
   * function's own docstring says it exists to prevent, reachable on any slow
   * connection.
   */
  const sending = send.isPending;
  const sentRef = useRef(false);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!seeded || sending || sentRef.current) return;
    const hasSomething = Boolean(to.trim() || subject.trim() || body.trim());
    if (!hasSomething) return;
    const t = setTimeout(() => {
      // A create is already in the air; it will carry an id next time.
      if (savingRef.current || sentRef.current) return;
      if (!draftId.current) savingRef.current = true;
      saveDraft.mutate(
        { id: draftId.current, to, subject, body, threadId },
        {
          onSuccess: (d) => {
            savingRef.current = false;
            if (sentRef.current) {
              // The message went out while this was in the air. Nobody wants a
              // draft of a letter they have already posted.
              discard.mutate(d.id);
              return;
            }
            draftId.current = d.id;
            setSavedAt(new Date());
          },
          // A failed autosave is not worth a red box over somebody's writing —
          // the words are still in the box, and the next keystroke retries.
          onError: () => { savingRef.current = false; },
        },
      );
    }, 1200);
    return () => clearTimeout(t);
    // saveDraft is a stable mutation object; including it would re-arm the
    // timer on every render and never save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, subject, body, threadId, seeded, sending]);

  /**
   * A REPLY CARRIES WHAT IT IS ANSWERING, which it did not until now.
   *
   * Inside the city that was survivable — the thread is on the screen behind
   * you — but the recipient is usually outside it, and what landed in their
   * Gmail was a bare "yes, Tuesday works" with nothing saying what Tuesday
   * was. Every mail client quotes; the absence was not restraint.
   *
   * QUOTED AT SEND, NOT TYPED INTO THE BOX. Gmail puts the history inside the
   * editable body, which is why a four-word reply there is fifty lines tall
   * before you start. quoted.ts already argues the other side of this for
   * READING; the same argument holds for writing. The box holds what you are
   * writing, the quotation is shown beneath it behind one control, and the two
   * are joined on the way out.
   *
   * The NEWEST message in the trail is the one quoted. The ones before it are
   * already inside its own quotation, which is how every client does it and
   * why a thread does not grow quadratically.
   */
  const trail = useMailThread(threadId ?? null);
  const quote = useMemo(() => {
    if (!threadId) return '';
    const rows = trail.data ?? [];
    const newest = rows[rows.length - 1];
    return newest ? quoteBlock(newest) : '';
  }, [threadId, trail.data]);
  const [open, setOpen] = useState(false);

  const suggestions = useMemo(() => {
    const term = to.trim().toLowerCase().replace(/@.*/, '');
    if (!term) return (dir.data ?? []).slice(0, 6);
    return (dir.data ?? []).filter((d) => d.name.toLowerCase().includes(term) || d.handle.toLowerCase().includes(term)).slice(0, 6);
  }, [to, dir.data]);

  const pick = (d: DirectoryEntry) => { setTo(d.address); setShowSug(false); setSugAt(-1); };

  /**
   * THE SUGGESTION LIST COULD NOT BE CLOSED AND COULD NOT BE REACHED.
   *
   * It opened on focus and on every keystroke, and the ONLY thing that ever
   * closed it was picking a name from it. Type an address that is not a
   * connection — which is most external mail — and the panel stayed over the
   * Cc field and the Bcc field for the rest of the compose, absolutely
   * positioned at z-index 20, and there was no key, no click and no gesture
   * that would put it away.
   *
   * And the options were bare `div`s with an onClick. Not focusable, not
   * announced, no role: to a keyboard they did not exist, and to a screen
   * reader the To field had nothing attached to it at all — no combobox, no
   * list, no indication that six names had just appeared. The mouse was the
   * only way in.
   *
   * So: Escape closes it, blur closes it, arrows move through it, Enter takes
   * the one the arrows are on, and the whole thing is a listbox the input
   * points at. `onMouseDown` still preventDefaults on each option so a click
   * does not blur the input out from under itself before the click lands —
   * that part was already right.
   */
  const onToKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Only swallowed when there is something to close, so Escape keeps
      // meaning whatever it means to the page when the list is not open.
      if (showSug) { e.stopPropagation(); setShowSug(false); setSugAt(-1); }
      return;
    }
    if (!showSug || suggestions.length === 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setShowSug(true); setSugAt(0); }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSugAt((i) => (i + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSugAt((i) => (i <= 0 ? suggestions.length : i) - 1); }
    else if (e.key === 'Enter' && sugAt >= 0 && sugAt < suggestions.length) { e.preventDefault(); pick(suggestions[sugAt]); }
  };
  /**
   * A MESSAGE NEEDS SOMETHING IN IT.
   *
   * `to.trim() && !send.isPending` was the whole test, so Send was live on an
   * empty box — and a thread in this mailbox now holds EIGHT blank messages,
   * each one a name and a date and nothing else, sent by a finger that was
   * already on the key. The city's chat composer has required a body since it
   * was written; its mail composer never did.
   *
   * An attachment counts as something to send: a file with no covering note is
   * a message. A subject alone is not — that is the slip this is catching.
   *
   * AND A REPLY WAITS FOR ITS THREAD. The quotation is built from the trail,
   * and until the trail arrives there is nothing to quote: pressing Send in
   * that half-second sends a reply carrying no history, with nothing on screen
   * to say the history was missing. It is the same race the project key had,
   * and it gets the same answer — the key is not live until the fact it needs
   * is in hand.
   */
  const hasSomething = Boolean(body.trim()) || attachments.length > 0;
  const trailPending = Boolean(threadId) && trail.isLoading;
  const canSend = to.trim() && hasSomething && !trailPending && !send.isPending;

  const inp = { padding: '11px 12px', border: '1.5px solid var(--line)', borderRadius: 'var(--r-1)', fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, background: 'var(--card)' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div>
          <div className="eyebrow">{project?.name ?? projectKey ?? 'Mail'} · Compose</div>
          <h1 style={{ fontSize: 24, margin: 0 }}>✍️ {draftParam ? 'Continue your draft' : threadId ? 'Reply' : 'New message'}</h1>
          {/* Which room this is being written in, said once and plainly. A
              composer that looks identical everywhere is how a message meant
              for a project ends up filed nowhere. */}
          {/* Which room this is being written in, said once and plainly. Keyed
              off the URL rather than the loaded project, so it is right from
              the first paint — a composer that looks identical everywhere is
              how a message meant for a project ends up filed nowhere. */}
          {projectKey && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
              in {project?.name ?? projectKey} — it will be filed there, and the reply will come back to it
            </div>
          )}
        </div>
        <span className="muted" style={{ marginLeft: 'auto', fontSize: 12.5, fontFamily: 'monospace' }}>from {acct.data?.address ?? '…'}</span>
      </div>

      <div className="card" style={{ marginTop: 14, display: 'grid', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <label style={{ fontSize: 12 }} className="muted">To</label>
          <input value={to}
            onChange={(e) => { setTo(e.target.value); setShowSug(true); setSugAt(-1); }}
            onFocus={() => setShowSug(true)}
            onBlur={() => { setShowSug(false); setSugAt(-1); }}
            onKeyDown={onToKey}
            role="combobox" aria-autocomplete="list" aria-controls="mail-to-suggestions"
            aria-expanded={showSug && suggestions.length > 0}
            aria-activedescendant={sugAt >= 0 ? `mail-to-sug-${sugAt}` : undefined}
            placeholder="Handle or email address" style={inp} autoComplete="off" />
          {dir.isSuccess && (dir.data?.length ?? 0) === 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
              No connections yet — but you can write to any email address.
            </div>
          )}
          {showSug && suggestions.length > 0 && (
            <div className="card mail-sug" id="mail-to-suggestions" role="listbox" aria-label="Your connections">
              {suggestions.map((d, i) => (
                <button type="button" key={d.handle} id={`mail-to-sug-${i}`} role="option"
                  aria-selected={i === sugAt} className={`mail-sug-opt${i === sugAt ? ' on' : ''}`}
                  onMouseDown={(e) => e.preventDefault()} onClick={() => pick(d)}>
                  <span className="mail-sug-name">{d.name}</span>
                  <span className="muted mail-sug-addr">{d.address}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {(showCopies || cc || bcc) ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12 }} className="muted">Cc</label>
              <input value={cc} onChange={(e) => setCc(e.target.value)}
                placeholder="Everyone here can see each other" style={inp} autoComplete="off" />
            </div>
            <div>
              <label style={{ fontSize: 12 }} className="muted">Bcc</label>
              <input value={bcc} onChange={(e) => setBcc(e.target.value)}
                placeholder="Nobody else sees these addresses" style={inp} autoComplete="off" />
              {/* Said at the field rather than in a help page, because the
                  difference between Cc and Bcc is the only thing about them
                  worth knowing and it is the thing people get wrong. */}
              <p className="muted" style={{ fontSize: 11.5, margin: '6px 0 0' }}>
                People on Bcc get the message. Nobody else is told they did — including each other.
              </p>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setShowCopies(true)}
            style={{ justifySelf: 'start', minHeight: 44, padding: '0 2px', background: 'none', border: 0,
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--accent-ink)' }}>
            Add Cc or Bcc
          </button>
        )}

        <div>
          <label style={{ fontSize: 12 }} className="muted">Subject</label>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" style={inp} />
        </div>
        <div>
          <label style={{ fontSize: 12 }} className="muted">Message</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} placeholder="Write your message…" style={{ ...inp, resize: 'vertical', lineHeight: 1.6 }} />
          {refused.length > 0 && (
            <div className="mrefused" role="alert">
              <b>
                {refused.length === 1 ? 'One address did not get it' : `${refused.length} addresses did not get it`}
                {' — the rest did.'}
              </b>
              <ul>
                {refused.map((f) => <li key={f.to}><span className="mrefused-to">{f.to}</span> {f.reason}</li>)}
              </ul>
              <span className="muted">
                It’s in Sent — fix those addresses and resend. Recipients will get a second copy.
              </span>
            </div>
          )}
          {/* The trail, under the message, behind the control every mail
              client uses for it. Read-only: it is a record of what was
              actually sent, and the place to change your own words is the box
              above. */}
          {quote && (
            <div className="mq">
              <button type="button" className="mq-key" aria-expanded={open}
                aria-label={open ? 'Hide the quoted conversation' : 'Show the quoted conversation'}
                onClick={() => setOpen((v) => !v)}>···</button>
              <span className="mq-said muted">
                {open ? 'The conversation you are replying to — it goes out under your message.' : 'Quoting the conversation below your message.'}
              </span>
              {open && <pre className="mq-body">{quote}</pre>}
            </div>
          )}
        </div>

        {/* Attachments from the citizen's Drive */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="line" size="sm" onClick={() => setPickerOpen(true)}>📎 Attach from Drive</Button>
            {attachments.length > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                {attachments.length} file{attachments.length === 1 ? '' : 's'} · {fmtBytes(attachments.reduce((s2, f) => s2 + f.sizeBytes, 0))}
              </span>
            )}
          </div>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
              {attachments.map((f) => (
                <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--line)', borderRadius: 'var(--r-full)', padding: '6px 10px 6px 12px', fontSize: 12.5, background: 'var(--paper)' }}>
                  <span>{fileIcon(f)}</span>
                  <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtBytes(f.sizeBytes)}</span>
                  <button type="button" aria-label={`Remove ${f.name}`}
                    onClick={() => setAttachments((cur) => cur.filter((x) => x.id !== f.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, lineHeight: 1, color: 'var(--muted)' }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {send.isError && <div style={{ fontSize: 13, color: 'var(--danger-ink)', background: 'var(--danger-soft)', borderRadius: 8, padding: '8px 12px' }}>{payError(send.error)}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Button variant="accent" disabled={!canSend}
            onClick={() => {
              setRefused([]);
              /* SET WHEN THE KEY IS PRESSED, NOT WHEN THE SEND RETURNS. The
                 autosave this is racing may land BEFORE onSuccess does, and a
                 flag set in onSuccess is a flag set too late to catch it. */
              sentRef.current = true;
              send.mutate(
                { to, cc: addrs(cc), bcc: addrs(bcc), subject: subject || '(no subject)', body: withQuote(body, quote), threadId, attachmentFileIds: attachments.map((f) => f.id), draftId: draftId.current, projectKey },
                {
                  onSuccess: (res) => {
                    if (res.failed.length > 0) {
                      /* Some refused, some accepted: the message IS in Sent, and
                         the citizen is still here fixing addresses. send() has
                         already cleared the draft, so the id in hand points at
                         a row that no longer exists — drop it, and let autosave
                         start a fresh one for whatever they type next. */
                      sentRef.current = false;
                      draftId.current = undefined;
                      setRefused(res.failed);
                      return;
                    }
                    if (threadId) nav(-1);
                    else nav(projectKey ? `/mail/p/${projectKey}/sent` : '/mail/sent');
                  },
                  // Nothing went out. Their words are still in the box and
                  // autosave should go on protecting them.
                  onError: () => { sentRef.current = false; },
                },
              );
            }}>
            {send.isPending ? 'Sending…' : trailPending ? 'Loading the thread…' : threadId ? 'Send reply' : 'Send'}
          </Button>
          <Button variant="line" onClick={() => nav(-1)}>Cancel</Button>
          {/* DISCARD, WHICH THE COMPOSER HAS NEVER HAD.
              mail-reads-on-a-phone.test.ts has been holding a place for this
              since it was written: the row's bin is hidden on a phone wherever
              deleting has another door, and drafts were the one exception
              because there was no other door. Cancel leaves the draft where it
              is — which is right, it is unfinished work — but there was no way
              to say "throw this away" from the place you are throwing it away
              from. Shown only once there is a row to discard: a composer
              nobody has typed in has nothing to delete. */}
          {(draftParam || savedAt) && (
            <Button variant="line" disabled={discard.isPending}
              onClick={() => {
                const id = draftId.current;
                if (!id) { nav(-1); return; }
                // Stop autosave putting it straight back — the same flag the
                // send path uses, for the same race.
                sentRef.current = true;
                discard.mutate(id, { onSuccess: () => nav('/mail/unsent') });
              }}>
              {discard.isPending ? 'Discarding…' : '🗑 Discard'}
            </Button>
          )}
          {/* Says what actually happened, and where to find it. */}
          <span className="muted" style={{ marginLeft: 'auto', fontSize: 12 }} role="status" aria-live="polite">
            {savedAt
              ? `Draft saved ${savedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · in Drafts & Failed`
              : null}
          </span>
        </div>
      </div>

      {pickerOpen && (
        <DrivePicker
          alreadyPicked={attachments.map((f) => f.id)}
          onClose={() => setPickerOpen(false)}
          onPick={(files) => setAttachments((cur) => [...cur, ...files.filter((f) => !cur.some((c) => c.id === f.id))])}
        />
      )}
    </div>
  );
}
