#!/usr/bin/env bash
# Together City — what the Go live button does. Run by .github/workflows/go-live.yml.
#
# The workflow reads THIS file from main (never from develop), so a change on
# the developer copy cannot rewrite how it is released until it has itself
# gone live. Keeping the steps here, not in the workflow, means changing them
# never needs a workflow edit (which GitHub lets only the owner push).
#
#   prepare   1. write the chosen hubs into live-hubs.ts on develop
#             2. build the release on top of main:
#                - no COMMITS given: all of develop (a merge)
#                - COMMITS given:    only those changes, oldest first
#                  (cherry-picked, each keeping "cherry picked from" in its
#                  message so the button knows it is live), plus the hubs
#   (the workflow then migrates, type-checks and builds the result)
#   push      3. move develop and main together, or neither
#
# Any failure stops the run before step 3: nothing is released and the live
# site keeps what it had.
set -euo pipefail

PHASE="${1:?usage: go-live.sh prepare|push}"
HUB_FILE=together-city-chat/src/release/live-hubs.ts
BOT_TITLE='release: the live site shows'
ALL_HUBS='personalize ecommerce services social astrology babycare beauty dating entertainment family financial fitness jobs medical nutrition pets realestate travel'

fail() { echo "::error::$1"; exit 1; }
summary() { [ -n "${GITHUB_STEP_SUMMARY:-}" ] && printf '%s\n' "$1" >> "$GITHUB_STEP_SUMMARY" || true; }

# 1 — the hubs, onto develop ---------------------------------------------------
write_hubs() {
  HUBS="$HUBS" ALL_HUBS="$ALL_HUBS" HUB_FILE="$HUB_FILE" node - <<'JS'
const fs = require('fs');
const allowed = process.env.ALL_HUBS.split(' ');
const asked = (process.env.HUBS || '').split(',').map((s) => s.trim()).filter(Boolean);
const unknown = asked.filter((k) => !allowed.includes(k));
if (unknown.length) { console.error(`::error::No such hub: ${unknown.join(', ')}`); process.exit(1); }
const hubs = allowed.filter((k) => asked.includes(k));
if (!hubs.length) { console.error('::error::Choose at least one hub.'); process.exit(1); }
const file = process.env.HUB_FILE;
const src = fs.readFileSync(file, 'utf8');
const at = src.indexOf('export const LIVE_HUBS');
if (at < 0) { console.error(`::error::${file} has lost its LIVE_HUBS export`); process.exit(1); }
fs.writeFileSync(file, src.slice(0, at)
  + 'export const LIVE_HUBS: readonly string[] = [\n'
  + hubs.map((k) => `  '${k}',\n`).join('')
  + '];\n');
console.log(`Live hubs: ${hubs.join(', ')}`);
JS
}

# The commits main has that develop does not, which are all copies of develop
# work (a change sent on its own, a hubs line, a release note) — so sending
# "everything" may take develop's tree as it stands.
main_only_is_copies() {
  local c msg
  for c in $(git rev-list --no-merges "$DEV_SHA..origin/main"); do
    msg="$(git log -1 --format=%B "$c")"
    case "$msg" in
      *"(cherry picked from commit "*) ;;
      "$BOT_TITLE"*|"go live: "*) ;;
      *) return 1 ;;
    esac
  done
  return 0
}

prepare() {
  : "${HUBS:?}" "${REASON:?}"
  git config user.name "github-actions[bot]"
  git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

  write_hubs
  git add "$HUB_FILE"
  if git diff --cached --quiet; then
    echo "Live hubs unchanged."
  else
    git commit -q -m "$BOT_TITLE ${HUBS}"
  fi
  DEV_SHA="$(git rev-parse HEAD)"
  echo "DEV_SHA=$DEV_SHA" >> "$GITHUB_ENV"

  # 2 — the release, on top of main --------------------------------------------
  git checkout -q -B release origin/main
  local wanted=() c full
  for c in $(printf '%s' "${COMMITS:-}" | tr ',' ' '); do
    [[ "$c" =~ ^[0-9a-f]{7,40}$ ]] || fail "\"$c\" is not a commit. Nothing was released."
    full="$(git rev-parse --verify --quiet "$c^{commit}")" || fail "No commit $c on develop. Nothing was released."
    wanted+=("$full")
  done

  if [ "${#wanted[@]}" -eq 0 ]; then
    printf 'go live: %s\n\nHubs: %s\n' "$REASON" "$HUBS" > "$RUNNER_TEMP/msg"
    if main_only_is_copies; then
      # Everything: main becomes exactly the developer copy. (A plain merge
      # would trip over lines that were sent on their own and changed since.)
      local m
      m="$(git commit-tree "$DEV_SHA^{tree}" -p origin/main -p "$DEV_SHA" -F "$RUNNER_TEMP/msg")"
      git reset -q --hard "$m"
    else
      git merge --no-ff --no-edit -F "$RUNNER_TEMP/msg" "$DEV_SHA" \
        || fail "develop does not merge cleanly into main. Nothing was released."
    fi
    summary "### Sending everything on the developer copy"
  else
    local order=() picked=0 title w
    order=($(git rev-list --reverse --no-merges "origin/main..$DEV_SHA"))
    for w in "${wanted[@]}"; do
      printf '%s\n' "${order[@]}" | grep -qx "$w" \
        || fail "$(git log -1 --format='%h %s' "$w") is not waiting on develop. Nothing was released."
    done
    summary "### Sending these changes"
    for c in "${order[@]}"; do
      printf '%s\n' "${wanted[@]}" | grep -qx "$c" || continue
      title="$(git log -1 --format='%h %s' "$c")"
      if git cherry-pick -x "$c" >/dev/null 2>&1; then
        picked=$((picked + 1)); summary "- $title"
      elif git diff --quiet && git diff --cached --quiet; then
        git cherry-pick --skip >/dev/null 2>&1 || true
        summary "- $title (already live)"
      else
        git cherry-pick --abort >/dev/null 2>&1 || true
        fail "\"$title\" builds on a change you did not choose — send that one too, or send everything. Nothing was released."
      fi
    done
    # The hubs line travels with every release.
    git checkout "$DEV_SHA" -- "$HUB_FILE"
    if ! git diff --cached --quiet; then git commit -q -m "$BOT_TITLE ${HUBS}"; fi
    if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
      fail "Everything chosen is already live. Nothing was released."
    fi
    printf 'go live: %s\n\nHubs: %s\nSent: %s\n' "$REASON" "$HUBS" "${wanted[*]}" > "$RUNNER_TEMP/msg"
    git commit -q --allow-empty -F "$RUNNER_TEMP/msg"
  fi
  git log --oneline -1
}

push() {
  : "${DEV_SHA:?}" "${HUBS:?}"
  git push --atomic origin "$DEV_SHA:refs/heads/develop" HEAD:main
  summary "### Live"
  summary "main is now \`$(git rev-parse --short HEAD)\`; Vercel and Railway deploy it now."
  summary "Hubs on the live site: ${HUBS}"
}

case "$PHASE" in
  prepare) prepare ;;
  push) push ;;
  *) fail "unknown phase $PHASE" ;;
esac
