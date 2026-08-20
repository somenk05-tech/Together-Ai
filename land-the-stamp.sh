#!/bin/bash
# land-the-stamp.sh — the stamp takes the tile's place (10 Aug 2026).
#
# 'The city signs its own name' already landed, with the glass TC tile in it.
# The owner then chose the stamp. Same five filenames, same manifest, same tag,
# same APK path — only the pictures inside them changed, so this is a second
# commit rather than a rewrite of the first.
#
# The artwork is ALREADY ON DISK. This checks it, patches the two things the
# paint changes — the adaptive background colour and the wrapper's version —
# and commits. It does not touch src/, so anything you have open there is safe.
set -euo pipefail
cd "$(dirname "$0")"

# Only the icon files may be dirty on the react side; everything else is left
# alone and, more to the point, not committed.
OWNED='together-city-react/public/assets/img/tc-icon-1024.png
together-city-react/public/assets/img/tc-icon-512.png
together-city-react/public/assets/img/tc-icon-192.png
together-city-react/public/assets/img/tc-icon-maskable-512.png
together-city-react/public/assets/img/apple-touch-icon-180.png
together-city-react/public/downloads/TogetherCity.apk'
STRAY=$(git status --porcelain | grep -v '^??' | sed 's/^...//' \
  | grep -v '^together-city-react/src/' | grep -vxF "$OWNED" || true)
if [ -n "$STRAY" ]; then echo "Tree is dirty beyond what this script tolerates:"; echo "$STRAY"; exit 1; fi

MARK="The stamp takes the tile's place"
case "$(git log --oneline -40)" in *"$MARK"*) echo "already landed?"; exit 0;; esac
case "$(git log --oneline -40)" in *"The city signs its own name"*) ;; *)
  echo "Run land-city-signs-its-name.sh first."; exit 1;; esac

python3 - <<'PATCHEOF'
import os
import re

W = 'together-city-react/'
MOB = 'together-city-mobile/sideload'

for f in ['public/assets/img/tc-icon-1024.png', 'public/assets/img/tc-icon-512.png',
          'public/assets/img/tc-icon-192.png', 'public/assets/img/tc-icon-maskable-512.png',
          'public/assets/img/apple-touch-icon-180.png', 'public/downloads/TogetherCity.apk']:
    assert os.path.exists(W + f), f'missing: {W + f}'

# The paper the stamp is printed on, and now the ground it stands on: the half
# second before the app paints, and the layer behind the launcher icon.
p = W + 'public/manifest.webmanifest'
s = open(p, encoding='utf-8').read()
if '"background_color": "#f7f5f3"' in s:
    print('already', p)
else:
    s2 = re.sub(r'"background_color": "#[0-9a-fA-F]{3,8}"', '"background_color": "#f7f5f3"', s, count=1)
    assert s2 != s, 'background_color not found'
    open(p, 'w', encoding='utf-8').write(s2)
    print('patched', p)

c = os.path.join(MOB, 'res/values/colors.xml')
if os.path.exists(c):
    s = open(c, encoding='utf-8').read()
    s2 = re.sub(r'(<color name="ic_launcher_background">)#[0-9a-fA-F]{3,8}(</color>)', r'\1#f7f5f3\2', s, count=1)
    open(c, 'w', encoding='utf-8').write(s2)
    print('patched', c)

am = os.path.join(MOB, 'AndroidManifest.xml')
if os.path.exists(am):
    s = open(am, encoding='utf-8').read()
    s = re.sub(r'versionCode="\d+"', 'versionCode="5"', s, count=1)
    s = re.sub(r'versionName="[^"]+"', 'versionName="1.2.2"', s, count=1)
    open(am, 'w', encoding='utf-8').write(s)
    print('patched', am)

print('done')
PATCHEOF

cd together-city-react
echo "== gates =="
python3 -c "import json; json.load(open('public/manifest.webmanifest')); print('manifest: valid JSON')"
python3 - <<'PY'
# the five icons must actually be square and the sizes the manifest claims
import struct
def png_size(p):
    with open(p, 'rb') as f:
        head = f.read(24)
    return struct.unpack('>II', head[16:24])
for f, want in [('public/assets/img/tc-icon-1024.png', 1024), ('public/assets/img/tc-icon-512.png', 512),
                ('public/assets/img/tc-icon-192.png', 192), ('public/assets/img/tc-icon-maskable-512.png', 512),
                ('public/assets/img/apple-touch-icon-180.png', 180)]:
    w, h = png_size(f)
    assert w == h == want, f'{f} is {w}x{h}, expected {want}'
print('icons: five square PNGs at the sizes the manifest declares')
PY
npm run build
test -f dist/assets/img/tc-icon-512.png
test -f dist/downloads/TogetherCity.apk
echo "icons and apk are in the build output"
cd ..

git add together-city-react/public/assets/img/tc-icon-1024.png \
        together-city-react/public/assets/img/tc-icon-512.png \
        together-city-react/public/assets/img/tc-icon-192.png \
        together-city-react/public/assets/img/tc-icon-maskable-512.png \
        together-city-react/public/assets/img/apple-touch-icon-180.png \
        together-city-react/public/downloads/TogetherCity.apk \
        together-city-react/public/manifest.webmanifest
git commit -m "$MARK

Yesterday's commit put the glass TC on the home screen. Shown the two side by
side at the sizes a phone actually draws — 48, 72, 96, 120, 180 — the owner
chose the stamp, and chose it knowing what it costs: at 180 the wordmark and
the TC read, at 120 the TC reads, at 48 it is a texture. A drawing with twenty
lines of type in it does not become a mark by being made smaller.

So it is the same five filenames, the same manifest entries and the same
apple-touch tag; only the pictures changed. The crop is measured off the
artwork — everything that is not the white page around the stamp — and squared
about that, then set on #f7f5f3, the stamp's own paper, sampled from its border
rather than picked by eye. That colour is now three things at once: the ground
of the icon, the manifest's background_color for the half second before the app
paints, and the layer behind the adaptive launcher icon, which was black when
the tile was glass and would have framed the stamp in a way nobody drew.

Every downscale is sharpened, harder the smaller it goes, because type needs
its edges back after a resample.

The APK is rebuilt at 1.2.2 with the stamp at every density, still signed with
the same key — same certificate digest, so it goes on over an existing copy as
an update. The wrapper's own sources are updated on disk beside it;
together-city-mobile/ is excluded from this repository, so it is not in here.

The glass tile is not deleted from anywhere it was used. It was only ever in
these five files, and it can be put back the same way it arrived."
git push
echo "LANDED."
