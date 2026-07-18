import { useState } from 'react';
import { Button } from '@/components/ui';
import { useWallet, useLinkCard, inr, type PayMethod } from './api';

/**
 * Unified payment confirmation. Nothing is charged until the user picks a method
 * and presses Pay — the money then moves from the city wallet or the linked card.
 * Every hub's checkout renders this instead of charging directly.
 */
export function PaymentSheet({
  open, amountInr, label, pending, error, onPay, onCancel,
}: {
  open: boolean; amountInr: number; label: string; pending?: boolean; error?: string | null;
  onPay: (method: PayMethod) => void; onCancel: () => void;
}) {
  const wallet = useWallet();
  const linkCard = useLinkCard();
  const [method, setMethod] = useState<PayMethod>('wallet');
  if (!open) return null;

  const balance = wallet.data?.balanceInr ?? 0;
  const card = wallet.data?.card ?? null;
  const walletShort = balance < amountInr;

  const Option = ({ m, title, sub, disabled }: { m: PayMethod; title: string; sub: string; disabled?: boolean }) => (
    <button type="button" disabled={disabled} onClick={() => setMethod(m)}
      style={{ width: '100%', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
        borderRadius: 12, padding: '12px 14px', marginBottom: 8, fontFamily: 'inherit',
        border: `1.5px solid ${method === m ? 'var(--accent)' : 'var(--line)'}`, background: method === m ? 'var(--accent-soft)' : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${method === m ? 'var(--accent)' : 'var(--line)'}`, background: method === m ? 'var(--accent)' : 'transparent', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{title}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>{sub}</div>
        </div>
      </div>
    </button>
  );

  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'end center', zIndex: 1000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--card, #fff)', borderRadius: '18px 18px 0 0', padding: '20px 18px 24px', boxShadow: '0 -8px 40px rgba(0,0,0,.2)' }}>
        <div className="eyebrow">Confirm payment</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 2px' }}>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{inr(amountInr)}</div>
        </div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{label}</div>

        <Option m="wallet" title="City wallet"
          sub={walletShort ? `Balance ${inr(balance)} — not enough` : `Balance ${inr(balance)}`}
          disabled={walletShort} />

        {card ? (
          <Option m="card" title={`${card.brand} •• ${card.last4}`} sub={card.name} />
        ) : (
          <button type="button" onClick={() => linkCard.mutate({ brand: 'Visa', last4: '4242', name: 'City Card' }, { onSuccess: () => setMethod('card') })}
            disabled={linkCard.isPending}
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 12, padding: '12px 14px', marginBottom: 8, fontFamily: 'inherit', border: '1.5px dashed var(--line)', background: 'transparent' }}>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>{linkCard.isPending ? 'Linking…' : '＋ Link a credit card'}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>Pay by card instead of the wallet</div>
          </button>
        )}

        {(error || (method === 'wallet' && walletShort)) && (
          <div style={{ fontSize: 12, color: '#c62828', fontWeight: 600, margin: '4px 0 8px' }}>
            {error || 'Wallet balance is too low — top up or pay by card.'}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Button variant="line" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant="accent" disabled={pending || (method === 'wallet' && walletShort)}
            onClick={() => onPay(method)} style={{ flex: 1 }}>
            {pending ? 'Paying…' : `Pay ${inr(amountInr)}${method === 'card' && card ? ` · card ••${card.last4}` : ' · wallet'}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
