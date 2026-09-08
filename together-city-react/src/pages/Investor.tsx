import { Fragment, useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * ── THE SEED DECK, AS A PAGE YOU SCROLL ────────────────────────────────────
 *
 * Thirteen slides for an investor or a partner, at /investor, outside the app
 * shell: no header, no rail, no footer. A deck shown on somebody else's screen
 * should have nothing on it that is not the deck.
 *
 * IT IS THE 2026 SEED DECK, WORD FOR WORD (owner, 8 Sep). What stood here
 * before was the twenty-nine slide product walkthrough built from the July
 * deck — every slide a screenshot of a room in the city. This one is a
 * different argument: what we are creating, the trust problem, the moat, how
 * an order travels, four revenue engines, the ask, and a projection with a
 * spreadsheet behind it. The old slides are one `git revert` away and their
 * photographs are still in public/investor.
 *
 * A SLIDE IS A SECTION THE HEIGHT OF THE WINDOW and the scroller snaps to it.
 * There is no viewer here — no arrows, no fan, no slide index floating over
 * the artwork — because every one of those is chrome that would have to be
 * hidden before anybody screenshotted a slide. The number is PRINTED on the
 * slide, the way a page number is printed on a page.
 *
 * IT IS SET IN THE CITY'S LANGUAGE, NOT THE DECK'S. The PDF is white, black
 * and a strong red; this is white paper, one near-black ink, one typeface.
 * What carried over is the structure — the numbered label, the two-panel
 * comparison, the rows, the table. What did not is the red, because a second
 * palette living at one URL is a second design system with a head start (see
 * index.css, THE DECK IS A PAGE, and relief.spec.ts for why that is a build
 * failure and not a taste). The only contrast here is reversal: the cover and
 * the closing slide print white on the ink.
 *
 * THE WAY OUT IS IN THE LABEL ROW, ON EVERY SLIDE, rather than floating in a
 * corner: every corner of a slide is already spoken for at some width, and a
 * control over the artwork is the chrome this page was built without.
 *
 * EVERY CLAIM AND EVERY NUMBER ON THIS PAGE IS THE OWNER'S OWN COPY from the
 * deck it was built from. Nothing here is generated, inferred or rounded, and
 * nothing should be edited to read better without him — this is the page a
 * partner is quoted from.
 */

/** Where this deck's pictures live. Seven files, WebP, lifted from the PDF. */
const A = '/investor/deck26/';

/** The top of every slide: its number, and the way out. */
function Label({ n }: { n: string }) {
  return (
    <div className="dk-lab">
      <span>[ {n} ]</span>
      <Link className="dk-back" to="/">Back to the city</Link>
    </div>
  );
}

/** Slide 04's three rows: what the market puts in front of you, and what the
 *  city puts there instead. The pictures are the owner's own renders. */
const SHELVES = [
  { key: 'groceries', label: 'Groceries & nutrition' },
  { key: 'beauty', label: 'Beauty' },
  { key: 'fitness', label: 'Fitness & supplements' },
];

export function Investor() {
  /* The tab is the deck while the deck is open, and the city again after. */
  useEffect(() => {
    const was = document.title;
    document.title = 'Together City — Seed Round 2026';
    return () => { document.title = was; };
  }, []);

  return (
    <main className="dk">
      {/* ============ 01 · DISCLAIMER ============ */}
      <section className="dk-slide">
        <Label n="01" />
        <div className="dk-body">
          <div className="dk-cap">Disclaimer</div>
          <h2 className="dk-h2">Read this before you turn the page.</h2>
          <p className="dk-lede">
            Seed stage. Six months from launch. The platform is being built; we&rsquo;re
            raising for the operational layer that opens the gates.
          </p>
          <p className="dk-note">
            If you came for customers, revenue, traction and a hockey stick drawn in a
            spreadsheet at two a.m., this is the wrong deck. There isn&rsquo;t one yet.
            That&rsquo;s rather the point of seed.
          </p>
          <p className="dk-note">
            We&rsquo;ll also spare you the TAM/SAM/SOM gymnastics. You know the market. We
            know the market. Three nested circles aren&rsquo;t going to teach either of us
            anything.
          </p>
          <p className="dk-note">
            What&rsquo;s left is the vision, the platform and where this can go &mdash; thirteen
            slides, no imaginary numbers. Still here? Good.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Welcome to Together City</span></div>
      </section>

      {/* ============ 02 · THE COVER ============ */}
      <section className="dk-slide rev">
        <Label n="02" />
        <div className="dk-body">
          <div className="dk-cap">Identity · Memory · Intelligence</div>
          <h2 className="dk-h2">The world&rsquo;s largest digital city.</h2>
          <p className="dk-lede">
            An AI-powered operating system for everyday life. Everything, personalized.
          </p>
          <img className="dk-shot no-case" src={`${A}cover.webp`}
            alt="Together City — a skyline of hub billboards at golden hour" />
        </div>
        <div className="dk-foot"><span>Seed round</span><span>togethercity.app</span></div>
      </section>

      {/* ============ 03 · WHAT WE ARE CREATING ============ */}
      <section className="dk-slide">
        <Label n="03" />
        <div className="dk-body">
          <div className="dk-cap">What we are creating</div>
          <h2 className="dk-h2">A digital city built around the member, not the product.</h2>
          <div className="dk-rows">
            <div className="dk-row"><b>I</b><span>One member profile &mdash; social, preferences, location, lifestyle, health, finance, career.</span></div>
            <div className="dk-row"><b>II</b><span>One engine that turns that profile and community intelligence into curation.</span></div>
            <div className="dk-row"><b>III</b><span>Two aspects &mdash; a personalized store built around the member, and the largest digital neighborhood store.</span></div>
            <div className="dk-row"><b>IV</b><span>A digital city that eventually runs online services the way a real city does &mdash; real estate, jobs, match-making and the rest.</span></div>
          </div>
          <p className="dk-note">
            You already have forty apps that don&rsquo;t know you. Consider this the intervention.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>The platform</span></div>
      </section>

      {/* ============ 04 · PROBLEM & SOLUTION ============ */}
      <section className="dk-slide">
        <Label n="04" />
        <div className="dk-body">
          <div className="dk-cap">Problem &amp; solution</div>
          <h2 className="dk-h2">Everything for everyone, or exactly what you need. The user decides.</h2>
          <div className="dk-tags two"><span>Everything</span><span>Curated</span></div>
          {SHELVES.map((s) => (
            <Fragment key={s.key}>
              <div className="dk-cap">{s.label}</div>
              <div className="dk-two">
                <img className="dk-shot no-case" src={`${A}${s.key}-all.webp`}
                  alt={`${s.label} — every product on the market`} loading="lazy" />
                <img className="dk-shot no-case" src={`${A}${s.key}-curated.webp`}
                  alt={`${s.label} — the shelf sized to what you buy`} loading="lazy" />
              </div>
            </Fragment>
          ))}
          <p className="dk-note">
            <b>Curated, not dumped.</b> Their shelf, sized to what you actually buy.
            Ten thousand options is not choice. It is unpaid labor with a search bar.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Curated, not dumped</span></div>
      </section>

      {/* ============ 05 · THE TRUST PROBLEM ============ */}
      <section className="dk-slide">
        <Label n="05" />
        <div className="dk-body">
          <div className="dk-cap">The trust problem</div>
          <h2 className="dk-h2">Trust, not a trust badge.</h2>
          <div className="dk-three">
            <div>
              <div className="dk-cap">Problem &mdash; the user</div>
              <p className="dk-note">
                Convenience came with an unlisted seller. You get speed, but the person
                behind the order is anonymous &mdash; no face, no address, no one to hold to
                it when something&rsquo;s wrong. Counterfeits, no accountability, and a
                returns process that goes nowhere.
              </p>
            </div>
            <div>
              <div className="dk-cap">Problem &mdash; vendor side</div>
              <p className="dk-note">
                The shop you&rsquo;ve bought from for years has no app, no listing, no way to
                compete with a dark store two blocks away &mdash; so it just loses the order,
                silently, every day.
              </p>
            </div>
            <div>
              <div className="dk-cap">Our solution</div>
              <p className="dk-note">
                One trusted relationship, both sides working. The vendor you&rsquo;ve known for
                years, now as fast as the app that replaced them. And not their whole
                shelf &mdash; just what they&rsquo;d hand you if they already knew your order.
              </p>
              <p className="dk-note"><b>Shelf relevance &gt; shelf size</b></p>
            </div>
          </div>
          <div className="dk-tags">
            <span>A trusted face, not a feed</span>
            <span>A decade, not a launch</span>
            <span>Fixed down the street</span>
            <span>Visible again</span>
          </div>
          <p className="dk-note">
            Every dark store is a stranger with a warehouse. Every neighborhood shop is a
            name you already know &mdash; and nobody thought to give it an app.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Trust</span></div>
      </section>

      {/* ============ 06 · OUR MOAT ============ */}
      <section className="dk-slide">
        <Label n="06" />
        <div className="dk-body">
          <div className="dk-cap">Our moat</div>
          <h2 className="dk-h2">At scale, we compete with the online market itself.</h2>
          <div className="dk-rows">
            <div className="dk-row"><b>Network effect</b><span>Each member makes the vendor side worth more, and vice versa.</span></div>
            <div className="dk-row"><b>Vast local network</b><span>Stores signed street by street &mdash; years of groundwork to replicate.</span></div>
            <div className="dk-row"><b>Low-cost operations</b><span>No warehouses, no fleet, no inventory on our books.</span></div>
            <div className="dk-row"><b>New vendor income</b><span>A second revenue line for shops that had no digital one.</span></div>
            <div className="dk-row"><b>Digitization</b><span>We put the neighborhood online, not just onto a listing.</span></div>
            <div className="dk-row"><b>Personalization</b><span>Members stay because nowhere else knows them this well.</span></div>
          </div>
          <p className="dk-note">
            &ldquo;If you need a service, go to Together City.&rdquo; Anyone can clone a feature over
            a weekend. Nobody clones a network of neighborhoods &mdash; or a cost base with no
            warehouses in it.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Six sources of defensibility</span></div>
      </section>

      {/* ============ 07 · HOW IT WORKS ============ */}
      <section className="dk-slide">
        <Label n="07" />
        <div className="dk-body">
          <div className="dk-cap">How it works</div>
          <h2 className="dk-h2">Your neighborhood, connected.</h2>
          <div className="dk-rows">
            <div className="dk-row"><b>01</b><span><b>Neighborhood marketplace</b> &mdash; the local high street, listed, from clinics to showrooms.</span></div>
            <div className="dk-row"><b>02</b><span><b>Personalize &mdash; or open market</b> &mdash; a short, curated list. The whole market stays one tap away.</span></div>
            <div className="dk-row"><b>03</b><span><b>A local vendor fulfills</b> &mdash; the nearest shop with stock takes the order.</span></div>
            <div className="dk-row"><b>04</b><span><b>Delivered within kilometers</b> &mdash; a partner collects it; member and vendor share the cost.</span></div>
          </div>
          <p className="dk-note">
            <b>And the loop closes.</b> Doctors, stylists, trainers and astrologers chat with
            the member inside the app. Repeat orders never leave the platform.
          </p>
          <p className="dk-note">
            Yes, it is a marketplace. The difference is that the warehouse is your own
            neighborhood, and it was already there.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Four moves</span></div>
      </section>

      {/* ============ 08 · OPERATIONAL MODEL ============ */}
      <section className="dk-slide">
        <Label n="08" />
        <div className="dk-body">
          <div className="dk-cap">Operational model</div>
          <h2 className="dk-h2">A two-way platform. Both sides get a city.</h2>
          <div className="dk-two">
            <div className="dk-body">
              <div className="dk-cap">For the vendor</div>
              <p className="dk-lede">Their own online store</p>
              <p className="dk-note">
                A personalized storefront with its own shareable link &mdash; theirs to send to
                their own customers. A shop, not a listing.
              </p>
            </div>
            <div className="dk-body">
              <div className="dk-cap">For the member</div>
              <p className="dk-lede">One curated app for a whole life</p>
              <p className="dk-note">
                Gyms to groceries to clinics, curated first &mdash; with the open market one tap
                away.
              </p>
            </div>
          </div>
          <div className="dk-chain">
            <span>No warehouses</span><span>Faster expansion</span><span>Wider selection</span><span>Lower risk</span>
          </div>
          <p className="dk-note">
            <b>How an order travels.</b> Orders route to the nearest stores. If stock
            isn&rsquo;t there, nearby vendors are notified and can accept in full or in part
            &mdash; the order keeps moving until it&rsquo;s fulfilled.
          </p>
          <p className="dk-note">
            <b>Who owns what.</b> We own the member relationship and the personalization
            layer. The neighborhood owns the inventory.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Asset-light</span></div>
      </section>

      {/* ============ 09 · HOW WE MAKE MONEY ============ */}
      <section className="dk-slide">
        <Label n="09" />
        <div className="dk-body">
          <div className="dk-cap">How we make money</div>
          <h2 className="dk-h2">One ecosystem. Four revenue engines.</h2>
          <div className="dk-rows">
            <div className="dk-row"><b>01</b><span><b>Subscriptions</b> &mdash; premium personalization and experiences.</span></div>
            <div className="dk-row"><b>02</b><span><b>Advertising</b> &mdash; targeted, relevant brand and local business advertising.</span></div>
            <div className="dk-row"><b>03</b><span><b>Digital store rent</b> &mdash; every store on the platform pays 1% of its total sales or &#8377;1,000 a month, whichever is higher.</span></div>
            <div className="dk-row"><b>04</b><span><b>Product margin at scale</b> &mdash; volume across lakhs of stores turns buying power into margin on the products themselves.</span></div>
          </div>
          <div className="dk-stats">
            <div className="dk-stat"><b>Month 18</b><span>Revenue begins after launch</span></div>
          </div>
          <p className="dk-note">
            We&rsquo;re not monetizing attention. We&rsquo;re monetizing being useful, which turns out
            to be cheaper.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Revenue</span></div>
      </section>

      {/* ============ 10 · THE ASK ============ */}
      <section className="dk-slide">
        <Label n="10" />
        <div className="dk-body">
          <div className="dk-cap">The ask</div>
          <h2 className="dk-h2">What we need.</h2>
          <p className="dk-note">
            What we invest today, and what the profit looks like. Capital converts directly
            into digitized stores &mdash; and stores are what compound.
          </p>
          <div className="dk-scroll">
            <div className="dk-table c3">
              <div className="h">Invested today</div><div className="h">Digitized stores</div><div className="h">Returned by month 24</div>
              <div className="v">&#8377;35 Cr</div><div className="n">1.5 lakh</div><div className="n">Break-even</div>
              <div className="v">&#8377;50 Cr</div><div className="n">3 lakh</div><div className="n">&#8377;100 Cr operating profit</div>
              <div className="v">&#8377;100 Cr</div><div className="n">7.8 lakh</div><div className="n">&#8377;630 Cr operating profit</div>
            </div>
          </div>
          <div className="dk-rows">
            <div className="dk-row"><b>What it buys</b><span>A tech team, sector-by-sector marketing and sales, field agents and customer service &mdash; a content-first, capital-efficient entry.</span></div>
            <div className="dk-row"><b>Why once</b><span>A projected CAC of &#8377;10 and compounding network effects make city marketing self-financing from year one.</span></div>
          </div>
          <p className="dk-note">
            The floor is break-even in two years. Everything above that is a question of how
            fast you want the city built.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Seed round</span></div>
      </section>

      {/* ============ 11 · FINANCIAL PROJECTIONS ============ */}
      <section className="dk-slide">
        <Label n="11" />
        <div className="dk-body">
          <div className="dk-cap">Financial projections</div>
          <h2 className="dk-h2">A conservative path to &#8377;1,500+ Cr.</h2>
          <p className="dk-note">
            Downside-case assumptions &mdash; roughly 10% of today&rsquo;s category leaders&rsquo; paying
            customer base within five years.
          </p>
          <div className="dk-scroll">
            <div className="dk-table c4">
              <div className="h">Metric</div><div className="h">Year 2</div><div className="h">Year 3</div><div className="h">Year 4</div>
              <div className="k">Digitized stores</div><div className="v">1.5 lakh</div><div className="v">3 lakh</div><div className="v">6 lakh</div>
              <div className="k">Registered users (Mn)</div><div className="v">38.0</div><div className="v">57.0</div><div className="v">77.0</div>
              <div className="k">Active users (Mn)</div><div className="v">19.0</div><div className="v">47.0</div><div className="v">84.0</div>
              <div className="k">Paying users (Mn)</div><div className="v">0.70</div><div className="v">2.21</div><div className="v">4.57</div>
              <div className="k">Revenue streams</div><div className="n">3</div><div className="n">4</div><div className="n">4</div>
            </div>
          </div>
          <p className="dk-note">
            Revenue is primarily commission, subscription, advertising and platform fees.
            Every projection is fiction. This one at least has conservative assumptions and
            a spreadsheet behind it.
          </p>
        </div>
        <div className="dk-foot"><span>Financial estimates</span><span>Downside case</span></div>
      </section>

      {/* ============ 12 · THE TEAM ============ */}
      <section className="dk-slide">
        <Label n="12" />
        <div className="dk-body">
          <div className="dk-cap">The team</div>
          <h2 className="dk-h2">We&rsquo;ve spent our careers understanding people.</h2>
          <div className="dk-two">
            <div className="dk-body">
              <div className="dk-cap">Shruti Mishra &middot; Co-founder</div>
              <p className="dk-note">
                CPA (USA) with experience in corporate finance, M&amp;A and financial forensic
                &mdash; YES Bank, Pernod Ricard, Reliance ADAG and Mantri Group. Later led
                fundraising for India&rsquo;s leading infrastructure companies.
              </p>
              <p className="dk-note">&ldquo;Enduring companies are built on clarity, discipline and trust.&rdquo;</p>
            </div>
            <div className="dk-body">
              <div className="dk-cap">Somen K &middot; Founder</div>
              <p className="dk-note">
                Two decades across advertising, communication and creative production. For
                brands like Aditya Birla Group, Godrej, HUL and Fiat &mdash; a career built on
                what people feel, believe and act on.
              </p>
              <p className="dk-note">&ldquo;Technology should deepen human connection, not replace it.&rdquo;</p>
            </div>
          </div>
          <p className="dk-note">
            One of us sells the dream. The other checks whether we can afford it. Both
            signatures are required.
          </p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>togethercity.app</span></div>
      </section>

      {/* ============ 13 · COME SEE THE CITY ============ */}
      <section className="dk-slide rev">
        <Label n="13" />
        <div className="dk-body">
          <div className="dk-cap">Come see the city</div>
          <h2 className="dk-h2">Explaining it doesn&rsquo;t do it justice.</h2>
          <p className="dk-lede">
            A city with the streets paved and the sewers pending: what&rsquo;s live is genuinely
            live, and about half the backend and operations are still to come. Construction
            wraps in three months &mdash; at least that&rsquo;s what our construction team tells us.
          </p>
          <div className="dk-stats">
            <div className="dk-stat"><b>~180</b><span>Days to launch</span></div>
            <div className="dk-stat"><b>~90</b><span>Days to first invites</span></div>
          </div>
          <div className="dk-rows">
            <div className="dk-row"><b>Shruti Mishra</b><span>99307 84628</span></div>
            <div className="dk-row"><b>Somen K</b><span>98671 78587</span></div>
          </div>
          <p className="dk-note">
            Scan it. Worst case, you lose four seconds. Best case, you&rsquo;re the investor who
            got in before the city had traffic.
          </p>
        </div>
        <div className="dk-foot"><Link to="/">Enter the city</Link><span>togethercity.app &middot; 2026</span></div>
      </section>
    </main>
  );
}
