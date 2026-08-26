import { useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth.store';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { HubConsentGate } from '@/features/privacy/HubConsentGate';

/**
 * Hub → hero image, matching the vanilla website's hub landings 1:1
 * (assets/img filenames taken from the original *.html hub pages).
 * Exported: the mobile Hubs grid (pages/Hubs.tsx) draws the same pictures —
 * one art list, not two that drift.
 */
export const HUB_HERO: Partial<Record<HubKey, string>> = {
  travel: 'travel-hub.webp',
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
  /* The sign-painter's facade: two shopfronts under one E-COMMERCE HUB sign,
     each with its own doorway and its own promise painted on the glass. Like
     the Local Services board, it tells somebody arriving what is inside before
     they read a word — which is the whole test a hub landing has to pass. */
  ecommerce: 'e-commerce.webp',
  /* The desktop plate. Without this line `heroSrc` falls back to `pets.webp`,
     which is not a file that exists — the poster is `hub-poster/pets.webp` and
     the landscape plate is `pets-hub.webp`, and the two are not the same
     picture. That fallback is exactly how Mail ended up drawing an empty frame
     for a file that had never existed. */
  pets: 'pets-hub.webp',
  // Commissioned for this hub and genuinely informative rather than
  // atmospheric: the billboards on it ARE the eighteen category groups, so the
  // picture tells a first-time visitor what is inside before they read a word.
  // That is why /services gets a landing after all — see the note in router.tsx.
  services: 'local-services.webp',
  // Mail has no commissioned hero of its own, and the fallback below resolved
  // to mail.webp — a file that has never existed, so /mail rendered an empty
  // frame. Correspondence is people you are in touch with, and this is the
  // nearest thing in the library; it is a stand-in, not the right picture, and
  // it should be replaced when Mail gets art of its own.
  mail: 'connections-hero.webp',
};

/**
 * THE CITY'S STREET-LEVEL LINES (owner's master list).
 *
 * One sentence per hub, the one its billboard says. It lives beside the art
 * maps because the landing and the home districts must speak the SAME line —
 * two copies of a sentence is how a hub ends up promising two things.
 */
export const HUB_LINE: Partial<Record<HubKey, string>> = {
  travel: 'Your world, planned your way.',
  nutrition: 'Your food, personalized to you.',
  dating: 'Matched by your birth charts, then by what you both want. Twenty likes a day, three chats at a time.',
  entertainment: 'Your world of things you love.',
  jobs: 'Your career, your next move.',
  medical: 'Your health, all in one place.',
  financial: 'Your money, working toward your goals.',
  realestate: 'Your perfect space, found for you.',
  fitness: 'Your body. Your goals. Your journey.',
  beauty: 'Your look, your way.',
  social: 'Your people. Your communities. Your world.',
  astrology: 'Your stars. Your journey. Your timing.',
  pets: 'Everything your pet needs. All in one place.',
  ecommerce: 'Your shopping, personalized or wide open.',
};

/**
 * SET ONE SENTENCE THE WAY A POSTER WOULD (owner's reference, 9 Aug).
 *
 * The reference is an editorial poster: a few small words, one enormous light
 * word carrying the meaning, a quieter tail. The rule here is deterministic
 * rather than hand-written per hub — the LONGEST word of the hub's line is the
 * one the eye should land on, which for these lines is always the word that
 * means something ('career', 'personalized', 'communities'). No copy is
 * invented and no hub needs its own layout.
 *
 * The reference tints its hero word. This city cannot: every accent it owns is
 * near-black, because the ground is white everywhere else. So the emphasis is
 * carried by weight and size instead — which is the same sentence Relief
 * speaks on every other screen.
 */
export function setLine(line: string): { before: string[]; hero: string; after: string[] } {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length < 3) return { before: [], hero: words.join(' '), after: [] };
  const bare = (w: string) => w.replace(/[^A-Za-z]/g, '');
  let heroAt = 0;
  words.forEach((w, i) => { if (bare(w).length > bare(words[heroAt]).length) heroAt = i; });
  return { before: words.slice(0, heroAt), hero: words[heroAt], after: words.slice(heroAt + 1) };
}

