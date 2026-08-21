/**
 * THE ONE LANE WHERE BEING WRONG IS NOT RECOVERABLE.
 *
 * `relate.ts` already refused to script violence, control and addiction. What it
 * had no pattern for at all was somebody saying they want to die — so "I want to
 * kill myself" missed BEYOND entirely, matched the word "myself" as the
 * relationship, and was answered with the self-reflection exercise: say the
 * sentence you have been circling out loud, once, to nobody. That is the worst
 * answer this product is capable of producing, and until today it was the
 * default one for the sentence that matters most.
 *
 * ── WHY THIS IS ITS OWN MODULE, AND WHY IT EXPORTS ITS REGEX ───────────────
 *
 * Three files need this lexicon and for three different reasons: `relate.ts` to
 * stop and hand over, `levity.ts` to never be funny anywhere near it, and
 * `router.ts` to take the listen lane instead of guessing at a task. Three
 * copies of a word list drift, and the copy that drifts is always the one
 * nobody re-reads. So there is exactly one list, it lives here, and the other
 * two import `CRISIS_RE` rather than keeping their own.
 *
 * Everything here is deterministic and no model is in the path. A turn that
 * matches has already been answered, in words a person wrote, before anything
 * generative is asked for an opinion.
 */

export type CrisisWho = 'self' | 'other';

/**
 * First person, in the words people actually type.
 *
 * The clinical words — "suicidal", "self-harm" — were the only ones the old
 * distress pattern knew, and they are the words people use LAST. What arrives
 * at 2am is "i can't go on" and "there's no reason to live". Hinglish is in the
 * same list rather than a separate one because a citizen switches language
 * mid-sentence and a second list would only get half of them.
 */
const SELF = [
  String.raw`(?:kill|killing|hurt|hurting|harm|harming|cut|cutting)\s+myself`,
  String.raw`end(?:ing)?\s+my\s+life`,
  String.raw`end(?:ing)?\s+it\s+all`,
  String.raw`tak(?:e|ing)\s+my\s+own\s+life`,
  String.raw`want(?:ed|ing)?\s+to\s+die`,
  String.raw`wanna\s+die`,
  String.raw`do(?:n['’]?t|\s+not)\s+want\s+to\s+(?:live|be\s+here|be\s+alive)`,
  String.raw`no\s+reason\s+to\s+live`,
  String.raw`nothing\s+(?:left\s+)?to\s+live\s+for`,
  String.raw`better\s+off\s+without\s+me`,
  String.raw`(?:can['’]?t|cannot|can\s+not)\s+go\s+on`,
  String.raw`overdos(?:e|ed|ing)`,
  String.raw`suicid\w*`,
  String.raw`self[\s-]?harm\w*`,
  String.raw`jaan\s+de(?:na|ne)?`,
  String.raw`mar\s+jaun`,
  String.raw`marna\s+chah(?:ta|ti)\s+hoon`,
  String.raw`khudkhushi`,
  String.raw`atmahatya`,
];

/** The same thing about somebody else. A third-party subject has to come first
 *  and has to be close — within two words. Without the distance limit "my dad
 *  died and I want to die" reads as a disclosure about the dad, and the person
 *  actually at risk is told to look after somebody else. */
const SUBJECT = String.raw`(?:my\s+(?:best\s+friend|friend|sister|brother|mother|father|mum|mom|dad|papa|son|daughter|child|kid|wife|husband|partner|boyfriend|girlfriend|cousin|colleague|classmate|roommate|flatmate|neighbour|neighbor|bhai|didi|ex)|he|she|they|someone|somebody)`;

const OTHER_ACT = [
  String.raw`wants?\s+to\s+(?:die|kill\s+(?:him|her|them)self|end\s+(?:his|her|their)\s+life|end\s+it\s+all)`,
  String.raw`wanna\s+die`,
  String.raw`(?:kills?|killed|killing|hurts?|hurting|harms?|harmed|harming|cuts?|cutting)\s+(?:him|her|them)self`,
  String.raw`end(?:s|ed|ing)?\s+(?:his|her|their)\s+life`,
  String.raw`(?:talk(?:s|ed|ing)?|think(?:s|ing)?|thought)\s+about\s+ending\s+it`,
  String.raw`suicidal`,
  String.raw`attempted\s+suicide`,
  String.raw`overdosed`,
  String.raw`does\s?n['’]?t\s+want\s+to\s+(?:live|be\s+here)`,
];

export const CRISIS_SELF = new RegExp(String.raw`\b(?:${SELF.join('|')})`, 'i');
export const CRISIS_OTHER = new RegExp(
  String.raw`\b${SUBJECT}\b(?:\s+\w+){0,2}\s+(?:${OTHER_ACT.join('|')})\b`,
  'i',
);

/** The union, for the two files that only need to know THAT this is a crisis
 *  turn and not who it is about. One lexicon, three readers. */
export const CRISIS_RE = new RegExp(`${CRISIS_OTHER.source}|${CRISIS_SELF.source}`, 'i');

/**
 * ── THE TWO THINGS SHE SAYS ───────────────────────────────────────────────
 *
 * Short, because a paragraph is something to read rather than something to do,
 * and somebody at this point in an evening is not reading a paragraph.
 *
 * The numbers are literal digits inside a deterministic string. No model is in
 * this path, so nothing can round 14416 into a helpful-sounding wrong number —
 * which is the specific failure that makes a helpline worse than no helpline,
 * because the number is trusted on sight.
 *
 * Tele-MANAS (14416, free, 24/7, national) and the emergency number (112) were
 * checked against telemanas.mohfw.gov.in on 21 Aug 2026. Check them again
 * before editing a word of either string.
 */
export const CRISIS_SAY: Record<CrisisWho, string> = {
  self: 'I want you safe. This is bigger than me — it needs a person who can actually be there with you, tonight. Tele-MANAS is free and open all day and night on 14416, and 112 if you are in danger right now. Call somebody you trust as well, and stay near them if you can.',
  other: 'I want them safe as much as you do, and this needs a person who can actually be there with them. Tele-MANAS is free and open all day and night on 14416 — you can call it yourself and ask what to do next. If they are in danger right now, 112. Tell somebody else who loves them too, so you are not carrying this on your own.',
};

/**
 * Read one turn.
 *
 * `other` only when a third-party subject is actually present; everything else
 * that matches is read as first person, because that is the reading whose
 * mistake is survivable. Telling somebody who mentioned a friend that you want
 * THEM safe costs a small awkwardness. The other direction costs everything.
 */
export function readCrisis(text: string): { who: CrisisWho; say: string } | undefined {
  const t = (text ?? '').trim();
  if (!t) return undefined;
  if (CRISIS_OTHER.test(t)) return { who: 'other', say: CRISIS_SAY.other };
  if (CRISIS_SELF.test(t)) return { who: 'self', say: CRISIS_SAY.self };
  return undefined;
}
