import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMiraAsk, useMiraCapabilities, type MiraReply } from './api';
import { MiraMark, type MarkState } from './MiraMark';
import { useDictation } from './useDictation';

interface Turn {
  who: 'you' | 'mira';
  text: string;
  levity?: MiraReply['levity'];
  goto?: MiraReply['goto'];
}

/**
 * The opening, built from the manifest rather than written by hand.
 *
 * A greeting that promises ordering while the executor has no branch that
 * writes is the exact failure this codebase exists to avoid — and a
 * hand-written promise rots the day somebody adds a capability and forgets the
 * copy. So the last sentence is generated: it lists what is actually
 * decorated, and it grows on its own.
 */
function opening(canDo: string[]): string {
  const head =
    'Tell me what you want done in the city and I’ll do it — you don’t need to know which page it lives on. ' +
    'Talking is enough; no hands needed.';
  if (!canDo.length) return head;
  const list = canDo.slice(0, 3).join(', ');
  return `${head} Right now that means ${list} — and taking you anywhere you ask for. Booking and paying come next; I’ll say so rather than pretend.`;
}

export function MiraThread({ weeksKnown = 0, dial }: { weeksKnown?: number; dial?: 0 | 1 | 2 }) {
  const caps = useMiraCapabilities();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [distressLocked, setDistressLocked] = useState(false);
  const ask = useMiraAsk({ weeksKnown, dial, distressLocked });
  const endRef = useRef<HTMLDivElement>(null);

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || ask.isPending) return;
    const recent = turns.filter((t) => t.who === 'you').slice(-3).map((t) => t.text).reverse();
    setTurns((t) => [...t, { who: 'you', text: clean }]);
    setDraft('');
    try {
      const reply = await ask.mutateAsync({ text: clean, recent });
      if (reply.levity === 0 && reply.lane === 'LISTEN') setDistressLocked(true);
      setTurns((t) => [...t, { who: 'mira', text: reply.text, levity: reply.levity, goto: reply.goto }]);
    } catch {
      setTurns((t) => [...t, { who: 'mira', text: "I’m not reaching the city right now. Try me in a minute?", levity: 0 }]);
    }
  };

  // Hands-free. The platform's own recogniser — on-device, free at every
  // volume, and no vendor. `send` fires on the final transcript, so speaking a
  // sentence and stopping is the whole interaction.
  const dictation = useDictation((heard) => void send(heard));

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, ask.isPending]);

  const state: MarkState =
    ask.isPending ? 'thinking' : dictation.listening ? 'speaking' : turns.length ? 'waiting' : 'listening';

  return (
    <div className="mirathread">
      <div className="miraturns">
        <div className="miraopen">
          <MiraMark size={104} state={state} />
          <p className="miraopentext">{opening((caps.data ?? []).map((c) => c.intent.toLowerCase()))}</p>
        </div>

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

      <form className="miracomposer" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
        <input
          value={dictation.listening ? dictation.interim || 'Listening…' : draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Tell me what you need…"
          aria-label="Tell Mira what you need"
          autoComplete="off"
          readOnly={dictation.listening}
        />
        {dictation.supported && (
          <button
            type="button"
            className={`miramic${dictation.listening ? ' on' : ''}`}
            onClick={dictation.toggle}
            aria-pressed={dictation.listening}
            aria-label={dictation.listening ? 'Stop talking to Mira' : 'Talk to Mira'}
          >
            <span><i /><i /><i /><i /><i /></span>
          </button>
        )}
        <button type="submit" disabled={!draft.trim() || ask.isPending}>Send</button>
      </form>
    </div>
  );
}
