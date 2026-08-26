import { RouterProvider } from 'react-router-dom';
import { Providers } from './providers';
import { CallCenter } from '@/features/calls/CallCenter';
import { useZoomLock } from '@/hooks/useZoomLock';
import { useDeepLinks } from '@/hooks/useDeepLinks';
import { router } from './router';

/**
 * CallCenter wraps the ROUTER, not one layout inside it.
 *
 * It used to live in AppShell, whose own comment read: "CallCenter wraps
 * everything because a call has to outlive the screen it started on, and an
 * incoming one has to appear wherever the citizen is." That was true of the
 * subtree AppShell renders and false of the application, because the HubLayout
 * route blocks — every inner page of Dating, Nutrition, Social, Medical,
 * Financial, Travel and the rest — are SIBLINGS of the AppShell route, not
 * children of it.
 *
 * So two things were wrong at once. Dating Chats renders CallButtons, and on a
 * route with no provider above it `useCallCenter` threw on render: the page
 * never appeared at all. And everywhere else under a hub layout, an incoming
 * call simply could not be shown — silently, because nothing on those pages
 * asks for the context.
 *
 * Above RouterProvider is the only place that keeps the promise. CallCenter uses
 * no router hooks, so it belongs here; it stays inside Providers because it
 * needs the query client and the auth store.
 */
export function App() {
  // ONE PLACE, ABOVE THE ROUTER. The zoom guard is a property of the
  // application, not of a page — registered here it covers every route
  // including the ones that are siblings of AppShell rather than children of
  // it, which is the same trap CallCenter fell into above.
  useZoomLock();
  // Same reasoning: a link from a push is a property of the application.
  useDeepLinks();
  return (
    <Providers>
      <CallCenter>
        <RouterProvider router={router} />
      </CallCenter>
    </Providers>
  );
}
