import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { telHref, whatsappHref } from './handoff';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(HERE, p), 'utf8');

/** A rule that bans a string reads the code, not the prose about the code. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

describe('a link is built from a number or from nothing', () => {
  it('dials and opens a real Indian mobile', () => {
    expect(telHref('+919876543210')).toBe('tel:+919876543210');
    expect(whatsappHref('+919876543210')).toBe('https://wa.me/919876543210');
  });

  it('drops the plus for wa.me by slicing, never by stripping', () => {
    // Stripping non-digits would turn '+91 98765 43210' — a string this file
    // has just refused — into a link to somebody. Slicing cannot.
    expect(whatsappHref('+919876543210')).toBe('https://wa.me/919876543210');
    expect(whatsappHref('+91 98765 43210')).toBeNull();
    expect(stripComments(read('handoff.ts'))).not.toContain('replace(/\\D/g');
  });

  it('returns null for everything that is not E.164, so the caller can fall back', () => {
    for (const junk of [
      null, undefined, '', '   ',
      '9876543210',        // no country code
      '+0119876543210',    // leading zero after the plus
      '098765 43210',      // as typed
      '+91-9876-543210',   // hyphenated
      'call me',
      '+911234',           // too short
      '+9198765432109876', // too long
      'tel:+919876543210', // already an href
      '+91987654321\n',    // a trailing newline out of a text column
    ]) {
      expect({ junk, tel: telHref(junk), wa: whatsappHref(junk) })
        .toEqual({ junk, tel: null, wa: null });
    }
  });
});

/**
 * THE FALLBACK IS THE POINT.
 *
 * Most conversations in this city will never yield a number — every dating
 * chat, every group, everyone who has not verified a phone. If a later edit
 * drops the `ring(...)` arm of either handler to tidy things up, those chats
 * lose calling altogether and nothing else in the suite notices: the WebRTC
 * tests all pass, because the stack still works and simply stops being called.
 * So the shape of both handlers is asserted here as text.
 */
describe('the in-app call is the fallback, not the casualty', () => {
  const src = stripComments(read('CallButtons.tsx'));

  it('tries the handset first in both handlers', () => {
    expect(src).toMatch(/const voice = \(\) => \{\s*if \(tel\)/);
    expect(src).toMatch(/const video = \(\) => \{\s*if \(wa\)/);
  });

  it('still rings in-app when there is no number', () => {
    expect(src).toMatch(/if \(tel\)[^}]*\}\s*ring\('audio'\)/);
    expect(src).toMatch(/if \(wa\)[^}]*\}\s*ring\('video'\)/);
  });

  it('builds its hrefs through handoff.ts rather than by hand', () => {
    expect(src).toContain("from './handoff'");
    expect(src).not.toMatch(/['"`]tel:\$?\{/);
    expect(src).not.toMatch(/wa\.me/);
  });

  it('opens WhatsApp in a new tab without handing it the opener', () => {
    // window.opener on a cross-origin tab is a navigation handle back to this
    // one; the chat header is not the place to give one away.
    expect(src).toContain("window.open(wa, '_blank', 'noopener,noreferrer')");
  });

  it('says what dialling costs, at the button', () => {
    // Not decoration. BusinessPage.tsx prints the same sentence over its call
    // key, and the reason is that a citizen should choose to be known rather
    // than discover afterwards that they were.
    expect(src).toMatch(/title=\{tel \?[^}]*your number/);
    expect(src).toMatch(/title=\{wa \?[^}]*your number/);
  });
});
