import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeText, count, percent, seconds } from '@/features/insights/format';
import { DEFINITIONS } from '@/features/insights/definitions';
import { sampleOf } from '@/features/insights/fake-dashboard';

/**
 * THE CONTROL ROOM BEHIND THE CITY (owner, 16 Sep): /investor/analytics.
 * Real numbers or an honest dash; sample numbers only behind the switch, and
 * labelled; nothing personal; a door from the deck.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const src = (p: string) => readFileSync(resolve(HERE, '..', p), 'utf8');
const insightsDir = resolve(HERE, '..', 'features/insights');

describe('the page', () => {
  it('has a door from the numbers on the deck', () => {
    expect(src('pages/Investor.tsx')).toContain('<Link className="dk-more" to="/investor/analytics">See the full numbers</Link>');
    expect(src('app/router.tsx')).toContain("{ path: '/investor/analytics', element: wrap(<InvestorAnalytics />) },");
  });

  it('reads every number through one data layer, from the two server doors', () => {
    const api = src('features/insights/api.ts');
    expect(api).toContain("'/insights/investor'");
    expect(api).toContain("'/insights'");
    expect(api).toContain("'x-investor-password'");
    for (const name of ['getDashboardOverview', 'getCityActivity', 'getRetention', 'getAcquisition', 'getAIAnalytics', 'getRevenueMetrics', 'getPlatformHealth', 'getLiveActivity']) {
      expect(api).toContain(`const ${name} =`);
    }
  });

  it('uses sample data only behind the switch, and marks it everywhere', () => {
    const importers = readdirSync(insightsDir).filter((f) => f !== 'fake-dashboard.ts' && /from '\.\/fake-dashboard'/.test(readFileSync(join(insightsDir, f), 'utf8')));
    expect(importers).toEqual(['api.ts']);
    expect(src('features/insights/api.ts')).toContain('opts.sample ? sampleOf(section, range)');
    expect(sampleOf('overview', '30d').sample).toBe(true);
    expect(src('pages/InvestorAnalytics.tsx')).toContain('SAMPLE DATA — invented numbers');
    expect(src('features/insights/parts.tsx')).toContain('<span className="ix-sample">Sample</span>');
  });

  it('never samples revenue into existence', () => {
    const s = sampleOf('money', '30d');
    expect(s.monetised).toBe(false);
    expect(s.mrr.value).toBeNull();
  });

  it('shows nothing personal', () => {
    const all = readdirSync(insightsDir).map((f) => readFileSync(join(insightsDir, f), 'utf8')).join('\n');
    expect(all).not.toMatch(/\bemail\b|phoneNumber|\.handle\b|Member #|dateOfBirth/);
  });

  it('explains every number it shows', () => {
    const sections = src('features/insights/sections.tsx');
    for (const m of sections.matchAll(/DEFINITIONS\.(\w+)/g)) expect(DEFINITIONS).toHaveProperty(m[1]);
    for (const v of Object.values(DEFINITIONS)) expect(v.length).toBeGreaterThan(20);
  });

  it('draws with the city’s tokens, not colours of its own', () => {
    expect(src('styles/insights.css')).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(src('main.tsx')).toContain("import './styles/insights.css';");
  });

  it('remembers where a member first came from, and sends it once', () => {
    expect(src('api/visits.api.ts')).toContain('const t = firstTouch();');
    expect(src('api/origin.ts')).toContain("http.post('/insights/origin'");
    expect(src('layouts/RootChrome.tsx')).toContain('sendOrigin(signedInId, visitorId())');
  });
});

describe('how numbers are written', () => {
  it('says a dash for what could not be measured', () => {
    expect(count(null)).toBe('—');
    expect(percent(null)).toBe('—');
    expect(seconds(null)).toBe('—');
    expect(count(12345)).toBe('12,345');
    expect(seconds(420)).toBe('7m');
  });

  it('writes changes with a sign and a unit, and nothing when there is no honest change', () => {
    expect(changeText({ pct: 38, note: null }, 'pct')).toBe('+38%');
    expect(changeText({ pct: -4.2, note: null }, 'pts')).toBe('−4.2 pts');
    expect(changeText({ pct: null, note: 'Not enough data' }, 'pct')).toBeNull();
  });
});
