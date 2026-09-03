import { readFileSync } from 'fs';
import { join } from 'path';
import {
  ROLES, ALL_ROLES, ALL_PERMISSIONS, PERMISSIONS, MUST_AUDIT,
  can, permissionsFor, isAdminRole,
} from './permissions';

/**
 * THE TWO RULES THAT CANNOT BE ADDED LATER.
 *
 * A console is built a screen at a time, and that is fine. Permissions and
 * auditing are not: retrofitting either means revisiting every action already
 * written, and the one that gets missed is the one nobody finds until it
 * matters. So they ship before the first screen, and this file is what stops
 * them eroding as screens arrive.
 */
describe('who may do what', () => {
  it('gives every permission a sentence a person can read', () => {
    // A permission key with no description ends up in a role-picker as
    // "finance.act" and gets granted by someone guessing.
    const blank = ALL_PERMISSIONS.filter((p) => !PERMISSIONS[p] || PERMISSIONS[p].length < 8);
    expect(blank).toEqual([]);
  });

  it('has no wildcard, and no role that holds everything by construction', () => {
    // Founder holds every key because every key is LISTED, so removing one
    // shows up in a diff. A `*` is a role nobody can reason about.
    const src = readFileSync(join(__dirname, 'permissions.ts'), 'utf8');
    expect(src).not.toMatch(/['"]\*['"]/);
    expect(ROLES.founder.length).toBe(ALL_PERMISSIONS.length);
  });

  it('never lets a lesser role hold something superadmin does not', () => {
    // The moment one exists, the org chart and the permission table disagree,
    // and the table is the one that runs.
    const top = new Set<string>([...ROLES.founder]);
    for (const r of ALL_ROLES) {
      const extra = (ROLES[r] as readonly string[]).filter((p) => !top.has(p));
      expect(extra).toEqual([]);
    }
  });

  it('keeps the destructive keys away from the everyday roles', () => {
    // Support answers questions. Marketing writes copy. Neither should be one
    // misclick from deleting an account or moving money.
    for (const r of ['support', 'marketing', 'moderator', 'business_success'] as const) {
      expect(can([r], 'users.delete')).toBe(false);
      expect(can([r], 'finance.act')).toBe(false);
      expect(can([r], 'admin.grant')).toBe(false);
    }
  });

  it('lets only the top two roles grant a role', () => {
    // Escalation paths are how a support account becomes a finance account on
    // a Friday afternoon.
    const granters = ALL_ROLES.filter((r) => can([r], 'admin.grant')).sort();
    expect(granters).toEqual(['founder', 'superadmin']);
  });

  it('withholds account deletion from everybody but the founder', () => {
    const deleters = ALL_ROLES.filter((r) => can([r], 'users.delete'));
    expect(deleters).toEqual(['founder']);
  });

  it('adds up several roles rather than picking one', () => {
    // People hold more than one job. Taking the highest role and ignoring the
    // rest silently removes access somebody was given.
    const both = permissionsFor(['support', 'finance']);
    expect(both.has('support.reply')).toBe(true);
    expect(both.has('finance.read')).toBe(true);
  });

  it('ignores a role that is not a role, rather than trusting it', () => {
    expect(isAdminRole('wizard')).toBe(false);
    expect(permissionsFor(['wizard']).size).toBe(0);
  });
});

describe('nothing happens silently', () => {
  /**
   * Comments explain intent; they are not behaviour. This file matches on the
   * CODE, or a note saying "never read the role from a JWT" would itself fail
   * the test that forbids reading the role from a JWT.
   */
  const stripComments = (s: string): string =>
    s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const src = stripComments(readFileSync(join(__dirname, 'admin-access.service.ts'), 'utf8'));

  it('names every changing permission in the must-audit list', () => {
    // A permission that changes something and is not on this list is an action
    // that can happen with no record, which is the one thing the rule forbids.
    const changing = ALL_PERMISSIONS.filter((p) =>
      /\.(suspend|delete|approve|feature|act|flags|send|grant|reply|assign)$/.test(p) || p === 'cms.write');
    const missing = changing.filter((p) => !MUST_AUDIT.includes(p));
    expect(missing).toEqual([]);
  });

  it('audits no read, because a log of who looked at whom is its own hazard', () => {
    const reads = MUST_AUDIT.filter((p) => p.endsWith('.read') || p === 'ops.health');
    expect(reads).toEqual([]);
  });

  it('refuses an action with no reason', () => {
    expect(src).toMatch(/needs a reason/);
  });

  it('writes the record BEFORE the change, not after', () => {
    // An audit entry for something that then failed is a question somebody can
    // answer. A change nobody logged is not.
    const act = src.slice(src.indexOf('async act<T>'));
    expect(act.indexOf('this.record(')).toBeLessThan(act.indexOf('return run()'));
  });

  it('reads roles from the grants table, never from a token', () => {
    // A JWT is issued once and lives for its lifetime, so a role revoked at
    // two o'clock would keep working until the token expired.
    expect(src).toMatch(/adminGrant\.findMany/);
    expect(src).toMatch(/revokedAt: null/);
    expect(src).not.toMatch(/jwt|token|claims/i);
  });

  /**
   * ── AND THE LIST IS CHECKED AGAINST THE CALL SITES (this audit) ────────────
   *
   * The two assertions above check that the right KEYS are on MUST_AUDIT. That
   * is what permissions.ts promises — "admin.spec.ts fails on a handler that
   * declares one and does not record" — and it is not what this file did: it
   * inspected the array and never a handler. So `moderation.act` sat correctly
   * on the list while three of the four report verdicts wrote straight to
   * Prisma. A moderator could hard-delete any comment in the city and dismiss
   * every open report with nothing at all in `GET /admin/audit`, and the
   * evidence went with the comment.
   *
   * The rule this checks is narrow on purpose, so it stays true rather than
   * becoming a thing people route around: a method that ASSERTS a must-audit
   * permission, or names one as the `need` of an action, has to call `act` or
   * `record` in the same method. It cannot see a branch inside an audited
   * method that skips the record — that is what the behavioural specs beside
   * each surface are for — but it does catch the whole shape of this defect:
   * a new call site that asks for the permission and then writes.
   */
  const SURFACES = ['social/social.service.ts', 'dating/dating.service.ts', 'realestate/realestate.service.ts'];
  /* A method named `assert…` is the CHECK and not the action: it exists to be
     called by the handler that then records, and `assertModerator` hands its
     caller the id precisely so the caller can. Named here so the next one is a
     deliberate addition rather than a hole nobody noticed. */
  const CHECKERS = ['assertModerator'];
  const NOT_A_METHOD = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'constructor']);

  it('records in every handler that asks for a must-audit permission', () => {
    const escaped = MUST_AUDIT.map((p) => p.replace('.', '\\.')).join('|');
    const asks = new RegExp(`(this\\.access\\.assert\\([^)]*'(?:${escaped})'|need: '(?:${escaped})')`);
    const missing: string[] = [];

    for (const file of SURFACES) {
      const code = stripComments(readFileSync(join(__dirname, '..', file), 'utf8'));
      const starts = [...code.matchAll(/\n {2}(?:private |protected |public )?(?:static )?(?:async )?([a-zA-Z_$][\w$]*)\s*\(/g)]
        .filter((m) => !NOT_A_METHOD.has(m[1]));
      for (let i = 0; i < starts.length; i++) {
        const name = starts[i][1];
        if (CHECKERS.includes(name)) continue;
        const body = code.slice(starts[i].index ?? 0, i + 1 < starts.length ? starts[i + 1].index : code.length);
        if (!asks.test(body)) continue;
        if (/this\.access\.(act|record)\(/.test(body)) continue;
        missing.push(`${file}#${name}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names the permission when it refuses, not the role', () => {
    // "You need finance.act" tells somebody what to ask for. "You are not an
    // admin" invites them to ask for everything.
    expect(src).toMatch(/needs the ".{0,3}\$\{need\}/);
  });
});
