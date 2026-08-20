/**
 * ── THE DISTRICT'S FRONT DOOR ───────────────────────────────────────────────
 *
 * A full-bleed cinematic plate, and everything under it is the city's own white
 * paper. That split is the answer to a real tension in the brief: the reference
 * asks for a futuristic, glassy, dark pet world, and this application's design
 * system grants a re-pointed ground to three hubs and Pets is not one of them.
 *
 * Both can be true if the cinema lives in the PICTURE rather than in the
 * chrome. A photograph is not a ground — it is a plate that ends — so the hero
 * can be as dark and as filmic as the art is, and the tools below it stay legible
 * on white with the amber lamp this hub already owns in `tokens.css`.
 *
 * `image` is the commissioned art (drop it at public/assets/img/pets-hub.webp).
 * With no art the fallback is a drawn night-street rather than a grey box,
 * because a hub landing with a missing hero looks broken rather than pending.
 *
 * INK OVER PICTURE IS ALWAYS `--on-stage` OVER `--scrim-deep`. Text laid
 * straight onto a photograph passes contrast on the dark half of the image and
 * fails on the light half, and which half it lands on depends on the crop.
 */

import { useState, type ReactNode } from 'react';

/**
 * THE SCRIM IS A MEDIA QUERY, WHICH IS WHY IT IS NOT AN INLINE STYLE.
 *
 * `floor` darkens the plate from the bottom and from the left, so the words
 * get their contrast and the picture keeps its top-right corner. That only
 * works while there IS a top-right corner the words do not reach. Narrow the
 * viewport and the ink block grows to the full width and most of the height of
 * the plate — there is no clear region left to protect, and the gradient's own
 * light end ends up behind the headline.
 *
 * Measured on the Pet world plate: floor-only held at 10.4:1 on a 1440 desk
 * and fell to 2.5:1 at 1024 and 2.6:1 at 390. So below the fold-out width the
 * flat sheet takes over — the same sheet that is the default everywhere else,
 * for the same reason.
 */
const SCRIM_CSS = `
.tc-hero-scrim{position:absolute;inset:0;z-index:-1;background:var(--scrim-deep)}
.tc-hero-scrim.drawn{background:linear-gradient(to top,var(--scrim-top),var(--scrim-clear) 62%)}
@media (min-width:1100px){
  .tc-hero-scrim.floor{
    background:
      linear-gradient(to top,var(--scrim-deep),var(--scrim-deep) 30%,var(--scrim-top) 66%,var(--scrim-clear)),
      linear-gradient(to right,var(--scrim-deep),var(--scrim-deep) 28%,var(--scrim-top) 62%,var(--scrim-clear) 82%);
  }
}
`;

interface Props {
  eyebrow: string;
  title: string;
  line: string;
  image?: string | null;
  actions?: ReactNode;
  tall?: boolean;
  /**
   * Short claims that belong to the plate rather than under it — the four
   * things a cause line is actually promising, in the reader's line of sight
   * while they are reading the promise. Optional, because a hero that has
   * nothing to promise should not grow a row of empty ticks.
   */
  marks?: string[];
  /**
   * 'sheet' lays --scrim-deep flat over the whole plate. 'floor' weights it to
   * the bottom, where the words are, and leaves the top of the picture alone.
   *
   * THE DEFAULT IS THE SAFE ONE and stays the default. A flat sheet is right
   * for a crop nobody controls: white sky can arrive behind a headline at any
   * viewport, and a gradient that assumed otherwise fails silently on the
   * phone nobody tested. 'floor' is for a plate whose bottom-left has actually
   * been measured against the ink that lands on it — see the contrast check in
   * the Pet world page's own note.
   */
  scrim?: 'sheet' | 'floor';
  /**
   * Where the subject of the photograph is, as a CSS `object-position`.
   *
   * The plate is `object-fit: cover`, so a landscape photograph in a portrait
   * frame loses most of its width — and what it loses is whatever is not in
   * the middle. On the Pet world plate the dog sits at about 62% across, so a
   * phone cropping to centre showed a slice of ear and a lot of tarmac. This
   * is the knob for that, and its default is the behaviour it replaces.
   */
  focus?: string;
}

