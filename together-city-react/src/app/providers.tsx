import { type ReactNode, useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { useAuthStore } from '@/store/auth.store';

/** App-wide providers: TanStack Query + auth hydration on boot. */
export function Providers({ children }: { children: ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  useEffect(() => { void hydrate(); }, [hydrate]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
