import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../shared/prisma/prisma.service';
import { swallow, swallowed } from '../shared/swallow';
import { FinancialService } from '../financial/financial.service';
import { DriveService } from '../drive/drive.service';
import { AstrologyService } from '../astrology/astrology.service';
import { TarotService } from '../astrology/tarot.service';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { NutritionService } from '../nutrition/nutrition.service';
import { MedicalService } from '../medical/medical.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MasterProfileService } from '../profile/master-profile.service';
import { FitnessService } from '../fitness/fitness.service';
import { BeautyService } from '../beauty/beauty.service';
import { EntertainmentService } from '../entertainment/entertainment.service';
import { TravelService } from '../travel/travel.service';
import { ThoughtsService } from '../thoughts/thoughts.service';
import { route, isUncertain, type Routed } from './router';
import { levity, type LevityLevel, type LevityVerdict } from './levity';
import { moodFor, tilted, type Mood } from './mood';
import { sayWithTrace, nothing, type Colour } from './say';
import { resolveChoice, isChoice, type Choice, type Refusal } from './choose';
import { timeContext, daypartOf, SLOT_SAID } from './daypart';
import { keepable, knownBlock, EXTRACT_SYSTEM, type Fact } from './fact';
import { MiraRegistry } from './mira.registry';
import { MiraLedger, mentions, type Outcome } from './ledger';
import { acceptOrFallback, violations } from './voice';
import { persona, confidant, lifePathOf, BANNED_FROM_HER_MOUTH, FREE_CHATS, SUB_INR, PAYWALL_LINE } from './persona';
import { findInCity, whyWeAsk } from './city';
import { readSituation, type Read } from './relate';
import { readForget, readForgetConfirm } from './forget';
import { greet, type Greeting } from './greeting';
import { DaybookService } from '../daybook/daybook.service';
import { PetsService } from '../pets/pets.service';

/**
 * Narrowing helpers, because the hub services return their own shapes.
 *
 * The first cut of the executor below used `any` in nine places and the lint
 * ceiling caught every one. It was right to: `any` here means a hub changing
 * the name of a field surfaces as "₹NaN" in front of a citizen rather than as
 * a red build. These read one field at a time and admit when it is missing.
 */
function pick(o: unknown, key: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[key] : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}
function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}
/**
 * THE LOOKING-BACK SHEET'S QUESTIONS, so an answer is read back with the
 * question it was given to. "the meeting" tells her nothing; "what went well:
 * the meeting" tells her everything. The order is the order on the page.
 */
const REFLECTION_PROMPTS: Array<[string, string]> = [
  ['feeling', 'how the day felt to them, 1–10 (their reading, not a mark)'],
  ['wentWell', 'what went well today'],
  ['proudOf', 'something they are proud of'],
  ['grateful1', 'grateful for'],
  ['grateful2', 'grateful for'],
  ['grateful3', 'grateful for'],
  ['difficult', "what was difficult or didn't go as planned"],
  ['learned', 'what they can learn from it'],
  ['win', 'the win of today'],
  ['challenge', 'the challenge'],
  ['tomorrow', "tomorrow's focus"],
];

/** A list, however the hub chose to wrap it. */
function asList(v: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(v)) return v;
  for (const k of keys) {
    const inner = pick(v, k);
    if (Array.isArray(inner)) return inner;
  }
  return [];
}
/**
 * The plan engine's slot letters, said the way a person says them. `label` is
 * the fallback and it is Title Case, which reads as a database row when it
 * lands mid-sentence.
 */
/**
 * ── A DEAD COLUMN, WRITTEN HONESTLY ───────────────────────────────────────
 *
 * `MiraTurn.room` is `String` and required, and every row ever written carries
 * `'city'` or `'friend'`. There is one Mira now, so the column distinguishes
 * nothing — but dropping it is a migration that also rewrites
 * `@@index([userId, room, createdAt])`, and Railway applies migrations on boot.
 * That is a schema change, not this one. Until then every new row goes in under
 * the key the whole history is already under, and nothing reads it back.
 */
const ROW_KEY = 'city';

const rupees = (n: number): string => `₹${Math.round(n).toLocaleString('en-IN')}`;

/**
 * The meter, with the price written on it.
 *
 * The web app typed ₹999 out at three call sites and the free total at two,
 * with nothing checking any of them against what the wallet is actually
 * charged — and its own comment says so, and names serving them here as the
 * fix. `persona.ts` holds both numbers; this is the one place they cross the
 * wire. Optional as ever, so an older client that ignores them is fine.
 */
const priced = (p: { freeLeft: number | null } | undefined):
{ freeLeft: number | null; inr: number; freeTotal: number } | undefined =>
  (p ? { ...p, inr: SUB_INR, freeTotal: FREE_CHATS } : undefined);

/** "a, b and c" — an assistant that says "a, b, c" is reading out a database. */
/**
 * "When will I find love?"
 *
 * Asked in production the night she went live, and it reached NOTHING. ADVISE
 * wants `my chart` or `horoscope`; LISTEN wants `i feel`; `readSituation` wants
 * one of nine relationship words and "love" is not one; and `city.ts` gives
 * Dating the words matches/dates/profile. So it fell all the way through to the
 * gap, and the gap said: "What are you actually trying to get done?"
 *
 * That is Mode 3 answering a Mode 1 question — an operational clause asked of
 * somebody wondering about their life — and under a spectrum that is 70% friend
 * it is exactly inverted. §24 bans the register; §7 names the mode.
 *
 * She also may not answer it. §11: no guaranteed marriage, no guaranteed
 * anything. So this returns the honest shape — she declines the prediction, says
 * what she actually has, and opens it. §25: honesty with direction is guidance;
 * honesty without direction is criticism.
 */
const FORETOLD =
  /\b(?:when will i|when am i (?:going to|gonna)|will i ever|am i (?:ever )?going to (?:find|meet|get|be)|is it (?:a )?good time to)\b/i;

function foretold(text: string): Attempt | undefined {
  if (!FORETOLD.test(text)) return undefined;
  return {
    outcome: 'advise',
    text: "I'm not going to put a date on that — nobody honestly can. Your reading is the closest thing I have to an answer, and it's written fresh each day.",
    goto: { label: 'Astrology', path: '/astrology' },
  };
}

/**
 * THE LARGEST SEED THE WIRE WILL CARRY, and it lives here now.
 *
 * It was a constant in the controller because both schemas had to agree on it
 * (`seed.spec.ts` tells that story). The server DERIVES the seed now, so the
 * number is a fact about the derivation rather than about a request shape, and
 * the controller imports it back for its two schemas. One constant still, and
 * the schemas still cannot diverge from it.
 */
export const SEED_MAX = 10_000_000;

/**
 * ── THE SAFETY GOVERNOR'S INPUTS ARE NOT THE BROWSER'S TO SEND ────────────
 *
 * `hour`, `weeksKnown` and `distressLocked` decided how playful she was allowed
 * to be and whether the distress latch was held — and all three arrived in the
 * request body. A curl with `{hour: 14, weeksKnown: 999, distressLocked: false}`
 * defeated the small-hours damper and the latch together, and no citizen had to
 * be malicious for it to go wrong: a tab is per-device and empty after a
 * refresh, so the latch was lost exactly when somebody came back.
 *
 * The comment defending the old arrangement named `MasterProfile.timeZone` as
 * the thing that class of bug exists to prevent — while the server held that
 * zone and read the browser's copy instead. So the zone comes off the profile,
 * the hour is computed IN that zone, the weeks come off `MiraPass.firstSeenAt`,
 * and the latch is a timestamp on the account that decays on its own.
 *
 * `dial` stays the client's. It is a preference — "less" or "more" — and a
 * citizen turning their own humour down is not a safety input.
 */
interface Governed {
  /** Their zone: the profile's, and only then the tab's. */
  tz?: string;
  /** Their local hour IN that zone. */
  hour: number;
  /** Whole weeks since `firstSeenAt`. */
  weeksKnown: number;
  /** The latch, from `distressUntil`, still inside its decay. */
  distressLocked: boolean;
  /** One number per citizen per local day — the same one on both devices. */
  seed: number;
  /** A topic forget she offered and has not performed, while it is still fresh. */
  pendingForget?: string;
  /** Openings she has already used, newest first. */
  greetings: string[];
}

/**
 * How long the distress latch holds before it decays.
 *
 * Four hours, and the shape of the number is the point. It used to be a boolean
 * in a browser tab: it could not clear within a session at all, and it cleared
 * completely on a refresh — the worst of both, a latch that was simultaneously
 * too sticky and too easy to lose. An evening is the unit that matters here;
 * somebody who was at the edge at nine is not fair game for a joke at eleven,
 * and somebody who was at the edge on Tuesday is not being handled with tongs
 * on Thursday.
 */
const DISTRESS_HOLD_MS = 4 * 60 * 60 * 1000;

/** How long an unanswered "shall I forget that?" stays answerable. A "yes"
 *  arriving an hour later is a yes to something else. */
const FORGET_WINDOW_MS = 10 * 60 * 1000;

/** How many turns a topic forget will look at. Far past any real answer, and
 *  a ceiling, because an unbounded read is an unbounded read. */
const FORGET_MAX = 500;

/** Openings she keeps a record of, so she stops repeating on a 42-session
 *  cycle. Ten is about a fortnight of opens and is one small array. */
const GREETINGS_KEPT = 10;

/**
 * How much of her memory she keeps, per room, per citizen.
 *
 * MiraTurn had no expiry at all — it grew for the life of the account, which
 * is the same privacy liability the ledger's day files were given a retention
 * window to avoid. Two thousand turns is far more than `recall()` (30) or the
 * thread (60) ever read, so the ceiling is invisible to a citizen and finite
 * to everybody else.
 */
const KEEP_TURNS = 2000;

/**
 * How certain a capability has to be before it may answer in the FRIEND room.
 *
 * `route()` scores against the manifest in both rooms and 0.55 is enough to
 * return a data readout — with no check on which room asked. So a sentence in
 * the companion tab that happened to share two words with a decorator came
 * back as a database row, which is the assistant with three ifs in it wearing
 * the friend's clothes. In the city room 0.55 is right: somebody there asked
 * for a thing. Here she has to be nearly certain, and below it the turn is a
 * conversation.
 */
const FRIEND_CAPABILITY = 0.8;

/**
 * An instant, in the citizen's own clock.
 *
 * Framework §10: she must understand the user's timezone, and must never be
 * vague when precise information is available. The first cut of `dayBrief`
 * interpolated the hub's raw field and said "wants starting by
 * 2026-08-15T05:15:00.000Z" — a machine string in a sentence, and UTC, so even
 * read correctly it named an hour five and a half hours from the one on the
 * citizen's wall.
 *
 * Falls back to nothing rather than to a wrong time: an omitted clause reads as
 * her not mentioning it, and a wrong one reads as her being wrong.
 */
function clockTime(iso: string | undefined, tz: string | undefined): string | undefined {
  if (!iso) return undefined;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz || 'UTC',
    }).format(at).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * The line the persona uses to speak from the citizen's clock: "Friday 15
 * August, 12:58 am". Their zone, never the server's, for the reason clockTime
 * gives above — and absent rather than wrong when the zone is not sent.
 */
function clockLine(tz: string | undefined): string | undefined {
  if (!tz) return undefined;
  try {
    return new Intl.DateTimeFormat('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
      hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz,
    }).format(new Date()).replace(/\s?(am|pm)/i, (m) => m.trim().toLowerCase());
  } catch {
    return undefined;
  }
}

/**
 * Their local hour, computed from their zone rather than taken from their tab.
 *
 * Undefined rather than wrong when the zone is unusable, for the same reason
 * `clockTime` omits a clause rather than naming a wrong time — the caller then
 * falls back to what the client claimed, which is where we started and is
 * strictly better than a confident wrong hour.
 */
function hourIn(tz: string | undefined): number | undefined {
  if (!tz) return undefined;
  try {
    const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(new Date()));
    if (!Number.isFinite(h)) return undefined;
    // en-GB renders midnight as 24 with hour12 off, and hour 24 is hour 0.
    return h === 24 ? 0 : h;
  } catch {
    return undefined;
  }
}

/** Their local calendar day, for the seed. Falls back to the city's clock —
 *  the same choice `ledger.ts` makes and for the same reason. */
function localDay(tz: string | undefined): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * WHICH MIRA TURNED UP, AND WHY IT IS THE SAME ONE ON BOTH DEVICES.
 *
 * The seed picks her mood and which aside she reaches for, and it was computed
 * in the browser from the date and a per-device salt — so she was a different
 * character on the phone and on the laptop on the same afternoon, and a cleared
 * cache changed her mid-conversation. It is a hash of the citizen and their
 * local day: stable for the day, different per citizen, and identical wherever
 * they are standing. The client still sends its guess; the server answers with
 * the one it used, and the client holds that.
 */
