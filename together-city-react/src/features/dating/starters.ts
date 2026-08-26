/**
 * ── WHAT TO SAY FIRST, MADE FROM WHAT THEY SAID ─────────────────────────────
 *
 * The owner, 26 Aug, on the chat redesign: instead of one large generic prompt
 * card, personalised conversation starters "based on the two people's profiles
 * and compatibility" — each one tappable, each tap seeding the composer with a
 * question the sender can edit before sending.
 *
 * NO MODEL IS CALLED AND NOTHING IS INVENTED. Every personalised line is read
 * off a field the other person chose to put on their profile — an interest,
 * their city, their work — and the evergreen four are the owner's own examples
 * from the brief (the ideal Sunday, the place worth going back to, the hidden
 * talent, the recent film). A generated compliment about somebody the engine
 * has never met is exactly the "AI chatbot sitting inside the conversation"
 * the brief rules out. Mira remains the one who reads anything, and only when
 * invited (mira-reads-one-chat.test.ts).
 *
 * NO PRONOUNS. The labels use the person's name ("Mira's ideal Sunday") so a
 * profile whose gender the copy guessed wrong is a bug this file cannot have.
 *
 * Pure and deterministic on purpose: same profile, same four starters, and a
 * unit test can hold the shape without a network.
 */

/** The slice of a match detail this module reads. Everything optional: a
 *  sparse profile still gets the evergreen four. */
export interface StarterSource {
  name: string;
  interests?: string[];
  city?: string | null;
  occupation?: string | null;
}

export interface Starter {
  /** The tappable line — a short noun phrase, not a sentence. */
  label: string;
  /** What lands in the composer — a natural question, theirs to edit. */
  question: string;
}

/** Possessive that doesn't double an s: "Mira's", "Hans'". */
const poss = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);

export function startersFor(d: StarterSource): Starter[] {
  const name = (d.name || 'them').trim();
  const out: Starter[] = [];

  // From their own profile first — at most two, so the evergreens always
  // leave room and a long interest list doesn't crowd the card.
  const interest = (d.interests ?? []).find((i) => i && i.trim());
  if (interest) {
    const it = interest.trim();
    out.push({
      label: `How ${name} got into ${it.toLowerCase()}`,
      question: `How did you get into ${it.toLowerCase()}?`,
    });
  }
  if (d.city && d.city.trim()) {
    const city = d.city.trim();
    out.push({
      label: `${poss(name)} ${city}`,
      question: `What’s the one place in ${city} you’d take a first-time visitor?`,
    });
  } else if (d.occupation && d.occupation.trim()) {
    out.push({
      label: `Life as ${/^[aeiou]/i.test(d.occupation.trim()) ? 'an' : 'a'} ${d.occupation.trim().toLowerCase()}`,
      question: `How did you end up in ${d.occupation.trim().toLowerCase()}?`,
    });
  }

  // The owner's evergreen four, topping the list up to exactly four.
  const evergreen: Starter[] = [
    { label: `${poss(name)} ideal Sunday`, question: 'What’s your ideal Sunday?' },
    { label: `A place ${name} would go back to tomorrow`, question: 'What’s a place you’d go back to tomorrow?' },
    { label: `${poss(name)} hidden talent`, question: 'What’s your hidden talent?' },
    { label: `The best film ${name} has seen recently`, question: 'What’s the best film you’ve seen recently?' },
  ];
  for (const s of evergreen) {
    if (out.length >= 4) break;
    out.push(s);
  }
  return out.slice(0, 4);
}
