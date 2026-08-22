import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Every question anybody asks Mira, written to a file.
 *
 * ── WHY THIS IS THE MOST USEFUL FILE IN THE PROJECT ───────────────────────
 *
 * Mira can do four things. The interesting number is not how often those four
 * work — it is what people ask for that is NOT one of them. That set is the
 * capability roadmap, written by citizens rather than guessed at, and it does
 * not exist anywhere unless something writes it down.
 *
 * So each line carries the question AND the decision: which lane it routed to,
 * how confident the router was, which capability it matched, and what she did
 * with it. `answered: false` is the backlog, and `outcome` says which kind of
 * miss it was — a question she understood but cannot act on reads very
 * differently from one she could not parse at all.
 *
 * ── AND THE FILE COULD NOT ANSWER ITS OWN QUESTION ────────────────────────
 *
 * `answered` was `outcome === 'capability'` — which filed every successful
 * navigation, every real conversation and every correct crisis hand-off as
 * part of the backlog. The backlog was therefore mostly her working, the
 * number the header calls "the interesting one" was noise, and nobody could
 * have noticed by reading the code, because the derivation looked right next
 * to a paragraph about capabilities. It is a set now, and the set is named.
 *
 * The other half of that failure was the fields that were NOT here. The two
 * rooms could not be told apart at all; there was no latency, no way to tell a
 * sentence somebody wrote from one a model wrote, no record of the scores that
 * made a clarify a clarify, and no way to stitch two lines into one
 * conversation. Every later decision about her rests on those, so they go in
 * now and the line carries a version so a reader can tell a new record from an
 * old one.
 *
 * ── WHAT IS DELIBERATELY NOT IN IT ────────────────────────────────────────
 *
 * NOT HER REPLIES. The ask was for the questions, and her replies are
 * deterministic — given the lane and the capability they can be reconstructed.
 * Half the text is half the exposure.
 *
 * NOT WHO ASKED. `who` is a salted hash, twelve hex characters. That is enough
 * to count distinct citizens and to see one person asking the same unanswerable
 * thing four times, and not enough to open the file and read a named person's
 * questions. A log file is the artefact most likely to end up in a screenshot.
 *
 * AND THE SALT HAS TO EXIST FOR THAT TO BE TRUE. It fell back to a string
 * hardcoded three lines below the claim — which is the default deployment, so
 * in production the hash was reversible by anybody holding this file and a list
 * of user ids, and "useless without the salt" was false exactly where it
 * mattered. It does not throw: an optional feature may never stop the API from
 * booting, which is the rule `onModuleInit` below already keeps. It says so
 * once, loudly, and writes the line WITHOUT the question — the lane, the
 * outcome, the latency and the counts are still the whole point of the file,
 * and none of them is personal.
 *
 * ── AND WHAT IT COSTS TO BE HONEST ABOUT ──────────────────────────────────
 *
 * ON RAILWAY THIS FILE DIES WITH THE CONTAINER. There is no volume mounted, so
 * a redeploy takes the day's log with it. That is stated here rather than
 * discovered later: set MIRA_LOG_DIR to a mounted volume and it persists; leave
 * it and you get the current day of the current container, which is genuinely
 * useful for watching a launch and useless as an archive. The durable version
 * is a Prisma model with a purge-plan rule, and that belongs with the consent
 * ledger in phase 2 rather than smuggled in here.
 */

/** One file per day, and the day is fixed to the city's own clock.
 *
 *  Not the server's timezone — Railway's is UTC and would split an Indian
 *  evening across two files. Not the citizen's either, tempting as that is:
 *  the file is one shared artefact, and a boundary that moves per reader means
 *  two people disagree about which file a question is in. */
const CITY_TZ = 'Asia/Kolkata';
const DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: CITY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});

export function cityDay(at: Date): string {
  return DAY.format(at);
}

/** Long enough for any real question, short enough that a paste cannot fill a
 *  disk. Truncation is marked so a reader knows the line is not the whole ask. */
