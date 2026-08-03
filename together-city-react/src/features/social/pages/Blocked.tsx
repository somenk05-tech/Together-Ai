import { useState } from 'react';
import { Breadcrumbs } from '@/components/Breadcrumbs';
import { Button } from '@/components/ui';
import { useBlocks, useUnblock, type PostAuthor } from '../api';

/**
 * The people you have blocked, and the way back (FE-13.5).
 *
 * Blocking worked. Unblocking did not exist. `useBlocks` and `useUnblock` had
 * both been written and neither was called from any screen, so a block was a
 * one-way door: the endpoint was there, the button was not.
 *
 * And it was worse than an ordinary missing screen, because a block is exactly
 * the thing that makes its own undo unreachable. Blocking somebody removes them
 * from the feed, from search and from your circle — so the profile you would go
 * to in order to change your mind is the one page you can no longer get to. The
 * only way out was to remember their handle and type the URL.
 *
 * A safety control you cannot reverse is not a kindness to anyone. People block
 * in anger, block the wrong account, block a sibling during an argument. This
 * is the list, and this is the way back.
 */
function Person({ person }: { person: PostAuthor }) {
  const unblock = useUnblock();
  const [done, setDone] = useState(false);

  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
      borderTop: '1px solid var(--line)',
    }}>
      {person.profileImage
        ? <img src={person.profileImage} alt="" width={40} height={40} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        : <span aria-hidden style={{
          width: 40, height: 40, borderRadius: '50%', flexShrink: 0, background: 'var(--accent-soft)',
          display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--accent-ink)',
        }}>{(person.name || person.handle || '?').charAt(0).toUpperCase()}</span>}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{person.name || person.handle}</div>
        {person.handle && <div className="muted" style={{ fontSize: 12.5 }}>@{person.handle}</div>}
      </div>

      {done
        ? <span className="muted" style={{ fontSize: 12.5 }}>Unblocked</span>
        : (
          <Button
            variant="line"
            size="sm"
            disabled={unblock.isPending}
            onClick={() => unblock.mutate(person.id, { onSuccess: () => setDone(true) })}
          >
            {unblock.isPending ? 'Unblocking…' : 'Unblock'}
          </Button>
        )}
    </li>
  );
}

export function BlockedPeople() {
  const { data, isLoading, isError } = useBlocks();

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 56px' }}>
      <Breadcrumbs />
      <div className="eyebrow" style={{ marginTop: 10 }}>Settings</div>
      <h1 style={{ fontSize: 26 }}>Blocked citizens</h1>
      <p className="muted" style={{ fontSize: 13.5, margin: '6px 0 18px', lineHeight: 1.6 }}>
        Someone you block cannot message you, call you, send you a connection request or appear in your
        matches, and their posts do not reach your feed. They are not told. Unblocking takes effect
        straight away — it does not restore a connection or a follow you had before, so you would both
        be starting again.
      </p>

      {isLoading && <p className="muted" style={{ fontSize: 13.5 }}>Loading…</p>}

      {isError && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          We could not load your blocked list just now. Please try again in a moment.
        </p>
      )}

      {data && data.length === 0 && (
        <p className="muted" style={{ fontSize: 13.5 }}>
          You have not blocked anyone. If you ever need to, it is on the citizen&rsquo;s profile, and
          they will appear here so you can undo it.
        </p>
      )}

      {data && data.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {data.map((p) => <Person key={p.id} person={p} />)}
        </ul>
      )}
    </div>
  );
}
