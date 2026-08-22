import { useEffect, useRef, useState } from 'react';
import { ZodError } from 'zod';
import { Link } from 'react-router-dom';
import { FREE_CHATS, SUB_INR, useMiraAsk, useMiraCapabilities, useMiraGreeting, useMiraSubscribe, useMiraThread, type Choice } from './api';
import { Icon } from '@/components/ui/Icon';
import { MiraMark, type MarkState } from './MiraMark';
import { useVoiceNote, useSpeech } from './voice';
import { clearDay, daySeed, firstOpenToday, loadDay, saveDay, turnId, type StoredTurn } from './day';

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
/**
 * ── THERE IS ONE ROOM NOW ─────────────────────────────────────────────────
 *
 * The chips are gone and the register is inferred per turn on the server, so
 * nothing on this screen chooses which Mira is listening. `ROOM` is the key
 * her day and her record have always been under — the value is kept, and only
 * the value, so no citizen's history moves on the morning of the merge.
 *
 * `storedMode()` and `MODE_KEY` stay readable for one reason: `mira.mode` is
 * still in people's browsers and this is where somebody will come looking for
 * it. Nothing calls them.
 */
const ROOM = 'city';
void storedMode;

/** When "Forget today" was last pressed in a room, ON THIS DEVICE. The
 *  server thread hydrates only what was said after it, so a cleared screen
 *  stays cleared here while the record — and every other device — keeps the
 *  history. Deleting the record itself is the forget command's job. */
const clearedAt = (): number => {
  // EITHER MARKER HOLDS. These were per room; with one thread on screen, a
  // "Forget today" pressed in the old friend tab must still hide those turns,
  // or the merge resurrects a conversation somebody deliberately cleared.
  try {
    const f = Number(window.localStorage.getItem('mira.cleared.friend') ?? 0) || 0;
    const c = Number(window.localStorage.getItem('mira.cleared.city') ?? 0) || 0;
    return Math.max(f, c);
  } catch { return 0; }
};

/**
 * HER FIRST MESSAGE AS A FRIEND — A HELLO, NOT A TERMS SHEET.
 *
 * It was twenty-three lines delivered instantly as one wall, and the first
 * thing in it was the message quota, followed by a paragraph about a privacy
 * framework. Nobody says either of those things on being introduced. The quota
 * is a fact about the meter and now lives with the meter, at the foot of the
 * thread; the privacy sentence is the product's to make, in the product's own
 * voice, on the page where it is true — not a promise she makes about herself
 * in the first breath.
 *
 * AND ONE SENTENCE HAD TO GO BECAUSE THE SCREEN CONTRADICTED IT. "You don't
 * have to figure out which version of me you need" was rendered four
 * centimetres under two chips that force exactly that choice, with a separate
 * transcript behind each. A promise the widget above it falsifies costs more
 * than the promise was worth.
 */
/*
   AND THE SENTENCE CAME BACK. "You don't have to figure out which version of
   me you need" was cut because two chips four centimetres above it made it
   false. The chips are gone, so it is true, and it is the most useful thing
   she can say in her first breath.
*/
const WELCOME = `Hey. I’m Mira. 👋 Your buddy in Together City.
Talk to me however you like — you don’t have to figure out which version of me you need.`;

/** A record written before turns carried ids is still a record, and one bubble
 *  with no key is a whole list keyed by position again. Named here rather than
 *  inside `loadDay`, which owes its callers back exactly what it was handed. */
const named = (turns: StoredTurn[]): StoredTurn[] =>
  turns.map((t) => (t.id ? t : { ...t, id: turnId() }));

const WELCOMED_KEY = 'mira.welcomed';
/** Seeded with her hello exactly once per device. Was friend-room only; with
 *  one room, a citizen who never opened that tab was never introduced to her. */
const seedWelcome = (turns: StoredTurn[]): StoredTurn[] => {
  if (turns.length > 0) return turns;
  try {
    if (window.localStorage.getItem(WELCOMED_KEY)) return turns;
    window.localStorage.setItem(WELCOMED_KEY, '1');
  } catch { return turns; }
  return [{ id: turnId(), who: 'mira', text: WELCOME, levity: 2 }];
};

