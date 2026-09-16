import { useState } from 'react';
import { Button } from '@/components/ui';

/** The address and its one button. Copied text is confirmed in words, on the
 *  button, for two seconds — role="status" so a screen reader hears it. */
export function CopyAddress({ address, size = 'md' }: { address: string; size?: 'sm' | 'md' }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(address); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* the address is on screen to select */ }
  };
  return (
    <div className={`mm-copy${size === 'sm' ? ' mm-sm' : ''}`}>
      <code>{address}</code>
      <Button size="sm" variant={done ? 'line' : 'accent'} onClick={() => void copy()}>{done ? 'Copied' : 'Copy address'}</Button>
      {done && <span className="muted mm-copied" role="status">Copied to your clipboard.</span>}
    </div>
  );
}
