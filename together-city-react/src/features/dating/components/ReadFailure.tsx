import { Link } from 'react-router-dom';
import { Button, EmptyState } from '@/components/ui';
import { moderationHold } from '../server-sentence';

/**
 * The generic sentence is still right for a read that genuinely failed — it is
 * only wrong when the server answered. So both live here, and which one shows
 * is decided by what came back rather than by which screen is asking. The
 * reasoning behind the 403 half is in `server-sentence.ts`.
 *
 * The action goes to the profile rather than the Safety Centre because a
 * rejection is usually self-service: `upsertProfile` has no moderation guard,
 * so editing the sentence and saving re-runs the check, and the reasons are
 * rendered on that page. The appeal is named in the server's own sentence, for
 * the citizen who has nothing to change.
 */
export function ReadFailure({ error, title, hint }: { error: unknown; title: string; hint: string }) {
  const held = moderationHold(error);
  if (held) {
    return (
      <EmptyState
        icon="⏳"
        title="Your profile isn’t live yet"
        hint={held}
        action={<Link to="/matchmaking/profile"><Button variant="accent">Open my matchmaking profile</Button></Link>}
      />
    );
  }
  return <EmptyState icon="⚠️" title={title} hint={hint} />;
}
