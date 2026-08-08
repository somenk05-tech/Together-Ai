import { useState, type FormEvent } from 'react';

/** The composer is a capsule pressed into the stage, with one raised key. */
export function Composer({ onSend, onTyping }: { onSend: (body: string) => void; onTyping: (t: boolean) => void }) {
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSend(text); setBody(''); onTyping(false);
  };
  return (
    <form className="cscomposer" onSubmit={submit}>
      <input value={body} placeholder="Write a message…" aria-label="Write a message"
        onChange={(e) => { setBody(e.target.value); onTyping(e.target.value.length > 0); }} />
      <button type="submit" className="cssend" aria-label="Send" disabled={!body.trim()}>➤</button>
    </form>
  );
}
