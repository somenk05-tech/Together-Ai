import { ShareCardSchema } from './dto/messages.dto';

/**
 * ── A CARD DOES NOT CARRY A KEY TO THE BUCKET ───────────────────────────────
 *
 * The 31 Aug audit. Social post media lives in the private bucket and is
 * signed on read, so `post.media[0].url` in the client is a presigned GET —
 * and both social share cards put it straight into `ShareCard.image`, which is
 * persisted on the message row and rendered by whoever receives it.
 *
 * Three faults, and the third is the one that makes it more than untidy:
 *
 *   · a presigned URL carries no requester identity. It is a bearer credential
 *     for a private object, sitting in a chat message forever, readable by
 *     anyone who can read the row or a log line that quotes it;
 *   · it expires, so the card was always going to rot into a broken image;
 *   · the recipient may not be allowed to see that post. A card carrying the
 *     photograph shows a friends-only picture to a stranger — the repost
 *     audience bug on a different surface. `deepLink` is the honest half: it
 *     goes to the permalink, and the permalink asks `assertCanView`.
 *
 * DROPPED, NOT REFUSED, and the tests say why. The API and the web app deploy
 * independently; a rejection would 400 every social share for as long as the
 * API ran ahead of the client. Dropping converges on the same end state
 * whichever half lands first.
 */

const card = (image: string | null) =>
  ShareCardSchema.safeParse({ kind: 'post', title: 'A post', image, deepLink: '/social/p/1' });

describe('a share card picture may not be a signed URL', () => {
  it('drops an AWS presigned GET, and keeps the rest of the card', () => {
    const out = card('https://b.s3.ap-south-1.amazonaws.com/social/me/a.jpg'
      + '?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIA%2F20260831&X-Amz-Signature=deadbeef');
    expect(out.success).toBe(true);
    if (!out.success) return;
    expect(out.data.image).toBeNull();
    // The message still sends. That is the deploy-window decision.
    expect(out.data.title).toBe('A post');
    expect(out.data.deepLink).toBe('/social/p/1');
  });

  it('recognises the other signing schemes, not just the one we use today', () => {
    for (const q of ['X-Amz-Credential=x', 'X-Goog-Signature=x', 'AWSAccessKeyId=x']) {
      const out = card(`https://b.example/o.jpg?${q}`);
      expect(out.success && out.data.image).toBeNull();
    }
  });

  it('is not fooled by the parameter arriving second', () => {
    const out = card('https://b.example/o.jpg?response-content-type=image%2Fjpeg&X-Amz-Signature=abc');
    expect(out.success && out.data.image).toBeNull();
  });

  it('leaves an ordinary picture alone', () => {
    // Every other hub sends a real public URL here — a film poster, a listing
    // photograph — and this must not touch them.
    const poster = 'https://image.tmdb.org/t/p/w500/abc.jpg';
    expect(card(poster).success && (card(poster) as { data: { image: string } }).data.image).toBe(poster);
    const path = card('/img/placeholder.png');
    expect(path.success && path.data.image).toBe('/img/placeholder.png');
    expect(card(null).success && card(null).success).toBe(true);
  });

  it('still refuses the schemes that were already refused', () => {
    // A payload, and the two other things an <img src> can do. See the field's
    // docblock — this is the 29 Aug rule and it is not weakened by the above.
    expect(card('data:image/png;base64,AAAA').success).toBe(false);
    expect(card('http://insecure.example/x.jpg').success).toBe(false);
    expect(card('javascript:alert(1)').success).toBe(false);
  });
});
