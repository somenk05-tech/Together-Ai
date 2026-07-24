/**
 * Phase-3 load test for the Nutrition Hub (run against a STAGING deploy, never
 * blindly against prod). Measures p50/p95/p99 latency and error rate under
 * concurrent load for the hottest read endpoints.
 *
 * Usage:
 *   BASE_URL=https://staging.example TOKEN=<jwt> CONN=150 DURATION=30 \
 *     node scripts/load-test.mjs
 *
 * Requires: npm i -D autocannon   (kept out of prod deps).
 * Notes:
 *  - Warm the composite pool first with a single GET /nutrition/plan/composed
 *    before measuring, so you benchmark steady state, not the cold-boot build.
 *  - CONN defaults to 150 (the target concurrency). Watch Railway CPU/memory and
 *    DB connection count while this runs.
 */
import autocannon from 'autocannon';

const BASE = process.env.BASE_URL;
const TOKEN = process.env.TOKEN;
if (!BASE || !TOKEN) { console.error('Set BASE_URL and TOKEN'); process.exit(1); }
const CONN = Number(process.env.CONN || 150);
const DURATION = Number(process.env.DURATION || 30);
const headers = { authorization: `Bearer ${TOKEN}` };

async function warm() {
  await fetch(`${BASE}/nutrition/plan/composed`, { headers }).catch(() => {});
}
function run(path) {
  return new Promise((resolve) => {
    autocannon({ url: `${BASE}${path}`, connections: CONN, duration: DURATION, headers }, (err, res) => {
      if (err) { console.error(path, err); return resolve(); }
      console.log(`\n${path}`);
      console.log(`  req/sec avg ${res.requests.average}  |  non-2xx ${res.non2xx}  errors ${res.errors}`);
      console.log(`  latency p50 ${res.latency.p50}ms  p95 ${res.latency.p97_5}ms  p99 ${res.latency.p99}ms  max ${res.latency.max}ms`);
      resolve();
    });
  });
}
await warm();
for (const p of ['/nutrition/plan/composed', '/nutrition/recipes/library?cuisine=India&page=1', '/nutrition/grocery/plan']) await run(p);
console.log('\nGate: p95 < 1500ms and error rate 0 under 150 concurrent.');
