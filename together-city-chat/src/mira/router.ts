import { manifest, type Capability } from './manifest';
import type { Lane } from './levity';

export interface Routed {
  lane: Lane;
  /** The manifest id, when one matched. */
  capabilityId?: string;
  /** 0–1. Below AMBIGUOUS_BELOW the turn is a question, not an action. */
  confidence: number;
  /** Why this lane — logged on the turn, and the first thing to read when a route is wrong. */
  why: string;
}

/**
 * Below this, Mira asks instead of acting.
 *
 * The number is doing real work: it is the line between "I know what you meant"
 * and "I think I know what you meant", and on the wrong side of it a citizen
 * gets a booking they did not ask for. It is set high on purpose. A clarifying
 * question costs one turn; a wrong R2 costs trust.
 */
export const AMBIGUOUS_BELOW = 0.55;

/**
 * Signals that a turn is about the citizen rather than about a task.
 *
 * Checked FIRST, before any capability match, and that ordering is the rule
 * rather than an optimisation: "I feel terrible, can you cancel Friday" is a
 * person telling you something, and answering it by cancelling Friday is the
 * single worst thing this router can do. The listen lane wins ties.
 */
const LISTEN =
  /\b(?:i (?:feel|'m feeling|am feeling)\b|everything feels|i can'?t cope|falling apart|i'?m struggling|can we talk|feeling (?:low|down|lost|awful|terrible)|had a (?:rough|bad|terrible) (?:day|week))/i;

/** Asking for an interpretation rather than a fact or an action. */
const ADVISE =
  /\b(?:why (?:has|have|is|does|do|did)\b.*\b(?:hard|difficult|stuck|bad|wrong|like this)|what (?:do you think|should i do)|read my chart|my chart|horoscope|what does (?:it|this) mean)/i;

/** A question about the citizen's own record — retrieval, never action. */
const RETRIEVE =
  /\b(?:where(?:'s| is| are)|find (?:my|me my)|what(?:'s| is|'ve| have) my|how much (?:do i have|is|did i)|show me my|do i have)\b/i;

/** Two readings, materially different. Named so the reason can be shown. */
const KNOWN_AMBIGUOUS: Array<{ re: RegExp; why: string }> = [
  { re: /^\s*cancel\b(?!.*\b(?:order|booking|reservation|subscription|flight|table)\b)/i, why: 'cancel what' },
  { re: /^\s*(?:book|order|get) (?:it|that|one)\s*$/i, why: 'book what' },
  { re: /^\s*(?:the )?(?:other|another) one\s*$/i, why: 'other than what' },
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Score a capability against an utterance.
 *
 * Deliberately dumb and deliberately free. Most turns are a handful of words
 * that map to one obvious thing, and a cheap deterministic pass answers them
 * without a model call — which is not only latency, it is the cost argument:
 * the model is the bill, and a turn that never reaches it costs nothing.
 *
 * When this is not confident, the caller escalates. It does not guess.
 */
function score(cap: Capability, q: string): number {
  const hay = norm(q);
  let best = 0;

  for (const u of cap.utterances ?? []) {
    const n = norm(u);
    if (!n) continue;
    if (hay === n) return 1;
    if (hay.includes(n)) best = Math.max(best, 0.85);
    else {
      const toks = n.split(' ').filter((t) => t.length > 2);
      if (toks.length) {
        const hit = toks.filter((t) => hay.includes(t)).length / toks.length;
        if (hit === 1) best = Math.max(best, 0.7);
        else if (hit >= 0.6) best = Math.max(best, 0.45 + hit * 0.2);
      }
    }
  }

  const intentToks = norm(cap.intent).split(' ').filter((t) => t.length > 4);
  if (intentToks.length) {
    const hit = intentToks.filter((t) => hay.includes(t)).length / intentToks.length;
    if (hit >= 0.5) best = Math.max(best, 0.35 + hit * 0.2);
  }

  return best;
}

/**
 * Classify one turn.
 *
 * Order matters and is the design: person before task, ambiguity before
 * action, and a capability match only when nothing above claimed the turn.
 */
export function route(text: string, opts: { capabilities?: Capability[] } = {}): Routed {
  const t = (text ?? '').trim();
  if (!t) return { lane: 'AMBIGUOUS', confidence: 0, why: 'empty' };

  if (LISTEN.test(t)) return { lane: 'LISTEN', confidence: 0.9, why: 'listen signal' };
  if (ADVISE.test(t)) return { lane: 'ADVISE', confidence: 0.8, why: 'asks for an interpretation' };

  for (const { re, why } of KNOWN_AMBIGUOUS) {
    if (re.test(t)) return { lane: 'AMBIGUOUS', confidence: 0.3, why };
  }

  const caps = opts.capabilities ?? manifest();
  const ranked = caps
    .map((c) => ({ c, s: score(c, t) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!ranked.length) return { lane: 'AMBIGUOUS', confidence: 0.15, why: 'nothing matched' };

  const [top, second] = ranked;

  // Two capabilities within a hair of each other is ambiguity, not a winner.
  // Taking the top of a near-tie is exactly how an assistant books the wrong
  // restaurant, and the margin is cheap insurance.
  if (second && top.s - second.s < 0.08) {
    return { lane: 'AMBIGUOUS', confidence: 0.4, why: `${top.c.id} and ${second.c.id} score the same` };
  }

  const lane: Lane = RETRIEVE.test(t) || top.c.risk === 'R0' ? 'RETRIEVE' : 'ACT';
  return { lane, capabilityId: top.c.id, confidence: top.s, why: `matched ${top.c.id}` };
}

/** Does this turn need a clarifying question rather than an answer? */
export const isUncertain = (r: Routed): boolean =>
  r.lane === 'AMBIGUOUS' || r.confidence < AMBIGUOUS_BELOW;
