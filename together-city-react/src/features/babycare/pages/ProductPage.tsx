/**
 * ── ONE PRODUCT ─────────────────────────────────────────────────────────────
 *
 * Everything the catalogue knows about a row, and — this is the part that
 * matters — everything it does not. The seller's words for the age, the pack,
 * the price and where the price came from, the certification if the page
 * printed one, the regulatory mark if the thing is not shampoo, and the link.
 *
 * THERE IS NO "CUSTOMERS ALSO BOUGHT" AND NO CROSS-SELL ON THIS PAGE. A rail
 * underneath a tin of formula is a promotion under s.3(c) of the IMS Act, and a
 * rail that appears for some products and not others is a rule three people have
 * to remember. There is a link back to the aisle, which is where somebody
 * comparing wants to be anyway.
 *
 * THERE IS NO ADD TO BAG EITHER, and the page says why rather than showing a
 * button that opens a page apologising. Nothing in Together City can take money
 * for these products yet: the city's tills belong to local shops that have
 * published their own stock, and none of these brands has. Saying so is the
 * gemstone bench's arrangement — a stone with no price says "ask", it does not
 * pretend to a checkout.
 */

import { Link, useParams } from 'react-router-dom';
import { useProduct } from '../api';
import { CHECKED_ON } from '../data/catalogue';
import { aisleMeta } from '../aisles';
import { imsReason, mayAdvertise } from '../ims';
import { AgeMark, CertMark, GateMark, PriceLine, RestrictedNote, SourceLine } from '../components/Marks';
import { BAND_LABEL } from '../age';

export function ProductPage() {
  const { id } = useParams();
  const { data: product } = useProduct(id);

  if (!product) {
    return (
      <div className="bc-stack-tight">
        <h1>Not on this shelf</h1>
        <p className="bc-lede">There is no product with that id in the catalogue.</p>
        <Link to="/babycare/shop" className="bc-back">Back to the store</Link>
      </div>
    );
  }

  const aisle = aisleMeta(product.aisle);
  const restricted = imsReason(product);

  return (
    <div className="bc-stack bc-narrow">
      <Link to={`/babycare/shop?aisle=${product.aisle}`} className="bc-back">← {aisle.label}</Link>

      <header className="bc-head">
        <span className="bc-brand">{product.brand}</span>
        <h1 className="bc-h1">{product.name}</h1>
        <span className="bc-sub">{product.sub}{product.size ? ` · ${product.size}` : ''}</span>
      </header>

      <div className="bc-row">
        <AgeMark product={product} />
        {product.gate && <GateMark gate={product.gate} />}
        {product.cert && <CertMark cert={product.cert} />}
      </div>

      <section className="card bc-stack-tight">
        <PriceLine product={product} mayBadge={mayAdvertise(product)} size="lg" />
        <p className="bc-quiet">{product.basis}.</p>
        <SourceLine product={product} checkedOn={CHECKED_ON} />
      </section>

      {restricted && <RestrictedNote reason={restricted} />}

      {product.gate && (
        <div className="bc-row">
          <GateMark gate={product.gate} long />
        </div>
      )}

      <dl className="bc-facts">
        <Fact label="Aisle" value={aisle.label} />
        <Fact
          label="Ages the shop files it under"
          value={product.bands.length
            ? product.bands.map((b) => BAND_LABEL[b]).join(' · ')
            : 'None — the seller’s page states no age, so this product appears at every age'}
        />
        {product.ageSaid && <Fact label="What the seller’s page says" value={product.ageSaid} />}
        {product.note && <Fact label="Worth knowing" value={product.note} />}
      </dl>

      <p className="bc-note">
        Together City does not take money for this product. The city’s checkout belongs to local
        shops that have published their own stock, and this row is a listing read off the seller’s
        page — so the link above goes to the seller, and nothing here pretends to a till.
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bc-fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
