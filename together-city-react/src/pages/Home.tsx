import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHubTheme } from '@/hooks/useHubTheme';
import { useAuthStore } from '@/store/auth.store';
import { CityHeader } from '@/components/CityHeader';
import { RecentPanel } from '@/components/RecentPanel';
import { HUBS } from '@/config/hubs';
import { useCityDesign, useMiraShown } from '@/hooks/useCityDesign';
import type { HubKey } from '@/types';
import { InstallCity } from '@/components/InstallCity';
import { CityDoors } from '@/components/CityDoors';
import { Icon } from '@/components/ui/Icon';

/* THE CLICKABLE BUILDINGS ARE GONE (owner, 8 Sep), and the array they were
   went with them. Ten polygons and an ellipse, measured against the CGI
   pavilion render this page used to open on — Nutrition at 178,364, Medical
   at 1144,290, Matchmaking as an ellipse over the arena. The page opens on
   the commercial now, and a coordinate cut to a picture that is no longer
   underneath it is not a door, it is a trap: an invisible rectangle over live
   footage that opens Medical when somebody clicks a car.

   KEPT RATHER THAN COMMENTED OUT. Nothing here is lost that the walk below,
   the foot grid, Personalize, the command palette and each hub's own route do
   not already answer; and if the map ever comes back as a section of its own,
   it comes back against the picture it is measured for, not against these
   numbers. git remembers them. */

/* ═══ THE REEL ═══════════════════════════════════════════════════════════════
   TWO FILMS, NOT ONE (owner, 8 Sep). The hero used to be a single commercial
   with `loop` on the element, which is the browser's own one-clip repeat. A
   second film cannot be added to that: `loop` restarts the file it is set on
   and knows nothing about a next one.

   So the reel is kept here instead — the first film, then the second, then
   round again, for as long as the page is open. Both cuts of each film are
   listed so <source media> still picks the phone file before a byte is
   downloaded, and each film keeps its own poster frame so the first paint is
   the picture that is about to move rather than a black rectangle. */
interface Film { phone: string; wide: string; poster: string; label: string; }
/* The phone cut is written FIRST in each entry because it is offered first in
   the markup: <source media> is read top down and the browser stops at the
   first rule it matches, so the small file has to precede the large one or a
   phone downloads fifteen megabytes to show a five-inch picture. Keeping the
   fields in the order the sources are emitted means the two can never drift. */
const FILMS: Film[] = [
  {
    phone: '/assets/video/together-city-commercial-phone.mp4',
    wide: '/assets/video/together-city-commercial.mp4',
    poster: 'together-city-commercial.webp',
    label: 'Together City — the film',
  },
  {
    phone: '/assets/video/together-city-commercial-2-phone.mp4',
    wide: '/assets/video/together-city-commercial-2.mp4',
    poster: 'together-city-commercial-2.webp',
    label: 'Together City — the second film',
  },
];

interface Pavilion { to: string; img: string; title: string; }
const PAVILIONS: Pavilion[] = [
  // Travel's tile went with its tab (owner, 15 Aug) — the hub is alive, it is
  // just not being advertised here.
  { to: '/astrology', img: 'astrology-hub.webp', title: 'Astrology Hub' },
  { to: '/nutrition', img: 'nutrition-and-groceies.webp', title: 'Nutrition & Groceries' },
  { to: '/social', img: 'social-life.webp', title: 'Together TV' },
  { to: '/dating', img: 'dating-hub.webp', title: 'Matchmaking Hub' },
  { to: '/entertainment', img: 'entertainment.webp', title: 'Entertainment' },
  { to: '/realestate', img: 'real-estate.webp', title: 'Real Estate' },
  { to: '/jobs', img: 'jobs-hub.webp', title: 'Jobs Hub' },
  { to: '/medical', img: 'medical-hub.webp', title: 'Medical Hub' },
  { to: '/beauty', img: 'beautymarket.webp', title: 'Beauty Market' },
  { to: '/fitness', img: 'fitness-hero.webp', title: 'Fitness Hub' },
  { to: '/financial', img: 'financial-district.webp', title: 'Financial District' },
  // Personalize joins the foot grid on the day it joins the street (owner,
  // 7 Sep). It is the door onto the ten districts that read a profile, so it
  // stands beside them rather than above them.
  { to: '/personalize', img: 'personalize-hub.webp', title: 'Personalize' },
];

