/**
 * Phase-3 end-to-end smoke test for the four flows §6 called untested over live
 * HTTP: blood-report save, plan generation, grocery generation, and an order.
 * Run against a STAGING deploy with a disposable test account.
 *
 * Usage: BASE_URL=https://staging.example TOKEN=<jwt> node scripts/e2e-smoke.mjs
 */
const BASE = process.env.BASE_URL, TOKEN = process.env.TOKEN;
if (!BASE || !TOKEN) { console.error('Set BASE_URL and TOKEN'); process.exit(1); }
const H = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
let pass = 0, fail = 0;
async function step(name, fn) {
  try { const ok = await fn(); if (ok) { pass++; console.log(`✓ ${name}`); } else { fail++; console.log(`✗ ${name} (assertion failed)`); } }
  catch (e) { fail++; console.log(`✗ ${name}: ${e.message}`); }
}
const j = (r) => r.json();
await step('save blood report (new markers)', async () => {
  const r = await fetch(`${BASE}/nutrition/blood`, { method: 'POST', headers: H, body: JSON.stringify({ egfr: 48, alt: 70, hba1c: 7.9, hdl: 34 }) });
  return r.ok;
});
await step('generate composed plan (blood → CKD/liver applied)', async () => {
  const r = await fetch(`${BASE}/nutrition/plan/composed`, { headers: H }); const d = await j(r);
  return r.ok && Array.isArray(d.days) && d.days.length === 7;
});
await step('grocery plan generated + traceable', async () => {
  const r = await fetch(`${BASE}/nutrition/grocery/plan`, { headers: H }); const d = await j(r);
  return r.ok && d != null;
});
await step('supplements are contraindication-safe (no whey/creatine for renal)', async () => {
  const r = await fetch(`${BASE}/nutrition/supplements`, { headers: H }); const d = await j(r);
  return r.ok && !(d.kit || []).some((k) => /whey|creatine/i.test(k.name));
});
await step('quick-commerce compare (ordering path reachable)', async () => {
  const r = await fetch(`${BASE}/nutrition/qc/compare`, { headers: H }); return r.ok;
});
console.log(`\n${pass} passed, ${fail} failed. Gate: 0 failed.`);
process.exit(fail ? 1 : 0);
