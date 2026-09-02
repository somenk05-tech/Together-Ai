import { useEffect } from 'react';
import { Link } from 'react-router-dom';

/**
 * ── THE PLATFORM DECK, AS A PAGE YOU SCROLL ────────────────────────────────
 *
 * Thirty-two slides for an investor or a partner, at /investor, outside the
 * app shell: no header, no rail, no footer. A deck shown on somebody else's
 * screen should have nothing on it that is not the deck.
 *
 * A SLIDE IS A SECTION THE HEIGHT OF THE WINDOW and the scroller snaps to it.
 * There is no viewer here — no arrows, no fan, no slide index floating over
 * the artwork — because every one of those is chrome that would have to be
 * hidden before anybody screenshotted a slide. The number is PRINTED on the
 * slide, the way a page number is printed on a page.
 *
 * IT IS SET IN THE CITY'S LANGUAGE, NOT THE SOURCE DECK'S. The design this
 * was drawn from is burgundy, cream and dusty blue; this is white paper, one
 * near-black ink, one typeface. What carried over is the structure — the
 * numbered label, the chapter card, the two-panel comparison, the stat row.
 * What did not is the palette, because a second palette living at one URL is
 * a second design system with a head start (see index.css, THE DECK IS A
 * PAGE, and relief.spec.ts for why that is a build failure and not a taste).
 *
 * THE ONLY CONTRAST IS REVERSAL: the six chapter cards, the slide about what
 * the rest of the market does, and the closing slide print white on the ink.
 *
 * EVERY CLAIM AND EVERY NUMBER ON THIS PAGE IS THE OWNER'S OWN COPY from the
 * deck it was built from. Nothing here is generated, inferred or rounded, and
 * nothing should be edited to read better without him — this is the page a
 * partner is quoted from.
 */

/** Where the deck's renders live. Nineteen files, WebP, in public/investor. */
const A = '/investor/';

function Label({ n, kind }: { n: string; kind: string }) {
  return (
    <div className="dk-lab">
      <span>[ {n} ]</span>
      <span>{kind}</span>
    </div>
  );
}

/**
 * A chapter card. Six hubs get one, and it is the same object every time: the
 * number as large as the slide allows, the hub, one line about it.
 */
function Chapter({ n, num, name, line }: { n: string; num: string; name: string; line: string }) {
  return (
    <section className="dk-slide rev">
      <Label n={n} kind={`Hub ${num}`} />
      <div className="dk-body">
        <div className="dk-num">{num}</div>
        <h2 className="dk-h2">{name}</h2>
        <p className="dk-lede">{line}</p>
      </div>
      <div className="dk-foot"><span>Together City</span><span>Hub {num}</span></div>
    </section>
  );
}

type Panel = { cap: string; img: string; alt: string; note: string };

/**
 * The comparison slide, five times over: what the rest of the market puts in
 * front of somebody, and what the city puts there instead. Both halves on one
 * slide on purpose — the point is the difference, and a difference split
 * across two slides is a claim the reader has to hold in their head.
 */
