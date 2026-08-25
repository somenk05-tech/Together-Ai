#!/usr/bin/env bash
# land-design-your-paths.sh  ·  v2  ·  run from the REPO ROOT  ·  AFTER land-design-your-services.sh
#
# "Hubs should connect into personalized paths ... turned on or off
# independently." — the owner, 25 Aug. Phase 2 of Design Your Services.
#
# V2: the precondition now requires phase 1's COMMIT, not just its files on
# disk — files-on-disk is exactly what a half-landed phase 1 looks like, and
# v1 was fooled by one. Same resume logic as phase 1's v2: applied and
# byte-identical → straight to the gates; pristine → apply; partial → reset
# and apply. Every gate prints its failure to the terminal.
set -uo pipefail
W=together-city-react

say(){ printf '\n\033[1m%s\033[0m\n' "$*"; }
ok(){  printf '   \033[32m*\033[0m %s\n' "$*"; }
die(){ printf '   \033[31mx\033[0m %s\n' "$*"; exit 1; }
GLOG=/tmp/tc-land-gate.log
gate(){ # gate <label> <cmd...> — on failure, print the tail so the terminal says WHY
  local label="$1"; shift
  if ( "$@" ) >"$GLOG" 2>&1; then ok "$label"; else
    printf '   \033[31mx\033[0m %s failed — last 40 lines of its output:\n' "$label"
    tail -n 40 "$GLOG"; exit 1
  fi
}

[ -d "$W" ] || die "run me from the repo root"

TRACKED="together-city-react/src/features/profile/components/DesignYourServices.tsx"
NEWFILES="together-city-react/src/config/paths.ts together-city-react/src/app/the-paths-connect-the-hubs.test.ts"

say "1 - precondition"
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  rm -f .git/index.lock && ok "cleared an empty index.lock"
fi
# NO PIPES INTO grep -q HERE. Under `set -o pipefail`, grep -q exits at the
# first match and git log takes a SIGPIPE while still writing - the pipeline
# then reports failure ON A MATCH, timing-dependent, which is exactly how this
# precondition once refused a phase 1 that had landed thirty seconds earlier.
LANDLOG="$(git log --oneline -120 || true)"
case "$LANDLOG" in *"Design your paths"*) die "already landed - re-running is a no-op by design";; esac
case "$LANDLOG" in *"Design your services"*) : ;; *) die "phase 1 is not COMMITTED - run land-design-your-services.sh first";; esac
ok "phase 1 is committed, this is new"

say "2 - where things stand"
STATE=$(python3 - <<'PY'
import hashlib, os
MAN = """2af68680cd211b66f825a0fdd5df927e04f9ed3a51c4df6556f8aa261a0ff600  together-city-react/src/features/profile/components/DesignYourServices.tsx
44e346b44c0d31837cd75d9d09230a5c0558793daf27ee30bb0137c0d7729286  together-city-react/src/config/paths.ts
699448f218f4896057e44f2ab7191023f50d474bcef918cc360729ffbf1a69c7  together-city-react/src/app/the-paths-connect-the-hubs.test.ts"""
NEW = """together-city-react/src/config/paths.ts together-city-react/src/app/the-paths-connect-the-hubs.test.ts""".split()
want = {}
for line in MAN.strip().splitlines():
    h, p = line.split(None, 1)
    want[p.strip()] = h
match = sum(1 for p, h in want.items()
            if os.path.exists(p) and hashlib.sha256(open(p,'rb').read()).hexdigest() == h)
if match == len(want): print('applied')
elif not any(os.path.exists(p) for p in NEW): print('pristine')
else: print('partial')
PY
)
ok "tree state: $STATE"

if [ "$STATE" = "partial" ]; then
  say "3 - reset the partial application back to HEAD"
  git checkout -- $TRACKED || die "git checkout"
  rm -f $NEWFILES || die rm
  ok "clean slate"
  STATE=pristine
fi

if [ "$STATE" = "pristine" ]; then
  DIRTY="$(git status --porcelain -- $TRACKED || true)"
  [ -z "$DIRTY" ] || { printf '   \033[31mx\033[0m the section has foreign changes:\n%s\n' "$DIRTY"; die "stop"; }
  say "4 - write the two new files and patch the section"
python3 - <<'PY' || die "edits failed"
import base64, json, os, sys

