/**
 * The levity governor.
 *
 * Mira is funny. That is the riskiest thing about her, and it is why the
 * decision of WHETHER to be funny is taken here, in code, before the composer
 * runs — never by the model.
 *
 * The reasoning is the same one that put the astrology voice rules in code and
 * the allergen screen in a shared matcher: a model asked to read the room will
 * misread it exactly where misreading is worst. Its failure mode is a joke
 * ninety seconds after somebody says their father is in hospital, and there is
 * no recovering from that with that citizen — no amount of charm elsewhere
 * pays for it.
 *
 * So the composer is handed a number and must obey it.
 */

export type Lane = 'ACT' | 'RETRIEVE' | 'ADVISE' | 'LISTEN' | 'AMBIGUOUS';
export type Risk = 'R0' | 'R1' | 'R2' | 'R3' | 'R4';

/** 0 none · 1 dry · 2 teasing · 3 playful · 4 loud */
export type LevityLevel = 0 | 1 | 2 | 3 | 4;

export interface LevityInput {
  lane: Lane;
  /** Risk of the pending step, if this turn has one. */
  risk?: Risk;
  /** Domain of the pending capability, e.g. 'medical', 'financial'. */
  domain?: string;
  /** The citizen's message this turn. */
  text: string;
  /** Their previous few messages, newest first. Used only for register mirroring. */
  recent?: string[];
  /** True once anything in this session has tripped the distress signal. Sticky. */
  distressLocked?: boolean;
  /** The previous step failed. Never be funny about your own failure. */
  lastStepFailed?: boolean;
  /**
   * Whole weeks since they first spoke to her.
   *
   * No longer gates humour — kept because it is genuine session context and
   * because reversing the playful-by-default decision should be a one-line
   * change here rather than a re-plumb.
   */
  weeksKnown: number;
  /** Their explicit setting: 0 less · 1 default · 2 more. */
  dial?: 0 | 1 | 2;
  /** Local hour, 0–23, in the citizen's timezone — never the server's. */
  hour: number;
}

export interface LevityVerdict {
  level: LevityLevel;
  /** Whether this turn tripped the distress signal, so the caller can persist the lock. */
  distress: boolean;
  /** Human-readable derivation. Logged on the turn; this is what makes a misfire debuggable. */
  trace: string[];
}

/**
 * Distress and low mood.
 *
 * Deliberately broad and deliberately unweighted — a false positive costs one
 * flat turn, a false negative costs the citizen. There is no symmetry here to
 * balance, so the thresholds are not tuned.
 */
const DISTRESS =
  /\b(hospital|hospice|icu|died|passed away|funeral|cancer|tumou?r|terminal|divorc\w*|separat(?:ed|ing)|fired|laid off|redundan\w*|miscarr\w*|assault\w*|abuse\w*|suicid\w*|self.?harm|overdose)\b/i;