/**
 * THE RECORD ARRIVES AS AN ADDITION, NOT AS A REPLACEMENT.
 *
 * Hydration used to map the server's turns to `{ who, text }` and hand the
 * result to `setTurns` — three destructions in one line. It dropped every
 * `goto`, so "Take me to Budgets" became a dead sentence on reload; it dropped
 * `levity`; and it replaced the array, which deleted the welcome bubble while
 * leaving `mira.welcomed` set, so her introduction was gone and could never
 * come back on that device.
 *
 * So: the record decides the ORDER and the CONTENT, this device keeps what the
 * record does not store — anything it holds that the record has not got (her
 * welcome, a sentence typed while the request was in the air) stays at the
 * front, and every turn the record does know about is taken back with the
 * navigation and the levity this device remembers against it.
 */
const sameTurn = (t: { who: string; text: string }): string => `${t.who} ${t.text}`;

function merge(mine: StoredTurn[], theirs: StoredTurn[]): StoredTurn[] {
  const onRecord = new Set(theirs.map(sameTurn));
  const remembered = new Map(mine.map((t) => [sameTurn(t), t]));
  return [
    ...mine.filter((t) => !onRecord.has(sameTurn(t))),
    ...theirs.map((t) => remembered.get(sameTurn(t)) ?? t),
  ];
}

/**
 * WHAT ACTUALLY WENT WRONG, IN A SENTENCE THAT IS NOT HERS.
 *
 * Two strings covered a 500, a 401, a timeout, a rate limit and a CORS
 * failure, and both were pushed into the transcript AS MIRA — persisted with
 * everything else, so a dropped connection came back on the next reload as
 * something she had said. A network error is not a turn in a conversation.
 *
 * This is rendered as a system row and never stored, and it names the failure
 * it actually is, because "try me in a minute" is useless advice for a session
 * that has expired and wrong advice for a request nobody sent.
 */
function whyFailed(err: unknown): string {
  if (err instanceof ZodError) {
    return 'I heard the city, but we are not speaking the same language yet — the app and the server are on different versions. Give the update a minute to land.';
  }
  const e = err as { code?: string; message?: string; response?: { status?: number } };
  if (e?.code === 'ERR_CANCELED') return 'Stopped.';
  const status = e?.response?.status;
  if (status === 401 || status === 403) return 'Your session has expired. Sign in again and I’ll pick this up.';
  if (status === 429) return 'Too many messages too fast. Give it a moment.';
  if (status && status >= 500) return 'The city answered with an error. It is not you, and it is not the connection.';
  // No status at all: the request never reached anything that could answer —
  // a dead connection, a timeout, or a browser refusing the origin.
  if (e?.code === 'ECONNABORTED') return 'That took too long and I stopped waiting. Try again?';
  return 'I’m not reaching the city right now. Check the connection and try again?';
}