function seedOf(userId: string, tz: string | undefined): number {
  const key = `${userId}:${localDay(tz)}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h) % SEED_MAX;
}

/**
 * A field that came out of a hub is quoted, never conjugated.
 *
 * "Coconut-curry Lentil Stew Served Over Quinoa Thali wants starting by ..." is
 * a database row made to act as the subject of a verb. Every other line she
 * says was written by a person; that one was a join result wearing a sentence.
 */
function asNamed(title: string): string {
  const t = title.trim().replace(/\s+/g, ' ').toLowerCase();
  const words = t.split(' ');
  const kept: string[] = [];
  for (const w of words) {
    if ([...kept, w].join(' ').length > 26) break;
    kept.push(w);
  }
  return (kept.length ? kept : words.slice(0, 3)).join(' ');
}

/**
 * One sample of what is about to be deleted, cut short.
 *
 * The redaction IS the cut: enough for a citizen to recognise the exchange,
 * not enough for the confirmation line to become a transcript read back at
 * somebody who asked for a deletion.
 */
function excerpt(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
}

function list(items: string[]): string {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

export interface MiraTurn {
  text: string;
  lane: Routed['lane'];
  capabilityId?: string;
  confidence: number;
  levity: LevityLevel;
  /** The colour this turn was said in. Sent so the client can show it, and so a
   *  misfire post-mortem can reproduce the exact sentence. */
  mood: Mood;
  /** Set when the answer carries data the citizen can act on. */
  payload?: unknown;
  /**
   * Where she is offering to take them.
   *
   * The honest slice of "Mira controls the app" that phase 1 can actually
   * deliver: navigation changes nothing, so it needs no confirmation and can
   * ship alongside the reads. Ordering and booking are a later phase and she
   * says so rather than implying otherwise.
   */
  goto?: Choice;
  /**
   * The options she just offered, when the turn was a question.
   *
   * Sent out so the next ask can carry them back. This is the whole of her
   * short-term memory and it deliberately lives on the wire rather than on the
   * server — see `choose.ts` for why the alternative is worse.
   */
  choices?: Choice[];
  /** Everything the turn decided, for the inspector and for a misfire post-mortem. */
  trace: string[];
  /**
   * The number her mood was chosen from — HERS, not the browser's. Sent so the
   * client can hold it and stop deriving one of its own per device.
   */
  seed: number;
  /**
   * The conversation meter, on turns that used or hit it. `freeLeft` is null
   * for a subscriber — not zero, which would read as "none left". Optional on
   * the wire, ALWAYS, so an older client never chokes on it.
   *
   * `inr` and `freeTotal` ride with it because the price was typed out at three
   * places in the web app with nothing checking any of them against what the
   * wallet is actually charged, and a price on a button that disagrees with the
   * price on the invoice is not a copy bug. `persona.ts` is the source.
   */
  pass?: { freeLeft: number | null; inr: number; freeTotal: number };
  /** True when this turn is the meter saying so, and the client may offer the subscription. */
  paywall?: boolean;
}

export interface AskContext {
  userId: string;
  /**
   * WHAT THE CLIENT CLAIMS, AND NO LONGER WHAT SHE USES.
   *
   * `weeksKnown` and `distressLocked` are derived from `MiraPass` now, and
   * `hour` from the zone on the profile. All three are still accepted, because
   * a field removed from a DTO is a 400 for every client that has not shipped
   * yet — and all three are ignored where the server has its own answer. See
   * `Governed` above for the whole argument.
   */
  weeksKnown?: number;
  /** Their claimed local hour. Used only when the profile carries no zone. */
  hour?: number;
  /**
   * Their IANA timezone, e.g. 'Asia/Kolkata'. Sent by the client for the same
   * reason `hour` is, and it cannot be derived from `hour`: an offset guessed
   * from the hour rounds to the nearest hour, which is wrong by thirty minutes
   * for every citizen in India. Optional, so an older client still gets answers.
   */
  tz?: string;
  /** Their own setting: 0 less · 1 default · 2 more. The one input here that
   *  is still the client's, because it is a preference and not a safety input. */
  dial?: 0 | 1 | 2;
  distressLocked?: boolean;
  recent?: string[];
  /** The client's guess at the seed. Answered with the server's. */
  seed?: number;
  /** What she offered last turn, handed back so an answer is read as an answer. */
  answering?: Choice[];
  /**
   * The day's transcript, both voices, oldest first — sent by the client
   * because the thread lives on the device and the server keeps no session.
   * This is what makes "just feeling lonely" a continuation instead of a
   * sentence from nowhere; without it the model re-meets the citizen on every
   * turn, which is the deterministic Mira's oldest defect wearing a new coat.
   */
  history?: Array<{ who: 'me' | 'mira'; text: string }>;
  /** The in-app path they were standing on when they opened her. */
  page?: string;
}

/** One branch's output: the fact, and the asides that would be true of it. */
interface Attempt {
  text: string;
  asides?: string[];
  payload?: unknown;
  goto?: Choice;
  choices?: Choice[];
  outcome?: Outcome;
  /** Where the conversation meter stands, on turns that moved or hit it. */
  pass?: { freeLeft: number | null };
  /** True when the words came from the model rather than from this file. */
  fromModel?: boolean;
  /** On a clarify: the two scores that made it one, for the ledger. */
  scores?: { top: number; second: number };
}

/**
 * Mira, phase 1: she reads — now across the whole city.
 *
 * No capability above R0 is reachable from here — not gated by a flag but by
 * construction, because the executor below has no branch that writes. That is
 * deliberate. A voice interface over a wrong action model is worse than no
 * voice interface, and the same is true of a chat one: the cheapest possible
 * proof that the router, the manifest and the governor agree is to let them
 * answer questions for a while before letting them do anything.
 *
 * Degradation is a feature, as everywhere else in this codebase. Every branch
 * below returns a deterministic sentence; nothing here needs a model to work,
 * and the model — when it arrives in a later phase — only rewrites prose that
 * already exists and is already correct.
 */
@Injectable()
export class MiraService {
  private readonly logger = new Logger('MiraService');

  constructor(
    private readonly financial: FinancialService,
    private readonly drive: DriveService,
    private readonly astrology: AstrologyService,
    private readonly tarot: TarotService,
    private readonly prescriptions: PrescriptionsService,
    private readonly nutrition: NutritionService,
    private readonly medical: MedicalService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
    private readonly profile: MasterProfileService,
    private readonly fitness: FitnessService,
    private readonly beauty: BeautyService,
    private readonly entertainment: EntertainmentService,
    private readonly travel: TravelService,
    private readonly thoughts: ThoughtsService,
    private readonly registry: MiraRegistry,
    private readonly ledger: MiraLedger,
    // Appended rather than inserted, so the spec's positional stubs stay true.
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly daybook: DaybookService,
    private readonly pets: PetsService,
  ) {}

  async ask(text: string, ctx: AskContext): Promise<MiraTurn> {
    const began = Date.now();
    // The governor's inputs, from the account rather than from the tab.
    const g = await this.govern(ctx.userId, ctx);
    const seed = g.seed;

    // ── SHE ANSWERS HER OWN QUESTION FIRST ────────────────────────────────
    // Before routing, before scoring, before anything: if she asked "which
    // one?" last turn and this turn is one of the answers, it is an answer.
    // Sending it back through the matcher that produced the question is what
    // made her loop in production.
    //
    // AND A REFUSAL IS ALSO AN ANSWER. "no", "neither", "both" used to fall
    // out of `resolveChoice` as nothing, which sent them back through the
    // matcher as a fresh request — so "none" found nothing and "both" could
    // navigate somewhere nobody asked for. Both are the citizen saying the
    // question was wrong, and the right move is to drop the question.
    const resolved = ctx.answering?.length ? resolveChoice(text, ctx.answering) : undefined;
    const answered = isChoice(resolved) ? resolved : undefined;
    // "yes" to an either/or agreed with the question and answered neither half
    // of it. It is not a pick and it is not a refusal, and it must not be
    // re-routed as a fresh sentence — see `choose.ts`.
    const vague = resolved === 'affirm' ? resolved : undefined;
    const refused = isChoice(resolved) || vague ? undefined : (resolved as Refusal | undefined);

    const routed: Routed = resolved
      ? { lane: 'RETRIEVE', confidence: 1, why: 'answered the question she asked' }
      : route(text, { capabilities: this.registry.upTo('R0') });
    const cap = routed.capabilityId ? this.registry.byId(routed.capabilityId) : undefined;

    const lev: LevityVerdict = levity({
      lane: routed.lane,
      risk: cap?.risk,
      domain: cap?.path.split('/')[0],
      text,
      recent: ctx.recent,
      distressLocked: g.distressLocked,
      weeksKnown: g.weeksKnown,
      hour: g.hour,
      dial: ctx.dial,
    });
    // THE LATCH IS WRITTEN WHERE IT IS TRIPPED, and only where it is tripped:
    // re-stamping it on every turn that merely INHERITS it would make a latch
    // that never decays, which is the thing the tab's boolean already was.
    if (lev.distress && !g.distressLocked) this.latch(ctx.userId);
    // Mood is chosen from the session, not from the turn — and levity is then
    // tilted WITHIN what the governor allowed, never across it. `tilted()`
    // returns 0 whenever the cap is 0, which is where distress, the listen
    // lane, a failed step, medical and R4 all land.
    const mood = moodFor({ seed, hour: g.hour, lastSessionDistressed: g.distressLocked });
    const colour: Colour = { mood, level: tilted(mood, lev.level), seed };

    const trace = [`route: ${routed.why} (${routed.confidence.toFixed(2)})`, `mood: ${mood}`, ...lev.trace];

    /**
     * Every branch says what KIND of turn it was, and the ledger writes it down.
     *
     * The interesting number about Mira is not how often her capabilities work —
     * it is what people ask for that is not one of them. That set is the roadmap,
     * written by citizens rather than guessed at.
     */
    const turn = async (): Promise<Attempt> => {
      /**
       * FORGETTING OUTRANKS EVERYTHING, including the choice she offered
       * last turn — somebody asking her to forget is exercising the promise
       * that makes her memory tolerable, and it must never be misread as an
       * answer to "which one?". forget.ts is strict about what counts as the
       * command, so "I forgot my keys" still flows to the conversation.
       */
      /**
       * AND THE SECOND TURN OF A FORGET OUTRANKS THE FIRST ONE.
       *
       * She asked "shall I?" last turn and a bare "yes" is the answer to that
       * question, not a sentence for the router. Read before `readForget`
       * because "yes" is not a forget command and would otherwise flow to the
       * conversation while a pending deletion sat unperformed.
       */
      if (g.pendingForget) {
        const confirm = readForgetConfirm(text);
        if (confirm === 'yes') return this.forgetTopic(ctx.userId, g.pendingForget);
        if (confirm === 'no') {
          await this.pend(ctx.userId, null);
          return { outcome: 'forget', text: 'Left it where it was.' };
        }
      }
      const forget = readForget(text);
      if (forget) return this.forget(ctx.userId, forget);
      /**
       * SHE ASKS AGAIN, ONCE, AND NEVER PICKS FOR THEM. The options go back
       * out on the reply so the next turn can still resolve — dropping them
       * here would make the second answer as homeless as the first.
       */
      if (vague) {
        const options = ctx.answering ?? [];
        return {
          outcome: 'clarify',
          text: `${list(options.map((o) => o.label))}. Which one?`,
          asides: ['Either is fine, I just cannot do both.'],
          choices: options,
        };
      }
      if (refused) {
        return {
          outcome: 'clarify',
          text: refused === 'both'
            ? 'I can only open one at a time. Say which and I will take you.'
            : 'Dropped. Tell me what you are after and I will find it.',
          choices: [],
        };
      }
      if (answered) {
        return {
          outcome: 'navigate',
          text: `${answered.label}. Come on.`,
          asides: ['You could have led with that.', 'Right where you left it.'],
          goto: answered,
        };
      }
      if (routed.lane === 'LISTEN') {
        // Even here — especially here. If what they described is control,
        // violence or somebody at the edge, "what's going on?" is the wrong
        // next move and the hand-off outranks it — including outranking the
        // model. A crisis is handled by code that cannot have a bad day.
        const beyond = readSituation(text);
        if (beyond?.handOff) return relate(beyond);
        // The model, when configured, is what makes this a conversation
        // rather than one canned question. The governor has already set the
        // register: on a distressed turn the persona is stripped of every
        // joke before the model sees a word.
        const talked = await this.converse(text, ctx, lev.distress, g);
        if (talked) return talked;
        return {
          outcome: 'listen',
          text: lev.distress
            ? 'Okay. Forget everything else for a second. Tell me what happened.'
            : "Yeah. What's going on?",
        };
      }
      if (routed.lane === 'ADVISE') {
        // The hand-off is checked before ANY register: control, violence or
        // somebody at the edge outranks the friend tab and the model alike.
        const situation = readSituation(text);
        if (situation?.handOff) return relate(situation);
        // "When will I find love" was the second question ever asked of her,
        // and a terse deflection was the wrong answer to it. The model answers
        // with the chart and the numbers she actually knows; with the model
        // off she falls through to the deterministic line below, which is what
        // she always said. No register decides which of those happens — the
        // model being configured does.
        {
          const talked = await this.converse(text, ctx, lev.distress, g);
          if (talked) return talked;
        }
        const told = foretold(text);
        if (told) return told;
        if (situation) return relate(situation);
        // The interpretation lane belongs to the astrology engine, which already
        // computes deterministically and already has its own enforced voice.
        // Rather than improvise here, she offers the reading that actually
        // exists — which is now something she can fetch.
        return this.dayBrief(ctx.userId, g.tz);
      }
      /**
       * ── A SENTENCE IN THE FRIEND ROOM IS NOT A QUERY ────────────────────
       *
       * `route()` scores against the manifest in both rooms and hands back a
       * capability at 0.55 with no idea which room asked, so an ordinary
       * sentence in the companion tab that shared two words with a decorator
       * came back as a data readout. Here she has to be nearly certain before
       * a capability may speak; below that the turn is a conversation.
       *
       * The crisis check comes first, as it does on every other path into the
       * model — a tab changes her register, never her safety.
       *
       * With the model off she falls through to the capability she matched,
       * which is exactly the phase-1 assistant: degradation, not an error.
       */
      if (cap && !isUncertain(routed) && routed.confidence < FRIEND_CAPABILITY) {
        const situation = readSituation(text);
        if (situation?.handOff) return relate(situation);
        const talked = await this.converse(text, ctx, lev.distress, g);
        if (talked) return talked;
      }
      // Before giving up: is this a place rather than a task? "Where do I set my
      // allergies", "take me to my budgets" — the question the hub wall cannot
      // answer, and the one that made ⌘K necessary in the first place.
      if (isUncertain(routed) || !cap) {
        const why = whyWeAsk(text) ?? undefined;
        if (why) {
          return {
            outcome: 'navigate',
            text: `${why.changes.join(' ')} You set it at ${why.toldAt}.`,
            goto: { label: why.fact, path: why.toldAt },
          };
        }

        // ── DECISIVE, AND ONLY ASKING ON A REAL CONTEST ────────────────────
        // The old code asked whenever there were two hits. "Astrology" at 1.0
        // beside "Astrology Log" at 0.5 is not a tie, and treating it as one is
        // half of the loop the owner found. A runner-up has to be genuinely
        // close before a question is worth a turn.
        // A PERSON IS NOT A PLACE. "I don't know how to tell my dad" must not
        // become "Dad. Want me to take you?" — so this is asked before the
        // place-finder, and it returns nothing at all unless there is genuinely
        // a situation to read.
        const situation = readSituation(text);
        if (situation?.handOff) return relate(situation);
        // In the friend tab the one-liner oracle steps aside: "when will I
        // find love" deserves the model, with the chart and the numbers she
        // actually knows, not a stock sentence. The city tab keeps
        // foretold() — terse and honest is the assistant's register — and
        // navigation below gets its chance in both tabs.
        /**
         * THE ORACLE IS NOW A FALLBACK RATHER THAN A FIRST MOVE.
         *
         * In the city tab `foretold()` answered "when will I find love" with a
         * stock line; in the friend tab it was skipped so the model could
         * answer with the chart. With one room, skipping it outright meant
         * that with the model OFF nobody answered at all — the sentence fell
         * through to "that's not something I can do yet", which is worse than
         * the stock line it replaced. So it is computed here and SPENT below,
         * after the model has had its turn and declined.
         */
        const told = foretold(text);
        /**
         * ── AND A RELATIONSHIP READ HAS TO NAME A RELATIONSHIP ──────────────
         *
         * `SHAPES` in `relate.ts` contains bare `too much`, `every day` and
         * `fix (this|things|it)`, and this check ran before `findInCity` on
         * every result it produced. So "can you fix this" was answered *"So it
         * went badly with them and now it is stuck."* and "where do i see how
         * much i spend every day" got a boundary script — two ordinary
         * requests intercepted by a reader for a lane they were never in.
         *
         * THE HAND-OFF STAYS ABOVE THIS AND ABOVE EVERYTHING. That ordering is
         * load-bearing: it is what makes the crisis lane work from this branch,
         * and nothing about a place-finder outranks somebody at the edge.
         *
         * What is gated is only the ordinary read, and the gate is whether a
         * PERSON was named. That is the whole difference between the two
         * failures available here — "i had a fight with my sister" must not
         * become "Flights. Want me to take you?" (0.6, and the place-finder
         * offers it), and "can you fix this" must not become a script about
         * somebody who was never mentioned. A read with nobody in it waits: the
         * city gets its turn, then the conversation does, and the fallback at
         * the bottom of this branch still catches it if neither answers.
         */
        /**
         * ── AND SOMEBODY NAMED IS NEVER A DESTINATION ─────────────────────
         *
         * "i had a fight with my sister" scores 0.6 against Flights, and the
         * place-finder offered it. The city register never saw that because
         * `relate()` returns above; the listening register does, because there
         * the model is meant to answer first — so the place-finder has to be
         * told to stand down as well, or the merge reintroduces the exact
         * failure the two-room code had already fixed on one side.
         */
        const found = situation && (situation.who || situation.kind) ? [] : findInCity(text, 3);
        const [top, second] = found;
        if (top && (!second || top.score - second.score >= CONTEST)) {
          return {
            outcome: 'navigate',
            text: `${top.label}. Want me to take you?`,
            asides: ['It has been there the whole time.'],
            goto: { label: top.label, path: top.path },
          };
        }
        if (top && second) {
          const options = found.slice(0, 3).map(({ label, path }) => ({ label, path }));
          return {
            outcome: 'clarify',
            text: `${list(options.map((o) => o.label))}. Which one?`,
            choices: options,
            scores: { top: top.score, second: second.score },
          };
        }
        // Nothing matched: the lane the whole framework was written for. This
        // used to be "That's not something I can do yet" — the sentence the
        // owner screenshotted twice. Now it is a conversation, when the model
        // is configured; the old sentence stays as the honest fallback when
        // it is not, so a missing key degrades rather than breaks.
        {
          const talked = await this.converse(text, ctx, lev.distress, g);
          if (talked) return talked;
        }
        // The last resort, and the same gate as above: with the model off the
        // relationship lane keeps its own script rather than losing it to a
        // clarify — as long as there is a relationship in the sentence. One
        // rule, applied in both places, because a script about "them" said to
        // somebody who mentioned nobody is the fault this whole check has.
        if (situation && (situation.who || situation.kind)) return relate(situation);
        // The oracle, held back above so the model could go first.
        if (told) return told;
        return { outcome: 'clarify', text: this.clarify(routed), choices: [] };
      }
      return { outcome: 'capability', ...(await this.read(cap.id, ctx.userId, colour, g.tz, g.hour, text)) };
    };

    const attempt = await turn();
    const outcome: Outcome = attempt.outcome ?? 'capability';
    // Model prose and the meter's own line are complete sentences said in her
    // register already; running them through say() would staple an aside onto
    // a paragraph. Everything deterministic keeps the full treatment.
    const composed = outcome === 'chat' || outcome === 'paywall'
      ? { text: attempt.text, asideDropped: false }
      : sayWithTrace(attempt.text, colour, attempt.asides ?? []);
    const draft = composed.text;

    // Fire and forget, by construction — recording a question must never slow
    // an answer down and must never be the reason one fails.
    this.ledger.record({
      userId: ctx.userId,
      text,
      lane: routed.lane,
      confidence: routed.confidence,
      capability: cap?.id,
      outcome,
      levity: lev.level,
      ms: Date.now() - began,
      source: attempt.fromModel ? 'model' : 'deterministic',
      asideDropped: composed.asideDropped,
      distress: lev.distress,
      mood,
      top: attempt.scores?.top,
      second: attempt.scores?.second,
      session: String(seed),
    });

    // Deterministic text, checked against her own voice rules anyway. It should
    // never fail — and if a future edit makes it fail, this is where we find
    // out, rather than a citizen.
    const bad = violations(draft);
    if (bad.length) this.logger.warn(`Mira's own line broke voice: ${bad.map((v) => v.why).join(', ')}`);
    const said = this.notAgain(acceptOrFallback(draft, "I can't do that from here."), ctx.history, attempt.goto);

    /**
     * THE RECORD IS HER MEMORY. Both sides of every exchange, kept per
     * citizen on the server, which is what lets tomorrow's Mira remember
     * today — across devices, unlike the browser's day store, which remains
     * the display. Fire-and-forget like the ledger: remembering must never
     * slow an answer and must never be the reason one fails. The two turns
     * a forget produces are NOT recorded — a wipe that immediately writes
     * "forget everything" back into the memory it wiped is a wipe that
     * keeps a receipt, and the receipt is the thing they asked to lose.
     */
    if (outcome !== 'forget') this.remember(ctx.userId, text, said);

    /**
     * ── AND WHAT SHE LEARNED FROM IT ──────────────────────────────────────
     *
     * Only on a turn the model already answered: the meter has been spent, the
     * citizen was talking rather than running an errand, and a second call on
     * a capability lookup would be paying to extract facts from "what's my
     * balance". Never on a distressed turn — somebody at their lowest is not
     * material — and never from the confidant, which does not come through
     * here at all.
     */
    if (outcome === 'chat' && !lev.distress) this.learn(ctx.userId, text, said);

    return {
      text: said,
      lane: routed.lane,
      capabilityId: routed.capabilityId,
      confidence: routed.confidence,
      levity: lev.level,
      mood,
      seed,
      payload: attempt.payload,
      goto: attempt.goto,
      choices: attempt.choices?.length ? attempt.choices : undefined,
      trace,
      pass: priced(attempt.pass),
      ...(outcome === 'paywall' ? { paywall: true } : {}),
    };
  }

  /**
   * ── SHE DOES NOT SAY THE SAME SENTENCE TWICE ──────────────────────────────
   *
   * From the screenshot this whole change exists for:
   *
   *     — what am i eating today
   *     — Nothing needs starting yet. Kitchen is quiet.
   *     — tell me a meal i can eat today
   *     — Nothing needs starting yet. Kitchen is quiet.
   *
   * A citizen who rephrases is telling her the last answer missed. Handing
   * back the identical bytes is the strongest signal a chat interface can send
   * that nobody is home — and it is invisible to every test that checks one
   * turn at a time, which is every test she had.
   *
   * The fact is not thrown away: she says it, and then says something she has
   * not said, which is the only part that carries information the second time.
   * `history` already rides in on the request for the model's sake; this is
   * the deterministic half of the same idea.
   */
  private notAgain(said: string, history: AskContext['history'], goto?: Choice): string {
    const hers = (history ?? []).filter((h) => h.who === 'mira');
    const last = hers.length ? hers[hers.length - 1].text.trim() : '';
    if (!last || last !== said.trim()) return said;
    return goto
      ? `${said} Same as a moment ago — if that is not what you meant, ${goto.label} has the rest of it.`
      : `${said} Same as a moment ago. Say it a different way and I will look again.`;
  }

  /**
   * ── WHAT THE SERVER KNOWS, RATHER THAN WHAT THE TAB CLAIMS ────────────────
   *
   * Two reads, both best-effort and both individually guarded: a citizen with
   * no profile row and no pass row is a citizen on their first turn, and she
   * answers them exactly as well as anybody else. Nothing here may throw — the
   * governor deciding a question is a governor that can refuse to answer one.
   *
   * The pass row is not created here. Creating one per turn would put a write
   * on every deterministic answer, and the row already appears the first time
   * she says hello (which is genuinely their first turn with her) and the first
   * time the meter moves. Until it exists, `firstSeenAt` is today, which is the
   * true answer for somebody who has never spoken to her.
   */
  private async govern(userId: string, client: { hour?: number; tz?: string }): Promise<Governed> {
    const [profile, pass] = await Promise.all([
      this.safely(() => this.prisma.masterProfile.findUnique({ where: { userId }, select: { timeZone: true } })),
      this.safely(() => this.prisma.miraPass.findUnique({ where: { userId } })),
    ]);
    const tz = (profile?.timeZone ?? '').trim() || client.tz;
    const now = Date.now();
    const asked = pass?.forgetAskedAt?.getTime();
    return {
      tz,
      hour: hourIn(tz) ?? client.hour ?? 12,
      weeksKnown: pass?.firstSeenAt
        ? Math.max(0, Math.floor((now - pass.firstSeenAt.getTime()) / (7 * 86_400_000)))
        : 0,
      distressLocked: Boolean(pass?.distressUntil && pass.distressUntil.getTime() > now),
      seed: seedOf(userId, tz),
      pendingForget: pass?.forgetTopic && asked && now - asked < FORGET_WINDOW_MS ? pass.forgetTopic : undefined,
      greetings: pass?.greetings ?? [],
    };
  }

  /** One read, and a failure is an absence. Wrapped rather than `.catch()`d
   *  because a model this deployment has never generated throws synchronously
   *  rather than rejecting, and an absence is the honest reading of both. */
  private async safely<T>(read: () => Promise<T>): Promise<T | null> {
    try {
      return await read();
    } catch {
      return null;
    }
  }

  /** Hold the distress latch on the ACCOUNT for a few hours. Fire and forget:
   *  a latch that cannot be written must never cost somebody an answer on the
   *  turn where they said something heavy. */
  private latch(userId: string): void {
    const until = new Date(Date.now() + DISTRESS_HOLD_MS);
    void this.safely(() => this.prisma.miraPass.upsert({
      where: { userId },
      update: { distressUntil: until },
      create: { userId, distressUntil: until },
    }));
  }

  /** Remember, or drop, the topic forget she has offered but not performed. */
  private async pend(userId: string, topic: string | null): Promise<void> {
    await this.safely(() => this.prisma.miraPass.upsert({
      where: { userId },
      update: { forgetTopic: topic, forgetAskedAt: topic ? new Date() : null },
      create: { userId, forgetTopic: topic, forgetAskedAt: topic ? new Date() : null },
    }));
  }

  // ── THE CONVERSATION LANE ─────────────────────────────────────────────
  //
  // Everything the deterministic Mira cannot say — comfort, curiosity, a real
  // exchange — comes from here. Three rules, all enforced in code rather than
  // hoped for in the prompt:
  //
  //  1. THE METER IS CHECKED FIRST. Two hundred model conversations are free;
  //     after that the subscription carries them. Capabilities, navigation
  //     and the greeting never touch the meter — the working city stays free.
  //  2. THE PERSONA IS BUILT FROM WHAT IS TRUE: their name, their clock,
  //     their Vedic chart when they have given birth details, and the honest
  //     list of what she can actually do — so the model cannot promise an
  //     order button that does not exist.
  //  3. HER VOICE RULES OUTRANK THE MODEL. A reply that breaks them is
  //     dropped and the deterministic sentence stands. Warmth is never worth
  //     sounding like a call centre.

  private async converse(text: string, ctx: AskContext, distress: boolean, g: Governed): Promise<Attempt | undefined> {
    if (!this.ai.enabled) return undefined;
    const pass = await this.passOf(ctx.userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      return { outcome: 'paywall', text: PAYWALL_LINE, pass: { freeLeft: 0 } };
    }
    const [name, chart, knows] = await Promise.all([
      this.nameOf(ctx.userId), this.chartOf(ctx.userId), this.factsOf(ctx.userId),
    ]);
    const system = persona({
      name,
      signs: chart?.signs ?? null,
      lifePath: lifePathOf(chart?.birthDate),
      page: ctx.page ?? null,
      clock: clockLine(g.tz),
      daypart: daypartOf(g.hour),
      weeksKnown: g.weeksKnown,
      distress,
      canDo: this.registry.all().map((c) => c.intent.toLowerCase()),
      knows: knownBlock(knows),
    });
    // HER MEMORY FIRST, THE DEVICE SECOND. The server record spans days and
    // devices; the client's day store is one browser and clears at midnight.
    // When the record answers, it IS the context — including today, because
    // every exchange lands in it as it happens. The client trail remains the
    // fallback for the first conversation and for a read that fails, so a
    // slow table costs continuity, never an answer.
    const remembered = await this.recall(ctx.userId);
    const trail = remembered.length
      ? remembered
      : (ctx.history ?? []).slice(-12)
          .map((h) => ({ role: h.who === 'me' ? ('user' as const) : ('assistant' as const), content: h.text.slice(0, 2000) }));
    if (trail.length && trail[trail.length - 1].role === 'user' && trail[trail.length - 1].content === text) trail.pop();
    /**
     * The wire wants strict alternation starting with a user turn. The
     * record is written in pairs so it usually is — but a half-failed write
     * or a capability answer squeezed between chats can double a role, and
     * one malformed transcript must not cost the conversation. Same-role
     * neighbours are joined; a leading assistant turn is dropped.
     */
    const squashed: Array<{ role: 'user' | 'assistant'; content: string }> = [];
    for (const turn of [...trail, { role: 'user' as const, content: text }]) {
      const last = squashed[squashed.length - 1];
      if (last && last.role === turn.role) last.content += `\n${turn.content}`;
      else squashed.push({ ...turn });
    }
    while (squashed.length && squashed[0].role !== 'user') squashed.shift();
    const said = await this.ai.converse(system, squashed);
    if (!said) return undefined;
    const accepted = await this.inVoiceOrOnceMore(said, system, squashed);
    if (!accepted) return undefined;
    const left = await this.spendChat(ctx.userId, pass);
    return { outcome: 'chat', text: accepted, pass: { freeLeft: left }, fromModel: true };
  }

  /**
   * ── ONE BANNED PHRASE USED TO COST THE WHOLE REPLY ────────────────────────
   *
   * A violation returned undefined and the deterministic sentence stood — so a
   * good four-sentence answer that happened to contain "of course!" was thrown
   * away and replaced with "Yeah. What's going on?". The rule is right (her
   * voice outranks the model) and the remedy was too blunt: the model was
   * never told what it did, and could not have fixed it if it had wanted to.
   *
   * So she asks once more, naming the exact phrase back. ONCE, and the bound
   * is not a style preference: this is a paid call and the meter is real, so a
   * loop here is a loop that spends somebody's money. If the second attempt
   * breaks the rules too, the deterministic line stands exactly as before.
   *
   * The families are logged either way, because the top offenders belong in
   * the persona's own ban list — a phrase the prompt forbids costs nothing,
   * and a phrase only the gate catches costs a model call every time.
   */
  private async inVoiceOrOnceMore(
    said: string,
    system: string,
    turns: Array<{ role: 'user' | 'assistant'; content: string }>,
  ): Promise<string | undefined> {
    const bad = violations(said);
    if (!bad.length) return said;
    this.logger.warn(`Mira's model reply broke voice (${bad.map((v) => v.why).join(', ')}) — asking once more`);
    const named = bad.map((v) => `"${v.phrase}"`).join(', ');
    const again = await this.ai.converse(
      `${system}\n\nYOUR LAST ATTEMPT USED ${named}, which you are not allowed to say. Write the same answer again without it — same warmth, same length, no apology for the rewrite and no reference to it.`,
      turns,
    );
    if (!again) return undefined;
    const still = violations(again);
    if (!still.length) return again;
    this.logger.warn(`Mira's model reply broke voice twice (${still.map((v) => v.why).join(', ')}) — deterministic line stands`);
    return undefined;
  }

  /** Where the meter stands. A missing row is a citizen who has never chatted. */
  private async passOf(userId: string): Promise<{ paid: boolean; used: number; freeLeft: number }> {
    // A read that fails reads as "never chatted", which hands out free chats
    // that were already spent — worth a line in the log.
    const row = await this.prisma.miraPass.findUnique({ where: { userId } })
      .catch(swallowed('mira.pass: read the meter', null, { userId }));
    const used = row?.chatUsed ?? 0;
    const paid = Boolean(row?.paidUntil && row.paidUntil.getTime() > Date.now());
    return { paid, used, freeLeft: Math.max(0, FREE_CHATS - used) };
  }

  /**
   * One conversation, spent. Subscribers are not counted — null says "not
   * metered", which the client must not render as "0 left". Fire-and-forget
   * on failure: a meter that cannot be written must never cost an answer.
   */
  private async spendChat(userId: string, pass: { paid: boolean; used: number }): Promise<number | null> {
    if (pass.paid) return null;
    await swallow(this.prisma.miraPass.upsert({
      where: { userId },
      update: { chatUsed: { increment: 1 } },
      create: { userId, chatUsed: 1 },
    }), 'mira.pass: spend a free chat', { userId });
    return Math.max(0, FREE_CHATS - pass.used - 1);
  }

  /**
   * ₹999 from the city wallet, thirty days on the pass, one transaction.
   *
   * NOT a @Mira() capability, on purpose: she still cannot spend money. This
   * is behind an explicit button the citizen presses, priced on its face, and
   * it goes through the same unified rail as every checkout in the city — so
   * an insufficient wallet answers with the same sentence everywhere.
   * Extending an active pass stacks from its end, never from today: paying
   * early must never eat the days already bought.
   */
  async subscribe(userId: string): Promise<{ paidUntil: string; freeLeft: null }> {
    // If this read fails the stacking below starts from today, which is the one
    // thing the docblock above says must never happen — so it says so out loud.
    const row = await this.prisma.miraPass.findUnique({ where: { userId } })
      .catch(swallowed('mira.pass: read the pass before extending it', null, { userId }));
    const now = Date.now();
    const from = row?.paidUntil && row.paidUntil.getTime() > now ? row.paidUntil.getTime() : now;
    const until = new Date(from + 30 * 24 * 60 * 60 * 1000);
    await this.financial.paid(
      userId,
      { hub: 'Mira', category: 'subscription', label: 'Mira · 30 days of conversation', amountInr: SUB_INR },
      (tx) => tx.miraPass.upsert({
        where: { userId },
        update: { paidUntil: until },
        create: { userId, paidUntil: until },
      }),
    );
    return { paidUntil: until.toISOString(), freeLeft: null };
  }

  /**
   * THE CONFIDANT — she reads ONE conversation, and only that one.
   *
   * The citizen pressed her mark inside a person-to-person chat. The client
   * sends that thread's transcript with the ask, and the reply is built from
   * that window of text and NOTHING else. The scope is the promise, and it is
   * enforced by absence rather than by prompt: this method never touches
   * MiraTurn (no recall, no remember — what two people said to each other is
   * not hers to keep), never loads the chart or the name, and never reaches
   * the router or the executor. One model call in, one paragraph out.
   *
   * The crisis hand-off still outranks the model — a thread can hold the same
   * darkness a friend-tab turn can, and it is handled by code that cannot
   * have a bad day. The meter is the same one conversation spends: this IS a
   * model conversation, wherever she was standing when it happened.
   */
  async confide(
    userId: string,
    input: {
      otherName?: string; ask: string;
      transcript: Array<{ who: 'me' | 'them'; text: string }>;
      /** 'draft' is the Help-me-reply button: a message to paste, not a
       *  reading of the thread. See `confidant` in persona.ts. */
      mode?: 'read' | 'draft';
    },
  ): Promise<{ text: string; pass?: { freeLeft: number | null; inr: number; freeTotal: number }; paywall?: boolean }> {
    const began = Date.now();
    /**
     * ── THE LEAST GOVERNED SURFACE IN THE MODULE, UNTIL NOW ─────────────────
     *
     * This lane reads a THIRD PARTY's messages at the citizen's request, and it
     * was the one route that received none of the context `ask()` receives: no
     * clock, no weeks, and — the one that matters — no distress latch. So a
     * citizen who had said something frightening in her room five minutes
     * earlier could open a chat panel and be met by a Mira who had never heard
     * it. The latch is on the account precisely so it reaches here.
     */
    const g = await this.govern(userId, {});
    const record = (outcome: Outcome, distress = false) =>
      this.ledger.record({
        userId, text: input.ask, lane: 'LISTEN', confidence: 1, outcome, levity: 0,
        ms: Date.now() - began, source: outcome === 'confide' ? 'model' : 'deterministic',
        distress, session: String(g.seed),
      });

    // The hand-off first, deterministically, before any model sees a word.
    const situation = readSituation(input.ask);
    if (situation?.handOff) {
      this.latch(userId);
      record('relate', true);
      return { text: `${situation.reflection} ${situation.handOff}` };
    }

    // The same reading the ask lane takes, over the same lexicons: this turn's
    // words, plus the latch the account is already holding.
    const lev = levity({
      lane: 'LISTEN', text: input.ask,
      distressLocked: g.distressLocked, weeksKnown: g.weeksKnown, hour: g.hour,
    });
    if (lev.distress && !g.distressLocked) this.latch(userId);

    if (!this.ai.enabled) {
      record('confide');
      return { text: 'I can see this conversation, but my reading half isn’t switched on right now. Try me again in a while.' };
    }

    const pass = await this.passOf(userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      record('paywall');
      return { text: PAYWALL_LINE, pass: priced({ freeLeft: 0 }), paywall: true };
    }

    const them = (input.otherName ?? '').trim() || 'Them';
    /* A DRAFT IS NOT A READING, and distress outranks the draft. If the thread
       is heavy she goes back to being present rather than handing over a
       polished sentence — the one turn where "here are the words" is the wrong
       help is the turn where somebody is hurting. */
    const heavy = lev.distress || Boolean(situation);
    const draftOnly = input.mode === 'draft' && !heavy;
    const system = confidant({ otherName: input.otherName, distress: heavy, draftOnly });
    // One user turn: the window of text, then the question. A single message
    // is trivially a legal transcript, and it keeps the model from mistaking
    // the OTHER person's words for its interlocutor's.
    // One line per message, ALWAYS. The speaker label is the start of a line,
    // so a message from the other person that contained "\nMe: ..." used to
    // put words in this citizen's mouth inside her context. Line breaks in
    // the text collapse to spaces; a label can now only be written by us.
    const window = input.transcript.slice(-40)
      .map((t) => `${t.who === 'me' ? 'Me' : them}: ${t.text.slice(0, 1000).replace(/[\r\n]+/g, ' ')}`)
      .join('\n');
    const content = window
      ? `THE CONVERSATION SO FAR:\n${window}\n\nMY QUESTION: ${input.ask}`
      : `The conversation is empty so far.\n\nMY QUESTION: ${input.ask}`;

    const said = await this.ai.converse(system, [{ role: 'user', content }]);
    const accepted = said ? await this.inVoiceOrOnceMore(said, system, [{ role: 'user', content }]) : undefined;
    if (!accepted) {
      if (said) this.logger.warn('Mira’s confidant reply broke voice — the plain line stands');
      record('confide', heavy);
      // Not billed — a reply she was not allowed to say costs nobody anything.
      return { text: 'I’ve read it. Ask me plainly what you want to know about it — where they’re coming from, or how to answer.' };
    }

    record('confide', heavy);
    const left = await this.spendChat(userId, pass);
    return { text: accepted, pass: priced({ freeLeft: left }) };
  }

  /**
   * SHE READS ONE DAY — the citizen's own.
   *
   * "Ask Mira about this day", from the daybook. Unlike the chat confidant,
   * this is not somebody else's words: it is the citizen's own page, so she
   * reads it FROM THE SERVER rather than from what a screen happened to be
   * showing. That is the honest source for "what did I say I wanted?" — a
   * question about a day they may not be looking at.
   *
   * The scope is still one day. She is handed that date's page and its lines
   * and nothing else — not the month, not the neighbouring days, not her own
   * memory of them — because "what happened on the 15th" is a question about
   * the 15th, and a friend who answers it by reviewing your year is not
   * answering it.
   *
   * SHE MAY NOT INVENT A DAY. An empty page comes back as an empty page: the
   * prompt says so and the deterministic line below says so, because the one
   * unforgivable failure for a diary's reader is confident fiction about a
   * day somebody actually lived.
   */
  async readDay(userId: string, date: string, ask: string, tz?: string): Promise<{
    text: string; pass?: { freeLeft: number | null; inr: number; freeTotal: number }; paywall?: boolean;
  }> {
    const record = () => this.ledger.record({ userId, text: ask, lane: 'RETRIEVE', confidence: 1, outcome: 'confide', levity: 0 });
    // A failed read is indistinguishable from an empty page below, and telling
    // somebody their day was blank when it was not is this method's worst bug.
    const day = await this.daybook.day(userId, date)
      .catch(swallowed('mira.readDay: read the daybook page', null, { userId, date }));
    // A day holding nothing but a photograph is NOT an empty day. It was, for
    // one commit: the check listed the fields that existed when it was written,
    // so somebody who kept a picture and no words would have been told there
    // was nothing there — by the one part of the city that had just been handed
    // their memory.
    const answered = Object.values(day?.reflection ?? {}).filter((v) => v !== null && v !== '').length;
    const bare = !day || (!day.mood && !day.feelNote && !day.journal
      && day.items.length === 0 && day.photos.length === 0 && answered === 0);

    if (bare) {
      record();
      return { text: `Nothing on ${date} yet — no mood, nothing planned, nothing written. Put something down and I'll have something to read.` };
    }
    if (!this.ai.enabled) {
      record();
      const done = day.items.filter((i) => i.done).length;
      const pics = day.photos.length ? `, ${day.photos.length} picture${day.photos.length === 1 ? '' : 's'} kept` : '';
      return { text: `${date}: ${day.mood ? `${day.mood}, ` : ''}${day.items.length} thing${day.items.length === 1 ? '' : 's'} down${day.items.length ? `, ${done} done` : ''}${day.journal ? ', and a page written' : ''}${pics}.` };
    }

    const pass = await this.passOf(userId);
    if (!pass.paid && pass.freeLeft <= 0) {
      record();
      return { text: PAYWALL_LINE, pass: priced({ freeLeft: 0 }), paywall: true };
    }

    const lines = [
      `THE DAY: ${date}${tz ? ` (their clock: ${tz})` : ''}`,
      day.mood ? `HOW IT FELT: ${day.mood}${day.feelNote ? ` — ${day.feelNote}` : ''}` : null,
      day.items.length
        ? `ON THE PAGE:\n${day.items.map((i) => `- [${i.done ? 'done' : 'not done'}] ${i.kind}${i.at ? ` at ${i.at}` : ''}: ${i.title}`).join('\n')}`
        : null,
      day.journal ? `WHAT THEY WROTE:\n${day.journal.slice(0, 6000)}` : null,
      // A COUNT, AND NOTHING ELSE, BECAUSE SHE CANNOT SEE THEM. Telling her a
      // picture exists lets her say "you kept a photo of it" rather than
      // pretending the day held nothing; telling her any more than that would
      // be inviting her to describe an image nobody showed her.
      day.photos.length ? `PICTURES THEY KEPT ON THIS DAY: ${day.photos.length}` : null,
      /* THE LOOKING-BACK SHEET, in the citizen's own words and labelled with
         the question each answer was given to — an answer read back without
         its prompt is a sentence with the subject removed. `feeling` is a
         1–10 reading of the day, and she is told below what it is not. */
      answered ? `WHAT THEY WROTE LOOKING BACK:\n${REFLECTION_PROMPTS
        .filter(([k]) => {
          const v = (day.reflection as Record<string, unknown>)[k];
          return v !== null && v !== undefined && v !== '';
        })
        .map(([k, q]) => `- ${q}: ${String((day.reflection as Record<string, unknown>)[k]).slice(0, 1200)}`)
        .join('\n')}` : null,
    ].filter(Boolean).join('\n\n');

    const system = [
      'You are Mira, reading one day of a citizen\'s own daybook with them — their moods, their plans, their writing. You are their friend, not a reporting tool.',
      'THIS IS THE WHOLE OF WHAT YOU CAN SEE: one day. Not the month, not yesterday, not anything you remember from elsewhere. If they ask about another day or a pattern over time, say plainly that you are only looking at this one.',
      'NEVER INVENT A DAY. Everything you say has to be traceable to what is below. If it is not there, it did not happen as far as you know, and you say so rather than filling the gap — a diary read back wrong is worse than a diary unread.',
      'YOU CANNOT SEE THEIR PICTURES. If the day says pictures were kept, you know only how many. Never describe one, never guess what is in it, never say it looks like anything — you have not been shown it, and you say so if asked.',
      'THE 1-10 IS HOW THE DAY FELT TO THEM, NOT A MARK. Never call it a score, never compare it to another day, never congratulate or commiserate about the number. If they wrote 4, the useful thing is what they said around it.',
      'You are reading, not grading. No productivity scoring, no "you only completed 2 of 5", no advice they did not ask for. If they ask what it looked like, tell them warmly and briefly, in their own terms.',
      'Two to four sentences, almost always. A chat bubble, not a report. Contractions. No headers, no bullet lists unless they ask for a list.',
      BANNED_FROM_HER_MOUTH,
      'Reply with the message only — no preamble, no signature, no quotation marks around it.',
    ].join('\n\n');

    const said = await this.ai.converse(system, [{ role: 'user', content: `${lines}\n\nMY QUESTION: ${ask}` }]);
    if (!said || violations(said).length) {
      if (said) this.logger.warn('Mira\'s daybook reply broke voice - the plain line stands');
      record();
      return { text: 'I\u2019ve read it. Ask me plainly what you want to know about this day.' };
    }
    record();
    const left = await this.spendChat(userId, pass);
    return { text: said, pass: priced({ freeLeft: left }) };
  }

  /**
   * THE VISIBLE THREAD, SERVED FROM HER RECORD.
   *
   * "user data on mobile and site should be same" — the owner, holding a
   * phone showing one conversation beside a laptop showing another. The
   * record already spans devices (it is what her memory reads); this serves
   * the same rows to the SCREEN, so the thread a citizen sees follows their
   * account instead of their browser. The device day-store remains the
   * offline fallback, never the truth. Bounded, try/caught whole: a failed
   * read is an empty thread the client ignores, never an error.
   */
  async thread(userId: string): Promise<{
    turns: Array<{ who: 'you' | 'mira'; text: string; at: string }>;
  }> {
    try {
      const rows = await this.prisma.miraTurn.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 60,
      });
      return {
        turns: rows.reverse().map((t: { who: string; text: string; createdAt: Date }) => ({
          who: t.who === 'you' ? ('you' as const) : ('mira' as const),
          text: t.text,
          at: t.createdAt.toISOString(),
        })),
      };
    } catch {
      return { turns: [] };
    }
  }

  /**
   * ── HELLO, AND SHE REMEMBERS WHAT SHE SAID LAST TIME ──────────────────────
   *
   * `greet()` is pure and stays pure; what it needs is a memory, and the
   * memory belongs to whoever calls it. Without one the mood cycled on a
   * period of 7 and the line on a period of 3 — so every citizen got the same
   * twenty-four openings and then heard them again, in order, from session
   * forty-three onwards. Only somebody who likes her ever reaches that.
   *
   * It moved out of the controller because it now needs the account: the ids
   * she has already used, the zone, the latch and the seed. That costs the
   * greeting the "touches no database" property it was written with, and buys
   * a Mira who is the same person on both devices and does not repeat herself.
   * Both reads and the write are best-effort — a greeting that fails is a
   * quieter opening, never an error in front of somebody.
   *
   * THIS IS ALSO WHERE A CITIZEN'S PASS ROW BEGINS, and that is the honest
   * place for `firstSeenAt` to start: the first time she says hello to them.
   */
  async greeting(userId: string, q: {
    hour?: number; weeksKnown?: number; firstOfDay?: boolean;
    dial?: 0 | 1 | 2; sessionsSinceFourthWall?: number;
  }): Promise<Greeting & { seed: number }> {
    const g = await this.govern(userId, q);
    const said = greet({
      hour: g.hour,
      seed: g.seed,
      weeksKnown: g.weeksKnown,
      firstOfDay: q.firstOfDay,
      dial: q.dial,
      lastSessionDistressed: g.distressLocked,
      sessionsSinceFourthWall: q.sessionsSinceFourthWall,
      exclude: g.greetings,
    });
    await this.safely(() => this.prisma.miraPass.upsert({
      where: { userId },
      update: { greetings: [said.id, ...g.greetings.filter((id) => id !== said.id)].slice(0, GREETINGS_KEPT) },
      create: { userId, greetings: [said.id] },
    }));
    return { ...said, seed: g.seed };
  }

  /**
   * ── WHAT SHE HAS KEPT, SHOWN TO THE PERSON IT IS ABOUT ────────────────────
   *
   * "Truly gone" is only checkable if what is there can be seen. Her memory
   * was inspectable in exactly one way — asking her — and a memory you can
   * only interrogate conversationally is one nobody can audit, including the
   * citizen whose sentences are in it.
   *
   * This is the read, and only the read. The "what Mira knows about me" screen
   * and the fact layer behind it are a build and are deliberately not here;
   * the endpoint is what makes the build possible and what makes the promise
   * checkable today, with curl if nothing else. Paginated because a record
   * with a two-thousand-turn ceiling is not a thing to serve in one response.
   */
  /**
   * The whole record, in the order it was said. `room` is kept on the response
   * so an older client that asked for one still gets a shape it understands —
   * but the rows are no longer filtered by it. See `recall()`.
   */
  async memory(userId: string, page: { limit: number; offset: number }): Promise<{
    total: number;
    limit: number;
    offset: number;
    turns: Array<{ who: 'you' | 'mira'; text: string; at: string }>;
  }> {
    const empty = { total: 0, limit: page.limit, offset: page.offset, turns: [] };
    try {
      const [total, rows] = await Promise.all([
        this.prisma.miraTurn.count({ where: { userId } }),
        this.prisma.miraTurn.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip: page.offset,
          take: page.limit,
        }),
      ]);
      return {
        total,
        limit: page.limit,
        offset: page.offset,
        turns: rows.map((t: { who: string; text: string; createdAt: Date }) => ({
          who: t.who === 'you' ? ('you' as const) : ('mira' as const),
          text: t.text,
          at: t.createdAt.toISOString(),
        })),
      };
    } catch {
      return empty;
    }
  }

  /**
   * The last stretch of the record, oldest first, shaped for the wire.
   * Bounded (unbounded-reads rule) and try/caught whole: a missing table, a
   * stale client or a slow read returns [] and the caller falls back to the
   * device's own transcript.
   */
  /**
   * ── ONE TRANSCRIPT ────────────────────────────────────────────────────────
   *
   * `room` is still written on every turn — the ledger and the inspector both
   * want to know which register she was in — but it no longer PARTITIONS what
   * she remembers. Two rooms meant two Miras with two memories of the same
   * citizen, and the merge is worth nothing if she still forgets half of it.
   */
  private async recall(userId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const rows = await this.prisma.miraTurn.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      });
      return rows.reverse().map((t: { who: string; text: string }) => ({
        role: t.who === 'you' ? ('user' as const) : ('assistant' as const),
        content: t.text.slice(0, 1500),
      }));
    } catch {
      return [];
    }
  }

  /**
   * ── THE PRISMA CLIENT ON DISK DOES NOT KNOW THIS TABLE YET ────────────────
   *
   * `npx prisma generate` cannot run in the sandbox this was written in — no
   * network, and the cached engine is for the wrong platform — so `MiraFact`
   * is reached through a narrow declared shape rather than the generated type.
   * The same escape hatch `nutrition.service.ts` uses for `notification`, for
   * the same reason, and it means compiling this does not depend on the order
   * somebody runs two commands in. The lander regenerates the client anyway.
   */
  private get facts(): {
    findMany(a: unknown): Promise<Array<{ id: string; subject: string; value: string; confidence: string; sourceText: string; updatedAt: Date }>>;
    upsert(a: unknown): Promise<unknown>;
    deleteMany(a: unknown): Promise<{ count: number }>;
    count(a: unknown): Promise<number>;
  } {
    return (this.prisma as unknown as { miraFact: {
      findMany(a: unknown): Promise<Array<{ id: string; subject: string; value: string; confidence: string; sourceText: string; updatedAt: Date }>>;
      upsert(a: unknown): Promise<unknown>;
      deleteMany(a: unknown): Promise<{ count: number }>;
      count(a: unknown): Promise<number>;
    } }).miraFact;
  }

  /** The durable half of her memory, newest first. A failure is an absence. */
  private async factsOf(userId: string): Promise<Fact[]> {
    try {
      const rows = await this.facts.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 40 });
      return rows.map((r) => ({
        subject: r.subject,
        value: r.value,
        confidence: (['known', 'likely', 'possible'].includes(r.confidence) ? r.confidence : 'possible') as Fact['confidence'],
      }));
    } catch { return []; }
  }

  /**
   * Every fact, gone. Never the reason a forget fails: the transcript wipe and
   * the ledger both have to happen even if this table is unreachable.
   */
  private async wipeFacts(userId: string): Promise<void> {
    try { await this.facts.deleteMany({ where: { userId } }); } catch { /* best effort */ }
  }

  /** Their own record, with the sentence each one came from. */
  async knows(userId: string): Promise<{ facts: Array<{ id: string; subject: string; value: string; confidence: string; why: string; at: string }> }> {
    try {
      const rows = await this.facts.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 200 });
      return {
        facts: rows.map((r) => ({
          id: r.id, subject: r.subject, value: r.value, confidence: r.confidence,
          why: r.sourceText, at: r.updatedAt.toISOString(),
        })),
      };
    } catch { return { facts: [] }; }
  }

  /** One fact, gone. Scoped to the citizen asking — never by id alone. */
  async forgetFact(userId: string, id: string): Promise<{ removed: number }> {
    try {
      const { count } = await this.facts.deleteMany({ where: { id, userId } });
      return { removed: count };
    } catch { return { removed: 0 }; }
  }

  /**
   * ── WHAT SHE LEARNED, EXTRACTED ONCE AND KEPT ─────────────────────────────
   *
   * Fire-and-forget by construction. This is a second model call and it must
   * never slow an answer down, never be the reason one fails, and never appear
   * in the citizen's meter — the turn they paid for was the conversation.
   *
   * `keepable()` is where the safety lives: the model is INSTRUCTED to withhold
   * whole categories and then its output is FILTERED for them anyway, because
   * an instruction is a hope and a filter is a rule. Both, deliberately.
   */
  private learn(userId: string, asked: string, said: string): void {
    if (!this.ai.enabled) return;
    void (async () => {
      try {
        const out = await this.ai.json<{ facts?: unknown }>(
          EXTRACT_SYSTEM,
          `Citizen: ${asked.slice(0, 2000)}\nMira: ${said.slice(0, 2000)}`,
          { facts: [] },
          400,
        );
        const kept = keepable(out?.facts);
        for (const f of kept) {
          await this.facts.upsert({
            where: { userId_subject: { userId, subject: f.subject } },
            create: { userId, subject: f.subject, value: f.value, confidence: f.confidence, sourceText: asked.slice(0, 500) },
            update: { value: f.value, confidence: f.confidence, sourceText: asked.slice(0, 500) },
          });
        }
      } catch { /* memory is best-effort, never load-bearing */ }
    })();
  }

  /** Write both sides of an exchange into the record. Fire-and-forget, and
   *  the reply is stamped a millisecond later so the pair reads back in the
   *  order it was said. */
  private remember(userId: string, asked: string, said: string): void {
    try {
      const at = Date.now();
      void this.prisma.miraTurn.createMany({
        data: [
          { userId, room: ROW_KEY, who: 'you', text: asked.slice(0, 4000), createdAt: new Date(at) },
          { userId, room: ROW_KEY, who: 'mira', text: said.slice(0, 4000), createdAt: new Date(at + 1) },
        ],
      }).then(() => this.trim(userId)).catch(swallowed('mira.remember: write the turn pair', undefined, { userId }));
    } catch { /* memory is best-effort, never load-bearing */ }
  }

  /**
   * AND HER MEMORY HAS AN END.
   *
   * MiraTurn grew for the life of the account: the ledger's day files were
   * given a retention window on the argument that a log with no expiry is a
   * privacy liability that grows on its own, and this table is the same
   * artefact with the citizen's name attached and both voices in it.
   *
   * The oldest are dropped, not the newest — she keeps what is recent, which
   * is what `recall()` and the thread read. One indexed read and at most one
   * delete per exchange, floated like the write it follows: a trim that fails
   * is a table that stays a little longer, never an answer that does not come.
   */
  private trim(userId: string): void {
    void this.safely(async () => {
      const edge = await this.prisma.miraTurn.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: KEEP_TURNS,
        take: 1,
        select: { createdAt: true },
      });
      if (!edge.length) return;
      await this.prisma.miraTurn.deleteMany({
        where: { userId, createdAt: { lt: edge[0].createdAt } },
      });
    });
  }

  /**
   * Tear pages out of her notebook — the one write she can do, and it only
   * ever removes. Scoped to the asker's own record by construction: the
   * WHERE carries their userId before anything else.
   *
   * ── WHAT "forget her" USED TO DO ──────────────────────────────────────────
   *
   * `deleteMany({ text: { contains: 'her' } })`, unconfirmed, in one turn. That
   * is every stored turn containing there, where, other, together, mother and
   * father — a substring match run as a mass delete on a three-letter word.
   * `forget.ts` raised its floor so that sentence no longer parses as a topic,
   * but the floor was never the hazard: the DELETE was, and it is still a
   * substring for every topic that does parse.
   *
   * Three things changed. The match is on a WORD BOUNDARY, done in JS over
   * candidates the database narrowed. The delete takes TWO TURNS — she says
   * how many and shows one, and nothing goes until the citizen says yes. And
   * the scope is SYMMETRIC: both halves of an exchange go together, so a
   * question is never deleted while the answer that quotes it stays, and a
   * topic that appears only in HER reply takes the question with it.
   *
   * `forget everything` stays one turn. It is unambiguous, it is the whole
   * record, and the citizen said the word.
   */
  private async forget(userId: string, ask: { scope: string; topic?: string }): Promise<Attempt> {
    if (ask.scope === 'dismiss') return { outcome: 'forget', text: 'Dropped.' };
    if (ask.scope === 'unclear') {
      return {
        outcome: 'clarify',
        text: 'Everything, or a topic? Say "forget everything", or "forget about the loan" — and it is truly gone.',
        choices: [],
      };
    }
    try {
      if (ask.scope === 'everything') {
        await this.prisma.miraTurn.deleteMany({ where: { userId } });
        // AND WHAT SHE LEARNED FROM IT. A wipe that leaves the derived profile
        // standing is not a wipe — the transcript is gone and she still knows
        // everything it taught her, which is the worse half to keep.
        //
        // `try` and not `.catch()`: reaching a table the generated client has
        // not got throws SYNCHRONOUSLY, before there is a promise to catch on,
        // and that exception would take the whole forget down with it — the
        // one command where failing quietly is least acceptable.
        await this.wipeFacts(userId);
        // Her notebook is not the only place it was written down. See ledger.forget.
        void this.ledger.forget(userId);
        await this.pend(userId, null);
        return {
          outcome: 'forget',
          text: 'Done — all of it, gone from my memory, on every device. What\u2019s still on this screen goes when you press Clear this screen.',
        };
      }
      const topic = (ask.topic ?? '').trim();
      const { hits, sample } = await this.matching(userId, topic);
      if (!hits) {
        return { outcome: 'forget', text: 'Nothing in my memory mentions that, so there was nothing to forget. We\u2019re clean.' };
      }
      await this.pend(userId, topic);
      const shown = sample ? ` One of them: \u201c${sample}\u201d.` : '';
      return {
        outcome: 'forget',
        text: `${hits} thing${hits === 1 ? '' : 's'} in my memory mention that.${shown} Say yes and they go, for good — say no and I leave them.`,
      };
    } catch {
      return { outcome: 'forget', text: 'That didn\u2019t take just now. Ask me again in a minute — it matters.' };
    }
  }

  /** The second turn: she was told yes. */
  private async forgetTopic(userId: string, topic: string): Promise<Attempt> {
    try {
      const { ids } = await this.matching(userId, topic);
      if (ids.length) await this.prisma.miraTurn.deleteMany({ where: { userId, id: { in: ids } } });
      void this.ledger.forget(userId, topic);
      await this.pend(userId, null);
      return {
        outcome: 'forget',
        text: ids.length
          ? 'Done. Gone from my memory, on every device — both halves of every one of them.'
          : 'Nothing left matching that. Already gone.',
      };
    } catch {
      return { outcome: 'forget', text: 'That didn\u2019t take just now. Ask me again in a minute — it matters.' };
    }
  }

  /**
   * What a topic forget would actually take, and one sample of it.
   *
   * The database narrows with `contains` — that is what an index can do — and
   * the word-boundary decision is made here, in JS, over the rows that came
   * back. `hits` is what MENTIONS the topic, which is the number a citizen
   * recognises; `ids` is what would be DELETED, which is those turns plus the
   * other half of each exchange. The two differ on purpose and the reply quotes
   * the first.
   */
  private async matching(userId: string, topic: string): Promise<{ ids: string[]; hits: number; sample?: string }> {
    if (!topic) return { ids: [], hits: 0 };
    const rows = await this.prisma.miraTurn.findMany({
      where: { userId, text: { contains: topic, mode: 'insensitive' } },
      select: { id: true, room: true, text: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: FORGET_MAX,
    });
    const hit = rows.filter((r: { text: string }) => mentions(r.text, topic));
    if (!hit.length) return { ids: [], hits: 0 };
    /**
     * The other half of each exchange. `remember()` writes the pair a
     * millisecond apart, which is what makes a one-millisecond window the
     * partner and not a coincidence.
     */
    const partners = await this.prisma.miraTurn.findMany({
      where: {
        userId,
        OR: hit.map((h: { room: string; createdAt: Date }) => ({
          room: h.room,
          createdAt: { gte: new Date(h.createdAt.getTime() - 1), lte: new Date(h.createdAt.getTime() + 1) },
        })),
      },
      select: { id: true },
      // Two per hit at the outside — the pair `remember()` wrote — and `hit`
      // is itself capped at FORGET_MAX.
      take: FORGET_MAX * 2,
    });
    const ids = [...new Set([
      ...hit.map((h: { id: string }) => h.id),
      ...partners.map((p: { id: string }) => p.id),
    ])];
    /**
     * ONE SAMPLE, CUT SHORT — and only if it passes her own voice rules.
     *
     * It is the citizen's own sentence, so quoting it back leaks nothing they
     * did not write. It is quoted so "three things" is something they can
     * recognise before they say yes to a deletion nobody can undo. And it goes
     * through `violations` first because it is about to be spoken in HER line:
     * a citizen who typed "of course!" would otherwise make `acceptOrFallback`
     * throw the whole confirmation away and answer "I can't do that from here."
     */
    const cut = excerpt(hit[0].text);
    return { ids, hits: hit.length, sample: violations(cut).length ? undefined : cut };
  }

  /** Their name, for the persona. Best-effort — she talks fine without it. */
  private async nameOf(userId: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
      .catch(swallowed('mira.nameOf: read their name', null, { userId }));
    return u?.name ?? null;
  }

  /** Their Vedic signs and birth date, when birth details exist. Best-effort,
   *  never blocking — she talks fine without either. */
  private async chartOf(userId: string): Promise<{
    signs: { sun?: string | null; moon?: string | null; rising?: string | null };
    birthDate: string | null;
  } | null> {
    try {
      const p = (await this.astrology.getProfile(userId)) as
        { birthDate?: string; chart?: { sunSign?: string; moonSign?: string; ascendant?: string | null } } | null;
      if (!p?.chart) return null;
      return {
        signs: { sun: p.chart.sunSign ?? null, moon: p.chart.moonSign ?? null, rising: p.chart.ascendant ?? null },
        birthDate: typeof p.birthDate === 'string' ? p.birthDate : null,
      };
    } catch {
      return null;
    }
  }

  /** One question, never two, and never a guess between two things. */
  private clarify(r: Routed): string {
    if (r.why === 'cancel what') return "Cancel which one — say the booking and I'll find it.";
    if (r.why.includes('score the same')) return 'Two things that could mean. Which one?';
    if (r.why === 'nothing matched' || r.why === 'empty') {
      return "That's not something I can do yet. What are you actually trying to get done?";
    }
    return 'Say a bit more and I can find it.';
  }

  /**
   * "How is my day going to be?" — the question that started all of this.
   *
   * ── WHY IT IS ONE TURN AND NOT FIVE ───────────────────────────────────────
   *
   * Asked in production, she said *"That's not something I can do yet"* — while
   * the citizen's reading for that exact day was sitting in `astroReading`,
   * their doses were expanded and waiting in `medicines/today`, and their unread
   * count was one query away. Every part of the answer existed. Nothing joined
   * them up, and an assistant that makes you visit four hubs to assemble your
   * own morning is a menu with a personality.
   *
   * So this is the one composite in the executor, and it is the shape the rest
   * of "proactive" will take: HER OWN READING FIRST, because that is what was
   * asked, then only the facts that would change what somebody does before
   * lunch.
   *
   * ── EVERY READ IS GUARDED SEPARATELY ──────────────────────────────────────
   *
   * Five hubs, `Promise.allSettled`, and a dead one contributes nothing rather
   * than taking the answer down. A morning brief that fails entirely because the
   * watchlist service is down is worse than no morning brief — and this is the
   * one turn most likely to be somebody's first.
   *
   * The astrology letter is written by a model and cached per citizen per day.
   * On a cache miss it returns `pending`, and `pending` is reported, never
   * retried in a loop: it costs a model call and it is not hers to spend.
   */
  private async dayBrief(userId: string, tz?: string): Promise<Attempt> {
    const [reading, doses, prep, post, alerts] = await Promise.allSettled([
      this.astrology.daily(userId),
      this.prescriptions.today(userId),
      this.nutrition.prepAlerts(userId),
      this.mail.account(userId),
      this.notifications.unreadCount(userId),
    ]);
    const ok = <T,>(r: PromiseSettledResult<T>): T | undefined => (r.status === 'fulfilled' ? r.value : undefined);

    const parts: string[] = [];
    const r = ok(reading);
    if (pick(r, 'needsProfile') === true) {
      return {
        outcome: 'navigate',
        text: 'I need your birth details before I can read your day — date, time and place.',
        goto: { label: 'Astrology', path: '/astrology' },
      };
    }
    if (pick(r, 'pending') === true) {
      parts.push('Your reading for today is still being written. Give it a few minutes.');
    } else {
      const body = str(pick(r, 'body'));
      const title = str(pick(r, 'title'));
      if (body) parts.push(firstSentences(body, 1));
      else if (title) parts.push(title);
    }

    const due = asList(ok(doses), 'doses').filter((d) => {
      const s = str(pick(d, 'status'));
      return s === 'due' || s === 'upcoming';
    });
    if (due.length) {
      const names = due.slice(0, 3).map((d) => str(pick(d, 'medicine')) ?? 'something').filter(Boolean);
      parts.push(`${due.length === 1 ? 'One dose' : `${due.length} doses`} left — ${list(names)}.`);
    }

    const cook = asList(ok(prep), 'alerts');
    if (cook.length) {
      const next = cook[0];
      const what = str(pick(next, 'title')) ?? str(pick(next, 'what'));
      const when = clockTime(str(pick(next, 'startBy')), tz);
      if (what) {
        parts.push(when
          ? `Start ${asNamed(what)} by ${when}.`
          : `Next in the kitchen: ${asNamed(what)}.`);
      }
    }

    const unreadMail = num(pick(pick(ok(post), 'counts'), 'inboxUnread')) ?? 0;
    const unseen = num(ok(alerts)) ?? 0;
    const waiting: string[] = [];
    if (unreadMail) waiting.push(`${unreadMail} unread`);
    if (unseen) waiting.push(`${unseen} alert${unseen === 1 ? '' : 's'}`);
    if (waiting.length) parts.push(`${waiting.join(', ')}.`);

    if (!parts.length) {
      return {
        outcome: 'capability',
        text: 'Nothing on your day yet — no reading, no doses, nothing waiting.',
        asides: ['Enjoy it while it lasts.'],
      };
    }

    // §23, and it is load-bearing rather than stylistic. `say()` drops her aside
    // once the finished line exceeds the mood's word budget, so an unbounded
    // join does not merely make her verbose — it makes her voiceless, and it
    // does it silently, on the turn most likely to be somebody's first. The
    // reading is always kept; the rest is reachable by asking, which is the
    // whole premise of her existing.
    return {
      outcome: 'capability',
      text: parts.slice(0, 4).join(' '),
      asides: due.length
        ? ['The pills are not going to take themselves.']
        : ['That is the whole of it. Ask me for any of it properly and I will open it.'],
      payload: { reading: ok(reading), doses: due.slice(0, 6), prep: cook.slice(0, 3) },
      goto: { label: 'Astrology', path: '/astrology' },
    };
  }

  /**
   * The executor. Reads only, across the whole city.
   *
   * A SWITCH RATHER THAN A REGISTRY, STILL — and now that there are
   * twenty-five of them the choice is worth restating rather than assumed. A
   * map that modules register into would be shorter and would move the answer
   * to "what can she actually do" out of this file and into twelve others. The
   * switch is the thing that makes R0-ONLY VERIFIABLE BY READING IT: every
   * branch here calls a service method whose name begins with a read, and you
   * can check that claim in one screen. That property is worth more than the
   * line count.
   *
   * Each branch returns the FACT and the asides that would be true of it.
   * Whether an aside is said is not this method's business — `say()` asks the
   * governor. A branch cannot make itself funny, which is the whole safety
   * argument for having jokes at all.
   */
  private async read(
    id: string,
    userId: string,
    c: Colour,
    tz: string | undefined,
    hour: number,
    text: string,
  ): Promise<Attempt> {
    switch (id) {
      // ── MONEY ──────────────────────────────────────────────────────────
      case 'financial GET wallet': {
        const w = await this.financial.wallet(userId);
        const bal = num(pick(w, 'balanceInr')) ?? num(pick(w, 'balance')) ?? 0;
        return {
          text: `${rupees(bal)}.`,
          asides: bal <= 0 ? ['Which is a number, technically.'] : [],
          payload: w,
        };
      }
      case 'financial GET transactions': {
        const txns = asList(await this.financial.transactions(userId));
        if (!txns.length) return { text: nothing('your transactions', c), payload: [] };
        const recent = txns.slice(0, 3);
        const names = recent.map((t) => str(pick(t, 'title')) ?? str(pick(t, 'description')) ?? 'a charge');
        return { text: `Last ${recent.length}: ${list(names)}.`, payload: recent };
      }
      case 'financial GET budgets': {
        const rows = asList(await this.financial.budgets(userId));
        const over = rows.filter((b) => (num(pick(b, 'spent')) ?? 0) > (num(pick(b, 'monthlyInr')) ?? Infinity));
        if (!rows.length) return { text: 'No budgets set yet.', payload: [] };
        if (!over.length) return { text: `${rows.length} budgets, all inside.`, asides: ['Suspicious.'], payload: rows };
        const names = over.map((b) => str(pick(b, 'category')) ?? 'one').slice(0, 3);
        return { text: `Over on ${list(names)}.`, asides: ['Not judging. Reporting.'], payload: over };
      }
      case 'financial GET spending': {
        const s = await this.financial.spending(userId);
        const total = num(pick(s, 'thisMonthInr')) ?? num(pick(s, 'total')) ?? 0;
        return { text: `${rupees(total)} this month.`, payload: s };
      }

      // ── THE DAY ────────────────────────────────────────────────────────
      case 'astrology GET daily':
        return this.dayBrief(userId, tz);
      case 'astrology GET gems': {
        const g = await this.astrology.gems(userId);
        if (pick(g, 'needsProfile') === true) return this.needBirth();
        const stone = str(pick(g, 'stone')) ?? str(pick(pick(g, 'primary'), 'name'));
        if (!stone) return { text: 'Nothing your chart is asking for right now.', payload: g };
        return { text: `${stone}.`, asides: ['Do not buy it from a man on a train.'], payload: g, goto: { label: 'Gemstones', path: '/astrology/gemstones' } };
      }
      case 'astrology GET remedies': {
        const r = await this.astrology.remedies(userId);
        if (pick(r, 'needsProfile') === true) return this.needBirth();
        const items = asList(r, 'practices', 'remedies', 'items');
        if (!items.length) return { text: 'Nothing prescribed right now.', payload: r };
        const names = items.slice(0, 3).map((p) => str(pick(p, 'title')) ?? str(pick(p, 'name'))).filter(Boolean) as string[];
        return { text: `${items.length}: ${list(names)}.`, payload: r, goto: { label: 'Remedies', path: '/astrology/remedies' } };
      }
      case 'astrology GET tarot/daily': {
        const card = await this.tarot.dailyCard(userId);
        const name = str(pick(card, 'name')) ?? str(pick(pick(card, 'card'), 'name'));
        if (!name) return { text: 'No card today.', payload: card };
        return { text: `${name}.`, asides: ['Make of that what you like.'], payload: card, goto: { label: 'Tarot', path: '/astrology/tarot' } };
      }

      // ── THE BODY. No asides reach these — the governor caps medical and
      //    medicines at L0, and `say()` will drop anything written here. They
      //    are left empty so nobody has to discover that by testing it.
      case 'medicines GET today': {
        const t = await this.prescriptions.today(userId);
        const doses = asList(t, 'doses');
        if (!doses.length) return { text: 'Nothing to take today.', payload: t };
        const due = doses.filter((d) => { const s = str(pick(d, 'status')); return s === 'due' || s === 'upcoming'; });
        const taken = doses.filter((d) => str(pick(d, 'status')) === 'taken').length;
        if (!due.length) return { text: `All ${doses.length} done.`, payload: t };
        const names = due.slice(0, 3).map((d) => str(pick(d, 'medicine')) ?? 'one').filter(Boolean);
        return {
          text: `${due.length} still to take — ${list(names)}.${taken ? ` ${taken} done.` : ''}`,
          payload: t,
          // `/medicines` is not a page. The medicine list has always lived at
          // `/medical/medicines`, which is what `city.ts` points at — so she was
          // offering to take somebody to a route that does not exist.
          goto: { label: 'Medicines', path: '/medical/medicines' },
        };
      }
      case 'medical GET summary': {
        const s = await this.medical.healthSummary(userId);
        if (pick(s, 'hasPanel') !== true) {
          return { text: 'No blood work on file yet.', goto: { label: 'Medical', path: '/medical' } };
        }
        const score = num(pick(s, 'score'));
        const band = str(pick(s, 'band'));
        const taken = str(pick(s, 'takenOn'));
        return {
          text: `${score ?? '—'}${band ? `, ${band}` : ''}${taken ? `, from ${taken}` : ''}.`,
          payload: s,
          goto: { label: 'Medical', path: '/medical' },
        };
      }
      case 'profile GET health-score': {
        const h = await this.profile.healthScore(userId);
        const score = num(pick(h, 'score'));
        if (score === undefined) return { text: 'Not enough on file to score yet.', payload: h };
        return { text: `${score}.`, payload: h, goto: { label: 'Profile', path: '/profile' } };
      }

      // ── FOOD ───────────────────────────────────────────────────────────
      case 'nutrition GET targets': {
        const t = await this.nutrition.targets(userId);
        const kcal = num(pick(t, 'calories')) ?? num(pick(t, 'kcal'));
        const protein = num(pick(t, 'protein')) ?? num(pick(t, 'proteinG'));
        if (kcal === undefined) return { text: 'No targets set yet.', payload: t, goto: { label: 'Nutrition', path: '/nutrition' } };
        return {
          text: `${Math.round(kcal)} kcal${protein !== undefined ? `, ${Math.round(protein)}g protein` : ''}.`,
          payload: t,
        };
      }
      /**
       * ── SHE NAMES A MEAL ──────────────────────────────────────────────
       *
       * The screenshot this exists for: "what am i eating today" answered
       * *"Nothing needs starting yet. Kitchen is quiet."*, and then the same
       * sentence again when the citizen rephrased. Both went to `prep-alerts`,
       * which reports soaking deadlines. This is the plan, by name.
       *
       * An empty answer still ANSWERS and then offers the page — never a bare
       * refusal, and never a page instead of what she does know.
       */
      case 'nutrition GET plan/today': {
        const plan = await this.nutrition.planToday(userId);
        // The EXACT page, not the hub door (owner, 24 Aug): the plan the
        // answer was read from is the Weekly Meal Planner's.
        const to = { label: 'Weekly Meal Planner', path: '/nutrition/weekly' };
        if (plan.needsProfile) {
          return {
            text: 'No plan yet — your food profile is not set, so there is nothing to cook from.',
            payload: plan,
            goto: { label: 'Food profile', path: '/nutrition/profile' },
          };
        }
        if (!plan.meals.length) {
          // She has targets even when she has no plan. Say the true thing she
          // does hold rather than only the thing she does not.
          const t = await this.nutrition.targets(userId)
            .catch(swallowed('mira.plan: read nutrition targets', null, { userId }));
          const kcal = num(pick(t, 'calories')) ?? num(pick(t, 'kcal'));
          return {
            text: kcal === undefined
              ? 'Your plan has no meals on it for today.'
              : `Your plan has no meals on it for today — you have ${Math.round(kcal)} kcal to spend.`,
            payload: plan,
            goto: to,
          };
        }
        /**
         * ── AT SIX IN THE EVENING, NOBODY IS ASKING ABOUT BREAKFAST ───────
         *
         * This listed all four meals in plan order, so "What should I cook"
         * at 18:06 opened with `Breakfast: Veg Breakfast`. True, and useless.
         * `daypart.ts` narrows it to what can still be eaten — unless the
         * citizen named a meal or another day, in which case their words win
         * and nothing is narrowed. `hour` is the server's, from the zone on
         * their profile, never the browser's claim.
         */
        const when = timeContext(hour, text, plan.meals);
        const shown = plan.meals.filter((m) => m.title && when.slots.includes(m.slot));
        const use = shown.length ? shown : plan.meals.filter((m) => m.title);
        if (!use.length) return { text: 'Your plan has no meals on it for today.', payload: plan, goto: to };
        const named = use.map((m) => `${SLOT_SAID[m.slot] ?? m.label ?? 'A meal'}: ${m.title}`);
        // The day is over and she says so, rather than offering breakfast as
        // though the clock were not a fact she holds.
        const spent = !when.theyChose && !shown.length;
        return {
          text: `${named.slice(0, 4).join(' · ')}.`,
          asides: spent
            ? ['That was today — tomorrow starts the same plan over.']
            : ['Cook the one you feel like.'],
          payload: { ...plan, daypart: when.daypart },
          goto: to,
        };
      }
      case 'nutrition GET prep-alerts': {
        const a = asList(await this.nutrition.prepAlerts(userId), 'alerts');
        // ANSWER, THEN OFFER THE PAGE. The old empty state stopped at "Kitchen
        // is quiet" — true, and the end of the conversation. It now says which
        // question it just answered, so a citizen who meant the other one can
        // see that and ask it.
        if (!a.length) return {
          text: 'Nothing needs soaking or marinating yet.',
          asides: ['Kitchen is quiet.'],
          goto: { label: 'Weekly Meal Planner', path: '/nutrition/weekly' },
        };
        const next = a[0];
        // Same two faults as the day brief had, in a second branch: a raw ISO
        // instant and a Title Case row used as a noun. Found by the land script's
        // grep, not by anybody reading — which is the argument for the grep.
        const raw = str(pick(next, 'title')) ?? str(pick(next, 'what'));
        const what = raw ? asNamed(raw) : 'the next meal';
        const when = clockTime(str(pick(next, 'startBy')), tz);
        return {
          text: when ? `Start ${what} by ${when}.` : `Next: ${what}.`,
          asides: ['Do not let it become an order.'],
          payload: a.slice(0, 4),
          goto: { label: 'Weekly Meal Planner', path: '/nutrition/weekly' },
        };
      }

      // ── WHAT IS WAITING ────────────────────────────────────────────────
      case 'mail GET account': {
        const acc = await this.mail.account(userId);
        const unread = num(pick(pick(acc, 'counts'), 'inboxUnread')) ?? 0;
        if (!unread) return { text: 'Inbox is clear.', asides: ['Enjoy the silence.'], payload: acc };
        return {
          text: `${unread} unread.`,
          asides: ['They will still be there in an hour.'],
          payload: acc,
          goto: { label: 'Mail', path: '/mail' },
        };
      }
      case 'notifications GET unread-count': {
        const n = (await this.notifications.unreadCount(userId)) || 0;
        if (!n) return { text: 'Nothing waiting.', payload: { count: 0 } };
        return { text: `${n}.`, payload: { count: n } };
      }

      // ── WHO THEY ARE ───────────────────────────────────────────────────
      case 'profile GET master': {
        const p = await this.profile.get(userId);
        const name = str(pick(p, 'name'));
        const age = num(pick(p, 'age'));
        const bits = [name, age !== undefined ? `${age}` : undefined].filter(Boolean) as string[];
        return {
          text: bits.length ? `${list(bits)}. The rest is on your profile.` : 'Not much yet, honestly.',
          asides: ['Less than you would think, and only what you told me.'],
          payload: p,
          goto: { label: 'Profile', path: '/profile' },
        };
      }
      case 'profile GET completion': {
        const rows = asList(await this.profile.completion(userId));
        const gaps = rows.filter((r) => pick(r, 'complete') !== true);
        if (!gaps.length) return { text: 'Nothing missing.', asides: ['Rare.'], payload: rows };
        const names = gaps.slice(0, 3).map((g) => str(pick(g, 'label')) ?? 'one').filter(Boolean);
        return { text: `${gaps.length} still open: ${list(names)}.`, payload: gaps };
      }

      // ── THINGS IN FLIGHT ───────────────────────────────────────────────
      case 'travel GET trips': {
        const t = asList(await this.travel.myTrips(userId));
        if (!t.length) return { text: 'No trips.', asides: ['Sedentary, but cheap.'], payload: [] };
        const where = str(pick(t[0], 'destination')) ?? str(pick(t[0], 'title'));
        return { text: where ? `${t.length}. Next: ${where}.` : `${t.length} on file.`, payload: t.slice(0, 5), goto: { label: 'Travel', path: '/travel' } };
      }

      // ── THE REST OF THE CITY ───────────────────────────────────────────
      case 'drive GET': {
        const items = asList(await this.drive.list(userId), 'files', 'items');
        if (!items.length) return { text: nothing('your drive', c), payload: [] };
        return { text: `${items.length} in your drive. Which one?`, payload: items.slice(0, 8) };
      }
      case 'drive GET usage': {
        const u = await this.drive.usage(userId);
        const pct = num(pick(u, 'usedPct'));
        return {
          text: pct === undefined ? 'Storage is fine.' : `${Math.round(pct)}% used.`,
          asides: (pct ?? 0) > 85 ? ['You are a hoarder with a login.'] : [],
          payload: u,
        };
      }
      case 'fitness GET plan': {
        const p = await this.fitness.plan(userId);
        const focus = str(pick(p, 'todayFocus')) ?? str(pick(p, 'focus')) ?? str(pick(p, 'title'));
        if (!focus) return { text: 'No plan set yet.', payload: p, goto: { label: 'Fitness plan', path: '/fitness/plan' } };
        return { text: `${focus}.`, asides: ['The plan is not the hard part.'], payload: p, goto: { label: 'Fitness plan', path: '/fitness/plan' } };
      }
      case 'fitness GET log': {
        const l = await this.fitness.log(userId);
        const mins = num(pick(l, 'weekMinutes')) ?? 0;
        return {
          text: `${mins} minutes this week.`,
          asides: mins === 0 ? ['A clean slate, if you want to call it that.'] : ['Keep going.'],
          payload: l,
        };
      }
      case 'beauty GET products': {
        /* "what beauty products are suggested for me" used to wander off to
           astrology (owner's screenshot, 24 Aug). The Market's own matched
           shelf is the answer, by name, with the exact page on the card. */
        const shelf = await this.beauty.products(userId);
        const rows = asList(shelf, 'products');
        const matched = rows.filter((r) => Boolean(pick(r, 'matched')));
        const use = (matched.length ? matched : rows).slice(0, 3);
        const names = use.map((r) => str(pick(r, 'name'))).filter((n): n is string => Boolean(n));
        if (!names.length) {
          return {
            text: 'Your shelf is empty until your skin and hair profile is filled in.',
            goto: { label: 'Skin & Hair Profile', path: '/beauty/profile' },
          };
        }
        return {
          text: `Matched to you: ${list(names)}.`,
          asides: ['The rest of the shelf is sorted best-match first.'],
          payload: use,
          goto: { label: 'Beauty Market', path: '/beauty/market' },
        };
      }
      case 'pets GET': {
        const petsList = await this.pets.list(userId);
        if (!petsList.length) {
          return {
            text: 'No pets on file yet — add one and I can keep their care in view.',
            goto: { label: 'Pets', path: '/pets' },
          };
        }
        const petNames = petsList.map((x) => str(pick(x, 'name'))).filter((n): n is string => Boolean(n));
        return {
          text: petNames.length ? `${list(petNames)}. Their care is all on file.` : `${petsList.length} on file.`,
          payload: petsList.slice(0, 4),
          goto: { label: 'Pets', path: '/pets' },
        };
      }
      case 'beauty GET routine': {
        const r = await this.beauty.routine(userId);
        if (pick(r, 'needsBudget') === true) {
          return { text: 'You need a budget before there is a routine.', payload: r, goto: { label: 'Your Beauty Routine', path: '/beauty/routine' } };
        }
        const count = num(pick(r, 'productCount')) ?? asList(r, 'routines').length;
        return { text: `${count} steps.`, payload: r, goto: { label: 'Your Beauty Routine', path: '/beauty/routine' } };
      }
      case 'entertainment GET watchlist': {
        const items = asList(await this.entertainment.watchlist(userId), 'items');
        if (!items.length) return { text: nothing('your watchlist', c), asides: ['Bold of you to have free time.'], payload: [] };
        const names = items.slice(0, 3).map((i) => str(pick(i, 'title')) ?? str(pick(i, 'name'))).filter(Boolean) as string[];
        return { text: `${items.length}. ${list(names)}.`, payload: items.slice(0, 8), goto: { label: 'Entertainment', path: '/entertainment' } };
      }
      case 'thoughts GET': {
        const items = asList(await this.thoughts.list(userId, LAST_FEW), 'items');
        if (!items.length) return { text: nothing('your notes', c), payload: [] };
        const first = str(pick(items[0], 'title')) ?? str(pick(items[0], 'body'));
        return {
          text: first ? `${items.length}. The last one starts "${firstSentences(first, 1)}".` : `${items.length}.`,
          payload: items.slice(0, 5),
          goto: { label: 'Thoughts', path: '/thoughts' },
        };
      }

      default:
        // Reachable only if the manifest grows past what this switch knows.
        // Say so rather than pretending — the honesty rule the whole codebase
        // is built on applies to Mira's own gaps first.
        //
        // And say so in the LEDGER too, which is why `outcome` is returned from
        // here at all: a decorator the executor has no branch for is two halves
        // of the same feature disagreeing in production, and recording it as a
        // successful capability would hide exactly the thing worth finding.
        return { outcome: 'gap', text: "That's not something I can do yet." };
    }
  }

  private needBirth(): Attempt {
    return {
      text: 'I need your birth details first — date, time and place.',
      goto: { label: 'Astrology', path: '/astrology' },
    };
  }
}