const LOW_MOOD =
  /\b(?:i (?:feel|am feeling|'m feeling) (?:terrible|awful|awful|lost|hopeless|empty|numb|worthless)|everything feels|i can'?t cope|falling apart|panic attack|breaking down|i'?m struggling|can we talk)\b/i;

/** Their register, not hers. Only ever lifts, never lowers. */
const PLAYFUL = /(?:\bl+o+l+\b|\bhaha+\b|\blmao\b|😂|🤣|\broast me\b|\bmake it fun\b|\bjk\b|\bkidding\b)/i;

/** Domains where she is never funny, whatever else is true. */
const SILENT_DOMAINS = new Set(['medical', 'medicines', 'health', 'legal', 'privacy', 'moderation']);

/**
 * PLAYFUL BY DEFAULT — owner decision, 14 Aug.
 *
 * The first cut of this file ramped her up: L1 for the first fortnight, warmer
 * after a month, on the reasoning that a stranger being familiar is a stranger
 * being presumptuous. The owner's call is the opposite, and it is a legitimate
 * product position: her humour IS the product, so meeting a dry version of her
 * for two weeks means most people never meet her at all.
 *
 * What that trades: a first-session joke that misses has no relationship to
 * absorb it. The mitigation is that the settings dial still exists and still
 * works — somebody who finds her too much can turn her down in one tap.
 *
 * What it does NOT trade is anything below. The caps in `levity()` split into
 * two kinds, and only one kind moved:
 *
 *   TASTE   — how long they have known her, the hour, their dial.  RELAXED.
 *   SAFETY  — distress, the listen lane, a failed step, medical, R4.  UNTOUCHED.
 *
 * "Always playful" is a statement about the first kind. The second kind is not
 * a tone setting, and no dial reaches it.
 *
 * ── AND THE RATIO IT SITS UNDER — owner decision, 15 Aug ─────────────────────
 *
 * Two documents disagreed about who Mira is, and the table below is the one
 * place the answer is executable, so it is recorded here.
 *
 *   Framework v1.0 §3   70% best friend · 15% assistant · 10% strategist · 5% menace
 *   Mira.md §3          40% assistant — "the floor nothing else may eat into"
 *
 * THE FRAMEWORK WINS. Friendship is primary; competence is what a friend has.
 *
 * The numbers in BASE already say so — playful-by-default moved them on 14 Aug —
 * so nothing below changes. What the decision changes is what counts as a BUG:
 * an answer so long that `say()` drops her aside is no longer merely verbose,
 * it is the ratio being lost to arithmetic on the turn that mattered. That is
 * asserted in `mira.service.spec.ts`, not left to judgement.
 */
const BASE: Record<Lane, LevityLevel> = {
  LISTEN: 0,
  ADVISE: 2,
  AMBIGUOUS: 2,
  RETRIEVE: 2,
  ACT: 3,
};

export function levity(input: LevityInput): LevityVerdict {
  const trace: string[] = [];
  const text = input.text ?? '';

  const distressNow = DISTRESS.test(text);
  const lowMood = LOW_MOOD.test(text);
  const distress = distressNow || Boolean(input.distressLocked);

  const base: LevityLevel = BASE[input.lane];
  trace.push(`lane ${input.lane} → base L${base}`);

  // ── Caps. Each is independent and the lowest wins; none can be overridden
  // by a lift below, which is the whole point of computing them separately.
  let cap = 4;
  const capAt = (n: number, why: string) => {
    if (n < cap) { cap = n; trace.push(`${why} → cap L${n}`); }
    else trace.push(`${why} (cap already L${cap})`);
  };

  if (distressNow) capAt(0, 'distress signal in this turn');
  else if (input.distressLocked) capAt(0, 'distress lock held from earlier this session');
  if (lowMood) capAt(0, 'low-mood signal');
  if (input.lane === 'LISTEN') capAt(0, 'listen lane');
  if (input.lastStepFailed) capAt(0, 'previous step failed');
  if (input.domain && SILENT_DOMAINS.has(input.domain)) capAt(0, `domain ${input.domain}`);
  if (input.risk === 'R4') capAt(0, 'R4 pending');
  // R3 is capped at the turn level rather than zeroed: she may be dry around a
  // payment. The confirmation CLAUSE itself is held plain by the composer, not
  // here — that is a different rule about a different span of text.
  if (input.risk === 'R3') capAt(2, 'R3 pending — the clause itself stays plain');
  // Taste caps, relaxed under the playful-by-default decision above. The small
  // hours still take the edge off — 3am is rarely anyone's best moment — but she
  // stays warm rather than going flat.
  if (input.hour < 6) capAt(2, `${String(input.hour).padStart(2, '0')}:00 local`);
  if (input.dial === 0) capAt(1, 'their dial: less');

  // ── Lifts. Only their own behaviour and their own setting.
  let lift = 0;
  const theirs = [text, ...(input.recent ?? []).slice(0, 3)];
  if (theirs.some((t) => PLAYFUL.test(t))) { lift += 2; trace.push('their register is playful → +2'); }
  if (/\broast me\b/i.test(text)) { lift += 2; trace.push('explicitly invited → +2'); }
  if (input.dial === 2) { lift += 1; trace.push('their dial: more → +1'); }

  const level = Math.max(0, Math.min(base + lift, cap)) as LevityLevel;
  trace.push(`result L${level} (base ${base} + lift ${lift}, cap ${cap})`);

  return { level, distress, trace };
}

/**
 * Is this span allowed to carry a joke?
 *
 * Separate from the level because a single turn contains spans with different
 * rules. At L2 she may open with a tease and must still deliver the amount
 * flat: "Your fridge has reached the single-sad-lemon stage again. Three
 * thousand six hundred and ten rupees. Place it?" — the second sentence is
 * plain no matter what the first one did. Every mishearing that costs money
 * starts in that clause.
 */
export function spanAllowsLevity(level: LevityLevel, span: 'lede' | 'body' | 'confirm' | 'receipt'): boolean {
  if (span === 'confirm') return false;
  return level >= 2;
}
