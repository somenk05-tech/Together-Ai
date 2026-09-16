import { readFileSync } from 'fs';
import { join } from 'path';
import { MENTION_PATTERN, TAG_CHAR, TAG_LEAD, TAG_PATTERN, handlesIn, normaliseTag, tagsIn } from './tags';

/**
 * A TAG IS A DOOR (owner, 16 Sep): "add tags for Together City social life".
 * A #tag opens every post carrying it; an @handle opens that citizen's channel.
 */
const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

describe('what a caption tags', () => {
  it('reads the tags the composer has always appended, one door per spelling', () => {
    expect(tagsIn('good hair + skin day! thanks to @togethercity\n\n#HairCare #TogetherCity #haircare'))
      .toEqual(['haircare', 'togethercity']);
  });

  it('keeps every script whole, vowel signs included', () => {
    expect(tagsIn('#नमस्ते #café #日本 #city_life.')).toEqual(['नमस्ते', 'café', '日本', 'city_life']);
  });

  it('is not fooled by an address, a word, a number, an emoji or a run-on', () => {
    expect(tagsIn('example.com/#section a#b #1 #2026')).toEqual([]);
    expect(tagsIn('#love😀 “#quoted” (#aside)')).toEqual(['love', 'quoted', 'aside']);
    expect(tagsIn(`#${'x'.repeat(51)} #ok`)).toEqual(['ok']);
  });

  it('files at most twenty per post', () => {
    const many = Array.from({ length: 25 }, (_, i) => `#t${i}`).join(' ');
    expect(tagsIn(many)).toHaveLength(20);
  });

  it('routes a tag the way it stores it', () => {
    expect(normaliseTag('#CityLife')).toBe('citylife');
    expect(normaliseTag('city life')).toBeNull();
    expect(normaliseTag('123')).toBeNull();
    expect(normaliseTag('')).toBeNull();
  });
});

describe('who a caption mentions', () => {
  it('reads handles, not email addresses, and leaves the full stop to the sentence', () => {
    expect(handlesIn('thanks to @TogetherCity. mail a@b.com, and (@priya.k)')).toEqual(['togethercity', 'priya.k']);
    expect(handlesIn('@ab is too short')).toEqual([]);
  });
});

describe('one reading on both sides of the wire', () => {
  it('the web links exactly what the server files', () => {
    const line = (src: string, name: string) => src.split('\n').find((l) => l.startsWith(`export const ${name} = `));
    const server = read('together-city-chat/src/social/tags.ts');
    const web = read('together-city-react/src/features/social/captionTags.ts');
    for (const name of ['TAG_CHAR', 'TAG_LEAD', 'TAG_PATTERN', 'MENTION_PATTERN']) {
      expect(line(web, name)).toBeDefined();
      expect(line(web, name)).toBe(line(server, name));
    }
    expect(TAG_PATTERN.flags).toBe('gu');
    expect(MENTION_PATTERN.flags).toBe('gu');
  });

  it('the migration indexes the old captions with the same characters', () => {
    const sql = read('together-city-chat/prisma/migrations/20260916T120000_a_tag_is_a_door/migration.sql');
    const pg = (s: string) => s.replace(/\\u\{([0-9A-F]{5})\}/g, (_, h: string) => `\\U000${h}`).replace(/'/g, "''");
    expect(sql).toContain(`${pg(TAG_LEAD)}#(${pg(TAG_CHAR)}{1,50})(?!${pg(TAG_CHAR)})`);
  });
});

describe('the tag page and the tag list', () => {
  const svc = read('together-city-chat/src/social/social.service.ts');

  it('narrows the feed and keeps every gate the feed has', () => {
    expect(svc).toMatch(/const cityWide = tag !== null \|\|/);
    expect(svc).toContain("...(tag ? ({ tags: { some: { tag } } } as object) : {}),");
    expect(svc).toContain("if (rawTag !== undefined && !tag) throw new BadRequestException('That is not a tag.');");
  });

  it('counts only public, visible posts by reachable accounts', () => {
    expect(svc).toContain("post: { ...VISIBLE_ONLY, audience: 'public', author: REACHABLE_USER },");
  });

  it('re-reads a caption on every write', () => {
    expect(svc).toContain('await this.writeTags(post.id, post.text, post.createdAt);');
    expect(svc).toContain('if (dto.text !== undefined) await this.writeTags(postId, updated.text, updated.createdAt);');
  });
});
