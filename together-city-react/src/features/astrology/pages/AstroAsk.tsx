import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAskAstrologer, useAskQuota, useAstroProfile, useAstroQuestions, useDeleteQuestion } from '../hooks';

const TOPICS = [
  'Career', 'Marriage', 'Relationships', 'Business', 'Investments', 'Education',
  'Children', 'Foreign Travel', 'Property', 'Health', 'Spiritual Growth',
];
/** The server's own rule, mirrored so the counter can say what it is:
 *  `question: z.string().min(10).max(600)` in astrology.controller.ts. */
const MIN_CHARS = 10;
const MAX_CHARS = 600;

/**
 * A parallax so slight you should not be able to point at it.
 *
 * Six pixels at the far corner of the viewport, written to a CSS custom
 * property and applied with translate3d, so the whole thing is one composited
 * layer and no React state changes on mouse move — a re-render per pointer
 * event would cost more than the effect is worth.
 *
 * It does nothing at all for someone who has asked for less motion, and nothing
 * on a device with no pointer to move.
 */
function useSlowParallax() {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (still) return;
    let frame = 0;
    const onMove = (e: MouseEvent) => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const x = (e.clientX / window.innerWidth - 0.5) * 2;
        const y = (e.clientY / window.innerHeight - 0.5) * 2;
        el.style.setProperty('--px', `${(-x * 6).toFixed(2)}px`);
        el.style.setProperty('--py', `${(-y * 6).toFixed(2)}px`);
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => { window.removeEventListener('mousemove', onMove); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return ref;
}

/**
 * How this citizen's allowance reads, in one sentence.
 *
 * WRITTEN FROM THE SERVER'S NUMBERS, never from constants of its own. The
 * counter that decides the charge is the same one that produces this line, so
 * the screen cannot advertise a price the wallet is not about to take.
 *
 * The zero case is the one that matters: somebody about to be charged should
 * see the amount, what it buys and that it is not a subscription, BEFORE they
 * write anything — not on a receipt afterwards.
 */
function allowanceLine(q: {
  includedLeft: number; onFreeAllowance: boolean;
  packSize: number; packPriceInr: number; freeQuestions: number;
}): string {
  const some = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (q.includedLeft === 0) {
    return `Your next consultation is ₹${q.packPriceInr}, and it covers that question and the `
      + `${q.packSize - 1} after it. One payment, no subscription.`;
  }
  if (q.onFreeAllowance) {
    return `${some(q.includedLeft, 'free consultation')} left of your ${q.freeQuestions}.`;
  }
  return `${some(q.includedLeft, 'consultation')} left in the set you have already paid for.`;
}

/**
 * Tab 03 — Ask the Astrologer. Five free, then ₹100 for the next five, charged
 * to the city wallet; every consultation is saved under My Questions.
 *
 * THE REDESIGN IS THE VIEW AND ONLY THE VIEW. Every hook, every piece of state,
 * the mutation, its success and error handling, the disabled rule, the history
 * list and its three states are the same code they were — moved, restyled, and
 * otherwise untouched. No endpoint, schema, price or validation changed.
 *
 * Three things are genuinely new, and all three are visible on the screen
 * rather than behind it:
 *
 *  · A CHARACTER COUNTER, which the brief asked to keep and which did not
 *    exist. The server has always required 10–600; the page only ever
 *    mentioned it in placeholder text, so somebody who wrote 700 characters
 *    found out by being refused after pressing the button.
 *  · THE SUBMIT BUTTON NOW ALSO REFUSES OVER 600. That mirrors the server's
 *    own rule exactly, so it cannot block anything the server would have
 *    accepted — it only moves a rejection from after the click to before it.
 *  · A FAILURE BRANCH FOR THE BIRTH PROFILE. `profile` had `isLoading` and
 *    `data` and no `isError`, so a failed read rendered a heading over an empty
 *    page: no question box, no explanation, nothing to do. It said the same
 *    thing an unfinished profile says, which is a claim about the citizen's own
 *    record that nobody had checked.
 */
export function AstroAsk() {
  const profile = useAstroProfile();
  const questions = useAstroQuestions();
  const quota = useAskQuota();
  const ask = useAskAstrologer();
  const [topic, setTopic] = useState('Career');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unwritten, setUnwritten] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const remove = useDeleteQuestion();
  const artRef = useSlowParallax();

  const submit = () => {
    setError(null);
    setUnwritten(false);
    ask.mutate({ topic, question: question.trim() }, {
      /**
       * `pending` means no answer could be written — the consultation was not
       * saved, the allowance was not spent and nothing was charged. It arrives
       * as a 200 because nothing failed; there is simply nothing to show, and
       * the citizen has to be told that in those words rather than left looking
       * at a question box that emptied itself for no visible reason.
       */
      onSuccess: (res) => {
        if (res.pending) { setUnwritten(true); return; }
        setQuestion('');
        setOpenId(res.id);
      },
      onError: (e) => {
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'Something went wrong — you have not been charged.');
      },
    });
  };

  const needsProfile = profile.data && !profile.data.complete;
  const count = question.trim().length;
  const tooLong = count > MAX_CHARS;
  const price = quota.data?.priceInr ?? 0;

  return (
    <div className="ask-stage">
      <div className="ask-panel">
        <div className="ask-panel-inner">
          <p className="ask-eyebrow">Astrology Zone</p>
          <h1 className="ask-title">Ask the Astrologer</h1>
          <p className="ask-lede">
            A private consultation drawn from your birth profile and your own question. Every answer
            is written for you and kept permanently under My Questions.
          </p>

          {profile.isLoading && <div className="ask-note"><Spinner label="Opening the room…" /></div>}

          {profile.isError && (
            <div className="ask-note">
              <p>
                We couldn&rsquo;t reach your birth profile just now. This isn&rsquo;t a message that
                it&rsquo;s missing &mdash; only that we couldn&rsquo;t read it from here, so there is
                nothing to ask with until we can.
              </p>
              <button type="button" className="ask-link" onClick={() => void profile.refetch()}>Try again</button>
            </div>
          )}

          {needsProfile && (
            <div className="ask-note">
              <p>
                A consultation is written from when and where you were born, and we don&rsquo;t have
                that yet. It&rsquo;s asked once and shared across everything else you use.
              </p>
              <Link className="ask-link" to="/profile/astrology">Add your details</Link>
            </div>
          )}

          {profile.data?.complete && (
            <>
              <section className="ask-card">
                <h2 className="ask-card-title">Ask About Your Life</h2>
                <p className="ask-card-sub">
                  Your birth profile is already connected. Ask one thoughtful question &mdash; the
                  more specific it is, the more the answer can be about you.
                </p>

                <div className="ask-topics" role="group" aria-label="Consultation topic">
                  {TOPICS.map((t) => (
                    <button key={t} type="button" onClick={() => setTopic(t)}
                      aria-pressed={topic === t}
                      className={`ask-chip${topic === t ? ' is-on' : ''}`}>
                      {t}
                    </button>
                  ))}
                </div>

                <label className="ask-field">
                  <span className="ask-sr">Your question</span>
                  <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={5}
                    className="ask-textarea"
                    placeholder="Ask about your current situation. The more specific your question, the more personalized your guidance will be." />
                </label>

                <div className="ask-meta">
                  <span className={`ask-count${tooLong ? ' is-over' : ''}`}>
                    {count} / {MAX_CHARS}
                    {count > 0 && count < MIN_CHARS ? ` · ${MIN_CHARS - count} more to go` : ''}
                  </span>
                </div>

                {/* Where they stand, above the button rather than beside the
                    receipt. The button below only ever names a price this line
                    has already explained. */}
                {quota.data && (
                  <p className={`ask-quota${price ? ' is-due' : ''}`}>{allowanceLine(quota.data)}</p>
                )}

                {error && <p className="ask-error" role="alert">{error}</p>}

                {unwritten && (
                  <p className="ask-error" role="alert">
                    We couldn&rsquo;t write your consultation this time. Nothing has been saved and
                    nothing has been charged &mdash; your question is still here, so please try again
                    in a moment.
                  </p>
                )}

                <button type="button" className="ask-cta"
                  disabled={count < MIN_CHARS || tooLong || ask.isPending || quota.isLoading}
                  onClick={submit}>
                  {ask.isPending ? 'Writing your answer…' : price ? `Pay ₹${price} & Ask →` : 'Ask →'}
                </button>

                <p className="ask-fineprint">
                  {price
                    ? `₹${price} is charged once to your Together City Wallet and covers this consultation and the `
                      + `${(quota.data?.packSize ?? 5) - 1} after it. Every one is permanently available inside My Questions.`
                    : 'Nothing to pay for this one. Your consultation will be permanently available inside My Questions.'}
                </p>
              </section>

              <h2 className="ask-history-title">My Questions</h2>
              {questions.isLoading && <div className="ask-note"><Spinner /></div>}
              {/* This list guarded on `questions.data?.length === 0`, so a failed
                  read rendered NOTHING — the heading "My Questions" above an empty
                  gap. These are answers the citizen paid for; a blank space where
                  they should be is the worst possible way to not say something. */}
              {questions.isError && (
                <div className="ask-note">
                  <p>
                    We couldn&rsquo;t load your consultations. Nothing has been lost &mdash; every
                    answer written for you is still saved.
                  </p>
                  <button type="button" className="ask-link" onClick={() => void questions.refetch()}>Try again</button>
                </div>
              )}
              {questions.data?.length === 0 && (
                <div className="ask-note">
                  <p>No consultations yet. Your first question and its full answer will be kept here.</p>
                </div>
              )}
              {(questions.data ?? []).map((q) => (
                <article key={q.id} className="ask-past">
                  <button type="button" className="ask-past-head"
                    aria-expanded={openId === q.id}
                    onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                    <span className="ask-past-topic">{q.topic}</span>
                    <span className="ask-past-q">{q.question}</span>
                    <span className="ask-past-when">
                      {new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {/* What this one actually cost, kept as a record rather
                          than recalculated — a consultation from the ₹75 era
                          still says ₹75, because that is what happened. */}
                      {q.priceInr > 0 ? ` · ₹${q.priceInr}` : ' · Free'}
                    </span>
                    <span className="ask-past-mark" aria-hidden>{openId === q.id ? '−' : '+'}</span>
                  </button>
                  {openId === q.id && (
                    <div className="ask-past-body">
                      {q.answer.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}

                      {/* Deleting is a two-step, in place. A browser confirm()
                          blocks every later interaction if it is ever left
                          open, and a modal over a consultation somebody is
                          part-way through reading is the wrong shape for a
                          decision this small. */}
                      <div className="ask-past-actions">
                        {confirmId === q.id ? (
                          <>
                            {/* Both halves of the truth, before the click. The
                                second half is the one somebody would otherwise
                                discover by deleting five answers and finding
                                the sixth still costs money. */}
                            <span className="ask-past-warn">
                              Delete this permanently? It is not recoverable, and it does not give
                              the consultation back to your allowance.
                            </span>
                            <button type="button" className="ask-link is-danger"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(q.id, {
                                onSuccess: () => { setConfirmId(null); setOpenId(null); },
                              })}>
                              {remove.isPending ? 'Deleting…' : 'Yes, delete'}
                            </button>
                            <button type="button" className="ask-link" onClick={() => setConfirmId(null)}>Keep it</button>
                          </>
                        ) : (
                          <button type="button" className="ask-link" onClick={() => setConfirmId(q.id)}>
                            Delete this consultation
                          </button>
                        )}
                      </div>
                      {remove.isError && confirmId === q.id && (
                        <p className="ask-error" role="alert">
                          We couldn&rsquo;t delete it just now &mdash; it is still here. Try again in a moment.
                        </p>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Atmosphere only. Nothing is ever laid over it, and it carries no
          information — hence the empty alt: a screen reader has nothing to gain
          from it and a list of planet names to lose. */}
      <div className="ask-art" ref={artRef} aria-hidden>
        <picture>
          <source media="(max-width: 900px)" srcSet="/assets/img/ask-sky-wide.webp" />
          <img className="ask-art-img" src="/assets/img/ask-sky-tall.webp" alt=""
            loading="lazy" decoding="async" />
        </picture>
        <span className="ask-art-fade" />
      </div>
    </div>
  );
}
