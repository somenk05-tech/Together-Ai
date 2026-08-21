import { useCallCenter } from './context';
import type { CallType } from './api';

/**
 * Call buttons for a conversation header.
 *
 * Disabled while a call is already up, because starting a second one from the
 * same screen is never what someone meant — the backend would join them to the
 * live call anyway, but a button that silently does something other than what
 * it says is worse than one that is greyed out.
 */
export function CallButtons({ conversationId, compact = false }: { conversationId: string; compact?: boolean }) {
  const { start, phase, busy } = useCallCenter();
  const inCall = phase !== 'idle';

  const ring = (type: CallType) => {
    void start(conversationId, type).catch(() => undefined);
  };

  /* COMPACT IS A DISC, NOT A SHORTER PILL. Compact is only ever worn in the
     chat header, where every other key — the overflow, the search, the mark —
     is a 34px circle; a pill among them read as a different kind of control,
     and two of them cost the name 12px it did not have to spare on a 320px
     phone. Same target, same shape, one row. */
  const style = compact ? {
    border: '1px solid var(--line)', background: 'transparent', cursor: inCall ? 'default' : 'pointer',
    borderRadius: 'var(--r-full)', width: 34, height: 34, padding: 0, display: 'grid', placeItems: 'center',
    fontSize: 13, fontFamily: 'inherit', color: 'inherit', opacity: inCall || busy ? 0.5 : 1,
  } as const : {
    border: '1px solid var(--line)', background: 'transparent', cursor: inCall ? 'default' : 'pointer',
    borderRadius: 'var(--r-full)', padding: '6px 12px', fontSize: 13,
    fontFamily: 'inherit', color: 'inherit', opacity: inCall || busy ? 0.5 : 1,
  } as const;

  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 6, flex: 'none' }}>
      <button type="button" style={style} disabled={inCall || busy} onClick={() => ring('audio')} title="Voice call">
        📞{compact ? '' : ' Call'}
      </button>
      <button type="button" style={style} disabled={inCall || busy} onClick={() => ring('video')} title="Video call">
        🎥{compact ? '' : ' Video'}
      </button>
    </div>
  );
}
