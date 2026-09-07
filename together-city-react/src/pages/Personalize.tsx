import { Link } from 'react-router-dom';
import type { HubKey } from '@/types';
import { HUBS } from '@/config/hubs';
import { useHubTheme } from '@/hooks/useHubTheme';
import { useCityDesign } from '@/hooks/useCityDesign';
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

export function Personalize() {
  useHubTheme('personalize');
  /* A district this citizen switched off — or the operator switched off for
     everybody — has no banner here, for the same reason it has no billboard on
     the walk and no tile in the foot grid. The page is their city, not ours. */
  const { hubOn } = useCityDesign();
  const shown = BANNERS.filter((key) => hubOn(key));

  return (
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
  );
}
