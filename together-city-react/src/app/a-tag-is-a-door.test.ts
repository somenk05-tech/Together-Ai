import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normaliseTag, pieces, tagPath } from '@/features/social/captionTags';

/**
 * A TAG IS A DOOR (owner, 16 Sep): "add tags for Together City social life".
 * A caption's #tags open the tag's page; its @handles open the channel.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');

describe('a caption in pieces', () => {
  it('links the tags and the handle and gives the caption back whole', () => {
    const text = 'good hair + skin day! thanks to @togethercity.\n\n#HairCare #TogetherCity';
    const got = pieces(text);
    expect(got.map((p) => p.text).join('')).toBe(text);
    expect(got.filter((p) => p.kind === 'mention')).toEqual([{ kind: 'mention', text: '@togethercity', handle: 'togethercity' }]);
    expect(got.filter((p) => p.kind === 'tag').map((p) => (p.kind === 'tag' ? p.tag : ''))).toEqual(['haircare', 'togethercity']);
  });

  it('leaves addresses, emails, numbers and glued words as text', () => {
    const text = 'example.com/#section a#b #1 mail a@b.com';
    expect(pieces(text)).toEqual([{ kind: 'text', text }]);
  });

  it('keeps every script whole', () => {
    const tags = pieces('#नमस्ते #café #日本').flatMap((p) => (p.kind === 'tag' ? [p.tag] : []));
    expect(tags).toEqual(['नमस्ते', 'café', '日本']);
  });

  it('routes a tag the way the server stores it', () => {
    expect(normaliseTag('#CityLife')).toBe('citylife');
    expect(normaliseTag('42')).toBeNull();
    expect(tagPath('नमस्ते')).toBe(`/social/tags/${encodeURIComponent('नमस्ते')}`);
  });
});

describe('where the doors are', () => {
  it('every caption surface reads through RichText', () => {
    expect(src('features/social/PostCard.tsx')).toMatch(/<p className="sl-post-text"><RichText text=\{post\.text\} \/><\/p>/);
    expect(src('features/social/CityTV.tsx')).toMatch(/<RichText text=\{caption\} \/>/);
    expect(src('features/social/ReelsView.tsx').match(/<RichText text=\{post\.text\} \/>/g)).toHaveLength(2);
    // A tap on a link never reaches the card or the TV under it.
    expect(src('features/social/RichText.tsx').match(/e\.stopPropagation\(\)/g)).toHaveLength(3);
  });

  it('has a page for every tag and one for all of them', () => {
    const router = src('app/router.tsx');
    expect(router).toContain("{ path: '/social/tags', element: <RequireAuth>{wrap(<SocTags />)}</RequireAuth> },");
    expect(router).toContain("{ path: '/social/tags/:tag', element: <RequireAuth>{wrap(<SocTag />)}</RequireAuth> },");
    expect(src('features/social/api.ts')).toMatch(/'\/social\/tags'/);
  });

  it('the composer suggests tags the city uses, and says what a tag does now', () => {
    const composer = src('features/social/pages/CreatePost.tsx');
    expect(composer).toContain('<TagPicks prefix={tagDraft} chosen={hashtags}');
    expect(composer).not.toMatch(/no tag search yet/);
  });

  it('the search offers tags', () => {
    expect(src('components/CommandPalette.tsx')).toMatch(/Tags on Together TV/);
  });

  it('the @ in a caption finds people, and a tag shows and links the whole name', () => {
    const composer = src('features/social/pages/CreatePost.tsx');
    expect(composer).toContain('{mentionAt && mentionOptions.length > 0 && (');
    expect(composer).toContain("{tagged.length > 0 && <>with {tagged.map((t) => t.name).join(', ')}</>}");
    expect(composer).not.toMatch(/t\.name\.split\(' '\)\[0\]/);
    expect(src('features/social/PostCard.tsx')).toContain('<TaggedPeople people={post.tagged!} />');
  });
});

