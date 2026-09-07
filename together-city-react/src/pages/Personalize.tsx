import { Link } from 'react-router-dom';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { useCityDesign } from '@/hooks/useCityDesign';
import { useAuthStore } from '@/store/auth.store';
import { useMasterProfile } from '@/features/profile/hooks';
import { districtName } from '@/pages/Home';

/**
 * ── PERSONALIZE ─────────────────────────────────────────────────────────────
 *
 * The owner's poster, 7 Sep, and the reference under it is Apple One: a lockup
 * and one sentence held on the left, the services stacked as wide banners on
 * the right. This page is that.
 *
 * THE BANNER IS THE WHOLE ARTWORK, AND NOTHING IS SET BESIDE IT (owner, 7 Sep:
 * "use these images directly and no need to write it separately"). He
 * commissioned nine finished banners — each one carries its own eyebrow,
 * headline, sentence, icon row and side note, set in the city's own type. The
 * first cut of this page drew a name and a line on paper next to a cropped
 * tile, which is the same sentence said twice in two different sizes. So the
 * card IS the picture: nothing is written over it, nothing is written beside
 * it, and the district's name reaches a screen reader through the link's
 * aria-label rather than through a label nobody sighted needs.
 *
 * ONE TO A ROW, because these are not tiles. Every one of them holds a
 * paragraph of real copy at 2172px wide; two to a row is that paragraph at
 * four pixels tall, which is a picture of writing rather than writing.
 *
 * WHAT IT IS NOT: a second walk. The walk on the home page answers "what is in
 * this city"; this page answers "which parts of my life do I want it to read".
 */

/**
 * THE NINE THE OWNER DREW, IN THE ORDER HIS POSTER READS THEM.
 *
 * ENTERTAINMENT IS ABSENT AND THAT IS NOT AN OVERSIGHT. The poster names ten;
 * nine banners were commissioned. Standing the tenth up out of its walk tile
 * would put one cropped photograph with a label bolted under it in a column of
 * nine finished pieces, and it would be the only card on the page that does
 * not look like the page. It joins the day its banner does — one line here and
 * one file beside the other nine.
 *
 * Jobs, Local Services, the Digital Store and Together City TV are absent for
 * a different reason: nothing in any of them is set up from a profile, so a
 * banner would promise a form that does not exist.
 */
const BANNERS: readonly HubKey[] = [
  'beauty', 'fitness', 'nutrition', 'medical', 'financial',
  'realestate', 'astrology', 'dating', 'pets',
];

/**
 * ── THE HALL, AND THE NINE BAYS IN IT ───────────────────────────────────────
 *
 * Owner, 7 Sep, with two photographs: "use the image for male and female users
 * accordingly for the top of the page, also give each section a click on the
 * text which takes them to the section."
 *
 * The picture is one long white hall with nine bays in it, each one labelled in
 * the city's own capitals — BEAUTY, FITNESS, NUTRITION, MEDICAL, MATCH-MAKING,
 * REAL ESTATE, ASTROLOGY, PETS, FINANCE — and each label is a door.
 *
 * THE CLICKABLE THING IS THE BAY, NOT THE WORD, and that is deliberate rather
 * than lazy. Nine invisible boxes traced around nine baked-in words are nine
 * measurements that go wrong the first time a photograph is re-rendered a few
 * pixels off — and the two halls here already sit 45px apart vertically. A bay
 * is the whole column the label stands over: the label is inside it, the
 * hit area is a finger's worth rather than a word's, and a re-render has to
 * move a whole room before it lands on the wrong door.
 *
 * THE EDGES ARE MEASURED, NOT GUESSED. The label centres were read off both
 * files (dark pixels in the caption band, x as a fraction of width) and agreed
 * to within half a percent; every boundary below is the midpoint between two
 * neighbouring centres, so a bay is exactly the ground closer to its own label
 * than to anyone else's.
 */
