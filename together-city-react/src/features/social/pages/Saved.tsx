import { EmptyState } from '@/components/ui';

/** Social Life · Saved — bookmarked posts, places and events. Starts empty. */
export function SocialSaved() {
  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px 16px' }}>
      <div className="rise" style={{ marginBottom: 28 }}>
        <div className="eyebrow">Social Life · Saved</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)' }}>Kept for later</h1>
        <p className="lede" style={{ marginTop: 6 }}>Bookmarked posts, places and events, organised into collections.</p>
      </div>

      <EmptyState icon="🔖" title="Nothing saved yet"
        hint="Bookmark posts, places and events across Together City and they’ll collect here." />
    </div>
  );
}