export function DistrictHero({ eyebrow, title, line, image, actions, tall = true, marks, scrim = 'sheet', focus = '50% 50%' }: Props) {
  // The commissioned plate is a file that may not be on disk yet — in the
  // standalone prototype it certainly is not. An <img> that 404s renders as
  // nothing, so the failure is caught and the drawn scene takes over, and the
  // hero is never an empty black box in either environment.
  const [artFailed, setArtFailed] = useState(false);
  const art = artFailed ? null : image;
  return (
    <section
      style={{
        position: 'relative',
        borderRadius: 'var(--r-4)',
        overflow: 'hidden',
        minHeight: tall ? 'min(72vh, 620px)' : 260,
        display: 'grid',
        alignItems: 'end',
        background: 'var(--stage-solid)',
        boxShadow: 'var(--e2)',
        isolation: 'isolate',
      }}
    >
      <style>{SCRIM_CSS}</style>
      {art ? (
        <img
          src={art}
          alt=""
          aria-hidden
          onError={() => setArtFailed(true)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: focus, zIndex: -2 }}
        />
      ) : (
        <FallbackScene />
      )}

      {/* THE DISTRICT'S OWN LIGHT. `--lamp-face` is the amber `tokens.css`
          already grants Pets — a gradient, so it cannot be an SVG stop-color,
          but it can be exactly what it is here: a light source. Blurred, it
          reads as the glow of a street rather than as a shape. */}
      {!art && (
        <div
          aria-hidden
          style={{
            position: 'absolute', left: '8%', right: '-12%', bottom: '-34%', height: '96%',
            background: 'var(--lamp-face)', opacity: 0.72, filter: 'blur(76px)', borderRadius: '50%', zIndex: -2,
          }}
        />
      )}

      {/* PHOTOGRAPHY GETS THE DEEP SCRIM, THE DRAWN SCENE DOES NOT. A crop we
          do not control can put white sky behind the word "Pets"; the drawn
          scene cannot, so it keeps its own contrast and takes a soft floor
          gradient instead of a sheet of black over the whole plate. */}
      <div aria-hidden className={`tc-hero-scrim${art ? (scrim === 'floor' ? ' floor' : '') : ' drawn'}`} />

      <div style={{ padding: 'clamp(22px, 5vw, 54px)', display: 'grid', gap: 16, maxWidth: 760 }}>
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.28em', textTransform: 'uppercase', color: 'var(--on-stage-soft)' }}>
          {eyebrow}
        </span>
        {/* ONE WORD AND ONE SENTENCE ARE NOT THE SAME HEADLINE. "Pets" wants
            to be enormous; a sentence set at 118px is four lines of a word
            each and falls off a phone. The ramp is chosen from the length
            rather than from a prop, so it is a rule the next headline inherits
            instead of a setting the next author has to know about. */}
        <h1
          style={{
            margin: 0, color: 'var(--on-stage)',
            ...(title.length > 28
              ? { fontSize: 'clamp(29px, 5.2vw, 58px)', lineHeight: 1.06, letterSpacing: '-.02em' }
              : { fontSize: 'clamp(44px, 11vw, 118px)', lineHeight: 0.92, letterSpacing: '-.03em' }),
            fontWeight: 300,
          }}
        >
          {title}
        </h1>
        <p style={{ margin: 0, color: 'var(--on-stage-soft)', fontSize: 'clamp(15px, 2.2vw, 21px)', lineHeight: 1.45, maxWidth: 460 }}>
          {line}
        </p>
        {marks && marks.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '2px 0 0', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
            {marks.map((m) => (
              <li key={m} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 'clamp(10.5px, 1.4vw, 12px)',
                fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--on-stage-soft)' }}>
                {/* A rule rather than a tick: a tick is a claim that the thing
                    is done, and these are the four things the money is for.
                    --on-stage-soft rather than --on-stage-faint: faint ink is
                    for a solid ground, and it measured 1.8:1 over this one. */}
                <span aria-hidden style={{ width: 14, height: 1, background: 'var(--on-stage-soft)', flex: 'none' }} />
                {m}
              </li>
            ))}
          </ul>
        )}
        {actions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>{actions}</div>}
      </div>
    </section>
  );
}

