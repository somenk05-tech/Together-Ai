#!/usr/bin/env node
/**
 * The accessibility pass, held to a ceiling instead of done once (FE-16.2).
 *
 * The ticket asks for "44px targets, focus order, labels on every input,
 * contrast, screen-reader names for icon buttons". A sweep would fix those
 * today and they would come back next month, because nothing would be watching.
 * Same shape as lint-ceiling.mjs and nav-audit.mjs: a number nobody may quietly
 * grow.
 *
 * Three checks, chosen because they are the ones a source scan can be RIGHT
 * about. Contrast and focus order are not here — judging those from source
 * would produce confident nonsense, and a guard people stop believing is worse
 * than no guard.
 *
 *   1. An icon-only button with no accessible name. To a screen reader it is
 *      "button", and there is no way to find out what it does short of pressing
 *      it. This is the one that most affects whether the app is usable at all.
 *   2. A form control with no label of any kind. Same problem, and it also
 *      breaks the tap-the-label-to-focus behaviour everybody uses without
 *      noticing.
 *   3. A tap target explicitly sized below 44px. Only flagged where the source
 *      states a height — an unstyled button is not a finding, it is unknown.
 *
 * A note on why this file is longer than a pile of regexes would be. The first
 * version WAS a pile of regexes and it reported 145 findings, most of them
 * wrong: `[^>]*` for a tag's attributes stops at the first `>`, which in JSX is
 * usually the arrow of `onChange={(e) => …}`, so half of every tag went unread
 * and inputs that plainly had a placeholder were reported as unlabelled. It
 * also treated `accept="image/*"` as the start of a block comment and ate the
 * rest of the file. So: a real scanner that understands braces and quotes, and
 * a rule that anything dynamic is UNKNOWN rather than a finding. A guard that
 * cries wolf gets an exemption comment and then gets deleted.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', 'src');
const ceilingFile = join(here, 'a11y-ceiling.json');

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir).sort()) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(p)) files.push(p);
  }
})(root);

/**
 * Blank out comments while keeping every newline, so line numbers stay true.
 * Only block comments that begin a line — `accept="image/*"` is not a comment.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (s) =>
  s.replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, blank).replace(/^[ \t]*\/\/.*$/gm, blank);

/**
 * Walk from the `<` of an open tag to its closing `>`, honouring quotes,
 * template literals and `{}` nesting. Returns the attribute text and the index
 * just past the `>`, or null if the tag never closes (never happens in valid
 * source, but a scanner that can loop forever is not a scanner).
 */
function readTag(src, start) {
  let i = src.indexOf(' ', start);
  const nameEnd = /[\s/>]/.exec(src.slice(start + 1));
  i = start + 1 + (nameEnd ? nameEnd.index : 0);
  const from = i;
  let depth = 0;
  let quote = null;
  for (; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') { i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') { depth++; continue; }
    if (c === '}') { depth--; continue; }
    if (c === '>' && depth === 0) return { attrs: src.slice(from, i), end: i + 1 };
  }
  return null;
}

/** Pull `style={{ … }}` out of an attribute string with brace matching. */
function styleObject(attrs) {
  const at = attrs.indexOf('style={{');
  if (at < 0) return null;
  let depth = 0;
  for (let i = at + 6; i < attrs.length; i++) {
    if (attrs[i] === '{') depth++;
    else if (attrs[i] === '}') { depth--; if (depth === 0) return attrs.slice(at + 7, i); }
  }
  return null;
}

const lineOf = (src, index) => src.slice(0, index).split('\n').length;

const findings = [];
const add = (file, line, kind, text) =>
  findings.push({ file, line, kind, snippet: (text ?? '').trim().slice(0, 100) });

