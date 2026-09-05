import { useSocketState } from '@/hooks/useSocketState';
import { bannerStyle } from './banner-style';

/**
 * Real-time is away and something says so. Until 4 Sep a socket the server
 * closed stayed closed and nothing on screen changed: messages stopped
 * arriving and the reader learned it from the word "Unauthorized" under the
 * composer. The socket recovers on its own now (api/socket.ts); this is the
 * strip that shows while it does, on every page, chat most of all.
 */
export function ReconnectStrip() {
  const state = useSocketState();
  if (state !== 'reconnecting') return null;
  return (
    <div role="status" style={bannerStyle}>
      <span aria-hidden>⟳</span>
      <span>Reconnecting — new messages and calls will arrive when the line is back.</span>
    </div>
  );
}