const MAX_TEXT = 500;
const RETAIN_DAYS = 30;
const FILE = /^asks-(\d{4}-\d{2}-\d{2})\.jsonl$/;

/**
 * A CONTAINER THAT LIVES FOR NINETY DAYS PRUNED ONCE, ON THE FIRST DAY.
 *
 * `prune()` ran at `onModuleInit` and never again, so retention was a property
 * of how often we happened to deploy. It runs daily now. The timer is
 * `unref`'d and cleared on destroy — a retention sweep is not a reason for a
 * process to stay alive, and it is certainly not a reason for a test run to
 * hang.
 */
const PRUNE_EVERY = 24 * 60 * 60 * 1000;

/**
 * The line format, so a reader can tell today's records from yesterday's.
 *
 * 1 was the original shape, where `answered` meant `outcome === 'capability'`
 * and the room, the latency and the source were absent. Anything counting
 * across the boundary has to know which it is holding.
 */
const LINE_VERSION = 2;

/**
 * What counts as her having answered.
 *
 * Not "a capability ran". A citizen who asked for a page and was taken to it
 * was answered; so was one who had a conversation, and so — most of all — was
 * one who said something frightening and got the hand-off, which is the single
 * most correct thing this module does and which version 1 filed as a miss.
 *
 * The three left out are the three that are genuinely the backlog: `clarify`
 * (she asked instead of answering), `gap` (a decorator with no branch behind
 * it) and `paywall` (the meter answered, not her).
 */
const ANSWERED: ReadonlySet<Outcome> = new Set<Outcome>([
  'capability', 'navigate', 'listen', 'advise', 'relate', 'chat', 'forget', 'confide',
]);

/**
 * Does this text mention that topic AS A WORD?
 *
 * It lives here rather than in `forget.ts` because `forget.ts` is the parser —
 * it decides whether a sentence was a command — and this is the matcher, which
 * both places a forget has to reach need: the turn record and this file. The
 * hazard it exists for is spelt out at the delete site: `contains: 'her'`
 * matches there, where, other, together, mother and father.
 */
export function mentions(text: string, topic: string): boolean {
  const t = topic.trim();
  if (!t) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, 'iu').test(text);
}

/**
 * What she did with it. `capability` is the only one that answered a question;
 * the rest are the different ways of not answering, and telling them apart is
 * the point — "I understood you and cannot do it yet" and "I could not work out
 * what you meant" are opposite problems with opposite fixes.
 *
 * `relate` is a relationship turn — somebody stuck with a person rather than a
 * task. Counted on its own because it is the one lane where "she answered" and
 * "she helped" are different questions, and this file is how we find out which.
 *
 * `gap` is the one worth watching: the router matched a decorated capability
 * and the executor had no branch for it. That is a decorator and an
 * implementation disagreeing in production, and it should never be silent.
 */
/**
 * `chat` is a model-backed conversation turn — the metered kind. `paywall` is
 * the meter itself answering; a run of them from one `who` is a citizen who
 * wants to talk and has not subscribed, which is a number the pricing needs.
 */
/** `forget` is the citizen exercising the promise that makes her memory
 *  tolerable. Counted so a spike in it reads as what it is: mistrust. */
/** `confide` is her reading of ONE person-to-person conversation, at the
 *  citizen's request, scoped to that thread and nothing else. Counted apart
 *  from `chat` because it is the one lane where what she saw was somebody
 *  ELSE's words too, and its volume is a fact worth watching on its own. */
export type Outcome = 'capability' | 'navigate' | 'listen' | 'advise' | 'relate' | 'clarify' | 'gap' | 'chat' | 'paywall' | 'forget' | 'confide';

