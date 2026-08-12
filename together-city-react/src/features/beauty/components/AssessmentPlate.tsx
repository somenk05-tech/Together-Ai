/**
 * THE ASSESSMENT, SET RATHER THAN PRINTED.
 *
 * It was a paragraph: "Your assessment flags Pigmentation & spots, Fine lines &
 * firmness, Oil balance as the priorities. The routine below targets these
 * while respecting your skin type and sensitivities." — thirteen-point-five
 * type, on the ground, deliberately without a card round it, because the card
 * it used to have was the city's notice idiom and made the answer look like an
 * alert about itself.
 *
 * That reasoning was right about the notice and wrong about the card. This is
 * the single most important sentence on the page — it is what the photographs
 * and the questionnaire were FOR — and it was set smaller than the section
 * headings under it. A thing can be given a surface without being given an
 * alarm.
 *
 * ── THE COMPOSITION IS THE OWNER'S REFERENCE, AND IT IS ALREADY IN THE HUB ──
 *
 * An oval outline chip of tracked capitals, a display serif set large and
 * centred with the emphasis alternating roman and italic, and one small italic
 * line beneath. That is the reference, and it is also — chip aside — what
 * `.beauty-plate` has been doing on this page since the poster arrived. So this
 * is a plate: same cream, same hairline, same lift, same centred axis, and the
 * display face is `.beauty-display`, which is the hub's ONE display class and
 * borrows the press serif by name. Nothing new is granted for this, which is
 * the test of whether the last grant was drawn at the right size.
 *
 * ── THE THREE FINDINGS ARE THE DISPLAY LINE ────────────────────────────────
 *
 * Not the whole sentence. "Your assessment flags … as the priorities" is
 * scaffolding around three words, and at 38px the scaffolding is what you read.
 * The chip says what the plate is; the findings are the content; the qualifier
 * goes underneath in italic, where the reference puts its own subtitle.
 *
 * ITALIC ON EVERY SECOND FINDING. The reference's character is the roman and
 * the italic against each other in one line, and with a list of two or three
 * that is the only honest generalisation of it — alternating by position is
 * deterministic, needs no judgement about which finding matters more, and
 * cannot invent emphasis the assessment did not express. One finding stays
 * roman throughout; there is no rhythm to make out of one word.
 *
 * ── AND IT IS IN THE HUB'S INK, NOT THE REFERENCE'S GREEN ──────────────────
 *
 * The reference is set in a deep green. Beauty's hue is magenta and the ground
 * grant is explicit that the hue is not the ground and not the ink — the room
 * is neutral, and the one coloured thing in it is the lit key of the rail. A
 * green display line here would be a fourth hue arriving on a page, with no
 * grant, no measured contrast, and no answer to "why green". The composition is
 * what was asked for; the colour it was printed in belongs to the poster.
 */
export function AssessmentPlate({ focus, note }: { focus: string[]; note: string }) {
  return (
    <div className="beauty-plate beauty-assess">
      {/* Two lines, like the reference's, because a chip that is wider than it
          is tall stops reading as a stamp and starts reading as a button. */}
      <span className="chip" aria-hidden>
        <span>What to</span>
        <span>work on</span>
      </span>

      {/* The findings ARE the heading, so this is the plate's heading element.
          A display line that is only decorative would be an aria-hidden span;
          this one is the answer, and it is what a screen reader should meet
          first inside the plate. */}
      <h2 className="beauty-display">
        {focus.map((f, at) => (
          <span key={f}>
            {at % 2 === 1 ? <em>{f}</em> : f}
            {at < focus.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </h2>

      {note && <p className="beauty-display note">{note}</p>}
    </div>
  );
}
