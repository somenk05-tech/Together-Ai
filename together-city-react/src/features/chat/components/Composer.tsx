import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui';

export function Composer({ onSend, onTyping }: { onSend: (body: string) => void; onTyping: (t: boolean) => void }) {
  const [body, setBody] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    onSend(text); setBody(''); onTyping(false);
  };
  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 10, padding: 14, borderTop: '1px solid var(--line)', flexShrink: 0, background: 'var(--card)', paddingBottom: 'calc(14px + var(--safe-bottom, 0px))' }}>
      <input value={body} placeholder="Message…"
        onChange={(e) => { setBody(e.target.value); onTyping(e.target.value.length > 0); }}
        style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 999, padding: '11px 16px', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
      <Button type="submit" variant="accent" size="sm">Send</Button>
    </form>
  );
}