BLOB = """
eyJuZXdfZmlsZXMiOiB7InRvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2NvbmZpZy9wYXRocy50cyI6ICJpbXBvcnQgdHlwZSB7
IEh1YktleSB9IGZyb20gJ0AvdHlwZXMnO1xuXG4vKipcbiAqIERFU0lHTiBZT1VSIFBBVEhTIFx1MjAxNCBodWJzIHRoYXQg
d29yayB0b2dldGhlciwgc3dpdGNoZWQgdG9nZXRoZXIuXG4gKlxuICogQSBwYXRoIGlzIGEgTkFNRUQgU0VUIE9GIERFU0lH
TkFCTEUgSFVCUywgYW5kIHRoYXQgaXMgYWxsIGl0IGlzLiBUaGVyZSBpc1xuICogbm8gcGF0aHNKc29uIGNvbHVtbiwgbm8g
ZW5kcG9pbnQsIG5vIHN0b3JlZCBwYXRoIHN0YXRlIGFueXdoZXJlOiBhIHBhdGggaXNcbiAqIE9OIGV4YWN0bHkgd2hlbiBl
dmVyeSBodWIgaW4gaXQgaXMgb24sIGRlcml2ZWQgZnJvbSB0aGUgc2FtZSBoaWRkZW4taHVic1xuICogYW5zd2VyIGV2ZXJ5
dGhpbmcgZWxzZSByZWFkcy4gVHdvIHNvdXJjZXMgb2YgdHJ1dGggaXMgaG93IGEgcGF0aCBiYWRnZSBzYXlzXG4gKiBcIm9u
XCIgb3ZlciBhIGh1YiB0aGUgY2l0aXplbiBoaWQgYW4gaG91ciBhZ28gXHUyMDE0IHNvIHRoZSBzZWNvbmQgc291cmNlIGRv
ZXMgbm90XG4gKiBleGlzdC4gKFdoZW4gTWlyYSBsZWFybnMgdG8gcmVhZCBwYXRocywgc2hlIGRlcml2ZXMgdGhlbSB0aGUg
c2FtZSB3YXksIGZyb21cbiAqIHRoZSBzYW1lIGNvbHVtbiwgb24gaGVyIHNpZGUgb2YgdGhlIHdpcmUuKVxuICpcbiAqIFN3
aXRjaGluZyBhIHBhdGggT04gb3BlbnMgZXZlcnkgaHViIGluIGl0LiBTd2l0Y2hpbmcgaXQgT0ZGIGNsb3NlcyBvbmx5IHRo
ZVxuICogaHVicyBubyBPVEhFUiBmdWxseS1vbiBwYXRoIGlzIHN0YW5kaW5nIG9uIFx1MjAxNCBcImluZGVwZW5kZW50bHlc
IiBjYW5ub3QgbWVhblxuICogdGhhdCB0dXJuaW5nIG9mZiBTZWxmIENhcmUgcXVpZXRseSBicmVha3MgdGhlIEhlYWx0aHkg
TGlmZXN0eWxlIHlvdSBsZWZ0IG9uLlxuICpcbiAqIFRIRSBCUklFRidTIFBBVEhTLCBNQVBQRUQgT05UTyBUSEUgQ0lUWSBU
SEFUIEVYSVNUUzpcbiAqIC0gXCJGb29kXCIgaXMgbm90IGEgaHViLiBFYXRpbmcgb3V0IFx1MjAxNCByZXN0YXVyYW50cywg
Y2FmXHUwMGU5cywgbWVudXMsIG9yZGVycyB0b1xuICogICB0aGUgZG9vciBcdTIwMTQgbGl2ZXMgaW4gTG9jYWwgU2Vydmlj
ZXMgKFNlcnZpY2VNZW51SXRlbSwgTWVudVZpZXcsIHRoZSBsb3QpLFxuICogICBzbyBQZXJmZWN0IERhdGUgY29ubmVjdHMg
dGhlcmUuIENvb2tpbmcgaW4gbGl2ZXMgaW4gTnV0cml0aW9uLlxuICogLSBcIkpld2VsbGVyeVwiIGlzIHRoZSBBc3Ryb2xv
Z3kgWm9uZSdzIGdlbXN0b25lIG1hcmtldHBsYWNlLCBzbyBQZXJzb25hbFxuICogICBTdHlsZSBjb25uZWN0cyB0byBBc3Ry
b2xvZ3kuXG4gKiAtIFdFRUtFTkQgR0VUQVdBWSBJUyBERUxJQkVSQVRFTFkgQUJTRU5ULiBUaGUgYnJpZWYgYnVpbGRzIGl0
IG9uIFRyYXZlbCxcbiAqICAgYW5kIFRyYXZlbCBpcyBvZmYgdGhlIHN0cmVldCAob3duZXIsIDE1IEF1Zykgd2l0aCBubyBz
dXJmYWNlIGZvciBhIHN3aXRjaFxuICogICB0byBnb3Zlcm4uIFRoZSBwYXRoIHJldHVybnMgdGhlIGRheSBUcmF2ZWwgZG9l
cyBcdTIwMTQgYWRkaW5nIGl0IGhlcmUgaXMgb25lXG4gKiAgIGVudHJ5LCBhbmQgdGhlIGd1YXJkIHRoYXQgcmVmdXNlcyBu
b24tZGVzaWduYWJsZSBodWJzIHdpbGwgaG9sZCB0aGUgZG9vclxuICogICB1bnRpbCB0aGVuLlxuICpcbiAqIEV2ZXJ5IGh1
YiBuYW1lZCBoZXJlIG11c3QgYmUgZGVzaWduYWJsZTsgdGhlLXBhdGhzLWNvbm5lY3QtdGhlLWh1YnMudGVzdC50c1xuICog
cmVmdXNlcyBhbnl0aGluZyBlbHNlLCBzbyBhIGh1YiBsZWF2aW5nIHRoZSBzdHJlZXQgYnJlYWtzIHRoZSBidWlsZCByYXRo
ZXJcbiAqIHRoYW4gc2hpcHBpbmcgYSBzd2l0Y2ggd2lyZWQgdG8gbm90aGluZy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBQ
YXRoRGVmIHtcbiAga2V5OiBzdHJpbmc7XG4gIG5hbWU6IHN0cmluZztcbiAgLyoqIFdoYXQgdGhlIHBhdGggaXMgRk9SLCBp
biBvbmUgbGluZSBcdTIwMTQgdGhlIGNhcmQncyBzdWJ0aXRsZS4gKi9cbiAgbGluZTogc3RyaW5nO1xuICBodWJzOiByZWFk
b25seSBIdWJLZXlbXTtcbn1cblxuZXhwb3J0IGNvbnN0IFBBVEhTOiByZWFkb25seSBQYXRoRGVmW10gPSBbXG4gIHtcbiAg
ICBrZXk6ICdoZWFsdGh5LWxpZmVzdHlsZScsXG4gICAgbmFtZTogJ0hlYWx0aHkgTGlmZXN0eWxlJyxcbiAgICBsaW5lOiAn
T25lIGJvZHkgXHUyMDE0IHlvdXIgZm9vZCwgeW91ciB0cmFpbmluZyBhbmQgeW91ciBibG9vZCB3b3JrIHJlYWRpbmcgZWFj
aCBvdGhlci4nLFxuICAgIGh1YnM6IFsnZml0bmVzcycsICdudXRyaXRpb24nLCAnbWVkaWNhbCddLFxuICB9LFxuICB7XG4g
ICAga2V5OiAnc2VsZi1jYXJlJyxcbiAgICBuYW1lOiAnU2VsZiBDYXJlJyxcbiAgICBsaW5lOiAnVGhlIHJvdXRpbmUsIHRo
ZSB3b3Jrb3V0IGFuZCB0aGUgcGxhdGUsIGJ1aWx0IGZyb20gdGhlIHNhbWUgcHJvZmlsZS4nLFxuICAgIGh1YnM6IFsnYmVh
dXR5JywgJ2ZpdG5lc3MnLCAnbnV0cml0aW9uJ10sXG4gIH0sXG4gIHtcbiAgICBrZXk6ICdwZXJmZWN0LWRhdGUnLFxuICAg
IG5hbWU6ICdQZXJmZWN0IERhdGUnLFxuICAgIGxpbmU6ICdTb21lb25lIHRvIG1lZXQsIHNvbWV0aGluZyB0byB3YXRjaCwg
c29tZXdoZXJlIHRvIGVhdC4nLFxuICAgIGh1YnM6IFsnZGF0aW5nJywgJ2VudGVydGFpbm1lbnQnLCAnc2VydmljZXMnXSxc
biAgfSxcbiAge1xuICAgIGtleTogJ25ldy1iZWdpbm5pbmcnLFxuICAgIG5hbWU6ICdOZXcgQmVnaW5uaW5nJyxcbiAgICBs
aW5lOiAnQSBuZXcgam9iLCBhIG5ldyBwbGFjZSwgYW5kIHRoZSBtb25leSB0aGF0IG1vdmVzIHdpdGggYm90aC4nLFxuICAg
IGh1YnM6IFsnam9icycsICdyZWFsZXN0YXRlJywgJ2ZpbmFuY2lhbCddLFxuICB9LFxuICB7XG4gICAga2V5OiAncGVyc29u
YWwtc3R5bGUnLFxuICAgIG5hbWU6ICdQZXJzb25hbCBTdHlsZScsXG4gICAgbGluZTogJ1lvdXIgbG9vayBhbmQgeW91ciBz
dG9uZXMsIHNob3BwZWQgdGhyb3VnaCBvbmUgZG9vci4nLFxuICAgIGh1YnM6IFsnYmVhdXR5JywgJ2FzdHJvbG9neScsICdl
Y29tbWVyY2UnXSxcbiAgfSxcbl07XG4iLCAidG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvYXBwL3RoZS1wYXRocy1jb25uZWN0
LXRoZS1odWJzLnRlc3QudHMiOiAiaW1wb3J0IHsgZGVzY3JpYmUsIGl0LCBleHBlY3QgfSBmcm9tICd2aXRlc3QnO1xuaW1w
b3J0IHsgcmVhZEZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luIH0gZnJvbSAnbm9k
ZTpwYXRoJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICdub2RlOnVybCc7XG5pbXBvcnQgeyBQQVRIUyB9IGZy
b20gJ0AvY29uZmlnL3BhdGhzJztcbmltcG9ydCB7IERFU0lHTkFCTEVfSFVCUyB9IGZyb20gJ0AvY29uZmlnL3NlcnZpY2Vz
JztcblxuY29uc3QgU1JDID0gam9pbihkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSksICcuLicpO1xu
Y29uc3QgcmVhZCA9IChwOiBzdHJpbmcpID0+IHJlYWRGaWxlU3luYyhqb2luKFNSQywgcCksICd1dGY4Jyk7XG5cbi8qKlxu
ICogVEhFIFBBVEhTIENPTk5FQ1QgVEhFIEhVQlMgXHUyMDE0IGFuZCBjb25uZWN0IGlzIEFMTCB0aGV5IGRvLlxuICpcbiAq
IERlc2lnbiBZb3VyIFBhdGhzIChvd25lcidzIGJyaWVmLCBwaGFzZSAyKSBuYW1lcyBzZXRzIG9mIGh1YnMgdGhhdCB3b3Jr
XG4gKiB0b2dldGhlciBhbmQgZ2l2ZXMgZWFjaCBzZXQgb25lIHN3aXRjaC4gVGhlIHR3byBydWxlcyB0aGlzIGZpbGUgaG9s
ZHM6XG4gKlxuICogMS4gQSBQQVRIIElTIE1BREUgT0YgUkVBTCBTV0lUQ0hFUy4gRXZlcnkgaHViIGluIGV2ZXJ5IHBhdGgg
aXMgZGVzaWduYWJsZSBcdTIwMTRcbiAqICAgIGEgcGF0aCBzdGFuZGluZyBvbiBUcmF2ZWwgKG5vIHN0cmVldCBzdXJmYWNl
KSwgTWFpbCBvciBQZXJzb25hbCAodGhlXG4gKiAgICBjaXRpemVuJ3Mgb3duIGRvb3JzKSB3b3VsZCBiZSBhIHN3aXRjaCB3
aXJlZCB0byBub3RoaW5nLiBUaGlzIGlzIHdoeVxuICogICAgV2Vla2VuZCBHZXRhd2F5IGlzIG5vdCBzaGlwcGVkOiBpdCB3
YWl0cyBvbiBUcmF2ZWwgcmV0dXJuaW5nIHRvIHRoZVxuICogICAgc3RyZWV0LCBhbmQgdGhpcyB0ZXN0IGlzIHRoZSBkb29y
IGl0IG11c3QgY29tZSBiYWNrIHRocm91Z2guXG4gKlxuICogMi4gQSBQQVRIIElTIERFUklWRUQsIE5FVkVSIFNUT1JFRC4g
T24gbWVhbnMgXCJldmVyeSBodWIgaW4gaXQgaXMgb25cIixcbiAqICAgIGNvbXB1dGVkIGZyb20gdGhlIHNhbWUgaGlkZGVu
LWh1YnMgYW5zd2VyIHRoZSB3aG9sZSBjaHJvbWUgcmVhZHMuIFRoZVxuICogICAgbW9tZW50IGEgc2Vjb25kIGNvbHVtbiBv
ciBlbmRwb2ludCBzdG9yZXMgcGF0aCBzdGF0ZSwgaXQgY2FuIGRpc2FncmVlXG4gKiAgICB3aXRoIHRoZSBodWIgc3dpdGNo
ZXMgYmVzaWRlIGl0IFx1MjAxNCBzbyBubyBzdWNoIHN0b3JhZ2UgbWF5IGV4aXN0LlxuICovXG5kZXNjcmliZSgnYSBwYXRo
IGlzIG1hZGUgb2YgcmVhbCBzd2l0Y2hlcycsICgpID0+IHtcbiAgY29uc3QgZGVzaWduYWJsZSA9IG5ldyBTZXQ8c3RyaW5n
PihERVNJR05BQkxFX0hVQlMpO1xuXG4gIGZvciAoY29uc3QgcCBvZiBQQVRIUykge1xuICAgIGl0KGAke3AubmFtZX0gc3Rh
bmRzIG9ubHkgb24gZGVzaWduYWJsZSBodWJzYCwgKCkgPT4ge1xuICAgICAgZm9yIChjb25zdCBoIG9mIHAuaHVicykge1xu
ICAgICAgICBleHBlY3QoeyBwYXRoOiBwLmtleSwgaHViOiBoLCBkZXNpZ25hYmxlOiBkZXNpZ25hYmxlLmhhcyhoKSB9KVxu
ICAgICAgICAgIC50b0VxdWFsKHsgcGF0aDogcC5rZXksIGh1YjogaCwgZGVzaWduYWJsZTogdHJ1ZSB9KTtcbiAgICAgIH1c
biAgICB9KTtcbiAgfVxuXG4gIGl0KCdldmVyeSBwYXRoIGNvbm5lY3RzIGF0IGxlYXN0IHR3byBodWJzIFx1MjAxNCBvbmUg
aHViIGlzIG5vdCBhIHBhdGgnLCAoKSA9PiB7XG4gICAgZm9yIChjb25zdCBwIG9mIFBBVEhTKSB7XG4gICAgICBleHBlY3Qo
eyBwYXRoOiBwLmtleSwgaHViczogcC5odWJzLmxlbmd0aCA+PSAyIH0pLnRvRXF1YWwoeyBwYXRoOiBwLmtleSwgaHViczog
dHJ1ZSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIGl0KCdrZXlzIGFyZSB1bmlxdWUsIGFuZCBXZWVrZW5kIEdldGF3YXkgd2Fp
dHMgZm9yIFRyYXZlbCcsICgpID0+IHtcbiAgICBjb25zdCBrZXlzID0gUEFUSFMubWFwKChwKSA9PiBwLmtleSk7XG4gICAg
ZXhwZWN0KG5ldyBTZXQoa2V5cykuc2l6ZSkudG9CZShrZXlzLmxlbmd0aCk7XG4gICAgLy8gVGhlIGJyaWVmIG5hbWVzIGl0
OyB0aGUgY2l0eSBjYW5ub3Qga2VlcCBpdHMgcHJvbWlzZSB3aXRob3V0IFRyYXZlbCBvblxuICAgIC8vIHRoZSBzdHJlZXQu
IFdoZW4gVHJhdmVsIHJldHVybnMsIGFkZCB0aGUgcGF0aCBhbmQgZGVsZXRlIHRoaXMgbGluZS5cbiAgICBleHBlY3Qoa2V5
cykubm90LnRvQ29udGFpbignd2Vla2VuZC1nZXRhd2F5Jyk7XG4gICAgZXhwZWN0KFBBVEhTLnNvbWUoKHApID0+IChwLmh1
YnMgYXMgcmVhZG9ubHkgc3RyaW5nW10pLmluY2x1ZGVzKCd0cmF2ZWwnKSkpLnRvQmUoZmFsc2UpO1xuICB9KTtcbn0pO1xu
XG5kZXNjcmliZSgnYSBwYXRoIGlzIGRlcml2ZWQsIG5ldmVyIHN0b3JlZCcsICgpID0+IHtcbiAgaXQoJ25vIGNvbHVtbiwg
bm8gZW5kcG9pbnQsIG5vIHNlY29uZCBzb3VyY2Ugb2YgdHJ1dGgnLCAoKSA9PiB7XG4gICAgLy8gVGhlIGhvb2sgdGhhdCBv
d25zIHRoZSB3aXJlIG5ldmVyIGhlYXJkIG9mIHBhdGhzXHUyMDI2XG4gICAgZXhwZWN0KHJlYWQoJ2hvb2tzL3VzZUNpdHlE
ZXNpZ24udHMnKSkubm90LnRvTWF0Y2goL3BhdGgvaSk7XG4gICAgLy8gXHUyMDI2YW5kIHRoZSBjb25maWcgbmV2ZXIgcmVh
Y2hlcyBmb3IgdGhlIG5ldHdvcmsgb3Igc3RvcmFnZS5cbiAgICBjb25zdCBjZmcgPSByZWFkKCdjb25maWcvcGF0aHMudHMn
KTtcbiAgICBleHBlY3QoY2ZnKS5ub3QudG9NYXRjaCgvYXBpfGZldGNofGxvY2FsU3RvcmFnZS8pO1xuICB9KTtcblxuICBp
dCgndGhlIHNlY3Rpb24gY29tcHV0ZXMgT04gZnJvbSB0aGUgaHViIHN3aXRjaGVzIGJlc2lkZSBpdCcsICgpID0+IHtcbiAg
ICBjb25zdCBzZWN0aW9uID0gcmVhZCgnZmVhdHVyZXMvcHJvZmlsZS9jb21wb25lbnRzL0Rlc2lnbllvdXJTZXJ2aWNlcy50
c3gnKTtcbiAgICBleHBlY3Qoc2VjdGlvbikudG9NYXRjaCgvcFxcLmh1YnNcXC5ldmVyeVxcKFxcKGhcXCkgPT4gIWhpZGRl
blxcLmhhc1xcKGhcXClcXCkvKTtcbiAgfSk7XG5cbiAgaXQoJ3N3aXRjaGluZyBhIHBhdGggb2ZmIHNwYXJlcyBodWJzIGFu
b3RoZXIgb24tcGF0aCBpcyBzdGFuZGluZyBvbicsICgpID0+IHtcbiAgICBjb25zdCBzZWN0aW9uID0gcmVhZCgnZmVhdHVy
ZXMvcHJvZmlsZS9jb21wb25lbnRzL0Rlc2lnbllvdXJTZXJ2aWNlcy50c3gnKTtcbiAgICBleHBlY3Qoc2VjdGlvbikudG9N
YXRjaCgvcVxcLmtleSAhPT0gcGF0aFxcLmtleSAmJiBwYXRoT25cXChxXFwpLyk7XG4gIH0pO1xuXG4gIGl0KCd0aGUgcGF0
aHMgcmVuZGVyIGluc2lkZSBEZXNpZ24gWW91ciBTZXJ2aWNlcywgdW5kZXIgdGhlaXIgb3duIGV5ZWJyb3cnLCAoKSA9PiB7
XG4gICAgY29uc3Qgc2VjdGlvbiA9IHJlYWQoJ2ZlYXR1cmVzL3Byb2ZpbGUvY29tcG9uZW50cy9EZXNpZ25Zb3VyU2Vydmlj
ZXMudHN4Jyk7XG4gICAgZXhwZWN0KHNlY3Rpb24pLnRvTWF0Y2goL0Rlc2lnbiB5b3VyIHBhdGhzLyk7XG4gICAgZXhwZWN0
KHNlY3Rpb24pLnRvTWF0Y2goL1BBVEhTXFwubWFwLyk7XG4gIH0pO1xufSk7XG4ifSwgImh1bmtzIjogeyJ0b2dldGhlci1j
aXR5LXJlYWN0L3NyYy9mZWF0dXJlcy9wcm9maWxlL2NvbXBvbmVudHMvRGVzaWduWW91clNlcnZpY2VzLnRzeCI6IFtbImlt
cG9ydCB7IEhVQlMgfSBmcm9tICdAL2NvbmZpZy9odWJzJztcbmltcG9ydCB7IERFU0lHTkFCTEVfSFVCUyB9IGZyb20gJ0Av
Y29uZmlnL3NlcnZpY2VzJztcbmltcG9ydCB7IHVzZUNpdHlEZXNpZ24sIHVzZURlc2lnblNlcnZpY2VzIH0gZnJvbSAnQC9o
b29rcy91c2VDaXR5RGVzaWduJztcbmltcG9ydCB7IFN3aXRjaCB9IGZyb20gJ0AvY29tcG9uZW50cy91aSc7XG4iLCAiaW1w
b3J0IHsgSFVCUyB9IGZyb20gJ0AvY29uZmlnL2h1YnMnO1xuaW1wb3J0IHsgREVTSUdOQUJMRV9IVUJTIH0gZnJvbSAnQC9j
b25maWcvc2VydmljZXMnO1xuaW1wb3J0IHsgUEFUSFMsIHR5cGUgUGF0aERlZiB9IGZyb20gJ0AvY29uZmlnL3BhdGhzJztc
bmltcG9ydCB7IHVzZUNpdHlEZXNpZ24sIHVzZURlc2lnblNlcnZpY2VzIH0gZnJvbSAnQC9ob29rcy91c2VDaXR5RGVzaWdu
JztcbmltcG9ydCB7IFN3aXRjaCB9IGZyb20gJ0AvY29tcG9uZW50cy91aSc7XG4iXSwgWyIgIGNvbnN0IGRlc2lnbiA9IHVz
ZURlc2lnblNlcnZpY2VzKCk7XG5cbiAgY29uc3Qgc2V0SHViID0gKGtleTogSHViS2V5LCBvbjogYm9vbGVhbikgPT4ge1xu
ICAgIGNvbnN0IG5leHQgPSBuZXcgU2V0KGhpZGRlbik7XG4iLCAiICBjb25zdCBkZXNpZ24gPSB1c2VEZXNpZ25TZXJ2aWNl
cygpO1xuXG4gIGNvbnN0IHNhdmUgPSAobmV4dDogU2V0PHN0cmluZz4pID0+IGRlc2lnbi5tdXRhdGUoREVTSUdOQUJMRV9I
VUJTLmZpbHRlcigoaykgPT4gbmV4dC5oYXMoaykpKTtcblxuICBjb25zdCBzZXRIdWIgPSAoa2V5OiBIdWJLZXksIG9uOiBi
b29sZWFuKSA9PiB7XG4gICAgY29uc3QgbmV4dCA9IG5ldyBTZXQoaGlkZGVuKTtcbiJdLCBbIiAgICBjb25zdCBuZXh0ID0g
bmV3IFNldChoaWRkZW4pO1xuICAgIGlmIChvbikgbmV4dC5kZWxldGUoa2V5KTsgZWxzZSBuZXh0LmFkZChrZXkpO1xuICAg
IGRlc2lnbi5tdXRhdGUoREVTSUdOQUJMRV9IVUJTLmZpbHRlcigoaykgPT4gbmV4dC5oYXMoaykpKTtcbiAgfTtcblxuIiwg
IiAgICBjb25zdCBuZXh0ID0gbmV3IFNldChoaWRkZW4pO1xuICAgIGlmIChvbikgbmV4dC5kZWxldGUoa2V5KTsgZWxzZSBu
ZXh0LmFkZChrZXkpO1xuICAgIHNhdmUobmV4dCk7XG4gIH07XG5cbiAgLyogQSBwYXRoIGlzIE9OIHdoZW4gZXZlcnkgaHVi
IGluIGl0IGlzIG9uIFx1MjAxNCBkZXJpdmVkLCBuZXZlciBzdG9yZWQsIHNvIHRoaXNcbiAgICAgc3dpdGNoIGNhbiBuZXZl
ciBkaXNhZ3JlZSB3aXRoIHRoZSBodWIgc3dpdGNoZXMgYWJvdmUgaXQuICovXG4gIGNvbnN0IHBhdGhPbiA9IChwOiBQYXRo
RGVmKSA9PiBwLmh1YnMuZXZlcnkoKGgpID0+ICFoaWRkZW4uaGFzKGgpKTtcblxuICBjb25zdCBzZXRQYXRoID0gKHBhdGg6
IFBhdGhEZWYsIG9uOiBib29sZWFuKSA9PiB7XG4gICAgY29uc3QgbmV4dCA9IG5ldyBTZXQoaGlkZGVuKTtcbiAgICBpZiAo
b24pIHtcbiAgICAgIGZvciAoY29uc3QgaCBvZiBwYXRoLmh1YnMpIG5leHQuZGVsZXRlKGgpO1xuICAgIH0gZWxzZSB7XG4g
ICAgICAvKiBPbmx5IHRoZSBodWJzIG5vIE9USEVSIGZ1bGx5LW9uIHBhdGggaXMgc3RhbmRpbmcgb24uIFR1cm5pbmcgb2Zm
XG4gICAgICAgICBTZWxmIENhcmUgbXVzdCBub3QgcXVpZXRseSBicmVhayB0aGUgSGVhbHRoeSBMaWZlc3R5bGUgeW91IGxl
ZnQgb24uICovXG4gICAgICBjb25zdCBoZWxkID0gbmV3IFNldChQQVRIU1xuICAgICAgICAuZmlsdGVyKChxKSA9PiBxLmtl
eSAhPT0gcGF0aC5rZXkgJiYgcGF0aE9uKHEpKVxuICAgICAgICAuZmxhdE1hcCgocSkgPT4gWy4uLnEuaHVic10pKTtcbiAg
ICAgIGZvciAoY29uc3QgaCBvZiBwYXRoLmh1YnMpIGlmICghaGVsZC5oYXMoaCkpIG5leHQuYWRkKGgpO1xuICAgIH1cbiAg
ICBzYXZlKG5leHQpO1xuICB9O1xuXG4iXSwgWyIgICAgICAgICAgOiBgJHtvbkNvdW50fSBvZiAke0RFU0lHTkFCTEVfSFVC
Uy5sZW5ndGh9IGh1YnMgb24uIFRoZSAke2hpZGRlbi5zaXplID09PSAxID8gJ29uZSB5b3Ugc3dpdGNoZWQgb2ZmIGlzJyA6
IGAke2hpZGRlbi5zaXplfSB5b3Ugc3dpdGNoZWQgb2ZmIGFyZWB9IGhpZGRlbiwgbm90IGdvbmUgXHUyMDE0IHNhdmVkIGxp
bmtzIHN0aWxsIG9wZW4sIGFuZCBNaXJhIGNhbiBzdGlsbCB0YWtlIHlvdSB0aGVyZS5gfVxuICAgICAgPC9wPlxuICAgIDwv
c2VjdGlvbj5cbiAgKTtcbiIsICIgICAgICAgICAgOiBgJHtvbkNvdW50fSBvZiAke0RFU0lHTkFCTEVfSFVCUy5sZW5ndGh9
IGh1YnMgb24uIFRoZSAke2hpZGRlbi5zaXplID09PSAxID8gJ29uZSB5b3Ugc3dpdGNoZWQgb2ZmIGlzJyA6IGAke2hpZGRl
bi5zaXplfSB5b3Ugc3dpdGNoZWQgb2ZmIGFyZWB9IGhpZGRlbiwgbm90IGdvbmUgXHUyMDE0IHNhdmVkIGxpbmtzIHN0aWxs
IG9wZW4sIGFuZCBNaXJhIGNhbiBzdGlsbCB0YWtlIHlvdSB0aGVyZS5gfVxuICAgICAgPC9wPlxuXG4gICAgICB7LyogXHUy
NTAwXHUyNTAwIERFU0lHTiBZT1VSIFBBVEhTIFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1
MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1
MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1
MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1MjUwMFx1
MjUwMFx1MjUwMFxuICAgICAgICAgIEEgcGF0aCBpcyBhIG5hbWVkIHNldCBvZiBodWJzIHRoYXQgd29yayB0b2dldGhlciwg
YW5kIG5vdGhpbmcgbW9yZTpcbiAgICAgICAgICBvbiB3aGVuIGV2ZXJ5IGh1YiBpbiBpdCBpcyBvbiwgZGVyaXZlZCBmcm9t
IHRoZSBzd2l0Y2hlcyBhYm92ZVxuICAgICAgICAgIHJhdGhlciB0aGFuIHN0b3JlZCBiZXNpZGUgdGhlbS4gU2VlIGNvbmZp
Zy9wYXRocy50cyBmb3Igd2h5LiAqL31cbiAgICAgIDxkaXYgY2xhc3NOYW1lPVwiZXllYnJvd1wiIHN0eWxlPXt7IG1hcmdp
blRvcDogMjYgfX0+RGVzaWduIHlvdXIgcGF0aHM8L2Rpdj5cbiAgICAgIDxwIGNsYXNzTmFtZT1cIm11dGVkXCIgc3R5bGU9
e3sgZm9udFNpemU6IDEzLCBtYXJnaW46ICc0cHggMCAxNHB4JywgbWF4V2lkdGg6ICc2MmNoJywgbGluZUhlaWdodDogMS42
IH19PlxuICAgICAgICBIdWJzIHRoYXQgd29yayB0b2dldGhlciwgc3dpdGNoZWQgdG9nZXRoZXIuIEEgcGF0aCBpcyBvbiB3
aGVuIGV2ZXJ5IGh1YlxuICAgICAgICBpbiBpdCBpcyBvbjsgc3dpdGNoaW5nIG9uZSBvbiBvcGVucyBhbGwgb2YgaXRzIGh1
YnMsIGFuZCBzd2l0Y2hpbmcgaXRcbiAgICAgICAgb2ZmIGNsb3NlcyBvbmx5IHRoZSBodWJzIG5vbmUgb2YgeW91ciBvdGhl
ciBwYXRocyBhcmUgdXNpbmcuXG4gICAgICA8L3A+XG4gICAgICA8ZGl2IHN0eWxlPXt7IGRpc3BsYXk6ICdncmlkJywgZ3Jp
ZFRlbXBsYXRlQ29sdW1uczogJ3JlcGVhdChhdXRvLWZpbGwsIG1pbm1heCgyNTBweCwgMWZyKSknLCBnYXA6IDEyIH19Plxu
ICAgICAgICB7UEFUSFMubWFwKChwKSA9PiB7XG4gICAgICAgICAgY29uc3Qgb24gPSBwYXRoT24ocCk7XG4gICAgICAgICAg
cmV0dXJuIChcbiAgICAgICAgICAgIDxkaXYga2V5PXtwLmtleX0gY2xhc3NOYW1lPVwiY2FyZFwiIHN0eWxlPXt7IGRpc3Bs
YXk6ICdmbGV4JywgZ2FwOiAxMCwgb3BhY2l0eTogb24gPyAxIDogMC42MiB9fT5cbiAgICAgICAgICAgICAgPHNwYW4gc3R5
bGU9e3sgZmxleDogMSwgbWluV2lkdGg6IDAgfX0+XG4gICAgICAgICAgICAgICAgPHNwYW4gc3R5bGU9e3sgZGlzcGxheTog
J2ZsZXgnLCBhbGlnbkl0ZW1zOiAnY2VudGVyJywgZ2FwOiA3IH19PlxuICAgICAgICAgICAgICAgICAge3AuaHVicy5tYXAo
KGgpID0+IChcbiAgICAgICAgICAgICAgICAgICAgPHNwYW4ga2V5PXtofSBhcmlhLWhpZGRlbiBzdHlsZT17eyBjb2xvcjog
J3ZhcigtLWFjY2VudC1pbmspJywgZGlzcGxheTogJ2dyaWQnLCBwbGFjZUl0ZW1zOiAnY2VudGVyJyB9fT5cbiAgICAgICAg
ICAgICAgICAgICAgICA8SWNvbiBuYW1lPXt0YWJJY29uKGgpfSBzaXplPXsxNH0gLz5cbiAgICAgICAgICAgICAgICAgICAg
PC9zcGFuPlxuICAgICAgICAgICAgICAgICAgKSl9XG4gICAgICAgICAgICAgICAgPC9zcGFuPlxuICAgICAgICAgICAgICAg
IDxzcGFuIHN0eWxlPXt7IGRpc3BsYXk6ICdibG9jaycsIGZvbnRXZWlnaHQ6IDcwMCwgZm9udFNpemU6IDEzLjUsIG1hcmdp
blRvcDogNiwgbGluZUhlaWdodDogMS4yNSB9fT57cC5uYW1lfTwvc3Bhbj5cbiAgICAgICAgICAgICAgICA8c3BhbiBjbGFz
c05hbWU9XCJtdXRlZFwiIHN0eWxlPXt7IGRpc3BsYXk6ICdibG9jaycsIGZvbnRTaXplOiAxMSwgbWFyZ2luVG9wOiAyLCBs
aW5lSGVpZ2h0OiAxLjUgfX0+e3AubGluZX08L3NwYW4+XG4gICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPVwibXV0
ZWRcIiBzdHlsZT17eyBkaXNwbGF5OiAnYmxvY2snLCBmb250U2l6ZTogMTAuNSwgbWFyZ2luVG9wOiA1LCBmb250V2VpZ2h0
OiA2MDAgfX0+XG4gICAgICAgICAgICAgICAgICB7cC5odWJzLm1hcCgoaCkgPT4gSFVCU1toXS5uYW1lKS5qb2luKCcgKyAn
KX1cbiAgICAgICAgICAgICAgICA8L3NwYW4+XG4gICAgICAgICAgICAgIDwvc3Bhbj5cbiAgICAgICAgICAgICAgPFN3aXRj
aCBjaGVja2VkPXtvbn0gb25DaGFuZ2U9eyhuZXh0KSA9PiBzZXRQYXRoKHAsIG5leHQpfVxuICAgICAgICAgICAgICAgIGxh
YmVsPXtgJHtwLm5hbWV9IHBhdGggJHtvbiA/ICdvbicgOiAnb2ZmJ31gfSBoaWRlTGFiZWwgLz5cbiAgICAgICAgICAgIDwv
ZGl2PlxuICAgICAgICAgICk7XG4gICAgICAgIH0pfVxuICAgICAgPC9kaXY+XG4gICAgPC9zZWN0aW9uPlxuICApO1xuIl1d
fX0=
"""
payload = json.loads(base64.b64decode(''.join(BLOB.split())))

