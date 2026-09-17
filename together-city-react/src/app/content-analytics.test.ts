import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p: string) => readFileSync(join(APP, p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

/**
 * ── CONTENT ANALYTICS (owner, 17 Sep) ───────────────────────────────────────
 *
 * "Add this to the analytics dashboard": a combined view of every upload on
 * every connected platform, a content audit, one page per piece of content
 * and the click-through funnel. Public counts only; founder-only on /dev.
 */
describe('Content analytics', () => {
  const page = strip(read('src/features/dev/ContentAnalytics.tsx'));
  const api = strip(read('src/features/dev/analytics.api.ts'));
  const css = read('src/styles/content-analytics.css');

  it('is a tab on the developer page, and /dev?tab=analytics opens on it', () => {
    const dev = strip(read('src/features/dev/pages/Dev.tsx'));
    expect(dev).toContain("{tab === 'analytics' && <DevContentAnalytics password={password} />}");
    expect(dev).toMatch(/get\('tab'\) === 'analytics'/);
    expect(dev).toContain("['analytics', 'Content analytics']");
  });

  it('has the eight views the owner listed, and every date range', () => {
    for (const v of ['Overview', 'Combined view', 'Content audit', 'Videos', 'Posts', 'Campaigns', 'Platforms', 'Conversions']) {
      expect(page).toContain(`'${v}'`);
    }
    for (const r of ['Today', '7 days', '30 days', '90 days', '6 months', 'All time', 'Custom']) expect(page).toContain(`'${r}'`);
  });

  it('filters by platform, channel, content type, topic, series, episode, campaign and date', () => {
    for (const l of ['Platform', 'Channel', 'Content type', 'Topic', 'Series', 'Episode', 'Campaign']) expect(page).toContain(`label="${l}"`);
    for (const k of ['platform?', 'topic?', 'series?', 'episode?', 'campaign?', 'type?', 'from?', 'to?']) expect(api).toContain(k);
  });

  it('never turns an unmeasured number into a zero', () => {
    expect(page).toMatch(/v === null \|\| v === undefined \? '—'/);
    expect(page).not.toMatch(/\?\?\s*0\)\s*\}/);
    expect(page).toContain('f.reason');
  });

  it('calls platform views platform views, and says which count is people', () => {
    expect(page).toContain('Total platform views');
    expect(page).toContain('Estimated unique reach');
    expect(page).toMatch(/Nobody can say how many different people watched/);
  });

  it('sorts the audit by every column the owner named, and opens a row', () => {
    for (const k of ['views', 'reach', 'engagements', 'ctr', 'watchTime', 'followers', 'conversions']) {
      expect(page).toMatch(new RegExp(`\\['${k}', '`));
    }
    expect(page).toContain('aria-sort');
    expect(page).toContain('onClick={() => open(r.id)}');
  });

  it('has a detail page with rewatch and drop-off, a timeline, and the funnel', () => {
    for (const k of ["'rewatch'", "'dropOff'", "'completion'", "'avgWatchDuration'"]) expect(page).toContain(k);
    expect(page).toContain('<Timeline points={d.timeline} />');
    expect(page).toContain('<Funnel stages={d.funnel}');
    expect(api).toContain('/dev/media/analytics/${encodeURIComponent(id)}');
  });

  it('opens each funnel stage through the disclosure contract', () => {
    expect(page).toContain('useDisclosure()');
    expect(page).toContain('{...d.faceProps}');
    expect(page).not.toMatch(/aria-expanded=\{/);
  });

  it('draws one series per chart on one axis, with a crosshair and a table beside it', () => {
    expect((page.match(/<Line title=/g) ?? []).length).toBe(4);
    expect(page).toContain('ca-cross');
    expect(page).toContain('The same, as a table');
  });

  it('keeps its looks in its own sheet, in tokens', () => {
    expect(page).not.toMatch(/style=\{\{/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(read('src/main.tsx')).toContain("import './styles/content-analytics.css';");
  });

  it('lets an upload name its series, episode and campaign', () => {
    const desk = strip(read('src/features/dev/Media.tsx'));
    for (const k of ['series: series.trim()', 'episode: episode.trim()', 'campaign: campaign.trim()']) expect(desk).toContain(k);
  });

  it('says in the privacy policy what the channels do, as the YouTube audit asks', () => {
    const legal = read('src/features/legal/legal-data.ts');
    expect(legal).toContain('YouTube API Services');
    expect(legal).toContain('https://www.youtube.com/t/terms');
    expect(legal).toContain('https://policies.google.com/privacy');
    expect(legal).toContain('https://myaccount.google.com/permissions');
    expect(legal).toMatch(/links in our posts carry a short tag/);
  });

  it('labels a film as AI-made unless the owner unticks it', () => {
    const desk = strip(read('src/features/dev/Media.tsx'));
    expect(desk).toContain('const [ai, setAi] = useState(true);');
    expect(desk).not.toContain('setAi(false)');
  });

  it('records which post a visitor arrived from', () => {
    const visits = strip(read('src/api/visits.api.ts'));
    expect(visits).toContain('arrival: arrivalHere()');
    expect(visits).toContain("get('utm_content')");
  });
});