/* Twelve tiles, six across and two down. This used to be `slice(0, 12)`,
   which was not a cap — it was how the thirteenth entry, a coming-soon
   E-Commerce tile, was kept off the grid while staying in the array. The
   entry is gone, so the slice would now be a rule with nothing to enforce. */
const FALLBACK = PAVILIONS;

/**
 * THE DISTRICTS' OWN VOICE (owner's master list, 9 Aug 2026).
 *
 * One noun and one sentence per district — "TRAVEL / Your world, planned your
 * way." The hub configs keep their own tags for the rooms inside; this is the
 * street-level copy the billboards wear, and it lives here rather than in
 * hubs.ts so a hub's interior label and its billboard line can differ without
 * either pretending to be the other.
 *
 * Local Services was absent from the first list DELIBERATELY — it named CARS,
 * and this city has no cars hub — and the owner's second list (6 Sep) gives
 * Services a line of its own, so it has one.
 */
const DISTRICT_COPY: Partial<Record<HubKey, { name: string; line: string }>> = {
  /* ── THE OWNER'S SECOND MASTER LIST (6 Sep) ───────────────────────────────
     Eleven districts rewritten in one message, against the billboards as they
     now stand on the walk. Where the card's line and the picture behind it
     disagreed, the picture was right: Fitness's board says trainer,
     nutritionist and friend, and the card said "Your body. Your goals. Your
     journey." Medical's board says records in one place AND nutrition and
     fitness informed by them; the card said half of that.

     THE FOUR NOT ON THE LIST KEEP WHAT THEY HAD — Beauty, Entertainment, Jobs
     and Pets were not mentioned, and a line nobody asked to change is a line
     that is working. */
  nutrition: { name: 'Nutrition', line: 'Your body. Your data. Your nutrition. Personalized exclusively for you.' },
  dating: { name: 'Matchmaking', line: 'Compatibility first. Attraction next. Intention follows.' },
  entertainment: { name: 'Entertainment', line: 'Your world of things you love.' },
  jobs: { name: 'Jobs', line: 'Your career, your next move.' },
  medical: { name: 'Medical', line: 'All your medical records. One place. Personalized nutrition & fitness, informed by your health.' },
  financial: { name: 'Financial', line: 'Your money. All in one place. From everyday spending to insurance & investments.' },
  realestate: { name: 'Real Estate', line: 'Find your next home. Connect directly with the owner.' },
  fitness: { name: 'Fitness', line: 'Your personal trainer, nutritionist & friend — all in one.' },
  beauty: { name: 'Beauty', line: 'Your look, your way.' },
  /* THE NAME STAYS TOGETHER CITY TV. The owner's list heads this one SOCIAL,
     which is what the district IS — but the hub was renamed on 5 Sep and the
     tab bar, the rail and the breadcrumb all say Together TV (shortened from
     Together City TV on 7 Sep). A card that
     said Social would be the only place in the city that did. The LINE is the
     owner's, and it is the one painted on the board. */
  /* AND ITS LINE IS THE CHANNEL, NOT THE NEIGHBOURHOOD (owner, 6 Sep, an hour
     after the list): "Together City TV — your own personal channel for your
     viewers." The line the list gave it was the old social feed's promise, and
     this room stopped being a feed on 5 Sep. What it is now is a television
     where every citizen has a channel, and that is what the card says.

     THE COMMA IS OURS. The card sets its line in two weights and splits at the
     last clause; without one the whole sentence is set in the ink and the
     payoff has nothing to be a payoff to. Not a word is added or dropped. */
  social: { name: 'Together TV', line: 'Your own personal channel, for your viewers.' },
  /* ASTRA IS THE BILLBOARD'S OWN NAME, and this is the one card where the
     district's name is not enough on its own: the picture says "Talk to
     ASTRA", so a card labelled only Astrology is a label beside a name it
     never explains. Both, in the owner's order. */
  astrology: { name: 'ASTRA — Astrology', line: 'Billions of patterns. One future. Yours.' },
  /* THE DISTRICT WHOSE PLATE IS NOT ITS HUB'S NAME, and the override exists
     for exactly that: the hub is Pet Care in the tab bar, the rail and the
     breadcrumb, because that is what the district IS. On the walk it says Pet
     Products, on the owner's instruction — the walk is a shop window, and a
     plate reading Pet Products says what is behind it more usefully than one
     reading Pet Care. Nothing else moves: this map is read by the home run
     alone. */
  pets: { name: 'Pet Products', line: 'Your pets are your babies. Everything they need, all in one place.' },
  /* BABY CARE HAS A LINE AND NO PLATE (owner, 8 Sep). The billboard copy lives
     here for every district, whether or not the district is currently on the
     walk — Entertainment, Financial and Personalize all keep theirs. Baby Care
     is off PANELS and off PAVILIONS for one reason and it is not a decision
     about the hub: there is no photograph for it yet. Drop a 1800px hero into
     public/assets/img and a tile beside it, add the two entries, and the plate
     is live. Entertainment's Personalize banner is held back the same way. */
  babycare: { name: 'Baby Care', line: 'Everything for the first ten years. Prices you can check yourself.' },
  /* SINGULAR, MATCHING THE TAB. The owner's list heads this one DIGITAL
     STORES; the nav, the hub and the breadcrumb say Digital Store, renamed the
     same afternoon. One of the two spellings has to be the city's, and it is
     the one on every other surface. */
  ecommerce: { name: 'Digital Store', line: 'Everything personalized. Infinite possibilities. Powered by local shops.' },
  /* SERVICES HAD NO LINE UNTIL NOW, and the absence was deliberate: the first
     master list named CARS, this city has no cars hub, and a plate announcing
     a room the app does not have is the one thing the golden rule forbids. The
     owner has given it its own line, so it takes it. */
  services: { name: 'Local Market', line: 'Everyone you need, right in your neighborhood.' },
  /* THE OWNER'S POSTER, 7 SEP, AND THE ONE CARD ON THIS WALK WHOSE PICTURE IS
     A LIST. Every other plate is a photograph of a place; this one is the ten
     districts as banners, because that is what is behind the door. The line is
     the poster's own, with its second clause spelled the way the city spells
     it — the poster reads "see only what you suits you". */
  personalize: { name: 'Personalize', line: 'Personalize all aspects of your life. See only what suits you.' },
};