for (const path of files) {
  const file = relative(root, path);
  const src = strip(readFileSync(path, 'utf8'));
  const lines = src.split('\n');
  const raw = readFileSync(path, 'utf8').split('\n');
  const at = (line) => raw[line - 1] ?? '';

  // ── 1. icon-only buttons ────────────────────────────────────────────
  for (let i = src.indexOf('<button'); i >= 0; i = src.indexOf('<button', i + 1)) {
    const tag = readTag(src, i);
    if (!tag) continue;
    if (/aria-label|aria-labelledby|title=/.test(tag.attrs)) continue;
    if (/\/$/.test(tag.attrs.trim())) continue;               // self-closing: no body to judge
    const close = src.indexOf('</button>', tag.end);
    if (close < 0) continue;
    const body = src.slice(tag.end, close);
    // Anything dynamic is UNKNOWN, not a finding: `{busy ? 'Saving…' : 'Save'}`
    // is a perfectly good accessible name and no scanner can tell it from an
    // icon component. Only literal, visible-text-free bodies are reported.
    if (body.includes('{')) continue;
    const text = body
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[a-z]+;|&#\d+;/gi, ' ')
      .replace(/[\p{Extended_Pictographic}\p{So}\p{Sk}\p{Sm}\p{Pd}\u2000-\u2BFF]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 0) continue;
    add(file, lineOf(src, i), 'icon-button-no-name', at(lineOf(src, i)));
  }

  // ── 2. unlabelled form controls ─────────────────────────────────────
  const hasHtmlFor = /htmlFor=/.test(src);
  for (const tagName of ['input', 'select', 'textarea']) {
    const open = `<${tagName}`;
    for (let i = src.indexOf(open); i >= 0; i = src.indexOf(open, i + 1)) {
      if (/[A-Za-z]/.test(src[i + open.length] ?? '')) continue;   // <inputSomething>
      const tag = readTag(src, i);
      if (!tag) continue;
      const a = tag.attrs;
      if (/aria-label|aria-labelledby|placeholder=/.test(a)) continue;
      if (/type=["']hidden["']/.test(a)) continue;
      // A visually hidden file picker driven by a visible button is not a
      // finding: the button carries the name, the input is never reached.
      if (/(^|\s)hidden(\s|$|=)/.test(a)) continue;
      if (/display:\s*['"]none['"]/.test(a)) continue;
      if (hasHtmlFor && /\bid=/.test(a)) continue;
      // Wrapped by a <label> that is still open at this point in the file.
      const before = src.slice(0, i);
      if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) continue;
      const line = lineOf(src, i);
      add(file, line, `${tagName}-no-label`, at(line));
    }
  }

  // ── 3. tap targets stated below 44px ────────────────────────────────
  for (const tagName of ['button', 'a']) {
    const open = `<${tagName}`;
    for (let i = src.indexOf(open); i >= 0; i = src.indexOf(open, i + 1)) {
      if (/[A-Za-z]/.test(src[i + open.length] ?? '')) continue;
      const tag = readTag(src, i);
      if (!tag) continue;
      const style = styleObject(tag.attrs);
      if (!style) continue;
      const h = /(?:^|[,{\s])(?:minHeight|height):\s*(\d+)/.exec(style);
      if (!h || Number(h[1]) >= 44) continue;
      // A control in a dense row may legitimately be short when it is wide;
      // only flag targets that are small in BOTH axes.
      const w = /(?:^|[,{\s])(?:minWidth|width):\s*(\d+)/.exec(style);
      if (w && Number(w[1]) >= 44) continue;
      const line = lineOf(src, i);
      add(file, line, 'tap-target-under-44', at(line));
    }
  }
  void lines;
}

const byKind = {};
for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
const total = findings.length;

const ceiling = JSON.parse(readFileSync(ceilingFile, 'utf8'));

if (process.argv.includes('--list')) {
  for (const f of findings.slice().sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
    console.log(`${f.file}:${f.line}  ${f.kind}  ${f.snippet}`);
  }
  console.log('');
}

if (total > ceiling.total) {
  console.error(`\nAccessibility findings went UP: ${total}, ceiling is ${ceiling.total}.`);
  console.error('Fix what this change introduced — the backlog is not your problem, but adding to it is.\n');
  console.error('By kind:', byKind);
  console.error('\nRun `node scripts/a11y-audit.mjs --list` to see them.\n');
  process.exit(1);
}

if (total < ceiling.total) {
  writeFileSync(ceilingFile, `${JSON.stringify({ total, byKind }, null, 2)}\n`);
  console.log(`Accessibility findings: ${total} (was ${ceiling.total}). Ceiling lowered — commit scripts/a11y-ceiling.json.`);
} else {
  console.log(`Accessibility findings: ${total}, at the ceiling. No worse than before.`);
}
