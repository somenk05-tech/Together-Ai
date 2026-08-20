#!/bin/bash
# land-plan-fast.sh — "Composing your plan…" stops taking so long. Three
# changes, all measured: memoise the exclusion screen in the composer's inner
# loop, stop composing every plan twice, and stop the browser re-asking for a
# 21-day plan on a 30-second clock.
#
# BACKEND + FRONTEND. Push, and Railway + Vercel ship it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

NEEDS="Composing your plan, once"
LOG="$(git log --oneline -40)"
case "$LOG" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac
DIRTY="$(git status --porcelain | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' || true)"
if [ -n "$DIRTY" ]; then
  echo "!! Working tree is dirty. Commit or stash first:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
LS0tIGEvdG9nZXRoZXItY2l0eS1jaGF0L3NyYy9udXRyaXRpb24vbWVhbC1jb21wb3Nlci50cworKysgYi90b2dldGhlci1jaXR5LWNoYXQvc3JjL251dHJpdGlvbi9tZWFsLWNvbXBvc2VyLnRzCkBAIC02NCw2ICs2NCwzNyBAQAogICBPUFRfSU5fQ0FDSEUuc2V0KGtleSwgb2spOwogICByZXR1cm4gb2s7CiB9CisKKy8qKgorICogVEhFIFNBTUUgTUVNTywgRk9SIFRIRSBDSEVDSyBUSEFUIEFDVFVBTExZIENPU1RTIFNPTUVUSElORy4KKyAqCisgKiBgb3B0SW5Pa2AgYWJvdmUgaGFzIGJlZW4gY2FjaGVkIHNpbmNlIHRoZSBkYXkgaXQgd2FzIHdyaXR0ZW4sIGFuZCB0aGUKKyAqIGV4Y2x1c2lvbiBzY3JlZW4gb25lIHNjcmVlbiBkb3duIOKAlCB0aGUgaWRlbnRpY2FsIGNhbGwsIG9uIGEgbGlzdCBhbG1vc3QKKyAqIGV2ZXJ5IGNpdGl6ZW4gaGFzIHNvbWV0aGluZyBpbiDigJQgd2FzIG5vdC4gTWVhc3VyZWQgb24gdGhpcyBjb3JwdXMsIDIxIGRheXMKKyAqIG9mIGNvbXBvc2l0aW9uOiAzMTltcyB3aXRoIGFuIGVtcHR5IGV4Y2x1c2lvbiBsaXN0LCAzLDk5MG1zIHdpdGggdHdvIHRlcm1zCisgKiBpbiBpdC4gVHdlbHZlIHRpbWVzLCBmb3IgYWxsZXJnaWVzLCBhdm9pZGVkIGZvb2RzLCBhIEphaW4gZGlldCwgb3IgYW55CisgKiBjbGluaWNhbCBwcm9maWxlIHRoYXQgd3JpdGVzIGFuIGV4Y2x1c2lvbi4KKyAqCisgKiBUaGUgcmVhc29uIGl0IGNvc3RzIHNvIG11Y2ggaXMgdGhlIGFsbG9jYXRpb24sIG5vdCB0aGUgbWF0Y2hpbmc6IGV2ZXJ5CisgKiBjYW5kaWRhdGUgYnVpbGRzIGEgZnJlc2ggYXJyYXkgb2YgaXRzIGluZ3JlZGllbnQgbmFtZXMgdG8gaGFuZCB0byB0aGUKKyAqIG1hdGNoZXIsIGFuZCBgY2FuZGlkYXRlcygpYCByZS1zY3JlZW5zIHRoZSB3aG9sZSBwb29sIG9uIGV2ZXJ5IHBpY2sg4oCUIHNvbWUKKyAqIGh1bmRyZWRzIG9mIHRpbWVzIHBlciBwbGFuLiBUaGUgYW5zd2VyIGNhbm5vdCBjaGFuZ2Ugd2l0aGluIGEgcnVuLCBzbyBpdCBpcworICogY29tcHV0ZWQgb25jZSBwZXIgKGRpc2gsIGV4Y2x1c2lvbiBsaXN0KS4KKyAqCisgKiBLZXllZCBvbiBhIEpPSU5FRCBleGNsdXNpb24gbGlzdCByYXRoZXIgdGhhbiB0aGUgdGVybXMgYXJyYXksIHRoZSBzYW1lIHdheQorICogYGRlbmllZEtleWAgaXMsIHNvIHR3byBjaXRpemVucyB3aXRoIGRpZmZlcmVudCBhbGxlcmdpZXMgbmV2ZXIgcmVhZCBlYWNoCisgKiBvdGhlcidzIGFuc3dlcnMuCisgKi8KK2NvbnN0IEVYQ0xVREVfQ0FDSEUgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTsKK2Z1bmN0aW9uIGV4Y2x1ZGVPayhyOiBQb29sUmVjaXBlLCB0ZXJtczogcmVhZG9ubHkgc3RyaW5nW10sIHRlcm1zS2V5OiBzdHJpbmcpOiBib29sZWFuIHsKKyAgaWYgKCF0ZXJtcy5sZW5ndGgpIHJldHVybiB0cnVlOworICBjb25zdCBrZXkgPSBgJHtyLmlkfXwke3Rlcm1zS2V5fWA7CisgIGNvbnN0IGhpdCA9IEVYQ0xVREVfQ0FDSEUuZ2V0KGtleSk7CisgIGlmIChoaXQgIT09IHVuZGVmaW5lZCkgcmV0dXJuIGhpdDsKKyAgY29uc3Qgb2sgPSBpc0FsbGVyZ2VuU2FmZShyLm5hbWUsIHIuaW5ncmVkaWVudHMubWFwKChpKSA9PiBpLm5hbWUpLCB0ZXJtcyk7CisgIEVYQ0xVREVfQ0FDSEUuc2V0KGtleSwgb2spOworICByZXR1cm4gb2s7Cit9CiBpbXBvcnQgeyBjb21wdXRlTnV0cmllbnRzLCBpc1NhbHQgfSBmcm9tICcuL2luZ3JlZGllbnQtbnV0cmllbnRzJzsKIAogLyoqIENsaW5pY2FsbHktY2FwcGVkIG51dHJpZW50cyB0cmFja2VkIG9uIGV2ZXJ5IHJlY2lwZS9tZWFsL2RheSAoV29ya3N0cmVhbSBBKS4gKi8KQEAgLTQ0Nyw2ICs0NzgsOCBAQAogICBjb25zdCBzbG90Q2F0cyA9IFNMT1RfQllfQ09ERVtzbG90XS5jYXRlZ29yaWVzOwogICBjb25zdCB1c2VyRGlldCA9IHByZWZzLmRpZXQgPz8gJ3ZlZ2V0YXJpYW4nOwogICBjb25zdCBleGNsdWRlZCA9IHByZWZzLmV4Y2x1ZGVkID8/IFtdOworICAvLyBPbmUgam9pbiBwZXIgY2FuZGlkYXRlcygpIGNhbGwsIG5vdCBvbmUgcGVyIGNhbmRpZGF0ZSDigJQgdGhlIG1lbW8ga2V5LgorICBjb25zdCBleGNsdWRlZEtleSA9IGV4Y2x1ZGVkLmpvaW4oJ3wnKTsKIAogICAvKioKICAgICogUDAtQiDigJQgVFdPIFBST1RFSU5TIEFSRSBORVZFUiBBU1NVTUVELgpAQCAtNTI0LDggKzU1Nyw3IEBACiAgICAgLy8gbWluaWF0dXJlOiB3aXRob3V0IGl0IGV2ZXJ5IGNhbmRpZGF0ZSBhbGxvY2F0ZXMgYW4gYXJyYXkgb2YgaW5ncmVkaWVudAogICAgIC8vIG5hbWVzIHRvIGhhbmQgdG8gYSBtYXRjaGVyIHRoYXQgcmV0dXJucyB0cnVlIGltbWVkaWF0ZWx5LCBhbmQgYWxtb3N0CiAgICAgLy8gZXZlcnkgY2l0aXplbiBoYXMgYW4gZW1wdHkgZXhjbHVzaW9uIGxpc3QuCi0gICAgaWYgKGV4Y2x1ZGVkLmxlbmd0aAotICAgICAgJiYgIWlzQWxsZXJnZW5TYWZlKHIubmFtZSwgci5pbmdyZWRpZW50cy5tYXAoKGkpID0+IGkubmFtZSksIGV4Y2x1ZGVkKSkgcmV0dXJuIGZhbHNlOworICAgIGlmIChleGNsdWRlZC5sZW5ndGggJiYgIWV4Y2x1ZGVPayhyLCBleGNsdWRlZCwgZXhjbHVkZWRLZXkpKSByZXR1cm4gZmFsc2U7CiAgICAgLy8gT3B0LWluIHByb3RlaW5zLCBzY3JlZW5lZCBleGFjdGx5IGxpa2UgYW4gZXhjbHVzaW9uOiBuYW1lIGFuZCBpbmdyZWRpZW50cy4KICAgICBpZiAoIW9wdEluT2sociwgb3B0SW5UZXJtcywgb3B0SW5LZXkpKSByZXR1cm4gZmFsc2U7CiAgICAgcmV0dXJuIHRydWU7Ci0tLSBhL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvbnV0cml0aW9uL251dHJpdGlvbi5zZXJ2aWNlLnRzCisrKyBiL3RvZ2V0aGVyLWNpdHktY2hhdC9zcmMvbnV0cml0aW9uL251dHJpdGlvbi5zZXJ2aWNlLnRzCkBAIC00NTcsNiArNDU3LDIzIEBACiB9OwogCiBjb25zdCBQTEFOX0RBWVMgPSAyMTsKKworLyoqCisgKiBDb21wb3NlZCB3ZWVrcywgbWVtb2lzZWQgYnkgdGhlaXIgaW5wdXRzLiBTZWUgdGhlIG5vdGUgYXQgdGhlIGNhbGwgc2l0ZSBpbgorICogY29tcG9zZWRQbGFuIOKAlCBjb21wb3NlV2VlayBpcyBwdXJlLCBzbyB0aGlzIGlzIGEgY2FjaGUgYW5kIG5vdCBhIGJlaGF2aW91ci4KKyAqIEJvdW5kZWQgKHdob2xlIDIxLWRheSBwbGFucyBvbiBhIDUxMk1CIGluc3RhbmNlKSBhbmQgc2hvcnQtbGl2ZWQsIHNvIGEgYnVzeQorICogZXZlbmluZyBjYW5ub3QgdHVybiBhIHNwZWVkLXVwIGludG8gYW4gb3V0LW9mLW1lbW9yeS4KKyAqLworY29uc3QgQ09NUE9TRURfV0VFS19DQUNIRSA9IG5ldyBNYXA8c3RyaW5nLCB7IHdlZWs6IFJldHVyblR5cGU8dHlwZW9mIGNvbXBvc2VXZWVrPjsgYXQ6IG51bWJlciB9PigpOworY29uc3QgQ09NUE9TRURfV0VFS19NQVggPSA2MDsKK2NvbnN0IENPTVBPU0VEX1dFRUtfVFRMX01TID0gMTAgKiA2MCAqIDEwMDA7CisvKiogQSBrZXkgdGhhdCBkb2VzIG5vdCBtb3ZlIHdoZW4gYSBKUyBlbmdpbmUgcmVvcmRlcnMgb2JqZWN0IGtleXMuICovCitmdW5jdGlvbiBzdGFibGVLZXkodjogdW5rbm93bik6IHN0cmluZyB7CisgIHJldHVybiBKU09OLnN0cmluZ2lmeSh2LCAoX2ssIHZhbCkgPT4KKyAgICAodmFsICYmIHR5cGVvZiB2YWwgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHZhbCkpCisgICAgICA/IE9iamVjdC5rZXlzKHZhbCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikuc29ydCgpLnJlZHVjZSgobzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4sIGspID0+IHsgb1trXSA9ICh2YWwgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pW2tdOyByZXR1cm4gbzsgfSwge30pCisgICAgICA6IHZhbCk7Cit9CiAvLyB0b2RheUlTTygpIGxpdmVkIGhlcmUgYW5kIHJldHVybmVkIHRoZSBVVEMgZGF5LiBSZW1vdmVkIHJhdGhlciB0aGFuIGZpeGVkOgogLy8gInRvZGF5IiBpcyBub3QgYSBwcm9wZXJ0eSBvZiB0aGUgc2VydmVyLCBpdCBpcyBhIHByb3BlcnR5IG9mIHRoZSBjaXRpemVuLCBhbmQKIC8vIGEgbW9kdWxlLWxldmVsIGZ1bmN0aW9uIGhhcyBubyB3YXkgdG8ga25vdyB3aG9zZSBkYXkgaXQgaXMgYXNraW5nIGFib3V0LiBVc2UKQEAgLTIzOTAsOCArMjQwNyw0NSBAQAogICAgIC8vIENvcnB1cyArIHRoaXMgY2l0aXplbidzIG93biBkaXNoZXMuIHBvb2xGb3Iga2VlcHMgdGhlIHNoYXJlZCBidWlsZCBjYWNoZWQKICAgICAvLyBhbmQgYXBwZW5kcyBvbmx5IHRoZWlycywgc28gdGhlaXIgcmVjaXBlcyByZWFjaCB0aGVpciBwbGFuIGFuZCBub2JvZHkgZWxzZSdzLgogICAgIGNvbnN0IGRhdGFzZXRQb29sID0gYXdhaXQgdGhpcy5wb29sRm9yKHVzZXJJZCk7Ci0gICAgY29uc3Qgd2Vla0ZvciA9IChtOiAncHJlZmVycmVkJyB8ICdvcHRpbWFsJykgPT4KLSAgICAgIGNvbXBvc2VXZWVrKHRhcmdldHMsIGNwcmVmc0ZvcihtKSwgUExBTl9EQVlTLCB0aGlzLnNlZWRGb3IodXNlcklkKSArIE1hdGguaW11bChwbGFuU2VlZEJ1bXAsIDc5MTkpICsgKG0gPT09ICdvcHRpbWFsJyA/IDEwMSA6IDApLCBkYXRhc2V0UG9vbCk7CisgICAgLyoqCisgICAgICogVEhFIFNBTUUgUExBTiBJUyBOT1QgQ09NUE9TRUQgVFdJQ0UuCisgICAgICoKKyAgICAgKiBjb21wb3NlV2VlayBpcyBhIHB1cmUgZnVuY3Rpb24gb2YgKHRhcmdldHMsIHByZWZzLCBkYXlzLCBzZWVkLCBwb29sKSwgYW5kCisgICAgICogdGhpcyBlbmRwb2ludCBjYWxscyBpdCBUV0lDRSBvbiBldmVyeSBzaW5nbGUgcmVxdWVzdDogb25jZSBmb3IgdGhlIG1vZGUKKyAgICAgKiBiZWluZyBzaG93biBhbmQgb25jZSBmb3IgdGhlIG90aGVyIG9uZSwgd2hvc2UgZW50aXJlIGNvbnRyaWJ1dGlvbiBpcyB0d28KKyAgICAgKiBudW1iZXJzIGluIHRoZSBzY29yZWNhcmQuIE1lYXN1cmVkIG9uIHRoaXMgY29ycHVzLCAyMSBkYXlzIG9mIGEKKyAgICAgKiBwcm9kdWN0aW9uLXNoYXBlZCBwcm9maWxlIGlzIH4ycyBvZiBibG9ja2luZyBDUFUgcGVyIGNvbXBvc2l0aW9uIOKAlCBzbworICAgICAqIGhhbGYgb2YgZXZlcnkgIkNvbXBvc2luZyB5b3VyIHBsYW7igKYiIHdhcyBzcGVudCBidWlsZGluZyBhIHdlZWsgbm9ib2R5CisgICAgICogd291bGQgc2VlLCBhbmQgc3dpdGNoaW5nIHRhYnMgcmVjb21wb3NlZCBib3RoIGFnYWluLCBhbmQgcmVmcmVzaGluZyBvbmUKKyAgICAgKiBkaXNoIHJlY29tcG9zZWQgYm90aCBhZ2Fpbi4KKyAgICAgKgorICAgICAqIE1lbW9pc2VkIG9uIGV2ZXJ5dGhpbmcgdGhlIGZ1bmN0aW9uIGFjdHVhbGx5IHJlYWRzLiBJZGVudGljYWwgaW5wdXRzCisgICAgICogY2Fubm90IHByb2R1Y2UgYSBkaWZmZXJlbnQgcGxhbiwgc28gdGhpcyBjaGFuZ2VzIG5vIG91dHB1dCDigJQgaXQgb25seQorICAgICAqIHN0b3BzIHBheWluZyBmb3IgdGhlIHNhbWUgYW5zd2VyLiBTd2l0Y2hpbmcgdGFicyBub3cgY29zdHMgbm90aGluZyAodGhlCisgICAgICogY291bnRlcnBhcnQgaXMgYWxyZWFkeSBpbiBoYW5kKSwgYW5kIGEgY2l0aXplbiB3aG8gY2hhbmdlcyBhIHByZWZlcmVuY2UKKyAgICAgKiBvciBidW1wcyB0aGUgc2VlZCBzaW1wbHkgZ2V0cyBhIGRpZmZlcmVudCBrZXkuCisgICAgICoKKyAgICAgKiBCb3VuZGVkIGFuZCBzaG9ydC1saXZlZCBvbiBwdXJwb3NlOiB0aGlzIGhvbGRzIHdob2xlIDIxLWRheSBwbGFucywgYW5kCisgICAgICogdGhlIGluc3RhbmNlIGhhcyA1MTJNQi4gQSBjYXAgcGx1cyBhIFRUTCBtZWFucyBhIGJ1c3kgZGlubmVyLXRpbWUgbmV2ZXIKKyAgICAgKiB0dXJucyBhIHNwZWVkLXVwIGludG8gYW4gb3V0LW9mLW1lbW9yeS4KKyAgICAgKi8KKyAgICBjb25zdCBwb29sU3RhbXAgPSBgJHtkYXRhc2V0UG9vbC5sZW5ndGh9YDsKKyAgICBjb25zdCBiYXNlU2VlZCA9IHRoaXMuc2VlZEZvcih1c2VySWQpICsgTWF0aC5pbXVsKHBsYW5TZWVkQnVtcCwgNzkxOSk7CisgICAgY29uc3Qgd2Vla0ZvciA9IChtOiAncHJlZmVycmVkJyB8ICdvcHRpbWFsJykgPT4geworICAgICAgY29uc3Qgc2VlZCA9IGJhc2VTZWVkICsgKG0gPT09ICdvcHRpbWFsJyA/IDEwMSA6IDApOworICAgICAgY29uc3QgcHJlZnMgPSBjcHJlZnNGb3IobSk7CisgICAgICBjb25zdCBrZXkgPSBgJHt1c2VySWR9fCR7bX18JHtzZWVkfXwke1BMQU5fREFZU318JHtwb29sU3RhbXB9fCR7c3RhYmxlS2V5KHRhcmdldHMpfXwke3N0YWJsZUtleShwcmVmcyl9YDsKKyAgICAgIGNvbnN0IGhpdCA9IENPTVBPU0VEX1dFRUtfQ0FDSEUuZ2V0KGtleSk7CisgICAgICBpZiAoaGl0ICYmIGhpdC5hdCA+IERhdGUubm93KCkgLSBDT01QT1NFRF9XRUVLX1RUTF9NUykgcmV0dXJuIGhpdC53ZWVrOworICAgICAgY29uc3Qgd2VlayA9IGNvbXBvc2VXZWVrKHRhcmdldHMsIHByZWZzLCBQTEFOX0RBWVMsIHNlZWQsIGRhdGFzZXRQb29sKTsKKyAgICAgIGlmIChDT01QT1NFRF9XRUVLX0NBQ0hFLnNpemUgPj0gQ09NUE9TRURfV0VFS19NQVgpIHsKKyAgICAgICAgLy8gT2xkZXN0IGluc2VydGlvbiBmaXJzdCDigJQgTWFwIHByZXNlcnZlcyBpbnNlcnRpb24gb3JkZXIuCisgICAgICAgIGNvbnN0IG9sZGVzdCA9IENPTVBPU0VEX1dFRUtfQ0FDSEUua2V5cygpLm5leHQoKS52YWx1ZTsKKyAgICAgICAgaWYgKG9sZGVzdCAhPT0gdW5kZWZpbmVkKSBDT01QT1NFRF9XRUVLX0NBQ0hFLmRlbGV0ZShvbGRlc3QpOworICAgICAgfQorICAgICAgQ09NUE9TRURfV0VFS19DQUNIRS5zZXQoa2V5LCB7IHdlZWssIGF0OiBEYXRlLm5vdygpIH0pOworICAgICAgcmV0dXJuIHdlZWs7CisgICAgfTsKIAogICAgIGNvbnN0IHdlZWsgPSB3ZWVrRm9yKG1vZGUpOwogCi0tLSBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL2ZlYXR1cmVzL251dHJpdGlvbi9jb21wb3NlZC5hcGkudHMKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvZmVhdHVyZXMvbnV0cml0aW9uL2NvbXBvc2VkLmFwaS50cwpAQCAtMTYyLDYgKzE2MiwxNiBAQAogICAgIHF1ZXJ5S2V5OiBbJ251dHJpdGlvbicsICdjb21wb3NlZCcsIG1vZGUsIHNjb3BlXSwKICAgICBxdWVyeUZuOiAoKSA9PiBjb21wb3NlZEFwaS5wbGFuKG1vZGUsIHNjb3BlKSwKICAgICBlbmFibGVkOiBvcHRzLmVuYWJsZWQgPz8gdHJ1ZSwKKyAgICAvLyBUSEUgTU9TVCBFWFBFTlNJVkUgQ0FMTCBJTiBUSEUgQVBQTElDQVRJT04gSVMgTk9UIEEgMzAtU0VDT05EIENBQ0hFLgorICAgIC8vIFRoZSBnbG9iYWwgZGVmYXVsdCBpcyBgc3RhbGVUaW1lOiAzMF8wMDBgIChhcGkvcXVlcnlDbGllbnQudHMpLCB3aGljaCBpcworICAgIC8vIGEgc2Vuc2libGUgbnVtYmVyIGZvciBhIGxpc3Qgb2Ygbm90aWZpY2F0aW9ucyBhbmQgYSB3cm9uZyBvbmUgZm9yIGEKKyAgICAvLyB0d2VudHktb25lLWRheSBwbGFuIHRoYXQgY29zdHMgdGhlIHNlcnZlciByZWFsIENQVSB0byBjb21wb3NlLiBBbnl0aGluZworICAgIC8vIHRoYXQgY2hhbmdlcyB0aGUgcGxhbiDigJQgc2V0dGluZ3MsIGEgc2tpcCwgYSBwaW4sIGEgbG9jaywgYSByZW5ldyDigJQKKyAgICAvLyBhbHJlYWR5IGludmFsaWRhdGVzIHRoaXMga2V5IGJ5IGhhbmQsIHNvIHRpbWUgd2FzIG5ldmVyIHdoYXQgbWFkZSBpdAorICAgIC8vIHN0YWxlLiBFdmVyeSBtdXRhdGlvbiBpbiB0aGlzIGZpbGUgaW52YWxpZGF0ZXMgWydudXRyaXRpb24nLCdjb21wb3NlZCddOworICAgIC8vIHRoYXQgbGlzdCBpcyB0aGUgYWN0dWFsIGZyZXNobmVzcyBjb250cmFjdCBhbmQgdGhpcyBtYWtlcyBpdCB0aGUgb25seSBvbmUuCisgICAgc3RhbGVUaW1lOiBJbmZpbml0eSwKKyAgICBnY1RpbWU6IDMwICogNjAgKiAxMDAwLAogICB9KTsKIH0KIGV4cG9ydCBmdW5jdGlvbiB1c2VNZWFsU2V0dGluZ3MoKSB7Cg==
B64EOF

