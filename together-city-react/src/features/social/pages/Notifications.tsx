import { useState } from 'react';

const FILTERS = ['All', 'Unread', 'Mentions'];

/** Social Life · Notifications — likes, comments, mentions & follows. */
export function SocialNotifications() {
  const [filter, setFilter] = useState(0);
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div
        className="rise"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}
      >
        <div>
          <div className="eyebrow">Social Life · Notifications</div>
          <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Likes, comments &amp; mentions</h1>
        </div>
        <div className="pill-row">
          {FILTERS.map((f, i) => (
            <span key={f} className={i === filter ? 'pill on' : 'pill'} style={{ cursor: 'pointer' }} onClick={() => setFilter(i)}>{f}</span>
          ))}
          <span className="btn btn-line btn-sm" style={{ cursor: 'pointer' }}>Mark all read</span>
        </div>
      </div>

      <div className="blk rise d1" style={{ textAlign: 'center', padding: '64px 24px' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🔔</div>
        <h2 style={{ fontSize: 20, margin: '0 0 6px' }}>You're all caught up</h2>
        <p className="muted" style={{ fontSize: 14, margin: 0 }}>
          Likes, comments and mentions on your posts will show up here.
        </p>
      </div>
    </div>
  );
}
