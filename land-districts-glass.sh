#!/bin/bash
# land-districts-glass.sh — one line, one button, no panel, no crop (9 Aug 2026).
# Owner's references (NASA / SpaceX cards): the photograph runs edge to edge, a
# blur rises from its foot and fades to nothing, one line of copy sits on it,
# and beside the line one solid near-black button. Master copy replaces the
# config tags on the billboards. Built and verified against the NEW hub art
# (commit "New hub art", ~1.9:1). Desktop untouched.
# Supersedes land-districts-phone.sh (stubbed).
set -euo pipefail
cd "$(dirname "$0")"

DIRTY=$(git status --porcelain | grep -v '^??' || true)
if [ -n "$DIRTY" ]; then echo "Tree is dirty beyond this script's files:"; echo "$DIRTY"; exit 1; fi

MARK="The districts wear glass"
LOG=$(git log --oneline -60)
case "$LOG" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
def patch(path, old, new, must=1):
    s = open(path, encoding='utf-8').read()
    n = s.count(old)
    assert n == must, f"ANCHOR MISSING x{n}: {path}: {old[:70]!r}"
    open(path, 'w', encoding='utf-8').write(s.replace(old, new))
    print("patched", path)

R = 'together-city-react/src/'

patch(R+'pages/Home.tsx',
  "interface Panel { key: HubKey | 'ecommerce'; img: string; }",
  '/**\n * THE DISTRICTS\' OWN VOICE (owner\'s master list, 9 Aug 2026).\n *\n * One noun and one sentence per district — "TRAVEL / Your world, planned your\n * way." The hub configs keep their own tags for the rooms inside; this is the\n * street-level copy the billboards wear, and it lives here rather than in\n * hubs.ts so a hub\'s interior label and its billboard line can differ without\n * either pretending to be the other.\n *\n * Local Services is absent DELIBERATELY: the master list names CARS, and this\n * city has no cars hub — /cars redirects into Local Services. A plate that\n * announced a room the app does not have would be the one thing the golden\n * rule forbids, so Services keeps its config copy until it is given a line.\n */\nconst DISTRICT_COPY: Partial<Record<HubKey | \'ecommerce\', { name: string; line: string }>> = {\n  travel: { name: \'Travel\', line: \'Your world, planned your way.\' },\n  nutrition: { name: \'Nutrition\', line: \'Your food, personalized to you.\' },\n  dating: { name: \'Matchmaking\', line: \'Your connection, intelligently matched.\' },\n  entertainment: { name: \'Entertainment\', line: \'Your world of things you love.\' },\n  jobs: { name: \'Jobs\', line: \'Your career, your next move.\' },\n  medical: { name: \'Medical\', line: \'Your health, all in one place.\' },\n  financial: { name: \'Financial\', line: \'Your money, working toward your goals.\' },\n  realestate: { name: \'Real Estate\', line: \'Your perfect space, found for you.\' },\n  fitness: { name: \'Fitness\', line: \'Your body. Your goals. Your journey.\' },\n  beauty: { name: \'Beauty\', line: \'Your look, your way.\' },\n  social: { name: \'Social Life\', line: \'Your people. Your communities. Your world.\' },\n  astrology: { name: \'Astrology\', line: \'Your stars. Your journey. Your timing.\' },\n  ecommerce: { name: \'E-Commerce\', line: \'Everything you need, curated for you.\' },\n};\n\n' + "interface Panel { key: HubKey | 'ecommerce'; img: string; }")

patch(R+'pages/Home.tsx',
  """            const name = cfg ? cfg.name : 'E-Commerce';
            const tag = cfg ? cfg.tag : 'Vetted products. Only the best.';""",
  """            const copy = DISTRICT_COPY[p.key];
            const name = copy?.name ?? (cfg ? cfg.name : 'E-Commerce');
            const tag = copy?.line ?? (cfg ? cfg.name : 'Vetted products. Only the best.');""")

