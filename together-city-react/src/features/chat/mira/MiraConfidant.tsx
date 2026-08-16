import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMiraConfide, useMiraSubscribe } from './api';
import { MiraMark } from './MiraMark';

/**
 * MIRA, INVITED INTO ONE CONVERSATION.
 *
 * The owner's brief: press her mark inside a chat and she reads THAT thread —
 * helps you understand where the other person is coming from, and helps you
 * answer with some emotional depth. "The tab only gives access to that chat
 * box, not entire context" — and this component is built so that promise is
 * structural rather than behavioural:
 *
 *  · The transcript she reads is a PROP — the window the screen already
 *    shows, handed over at ask time. No fetch, no store, no reach into
 *    anything this panel was not given.
 *  · Nothing here persists. No day store, no browser storage of any kind,
 *    no welcome marker: the exchange lives in component state and dies with
 *    the panel.
 *    Close it and it is gone, which is the honest shape for a surface that
 *    read somebody ELSE's words too.
 *  · Her drafts land on the clipboard, never in the composer. She helps you
 *    say it; you still say it — pasting is the citizen's own hand, which is
 *    the same line the executor draws about writes everywhere else.
 */

interface Turn {
  who: 'you' | 'mira';
  text: string;
}

/**
 * The three things everybody wants from a reader-over-the-shoulder, one press
 * each. The label is sent verbatim as the ask — they are written to be asks.
 *
 * `mode` is what separates the third from the other two. "Help me reply" wants
 * a message to paste; the first two want her reading of the thread. Carried as
 * a flag rather than matched on the wording, because a check against a button's
 * label breaks the day somebody rewords the button — and because Copy sits
 * under her answer, and Copy on a paragraph of commentary puts the wrong thing
 * on the clipboard.
 */
const QUICK = [
  { label: 'What’s going on here?', mode: 'read' },
  { label: 'Where are they coming from?', mode: 'read' },
  { label: 'Help me reply', mode: 'draft' },
] as const satisfies ReadonlyArray<{ label: string; mode: 'read' | 'draft' }>;

export function MiraConfidant({ otherName, transcript, onClose }: {
  otherName: string;
  transcript: Array<{ who: 'me' | 'them'; text: string }>;
  onClose: () => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [paywalled, setPaywalled] = useState(false);
  /** Which of her bubbles was copied last — the label's receipt. */
  const [copied, setCopied] = useState<number | null>(null);
  const confide = useMiraConfide();
  const subscribe = useMiraSubscribe();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, confide.isPending]);

  const ask = async (text: string, mode: 'read' | 'draft' = 'read') => {
    const clean = text.trim();
    if (!clean || confide.isPending) return;
    setTurns((t) => [...t, { who: 'you', text: clean }]);
    setDraft('');
    try {
      const reply = await confide.mutateAsync({ otherName, ask: clean, transcript, mode });
      setPaywalled(Boolean(reply.paywall));
      setTurns((t) => [...t, { who: 'mira', text: reply.text }]);
    } catch {
      setTurns((t) => [...t, { who: 'mira', text: 'I’m not reaching the city right now. Try me in a minute?' }]);
    }
  };

  const copy = async (text: string, i: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
    } catch { /* clipboard refused — the text is still on screen to select */ }
  };

  return (
    <>
      {/* The same dismissal surface her dock uses: transparent, the whole
          page, and a real button so it is reachable without a pointer. */}
      <button type="button" className="mira-dock-scrim" aria-label="Close Mira’s panel" onClick={onClose} />
      <aside className="mira-confide" role="dialog" aria-label="Mira, about this conversation">
        <div className="mira-dock-head">
          <MiraMark size={26} showWord={false} state={confide.isPending ? 'thinking' : 'waiting'} />
          <span className="mira-dock-name">MIRA · THIS CHAT ONLY</span>
          <button type="button" className="mira-dock-close" aria-label="Close Mira’s panel" onClick={onClose}>×</button>
        </div>

        <div className="miraturns">
          {turns.length === 0 && (
            <p className="miraopentext" style={{ margin: 0 }}>
              I can read this conversation with {otherName} — just this one, nothing else, and I keep none of it.
              Ask me what’s going on, where they’re coming from, or for help saying what you mean.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`miraturn ${t.who}`}>
              <div className="mirabub">
                {t.text}
                {t.who === 'mira' && (
                  <button type="button" className="miracopy" aria-label="Copy this reply"
                    onClick={() => { void copy(t.text, i); }}>
                    {copied === i ? 'Copied' : 'Copy'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {confide.isPending && <div className="miraturn mira"><div className="mirabub mirawait">Reading it…</div></div>}

          {/* The same meter, the same key, the same rail — one subscription
              covers her everywhere, so the card here is the card from her
              own room, price on its face. */}
          {paywalled && (
            <div className="miraturn mira">
              <div className="mirabub">
                <button type="button" className="mirasub" disabled={subscribe.isPending}
                  onClick={() => {
                    void subscribe.mutateAsync()
                      .then(() => {
                        setPaywalled(false);
                        setTurns((t) => [...t, { who: 'mira', text: 'Done — we’re good for 30 days. Now, where were we?' }]);
                      })
                      .catch((err: unknown) => {
                        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setTurns((t) => [...t, {
                          who: 'mira',
                          text: typeof msg === 'string' && msg.trim() ? msg : 'The wallet didn’t answer. Try again in a minute?',
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

        <div className="mira-confide-chips">
          {QUICK.map((q) => (
            <button key={q.label} type="button" className="miratab"
              onClick={() => { void ask(q.label, q.mode); }}>{q.label}</button>
          ))}
        </div>
        <form className="miracomposer" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            aria-label="Ask Mira about this conversation"
            placeholder="Ask about this conversation…" />
          <button type="submit" disabled={!draft.trim() || confide.isPending}>Ask</button>
        </form>
        {/* The scope, said out loud where it is true — the same honesty the
            day-store note keeps in her own room. */}
        <p className="miranote">
          Mira sees only what’s on this screen, and keeps none of it — close this panel and it’s gone.
        </p>
      </aside>
    </>
  );
}