/**
 * THE NAME A DISTRICT WEARS, IN ONE PLACE.
 *
 * Two sources now: the billboard copy above, then the hub config. There used
 * to be a third — a literal for E-Commerce, the one district with no hub
 * behind it — and every place this key was handled carried a branch for that
 * one exception. The run is SORTED by this name, and a sort keyed on one
 * spelling while the screen prints another is the kind of bug that looks like
 * a mystery, so it is worth having exactly one answer here.
 */
export function districtName(key: HubKey): string {
  return DISTRICT_COPY[key]?.name ?? HUBS[key].name;
}

/** The district's one sentence. The hub's own tag stands in where the master
 *  list has not given the district a line (Local Services, deliberately). */
export function districtLine(key: HubKey): string {
  return DISTRICT_COPY[key]?.line ?? HUBS[key].tag;
}

/**
 * WHERE THE SENTENCE TAKES ITS WEIGHT (owner's card reference, 6 Sep).
 *
 * The reference sets its line in two weights — the setup grey, the payoff
 * black — and that is what makes a two-line caption read as a caption rather
 * than a paragraph. These lines are already written for it: "Your stars. Your
 * journey. Your timing." and "Your food, personalized to you." both end on the
 * part worth reading twice.
 *
 * So the split is the last sentence, or failing that the last clause, and the
 * emphasis is on what comes after it. A line with neither — one plain sentence
 * — is set whole in the darker ink rather than being cut somewhere arbitrary,
 * because a break invented to satisfy a rule is worse than no break.
 */
