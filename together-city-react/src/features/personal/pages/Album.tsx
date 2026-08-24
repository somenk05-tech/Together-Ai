import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { PostsTab } from '@/features/social/pages/Profile';

/**
 * THE ALBUM — everything you have posted, as pictures.
 *
 * The owner named it as one of Personal's four rooms (15 Aug). It is the
 * citizen's own media, which the city already held: every photo and video
 * they have posted, in the grid their profile already draws.
 *
 * SO IT DRAWS THAT GRID, RATHER THAN A SECOND ONE. `PostsTab` is the profile's
 * own tile wall — lazy thumbnails, a still frame for a video whose poster
 * never arrived, the lightbox reader, the reorder handle. A copy of it here
 * would be two grids to fix every time one of those details moves, and the
 * second copy is always the one nobody remembers. The album is that component
 * with a filter above it and a way home.
 *
 * It is NOT a new place to store pictures: nothing here uploads, and a photo
 * that is not on a post is not in this room. Calling it an album while it
 * quietly meant "your posts" would be the kind of small lie the city does not
 * tell, so the empty state says exactly what fills it.
 */

type Filter = 'all' | 'photo' | 'video';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'photo', label: 'Photos' },
  { id: 'video', label: 'Videos' },
];

export function Album() {
  const [filter, setFilter] = useState<Filter>('all');

  return (
    <div className="page">
      <div className="sl-head rise">
        <div className="sl-head-t">
          <Link to="/personal" className="btn btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 44 }}>
            <Icon name="back" size={15} /> Back to Personal
          </Link>
          <div className="eyebrow">Personal · Album</div>
          <h1>Everything you have shared</h1>
          <p>Every photo and video you’ve posted, newest first. Only you can see this.</p>
        </div>
      </div>

      <div className="cstabs" role="group" aria-label="What to show"
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
        {FILTERS.map((f) => (
          <button key={f.id} type="button" className={filter === f.id ? 'cstab on' : 'cstab'}
            aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            style={{ minHeight: 44 }}>
            {f.label}
          </button>
        ))}
      </div>

      <PostsTab filter={filter} />
    </div>
  );
}
