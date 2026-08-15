import { useEffect, useRef, useState } from 'react';
import { ZodError } from 'zod';
import { Link } from 'react-router-dom';
import { useMiraAsk, useMiraCapabilities, useMiraGreeting, useMiraSubscribe, type Choice } from './api';
import { Icon } from '@/components/ui/Icon';
import { MiraMark, type MarkState } from './MiraMark';
import { useVoiceNote, useSpeech } from './voice';
import { clearDay, daySeed, firstOpenToday, loadDay, saveDay, type StoredTurn } from './day';

/**
 * The opening, built from the manifest rather than written by hand.
 *
 * A greeting that promises ordering while the executor has no branch that
 * writes is the exact failure this codebase exists to avoid — and a
 * hand-written promise rots the day somebody adds a capability and forgets the
 * copy. So the last sentence is generated: it lists what is actually
 * decorated, and it grows on its own.
 *
 * WITH TWENTY-EIGHT CAPABILITIES IT NAMES A FEW AND COUNTS THE REST. Reading
 * out twenty-eight intents is not an introduction, it is a menu — and a menu is
 * the thing she exists to replace.
 */
function opening(canDo: string[]): string {
  const head =
    'Tell me what you want done in the city and I’ll do it — you don’t need to know which page it lives on. ' +
    'Talking is enough; no hands needed.';
  if (!canDo.length) return head;
  const shown = canDo.slice(0, 3).join(', ');
  const rest = canDo.length - 3;
  const tail = rest > 0 ? `${shown}, and ${rest} more like them` : shown;
  return `${head} Right now that means ${tail} — and taking you anywhere you ask for. Booking and paying come next; I’ll say so rather than pretend.`;
}

const mmss = (s: number): string => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Which tab spoke last, remembered across opens — a preference, not data. */
const MODE_KEY = 'mira.mode';
const storedMode = (): 'friend' | 'city' | null => {
  try {
    const v = window.localStorage.getItem(MODE_KEY);
    return v === 'friend' || v === 'city' ? v : null;
  } catch { return null; }
};
/** Opened over a page she arrives as the assistant; otherwise as whichever
 *  of her spoke last, and as the friend the very first time. */
const openingMode = (about?: string): 'friend' | 'city' => (about ? 'city' : storedMode() ?? 'friend');

/**
 * HER FIRST MESSAGE AS A FRIEND — the owner's copy, verbatim, emojis and
 * all. Sent once per device, as a real bubble rather than an empty-state
 * paragraph, because "the first message Mira sends" is what was asked for
 * and a message is a thing that arrived. The assistant tab keeps the
 * original opening: HERE, take your time, and what she can actually do.
 */
const WELCOME = `Hey. I’m Mira. 👋
Think of me as your buddy inside Together City.
You’ve got 200 free messages with me to start with. And the more you choose to share and build your profile, the better I’ll understand you — what you like, what matters to you, what you’re working on, and how I can actually be useful.
You can talk to me however you want.
Need a friend? I’m here.
Want an astrologer? I’ve got you. ✨
Need a guide or someone to help you think through a decision? Talk to me.
Need an assistant to actually get things done? Say the word.
Relationship trouble? Want me to analyse a chat and tell you what the hell is actually going on? Send it over. 😏
And you don’t have to figure out which version of me you need.
Just talk to me normally. I’ll figure it out.
You’re always in control of what I know about you. I only use information you choose to share or give me permission to access, and your conversations are treated as private and confidential within Together City’s privacy framework.
I’m not here to judge you.
I’m here to help you think, decide, create, organise, laugh, vent, figure shit out — and sometimes stop you from making a spectacularly bad decision.
So...
I’m Mira.
Your astrologer.
Your guide.
Your assistant.
Your sounding board.
Your occasional voice of reason.
But mostly?
Your buddy. ❤️`;

const WELCOMED_KEY = 'mira.welcomed';
/** The friend's room, seeded with her hello exactly once per device. */
const seedWelcome = (turns: StoredTurn[], room: 'friend' | 'city'): StoredTurn[] => {
  if (room !== 'friend' || turns.length > 0) return turns;
  try {
    if (window.localStorage.getItem(WELCOMED_KEY)) return turns;
    window.localStorage.setItem(WELCOMED_KEY, '1');
  } catch { return turns; }
  return [{ who: 'mira', text: WELCOME, levity: 2 }];
};

