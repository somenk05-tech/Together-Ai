import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Nothing on a screen tells a citizen to do something only we can do.
 *
 * "Start the backend and reload." was the hint on twenty-two error states —
 * Wallet, Transactions, Spending, Budgets, Mail, Chats, Consent, Family Health,
 * Trips, Orders, Reservations. Every one of those screens HANDLED its failure
 * correctly, which is why none of them appeared in the failure-states ratchet.
 * They knew the request had failed. They then told the person holding the phone
 * to start a server.
 *
 * It is the same species as the dashboard's "🚧 On the migration backlog — this
 * page follows the Nutrition reference vertical pattern", which §4 removed: an
 * engineering note left on a citizen's screen because the person writing it was
 * looking at a terminal at the time and the sentence was true for them.
 *
 * The money screens are the reason this is more than untidy. Somebody who opens
 * their wallet and cannot see their balance is already asking one question, and
 * "start the backend" answers a different one — it sounds like they have broken
 * something, and it says nothing at all about whether their money is still
 * there. The replacement copy leads with what is still true, per screen.
 *
 * The list below is not exhaustive and does not need to be. It is the phrases
 * that have actually appeared here plus the obvious neighbours, and it exists so
 * the twenty-third one is caught at the gate rather than in production.
 */
const DEVELOPER_INSTRUCTIONS = [
  /start the backend/i,
  /backend (is )?(not )?(running|down|up)/i,
  /run the server/i,
  /npm (run|start|install)/i,
  /yarn (run|start)/i,
  /localhost/i,
  /dev(elopment)? server/i,
  /check the (browser )?console/i,
  /open dev ?tools/i,
  /migration backlog/i,
  /reference vertical/i,
];

const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(p) && !/\.(test|spec)\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

describe('what a screen may say to a citizen', () => {
  it('never gives an instruction only a developer could follow', () => {
    const offenders: string[] = [];

    for (const p of walk(src)) {
      // Comments are stripped first. The third time a text check in this repo
      // was tripped by the prose explaining the rule it enforces was the
      // clearance-language guard flagging its own header; this one is written
      // knowing that.
      stripComments(readFileSync(p, 'utf8')).split('\n').forEach((line, i) => {
        for (const rx of DEVELOPER_INSTRUCTIONS) {
          if (rx.test(line)) {
            offenders.push(`${relative(src, p).split('\\').join('/')}:${i + 1}  ${line.trim().slice(0, 110)}`);
            break;
          }
        }
      });
    }

    expect(offenders, [
      '',
      'These tell a citizen to do something only we can do. They are reading this',
      'on a phone; there is no terminal, and the sentence reads as "you have broken',
      'something" while answering none of what they actually want to know.',
      '',
      'Say what is still true instead — their money has not moved, nothing has been',
      'deleted, nothing has been granted or revoked — and then that it did not reach',
      'us and is worth another try.',
      '',
    ].join('\n')).toEqual([]);
  });
});
