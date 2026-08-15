import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { apiPost } from '@/api/http';
import { useMutation } from '@tanstack/react-query';
import { MiraMark } from '@/features/chat/mira/MiraMark';
import { useMiraSubscribe } from '@/features/chat/mira/api';

/**
 * MIRA, READING ONE DAY.
 *
 * The owner called this the killer feature, and the thing that makes it worth
 * having is the thing that makes it safe: she is reading THE CITIZEN'S OWN
 * page. Unlike the chat confidant — which is handed a window of somebody
 * else's words and may never keep them — this is their diary, so the day is
 * read from the SERVER rather than from what the screen happens to show. That
 * is what lets "what did I say I wanted?" be a real question about a day
 * nobody is currently looking at.
 *
 * The scope is still one day: she is given that date's page and its lines and
 * nothing around them. And she may not invent a day — an empty page comes
 * back as an empty page, because confident fiction about a day somebody
 * actually lived is the one failure a diary's reader cannot recover from.
 *
 * Nothing here is stored. The exchange lives in this component and dies with
 * it, like the chat confidant, and for the same reason: a reading of your
 * Tuesday is not a thing that needs to become a second record.
 */

const DayReplySchema = z.object({
  text: z.string(),
  pass: z.object({ freeLeft: z.number().nullable() }).optional(),
  paywall: z.boolean().optional(),
});

const QUICK = ['What did this day look like?', 'What was I worried about?', 'What should I carry into tomorrow?'] as const;

export function MiraDay({ date, onClose }: { date: string; onClose: () => void }) {
  const [turns, setTurns] = useState<Array<{ who: 'you' | 'mira'; text: string }>>([]);
  const [draft, setDraft] = useState('');
  const [paywalled, setPaywalled] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const subscribe = useMiraSubscribe();

  const read = useMutation({
    mutationFn: (ask: string) => apiPost('/mira/day', {
      date, ask,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
    }, DayReplySchema),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns.length, read.isPending]);

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || read.isPending) return;
    setTurns((t) => [...t, { who: 'you', text: clean }]);
    setDraft('');
    try {
      const reply = await read.mutateAsync(clean);
      setPaywalled(Boolean(reply.paywall));
      setTurns((t) => [...t, { who: 'mira', text: reply.text }]);
    } catch {
      setTurns((t) => [...t, { who: 'mira', text: 'I’m not reaching the city right now. Try me in a minute?' }]);
    }
  };

  return (
    <>
      <button type="button" className="mira-dock-scrim" aria-label="Close Mira’s panel" onClick={onClose} />
      <aside className="mira-confide" role="dialog" aria-label="Mira, about this day">
        <div className="mira-dock-head">
          <MiraMark size={26} showWord={false} state={read.isPending ? 'thinking' : 'waiting'} />
          <span className="mira-dock-name">MIRA · THIS DAY ONLY</span>
          <button type="button" className="mira-dock-close" aria-label="Close Mira’s panel" onClick={onClose}>×</button>
        </div>

        <div className="miraturns">
          {turns.length === 0 && (
            <p className="miraopentext" style={{ margin: 0 }}>
              I can read this one day with you — what you put down, how you said it felt, what you wrote.
              Just this day, nothing around it.
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`miraturn ${t.who}`}><div className="mirabub">{t.text}</div></div>
          ))}
          {read.isPending && <div className="miraturn mira"><div className="mirabub mirawait">Reading it…</div></div>}
          {paywalled && (
            <div className="miraturn mira">
              <div className="mirabub">
                <button type="button" className="mirasub" disabled={subscribe.isPending}
                  onClick={() => {
                    void subscribe.mutateAsync()
                      .then(() => { setPaywalled(false); setTurns((t) => [...t, { who: 'mira', text: 'Done — we’re good for 30 days. Now, this day.' }]); })
                      .catch(() => setTurns((t) => [...t, { who: 'mira', text: 'The wallet didn’t answer. Try again in a minute?' }]));
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
            <button key={q} type="button" className="miratab" onClick={() => { void ask(q); }}>{q}</button>
          ))}
        </div>
        <form className="miracomposer" onSubmit={(e) => { e.preventDefault(); void ask(draft); }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            aria-label="Ask Mira about this day" placeholder="Ask about this day…" />
          <button type="submit" disabled={!draft.trim() || read.isPending}>Ask</button>
        </form>
        <p className="miranote">She reads this one day, and keeps nothing from it.</p>
      </aside>
    </>
  );
}
