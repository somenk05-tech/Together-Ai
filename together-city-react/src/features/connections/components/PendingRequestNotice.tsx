import { ModuleChips } from './ModuleToggles';
import { RELATIONSHIPS } from '../modules';
import type { LookupResult } from '@/api';

/**
 * What an incoming request would actually open, shown beside Accept.
 *
 * Owner decision: the REQUESTER picks the relationship and the hubs, and the
 * accepter cannot edit either before accepting. Defensible — but it means
 * "Accept" grants access that somebody else chose, so the one thing the button
 * cannot be is unlabelled.
 *
 * The People page always showed the hubs on a request. These two search surfaces
 * did not: they offered "Accept request" off a payload whose only relationship
 * information was the string `pending_in`. Same decision, same grant, no
 * disclosure — and they are the surfaces somebody reaches by looking a person up
 * rather than by going to People, which is to say the ones used in a hurry.
 *
 * Renders nothing when the request opens no optional hubs, because then there is
 * nothing to disclose and a notice saying so would be noise. The universal hubs
 * (chat, mail) are what connecting MEANS; they are not a grant on top of it.
 */
export function PendingRequestNotice({ result }: { result: LookupResult }) {
  if (!result || result.relationship !== 'pending_in') return null;
  const modules = result.requestedModules ?? [];
  const rel = RELATIONSHIPS.find((r) => r.key === result.requestedRelationship)?.label
    ?? result.requestedRelationship;
  return (
    <div style={{ marginTop: 12, border: '1px solid var(--line)', borderRadius: 12, padding: '10px 12px', background: 'var(--paper)' }}>
      <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.55 }}>
        {rel
          ? <>They asked to connect as <strong>{rel}</strong>.</>
          : <>They asked to connect.</>}
      </p>
      <ModuleChips modules={modules} caption="Hubs they want to open:" />
      <p className="muted" style={{ fontSize: 11.5, margin: '7px 0 0', lineHeight: 1.55 }}>
        {modules.length
          ? <>They chose these. Accepting opens exactly them &mdash; you can change them, or
              disconnect, any time afterwards.</>
          : <>No hubs beyond chat and mail. You can open more from People afterwards.</>}
      </p>
    </div>
  );
}