/**
 * THE STAND-IN. A drawn city block at dusk with two very large animals in it —
 * the brief's own image, at the fidelity a vector can reach. It exists to be
 * replaced by photography, and it is built so that replacing it is one prop.
 */
function FallbackScene() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 700"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: -2 }}
    >
      <defs>
        <radialGradient id="pet-dusk" cx="62%" cy="88%" r="78%">
          <stop offset="0%" stopColor="var(--on-stage)" stopOpacity="0.10" />
          <stop offset="45%" stopColor="var(--on-stage)" stopOpacity="0.04" />
          <stop offset="100%" stopColor="var(--on-stage)" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="pet-street" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="var(--on-stage)" stopOpacity="0.16" />
          <stop offset="100%" stopColor="var(--on-stage)" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="1200" height="700" fill="var(--stage-solid)" />
      <rect width="1200" height="700" fill="url(#pet-dusk)" />
      <circle cx="915" cy="132" r="54" fill="var(--on-stage)" opacity="0.16" />

      {/* the skyline, read as silhouette against the glow */}
      <g fill="var(--on-stage)" opacity="0.09">
        <rect x="20" y="250" width="130" height="450" />
        <rect x="168" y="180" width="96" height="520" />
        <rect x="286" y="300" width="150" height="400" />
        <rect x="770" y="220" width="120" height="480" />
        <rect x="905" y="300" width="90" height="400" />
        <rect x="1010" y="160" width="170" height="540" />
      </g>
      <g fill="var(--on-stage)" opacity="0.85">
        {Array.from({ length: 54 }).map((_, i) => (
          <rect
            key={i}
            x={44 + (i % 9) * 128 + ((i * 37) % 34)}
            y={236 + ((i * 53) % 392)}
            width="9"
            height="14"
            opacity={0.25 + ((i * 7) % 5) / 8}
          />
        ))}
      </g>

      {/* the pet-food billboard */}
      <g>
        <rect x="466" y="196" width="248" height="132" rx="10" fill="var(--on-stage)" opacity="0.07" />
        <rect x="486" y="220" width="118" height="9" rx="4" fill="var(--on-stage)" opacity="0.45" />
        <rect x="486" y="242" width="190" height="26" rx="7" fill="var(--on-stage)" opacity="0.8" />
        <rect x="486" y="286" width="88" height="8" rx="4" fill="var(--on-stage)" opacity="0.28" />
      </g>

      <rect x="0" y="470" width="1200" height="230" fill="url(#pet-street)" />

      {/* a very large dog, seated on the right of the street */}
      <g fill="var(--on-stage)" opacity="0.3">
        <path d="M980 700c-30-70-24-150 6-206 14-26 10-52-6-74-12-16-6-34 12-36 14-2 24 8 30 22 10 24 34 30 58 24 30-8 54 10 62 42 12 46 6 96-14 138-16 34-18 62-8 90H980Z" />
      </g>
      <g fill="var(--on-stage)" opacity="0.9">
        <circle cx="1036" cy="418" r="7" />
        <circle cx="1074" cy="414" r="7" />
      </g>

      {/* a very large cat, sitting on the left, tail along the pavement */}
      <g fill="var(--on-stage)" opacity="0.26">
        <path d="M120 700c-18-60-10-124 16-166 12-20 10-40-2-56-10-14-4-28 10-28 10 0 18 8 22 18 8 20 28 24 46 18 22-8 40 8 46 34 10 40 4 84-12 120-12 28-14 44-6 60H120Z" />
        <path d="M232 700c40-16 62-44 58-76l26 6c6 42-24 82-72 100l-12-30Z" />
      </g>
      <g fill="var(--on-stage)" opacity="0.9">
        <circle cx="162" cy="484" r="6" />
        <circle cx="190" cy="484" r="6" />
      </g>

      {/* two people walking, for scale */}
      <g fill="var(--on-stage)" opacity="0.34">
        <rect x="560" y="616" width="11" height="46" rx="5" />
        <circle cx="565" cy="606" r="8" />
        <rect x="596" y="620" width="10" height="42" rx="5" />
        <circle cx="601" cy="611" r="7" />
        <path d="M572 640c14 4 22 8 24 14" stroke="var(--on-stage)" strokeWidth="2" fill="none" />
      </g>
    </svg>
  );
}
