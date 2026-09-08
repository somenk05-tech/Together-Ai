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
/**
 * THE DISTRICTS WITH A MEN'S CUT OF THEIR BANNER (owner, 7 Sep: "update
 * beauty for men users, only female keep to see what's already there").
 *
 * ONE RULE, ONE FILE PER EXCEPTION. Beauty's banner is a woman at a mirror and
 * a shelf of colour cosmetics; the men's cut is the same room said in the same
 * type — MEN'S SHOP, skin, beard, hair, wellness. Nothing else is different
 * about it: same 3:1, same page, same door.
 *
 * IT READS THE HALL'S OWN ANSWER, not a second one. `hall` is already the
 * page's decision about which pictures this citizen is shown — Male on an
 * explicit Male, the other cut for everyone else — so a district with a men's
 * banner follows it and nobody can end up in a hall of men beside a shelf of
 * lipstick. A district NOT in this set keeps its one banner whatever the
 * answer, which is the owner's second half: only Beauty changes.
 *
 * Adding the next one is a file and a key.
 */
const MENS_CUT: ReadonlySet<HubKey> = new Set<HubKey>(['beauty']);

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

      {/* ── THE NINE DOORS, WRITTEN DOWN (owner, 8 Sep) ──────────────────────
          The same glass pill the home page put under the QR, one per district
          in the hall's own left-to-right order, so the row reads as a caption
          of the picture above it rather than a second menu.

          IT IS NOT A REPEAT OF THE BAYS, and that is the whole reason it
          exists. A bay is an invisible column over a photograph — no border,
          no label of its own, nothing to say it can be pressed — and the bays
          come OFF a phone entirely, where a ninth of the width is 38px of
          doorway. These are doors you can see, on every device, in the words
          the citizen reads everywhere else in the city.

          A district switched off is not drawn at all here: a pill is a thing
          you press, and a dead one is worse than an absence. */}
      {/* THE LINE COMES OUT OF THE COLUMN (owner, 8 Sep): "add the
          personalization line below the master image, then the buttons." It
          was the first thing in the sticky left column beside the banners, a
          screen and a half below the photograph it belongs to — so on a phone
          the page opened on a hall, then nine pills, and only then said what
          any of it was for. It is the caption of the picture now, and the
          doors sit under the sentence that sends you through them.

          THE REST OF THE COLUMN STAYS PUT: the eyebrow, the promise and the
          sign-off are the lockup that holds the nine banners together, which
          is what makes them a column rather than a preamble. */}
      <h1 className="pz-head pz-head-hall">
        Personalize every aspect of your life.{' '}
        <i>See only what&rsquo;s relevant to you.</i>
      </h1>

      <nav className="doors pz-doors" aria-label="The districts that personalize">
        {BAYS.filter((bay) => hubOn(bay.key)).map((bay) => (
          <Link key={bay.key} className="door" to={HUBS[bay.key].backPath} data-hub={bay.key}>
            <span className="door-bloom" aria-hidden />
            <span className="door-word">{districtName(bay.key)}</span>
          </Link>
        ))}
      </nav>

    <div className="pz">
      {/* The paragraph over the run (owner, 8 Sep). It was a sticky column
          beside a single stack of banners; the banners are three to a row in
          the walk's own grid now, so there is no column for it to be one half
          of. */}
      <div className="pz-say">
        <div className="eyebrow">Together City</div>
        {/* THE OWNER'S OWN WORDS, 7 SEP. The headline was one sentence with a
            comma in it and the poster's typo in the tail ("what you suits
            you"); it is two sentences now, and the promise underneath says
            what personalising actually BUYS — a store built once, rather than
            a million products to scroll past. Every claim in it is a room that
            exists: the Personalized Store is /ecommerce/store, and its own rail
            already calls it "the shelves that read your profiles". */}
        <p className="pz-lede">
          Personalize once, and Together City builds your own personalized store
          in the digital city&mdash;so you never have to scroll through a million
          products that don&rsquo;t matter to you.
        </p>
        <p className="pz-claim">Your preferences. Your store. Your city.</p>
        <p className="pz-feet">People · Places · Possibilities</p>
      </div>

      <div className="pz-run">
        {shown.length === 0 && (
          <p className="muted pz-empty">
            Every district is switched off. Turn hubs back on in{' '}
            <Link to="/profile">Design your services</Link>.
          </p>
        )}
        {shown.map((key, i) => {
          // The men's cut where one was drawn, and the one banner everywhere
          // else — the same answer the hall above the page is standing on.
          const cut = hall === 'male' && MENS_CUT.has(key) ? `${key}-male` : key;
          return (
          /* The picture carries every word, so it is decorative and the LINK
             holds the name. An alt describing the banner would read the
             district's name a second time to the one person who cannot see
             that it is already written on it. */
          <Link key={key} to={HUBS[key].backPath} data-hub={key} className="pz-card"
            aria-label={districtName(key)}>
            <img className="no-case" src={`/assets/img/personalize/${cut}.webp`} alt=""
              width={1600} height={533}
              loading={i < 2 ? 'eager' : 'lazy'} decoding="async"
              fetchPriority={i === 0 ? 'high' : undefined} />
          </Link>
          );
        })}
      </div>
    </div>
    </>
  );
}
