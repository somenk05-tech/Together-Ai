import { useEffect } from 'react';
import { socketClient, WS } from '@/api';
import { useAuthStore } from '@/store/auth.store';

/** Connect the shared Socket.IO client while authenticated. */
export function useSocket(): void {
  const authed = useAuthStore((s) => s.isAuthenticated());
  useEffect(() => {
    if (authed) socketClient.connect();
    return () => { if (!authed) socketClient.disconnect(); };
  }, [authed]);

  /* The presence heartbeat. The server keys "online" off a 90-second TTL that
     something has to refresh — this is the something. Without it, presence
     relied on disconnect events alone, and a disconnect the server never saw
     (a killed instance, a crashed process) left a citizen online forever. */
  useEffect(() => {
    if (!authed) return;
    const t = window.setInterval(() => {
      if (socketClient.connected()) socketClient.emit(WS.HEARTBEAT, {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [authed]);
}
