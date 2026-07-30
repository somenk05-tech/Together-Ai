import { PURGE_RULES, type PurgeRule } from './purge-plan';

/**
 * What a citizen gets when they ask for their data (BE-16.1).
 *
 * The ticket lists "export and delete-my-data endpoints" together, and that is
 * the right pairing — they are the same question asked twice. Delete says "get
 * rid of what is mine"; export says "give me what is mine". Anything the app is
 * willing to destroy on request is, by definition, the citizen's.
 *
 * SO THE EXPORT IS DERIVED FROM THE PURGE PLAN rather than written beside it.
 *
 * That is the whole design. Two hand-kept lists of "everything personal in this
 * app" would drift the first time somebody adds a hub — and the drift is silent
 * in both directions. A model missing from the purge list outlives a deletion
 * request; a model missing from the export list is quietly withheld from
 * somebody exercising a right to it. One list, two uses, and a guard that says
 * so.
 *
 * `keep` rows are deliberately excluded and that is not a loophole. They are
 * kept because OTHER people can see them — a message in a group conversation,
 * a comment under somebody else's post. Exporting those would hand one citizen
 * a copy of a conversation that is not only theirs.
 */

export interface ExportSection {
  /** Prisma model name, as in schema.prisma. */
  model: string;
  /** The column tying a row to this citizen. */
  by: PurgeRule['by'];
  /** Extra WHERE clause where only some rows are personal. */
  filter?: Record<string, unknown>;
  /** Why this is in the export — the same sentence that justifies purging it. */
  reason: string;
}

/**
 * Every model the app would destroy on request, and therefore every model it
 * must be willing to hand over.
 */
export function exportPlan(rules: readonly PurgeRule[] = PURGE_RULES): ExportSection[] {
  return rules
    .filter((r) => r.action === 'purge')
    .map((r) => ({
      model: r.model, by: r.by, reason: r.reason,
      ...(r.filter ? { filter: r.filter } : {}),
    }));
}

/**
 * Columns never included, whatever table they turn up in.
 *
 * A password hash is not useful to the person it belongs to and is dangerous in
 * a file that will sit in a downloads folder, get emailed to a laptop, or be
 * handed to a support agent. Same for anything that would let the file be
 * replayed as the citizen: session tokens, verification codes, storage keys
 * that grant access rather than describe it.
 *
 * Stripping happens by NAME rather than by table, so a column that reappears in
 * a new model is covered without anybody remembering to add it here again.
 */
export const NEVER_EXPORT = [
  'passwordHash', 'password', 'refreshTokenHash', 'tokenHash', 'codeHash',
  'sessionToken', 'resetToken', 'otpHash', 'secret', 'apiKey',
];

const NEVER = new Set(NEVER_EXPORT.map((c) => c.toLowerCase()));

/** Drop the columns above from one row. */
export function scrubRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (NEVER.has(k.toLowerCase())) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return out;
}

export interface ExportManifest {
  /** ISO instant the export was produced. */
  generatedAt: string;
  /** What is in it, and what is deliberately not. */
  about: string;
  sections: Array<{ model: string; rows: number; reason: string }>;
  omitted: string;
}

/**
 * The note that travels with the file.
 *
 * An export without one is a pile of JSON: a citizen cannot tell whether
 * something is missing because they never had it, or because the app did not
 * give it to them. Saying what was excluded, and why, is the difference between
 * a data export and a data dump.
 */
export function manifest(sections: Array<{ model: string; rows: number; reason: string }>, generatedAt: string): ExportManifest {
  return {
    generatedAt,
    about: 'Everything Together City holds that belongs only to you. It is built from the same list '
      + 'that decides what gets destroyed when you delete your account, so the two cannot disagree.',
    sections,
    omitted: 'Two things are deliberately left out. Anything other people can also see — your messages '
      + 'inside a shared conversation, your comments under someone else’s post — because a copy of those '
      + 'is a copy of somebody else’s data too. And credentials: password hashes, session tokens and '
      + 'verification codes, which are no use to you and a risk in a file you will keep.',
  };
}
