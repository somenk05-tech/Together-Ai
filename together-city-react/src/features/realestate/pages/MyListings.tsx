import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, Spinner } from '@/components/ui';
import { useMyListings, useCloseProperty, priceLabel, bhkLabel, type PropertyCard } from '../api';
import { Masthead } from '../components/Masthead';

/**
 * STATUS IS THE COLUMN YOU CAME FOR.
 *
 * This page answers one question — is my listing live? — and it used to answer
 * it in a coloured slab UNDER each card, so the answer was the last thing you
 * reached and there was no way to see four of them at once. As an index the
 * status is a column, which is what a column is for.
 *
 * The tone stays in the ink and not in a filled block. A red panel and a green
 * panel side by side is a page shouting two things; the same two words set in
 * the status inks say it once.
 */
const MOD: Record<string, { label: string; ink: string }> = {
  approved: { label: 'Live in Explore', ink: 'var(--ok-ink)' },
  pending: { label: 'Pending review', ink: 'var(--warn-ink)' },
  review: { label: 'In manual review', ink: 'var(--warn-ink)' },
  rejected: { label: 'Not published', ink: 'var(--danger-ink)' },
  removed: { label: 'Closed by you', ink: 'var(--muted)' },
};

function Row({ p, n }: { p: PropertyCard; n: number }) {
  const m = MOD[p.moderation] ?? MOD.approved;
  const close = useCloseProperty();
  const [confirm, setConfirm] = useState(false);
  const to = `/realestate/property/${p.id}`;

  return (
    <li className="erow">
      <span className="eno">{String(n).padStart(2, '0')}</span>
      <Link to={to} aria-label={p.title}>
        {p.coverPhoto
          ? <img className="ethumb" src={p.coverPhoto} alt="" />
          : <span className="ethumb" style={{ display: 'block' }} />}
      </Link>
      <div>
        <h3 className="etitle">
          <Link to={to} style={{ color: 'inherit', textDecoration: 'none' }}>{p.title}</Link>
        </h3>
        <p className="esub">
          {bhkLabel(p)} · {p.areaSqft.toLocaleString('en-IN')} sqft · {p.locality}, {p.city} · {p.photoCount} photo{p.photoCount === 1 ? '' : 's'}
        </p>
        {/* The reasons are the whole value of a rejection. They were four
            bullets in a red box; they are the sentence that tells you what to
            change, so they read as one. */}
        {p.moderation !== 'approved' && p.moderationReasons.length > 0 && (
          <p className="esub">{p.moderationReasons.slice(0, 4).join(' · ')}</p>
        )}
        <p className="esub">
          {/* Edit & resubmit opens the listing itself, prefilled — including a
              closed one, to relist. It used to open a blank form. */}
          <Link to={`/realestate/edit/${p.id}`} style={{ fontWeight: 700 }}>
            {p.moderation === 'rejected' ? 'Edit & resubmit →' : p.moderation === 'removed' ? 'Edit & relist →' : 'Edit →'}
          </Link>
          {p.moderation !== 'removed' && (
            <>
              {'  ·  '}
              <button type="button" disabled={close.isPending}
                onClick={() => (confirm ? close.mutate(p.id, { onError: () => setConfirm(false) }) : setConfirm(true))}
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: confirm ? 'var(--danger-ink)' : 'var(--muted)' }}>
                {close.isPending ? 'Closing…' : confirm ? 'Yes — close it' : 'Close (sold / withdrawn)'}
              </button>
            </>
          )}
        </p>
      </div>
      <div className="eside">
        <strong>{priceLabel(p.priceInr, p.listingType)}</strong>
        <span style={{ color: m.ink, fontWeight: 700 }}>{m.label}</span>
      </div>
    </li>
  );
}

/** My Listings — the properties you have posted, and where each one stands. */
export function MyListings() {
  const q = useMyListings();
  const items = q.data ?? [];
  const live = items.filter((p) => p.moderation === 'approved').length;

  return (
    <div>
      <Masthead mark={['Your', 'Listings']} title="Everything you have posted"
        nav={[
          { label: 'List a property', to: '/realestate/sell' },
          { label: 'Explore', to: '/realestate/explore' },
          { label: 'Under construction', to: '/realestate/under-construction' },
        ]}>
        Each one appears here the moment you submit it, with the review it is
        waiting on and the reasons behind any decision. Edit a rejected listing
        and it goes back through review; close one and it leaves Explore.
      </Masthead>

      <div style={{ marginTop: 28 }}>
        {q.isLoading ? <Spinner label="Loading your listings…" />
          : q.isError ? <EmptyState title="Couldn’t load your listings" hint="Please check your connection and try again." />
          : items.length === 0 ? <p className="eempty">You haven’t posted anything yet. Start from List a property — it shows up here the moment you submit.</p>
          : <ol className="eindex">{items.map((p, i) => <Row key={p.id} p={p} n={i + 1} />)}</ol>}
      </div>

      {items.length > 0 && (
        <div className="efoot">
          <span>{items.length} posted</span>
          <span>{live} live in Explore</span>
        </div>
      )}
    </div>
  );
}
