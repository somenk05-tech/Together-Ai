import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';
import { HUB_ICON } from '@/nav/registry';
import { useHubTheme } from '@/hooks/useHubTheme';
import { Icon } from '@/components/ui/Icon';
import { HubConsentGate } from '@/features/privacy/HubConsentGate';

/**
 * Hub → hero image, matching the vanilla website's hub landings 1:1
 * (assets/img filenames taken from the original *.html hub pages).
 */
const HUB_HERO: Partial<Record<HubKey, string>> = {
  travel: 'travel-hub.webp',
  restaurants: 'resturants.webp',
  astrology: 'astrology-hub.webp',
  nutrition: 'nutrition-and-groceies.webp',
  entertainment: 'entertainment.webp',
  social: 'social-life.webp',
  dating: 'dating-hub.webp',
  realestate: 'real-estate.webp',
  jobs: 'jobs-hub.webp',
  medical: 'medical-hub.webp',
  financial: 'financial-district.webp',
  beauty: 'beautymarket.webp',
  fitness: 'fitness-hero.webp',
  // Mail has no commissioned hero of its own, and the fallback below resolved
  // to mail.webp — a file that has never existed, so /mail rendered an empty
  // frame. Correspondence is people you are in touch with, and this is the
  // nearest thing in the library; it is a stand-in, not the right picture, and
  // it should be replaced when Mail gets art of its own.
  mail: 'connections-hero.webp',
};

/**
 * One component that renders every hub's landing page from config — the vanilla
 * site had 12 near-identical hub homepages; here it's a single data-driven page.
 *
 * ── THE PHOTOGRAPH STOPPED BEING THE BACKGROUND ──
 *
 * It used to be full-bleed, with the hub's name, its line and its button set in
 * white on top of a dark scrim. That worked when the whole application was warm
 * paper and gold; on a white one it was the only screen where a citizen read
 * light type over a picture, and the scrim existed purely to make somebody
 * else's photograph safe to write on.
 *
 * Now the picture is a picture. It sits in a case at the top of a plate, and
 * everything that has to be READ sits below it on white, at the size and weight
 * it deserves rather than the size the darkest part of the image allowed. The
 * hierarchy is the same — image first, words second — but nothing is competing
 * for the same pixels.
 */
export function HubLanding({ hub }: { hub: HubKey }) {
  useHubTheme(hub);
  const cfg = HUBS[hub];
  const firstInner = cfg.items[0]?.path ?? cfg.backPath;
  const heroSrc = `/assets/img/${HUB_HERO[hub] ?? `${hub}.webp`}`;
  // The poster earns one showing (consumer review #7): a returning citizen
  // walks straight into their own kitchen. First visit still sees it (and the
  // consent gate, which always has the final word), and the per-user seen
  // flags are wiped with the rest of tc:* on sign-out/user-switch.
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  let seen = false;
  try { seen = authed && localStorage.getItem(`tc:hub-seen:${hub}`) === '1'; } catch { seen = false; }
  useEffect(() => {
    if (authed) try { localStorage.setItem(`tc:hub-seen:${hub}`, '1'); } catch { /* storage unavailable */ }
  }, [authed, hub]);
  if (seen) {
    return (
      <HubConsentGate hub={hub}>
        <Navigate to={firstInner} replace />
      </HubConsentGate>
    );
  }
  return (
    <HubConsentGate hub={hub}>
      <div className="hub-stage">
        <article className="hub-plate">
          {/* `.no-case` because the plate draws the rim itself, at the radius the
              plate uses. The global image case would draw a second one 1px in. */}
          <div className="hub-plate-art">
            <img className="no-case" src={heroSrc} alt="" />
          </div>
          <div className="hub-plate-foot">
            <span className="hub-plate-icon" aria-hidden>
              <Icon name={HUB_ICON[hub] ?? 'place'} size={30} strokeWidth={2} />
            </span>
            <div className="hub-plate-said">
              <h1>{cfg.name}</h1>
              <p>{cfg.tag}</p>
            </div>
            <Link to={firstInner} className="hub-plate-cta">
              Explore now<span aria-hidden> →</span>
            </Link>
          </div>
        </article>
      </div>
    </HubConsentGate>
  );
}
