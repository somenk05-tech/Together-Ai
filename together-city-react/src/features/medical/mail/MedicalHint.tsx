import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { categoryLabel, useDismissHint, useMoveFromMail } from './api';

/**
 * On an ordinary message in Together City Mail that reads as medical: the
 * reason, and the move — offered, never done (owner, 16 Sep, §8). "Not
 * medical" dismisses it; "never from this sender" writes a rule too.
 */
export function MedicalHint({ id, hint }: { id: string; hint: { category: string; confidence: number; why: string } }) {
  const nav = useNavigate();
  const move = useMoveFromMail();
  const dismiss = useDismissHint();
  const go = (rememberSender?: 'medical') => move.mutate({ mailMessageId: id, rememberSender }, { onSuccess: (r) => nav(`/medical/mail/${r.emailId}`) });
  return (
    <div className="card mm-hint" role="status">
      <div className="mm-hint-t">This looks like medical mail — {categoryLabel(hint.category).toLowerCase()}.</div>
      <p className="mm-hint-p">{hint.why} Medical Mail keeps it with your Health Records; nothing moves unless you say so.</p>
      <div className="mm-acts">
        <Button size="sm" variant="accent" state={move.isPending ? 'loading' : undefined} loadingLabel="Moving…" onClick={() => go()}>Move to Medical Mail</Button>
        <Button size="sm" variant="line" state={move.isPending ? 'loading' : undefined} onClick={() => go('medical')}>Move, and always from this sender</Button>
        <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ mailMessageId: id })}>Not medical</Button>
        <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ mailMessageId: id, rememberSender: 'personal' })}>Never from this sender</Button>
      </div>
    </div>
  );
}