/**
 * One relationship turn, assembled.
 *
 * Reflection first, always — what she HEARD, before anything she concluded.
 * Then the hand-off OR the script, never both: the entire point of a hand-off
 * is that a better opening sentence is the wrong answer.
 *
 * No asides are offered. `levity.ts` caps the listen lane at 0 and `say()` is
 * what decides — but the array is left empty rather than relying on that,
 * because nobody should have to run the governor in their head to know whether
 * a joke can land on somebody describing a marriage.
 */
function relate(r: Read): Attempt {
  if (r.handOff) return { outcome: 'relate', text: `${r.reflection} ${r.handOff}` };
  if (!r.script) return { outcome: 'relate', text: r.reflection };
  return { outcome: 'relate', text: `${r.reflection} If you want a way in: ${r.script.opening} ${r.script.why}` };
}

/**
 * How far the top match has to beat the runner-up before she stops asking.
 *
 * 0.25 is the gap between an exact name match (1.0) and a room that merely
 * contains the word (0.5, and 0.8 for a substring), which is the case that
 * produced the loop. Two rooms that both score 0.8 stay a question, because
 * they genuinely are one.
 */
const CONTEST = 0.25;

/** The last few notes. Typed off the service so a schema change is a red build. */
const LAST_FEW = { limit: 5 } as Parameters<ThoughtsService['list']>[1];

/**
 * The opening of a longer text, cut at a sentence.
 *
 * The astrology letter is prose written for a page. Reading the whole thing
 * into a chat bubble is how an assistant turns an answer into homework.
 */
function firstSentences(body: string, count: number): string {
  const clean = body.replace(/\s+/g, ' ').trim();
  const parts = clean.match(/[^.!?]+[.!?]+/g);
  if (!parts?.length) return clean.slice(0, 180);
  return parts.slice(0, count).join(' ').trim();
}
