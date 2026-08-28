import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { useConsents, useSetConsent } from '../api';

/**
 * ASKED AT THE DOOR THE DATA COMES THROUGH (owner, 28 Aug).
 *
 * Same-app hubs read biomarkers by default, and that default stands — the owner
 * kept it, because flipping it would take blood-personalised plans away from
 * everybody currently getting them until they went and found a toggle. What was
 * wrong was never the default; it was that nobody was ever asked, and that
 * `consents()` wrote the unasked default into the database as a granted
 * consent, where an audit could not tell it from a real one.
 *
 * So the ask happens HERE rather than in a sign-up flow, for the reason the
 * dating profile gives over its own consent tick — a permission is asked where
 * it is true. At sign-up there is no panel and no referent: agreeing to share
 * markers you do not have is a click, not a decision. The moment a report is on
 * file the question is concrete, and this is the screen it lands on.
 *
 * Both answers are answers. "Turn it off" is not a dismissal that leaves the
 * default in place under a different name; both buttons write a row for every
 * hub still unanswered, which is what makes the card go away and stay away.
 * Per-hub control is one link down, where it always was.
 */
export function ShareWithHubs({ hasPanel }: { hasPanel: boolean }) {
  const consents = useConsents();
  const set = useSetConsent();
  const [busy, setBusy] = useState(false);

  const unanswered = (consents.data ?? []).filter((c) => !c.answered);
  // No panel, no question. A failed read is not a licence to ask again wrongly.
  if (!hasPanel || consents.isLoading || consents.isError || unanswered.length === 0) return null;

  const answer = (granted: boolean) => {
    setBusy(true);
    // Sequential on purpose: `setConsent` returns the whole list, and three
    // in flight at once would race each other into the cache.
    void unanswered
      .reduce<Promise<unknown>>((p, c) => p.then(() => set.mutateAsync({ hub: c.hub, granted })), Promise.resolve())
      .finally(() => setBusy(false));
  };

  const names = unanswered.map((c) => c.label);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];

  return (
    <div className="card mh-ask">
      <h2 className="mh-ask-h">Who may read this panel?</h2>
      <p className="mh-ask-b">
        {list} can use these markers to personalise your plans — {names.length > 1 ? 'they are' : 'it is'} switched
        on now, and you have not been asked before. Your report never leaves Together City either way.
      </p>
      <div className="mh-ask-row">
        <Button variant="accent" size="sm" disabled={busy} onClick={() => answer(true)}>
          {busy ? 'Saving…' : 'Keep it on'}
        </Button>
        <Button variant="line" size="sm" disabled={busy} onClick={() => answer(false)}>
          Turn it off
        </Button>
        <Link to="/medical/consent" className="mh-ask-link">Choose per hub →</Link>
      </div>
    </div>
  );
}
