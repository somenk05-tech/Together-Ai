import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMiraAsk, useMiraCapabilities, type Choice } from './api';
import { Icon } from '@/components/ui/Icon';
import { MiraMark, type MarkState } from './MiraMark';
import { useVoiceNote, useSpeech } from './voice';
import { clearDay, loadDay, saveDay, type StoredTurn } from './day';

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

export function MiraThread({ weeksKnown = 0, dial }: { weeksKnown?: number; dial?: 0 | 1 | 2 }) {
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
  const [turns, setTurns] = useState<StoredTurn[]>(() => loadDay());
  const [draft, setDraft] = useState('');
  const [distressLocked, setDistressLocked] = useState(false);
  /**
   * WHAT SHE JUST ASKED, HELD FOR ONE TURN.
   *
   * When her reply was a question she sends the options with it; they come
   * straight back on the next ask so a one-word answer is read as an answer.
   * Kept in a ref rather than in state because nothing renders from it and a
   * re-render between typing and sending would be a race for the wrong reason.
   */
  const pending = useRef<Choice[] | undefined>(undefined);
  /** One seed for the life of the thread — her mood holds across a
   *  conversation, and a mood that re-rolls per message is whiplash. */
  const seed = useRef(Math.floor(Math.random() * 100_000));
  const ask = useMiraAsk({ weeksKnown, dial, distressLocked, seed: seed.current });
  const endRef = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLInputElement>(null);

  const speech = useSpeech();

  useEffect(() => { saveDay(turns); }, [turns]);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || ask.isPending) return;
    const recent = turns.filter((t) => t.who === 'you').slice(-3).map((t) => t.text).reverse();
    setTurns((t) => [...t, { who: 'you', text: clean }]);
    setDraft('');
    try {
      const reply = await ask.mutateAsync({ text: clean, recent, answering: pending.current });
      pending.current = reply.choices?.length ? reply.choices : undefined;
      if (reply.levity === 0 && reply.lane === 'LISTEN') setDistressLocked(true);
      setTurns((t) => [...t, { who: 'mira', text: reply.text, levity: reply.levity, goto: reply.goto }]);
      speech.speak(reply.text);
    } catch {
      pending.current = undefined;
      setTurns((t) => [...t, { who: 'mira', text: "I’m not reaching the city right now. Try me in a minute?", levity: 0 }]);
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
      <div className="miraturns">
        {/* The opening is the empty state, not a permanent banner. Once there is
            a conversation, the promise has been kept or broken and repeating it
            above the evidence is noise. */}
        {turns.length === 0 && (
          <div className="miraopen">
            <MiraMark size={104} state={state} />
            <p className="miraopentext">{opening((caps.data ?? []).map((c) => c.intent.toLowerCase()))}</p>
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
        <div ref={endRef} />
      </div>

      {/* WHAT SHE KEEPS, SAID OUT LOUD. The history lives in this browser and
          ends at midnight. `one-bag.test.ts` bans localStorage for the shopping
          bag on the grounds that a bag in the browser is a bag one device knows
          about — the same objection applies here, so the answer is to state the
          limit rather than let somebody find it by opening their phone. */}
      {turns.length > 0 && (
        <p className="miranote">
          Today, on this device — it clears itself at midnight.{' '}
          <button type="button" className="miraforget" onClick={() => { clearDay(); setTurns([]); pending.current = undefined; }}>
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
            placeholder="Tell me what you need…"
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
              {/* An icon, not an emoji. Icon.tsx has said so since it was
                  written: chrome uses the line icons; emoji stay for content,
                  reactions and things a citizen typed. */}
              <Icon name="megaphone" size={15} aria-hidden />
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
