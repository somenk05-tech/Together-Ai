/**
 * Which Prisma queries touch a citizen-owned table without saying whose row it is.
 *
 * Every model carrying a `userId` column belongs to exactly one citizen, so any
 * query against one should name the owner. This walks the service layer and
 * reports the ones that do not.
 *
 * A hit is NOT automatically a bug. Most of the current ones are safe because
 * ownership was established a line earlier — a findFirst scoped by userId whose
 * id is then used, a credential looked up by its own hash, a catalogue read. The
 * point is that each is a decision somebody made, and the spec beside this file
 * freezes the reviewed set so a NEW one has to be justified rather than merely
 * merged.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SCHEMA = readFileSync(join(__dirname, '..', '..', 'prisma', 'schema.prisma'), 'utf8');

// Models carrying a direct userId column — anything read from these belongs to
// one citizen, so every query should say which.
const userOwned = new Set<string>();
for (const block of SCHEMA.split(/^model /m).slice(1)) {
  const name = block.split(/\s/)[0];
  const body = block.slice(0, block.indexOf('\n}'));
  if (/^\s*userId\s+String/m.test(body)) userOwned.add(name);
}
const camel = (s: string) => s[0].toLowerCase() + s.slice(1);
const byCamel = new Map([...userOwned].map((m) => [camel(m), m]));

const OPS = ['findUnique','findUniqueOrThrow','findFirst','findFirstOrThrow','findMany','update','updateMany','delete','deleteMany','upsert','count','aggregate','groupBy'];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === 'dist') continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) out.push(...files(f));
    else if (e.endsWith('.ts') && !e.endsWith('.spec.ts')) out.push(f);
  }
  return out;
}

/** Grab the balanced (...) argument that follows an index. */
function argAt(text: string, openParen: number): string {
  let depth = 0;
  for (let i = openParen; i < text.length && i < openParen + 4000; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') { depth--; if (depth === 0) return text.slice(openParen + 1, i); }
  }
  return text.slice(openParen + 1, openParen + 4000);
}

const SCOPE = /userId|ownerId|owner:|user:\s*\{|senderId|recipientId|currentUser|\buid\b/;

type Hit = { file: string; line: number; model: string; op: string; snippet: string };
const hits: Hit[] = [];
let scanned = 0;

for (const file of files(join(__dirname, '..'))) {
  const text = readFileSync(file, 'utf8');
  const re = new RegExp(`\\.(${[...byCamel.keys()].join('|')})\\s*\\n?\\s*\\.(${OPS.join('|')})\\s*\\(`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    scanned++;
    const arg = argAt(text, m.index + m[0].length - 1);
    if (SCOPE.test(arg)) continue;
    const line = text.slice(0, m.index).split('\n').length;
    hits.push({
      file: file.slice(file.indexOf('/src/') + 5),
      line,
      model: byCamel.get(m[1])!,
      op: m[2],
      snippet: arg.replace(/\s+/g, ' ').trim().slice(0, 110),
    });
  }
}


export type { Hit };

/** Every unscoped query, as stable "file model.op" signatures with counts. */
export function unscopedSignatures(): string[] {
  const tally = new Map<string, number>();
  for (const h of hits) {
    const k = `${h.file}  ${h.model}.${h.op}`;
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  return [...tally.entries()].map(([k, n]) => `${k} x${n}`).sort();
}

export function stats() {
  return { userOwnedModels: userOwned.size, queriesScanned: scanned, unscoped: hits.length };
}

export { hits };