export function MiraThread({ dial, about, onBack }: {
  dial?: 0 | 1 | 2;
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
   * ONE MIRA, ONE THREAD. The two chips forced the citizen to answer a question
   * they had no way to answer — which of her two rooms a sentence belongs in —
   * and then split their history down the middle on the strength of the guess.
   * Both rooms failed the same question on the day this was reversed.
   *
   * `mode` is a constant rather than a deleted variable on purpose: it still
   * rides out on the ask (an older server reads it) and it still names the
   * storage key. It is no longer something anybody chooses.
   */
  const mode = ROOM;
  const [turns, setTurns] = useState<StoredTurn[]>(() => seedWelcome(named(loadDay())));
  const [draft, setDraft] = useState('');
  /**
   * The last failure, held OUTSIDE the transcript and cleared by the next
   * sentence. See `whyFailed` — an error is a thing the app is telling you,
   * not a thing she said, and it may not be persisted as one.
   */
  const [failure, setFailure] = useState<{ why: string; held: string } | null>(null);
  /**
   * THE METER, WHEN THE SERVER MENTIONS IT. `freeLeft` is null for a
   * subscriber — unmetered, never rendered as "0 left". `paywall` below puts
   * the subscribe card under her last line; it is not persisted, because the
   * server re-answers with the same card on the next attempt anyway and a
   * stale local copy of a billing fact is worse than asking again.
   */
  const [freeLeft, setFreeLeft] = useState<number | null | undefined>(undefined);
  /**
   * THE WALL KEEPS THE MESSAGE THAT HIT IT.
   *
   * It used to be a boolean, and the sentence that ran out of meter was gone:
   * subscribe, then type it again from memory. It is held here and sent the
   * moment the wallet answers.
   *
   * `said` is her explanation of the meter, and it is shown INSIDE the card
   * rather than pushed into the thread — it was persisted as an ordinary Mira
   * line and read aloud, so a billing notice came back on the next reload as
   * part of the conversation, in her voice, out loud.
   */
  const [paywall, setPaywall] = useState<{ said: string; held: string } | null>(null);
  const subscribe = useMiraSubscribe();

  /**
   * THE THREAD FOLLOWS THE ACCOUNT. "user data on mobile and site should be
   * same" — the owner, holding a phone showing one conversation beside a
   * laptop showing another. The record on the server (her memory) is now
   * also the screen's source: on open, each room hydrates from it, and the
   * device's day store becomes the offline fallback rather than the truth.
   *
   * Three guards keep it honest. HYDRATE ONCE per room per visit — a
   * refetch must never rewrite a scroll somebody is reading. NEVER OVER A
   * CONVERSATION IN PROGRESS — if they typed before the server answered,
   * their turn wins and the record catches up next visit. AND "FORGET
   * TODAY" HOLDS — clearing marks the moment on this device, and hydration
   * only shows what was said after it, so a cleared thread does not
   * resurrect on the next open (the record itself is untouched; deleting it
   * is the forget command's job, and hers).
   */
  const serverThread = useMiraThread(mode);
  const hydrated = useRef<{ friend: boolean; city: boolean }>({ friend: false, city: false });
  /**
   * PER ROOM, BECAUSE ONE SENTENCE USED TO LOCK BOTH.
   *
   * `spoke` was a single flag, so saying one thing to the friend meant the
   * city assistant never hydrated again for the rest of that session — switch
   * tab and the record was simply not there, on the surface whose entire
   * promise is the same conversation on every device.
   */
  const spoke = useRef<{ friend: boolean; city: boolean }>({ friend: false, city: false });
  useEffect(() => {
    const data = serverThread.data;
    if (!data || hydrated.current[mode] || spoke.current[mode]) return;
    hydrated.current[mode] = true;
    const kept = data.turns
      .filter((t) => new Date(t.at).getTime() > clearedAt())
      .map((t) => ({ id: turnId(), who: t.who, text: t.text }));
    if (kept.length) setTurns((mine) => merge(mine, kept));
  }, [serverThread.data, mode]);
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
   * ONE SEED, AND IT IS NOT THIS BROWSER'S TO CHOOSE.
   *
   * It was `Math.random()` in a ref, then the day XOR a per-device salt — which
   * fixed the refresh and left the real problem: a salt kept in one browser is
   * a different Mira on the phone than on the laptop, on the same afternoon,
   * and a cleared cache changes her in the middle of a conversation.
   *
   * The server derives it from the citizen now and returns the one it used on
   * every reply and on the greeting, so this holds the ANSWER rather than the
   * guess. `daySeed()` survives as the first paint only — the number the screen
   * carries in the second before anything has answered.
   */
  const seed = useRef(daySeed());
  const [heldSeed, setHeldSeed] = useState(seed.current);
  /** Asked ONCE per mount, because asking is what marks the day as greeted. */
  const firstOfDay = useRef(firstOpenToday());
  const ask = useMiraAsk({ dial, seed: heldSeed });
  const endRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /** The way to stop a request that is not coming back. See `send`. */
  const inFlight = useRef<AbortController | null>(null);

  const speech = useSpeech();
  const greeting = useMiraGreeting({
    hour: new Date().getHours(), seed: seed.current,
    firstOfDay: firstOfDay.current, dial,
  });
  // The seed the server named, adopted for every turn after it. The greeting is
  // not re-keyed on it (see api.ts), so this settles once and does not re-roll
  // the opening line under somebody who is already reading it.
  const said = greeting.data?.seed;
  useEffect(() => { if (typeof said === 'number') setHeldSeed(said); }, [said]);

  useEffect(() => { saveDay(turns); }, [turns]);

  /**
   * `echo` is what makes the paywall's re-send possible: the citizen's line is
   * already on screen from the attempt that hit the wall, and adding it twice
   * would read as having said it twice.
   */
  const send = async (text: string, echo = true) => {
    const clean = text.trim();
    if (!clean || ask.isPending) return;
    // From here the conversation on screen is live — a hydration arriving
    // late must not rewrite it out from under them.
    spoke.current[mode] = true;
    setFailure(null);
    const recent = turns.filter((t) => t.who === 'you').slice(-3).map((t) => t.text).reverse();
    // The day's transcript, both voices, oldest first — her context. Without
    // it "just feeling lonely" arrives as a sentence from nowhere, which is
    // the exact conversation the owner screenshotted.
    const history = turns.slice(-12).map((t) => ({ who: t.who === 'you' ? ('me' as const) : ('mira' as const), text: t.text }));
    if (echo) setTurns((t) => [...t, { id: turnId(), who: 'you', text: clean }]);
    setDraft('');
    // A request nobody can stop is a disabled composer with no way out of it.
    const stop = new AbortController();
    inFlight.current = stop;
    try {
      const reply = await ask.mutateAsync({ text: clean, recent, answering: pending.current, history, mode, page: about, signal: stop.signal });
      pending.current = reply.choices?.length ? reply.choices : undefined;
      if (typeof reply.seed === 'number') setHeldSeed(reply.seed);
      if (reply.pass) setFreeLeft(reply.pass.freeLeft);
      if (reply.paywall) {
        // The meter answering is not a turn: it is not stored, not spoken, and
        // it keeps the sentence it interrupted so subscribing can finish it.
        setPaywall({ said: reply.text, held: clean });
        return;
      }
      setPaywall(null);
      setTurns((t) => [...t, { id: turnId(), who: 'mira', text: reply.text, levity: reply.levity, goto: reply.goto }]);
      speech.speak(reply.text);
    } catch (err) {
      pending.current = undefined;
      /**
       * THE FAILURE IS NAMED, AND IT IS NOT SAID IN HER VOICE.
       *
       * Two strings covered every way this can fail, and the offline one is a
       * LIE in the case that actually happened: the API answered, correctly and
       * quickly, and the client threw because the reply carried a field the
       * schema had just been taught to require. Mira told the owner the city
       * was down while the city was fine. `whyFailed` is the rest of that
       * argument, and the row it lands in is visibly not a bubble.
       *
       * The console line is the other half: a caught error with no trace turns
       * a five-minute diagnosis into an afternoon of guessing.
       */
      if (err instanceof ZodError) {
        console.warn('[mira] reply did not match the schema — API and web app are on different versions', err.issues);
      }
      setFailure({ why: whyFailed(err), held: clean });
    } finally {
      inFlight.current = null;
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

  /**
   * The box grows with what is in it, up to five lines or so. Without this the
   * paragraph the microphone hands over is read through a one-line window.
   *
   * AND THE BORDER IS ADDED BACK, WHICH IS NOT A DETAIL. `scrollHeight` is
   * content plus padding and does NOT include the border. The app sets
   * `box-sizing: border-box` on everything, so assigning that number to
   * `height` sizes the BORDER box to content + padding — leaving the content
   * area two pixels short of what it just measured. The textarea therefore
   * overflowed by exactly its own border, always, at every length, and drew a
   * scrollbar down the side of an empty one-line composer on any platform that
   * does not use overlay scrollbars.
   *
   * Read off the element rather than written as `+ 2`: the border is a token
   * and a token can change.
   */
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const border = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + border, 132)}px`;
  }, [draft]);

  /** Somebody who asked their system for less movement asked this scroll too.
   *  Read at the moment of the scroll rather than once, because the preference
   *  can change while a tab is open. */
  useEffect(() => {
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    endRef.current?.scrollIntoView({ behavior: still ? 'auto' : 'smooth' });
  }, [turns.length, ask.isPending]);

  const state: MarkState =
    ask.isPending ? 'thinking'
      : speech.speaking ? 'speaking'
        : note.recording ? 'listening'
          : turns.length ? 'waiting' : 'listening';

  /**
   * THE OPENING IS THE EMPTY STATE, AND THE FRIEND'S ROOM IS NEVER EMPTY.
   *
   * It was gated on `turns.length === 0`, and `seedWelcome` puts a bubble in
   * `turns` — so the friend tab was never empty from its very first paint, and
   * the mood badge and the big greeting line were skipped for ever. The request
   * still fired, on every open, and the answer was thrown away.
   *
   * What the opening actually means is "nobody has said anything yet", and her
   * own hello is not somebody saying something.
   */
  const untouched = !turns.some((t) => t.who === 'you');

  return (
    <div className="mirathread">
      {/* ── THE HEADER IS A WAY BACK, NOT A CHOICE ──────────────────────
          Two `role="tab"` chips stood here and the transcript changed behind
          them. They are gone: she is one person, the register is inferred per
          turn on the server, and the citizen no longer has to classify their
          own sentence before saying it. The back arrow stays — on a phone her
          room replaces the thread header entirely, so without it there is no
          way out. */}
      <div className="miratabs">
        {onBack && (
          <button type="button" className="mira-back" aria-label="Back to chats"
            onClick={onBack}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
        )}
      </div>
      {/* A LOG, SO A REPLY ARRIVING IS ANNOUNCED.
          Nothing told a screen-reader user that she had answered: the bubble
          appeared, silently, below a composer they were still standing in.
          `polite` rather than `assertive` — she is not an alarm.

          It is a log and not a `tabpanel`, and that is a choice rather than an
          oversight: one element gets one role, and of the two, being told the
          answer arrived matters more than being told the scroll is a panel.
          It named itself through the tabs' `aria-controls` and there are no
          tabs now, so it carries its own name. */}
      <div className="miraturns" id="miraturns" role="log" aria-live="polite"
        aria-label="Conversation with Mira">
        {/* The opening is the empty state, not a permanent banner. Once there is
            a conversation, the promise has been kept or broken and repeating it
            above the evidence is noise. */}
        {untouched && (
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
            {/* WHAT SHE CAN ACTUALLY DO, ON THE WAY IN.
                This was the city tab's introduction and the friend tab did not
                get it. With one room it is shown to everybody — and it is the
                thing the chips were doing honestly: setting an expectation
                about what happens to what you are about to say. It is built
                from the live capability list, so it cannot promise something
                she has not got. */}
            <p className="miraopentext">{opening((caps.data ?? []).map((c) => c.intent.toLowerCase()))}</p>
          </div>
        )}

        {/* KEYED BY THE TURN, NOT BY WHERE IT HAPPENS TO SIT. The array is
            replaced on hydration and again on every tab switch, and an index
            key tells React the third bubble is still the third bubble — so it
            moves the TEXT between two bubbles rather than moving the bubbles.
            Who said it is in the class name and nowhere else, which to a
            screen reader is nowhere at all, so each one says so in words. */}
        {turns.map((t) => (
          <div key={t.id} className={`miraturn ${t.who}`}>
            <div className="mirabub">
              <span className="mirasr">{t.who === 'mira' ? 'Mira said: ' : 'You said: '}</span>
              {t.text}
              {t.goto && (
                <Link className="miragoto" to={t.goto.path}>Take me to {t.goto.label} →</Link>
              )}
            </div>
          </div>
        ))}
        {/* THE WAIT IS NOT A SENTENCE. "Give me a second." was emitted verbatim
            on every single turn — a fixed catchphrase, which is the thing this
            room's own comments call the way a character dies. A mark holds the
            place instead; the reader is told in words that are plainly the
            app's rather than hers. */}
        {ask.isPending && (
          <div className="miraturn mira">
            <div className="mirabub mirawait">
              <span className="mirasr">Mira is thinking</span>
              <span aria-hidden>· · ·</span>
            </div>
          </div>
        )}

        {/* A FAILURE IS NOT ONE OF HER TURNS. Its own row, visibly not a
            bubble, never written to the day store — a dropped connection that
            comes back on the next reload as something she said is a lie the
            record cannot take back. */}
        {failure && (
          <div className="mirasys" role="status">
            {failure.why}{' '}
            {/* The sentence is still on screen and still theirs — the retry
                sends that one rather than asking them to type it again. */}
            <button type="button" className="miraforget" onClick={() => { void send(failure.held, false); }}>
              Try again
            </button>
          </div>
        )}

        {/* THE SUBSCRIBE CARD, WITH HER EXPLANATION OF THE METER INSIDE IT
            rather than pushed into the transcript above it. The explanation
            was a stored Mira bubble and was read out loud, so a billing notice
            came back on every reload as part of the conversation. It is the
            same words; it is no longer a turn.

            The price is on the key itself — a charge may only ever follow a
            press that named its amount. Mira cannot spend money; this is the
            citizen doing it, through the same wallet rail as every checkout in
            the city, and a refusal (an empty wallet) is shown in the rail's own
            words rather than swallowed. */}
        {paywall && (
          <div className="mirasys">
            {paywall.said}
            <button
              type="button"
              className="mirasub"
              disabled={subscribe.isPending}
              onClick={() => {
                const held = paywall.held;
                void subscribe.mutateAsync()
                  .then(() => {
                    setPaywall(null);
                    setFreeLeft(null);
                    // AND THE MESSAGE THAT HIT THE WALL GOES THROUGH. It was
                    // dropped, so subscribing was followed by typing it again
                    // from memory. It is still on screen; it is not echoed.
                    void send(held, false);
                  })
                  .catch((err: unknown) => {
                    const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                    setFailure({
                      why: typeof msg === 'string' && msg.trim() ? msg : 'The wallet didn’t answer. Try again in a minute?',
                      held,
                    });
                  });
              }}>
              {subscribe.isPending ? 'A moment…' : `Subscribe · ₹${SUB_INR} for 30 days`}
            </button>
            <Link className="miragoto" to="/financial">Top up the wallet first →</Link>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* The meter, mentioned only once it is worth mentioning. null is a
          subscriber — unmetered — and silence is the honest render of that. */}
      {typeof freeLeft === 'number' && freeLeft > 0 && freeLeft <= 25 && !paywall && (
        <p className="miranote">
          {/* THE QUOTA IS SAID HERE, WHERE IT IS A FACT ABOUT THE METER, and
              not in her first sentence, where it was the first thing she told
              a stranger about herself. The whole number is named, so the count
              means something on the day it starts mattering. */}
          {freeLeft} of {FREE_CHATS} free conversations left · then ₹{SUB_INR} a month
        </p>
      )}

      {/* WHAT SHE KEEPS, SAID OUT LOUD — AND THE BUTTON UNDERNEATH IT DOES
          SOMETHING SMALLER THAN THE SENTENCE ABOVE IT PROMISED.
          "With your account, on every device." sat directly over a control
          that writes a marker into THIS browser: the record on the server is
          untouched and every other device still shows the conversation. Two
          true halves that read as one false claim, which is worse than either.
          Both are stated now, in the order somebody presses them. */}
      {turns.length > 0 && (
        <p className="miranote">
          Today’s conversation is kept with your account and shows on every device. Clearing takes it off this device only — she still has it.{' '}
          <button type="button" className="miraforget" onClick={() => {
            try { window.localStorage.setItem(`mira.cleared.${mode}`, String(Date.now())); } catch { /* view-only marker */ }
            clearDay(); setTurns([]); pending.current = undefined; setFailure(null);
          }}>
            Clear this screen
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
          {/* A BOX THAT GROWS, BECAUSE TWO MINUTES OF DICTATION LANDS IN IT.
              The microphone can hand over a paragraph, and the whole point of
              landing it here rather than sending it is that the word it
              misheard can be fixed — which was the hardest possible edit on a
              phone in a one-line input scrolled sideways. Enter still sends;
              Shift+Enter is the newline, as it is in every composer.
              `enterkeyhint` is what makes the phone's key say Send. */}
          {/* ONE PROMPT. Two placeholders asked the citizen to sort their own
              sentence before typing it, which is the thing the chips did and
              the thing being removed. */}
          <textarea
            ref={box}
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(draft); }
            }}
            placeholder="Talk to me…"
            aria-label="Message Mira"
            enterKeyHint="send"
            autoCapitalize="sentences"
            autoCorrect="on"
            autoComplete="off"
          />
          {speech.supported && (
            <button
              type="button"
              className={`miraspeak${speech.on ? ' on' : ''}`}
              /* ONE PRESS, WHATEVER SHE IS DOING. This was
                 `speech.speaking ? hush : toggle` — so stopping her mid-reply
                 silenced the sentence and left the switch ON, which is what
                 `aria-pressed` then went on announcing, and turning her off
                 took a second press. `toggle` cancels what is playing. */
              onClick={speech.toggle}
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
              /* BARGE-IN. Opening the microphone while she is talking pointed
                 the recogniser at the speaker and transcribed her own voice
                 back into the box. She stops when you start. */
              onClick={() => { speech.hush(); note.start(); }}
              aria-label="Record a voice note for Mira"
            >
              <span><i /><i /><i /><i /><i /></span>
            </button>
          )}
          {/* A REQUEST CAN BE STOPPED. The composer was disabled for the whole
              round trip with no cancel and no timeout, so a request that never
              comes back leaves a permanently dead Send and no way out of it. */}
          {ask.isPending ? (
            <button type="button" onClick={() => inFlight.current?.abort()}>Stop</button>
          ) : (
            <button type="submit" disabled={!draft.trim()}>Send</button>
          )}
        </form>
      )}
      {/* WHY THE MICROPHONE STOPPED. Every failure used to end with the
          recording bar simply vanishing — a blocked permission looked exactly
          like a silent room, and both looked like a broken button. */}
      {note.error && <p className="mirasys" role="status">{note.error}</p>}
    </div>
  );
}
