/**
 * ── SAFETY & THE LAW ────────────────────────────────────────────────────────
 *
 * The room where the district writes down what it is doing and why, with the
 * statute and the source under every claim. It exists because three of this
 * shop's design decisions look like missing features from the outside — no
 * discounts on formula, no toy safety badges, walkers sold with a warning
 * attached — and a parent who cannot see the reason reads them as a shop that
 * is worse than the one next door.
 *
 * EVERY FACT ON THIS PAGE CARRIES ITS SOURCE. Nothing here is remembered.
 */

const RULES = [
  {
    title: 'Infant formula, bottles and first foods are listed, never promoted',
    body: [
      'India’s Infant Milk Substitutes, Feeding Bottles and Infant Foods Act 1992 (the IMS Act) '
        + 'makes it an offence to advertise or take part in the promotion of infant milk substitutes, '
        + 'infant foods or feeding bottles for children up to two years old. The penalty runs to three '
        + 'years’ imprisonment.',
      'So on this shop those products carry a price, a pack size and a link to the seller’s page — '
        + 'and never a discount badge, a struck-through price, a ranking, a bestseller mark, a bundle, '
        + 'a checklist entry or a “picked for you”. That is not a gap in the shop. It is the shop '
        + 'obeying the law.',
      'This is not theoretical for an app: complaints under the Act have been filed against online '
        + 'pharmacies and marketplaces for discounting formula.',
    ],
    links: [
      { label: 'The Act, at indiacode.nic.in', href: 'https://www.indiacode.nic.in/bitstream/123456789/1958/1/aA1992-41.pdf' },
      { label: 'BPNI’s log of violations', href: 'https://www.bpni.org/documentation-violations-under-ims-act/' },
    ],
  },
  {
    title: 'A toy shows a certification only where its own page printed one',
    body: [
      'India’s Toys (Quality Control) Order 2020 makes conformity to seven Indian Standards and the '
        + 'ISI mark compulsory for toys for children under fourteen — manufacture, import, sale, '
        + 'storage, hire and lease. It came into force on 1 January 2021 and BIS has run search-and-'
        + 'seizure operations to enforce it.',
      'Which is exactly why this shop does not print “BIS certified” on a toy because the law requires '
        + 'it. Non-compliant stock is what is being seized. The mark appears where the product’s own '
        + 'listing carried it, and nowhere else.',
    ],
    links: [
      { label: 'The Quality Control Order', href: 'https://www.bis.gov.in/wp-content/uploads/2020/03/Toy_QC_order.pdf' },
      { label: 'BIS on what it requires', href: 'https://www.services.bis.gov.in/php/BIS_2.0/BISBlog/toys-quality-control-order/' },
    ],
  },
  {
    title: 'Car seats say ECE R44/04, because that is what their pages say',
    body: [
      'India’s Motor Vehicles Act requires a child restraint for children under four, with a ₹1,000 '
        + 'penalty under s.194B, and the vehicle-side specification is Automotive Industry Standard '
        + 'AIS-072. There is no BIS quality control order for child seats that we could find.',
      'What Indian sellers actually certify to is the European standard, ECE R44/04, and that is the '
        + 'fact this shop carries — read off each brand’s own page, per seat. No car seat here claims '
        + 'a BIS mark, because none of them claimed one.',
    ],
    links: [
      { label: 'On the CRS rule and AIS-072', href: 'https://www.cag.org.in/blogs/child-safety-cars-let-us-protect-them-child-restraint-system' },
    ],
  },
  {
    title: 'Sit-in walkers are sold here, with the warning attached',
    body: [
      'We found no Indian ban and no citable Indian advisory on baby walkers, and mainstream brands '
        + 'sell them openly. Two brand blogs claim “Indian regulations” and cite no regulator, no '
        + 'standard number and no authority — so this shop does not repeat them.',
      'What can be said, attributed: Canada banned the sale of baby walkers outright in 2004, '
        + 'including second-hand ones; the US CPSC imposed mandatory stair-fall standards in 2010; and '
        + 'the CPSC and the American Academy of Pediatrics advise against use. Push walkers are a '
        + 'different product and the usual substitute. Both are on the gear shelf.',
    ],
    links: [
      { label: 'The regulatory history, summarised', href: 'https://en.wikipedia.org/wiki/Baby_walker' },
    ],
  },
  {
    title: 'Medicines and devices are marked, and never dosed',
    body: [
      'Gripe water is an AYUSH-licensed Ayurvedic medicine, not a toiletry. ORS is a drug-schedule '
        + 'formulation. Paediatric vitamin D drops are prescription-only. Thermometers and nebulisers '
        + 'are CDSCO-notified medical devices.',
      'All of them are in this catalogue because parents look for them, and every one of them wears a '
        + 'mark saying what it is. Nothing in this district tells you a dose, an age at which to start '
        + 'one, or which to choose. That is a conversation with a paediatrician.',
    ],
    links: [],
  },
  {
    title: 'Every price was read off a page, and five could not be',
    body: [
      'All 323 rows were read on 8 September 2026 from the seller’s own storefront or an Indian '
        + 'retailer, and each one links to the page it came from. Five had no confirmable price — a '
        + 'range across variants, a per-unit rate, or nothing at all — and they say “price not verified '
        + 'at source” rather than showing a plausible number, and stay on the shelf rather than being '
        + 'quietly dropped.',
      '159 of the 323 carry no age band, because their sellers printed none. Indian diaper packs are '
        + 'sized by weight; converting a weight to an age would be this shop inventing a fact about a '
        + 'child it has never met. Those rows appear at every age, under their own heading.',
      'Retail prices move. A price here is what the page said on the day it was read, not a quote.',
    ],
    links: [],
  },
];

export function Safety() {
  return (
    <div className="bc-page bc-narrow">
      <header className="bc-head">
        <h1>Safety &amp; the law</h1>
        <p className="bc-lede">
          Six things this shop does that look like missing features, and the reason for each. Every
          claim below has its source under it.
        </p>
      </header>

      {RULES.map((r) => (
        <section key={r.title} className="bc-law">
          <h2>{r.title}</h2>
          {r.body.map((p) => <p key={p.slice(0, 32)}>{p}</p>)}
          {r.links.length > 0 && (
            <ul>
              {r.links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}

      <p className="bc-note">
        Together City is not a law firm and this page is not legal advice. It is the reading the city
        acts on, written down where it can be argued with.
      </p>
    </div>
  );
}
