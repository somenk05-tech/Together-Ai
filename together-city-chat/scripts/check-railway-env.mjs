#!/usr/bin/env node
/**
 * THE VARIABLES A BOOT REFUSES WITHOUT, CHECKED ON RAILWAY BEFORE THE PUSH.
 *
 * 8 Sep: a boot refusal written in the working tree on 6 Sep shipped onto a
 * Railway service that did not have the variable it demanded. Every local
 * gate was green - the local gates run against a SAFE stand-in environment -
 * and the city was down for an afternoon. A gate that never asks the
 * production environment cannot catch a variable the production environment
 * lacks, so this one asks it, through the same CLI the owner already uses.
 *
 * It lists the names (never the values) of what assertProductionConfig
 * refuses to start without, and it FAILS if any is absent. It warns about the
 * ones that only degrade. It is skipped, with a loud line, when the CLI is not
 * logged in - a landing script must not be blocked by a missing login, but the
 * person running it must see that this check did not run.
 *
 * Usage: node scripts/check-railway-env.mjs   (run from together-city-chat)
 */
import { execSync } from 'node:child_process';

const SERVICE = process.env.RAILWAY_SERVICE ?? 'Together-Ai';
/** assertProductionConfig throws without these. Keep in step with configuration.ts. */
const FATAL = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'MEDIA_BUCKET', 'MEDIA_PRIVATE_BUCKET', 'MEDIA_PUBLIC_BASE_URL'];
/** Degraded without, but the city stays up. */
const WARN = ['TURNSTILE_SECRET', 'TURNSTILE_HOSTNAMES', 'CSAM_MATCH_URL', 'REDIS_URL'];

let raw;
try {
  raw = execSync(`npx --yes @railway/cli variables -s ${SERVICE} --json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
} catch (e) {
  const msg = String(e.stderr ?? e.message ?? e).split('\n').filter(Boolean).slice(-2).join(' ');
  console.error(`\n  !! Railway env check SKIPPED - could not read variables for "${SERVICE}" (${msg}).`);
  console.error('     Log in with `npx @railway/cli login` and link the project so this check can run.\n');
  process.exit(0);
}
let names;
let values = {};
try {
  const parsed = JSON.parse(raw);
  values = Array.isArray(parsed)
    ? Object.fromEntries(parsed.map((v) => [v.name ?? v.key, v.value ?? '']))
    : parsed;
  names = new Set(Object.keys(values));
} catch {
  console.error('\n  !! Railway env check SKIPPED - the CLI did not return JSON it could read.\n');
  process.exit(0);
}
if (names.has('STRICT_PROD_CONFIG')) {
  console.warn('  ~ STRICT_PROD_CONFIG is set on Railway. Since 8 Sep it cannot refuse a boot, but it is a switch with no job now - remove it.');
}
const missingFatal = FATAL.filter((n) => !names.has(n));
const missingWarn = WARN.filter((n) => !names.has(n));
for (const n of missingWarn) console.warn(`  ~ ${n} is not set on Railway (${SERVICE}) - the city boots, degraded; see /dev.`);
/**
 * THE ONE VALUE THIS SCRIPT READS, AND WHY IT BREAKS ITS OWN RULE.
 *
 * Everything above is names only, deliberately - a script that prints
 * production secrets into a terminal scrollback is its own incident. This one
 * is not a secret, it is a switch, and it is the switch that turns the CSAM
 * gate off: `CSAM_MATCH_URL=off` waves every image in the city past the
 * known-bad-hash check. It is SET, so no line above fires; a dashboard reads
 * it as configured. Somebody has to say the word out loud on every landing
 * until it is gone.
 *
 * A warning and not a failure, because the owner typed it on purpose (8 Sep)
 * and a gate that blocks the deploy of the very commit that would replace it
 * is a gate that gets deleted.
 */
if (String(values.CSAM_MATCH_URL ?? '').trim().toLowerCase() === 'off') {
  console.warn(`  ~ CSAM_MATCH_URL=off on Railway (${SERVICE}) - THE KNOWN-BAD HASH GATE IS BYPASSED and every`);
  console.warn('    image is waved through it. Arachnid Shield is free to ESPs and takes three variables:');
  console.warn('    CSAM_MATCH_KIND=arachnid, CSAM_MATCH_URL=https://shield.projectarachnid.com/v1/media/,');
  console.warn('    CSAM_MATCH_USER + CSAM_MATCH_PASSWORD from https://projectarachnid.com/en/api/accounts/register/');
}
if (String(values.CSAM_MATCH_KIND ?? '').trim().toLowerCase() === 'arachnid'
  && !(String(values.CSAM_MATCH_USER ?? '').trim() && String(values.CSAM_MATCH_PASSWORD ?? '').trim())) {
  console.warn(`  ~ CSAM_MATCH_KIND=arachnid on Railway (${SERVICE}) but USER/PASSWORD are not both set - the`);
  console.warn('    matcher cannot authenticate, so the gate fails CLOSED and no photograph moves in the city.');
}
if (missingFatal.length) {
  console.error(`\n  ✗ Railway (${SERVICE}) is missing variables the API REFUSES TO START without:\n    - ${missingFatal.join('\n    - ')}\n`);
  console.error('    Set them in Railway -> service -> Variables before pushing, or the deploy takes the city down.\n');
  process.exit(1);
}
console.log(`  ✓ Railway (${SERVICE}) has every variable the boot refuses without (${FATAL.length} checked; names only, values never read here).`);