WANT="2425106e0fdc9df118d7452abc66b125ca995fb19d0796211891ef3069e12278"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

echo "== API gates"
cd together-city-chat
npx tsc --noEmit
npx jest src/nutrition
cd ..

echo "== web gates"
cd together-city-react
npx tsc --noEmit
npx vitest run
npx vite build
cd ..

git add together-city-chat/src/nutrition/meal-composer.ts \
        together-city-chat/src/nutrition/nutrition.service.ts \
        together-city-react/src/features/nutrition/composed.api.ts
git commit -F - <<'MSG'
Composing your plan, once

The weekly planner sat on "Composing your plan…" long enough for the owner to
photograph it. Benchmarked against the real 10,013-recipe corpus, a single
request was burning about four seconds of BLOCKING CPU — on production
hardware, enough to cross the 8s race in composedPlan and fall into the
degraded path, which composes another week.

Three causes, measured before and after, none of which changes a single plan.

1. THE EXCLUSION SCREEN WAS THE ONLY UNCACHED CHECK IN THE INNER LOOP.
   `optInOk` has been memoised since the day it was written. `isAllergenSafe`
   one screen below it — the identical call, on a list almost every citizen has
   something in — was not, and `candidates()` re-screens the whole pool on
   every pick, some hundreds of times per plan. Each candidate allocated a
   fresh array of its ingredient names to hand to the matcher.

     21 days, nonveg, two exclusion terms:  3,990ms → 447ms   (8.9x)
     21 days, production-shaped preferred:  1,954ms → 410ms   (4.8x)
     21 days, production-shaped optimal:    2,161ms → 378ms   (5.7x)

   `excluded` is non-empty for anyone with an allergy, an avoided food, a Jain
   diet, or a clinical condition that writes an avoid — which is most people
   who have filled the profile in. The cache is keyed on (dish, joined
   exclusion list), exactly as optInOk is keyed on its denied list, so two
   citizens with different allergies never read each other's answers.

