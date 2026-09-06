import { Link, useParams } from 'react-router-dom';
import { Card, Spinner } from '@/components/ui';
import { useAstroGemstones } from '../hooks';
import { AstroHeader, NeedsProfileCard } from '../shared';
import { StoneSheet } from './AstroGemstones';

/**
 * ONE STONE, ON ITS OWN PAGE.
 *
 * The shelf on /astrology/gemstones is the owner's gallery reference — cards
 * of one size carrying a photograph and a name. Everything the sheet says
 * about a stone lives here, which is what lets the shelf stay a shelf.
 *
 * IT READS THE SAME PAYLOAD THE SHELF DID, and deliberately so. A second
 * endpoint for "one stone" would be a second engine deciding which stones are
 * yours, at what weight and at what price — two confident answers to the same
 * question, disagreeing in public, which is the exact failure this marketplace
 * was built to end. The recommendation is found in the list by id.
 *
 * WHICH ALSO MEANS A STONE THAT IS NOT YOURS HAS NO PAGE. Thirty stones exist
 * and this route answers for the four or five the chart called for; anything
 * else is a link from somewhere it should not have been, and it is told so
 * plainly rather than being quietly prescribed.
 */
export function AstroGemstone() {
  const { gemId } = useParams();
  const q = useAstroGemstones();
  const data = q.data;
  const needsProfile = Boolean(data && 'needsProfile' in data && data.needsProfile);
  const recs = data && !needsProfile && 'recommendations' in data ? data.recommendations : [];
  const rec = recs.find((r) => r.gem.id === gemId) ?? null;

  if (q.isLoading) return <Spinner label="Reading your chart…" />;

  if (q.isError) {
    return (
      <Card className="gem-one-note">
        <p>
          We couldn’t read your chart just now. That’s a problem on our side, not your
          birth details — they’re untouched. Try again in a moment.
        </p>
      </Card>
    );
  }

  if (needsProfile || !data) return <NeedsProfileCard />;

  if (!rec) {
    return (
      <div>
        <AstroHeader title="That stone isn’t one of yours" lede="Nothing in your chart asks for it." />
        <Card className="gem-one-note">
          <p>
            Thirty stones exist and your chart called for {recs.length}. This isn’t one of them, so
            there is nothing here to read — we won’t write you a prescription for a stone you were
            not prescribed.
          </p>
          <Link className="gem-one-back" to="/astrology/gemstones">← Back to your gemstones</Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <AstroHeader title={rec.gem.name} lede="One of the stones your own chart calls for." />
      <Link className="gem-one-back" to="/astrology/gemstones">← Back to your gemstones</Link>
      <div className="gem-one-sheet">
        <StoneSheet rec={rec} />
      </div>
    </div>
  );
}