for path, content in payload['new_files'].items():
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w').write(content)
    print(f'   * new  {path}')

for path, pairs in payload['hunks'].items():
    s = open(path).read()
    for old, new in pairs:
        n = s.count(old)
        if n != 1:
            print(f'   x anchor { "missing" if n == 0 else "ambiguous" } in {path}'); sys.exit(1)
        s = s.replace(old, new)
    open(path, 'w').write(s)
    print(f'   * patch {path}')
PY
  ok "applied"
else
  say "4 - already applied, byte-identical to the tested build - nothing to write"
  ok "skipping straight to the guard and the gates"
fi

say "5 - watch the guard fail first"
SECTION="$W/src/features/profile/components/DesignYourServices.tsx"
cp "$SECTION" /tmp/tc-section.landing.bak
python3 - <<'PY' || die "could not stage the broken section"
p = 'together-city-react/src/features/profile/components/DesignYourServices.tsx'
s = open(p).read()
broken = s.replace(".filter((q) => q.key !== path.key && pathOn(q))", ".filter(() => false)")
assert broken != s, 'protection line not found'
open(p, 'w').write(broken)
PY
if (cd "$W" && npx vitest run src/app/the-paths-connect-the-hubs.test.ts >"$GLOG" 2>&1); then
  mv /tmp/tc-section.landing.bak "$SECTION"
  die "guard did NOT catch a path switch that tramples other paths' hubs"
