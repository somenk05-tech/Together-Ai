import { BadRequestException } from '@nestjs/common';
import { LocalServicesService } from './local-services.service';
import { categoryKeysInGroup, isCategoryGroup } from './categories';

/**
 * PRESSING A GROUP HAS TO NARROW SOMETHING.
 *
 * The directory offers two levels — eighteen families on the first row, the
 * trades inside one on the second — and for a long time only the second one
 * reached the query. Pressing "Automotive" opened the automotive trades and
 * then listed a beauty salon, which is the page asking a question and
 * ignoring the answer. Found by the owner looking at a render.
 *
 * These tests read the `where` clause the service actually builds, rather than
 * the rows it returns, because the defect was never in the rows: the query
 * simply never mentioned the category at all.
 */

type Where = Record<string, unknown>;

function harness() {
  const seen: Where[] = [];
  const prisma = {
    serviceListing: {
      findMany: async ({ where }: { where: Where }) => { seen.push(where); return []; },
      count: async () => 0,
    },
    serviceReview: { groupBy: async () => [] },
  };
  // Built without the constructor, like every other harness in this folder, and
  // handed only the three collaborators the browse path reaches. Typed as a
  // bag on the way in and as the service on the way out, so nothing here needs
  // `any` to assign a private field.
  const bag = Object.create(LocalServicesService.prototype) as Record<string, unknown>;
  bag.prisma = prisma;
  bag.notifications = { create: async () => undefined };
  bag.verification = { summariesFor: async () => new Map() };
  const svc = bag as unknown as LocalServicesService;
  return { svc, where: (): Where => seen[seen.length - 1] ?? {} };
}

describe('browsing by group', () => {
  it('narrows the query to the trades inside it', async () => {
    const h = harness();
    await h.svc.browse({ group: 'Automotive' });
    const keys = categoryKeysInGroup('Automotive');
    expect(keys.length).toBeGreaterThan(3);
    expect(h.where().categoryKey).toEqual({ in: keys });
    // The whole bug in one assertion: a salon's key is not in that list.
    expect(keys).not.toContain('beauty_salons');
  });

  it('lets the trade win over the family when both arrive', async () => {
    // Not a preference — applying both is the same filter written twice, which
    // is right today and wrong the first time a trade moves between groups.
    const h = harness();
    await h.svc.browse({ group: 'Automotive', category: 'mechanics' });
    expect(h.where().categoryKey).toBe('mechanics');
  });

  it('constrains nothing when neither is chosen', async () => {
    const h = harness();
    await h.svc.browse({});
    expect(h.where().categoryKey).toBeUndefined();
    expect(h.where().moderation).toBe('approved');
  });

  it('refuses a group that does not exist rather than returning the city', async () => {
    // A filter that silently does nothing is how this defect survived: an
    // unknown value has to be an error, not an empty where-clause.
    const h = harness();
    await expect(h.svc.browse({ group: 'Spaceports' })).rejects.toBeInstanceOf(BadRequestException);
    expect(isCategoryGroup('Spaceports')).toBe(false);
    expect(isCategoryGroup('Automotive')).toBe(true);
  });

  it('every trade belongs to a group the filter can reach', async () => {
    // If a category's group is not a real group, that trade is unreachable
    // from the first row of chips — visible only to somebody who guessed.
    const { CATEGORY_GROUPS, SERVICE_CATEGORIES } = await import('./categories');
    for (const c of SERVICE_CATEGORIES) expect(CATEGORY_GROUPS).toContain(c.group);
    const covered = CATEGORY_GROUPS.flatMap((g) => categoryKeysInGroup(g));
    expect(covered.sort()).toEqual(SERVICE_CATEGORIES.map((c) => c.key).sort());
  });
});
