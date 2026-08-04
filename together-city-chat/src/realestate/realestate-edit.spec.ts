import { NotFoundException } from '@nestjs/common';
import { RealEstateService } from './realestate.service';
import type { PostPropertyDto } from './dto/realestate.dto';

/**
 * Edit and Close (audit C-4) — what makes them safe:
 *
 *  • only the owner can touch a listing, and a non-owner gets the same 404 a
 *    typo gets — an id must not be probeable;
 *  • an edit re-runs moderation on the NEW content: "approved" describes the
 *    words that were approved, not the row;
 *  • close keeps the row (My Listings history) but marks it 'removed', which
 *    every public surface already treats as not-there;
 *  • closing is reversible by design: edit & save relists through moderation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const ROW = {
  id: 'prop-1', sellerId: 'owner-1', moderation: 'approved', moderationJson: null,
  listingType: 'sale', propertyType: 'apartment', status: 'ready',
  title: '2BHK in Indiranagar', city: 'Bengaluru', locality: 'Indiranagar',
  priceInr: 9_000_000, areaSqft: 1200, bedrooms: 2, bathrooms: 2,
  furnishing: 'semi', floor: 5, totalFloors: 12, facing: 'east',
  amenities: '', description: 'Sunlit two-bedroom.', photosJson: '[]',
  projectName: null, developer: null, reraId: null, possessionDate: null,
  progressPct: null, floorPlansJson: null, milestonesJson: null, createdAt: new Date('2026-08-01T10:00:00Z'),
};

const DTO: PostPropertyDto = {
  listingType: 'sale', propertyType: 'apartment', status: 'ready',
  title: '2BHK in Indiranagar — price corrected', city: 'Bengaluru', locality: 'Indiranagar',
  priceInr: 9_500_000, areaSqft: 1200, bedrooms: 2, bathrooms: 2,
  furnishing: 'semi', facing: 'east', amenities: [], photos: [],
} as PostPropertyDto;

function build(row: Record<string, unknown> | null = ROW) {
  const s: any = Object.create(RealEstateService.prototype);
  const updates: any[] = [];
  const logs: any[] = [];
  s.prisma = {
    property: {
      findUnique: async () => row,
      findMany: async () => [],
      count: async () => 0,
      update: async (a: any) => { updates.push(a.data); return { ...ROW, ...a.data }; },
    },
    user: { findUnique: async () => ({ createdAt: new Date('2016-01-01T00:00:00Z') }) },
    moderationLog: { create: async (a: any) => { logs.push(a.data); } },
  };
  s.ai = { json: async () => null };
  s.clock = { dayIn: () => '2026-08-04', timezoneFor: async () => 'Asia/Kolkata' };
  return { s, updates, logs };
}

describe('edit — the owner changes the listing, moderation re-reads it', () => {
  it('updates the row and re-moderates the new content', async () => {
    const { s, updates } = build();
    const out = await s.update('owner-1', 'prop-1', DTO);
    expect(updates[0].title).toBe('2BHK in Indiranagar — price corrected');
    expect(updates[0].priceInr).toBe(9_500_000);
    // second update writes the fresh moderation decision
    expect(updates[1].moderation).toBe('approved');
    expect(out.notice).toContain('live in Explore');
  });

  it('a non-owner (and a missing id) gets the same 404', async () => {
    await expect(build().s.update('stranger', 'prop-1', DTO)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build(null).s.update('owner-1', 'prop-1', DTO)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('close — sold homes leave Explore, not My Listings', () => {
  it('marks the row removed with a reason that names the way back', async () => {
    const { s, updates, logs } = build();
    const out = await s.close('owner-1', 'prop-1');
    expect(out).toEqual({ id: 'prop-1', moderation: 'removed' });
    expect(updates[0].moderation).toBe('removed');
    expect(JSON.parse(updates[0].moderationJson).reasons.join(' ')).toContain('relist');
    expect(logs[0].decision).toBe('removed');
  });

  it('only the owner can close', async () => {
    await expect(build().s.close('stranger', 'prop-1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