export function splitDistrictLine(line: string): { lead: string; emph: string } {
  const at = Math.max(line.lastIndexOf('. ', line.length - 2), line.lastIndexOf(', '));
  if (at < 0) return { lead: '', emph: line };
  return { lead: line.slice(0, at + 1), emph: line.slice(at + 1).trim() };
}

/* ═══ THE WALK IS GONE (owner, 9 Sep: "remove walk the hub") ════════════════
   Thirteen photographs of hub landings, three to a row, under the film. It was
   the home page's longest section and, by the end, its most redundant one: the
   header carries the four doors, the hero carries the same four as glass
   pills, Personalize carries these very districts as banners the owner drew
   himself, the foot grid carries twelve tiles, and the command palette carries
   all of them. A citizen who scrolled past the film met the city a fourth
   time.

   WHAT WENT: PANELS (which district wears which photograph), DISTRICTS (its
   alphabetical sort) and the section that drew them.

   WHAT STAYED, and why none of it is orphaned: DISTRICT_COPY and the three
   readers below it are the master list of what each district is CALLED and
   what it SAYS, and Personalize imports all three for its banners — that copy
   was never the walk's, it only happened to be printed there first. The foot
   grid, the routes, the map buildings, the palette entries and the Design Your
   Services switches are untouched. `.district-card*` stays in relief.css for
   the same reason: Personalize's banners wear it (the-poster-is-a-room). */