function Compare({ n, kind, head, left, right }: { n: string; kind: string; head: string; left: Panel; right: Panel }) {
  return (
    <section className="dk-slide">
      <Label n={n} kind={kind} />
      <div className="dk-body">
        <h2 className="dk-h2">{head}</h2>
        <div className="dk-two">
          {[left, right].map((p) => (
            <div key={p.img} className="dk-body">
              <div className="dk-cap">{p.cap}</div>
              <img className="dk-shot no-case" src={A + p.img} alt={p.alt} loading="lazy" />
              <p className="dk-note">{p.note}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="dk-foot"><span>Together City</span><span>{kind}</span></div>
    </section>
  );
}

export function Investor() {
  /* The tab is the deck while the deck is open, and the city again after. */
  useEffect(() => {
    const was = document.title;
    document.title = 'Together City — Investor and Partner Overview';
    return () => { document.title = was; };
  }, []);

  return (
    <main className="dk">
      <section className="dk-slide">
        <Label n="001" kind="Platform Deck" />
        <div className="dk-body">
          <div className="dk-two">
            <div className="dk-body">
              <h1 className="dk-h1">Together City</h1>
              <p className="dk-lede">One city. Every hub. Personalized to one person at a time.</p>
            </div>
            <img className="dk-mark no-case" src={`${A}logo.webp`} alt="The Together City signature" />
          </div>
        </div>
        <div className="dk-foot"><span>Investor and Partner Overview</span><span>2026</span></div>
      </section>

      <section className="dk-slide">
        <Label n="002" kind="The Ecosystem" />
        <div className="dk-body">
          <h2 className="dk-h2">Sixteen hubs, one login</h2>
          <p className="dk-lede">Groceries, medicine, fitness, beauty, jobs, travel, housing, matchmaking — all of it inside a single city you actually live in.</p>
          <img className="dk-shot no-case" src={`${A}city.webp`} alt="The city seen from above, every hub on its own billboard" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>The Ecosystem</span></div>
      </section>

      <section className="dk-slide">
        <Label n="003" kind="Thesis" />
        <div className="dk-body">
          <h2 className="dk-h2">A personalized engine for every aspect of your life</h2>
          <p className="dk-lede">Set your preferences once. Every hub narrows the world down to what fits you — instead of what pays the most for shelf space.</p>
          <div className="dk-three">
            <div><div className="dk-cap">Once</div><p className="dk-note">One profile, one set of preferences</p></div>
            <div><div className="dk-cap">Everywhere</div><p className="dk-note">Every hub reads the same signal</p></div>
            <div><div className="dk-cap">Locally</div><p className="dk-note">Fulfilled by vendors around you</p></div>
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Thesis</span></div>
      </section>

      <section className="dk-slide">
        <Label n="004" kind="Contents" />
        <div className="dk-body">
          <h2 className="dk-h2">Six hubs, one pattern</h2>
          <div className="dk-rows">
            {[
              ['01', 'Matchmaking', 'Compatibility before attraction'],
              ['02', 'Nutrition', 'The aisle narrowed to your body'],
              ['03', 'Beauty', 'Two products, not two thousand'],
              ['04', 'Fitness', 'Plans and stacks from your data'],
              ['05', 'Pharmacy', 'One prescription, many vendors'],
              ['06', 'Services', 'Invisible quoting from nearby pros'],
            ].map(([num, name, line]) => (
              <div key={num} className="dk-row">
                <b>{num}</b>
                <div><b>{name}</b> <span>{line}</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Contents</span></div>
      </section>

      <section className="dk-slide rev">
        <Label n="005" kind="The Mechanic" />
        <div className="dk-body">
          <h2 className="dk-h2">From what you need to a doorstep, in five moves</h2>
          <p className="dk-lede">Every hub runs on the same market underneath: you say what you need, the city finds who nearby has it, and a local vendor fulfils it.</p>
          <div className="dk-steps">
            {[
              ['1', 'You need', 'Tell the city what you need.'],
              ['2', 'We connect', 'It finds the best local vendors near you.'],
              ['3', 'Vendors accept', 'Nearby vendors receive the request and take it on.'],
              ['4', 'They fulfil', 'The vendor prepares the order themselves.'],
              ['5', 'Delivered', 'By the vendor team, or by ours.'],
            ].map(([num, name, line]) => (
              <div key={num} className="dk-step"><b>{num}</b><em>{name}</em><span>{line}</span></div>
            ))}
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>The Mechanic</span></div>
      </section>

      <section className="dk-slide">
        <Label n="006" kind="Fulfilment" />
        <div className="dk-body">
          <h2 className="dk-h2">The vendor chooses how it reaches you</h2>
          <div className="dk-two">
            <div className="dk-body">
              <div className="dk-cap">Option 01 — the vendor delivers</div>
              <div className="dk-chain">
                <span>Vendor accepts</span><span>Their own team</span><span>On the way</span><span>At your door</span>
              </div>
              <p className="dk-note">A vendor with riders of its own keeps the whole trip, and the margin on it.</p>
            </div>
            <div className="dk-body">
              <div className="dk-cap">Option 02 — our delivery partners</div>
              <div className="dk-chain">
                <span>Vendor accepts</span><span>Assigned to a partner</span><span>A verified rider</span><span>At your door</span>
              </div>
              <p className="dk-note">A vendor without a fleet reaches the same doorstep through partners the city has verified.</p>
            </div>
          </div>
          <p className="dk-note">Either route reports to the same map — accepted, preparing, ready, out for delivery — tracked live to the door.</p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Fulfilment</span></div>
      </section>

      <section className="dk-slide">
        <Label n="007" kind="Why it works" />
        <div className="dk-body">
          <h2 className="dk-h2">Four things in, four reasons it holds</h2>
          <div className="dk-two">
            <div className="dk-body">
              <div className="dk-cap">What it asks of you</div>
              <div className="dk-tags two">
                <span>Your location, for the search nearby</span>
                <span>What you need, item or category</span>
                <span>Payment, once and secured</span>
                <span>Delivery preference, vendor or partner</span>
              </div>
            </div>
            <div className="dk-body">
              <div className="dk-cap">Why it works</div>
              <div className="dk-tags two">
                <span>The money goes to local vendors</span>
                <span>It ships from streets away, not a warehouse</span>
                <span>More vendors near you, better prices</span>
                <span>Every step of the order is visible</span>
              </div>
            </div>
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Why it works</span></div>
      </section>

      <Chapter n="008" num="01" name="Matchmaking" line="Compatibility first, attraction second, curation always." />

      <section className="dk-slide rev">
        <Label n="009" kind="The default" />
        <div className="dk-body">
          <h2 className="dk-h2">More options, more confusion</h2>
          <p className="dk-lede">Regular dating apps monetize the scroll. Every extra profile is revenue for the platform and fatigue for the person standing in the middle of it.</p>
          <div className="dk-three">
            <div><p className="dk-note">Volume as a feature</p></div>
            <div><p className="dk-note">Attraction before compatibility</p></div>
            <div><p className="dk-note">Mentally draining for both sides</p></div>
          </div>
          <img className="dk-shot no-case" src={`${A}dating-crowd.webp`} alt="A crowd of faces, none of them chosen" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 01</span></div>
      </section>

      <section className="dk-slide">
        <Label n="010" kind="Together City" />
        <div className="dk-body">
          <h2 className="dk-h2">Compatibility first, then attraction</h2>
          <p className="dk-lede">One curated introduction at a time, scored against values, intent and lifestyle before a single photo is shown.</p>
          <div className="dk-stats">
            <div className="dk-stat"><b>95%</b><span>Compatibility, shown up front</span></div>
          </div>
          <img className="dk-shot no-case" src={`${A}match.webp`} alt="A single introduction, with the reason it was made" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 01</span></div>
      </section>

      <Chapter n="011" num="02" name="Nutrition" line="The aisle, narrowed to what your body actually needs." />

      <Compare
        n="012" kind="Hub 02" head="Every aisle, or only your aisle"
        left={{ cap: 'What other platforms show you', img: 'nutrition-aisle.webp', alt: 'An endless supermarket aisle', note: 'Forty thousand SKUs, ranked by margin' }}
        right={{ cap: 'What Together City shows you', img: 'nutrition-picks.webp', alt: 'One short shelf of chosen products', note: 'One shelf, built from your medical profile' }}
      />

      <section className="dk-slide">
        <Label n="013" kind="Fulfilment" />
        <div className="dk-body">
          <h2 className="dk-h2">One basket, four local stores</h2>
          <p className="dk-lede">Items are split across whichever nearby stores hold them, packed in parallel, and collected on a single route.</p>
          <img className="dk-shot no-case" src={`${A}grocery.webp`} alt="One order split across four neighbourhood stores" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 02</span></div>
      </section>

      <Chapter n="014" num="03" name="Beauty" line="Skin data in, two products out." />

      <Compare
        n="015" kind="Hub 03" head="Ranked by ad spend, or by your skin"
        left={{ cap: 'Sorted by who pays the most', img: 'beauty-clutter.webp', alt: 'A wall of sponsored beauty products', note: 'Sponsored shelves, no clinical logic' }}
        right={{ cap: 'Sorted by what your skin needs', img: 'beauty-clean.webp', alt: 'Two products on an empty shelf', note: 'A serum and a moisturizer, matched to hydration, acne and UV needs' }}
      />

      <Chapter n="016" num="04" name="Fitness" line="Supplements and training plans that answer to your bloodwork." />

      <Compare
        n="017" kind="Hub 04" head="What the market sells, what science supports"
        left={{ cap: 'What the world tells you', img: 'fitness-clutter.webp', alt: 'A wall of supplement tubs', note: 'Every tub on the wall, none of them for you' }}
        right={{ cap: 'What we tell you', img: 'fitness-science.webp', alt: 'Two supplements with the reasoning beside them', note: 'Two products, annotated with the reason they were chosen' }}
      />

      <section className="dk-slide">
        <Label n="018" kind="How it works" />
        <div className="dk-body">
          <h2 className="dk-h2">Medical data in, three plans out</h2>
          <div className="dk-stats">
            <div className="dk-stat"><b>95%</b><span>Nutrition</span></div>
            <div className="dk-stat"><b>92%</b><span>Skin</span></div>
            <div className="dk-stat"><b>94%</b><span>Fitness</span></div>
          </div>
          <img className="dk-shot no-case" src={`${A}funnel.webp`} alt="One set of medical reports opening into three plans" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 04</span></div>
      </section>

      <section className="dk-slide">
        <Label n="019" kind="Retention" />
        <div className="dk-body">
          <h2 className="dk-h2">A plan for every stage</h2>
          <p className="dk-lede">Training adapts as the body does, so the plan stays correct instead of going stale after week three.</p>
          <div className="dk-three">
            <div><p className="dk-note">Daily plan, adjusted weekly</p></div>
            <div><p className="dk-note">Recovery read from the same medical profile</p></div>
            <div><p className="dk-note">Supplements and groceries stay in sync</p></div>
          </div>
          <img className="dk-shot no-case" src={`${A}workout.webp`} alt="A training plan in progress" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 04</span></div>
      </section>

      <Chapter n="020" num="05" name="Pharmacy" line="One prescription, distributed across the vendors who actually have it." />

      <Compare
        n="021" kind="Hub 05" head="Upload once, route to three pharmacies"
        left={{ cap: 'Step one — scan and verify', img: 'rx-upload.webp', alt: 'A prescription read line by line', note: 'Five line items read straight off the prescription' }}
        right={{ cap: 'Step two — distribute', img: 'rx-vendors.webp', alt: 'The same prescription split across three pharmacies', note: 'Each vendor approves only the items it stocks' }}
      />

      <section className="dk-slide">
        <Label n="022" kind="Hub 05 / Outcome" />
        <div className="dk-body">
          <h2 className="dk-h2">Full order, one delivery</h2>
          <div className="dk-stats">
            <div className="dk-stat"><b>3</b><span>Vendors</span></div>
            <div className="dk-stat"><b>4.9 km</b><span>Pickup route</span></div>
            <div className="dk-stat"><b>28 min</b><span>To the door</span></div>
          </div>
          <img className="dk-shot no-case" src={`${A}rx-complete.webp`} alt="One complete order at the door" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 05</span></div>
      </section>

      <Chapter n="023" num="06" name="Services" line="Invisible quoting from the professionals nearest to you." />

      <section className="dk-slide">
        <Label n="024" kind="Hub 06" />
        <div className="dk-body">
          <h2 className="dk-h2">The brief goes out, the quotes come back</h2>
          <p className="dk-lede">One upload becomes three priced, verified, time-estimated quotes from studios within five kilometres. You never have to ask.</p>
          <img className="dk-shot no-case" src={`${A}quoting.webp`} alt="One brief answered by three quotes" loading="lazy" />
        </div>
        <div className="dk-foot"><span>Together City</span><span>Hub 06</span></div>
      </section>

      <section className="dk-slide">
        <Label n="025" kind="Breadth" />
        <div className="dk-body">
          <h2 className="dk-h2">The same pattern, sixteen times over</h2>
          <p className="dk-lede">Every hub runs on the same three moves: read the profile, narrow the options, fulfil through nearby vendors. Adding a category is a data problem, not a new product.</p>
          <div className="dk-tags">
            {['Food and Dining', 'Grocery', 'Health and Medical', 'Beauty and Care',
              'Fitness and Sports', 'Home Services', 'Real Estate', 'Jobs',
              'Travel', 'Finance', 'Automotive', 'Local Retail'].map((c) => <span key={c}>{c}</span>)}
          </div>
          <div className="dk-two">
            <img className="dk-shot no-case" src={`${A}realestate.webp`} alt="Owner-direct listings in the Real Estate hub" loading="lazy" />
            <div className="dk-body">
              <div className="dk-cap">Real estate, already built</div>
              <p className="dk-note">132 verified listings, owner-direct, zero brokerage — the same narrowing logic applied to housing</p>
            </div>
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Breadth</span></div>
      </section>

      <section className="dk-slide rev">
        <Label n="026" kind="The rooms" />
        <div className="dk-body">
          <h2 className="dk-h2">Every room in the city is a conversation</h2>
          <p className="dk-lede">Text, photographs, files and voice notes — and anything from any hub sent as a card that links back to the thing it came from.</p>
          <div className="dk-tags">
            <span>Snaps: view once, twice, a day, or keep</span>
            <span>Sent, delivered, read — counted per recipient</span>
            <span>Reply, react, forward, star, pin</span>
            <span>Groups with owners, admins and members</span>
            <span>Search every thread by date or by starred</span>
            <span>City chats and dating chats never mix</span>
            <span>Every snap screened before it lands</span>
            <span>Five grounds to set the room in</span>
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>The rooms</span></div>
      </section>

      <section className="dk-slide">
        <Label n="027" kind="The mailbox" />
        <div className="dk-body">
          <h2 className="dk-h2">A city address, and real mail through it</h2>
          <p className="dk-lede">Every citizen gets an address of their own. Mail leaves the city as them, from a verified domain, and the reply comes back to the same thread.</p>
          <div className="dk-tags">
            <span>Inbox, sent, drafts, failed, starred, trash</span>
            <span>To, cc, bcc, and drafts that save themselves</span>
            <span>Attachments taken straight from your Drive</span>
            <span>Threaded the way Gmail and Outlook read it</span>
            <span>Projects: file a thread, catch its replies</span>
            <span>Search five fields, inside the folder you stand in</span>
            <span>Ten gigabytes, and a log of every dispatch</span>
            <span>Capped external sends — the city is not a megaphone</span>
          </div>
        </div>
        <div className="dk-foot"><span>Together City</span><span>The mailbox</span></div>
      </section>

      <section className="dk-slide">
        <Label n="028" kind="Personalization" />
        <div className="dk-body">
          <h2 className="dk-h2">One profile, and every hub reading it</h2>
          <p className="dk-lede">Identity, body, contact, diet and medical live on one page, versioned, with every change on the record. A write reaches the hubs that used to keep their own copy, so two rooms cannot disagree about the same person.</p>
          <div className="dk-tags">
            <span>Nutrition</span><span>Medical</span><span>Fitness</span><span>Beauty</span>
            <span>Dating</span><span>Jobs</span><span>Astrology</span><span>Local Services</span>
          </div>
          <p className="dk-note">The scores stay with the hubs, and they show their work: a fit percentage on a job, nine compatibility bands on a match, and a line saying how much of a profile the number was actually able to read. Mira carries a door on every page and a memory that refuses whole categories outright — and you can read back what she kept and delete it.</p>
        </div>
        <div className="dk-foot"><span>Together City</span><span>Personalization</span></div>
      </section>

      <section className="dk-slide rev">
        <Label n="029" kind="The ask" />
        <div className="dk-body">
          <h2 className="dk-h2">₹23.74 crore, to build it and open the doors</h2>
          <p className="dk-lede">₹12.32 crore builds the platform over eighteen months; ₹11.42 crore carries the soft launch through month thirty-six. From month twenty-five the model funds itself out of receipts.</p>
          <div className="dk-table c3">
            <div className="h">Use of funds</div><div className="h">₹ Cr</div><div className="h">Share</div>
            <div className="k">Product and engineering</div><div className="v">7.59</div><div className="n">32%</div>
            <div className="k">Working capital and contingency</div><div className="v">6.00</div><div className="n">25%</div>
            <div className="k">Customer acquisition and brand</div><div className="v">5.00</div><div className="n">21%</div>
            <div className="k">Team and operations</div><div className="v">3.95</div><div className="n">17%</div>
            <div className="k">Legal, compliance and security</div><div className="v">1.19</div><div className="n">5%</div>
            <div className="k">Category partnerships and supply</div><div className="v">0.02</div><div className="n">—</div>
          </div>
        </div>
        <div className="dk-foot"><span>Financial estimates</span><span>The ask</span></div>
      </section>

      <section className="dk-slide">
        <Label n="030" kind="Financial estimates" />
        <div className="dk-body">
          <h2 className="dk-h2">Seven years, on the model as it stands</h2>
          <div className="dk-scroll">
            <div className="dk-table c6">
              <div className="h">₹ crore unless stated</div>
              <div className="h">Y2–3 soft</div><div className="h">Y4</div><div className="h">Y5</div><div className="h">Y6</div><div className="h">Y7</div>
              <div className="k">Active users, million</div>
              <div className="v">18</div><div className="v">46</div><div className="v">84</div><div className="v">131</div><div className="v">188</div>
              <div className="k">Paying users, million</div>
              <div className="v">0.7</div><div className="v">2.2</div><div className="v">4.6</div><div className="v">7.8</div><div className="v">12.0</div>
              <div className="k">Revenue</div>
              <div className="v">86</div><div className="v">485</div><div className="v">1,594</div><div className="v">3,309</div><div className="v">5,831</div>
              <div className="k">EBITDA</div>
              <div className="v">11</div><div className="v">141</div><div className="v">1,133</div><div className="v">2,703</div><div className="v">5,035</div>
              <div className="k">EBITDA margin</div>
              <div className="n">12%</div><div className="n">29%</div><div className="n">71%</div><div className="n">82%</div><div className="n">86%</div>
            </div>
          </div>
          <p className="dk-note">Delivery and fulfilment is ₹1,780 crore of the ₹2,292 crore seven-year cost base — 78 per cent of everything the city spends. The margin above is what survives paying for the last mile.</p>
        </div>
        <div className="dk-foot"><span>Financial estimates</span><span>Projection, 8 July 2026 model</span></div>
      </section>

      <section className="dk-slide">
        <Label n="031" kind="Financial estimates" />
        <div className="dk-body">
          <h2 className="dk-h2">What a citizen is worth, and where the money comes from</h2>
          <div className="dk-two">
            <div className="dk-body">
              <div className="dk-cap">Unit economics, soft launch to year seven</div>
              <div className="dk-table c2">
                <div className="k">Activation, registered to active</div><div className="v">49%</div>
                <div className="k">Paid conversion, of active</div><div className="v">3.9% → 6.4%</div>
                <div className="k">Revenue per active user</div><div className="v">₹47 → ₹311</div>
                <div className="k">Revenue per paying user</div><div className="v">₹1,222 → ₹4,873</div>
                <div className="k">Gross margin</div><div className="v">75% → 97%</div>
                <div className="k">LTV / CAC at soft launch</div><div className="v">25.7×</div>
                <div className="k">Payback at soft launch</div><div className="v">2.0 months</div>
              </div>
            </div>
            <div className="dk-body">
              <div className="dk-cap">Largest districts by year seven, ₹ crore</div>
              <div className="dk-table c2">
                <div className="k">Restaurant Market</div><div className="v">1,531</div>
                <div className="k">Commerce</div><div className="v">996</div>
                <div className="k">Health</div><div className="v">517</div>
                <div className="k">Real Estate</div><div className="v">479</div>
                <div className="k">Travel</div><div className="v">474</div>
                <div className="k">AI Concierge</div><div className="v">359</div>
              </div>
            </div>
          </div>
          <p className="dk-note">Every figure on these three slides is a projection from the owner-built model of 8 July 2026, not a result. Six revenue categories are live at soft launch and nine by year four; two revenue streams become four.</p>
        </div>
        <div className="dk-foot"><span>Financial estimates</span><span>Projection, 8 July 2026 model</span></div>
      </section>

      <section className="dk-slide rev">
        <Label n="032" kind="Together City" />
        <div className="dk-body">
          <h2 className="dk-h2">One box in front of the whole city</h2>
          <p className="dk-lede">Ask for anything. The city already knows which version of it is yours.</p>
          <img className="dk-shot no-case" src={`${A}search.webp`} alt="One search box in front of the whole city" loading="lazy" />
        </div>
        <div className="dk-foot"><Link to="/">Enter the city</Link><span>2026</span></div>
      </section>
    </main>
  );
}