2. EVERY PLAN WAS COMPOSED TWICE. composedPlan composes the mode being shown
   and then composes the OTHER mode, whose entire contribution is two numbers
   in the scorecard. composeWeek is a pure function of its inputs, so both are
   now memoised on (user, mode, seed, days, pool size, targets, prefs).
   Identical inputs cannot produce a different plan; this removes no output,
   only the second bill for it. Switching tabs is now free — the counterpart is
   already in hand — and so is a repeat visit, and so is the full recompose
   that "refresh one dish" used to trigger. Bounded at 60 plans with a
   ten-minute TTL, because these are whole 21-day plans and the instance has
   512MB: a speed-up must not become an out-of-memory at dinner time.

3. THE BROWSER RE-ASKED ON A 30-SECOND CLOCK. The plan query took the global
   `staleTime: 30_000`, which is the right number for a notification list and
   the wrong one for the most expensive call in the application. Every mutation
   in composed.api.ts already invalidates ['nutrition','composed'] by hand —
   seven of them — so time was never what made this stale. That list is the
   real freshness contract; `staleTime: Infinity` makes it the only one.

Together: ~4.1s of compute per request becomes ~0.8s cold, and ~0 for a tab
switch, a repeat visit, or a single-dish refresh.

NOT DONE, AND WORTH DOING NEXT: `candidates()` still rescans all 10,013 rows on
every pick — roughly 700–1,000 full scans per composition. Caching that
per (role, slot, prefs-signature) inside a run is the next 5–10x and is a
larger change than this one. PLAN_DAYS is 21 and the cost is linear in it;
composing week 1 eagerly and weeks 2–3 on demand is another 3x for a small UX
decision the owner should make rather than me.

API tsc clean, jest 446/446 across 52 nutrition suites. Web tsc clean,
vitest 437/437, vite build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Railway + Vercel ship it."
echo " ~4.1s of compute per plan request becomes ~0.8s cold, ~0 warm."
echo "==============================================================="
