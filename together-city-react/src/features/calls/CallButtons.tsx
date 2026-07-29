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

  const style = {
    border: '1px solid var(--line)', background: 'transparent', cursor: inCall ? 'default' : 'pointer',
    borderRadius: 999, padding: compact ? '4px 10px' : '6px 12px', fontSize: compact ? 12 : 13,
    fontFamily: 'inherit', color: 'inherit', opacity: inCall || busy ? 0.5 : 1,
  } as const;

  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button type="button" style={style} disabled={inCall || busy} onClick={() => ring('audio')} title="Voice call">
        📞{compact ? '' : ' Call'}
      </button>
      <button type="button" style={style} disabled={inCall || busy} onClick={() => ring('video')} title="Video call">
        🎥{compact ? '' : ' Video'}
      </button>
    </div>
  );
}
