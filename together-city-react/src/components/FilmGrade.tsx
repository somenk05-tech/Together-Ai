/**
 * THE FILM CURVE, AS A FILTER THE STYLESHEET CAN NAME.
 *
 * A hub that grades its photographs points `--film` at `url(#tc-film)`; this
 * mounts the filter that name resolves to. Inert everywhere else — an SVG with
 * no rendered geometry costs nothing on hubs that never reference it.
 *
 * WHY AN SVG FILTER AND NOT A CSS ONE. The grade's signature is a WHITE POINT:
 * white lands at 238,231,220 and never at 255. Nothing in the CSS filter
 * shorthand can say that. `sepia()` tints, `contrast()` stretches around the
 * midpoint, `brightness()` scales — none of them can pin an endpoint, and a
 * grade without a white point is just a tinted photograph.
 *
 * THE NUMBERS ARE MEASURED, NOT CHOSEN. Two plates were sampled:
 *
 *     plate 1 (35mm mirror selfie)  white 243,238,226   black 0,13,3
 *     plate 2 (photobooth strip)    white 233,224,214   black 1,1,0
 *
 * The warm rolled-off white is what they share. The shadows are where they
 * disagree, and the strip wins: lifted green blacks read as a print fault in a
 * bright room. Hence white 238,231,220, black 0,3,0, and the mids pulled under
 * the diagonal so the pictures keep their contrast.
 *
 * `color-interpolation-filters="sRGB"` is load-bearing. The default is
 * linearRGB, and in linearRGB every one of these numbers lands somewhere else.
 */
export function FilmGrade() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false"
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <filter id="tc-film" colorInterpolationFilters="sRGB">
        <feComponentTransfer>
          <feFuncR type="table" tableValues="0.0000 0.1913 0.4245 0.6718 0.9330" />
          <feFuncG type="table" tableValues="0.0120 0.1953 0.4188 0.6557 0.9060" />
          <feFuncB type="table" tableValues="0.0000 0.1769 0.3927 0.6214 0.8630" />
        </feComponentTransfer>
        <feColorMatrix type="saturate" values="0.90" />
      </filter>
    </svg>
  );
}