fi
mv /tmp/tc-section.landing.bak "$SECTION"
ok "guard caught the trampling switch; fix restored"

say "6 - web gates"
cd "$W" || die cd
gate "web tsc"          npx tsc --noEmit
gate "web vitest"       npx vitest run
gate "lint-ceiling"     node scripts/lint-ceiling.mjs
gate "nav-audit"        node scripts/nav-audit.mjs
gate "a11y-audit"       node scripts/a11y-audit.mjs
gate "motion-ceiling"   node scripts/motion-ceiling.mjs
# The audit has been seen red on an untouched checkout (a 4-vs-2 backlog that
# predates this work). Whether the backlog is red is not this script's problem;
# ADDING to it would be. So: die only if one of OUR names is in the list.
DEAD_LIST=$(node scripts/dead-export-audit.mjs --list 2>&1 | grep '^  ' || true)
for bad in useCityDesign DesignYourServices config/services design-your config/paths DESIGNABLE PATHS; do
  case "$DEAD_LIST" in *"$bad"*) printf '%s\n' "$DEAD_LIST"; die "this change added a dead export";; esac
done
ok "no dead exports added by this change"
gate "web build"        npm run build
cd ..

say "7 - commit"
git add $TRACKED $NEWFILES land-design-your-paths.sh || die "git add"
git commit -F - <<'MSG' || die commit
Design your paths

