import { SendMessageSchema, ShareCardSchema } from './dto/messages.dto';

const CONV = '11111111-1111-1111-1111-111111111111';

describe('ShareCardSchema — cross-hub share cards', () => {
  const cards: Record<string, unknown> = {
    movie: {
      kind: 'movie', hub: 'Entertainment', title: 'Dune: Part Two',
      subtitle: 'English • Sci-Fi', image: null, meta: ['★ 8.2', 'Sci-Fi'],
      deepLink: '/entertainment/movies?t=movie-693134',
    },
    tv: {
      kind: 'tv', hub: 'Entertainment', title: 'Severance',
      subtitle: 'English • Drama', image: 'https://image.tmdb.org/x.jpg', meta: ['★ 8.7'],
      deepLink: '/entertainment/movies?t=tv-95396',
    },
    recipe: { kind: 'recipe', hub: 'Nutrition', title: 'Dal Tadka', image: null },
    job: { kind: 'job', hub: 'Jobs', title: 'Frontend Engineer', priceInr: 2500000 },
    restaurant: { kind: 'restaurant', title: 'Blue Tokai' },
  };

  for (const [name, card] of Object.entries(cards)) {
    it(`accepts a ${name} card`, () => {
      expect(ShareCardSchema.safeParse(card).success).toBe(true);
    });
  }

  it('rejects a card with no title', () => {
    expect(ShareCardSchema.safeParse({ kind: 'movie' }).success).toBe(false);
  });
});

describe('SendMessageSchema — Entertainment "Send" payload', () => {
  it('accepts a share-only message (empty text) for a movie', () => {
    const dto = {
      conversationId: CONV,
      body: '',
      share: { kind: 'movie', hub: 'Entertainment', title: 'Dune', image: null },
    };
    const r = SendMessageSchema.safeParse(dto);
    expect(r.success).toBe(true);
  });

  it('accepts a movie share with an optional message', () => {
    const dto = {
      conversationId: CONV,
      body: 'must watch! 🍿',
      share: { kind: 'tv', hub: 'Entertainment', title: 'Severance', image: null },
    };
    expect(SendMessageSchema.safeParse(dto).success).toBe(true);
  });

  it('rejects an empty message with no text, attachment, or share', () => {
    expect(SendMessageSchema.safeParse({ conversationId: CONV, body: '   ' }).success).toBe(false);
  });

  it('rejects a non-uuid conversationId', () => {
    const dto = { conversationId: 'not-a-uuid', share: { kind: 'movie', title: 'X' } };
    expect(SendMessageSchema.safeParse(dto).success).toBe(false);
  });
});