export function MiraThread({ weeksKnown = 0, dial, about, onBack }: {
  weeksKnown?: number; dial?: 0 | 1 | 2;
  /** The in-app path she was opened over — the dock's "ask about this page". */
  about?: string;
  /**
   * The way out, when her room IS the screen. On a phone the chat page shows
   * one room at a time, and every human conversation gets a back arrow from
   * the thread header — but her room replaces that header entirely, so it
   * has to carry its own. Passed only where somebody can actually be stuck:
   * the phone's chat page. The dock never passes it — it has its own close.
   */
  onBack?: () => void;
}) {
  const caps = useMiraCapabilities();
  /**
   * SHE REMEMBERS TODAY.
   *
   * This was `useState<Turn[]>([])`: open a hub, come back, and the thread was
   * empty — including whatever she had just offered to do. For a surface whose
   * pitch is "tell me and I'll do it", forgetting the previous sentence is not
   * a missing feature, it is a broken promise.
   *
   * The lazy initialiser matters. Reading storage in an effect would render an
   * empty thread first and then flash the history in, which reads as a bug even
   * though it settles correctly.
   */
  /**
   * ONE MIRA, TWO TABS — AND TWO THREADS. Friend is the companion — the
   * chart, the numbers, the listening ear. City assistant is the operator
   * she has always been. The owner's call, made looking at one merged
   * transcript: a heart-to-heart and "take me to budgets" do not belong in
   * the same scroll, so each tab keeps its own day (day.ts rooms). The seed,
   * the mood and the meter stay shared — she is one person with two rooms,
   * not two people. The tab is remembered; opened OVER a page she arrives as
   * the assistant, which is plainly what was asked for.
   */
  const [mode, setMode] = useState<'friend' | 'city'>(() => openingMode(about));
  const [turns, setTurns] = useState<StoredTurn[]>(() => seedWelcome(loadDay(undefined, openingMode(about)), openingMode(about)));
  const [draft, setDraft] = useState('');
  const [distressLocked, setDistressLocked] = useState(false);
  const pickMode = (m: 'friend' | 'city') => {
    if (m === mode) return;
    setMode(m);
    // The other room's day, and none of this one's held question — an answer
    // to a question asked in the other tab would be read against the wrong
    // conversation.
    setTurns(seedWelcome(loadDay(undefined, m), m));
    pending.current = undefined;
    try { window.localStorage.setItem(MODE_KEY, m); } catch { /* a preference, not data */ }
  };
  /**
   * THE METER, WHEN THE SERVER MENTIONS IT. `freeLeft` is null for a
   * subscriber — unmetered, never rendered as "0 left". `paywalled` puts the
   * subscribe card under her last line; it is not persisted, because the
   * server re-answers with the same card on the next attempt anyway and a
   * stale local copy of a billing fact is worse than asking again.
   */
  const [freeLeft, setFreeLeft] = useState<number | null | undefined>(undefined);
  const [paywalled, setPaywalled] = useState(false);
  const subscribe = useMiraSubscribe();
  /**
   * WHAT SHE JUST ASKED, HELD FOR ONE TURN.
   *
   * When her reply was a question she sends the options with it; they come
   * straight back on the next ask so a one-word answer is read as an answer.
   * Kept in a ref rather than in state because nothing renders from it and a
   * re-render between typing and sending would be a race for the wrong reason.
   */
  const pending = useRef<Choice[] | undefined>(undefined);
  /**
   * ONE SEED, AND IT LASTS THE DAY.
   *
   * It was `Math.random()` in a ref, so she was a different character on every
   * page load — announce one mood, refresh, get another. It also has to be the
   * number the GREETING uses, or the badge says "Wide awake and slightly
   * dangerous" and the next answer arrives quiet.
   */
  const seed = useRef(daySeed());
  /** Asked ONCE per mount, because asking is what marks the day as greeted. */
  const firstOfDay = useRef(firstOpenToday());
  const ask = useMiraAsk({ weeksKnown, dial, distressLocked, seed: seed.current });
  const endRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);

  const speech = useSpeech();
  const greeting = useMiraGreeting({
    hour: new Date().getHours(), seed: seed.current, weeksKnown,
    firstOfDay: firstOfDay.current, dial, distressLocked,
  });

  useEffect(() => { saveDay(turns, undefined, mode); }, [turns, mode]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || ask.isPending) return;
    const recent = turns.filter((t) => t.who === 'you').slice(-3).map((t) => t.text).reverse();
    // The day's transcript, both voices, oldest first — her context. Without
    // it "just feeling lonely" arrives as a sentence from nowhere, which is
    // the exact conversation the owner screenshotted.
    const history = turns.slice(-12).map((t) => ({ who: t.who === 'you' ? ('me' as const) : ('mira' as const), text: t.text }));
    setTurns((t) => [...t, { who: 'you', text: clean }]);
    setDraft('');
    try {
      const reply = await ask.mutateAsync({ text: clean, recent, answering: pending.current, history, mode, page: about });
      pending.current = reply.choices?.length ? reply.choices : undefined;
      if (reply.levity === 0 && reply.lane === 'LISTEN') setDistressLocked(true);
      if (reply.pass) setFreeLeft(reply.pass.freeLeft);
      setPaywalled(Boolean(reply.paywall));
      setTurns((t) => [...t, { who: 'mira', text: reply.text, levity: reply.levity, goto: reply.goto }]);
      speech.speak(reply.text);
    } catch (err) {
      pending.current = undefined;
      /**
       * TWO FAILURES, AND THEY ARE NOT THE SAME SENTENCE.
       *
       * This was one `catch` saying "I'm not reaching the city right now" — and
       * that line is a LIE in the case that actually happened: the API answered,
       * correctly and quickly, and the client threw because the reply carried a
       * field the schema had just been taught to require. Mira told the owner
       * the city was down while the city was fine.
       *
       * This codebase makes every other surface say what is true when it fails.
       * Hers has to as well, and it costs one `instanceof`. The console line is
       * the other half: a caught error with no trace turns a five-minute
       * diagnosis into an afternoon of guessing, which is what it cost here.
       */
      const stale = err instanceof ZodError;
      if (stale) console.warn('[mira] reply did not match the schema — API and web app are on different versions', err.issues);
      setTurns((t) => [...t, {
        who: 'mira',
        text: stale
          ? 'I heard the city, but we are not speaking the same language yet. Give the update a minute to land.'
          : 'I’m not reaching the city right now. Try me in a minute?',
        levity: 0,
      }]);
    }
  };

  /**
   * A VOICE NOTE LANDS IN THE COMPOSER, IT DOES NOT SEND ITSELF.
   *
   * The old hook sent on the recogniser's first final transcript, so a pause to
   * think committed half a sentence and there was no way to fix a misheard
   * word. Now it fills the box and puts the cursor at the end. One extra tap,
   * and the tap is where you catch "Piya" for "Priya".
   */
  const note = useVoiceNote((heard) => {
    setDraft((d) => (d ? `${d} ${heard}` : heard));
    box.current?.focus();
  });

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, ask.isPending]);

  const state: MarkState =
    ask.isPending ? 'thinking'
      : speech.speaking ? 'speaking'
        : note.recording ? 'listening'
          : turns.length ? 'waiting' : 'listening';

  return (
    <div className="mirathread">
      {/* The two of her, one press apart. Chips, not a router — the thread
          and the day's memory are shared; only her register changes. */}
      <div className="miratabs">
        {onBack && (
          <button type="button" className="mira-back" aria-label="Back to chats"
            onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
        <div role="group" aria-label="Which Mira" style={{ display: 'contents' }}>
        <button type="button" className={`miratab${mode === 'friend' ? ' on' : ''}`}
          aria-pressed={mode === 'friend'} onClick={() => pickMode('friend')}>
          Friend
        </button>
        <button type="button" className={`miratab${mode === 'city' ? ' on' : ''}`}
          aria-pressed={mode === 'city'} onClick={() => pickMode('city')}>
          City assistant
        </button>
        </div>
      </div>
      <div className="miraturns">
        {/* The opening is the empty state, not a permanent banner. Once there is
            a conversation, the promise has been kept or broken and repeating it
            above the evidence is noise. */}
        {turns.length === 0 && (
          <div className="miraopen">
            <MiraMark size={104} state={state} />
            {/* ── WHICH MIRA TURNED UP ──────────────────────────────────────
                Her mood, in her own words, on the FIRST open of the day and not
                after — somebody who opens the app nine times before lunch does
                not need telling nine times what kind of day she is having. That
                is a catchphrase, and catchphrases are how a character dies.
                `greet()` decides; this only renders what it returns, and it
                returns an empty string on every later open.

                After a hard session it is "Here." — honest, short, and not a
                performance. That is the whole of what L0 permits. */}
            {greeting.data?.hello && <p className="miramood">{greeting.data.hello}</p>}
            {/* The big line. Hers when the greeting arrives, and the plain one
                when it does not: a greeting that fails is a quieter opening,
                never an error in front of somebody. */}
            {greeting.data?.ask && <p className="miraask">{greeting.data.ask}</p>}
            {/* The capability rundown is the ASSISTANT's introduction — the
                owner's call: "I'm here, what do you need" belongs to the city
                tab. The friend's introduction is the welcome bubble, and an
                empty friend tab after that keeps just the mark and her mood. */}
            {mode === 'city' && <p className="miraopentext">{opening((caps.data ?? []).map((c) => c.intent.toLowerCase()))}</p>}
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`miraturn ${t.who}`}>
            <div className="mirabub">
              {t.text}
              {t.goto && (
                <Link className="miragoto" to={t.goto.path}>Take me to {t.goto.label} →</Link>
              )}
            </div>
          </div>
        ))}
        {ask.isPending && <div className="miraturn mira"><div className="mirabub mirawait">Give me a second.</div></div>}

        {/* THE SUBSCRIBE CARD, under her own explanation of the meter. The
            price is on the key itself — a charge may only ever follow a press
            that named its amount. Mira cannot spend money; this is the
            citizen doing it, through the same wallet rail as every checkout
            in the city, and a refusal (an empty wallet) is shown in her
            thread in the rail's own words rather than swallowed. */}
        {paywalled && (
          <div className="miraturn mira">
            <div className="mirabub">
              <button
                type="button"
                className="mirasub"
                disabled={subscribe.isPending}
                onClick={() => {
                  void subscribe.mutateAsync()
                    .then(() => {
                      setPaywalled(false);
                      setFreeLeft(null);
                      setTurns((t) => [...t, { who: 'mira', text: 'Done — we’re good for 30 days. Now, where were we?', levity: 2 }]);
                    })
                    .catch((err: unknown) => {
                      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                      setTurns((t) => [...t, {
                        who: 'mira',
                        text: typeof msg === 'string' && msg.trim() ? msg : 'The wallet didn’t answer. Try again in a minute?',
                        levity: 0,
                      }]);
                    });
                }}>
                {subscribe.isPending ? 'A moment…' : 'Subscribe · ₹999 for 30 days'}
              </button>
              <Link className="miragoto" to="/financial">Top up the wallet first →</Link>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* The meter, mentioned only once it is worth mentioning. null is a
          subscriber — unmetered — and silence is the honest render of that. */}
      {typeof freeLeft === 'number' && freeLeft > 0 && freeLeft <= 25 && !paywalled && (
        <p className="miranote">{freeLeft} free conversation{freeLeft === 1 ? '' : 's'} left · then ₹999 a month</p>
      )}

      {/* WHAT SHE KEEPS, SAID OUT LOUD. The history lives in this browser and
          ends at midnight. `one-bag.test.ts` bans localStorage for the shopping
          bag on the grounds that a bag in the browser is a bag one device knows
          about — the same objection applies here, so the answer is to state the
          limit rather than let somebody find it by opening their phone. */}
      {turns.length > 0 && (
        <p className="miranote">
          Today, on this device — it clears itself at midnight.{' '}
          <button type="button" className="miraforget" onClick={() => { clearDay(mode); setTurns([]); pending.current = undefined; }}>
            Forget today
          </button>
        </p>
      )}

      {note.recording ? (
        /* Recording is its own bar, not a state of the composer. A blinking dot
           where the text box was is how you end up sending a half-transcript by
           reflex; a different shape makes "I am recording" unmissable, and puts
           Discard as far from Done as the row allows. */
        <div className="mirarec" role="status" aria-live="polite">
          <span className="mirarecdot" aria-hidden />
          <span className="mirarectime">{mmss(note.seconds)}</span>
          <span className="mirarectext">{note.text || 'Listening…'}</span>
          <button type="button" className="mirarecdrop" onClick={note.cancel}>Discard</button>
          <button type="button" className="mirarecdone" onClick={note.stop}>Done</button>
        </div>
      ) : (
        <form className="miracomposer" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
          <input
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={mode === 'friend' ? 'Talk to me…' : 'Tell me what you need…'}
            aria-label="Tell Mira what you need"
            autoComplete="off"
          />
          {speech.supported && (
            <button
              type="button"
              className={`miraspeak${speech.on ? ' on' : ''}`}
              onClick={speech.speaking ? speech.hush : speech.toggle}
              aria-pressed={speech.on}
              aria-label={speech.on ? 'Stop Mira speaking her replies' : 'Let Mira speak her replies'}
              title={speech.on ? 'Mira speaks her replies' : 'Mira is silent'}
            >
              {/* THE ICON IS THE STATE, because nothing else here is.
                  A megaphone stood here first and the owner asked what the
                  button did — which is the only review a control icon ever
                  gets, and it failed. A crossed-out speaker says "she is
                  silent" without a tooltip, a label, or a guess. */}
              <Icon name={speech.on ? 'speak' : 'mute'} size={16} aria-hidden />
            </button>
          )}
          {note.supported && (
            <button
              type="button"
              className="miramic"
              onClick={note.start}
              aria-label="Record a voice note for Mira"
            >
              <span><i /><i /><i /><i /><i /></span>
            </button>
          )}
          <button type="submit" disabled={!draft.trim() || ask.isPending}>Send</button>
        </form>
      )}
    </div>
  );
}
