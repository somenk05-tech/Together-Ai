#!/usr/bin/env bash
# The district work, 19 Aug 2026 — six commits, already made locally:
#
#   23de302  The walk takes new pictures                     (12 district heroes)
#   7dbee3d  A thirteenth plate, with nothing behind it yet   (Pet Care)
#   a029d10  One pill, half the size, on every plate          (phone control)
#   61d6c40  The phone arrival takes the new tall art         (13 hub posters)
#   338607b  The door into a hub is the size of the door on the walk
#   9d13564  One width on the desk too                        (desktop pill)
#
# Only the push is left, and the Cowork session cannot do it: the device
# bridge has no network (git ls-remote returns "HTTP code 403 from proxy
# after CONNECT"). Run this from a Terminal on the Mac.
#
# NOT verified on this machine: the vitest suite. node_modules carries the
# darwin rollup binary, so vite/vitest cannot start inside the session's Linux
# VM. tsc is clean, eslint is clean on the changed files, and the relief.spec
# assertions these changes could break were replicated by hand and pass — but
# run `npm test` in together-city-react before you push if you want the real
# gate.
set -euo pipefail
cd "$(dirname "$0")"

git log --oneline -6
git diff --stat d7c4b93..HEAD
git push origin main