export interface LedgerEntry {
  userId: string;
  text: string;
  lane: string;
  confidence: number;
  capability?: string;
  outcome: Outcome;
  levity: number;
  /** Which room asked. Absent from every line written before version 2, which
   *  is why the two could not be segmented at all. */
  mode?: 'friend' | 'city';
  /** End to end, in milliseconds. The model lane and the deterministic lanes
   *  differ by two orders of magnitude and nothing measured it. */
  ms?: number;
  /** Whether the words were a model's or a person's. Half of every question
   *  about her quality begins by separating these two. */
  source?: 'model' | 'deterministic';
  /** An aside existed and the length budget took it — `say.ts` explains why
   *  that number matters and why it was invisible. */
  asideDropped?: boolean;
  /** The turn tripped the distress signal, or the latch was held. */
  distress?: boolean;
  /** Which Mira turned up. */
  mood?: string;
  /** On a clarify: the two scores that made it one. A clarify at 0.81 against
   *  0.80 is the matcher being honest; one at 0.3 against 0.28 is the matcher
   *  having nothing, and the fix for each is the opposite of the other. */
  top?: number;
  second?: number;
  /** The conversation this turn belongs to — the citizen's day seed, which is
   *  one number per citizen per local day and is therefore the same on the
   *  phone and the laptop. Enough to stitch turns into conversations, and not
   *  a second identifier for a person. */
  session?: string;
}

