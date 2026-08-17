#!/usr/bin/env node
/**
 * ── THE EXERCISE CATALOGUE, GENERATED ───────────────────────────────────────
 *
 * Reads a local clone of https://github.com/hasaneyldrm/exercises-dataset and
 * writes `src/fitness/exercise-catalog.ts`: 1,324 movements with what they work,
 * what they need, and — the reason this exists — how to actually do them.
 *
 *   node scripts/gen-exercise-catalog.mjs --src ../exercises-dataset
 *
 * WHY A GENERATOR AND A COMMITTED FILE, rather than reading the JSON at boot.
 * Same answer as `gen-beauty-catalog.mjs` one folder over: the server must not
 * depend on a 17 MB file that is not in this repository, and a catalogue that
 * can change without a diff is a catalogue nobody can review. The generated
 * file is checked in and read as ordinary TypeScript; this script is how it is
 * regenerated when the dataset moves, and the diff is what gets reviewed.
 *
 * ENGLISH ONLY, DELIBERATELY. The dataset carries ten languages and the app
 * speaks one; the other nine are 7 MB of text nothing reads. When Together City
 * has a second language this script grows a flag, not a second catalogue.
 *
 * THE MEDIA IS NOT COPIED AND MUST NOT BE. Every GIF and thumbnail is
 * © Gym visual, redistributed in that repository under a permission granted to
 * ITS owner — "cloning this repo is not a license", in the NOTICE's own words.
 * So this writes a MEDIA ID and nothing else, the URLs are built against a
 * pinned commit on a CDN, and `ATTRIBUTION` travels with every row so no
 * surface can render a picture without the line the terms require. The 180×180
 * limit is the dataset's own resolution — there is nothing larger to ask for.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const src = arg('src', join(HERE, '..', '..', 'exercises-dataset'));
const out = join(HERE, '..', 'src', 'fitness', 'exercise-catalog.ts');
/** The commit the media URLs point at. A moving `main` is a picture that can
 *  change under a page nobody redeployed. */
const PIN = arg('pin', '7455efae41b330c265e7cd4b78dfa848e7ce5ebd');

const raw = JSON.parse(readFileSync(join(src, 'data', 'exercises.json'), 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.exercises;
if (!Array.isArray(rows) || rows.length === 0) throw new Error('no exercises in the dataset');

const q = (s) => JSON.stringify(String(s));
const list = (xs) => `[${xs.map(q).join(',')}]`;

const seen = new Set();
const out_rows = [];
for (const e of rows) {
  const steps = (e.instruction_steps?.en ?? []).map((s) => s.trim()).filter(Boolean);
  // A movement with no instructions is a name, and a name is what this
  // catalogue exists to replace. Dropped rather than shipped half-useful.
  if (!steps.length) continue;
  if (seen.has(e.id)) continue;
  seen.add(e.id);
  // "0001-2gPfomN.jpg" → the id is already on the row, so only the hash is kept.
  const media = String(e.media_id ?? '').trim();
  out_rows.push(
    `{id:${q(e.id)},name:${q(e.name)},bodyPart:${q(e.body_part ?? e.category)},`
    + `target:${q(e.target)},secondary:${list((e.secondary_muscles ?? []).filter(Boolean))},`
    + `equipment:${q(e.equipment)},media:${q(media)},steps:${list(steps)}}`,
  );
}

const file = `/* eslint-disable */
/**
 * GENERATED — do not edit. \`node scripts/gen-exercise-catalog.mjs --src <clone>\`.
 *
 * ${out_rows.length} movements from hasaneyldrm/exercises-dataset (MIT), English
 * instructions only. See the generator's header for why the media is a bare id
 * rather than a file, and why the attribution below is not optional.
 *
 * Source pinned at ${PIN}.
 */

/** One movement as the dataset describes it. Vocabulary is the DATASET'S —
 *  'upper legs', 'body weight', 'leverage machine' — and is translated into the
 *  library's own words in exercise-classify.ts, at the one boundary. */
export interface CatalogExercise {
  id: string;
  name: string;
  /** 'chest' · 'upper legs' · 'waist' · 'cardio' — ten of them. */
  bodyPart: string;
  /** The one muscle it is for: 'pectorals', 'quads', 'abs'. */
  target: string;
  /** What else works. Often empty. */
  secondary: string[];
  /** Dataset vocabulary: 'body weight', 'dumbbell', 'leverage machine'… */
  equipment: string;
  /** The hash half of the media filename, or '' where the dataset had none. */
  media: string;
  /** How it is done, in order. This is the whole point of the file. */
  steps: string[];
}

/**
 * THE LINE THAT HAS TO BE ON SCREEN WHEREVER A PICTURE IS.
 *
 * The images and animations are © Gym visual and are used under their terms,
 * which require the attribution to travel with the media and the resolution to
 * stay at 180×180. It is exported as a constant rather than typed into each
 * page so it cannot be forgotten on the fourth surface.
 */
export const EXERCISE_MEDIA_ATTRIBUTION = '© Gym visual — gymvisual.com';

/** The pinned CDN the pictures are served from. Nothing is copied into this
 *  repository; see the generator's header. */
const MEDIA_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${PIN}';

/** The 180×180 still. '' when the row carried no media. */
export const exerciseThumbUrl = (e: { id: string; media: string }): string =>
  (e.media ? \`\${MEDIA_BASE}/images/\${e.id}-\${e.media}.jpg\` : '');

/** The animation. Same resolution, same terms. */
export const exerciseGifUrl = (e: { id: string; media: string }): string =>
  (e.media ? \`\${MEDIA_BASE}/videos/\${e.id}-\${e.media}.gif\` : '');

export const EXERCISE_CATALOG: CatalogExercise[] = [
${out_rows.join(',\n')}
];

const BY_ID = new Map(EXERCISE_CATALOG.map((e) => [e.id, e]));
export const catalogById = (id: string): CatalogExercise | undefined => BY_ID.get(id);
`;

writeFileSync(out, file);
console.log(`${out_rows.length} movements → ${out}`);
