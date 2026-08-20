#!/bin/bash
# land-felt-badge-launcher.sh — the felt badge reaches the launcher (18 Aug 2026).
#
# 'The city gets its felt badge on the home screen (web)' put the badge in the
# manifest and the apple-touch tag. The APK was left behind, so an Android
# citizen who installed the app still had the stamp on their launcher. This is
# the other half.
#
# The artwork is ALREADY ON DISK: the rebuilt APK under public/downloads, and
# the launcher densities under together-city-mobile/sideload/res.
#
# NOTE ON THE DIRTY TREE: this repo currently has unrelated work in flight
# (together-city-chat, jobs). This script does NOT check the tree — it adds
# exactly one path, prints it, and commits that. Nothing of yours is swept in.
set -euo pipefail
cd "$(dirname "$0")"

APK=together-city-react/public/downloads/TogetherCity.apk
[ -f "$APK" ] || { echo "missing: $APK"; exit 1; }

MARK="The felt badge reaches the launcher"
case "$(git log --oneline -40)" in *"$MARK"*) echo "already landed?"; exit 0;; esac

python3 - <<'PATCHEOF'
import os
import re

MOB = 'together-city-mobile/sideload'

# The badge's own page — 253,253,253, sampled from the corner of the artwork
# rather than assumed to be pure white — is the layer behind the adaptive
# icon. It was #f7f5f3 for the stamp, and before that black for the glass tile.
c = os.path.join(MOB, 'res/values/colors.xml')
if os.path.exists(c):
    s = open(c, encoding='utf-8').read()
    s2 = re.sub(r'(<color name="ic_launcher_background">)#[0-9a-fA-F]{3,8}(</color>)',
                r'\1#fdfdfd\2', s, count=1)
    open(c, 'w', encoding='utf-8').write(s2)
    print('patched', c, '(adaptive background -> #fdfdfd)')

am = os.path.join(MOB, 'AndroidManifest.xml')
if os.path.exists(am):
    s = open(am, encoding='utf-8').read()
    s = re.sub(r'versionCode="\d+"', 'versionCode="6"', s, count=1)
    s = re.sub(r'versionName="[^"]+"', 'versionName="1.2.3"', s, count=1)
    open(am, 'w', encoding='utf-8').write(s)
    print('patched', am, '(1.2.3, versionCode 6)')

print('done')
PATCHEOF

echo "== gates =="
python3 - <<'PY'
# the APK on disk must be the one this commit claims: signed, versioned, and
# carrying fifteen launcher PNGs rather than the stamp's.
import zipfile
z = zipfile.ZipFile('together-city-react/public/downloads/TogetherCity.apk')
names = z.namelist()
icons = [n for n in names if 'ic_launcher' in n and n.endswith('.png')]
assert len(icons) == 15, f'expected 15 launcher PNGs, found {len(icons)}'
assert any(n.startswith('META-INF/') and n.endswith('.RSA') for n in names) \
    or 'META-INF/CERT.RSA' in names or any('.SF' in n for n in names), 'apk is not signed'
print(f'apk: {len(icons)} launcher PNGs, signed')
PY
if command -v apksigner >/dev/null 2>&1; then
  apksigner verify --print-certs "$APK" | grep "SHA-256 digest" | head -1
fi

echo
echo "== what is about to be committed =="
git --no-pager diff --stat -- "$APK"
echo

git add "$APK"
git commit -m "$MARK

The web half landed already: the manifest, the maskable variant and the
apple-touch tag all carry the felt badge. The APK did not, so anybody who
installed the Android app still had the stamp sitting on their launcher — one
city with two faces, depending on how you got in.

The badge is cut differently from the stamp, and the difference is the whole
job. NO CROP: the source is already square, already centred, and the badge
already fills about 93% of it, which is the proportion a full-bleed icon wants
anyway. The first attempt did crop, to the badge's measured edges, and drew a
faint grey seam down both sides and along the foot — because the page under
the badge is 253,253,253 with a soft shadow, not white, so a crop pasted onto
pure white ends exactly where the eye can see it end. The surround is now
sampled from the artwork's own corner and there is nothing to see.

Three files per density, as before: the legacy square, a round variant masked
here because a launcher asking for ic_launcher_round does not round it for
you, and the adaptive foreground at 56% of its 108dp canvas so no mask Android
ships can bite through the stitching. The adaptive background follows the
page: #fdfdfd, where the stamp had #f7f5f3 and the glass tile had black.

Rebuilt and signed with the same key — the certificate digest is unchanged, so
it installs over an existing copy as an update rather than refusing — and
version-bumped to 1.2.3 so a phone can tell the two apart.

Worth saying once more, since this is the third icon: at 180px the skyline and
the wordmark both read; at 120 the skyline reads and the script does not; at
48 it is a warm pastel square. That was measured and shown before it shipped.

The wrapper's own sources are refreshed on disk beside this —
together-city-mobile/ is excluded from this repository, so it is not part of
the commit."
git push
echo "LANDED."