patch(R+'pages/Home.tsx',
  "<span className=\"hub-plate-cta\">{soon ? 'Coming soon' : <>Explore now<span aria-hidden> →</span></>}</span>",
  "<span className=\"hub-plate-cta\">{soon ? 'Coming soon' : 'Explore'}</span>")

css = open(R+'index.css', encoding='utf-8').read()
assert 'The districts wear glass' not in css, 'district block already present'
css += "\n" + "/* ---- The districts wear glass (9 Aug, owner's second reference — the NASA\n   card): no bordered panel and no repeated name. The photograph runs to the\n   edges; a soft blur rises out of its foot and FADES OUT — a mask, not an\n   edge, which is the whole difference between a sleek card and a box stuck\n   on a picture. On it sits one line and, beside it, one small pill.\n\n   The hub's name is not written: the billboard in the photograph already\n   says it, in the sign-painter's own type. Repeating it in ours was the\n   noise the owner asked us to drop.\n\n   EVERY SELECTOR CARRIES .district-plate. relief.css imports AFTER this file\n   (main.tsx), so its `.hub-plate .hub-plate-foot` beats a bare `.district-run\n   .hub-plate-foot` on source order at equal specificity — an earlier draft\n   lost `inset: 0` that way and frosted the entire plate. Three classes beat\n   two.\n\n   No shadow is written and no hex: the blur band is a mask and a gradient,\n   the pill is rgba on rgba. Glass has neither elevation nor pigment. ---- */\n@media (max-width: 899px) {\n  /* the old left-anchored scrim is for a headline this plate no longer sets */\n  .district-run .district-plate::before { background: none; }\n  /* NO CROP. The new art is ~1.9:1, and every fixed aspect-ratio here would\n     have to be kept in step with whatever the next batch of billboards is\n     shaped like — the plate takes the picture's own height instead, so a\n     re-shot hub simply arrives at its own proportions and nothing is cut. */\n  .district-run .district-plate .hub-plate-art img {\n    aspect-ratio: auto; height: auto; width: 100%; max-height: none; object-fit: contain;\n  }\n\n  /* the blur band: strongest at the foot, gone by its top edge */\n  .district-run .district-plate::after {\n    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 40%;\n    z-index: 1; pointer-events: none; border-radius: inherit;\n    -webkit-backdrop-filter: blur(20px) saturate(1.1);\n    backdrop-filter: blur(20px) saturate(1.1);\n    background: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.34) 50%, rgba(0,0,0,.66) 100%);\n    -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 58%);\n    mask-image: linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 58%);\n  }\n\n  .district-run .district-plate .hub-plate-foot {\n    inset: auto 0 0 0; max-width: none; z-index: 2;\n    /* nowrap is load-bearing: relief's 720px rule wraps this foot, and a\n       wrapped foot puts the button on its own row under the line — the exact\n       stacked layout the owner asked to replace. */\n    flex-direction: row; flex-wrap: nowrap;\n    align-items: center; justify-content: space-between; gap: 10px;\n    padding: 0 14px 14px; border: 0; border-radius: 0; background: none;\n    -webkit-backdrop-filter: none; backdrop-filter: none; box-shadow: none;\n  }\n  /* the name goes: the photograph is already wearing it */\n  .district-run .district-plate .hub-plate-said h2 { display: none; }\n  .district-run .district-plate .hub-plate-said {\n    /* basis 0, not auto: an auto basis is the sentence's max-content width,\n       which overflows the row and forces the wrap this layout must not do. */\n    display: block; flex: 1 1 0%; min-width: 0; padding-bottom: 0;\n  }\n  .district-run .district-plate .hub-plate-said p {\n    margin: 0; max-width: none;\n    font-size: clamp(10.5px, 3vw, 12.5px); line-height: 1.25;\n    font-weight: 500; letter-spacing: -.012em;\n    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;\n    text-transform: none; color: rgba(255,255,255,.97);\n    text-shadow: 0 1px 8px rgba(0,0,0,.45);\n  }\n  /* the button is the one SOLID thing on the picture (owner's second\n     reference): near-black, softly rounded — not a circle, not glass. On a\n     photograph that is already blurred and bright at the foot, a translucent\n     pill is one more piece of weather; a solid one is a place to press. */\n  .district-run .district-plate .hub-plate-cta {\n    flex: 0 0 auto; margin: 0; align-self: flex-end;\n    height: 40px; min-height: 40px; padding: 0 14px; border-radius: 12px;\n    font-size: 12.5px; font-weight: 600; letter-spacing: 0; text-transform: none;\n    color: rgba(255,255,255,.97);\n    background: rgba(18,18,20,.88);\n    border: 1px solid rgba(255,255,255,.10);\n    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);\n    box-shadow: inset 0 1px 0 rgba(255,255,255,.10);\n  }\n  .district-run .district-plate .hub-plate-cta span[aria-hidden] { display: none; }\n  .district-run .district-plate.is-soon .hub-plate-cta {\n    background: rgba(18,18,20,.55); color: rgba(255,255,255,.72);\n    font-size: 11.5px; padding: 0 12px;\n  }\n}\n/* Narrow phones (SE, 360px Androids): the row gives back its own margins\n   before it gives up a word. Measured — at 360px the longest line was 7px\n   over, which is a gutter, not a font size. */\n@media (max-width: 380px) {\n  .district-run .district-plate .hub-plate-foot { padding: 0 12px 12px; gap: 8px; }\n  .district-run .district-plate .hub-plate-cta { padding: 0 12px; font-size: 11.5px; height: 38px; min-height: 38px; }\n}\n"
open(R+'index.css', 'w', encoding='utf-8').write(css)
print("patched index.css (sleek one-line districts)")

