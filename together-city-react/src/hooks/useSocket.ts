import { useEffect } from 'react';
import { socketClient } from '@/api';
import { useAuthStore } from '@/store/auth.store';

/** Connect the shared Socket.IO client while authenticated. */
export function useSocket(): void {
  const authed = useAuthStore((s) => s.isAuthenticated());
  useEffect(() => {
    if (authed) socketClient.connect();
    return () => { if (!authed) socketClient.disconnect(); };
  }, [authed]);
}
