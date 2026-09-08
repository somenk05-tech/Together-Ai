#!/usr/bin/env bash
# fetch-product-shots.sh  ·  run from the REPO ROOT, on the Mac
#
# STEP ONE OF THE WHITE BACKDROPS (owner, 6 Sep: "clean all products to have
# a white backdrop"). Neither of my machines can reach the brands' CDNs, and
# yours can. This pulls every product photograph the data sheet names — 1,841
# of them, from cdn.shopify.com mostly — into together-city-react/_shots/src/,
# eight at a time. I measure each one's border afterwards and only the ones
# that are not already on white come over to me for the cutout. Nothing in
# the repo is touched: _shots/ is a scratch folder for this one job, and the
# land script that follows removes it.
#
# SECOND CUT. The first run piped id/url pairs through xargs, and every row's
# second URL is empty — xargs skips a blank line, so ids and URLs slid against
# each other and 608 files were saved under the wrong names. This one is Node
# end to end: one object per row, nothing to slide. It starts by clearing the
# mislabelled files.
#
# Run it, then tell me "shots fetched".
set -uo pipefail
cd "$(dirname "$0")"
[ -d .git ] || { echo "run me from the repo root"; exit 1; }
rm -rf together-city-react/_shots
mkdir -p together-city-react/_shots/src

node - <<'JS'
const fs = require('fs');
const rows = require('./together-city-chat/scripts/beauty-sheet-2026-08.json');
const OUT = 'together-city-react/_shots/src';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const failed = [];
let done = 0;

async function one(r) {
  for (const url of [r.image, r.imageAlt].filter(Boolean)) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/*,*/*' }, redirect: 'follow', signal: AbortSignal.timeout(40000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 2000) continue;
      const ct = res.headers.get('content-type') || '';
      const ext = /png/.test(ct) ? 'png' : /webp/.test(ct) ? 'webp' : /jpe?g/.test(ct) ? 'jpg' : 'bin';
      fs.writeFileSync(`${OUT}/${r.id}.${ext}`, buf);
      return true;
    } catch { /* next url */ }
  }
  failed.push(`${r.id}\t${r.image}`);
  return false;
}

(async () => {
  const queue = [...rows];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length) {
      const r = queue.shift();
      await one(r);
      done += 1;
      if (done % 100 === 0) process.stdout.write(`  ${done} / ${rows.length}\n`);
    }
  });
  await Promise.all(workers);
  fs.writeFileSync('together-city-react/_shots/failed.tsv', failed.join('\n') + (failed.length ? '\n' : ''));
  console.log(`fetched ${rows.length - failed.length} of ${rows.length} (${failed.length} could not be reached)`);
})();
JS
echo "done - now tell me: shots fetched"