PATCHEOF

cd together-city-react
echo "== gates =="
npx tsc --noEmit
npx vitest run
node scripts/nav-audit.mjs
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
npm run build
cd ..

git add together-city-react/src/pages/Home.tsx together-city-react/src/index.css
git commit -m "$MARK

The owner's references are cards where the photograph runs edge to edge and a
blur rises out of its foot — no panel, no border, nothing stuck on top.

On phones the district plate is now that: a masked backdrop-blur band fading
to nothing by its own top edge, ONE line of copy on it, and beside the line
one solid near-black button. The hub's name is gone from our type — the new
billboards say it themselves, in the sign-painter's, and saying it twice was
the noise this fixes. The old left-anchored scrim goes with it; it existed to
carry a headline this plate no longer sets.

NOTHING IS CROPPED. The plate takes each picture's own height rather than a
fixed aspect-ratio, so the new art (~1.9:1, where the old was 2.33:1) arrives
whole and the next re-shoot needs no CSS at all.

ONE LINE IS A MEASUREMENT, NOT A HOPE. The longest line ('Your people. Your
communities. Your world.') is 262px in General Sans at 13px; the row on a
390px phone has 264px once a one-word button is in it — which is why the
button lost 'now' and its arrow. The type is clamp(10.5px, 3vw, 12.5px) so
narrower phones scale rather than wrap, and under 380px the row gives back
its own gutters before it gives up a word. Verified at 360 / 390 / 430:
fourteen plates, no wrap, no ellipsis.

Local Services falls back to its NAME rather than its tag (a full sentence
cannot share this row) until it is given a line: the master list names CARS,
this city has no cars hub (/cars redirects into Services), and a plate
announcing a room the app does not have is what the golden rule forbids.

Two rules are load-bearing, both bought with a screenshot: every selector
carries .district-plate, because relief.css imports AFTER index.css and its
two-class rules win on source order (a draft lost inset: 0 that way and
frosted the whole plate); and the foot is flex-wrap: nowrap with a zero
flex-basis, because relief's 720px rule wraps it and a wrapped foot puts the
button on its own row. No shadow is written and no hex: a mask, a gradient,
and rgba on rgba."
git push
echo "LANDED."