"Hubs should connect into personalized paths. The user should be able to
turn these paths on or off independently." - the owner, 25 Aug. Phase 2
of Design Your Services.

A PATH IS DERIVED, NEVER STORED. On means "every hub in it is on",
computed from the same hidden-hubs column phase 1 added - no pathsJson,
no endpoint, no second source of truth that can disagree with the hub
switches an inch above it. Switching a path on opens its hubs through
the one existing PUT; switching it off closes only the hubs no OTHER
fully-on path is standing on, because "independently" cannot mean that
turning off Self Care quietly breaks the Healthy Lifestyle you left on.
When Mira learns to read paths (phase 3), she derives them the same way
from the same column on her side of the wire.

THE BRIEF'S PATHS, MAPPED ONTO THE CITY THAT EXISTS. "Food" is not a
hub: eating out - restaurants, menus, orders to the door - lives in
Local Services, so Perfect Date connects there. "Jewellery" is the
Astrology Zone's gemstone marketplace, so Personal Style connects to
Astrology. WEEKEND GETAWAY IS DELIBERATELY ABSENT: the brief builds it
on Travel, and Travel is off the street with no surface for a switch to
govern - the path returns the day Travel does, one entry in paths.ts,
through the guard that refuses non-designable hubs.

Five paths ship: Healthy Lifestyle (fitness + nutrition + medical),
Self Care (beauty + fitness + nutrition), Perfect Date (dating +
entertainment + services), New Beginning (jobs + realestate +
financial), Personal Style (beauty + astrology + ecommerce).

Guard: the-paths-connect-the-hubs.test.ts (11), watched failing first -
every path hub designable, keys unique, no stored path state anywhere,
and the trampling protection asserted by name.
MSG
ok committed

say "review, then:  git push"
