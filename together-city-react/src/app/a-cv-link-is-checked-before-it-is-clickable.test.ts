import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { webUrl } from '@/features/jobs/cv-labels';

/**
 * A URL ON THIS PROFILE WAS WRITTEN BY A MODEL OR TYPED INTO A BOX.
 *
 * Every `url` on a CvEntry comes from `AiService.readCvEntries` reading a PDF,
 * or from the citizen's own editor. Neither is a vetted web address, and
 * `javascript:` parses as a URL perfectly well — it just runs when clicked.
 *
 * Today the only person who can see the document is the person it describes, so
 * the worst case is self-inflicted. That is exactly why this is worth a test
 * rather than a comment: the whole point of the professional record is that it
 * becomes shareable, and the day `profileVisibility` stops being 'private' for
 * everyone is not the day anybody will remember to re-check the anchors.
 */
const root = join(__dirname, '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

describe('a cv link is checked before it is clickable', () => {
  it('passes an ordinary web address through', () => {
    expect(webUrl('https://somen.dev/work')).toBe('https://somen.dev/work');
    expect(webUrl('http://example.org')).toBe('http://example.org/');
  });

  it('gives a bare domain the scheme people meant', () => {
    // The commonest way a CV writes a portfolio. Refusing it would be correct
    // and useless.
    expect(webUrl('somen.dev')).toBe('https://somen.dev/');
    expect(webUrl('  www.linkedin.com/in/somen  ')).toBe('https://www.linkedin.com/in/somen');
    expect(webUrl('//cdn.example.com/cv')).toBe('https://cdn.example.com/cv');
  });

  it('refuses every scheme that is not the web', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      '  javascript:alert(1)  ',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
      'blob:https://example.com/abc',
    ]) {
      expect(webUrl(bad), bad).toBeNull();
    }
  });

  it('returns null rather than a broken anchor for nothing at all', () => {
    expect(webUrl('')).toBeNull();
    expect(webUrl('   ')).toBeNull();
    expect(webUrl('http://')).toBeNull();
  });

  /**
   * The guard is worth nothing if the next component to print a link forgets
   * it. Any `href={...}` in this feature must be a checked value — a literal
   * route or a `webUrl(...)` result — never a field off the record.
   */
  it('has no component in the jobs hub that hrefs a stored url directly', () => {
    const files = [
      'features/jobs/components/ProfessionalProfile.tsx',
      'features/jobs/components/EntryEditor.tsx',
      'features/jobs/components/CvReview.tsx',
      'features/jobs/components/CareerAndPrivacy.tsx',
      'features/jobs/components/Completion.tsx',
    ];
    const offenders: string[] = [];
    for (const f of files) {
      for (const [i, line] of src(f).split('\n').entries()) {
        const m = /href=\{([^}]*)\}/.exec(line);
        if (!m) continue;
        const expr = m[1];
        const checked = expr.includes('webUrl') || /^href$/.test(expr.trim());
        if (!checked) offenders.push(`${f}:${i + 1} → href={${expr}}`);
      }
    }
    expect(offenders, 'href must carry a webUrl-checked value').toEqual([]);
  });
});
