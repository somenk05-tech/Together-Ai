import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf8');

/**
 * MAIL, ON A PHONE.
 *
 * The desktop row put the subject and the snippet on one line, which reads
 * fine across 800px. At 390px that same row spent roughly 150 pixels on a
 * star, an avatar, a retry button and a bin before the words began, and then
 * capped the subject at 42% of what was left — about eighty pixels. Nobody has
 * read an email subject in eighty pixels.
 *
 * Below 560 the row now takes the shape every mail client on a phone has
 * arrived at independently: avatar, then sender / subject / snippet each on a
 * line of their own, each truncated once, star at the right edge.
 *
 * TWO THINGS HERE ARE EASY TO BREAK WITHOUT NOTICING.
 *
 * The bin is hidden on a phone only where the same job has another door — a
 * message carries Delete inside MessageView. A DRAFT does not: the composer
 * has no Discard yet, so hiding a draft's bin would make drafts undeleteable
 * on a phone. That distinction lives in one class name and would not survive a
 * careless tidy-up, so it is asserted here, and so is the fact it depends on.
 *
 * And the account card folds rather than disappearing. Everything it held is
 * still reachable behind Details — a control that is gone on small screens is
 * a feature that does not exist on small screens.
 */
describe('the mail list reads on a phone', () => {
  const css = read('index.css');
  const folders = read('features/mail/pages/Folders.tsx');
  const message = read('features/mail/pages/MessageView.tsx');

  const phone = () => {
    // The 560px block that contains the mail rules, not the first one in the file.
    const blocks = [...css.matchAll(/@media \(max-width: 560px\) \{[\s\S]*?\n\}/g)].map((m) => m[0]);
    return blocks.find((b) => b.includes('.mail-row')) ?? '';
  };

  it('gives the subject and the snippet a line each', () => {
    expect(phone()).toMatch(/\.mail-l2 \{ display: block/);
    // The desktop cap is what squeezed it; on a phone it must be lifted.
    expect(phone()).toMatch(/\.mail-subj \{[^}]*max-width: none/);
  });

  it('moves the star to the right edge rather than in front of the words', () => {
    expect(phone()).toMatch(/\.mail-star \{ order: \d/);
    // Not left of the avatar, which is where it used to be.
    expect(folders).not.toMatch(/mail-star[\s\S]{0,400}mail-av/);
  });

  it('hides the bin only where deleting has another door', () => {
    expect(phone()).toMatch(/\.mail-bin\.has-another-door \{ display: none/);
    // The door itself. If Delete ever leaves the message view, this hiding rule
    // strands every message on a phone.
    expect(message).toMatch(/Delete/);
    expect(message).toMatch(/remove\.mutate/);
  });

  it('keeps a draft its bin, because the composer has no Discard', () => {
    expect(folders).toMatch(/binHasAnotherDoor = !isDraft/);
    const compose = read('features/mail/pages/Compose.tsx');
    // The day the composer grows a Discard, drop the exception and this line.
    expect(compose, 'Compose now has Discard — the draft-bin exception can go')
      .not.toMatch(/discardDraft|Discard/);
  });

  /**
   * This case used to assert the opposite — that the card FOLDED rather than
   * disappearing, on the principle that a control gone on small screens is a
   * feature that does not exist on small screens. The owner overruled it on
   * 10 Aug, and the principle survives in the part that matters: the fields
   * are not deleted, they are not conditional, and the desk still shows them.
   * That is what is asserted here, so nobody can quietly turn "not offered on
   * a phone" into "gone".
   */
  it('offers the address alone on a phone, and keeps the rest for the desk', () => {
    expect(phone()).toMatch(/\.mail-account-meter[^}]*display: none/);
    expect(phone()).toMatch(/\.mail-account-rest \{ display: none/);
    // No door, anywhere: the disclosure button is gone from markup and sheet.
    expect(folders).not.toMatch(/mail-account-toggle/);
    expect(css).not.toMatch(/mail-account-toggle/);
    // And nothing behind it was thrown away — the card still renders the lot,
    // which is what a desk gets.
    expect(folders).toMatch(/mail-account-rest/);
    expect(folders).toMatch(/primaryEmail/);
    expect(folders).toMatch(/Add primary email/);
  });

  it('puts Compose under the thumb, and only on a phone', () => {
    expect(css).toMatch(/\.mail-fab \{ display: none; \}/);
    expect(phone()).toMatch(/\.mail-fab \{ display: inline-flex/);
    // Clear of the bottom bar, which is 58px plus the home indicator.
    expect(phone()).toMatch(/bottom: calc\(var\(--safe-bottom\) \+ \d+px\)/);
  });

  it('leaves no gold behind on the unread row', () => {
    // rgba(179,138,44,…) was the accent of a theme this application removed, and
    // it survived as the only warm pixel in a monochrome app. Matched as a
    // DECLARATION, not anywhere in the file — the comment above the replacement
    // quotes the old value so the next reader knows what the neutral replaced.
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(declarations).not.toMatch(/179\s*,\s*138\s*,\s*44/);
  });
});
