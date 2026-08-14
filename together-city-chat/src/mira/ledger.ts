import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises';
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
 * What she did with it. `capability` is the only one that answered a question;
 * the rest are the different ways of not answering, and telling them apart is
 * the point — "I understood you and cannot do it yet" and "I could not work out
 * what you meant" are opposite problems with opposite fixes.
 *
 * `gap` is the one worth watching: the router matched a decorated capability
 * and the executor had no branch for it. That is a decorator and an
 * implementation disagreeing in production, and it should never be silent.
 */
export type Outcome = 'capability' | 'navigate' | 'listen' | 'advise' | 'clarify' | 'gap';

export interface LedgerEntry {
  userId: string;
  text: string;
  lane: string;
  confidence: number;
  capability?: string;
  outcome: Outcome;
  levity: number;
}

@Injectable()
export class MiraLedger implements OnModuleInit {
  private readonly logger = new Logger('MiraLedger');
  private readonly dir = process.env.MIRA_LOG_DIR?.trim() || join(process.cwd(), 'var', 'mira');
  private readonly salt = process.env.MIRA_LOG_SALT?.trim() || 'mira-ledger';
  /** One warning, not one per question. A disk that cannot be written to will
   *  not start working because we said so nine hundred times. */
  private complained = false;

  async onModuleInit(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true });
      this.logger.log(`questions → ${join(this.dir, 'asks-<day>.jsonl')}`);
      await this.prune();
    } catch (e) {
      this.logger.warn(`cannot open ${this.dir} — questions will not be recorded (${String(e)})`);
      this.complained = true;
    }
  }

  /** Fire and forget. Recording a question must never slow an answer down and
   *  must never be the reason one fails. */
  record(entry: LedgerEntry, at: Date = new Date()): void {
    void this.write(entry, at).catch((e) => {
      if (this.complained) return;
      this.complained = true;
      this.logger.warn(`could not record a question: ${String(e)}`);
    });
  }

  private async write(entry: LedgerEntry, at: Date): Promise<void> {
    const text = entry.text.length > MAX_TEXT ? `${entry.text.slice(0, MAX_TEXT)}…[cut]` : entry.text;
    const line = JSON.stringify({
      at: at.toISOString(),
      who: this.who(entry.userId),
      q: text,
      lane: entry.lane,
      confidence: Number(entry.confidence.toFixed(2)),
      capability: entry.capability ?? null,
      outcome: entry.outcome,
      /** Derived rather than passed, so the two can never disagree. It is here
       *  because counting is the first thing anybody does with this file. */
      answered: entry.outcome === 'capability',
      levity: entry.levity,
    });
    await appendFile(join(this.dir, `asks-${cityDay(at)}.jsonl`), `${line}\n`, 'utf8');
  }

  /** Stable across restarts, so counting distinct askers works; useless without
   *  the salt, so the file alone is not a directory of who asked what. */
  who(userId: string): string {
    return createHash('sha256').update(`${this.salt}:${userId}`).digest('hex').slice(0, 12);
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
