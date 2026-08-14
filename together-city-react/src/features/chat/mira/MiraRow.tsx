import { Icon } from '@/components/ui/Icon';
import { MiraMark } from './MiraMark';

/**
 * Mira's row, pinned above every conversation.
 *
 * She is NOT a Conversation. `Message.senderId` is a foreign key to `User`, so
 * putting her in the table would mean a synthetic user row — and that row would
 * surface in the people directory, in connections, and in the dating pool,
 * which is the exact class of leak `dating-isolation.spec.ts` exists because of.
 * Nor does most of a message apply to her: an edit window, delete-for-everyone,
 * reactions, read receipts, a call.
 *
 * So she is a pinned row backed by her own endpoint. "Top tab" is a position,
 * not a data model.
 */
export function MiraRow({ active, onSelect }: { active: boolean; onSelect: () => void }) {
  return (
    <div className={`csrow mirarow${active ? ' on' : ''}`}>
      <button type="button" className="csrowmain" onClick={onSelect} aria-current={active ? 'true' : undefined}>
        <span className="miramark-slot" aria-hidden="true">
          <MiraMark size={26} state="listening" showWord={false} />
        </span>
        <span className="csrowtext">
          <span className="csrowtitle">Mira</span>
          <span className="csrowsub">Ask for anything in the city</span>
        </span>
        <Icon name="next" size={14} aria-hidden />
      </button>
    </div>
  );
}
