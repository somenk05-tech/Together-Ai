import { useEffect } from 'react';

/**
 * Marks the page as dark-chrome for as long as one of these surfaces is open.
 *
 * The footer is global chrome and is not restyled globally — the other three
 * screens in this hub are ordinary light pages and need the ordinary light
 * footer. This sets `data-surface="letter"` on <html> while the surface is
 * mounted and removes it on the way out, which is the same mechanism
 * useHubTheme() already uses for `data-hub`. A rule scoped to it cannot leak to
 * a page that is not a letter, and cannot survive one.
 */
export function useDarkChrome(): void {
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-surface', 'letter');
    return () => root.removeAttribute('data-surface');
  }, []);
}

/**
 * The letter surface — the whole of the daily and monthly guidance screens.
 *
 * There is no card here, no header, no chips, no sections and no icons, and
 * that is the design rather than an omission. The page this replaced put a
 * five-panel report on a white card under a heading that named the birth chart,
 * the transits, the running period and the numerology in its opening sentence.
 * What a citizen is meant to receive is a letter from someone who has been
 * paying attention, and a letter does not arrive with a legend.
 *
 * THE ARTWORK IS AN <img> AND SITS BELOW THE WRITING. Nothing is ever laid over
 * it. The upper area is flat ground the exact colour of the illustration's own
 * top edge, so however long the letter runs the sky simply continues.
 */
