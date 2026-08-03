import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui';
import { useAskAstrologer, useAstroProfile, useAstroQuestions } from '../hooks';
import { useDarkChrome } from '../components/useDarkChrome';

const TOPICS = [
  'Career', 'Marriage', 'Relationships', 'Business', 'Investments', 'Education',
  'Children', 'Foreign Travel', 'Property', 'Health', 'Spiritual Growth',
];
const PRICE = 75;
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
 * Tab 03 — Ask the Astrologer. ₹75 per question, charged to the city wallet;
 * every consultation is saved under My Questions.
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
  const ask = useAskAstrologer();
  const [topic, setTopic] = useState('Career');
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const artRef = useSlowParallax();
  useDarkChrome();

  const submit = () => {
    setError(null);
    ask.mutate({ topic, question: question.trim() }, {
      onSuccess: (res) => { setQuestion(''); setOpenId(res.id); },
      onError: (e) => {
        const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
        setError(Array.isArray(msg) ? msg.join(' ') : msg ?? 'Something went wrong — you have not been charged.');
      },
    });
  };

  const needsProfile = profile.data && !profile.data.complete;
  const count = question.trim().length;
  const tooLong = count > MAX_CHARS;

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

                {error && <p className="ask-error" role="alert">{error}</p>}

                <button type="button" className="ask-cta"
                  disabled={count < MIN_CHARS || tooLong || ask.isPending}
                  onClick={submit}>
                  {ask.isPending ? 'Writing your answer…' : `Pay ₹${PRICE} & Ask →`}
                </button>

                <p className="ask-fineprint">
                  Charged securely to your Together City Wallet. Your consultation will be
                  permanently available inside My Questions.
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
                    answer you&rsquo;ve paid for is still saved.
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
                      {new Date(q.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · ₹{q.priceInr}
                    </span>
                    <span className="ask-past-mark" aria-hidden>{openId === q.id ? '−' : '+'}</span>
                  </button>
                  {openId === q.id && (
                    <div className="ask-past-body">
                      {q.answer.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
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
