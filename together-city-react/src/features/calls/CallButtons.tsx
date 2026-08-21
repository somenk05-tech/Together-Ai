import { useQuery } from '@tanstack/react-query';
import { useCallCenter } from './context';
import { callsApi, type CallType } from './api';
import { telHref, whatsappHref } from './handoff';

/**
 * Call buttons for a conversation header.
 *
 * THE HANDSET FIRST, THIS APP SECOND. Both keys now try to leave: the receiver
 * opens the dialler, the camera opens the WhatsApp thread — because a call that
 * works is worth more than a call that is ours, and a citizen on a mobile
 * carrier behind symmetric NAT is exactly who WebRTC fails for. The in-app call
 * is the fallback, not the loser: it is what runs whenever there is no number
 * to hand off to, which is every dating chat, every group, and everyone who has
 * not verified a phone. That is most conversations, so the WebRTC stack behind
 * `start` is doing at least as much work as it did before.
 *
 * WHY THE CAMERA OPENS A THREAD RATHER THAN RINGING. WhatsApp has no
 * person-to-person call link — see handoff.ts. Two taps, and the second one is
 * the citizen's.
 *
 * Disabled while a call is already up, because starting a second one from the
 * same screen is never what someone meant — the backend would join them to the
 * live call anyway, but a button that silently does something other than what
 * it says is worse than one that is greyed out. That still holds for the
 * handoff: walking out to the dialler mid-call is a dropped call.
 */
export function CallButtons({ conversationId, compact = false }: { conversationId: string; compact?: boolean }) {
  const { start, phase, busy } = useCallCenter();
  const inCall = phase !== 'idle';

  /* A number that has not arrived yet is a number we do not have, and the
     buttons ring in-app until it does. No retry: a conversation that answers
     403 or 404 here answers it every time, and a header is not a place to
     spend three round trips finding that out. */
  const { data: reach } = useQuery({
    queryKey: ['calls', 'reach', conversationId],
    queryFn: () => callsApi.reach(conversationId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const tel = telHref(reach?.phoneE164);
  const wa = whatsappHref(reach?.phoneE164);

  const ring = (type: CallType) => {
    void start(conversationId, type).catch(() => undefined);
  };

  const voice = () => {
    if (tel) { window.location.href = tel; return; }
    ring('audio');
  };

  const video = () => {
    if (wa) { window.open(wa, '_blank', 'noopener,noreferrer'); return; }
    ring('video');
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

  /* THE TRADE, SAID AT THE BUTTON. BusinessPage.tsx prints this under its call
     key; a 34px disc has nowhere to print it, so it goes in the tooltip and the
     long label — the two places a citizen can read before pressing. Dialling
     shows them your number. Nobody should find that out afterwards. */
  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 6, flex: 'none' }}>
      <button
        type="button" style={style} disabled={inCall || busy} onClick={voice}
        title={tel ? 'Call on the phone — they will see your number' : 'Voice call'}
      >
        📞{compact ? '' : ' Call'}
      </button>
      <button
        type="button" style={style} disabled={inCall || busy} onClick={video}
        title={wa ? 'Open WhatsApp — they will see your number' : 'Video call'}
      >
        🎥{compact ? '' : ' Video'}
      </button>
    </div>
  );
}