const BAYS: ReadonlyArray<{ key: HubKey; width: number }> = [
  { key: 'beauty',     width: 10.95 },
  { key: 'fitness',    width: 10.35 },
  { key: 'nutrition',  width: 10.50 },
  { key: 'medical',    width: 11.75 },
  { key: 'dating',     width: 12.55 },
  { key: 'realestate', width: 11.45 },
  { key: 'astrology',  width: 10.80 },
  { key: 'pets',       width: 10.75 },
  { key: 'financial',  width: 10.90 },
];

export function Personalize() {
  useHubTheme('personalize');
  /* A district this citizen switched off — or the operator switched off for
     everybody — has no banner here, for the same reason it has no billboard on
     the walk and no tile in the foot grid. The page is their city, not ours. */
  const { hubOn } = useCityDesign();
  const shown = BANNERS.filter((key) => hubOn(key));

  /* WHICH HALL (owner, 7 Sep). `resolvedGender` is the server's one answer —
     the split identity field where a citizen has one, the pre-split column
     where they do not — so this page reads a single name rather than deciding
     between three. It is the SOCIAL answer; `sexAtBirth` is clinical, is never
     shown to another citizen, and has no business choosing a photograph.
     Anything that is not an explicit Male gets the other hall: signed out,
     still loading, unanswered, non-binary, other. One picture is the default
     and the other is shown on an answer — never a guess. */
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  const master = useMasterProfile(authed);
  const hall = master.data?.resolvedGender === 'Male' ? 'male' : 'female';

  return (
    <>
      {/* The hall is the page's own width rather than the window's: full-bleed
          it would be a 2.3:1 photograph six feet wide on a desk, and the bays
          would be further apart than the banners they lead to. */}
      <div className="pz-hall">
        <img className="no-case" src={`/assets/img/personalize/hall-${hall}.webp`} alt=""
          width={1800} height={771} decoding="async" fetchPriority="high" />
        <div className="pz-bays">
          {BAYS.map((bay) => (
            /* A bay a citizen has switched off is drawn but not linked: the
               photograph is one picture and cannot lose a room, and a door
               into a hub they closed is a door they closed. */
            hubOn(bay.key)
              ? <Link key={bay.key} to={HUBS[bay.key].backPath} data-hub={bay.key}
                  className="pz-bay" style={{ flexBasis: `${bay.width}%` }}
                  aria-label={districtName(bay.key)} />
              : <span key={bay.key} className="pz-bay is-off" style={{ flexBasis: `${bay.width}%` }} />
          ))}
        </div>
      </div>

    <div className="pz">
      {/* Sticky on a desk: nine banners are a long column, and a lockup that
          scrolls away leaves eight of them with nothing to belong to. */}
      <div className="pz-say">
        <div className="eyebrow">Together City</div>
        <h1 className="pz-head">
          Personalize all aspects of your life,{' '}
          <i>see only what suits you.</i>
        </h1>
        <p className="pz-feet">People · Places · Possibilities</p>
      </div>

      <div className="pz-run">
        {shown.length === 0 && (
          <p className="muted pz-empty">
            Every district is switched off. Turn hubs back on in{' '}
            <Link to="/profile">Design your services</Link>.
          </p>
        )}
        {shown.map((key, i) => (
          /* The picture carries every word, so it is decorative and the LINK
             holds the name. An alt describing the banner would read the
             district's name a second time to the one person who cannot see
             that it is already written on it. */
          <Link key={key} to={HUBS[key].backPath} data-hub={key} className="pz-card"
            aria-label={districtName(key)}>
            <img className="no-case" src={`/assets/img/personalize/${key}.webp`} alt=""
              width={1600} height={533}
              loading={i < 2 ? 'eager' : 'lazy'} decoding="async"
              fetchPriority={i === 0 ? 'high' : undefined} />
          </Link>
        ))}
      </div>
    </div>
    </>
  );
}