/**
 * PORTRAIT ART — one poster per hub, shaped like a phone (9:19.5), with the
 * hub's own name and line painted into the picture by the sign-painter.
 *
 * A hub landing on a phone is a threshold you arrive at, and these are built
 * to BE that screen rather than to sit inside it. Only hubs whose poster
 * exists are listed; anything unlisted falls back to the landscape hero, so a
 * missing file is a plainer landing, never an empty frame.
 */
export const HUB_PORTRAIT: Partial<Record<HubKey, string>> = {
  travel: 'hub-poster/travel.webp',
  astrology: 'hub-poster/astrology.webp',
  nutrition: 'hub-poster/nutrition.webp',
  entertainment: 'hub-poster/entertainment.webp',
  social: 'hub-poster/social.webp',
  dating: 'hub-poster/dating.webp',
  realestate: 'hub-poster/realestate.webp',
  jobs: 'hub-poster/jobs.webp',
  medical: 'hub-poster/medical.webp',
  financial: 'hub-poster/financial.webp',
  beauty: 'hub-poster/beauty.webp',
  fitness: 'hub-poster/fitness.webp',
  services: 'hub-poster/services.webp',
  /* Pet Care had a poster before it had a landing, and this line rendered
     nothing for as long as that was true. The hub opened on 19 Aug; the phone
     arrival it was waiting for is the one it now draws. */
  pets: 'hub-poster/pets.webp',
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
  /* Medical used to arrive through weather rather than through a photograph
     in a case — a stage, built for the amber reference and then the gradient
     one. It went with the atmosphere when the city turned black and white,
     and the hub takes the same plate as the other twenty-four. */
  /* ON A PHONE THE LANDING IS THE POSTER.
     The desktop plate plays a photograph inside a cased card with a foot
     beneath it — right for a desk, and on a phone it left a 9:19.5 poster
     boxed in the middle of the screen with furniture around it. These images
     are the shape of the screen and carry the hub's name and line themselves,
     so here they ARE the screen: full bleed, and the only thing we add is the
     line and the door. Decided at mount, like every other phone branch. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  if (phone) {
    const poster = HUB_PORTRAIT[hub];
    return (
      <HubConsentGate hub={hub}>
        <div className={`hposter${poster ? '' : ' is-wide'}`}>
          <img className="no-case" src={poster ? `/assets/img/${poster}` : heroSrc} alt="" />
          <div className="hposter-foot">
            {(() => {
              const { before, hero, after } = setLine(HUB_LINE[hub] ?? cfg.tag);
              // The longest word of the small opening run is set in the serif
              // italic — the reference's one flourish, and this app's only
              // second typeface.
              let flourishAt = -1;
              before.forEach((w, i) => {
                if (flourishAt < 0 || w.length > before[flourishAt].length) flourishAt = i;
              });
              return (
                <p className="hp-line">
                  {before.length > 0 && (
                    <span className="hp-before">
                      {before.map((w, i) => (
                        <span key={i} className={i === flourishAt ? 'hp-flourish' : undefined}>{w} </span>
                      ))}
                    </span>
                  )}
                  <span className="hp-hero">{hero}</span>
                  {after.length > 0 && (
                    <span className="hp-after">
                      <b>{after[0]}</b>{after.length > 1 ? ` ${after.slice(1).join(' ')}` : ''}
                    </span>
                  )}
                </p>
              );
            })()}
            <Link to={firstInner} className="hposter-cta">Explore<span aria-hidden> →</span></Link>
          </div>
        </div>
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
          {/* The threshold takes the district's own treatment, at the
              district's own instruction: the picture untouched, and the one
              way in standing on it. "Explore now" became "Explore Astrology"
              for the reason it did on the home page — a verb alone does not
              say which door it is. */}
          <Link to={firstInner} className="hub-plate-go">
            Explore <i>{cfg.name}</i>
          </Link>
        </article>
      </div>
    </HubConsentGate>
  );
}
