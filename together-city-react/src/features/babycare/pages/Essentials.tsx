/**
 * ── WHAT THIS SHOP CARRIES FOR A CHILD THIS AGE ─────────────────────────────
 *
 * Not "what your baby needs". Nobody wrote a list of what a fourteen-month-old
 * needs into this application, and a store that produced one would be giving
 * parenting advice out of a product catalogue. The masthead says so in the
 * first sentence, because a page whose honesty lives only in a code comment is
 * not honest to the person reading it.
 *
 * WHAT IS CUT OUT AND WHY IS PRINTED TOO. The restricted feeding rows are not
 * here at all — a checklist entry is a recommendation and a recommendation is a
 * promotion under the IMS Act — and the page says how many there are and where
 * they live, which is a signpost rather than an inducement. The medicines and
 * devices are out for the neighbouring reason: putting vitamin D drops on a
 * list beside a hooded towel is a clinical suggestion in the shape of shopping.
 */

import { Link } from 'react-router-dom';
import { essentialsFor, restrictedCountFor } from '../essentials';
import { BAND_LABEL, nextBand } from '../age';
import { useSelectedBand, useSelectedChild } from '../store';
import { ChildBar } from '../components/ChildBar';

export function Essentials() {
  const band = useSelectedBand();
  const child = useSelectedChild();
  const groups = essentialsFor(band);
  const restricted = restrictedCountFor(band);
  const next = child ? nextBand(child.dob) : null;

  return (
    <div className="bc-stack">
      <header className="bc-head">
        <h1>What the shop carries for this age</h1>
        <p className="bc-lede">
          Every line below is a fact about this shop, not a claim about your child. It is the
          catalogue grouped by what the sellers themselves call things, for the age band your child
          is in — nobody here has written a list of what a child of this age needs, and this page is
          not one.
        </p>
      </header>

      <ChildBar />

      {!band && (
        <p className="bc-lede">
          This room needs a birthday to have anything to say — it is the one room in the district
          that cannot fall back to the whole shop, because the whole shop is not an age.{' '}
          <Link to="/babycare/children">Add one</Link>, or{' '}
          <Link to="/babycare/shop">browse everything</Link>.
        </p>
      )}

      {band && (
        <>
          <div className="bc-head">
            <strong className="bc-band">{BAND_LABEL[band]}</strong>
            {next && (
              <span className="bc-quiet">
                {next.inMonths <= 0
                  ? `Moving into ${BAND_LABEL[next.band].toLowerCase()} now.`
                  : `In ${next.inMonths} ${next.inMonths === 1 ? 'month' : 'months'} this becomes the ${BAND_LABEL[next.band].toLowerCase()} shelf.`}
              </span>
            )}
          </div>

          {groups.map((g) => (
            <section key={g.aisle} className="bc-section">
              <div className="bc-section-head">
                <strong className="bc-title">{g.aisleLabel}</strong>
                <Link to={`/babycare/shop?aisle=${g.aisle}`} className="bc-back">Open the aisle</Link>
              </div>
              <ul className="bc-list">
                {g.lines.map((l) => (
                  <li key={l.sub}>
                    <Link to={`/babycare/product/${l.openId}`}>{l.sub}</Link>
                    <span>
                      {l.count} {l.count === 1 ? 'product' : 'products'}
                      {l.fromInr !== null && ` · from ₹${l.fromInr.toLocaleString('en-IN')}`}
                      {l.unpriced > 0 && ` · ${l.unpriced} unpriced`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {groups.length === 0 && (
            <p className="bc-lede">
              Nothing in the catalogue names this age band on its own page. The shop still carries
              plenty for a child this age — those rows just print no age, so this page will not
              claim one on their behalf.{' '}
              <Link to="/babycare/shop">Browse the shelves</Link>.
            </p>
          )}

          {restricted > 0 && (
            <p className="bc-note">
              {restricted} feeding {restricted === 1 ? 'product' : 'products'} for this age
              {restricted === 1 ? ' is' : ' are'} deliberately absent from this list. India’s IMS Act
              1992 forbids promoting infant formula, infant food, bottles and teats for children
              under two, and a line on a checklist is a promotion. They are on the{' '}
              <Link to="/babycare/shop?aisle=feeding">feeding shelf</Link>, listed with their prices
              and nothing else. <Link to="/babycare/safety">The whole argument</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