/** City home — the pavilion city, ported 1:1 from index.html. */
export function Home() {
  const authed = useAuthStore((s) => Boolean(s.tokens?.accessToken && s.user));
  /* The page reads differently on a phone: no key into a city you are already
     standing in, the city grid at the foot, and the resume shelf after it. */
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches;
  useHubTheme(null);
  const img = (f: string) => `/assets/img/${f}`;
  /* DESIGN YOUR SERVICES: the home page shows the citizen's city. A hub
     switched off in the profile section loses its map zone, its billboard on
     the walk and its tile in the foot grid — at render, exactly the way Travel
     left these surfaces for everyone. The buildings stay in the photograph;
     a photograph is not a menu. Hidden is not deleted: the routes still
     answer, and the profile section puts everything back in one press. */
  const { hubOn } = useCityDesign();
  /* The film and whether it is speaking. `sound` follows the element rather
     than leading it — see the button below. */
  const films = useRef<(HTMLVideoElement | null)[]>([]);
  const [clip, setClip] = useState(0);
  /* The second film is not mounted with the page. It is mounted once the
     first one is actually PLAYING, so it buffers through those forty seconds
     and the change-over is a cut rather than a spinner — and a visitor who
     leaves before the first film ends never pays for the second. */
  const [warm, setWarm] = useState(false);
  const [sound, setSound] = useState(false);
  /* One place decides what is playing: the active film runs, the other is
     stopped and wound back to its first frame so it is ready to open on it,
     and both carry the same mute state so the button can never lie. */
  useEffect(() => {
    films.current.forEach((el, i) => {
      if (!el) return;
      el.muted = !sound;
      if (i === clip) {
        void el.play().catch(() => undefined);
      } else {
        el.pause();
        try { el.currentTime = 0; } catch { /* not seekable yet; it opens on its poster */ }
      }
    });
  }, [clip, sound, warm]);
  // The sixth door (owner, 5 Sep): the hero's "Talk to Mira" follows the
  // operator's switch like her other five. Off, the door is not drawn — she
  // keeps answering, and an open conversation stays open.
  const miraShown = useMiraShown();
  const tiles = FALLBACK.filter((p) => hubOn(p.to.slice(1)));

  return (
    <div>
      {/* ============ THE COMMERCIAL ============ */}
      {/* THE FILM REPLACES THE MAP (owner, 8 Sep). The page opened on a CGI
          pavilion city with fifteen lit billboards and ten invisible click
          zones cut to its buildings — a picture of the product's metaphor. It
          opens on the product now: thirty seconds of a street, shot, with the
          city's promise said out loud at the end.

          AND THE ZONES WENT WITH THE PICTURE THEY WERE CUT FROM. Their
          coordinates were measured against that render, and over live footage
          every one of them is a trap: an invisible rectangle at 1144,290 that
          opens Medical when a citizen clicks a passing car. Ten hubs lose this
          door and keep every other one — the walk, the foot grid below, the
          command palette, Personalize, their switch on Design Your Services
          and their route. Hidden is not deleted; a door onto the wrong room
          is worse than no door. */}
      <div className="cinema">
        {/* Location · date · live weather, top-left, above the film. */}
        <div className="cinema-strip"><CityHeader /></div>
        {/* SOUND IS OFFERED, NEVER TAKEN. Every browser refuses to autoplay a
            film with sound, and a page that shouted at its first visitor would
            deserve the refusal — so it starts muted, and the one control on
            the picture turns the sound ON. The state is the video's own
            property rather than a mirror of it: `muted` is set on the element
            and read back, so the button can never disagree with what the
            citizen is hearing.

            IT PLAYS ON A PHONE TOO (owner's call, 8 Sep), which reverses the
            900px rule the old loop had: that rule was for a BACKDROP, and
            this is the message. The phone is served a 1280-wide cut at a third
            of the bytes, chosen by <source media> so the browser picks before
            it downloads anything.

            AND NOW THERE ARE TWO OF THEM (owner, 8 Sep). The films are stacked
            in the same frame rather than swapped into one element: swapping
            `src` throws the decoded picture away and shows the poster while
            the next file opens, which at the join of two commercials reads as
            a fault. Stacked, the one that has ended fades out of the way of
            the one already buffered behind it, and the cut is instant. */}
        {FILMS.map((f, i) => (
          (i === 0 || warm) ? (
            <video
              key={f.wide}
              ref={(el) => { films.current[i] = el; }}
              className="bg"
              style={{ opacity: i === clip ? 1 : 0, zIndex: i === clip ? 2 : 1 }}
              autoPlay={i === 0}
              muted
              playsInline
              preload="auto"
              poster={img(f.poster)}
              aria-hidden={i !== clip}
              aria-label={f.label}
              onPlaying={() => { if (i === 0) setWarm(true); }}
              onEnded={() => setClip((i + 1) % FILMS.length)}
            >
              <source src={f.phone} type="video/mp4" media="(max-width: 899px)" />
              <source src={f.wide} type="video/mp4" />
            </video>
          ) : null
        ))}
        <button
          type="button"
          className="cinema-sound"
          aria-pressed={!sound}
          aria-label={sound ? 'Mute the film' : 'Play the film with sound'}
          onClick={() => {
            const el = films.current[clip];
            if (!el) return;
            el.muted = !el.muted;
            // A film that was paused by the browser starts when the sound is
            // asked for; a rejected play() is not an error worth showing.
            if (!el.muted) void el.play().catch(() => undefined);
            setSound(!el.muted);
          }}
        >
          {/* THE WORD CAME OFF (owner, 8 Sep). A crossed-out speaker is the one
              icon on the internet nobody has to be told the meaning of, and
              "SOUND OFF" beside it at 38px was a caption on the film rather
              than a control at the edge of it. The label lives on in
              aria-label, so a screen reader still hears a sentence. */}
          <Icon name={sound ? 'speak' : 'mute'} size={17} />
        </button>
      </div>

      <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '88px 32px 24px' }}>
        {/* ============ WELCOME ============ */}
        <div className="center rise" style={{ textAlign: 'center' }}>
          {/* THE MASTHEAD COMES OUT OF CAPS (owner, 7 Sep): "make this sentence
              case and fix grammar". It was SET in caps since 6 Sep — typed as
              a sentence, printed as one — and at sixty-four pixels across
              thirteen words that is a wall to be got past rather than a line
              to be read. Sentence case gives the words their ascenders back,
              which is what the eye reads a long line by.

              AND THE GRAMMAR IT WAS HIDING: "Largest Digital City" was
              title-cased in the middle of a sentence, which caps concealed and
              lower case would not have, and the two participles ran on with a
              comma between them. One "and" joins them and the sentence closes
              on its own. */}
          <h1 style={{ maxWidth: '30ch', margin: '0 auto', fontSize: 'clamp(34px, 5.2vw, 64px)', lineHeight: 1.1 }}>The world&rsquo;s largest digital city, personalized for you and powered by your trusted local vendors.</h1>
          <p className="lede" style={{ margin: '22px auto 0', fontSize: 'clamp(18px, 1.9vw, 23px)', lineHeight: 1.6, maxWidth: '58ch' }}>
            Set your preferences once. Every hub personalizes to you.
          </p>
          <div style={{ marginTop: 30, display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            {authed ? (
              /* THE DOOR IS MIRA, AND IT IS ON THE PHONE TOO.
                 A hub wall answers "what is here"; it cannot answer "I need a
                 table for four on Saturday". This is the front door for people
                 who know what they want and not where it lives — which, after
                 the first week, is most people most of the time.

                 IT USED TO BE HIDDEN ON A PHONE, and the reason was sound for a
                 different button: this said "Enter your city", and on a phone
                 the citizen has already entered — the hub wall is right there
                 under the fold and the bottom bar is under their thumb. A
                 second door to the same room is clutter.

                 It is not the same room any more. When the copy changed to
                 "Talk to Mira" the guard was left behind, and it hid the ONLY
                 route to her from the home screen on the device most people use
                 — a signed-out visitor kept the button, a signed-in citizen lost
                 it. The argument that justified hiding it now argues the other
                 way: the smaller the screen, the more it costs to go and find
                 the page yourself. */
              miraShown ? (
                <Link className="btn btn-gold" to="/chats?c=__mira__">
                  Talk to Mira
                </Link>
              ) : null
            ) : (
              <>
                <Link className="btn btn-gold" to="/sign-up">{miraShown ? 'Talk to Mira' : 'Join the city'}</Link>
                <Link className="btn" to="/sign-in">Sign in</Link>
              </>
            )}
          </div>
          {/* The city is built for a phone; this is where it says so. */}
          <InstallCity />
          {/* ...and then the four doors, so the hero ends on a place to go
              rather than on a picture of an address. Same four as the header,
              same order, same list. */}
          <CityDoors />
        </div>

        <div className="rule" />

        {/* ============ CONTINUE WHERE YOU LEFT OFF ============ */}
        {!phone && <RecentPanel />}
      </div>

      {/* THE CITY GRID, AT THE FOOT. It used to sit at the top of a phone,
          above the welcome — twelve doors before a word of introduction. It is
          the same twelve tiles and the same markup; only the place and the
          shape changed (six across, two down; see index.css). */}
      <div className="cityfallback">
        {tiles.map((p) => (
          <Link key={p.to} to={p.to}><img loading="lazy" src={img(p.img)} alt="" /><span>{p.title}</span></Link>
        ))}
      </div>

      {/* On a phone the resume shelf sits here, at the end: 'continue where you
          left off' is the last thing you want offered, not the first thing in
          front of a city you have not looked at yet. */}
      {phone && <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '8px 20px 0' }}><RecentPanel /></div>}

      {/* THE STRIP IS FOR SOMEBODY DECIDING, NOT SOMEBODY INSIDE.
          Five claims in grey capitals sat here — one identity, curated,
          private, split with friends, concierge — and on a phone they stacked
          into five lines directly above the footer, which made them the last
          thing a citizen read on their way out of their own home screen. They
          are sales copy, and a citizen who is signed in has already bought.
          So: nothing at all once you are in.

          A visitor still gets two, because two is what somebody deciding can
          hold. The three that go were the three the hero already made:
          'curated, never cluttered' and 'concierge always on' are the
          personalisation promise again, and 'split & plan with friends' is a
          feature, not a reason to trust the place. What is left is the pair
          nothing else on the page says — one account for all of it, and
          privacy as the default rather than a setting. */}
      {!authed && (
        <div className="wrap" style={{ maxWidth: 1240, margin: '0 auto', padding: '48px 32px 24px' }}>
          <div className="trust">
            <span>◈ One identity, every hub</span>
            <span>◈ Private by default</span>
          </div>
        </div>
      )}
    </div>
  );
}