@Injectable()
export class MiraLedger implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('MiraLedger');
  private readonly dir = process.env.MIRA_LOG_DIR?.trim() || join(process.cwd(), 'var', 'mira');
  /** Empty when unset, and empty is a state this class handles rather than a
   *  default it papers over. See the header. */
  private readonly salt = process.env.MIRA_LOG_SALT?.trim() || '';
  /** One warning, not one per question. A disk that cannot be written to will
   *  not start working because we said so nine hundred times. */
  private complained = false;
  /**
   * THE APPEND QUEUE, AND WHY A FIRE-AND-FORGET WRITE STILL NEEDS ONE.
   *
   * `record` starts an append and does not wait — that is the point, and it
   * stays true below. What it used to also mean is that three questions asked
   * in the same tick started THREE concurrent `appendFile` calls against the
   * same file, each of which opens, writes and closes on its own. They land in
   * whatever order the filesystem finishes them, which is usually call order
   * and is not always call order.
   *
   * Found by ledger.spec failing once on a machine where it had passed a
   * minute earlier, with the two surviving lines swapped. That is a flake in
   * the test and a defect in the file: an audit log whose lines can arrive out
   * of sequence is one a human cannot read chronologically, and the `at` stamp
   * does not rescue it here — questions asked in the same tick share one.
   *
   * The chain costs the caller nothing: `record` still returns immediately.
   * The `.catch` lives ON the chain rather than beside it, so one failed write
   * cannot poison the queue for every question after it.
   */
  private tail: Promise<void> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;

  async onModuleInit(): Promise<void> {
    if (!this.salt) {
      this.logger.error(
        'MIRA_LOG_SALT is not set — questions will be recorded WITHOUT their text. '
        + 'Set it to any long random string to get the asks back; the hashes change when you do.',
      );
    }
    try {
      await mkdir(this.dir, { recursive: true });
      this.logger.log(`questions → ${join(this.dir, 'asks-<day>.jsonl')}`);
      await this.prune();
      // Daily, and never a reason to keep the process (or a test run) alive.
      this.timer = setInterval(() => {
        void this.prune().catch((e) => this.logger.warn(`retention sweep failed: ${String(e)}`));
      }, PRUNE_EVERY);
      this.timer.unref?.();
    } catch (e) {
      this.logger.warn(`cannot open ${this.dir} — questions will not be recorded (${String(e)})`);
      this.complained = true;
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Fire and forget. Recording a question must never slow an answer down and
   *  must never be the reason one fails. */
  record(entry: LedgerEntry, at: Date = new Date()): void {
    this.tail = this.tail.then(() => this.write(entry, at)).catch((e) => {
      if (this.complained) return;
      this.complained = true;
      this.logger.warn(`could not record a question: ${String(e)}`);
    });
  }

  private async write(entry: LedgerEntry, at: Date): Promise<void> {
    const text = entry.text.length > MAX_TEXT ? `${entry.text.slice(0, MAX_TEXT)}…[cut]` : entry.text;
    const line = JSON.stringify({
      v: LINE_VERSION,
      at: at.toISOString(),
      who: this.who(entry.userId),
      /** Null when there is no salt: see the header. Everything else on the
       *  line survives, because none of the rest of it is about a person. */
      q: this.salt ? text : null,
      lane: entry.lane,
      confidence: Number(entry.confidence.toFixed(2)),
      capability: entry.capability ?? null,
      outcome: entry.outcome,
      /** Derived rather than passed, so the two can never disagree. It is here
       *  because counting is the first thing anybody does with this file. */
      answered: ANSWERED.has(entry.outcome),
      levity: entry.levity,
      mode: entry.mode ?? null,
      ms: entry.ms ?? null,
      source: entry.source ?? null,
      asideDropped: entry.asideDropped ?? null,
      distress: entry.distress ?? null,
      mood: entry.mood ?? null,
      top: entry.top ?? null,
      second: entry.second ?? null,
      session: entry.session ?? null,
    });
    await appendFile(join(this.dir, `asks-${cityDay(at)}.jsonl`), `${line}\n`, 'utf8');
  }

  /**
   * A FORGET REACHES THIS FILE TOO, OR "TRULY GONE" IS NOT TRUE.
   *
   * `forget` deleted from MiraTurn and stopped there, while the verbatim
   * question sat in the day files for thirty days — and every LISTEN turn, the
   * heaviest thing anybody says to her, lands here. A promise that the citizen
   * can take any of it back has to be kept everywhere it was written down, not
   * everywhere it was convenient to delete from.
   *
   * The day files are rewritten in place, dropping the citizen's own lines. A
   * line whose question was withheld (no salt) is left alone on a topic
   * forget: there is no text in it to have mentioned anything.
   *
   * Never throws. A forget that fails here must not turn the citizen's
   * confirmed deletion of her memory into an error in front of them — the
   * MiraTurn rows are gone either way, and this says so in the log.
   */
  async forget(userId: string, topic?: string): Promise<void> {
    const who = this.who(userId);
    try {
      for (const name of await readdir(this.dir)) {
        if (!FILE.test(name)) continue;
        const file = join(this.dir, name);
        const lines = (await readFile(file, 'utf8')).split('\n').filter(Boolean);
        const kept = lines.filter((line) => {
          let row: { who?: string; q?: string | null };
          try { row = JSON.parse(line) as { who?: string; q?: string | null }; } catch { return true; }
          if (row.who !== who) return true;
          if (!topic) return false;
          return !(typeof row.q === 'string' && mentions(row.q, topic));
        });
        if (kept.length !== lines.length) {
          await writeFile(file, kept.length ? `${kept.join('\n')}\n` : '', 'utf8');
        }
      }
    } catch (e) {
      this.logger.warn(`could not carry a forget into the day files: ${String(e)}`);
    }
  }

  /** Stable across restarts, so counting distinct askers works; useless without
   *  the salt, so the file alone is not a directory of who asked what — and
   *  when there is no salt the questions themselves are withheld instead, so
   *  the sentence stays true rather than becoming a claim. */
  who(userId: string): string {
    return createHash('sha256').update(`${this.salt || 'mira-ledger'}:${userId}`).digest('hex').slice(0, 12);
  }

  /** Retention is deleting a file, which is the argument for one file per day.
   *  A log with no expiry is a privacy liability that grows on its own. */
  private async prune(at: Date = new Date()): Promise<void> {
    const cutoff = cityDay(new Date(at.getTime() - RETAIN_DAYS * 86_400_000));
    for (const name of await readdir(this.dir)) {
      const m = FILE.exec(name);
      if (m && m[1] < cutoff) {
        await unlink(join(this.dir, name));
        this.logger.log(`pruned ${name} (older than ${RETAIN_DAYS} days)`);
      }
    }
  }
}
