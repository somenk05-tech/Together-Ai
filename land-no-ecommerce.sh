#!/bin/bash
# land-no-ecommerce.sh — E-Commerce leaves the city. It was the one district
# with no hub behind it, and every place its key was handled carried a branch
# for that one exception.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

# A Cowork session read this repo's status over the file bridge, which cannot
# unlink, so an empty .git/index.lock may be sitting there blocking every git
# command. Removing a zero-byte lock is safe when no git process is running.
if [ -f .git/index.lock ] && [ ! -s .git/index.lock ]; then
  echo "== clearing a stale empty .git/index.lock"
  rm -f .git/index.lock
fi

NEEDS="E-Commerce was never a room"
case "$(git log --oneline -40)" in
  *"$NEEDS"*) echo "== \"$NEEDS\" is already here. Nothing to do."; exit 0 ;;
esac

# The app icons and the APK belong to ANOTHER session's work: allowed to sit
# there, never staged below. Anything else stops this.
ALLOWED='^ M together-city-react/(public/assets/img/(apple-touch-icon-180|tc-icon-1024|tc-icon-192|tc-icon-512|tc-icon-maskable-512)\.png|public/downloads/TogetherCity\.apk)$'
DIRTY="$(git status --porcelain \
  | grep -Ev '^\?\? (land-.*\.sh|push-.*\.sh|.*\.patch)$' \
  | grep -Ev "$ALLOWED" || true)"
if [ -n "$DIRTY" ]; then
  echo "!! The tree carries changes this script did not expect:"; echo "$DIRTY"; exit 1
fi

PATCH="$(mktemp "${TMPDIR:-/tmp}/land.XXXXXX")"
trap 'rm -f "$PATCH"' EXIT
cat <<'B64EOF' | tr -d '\n' | openssl base64 -d -A > "$PATCH"
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSG9tZS50c3gJMjAyNi0wOC0xMCAxNzoxOTo0NC4wNTk5NzMxMzYgKzAwMDAKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvcGFnZXMvSG9tZS50c3gJMjAyNi0wOC0xMCAxNzoxOTo0NC4xMDkzMjUwMDcgKzAwMDAKQEAgLTEzLDcgKzEzLDggQEAKIGludGVyZmFjZSBab25lIHsgdG86IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgc2hhcGU6ICdwb2x5JyB8ICdlbGxpcHNlJzsgcG9pbnRzPzogc3RyaW5nOyBjeD86IG51bWJlcjsgY3k/OiBudW1iZXI7IHJ4PzogbnVtYmVyOyByeT86IG51bWJlcjsgfQogLy8gQ2xpY2thYmxlIGJ1aWxkaW5nIHpvbmVzLCBtYXBwZWQgdG8gdGhlIG5ldyBob21lcGFnZSB2aWRlbyAoYnVpbGRpbmdzIGFyZQogLy8gc3RhdGljOyBvbmx5IHRoZSBiaWxsYm9hcmRzIGFuaW1hdGUpLiBDb29yZHMgYXJlIGluIHRoZSBTVkcgdmlld0JveCAoMTkwM3g4MjYpLgotLy8gTmV3cyBhbmQgRS1Db21tZXJjZSBidWlsZGluZ3MgaGF2ZSBubyBodWIgcm91dGUsIHNvIHRoZXkncmUgbm90IHpvbmVkLiBUaGUKKy8vIFRoZSBOZXdzIGFuZCBFLUNvbW1lcmNlIGJ1aWxkaW5ncyBhcmUgaW4gdGhlIHBob3RvZ3JhcGggYW5kIGhhdmUgbm8gaHViCisvLyBiZWhpbmQgdGhlbSwgc28gdGhleSBhcmUgbm90IHpvbmVkIOKAlCBFLUNvbW1lcmNlIGlzIG5vIGxvbmdlciBhIGRpc3RyaWN0LiBUaGUKIC8vIENhcnMgYnVpbGRpbmcgaXMgc3RpbGwgaW4gdGhlIHJlbmRlciBhbmQgbm8gbG9uZ2VyIGNsaWNrYWJsZSDigJQgdGhlIGh1YiBpdCBsZWQKIC8vIHRvIGlzIGdvbmUsIGFuZCBhIHpvbmUgb250byBhIHJlZGlyZWN0IGlzIGEgbGluayB0aGF0IGxpZXMgYWJvdXQgd2hlcmUgaXQgZ29lcy4KIGNvbnN0IFpPTkVTOiBab25lW10gPSBbCkBAIC0zMCw3ICszMSw3IEBACiAgIHsgdG86ICcvZml0bmVzcycsIGxhYmVsOiAnRml0bmVzcyBIdWInLCBzaGFwZTogJ3BvbHknLCBwb2ludHM6ICcxNDkwLjYsNTU3LjQgMTc5MC43LDU1Ny40IDE3OTAuNyw3NTMuOCAxNDkwLjYsNzUzLjgnIH0sCiBdOwogCi1pbnRlcmZhY2UgUGF2aWxpb24geyB0bzogc3RyaW5nOyBpbWc6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgbWV0YTogc3RyaW5nOyBibHVyYjogc3RyaW5nOyBzb29uPzogYm9vbGVhbjsgfQoraW50ZXJmYWNlIFBhdmlsaW9uIHsgdG86IHN0cmluZzsgaW1nOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IG1ldGE6IHN0cmluZzsgYmx1cmI6IHN0cmluZzsgfQogY29uc3QgUEFWSUxJT05TOiBQYXZpbGlvbltdID0gWwogICB7IHRvOiAnL3RyYXZlbCcsIGltZzogJ3RyYXZlbC1odWIud2VicCcsIHRpdGxlOiAnVHJhdmVsIEh1YicsIG1ldGE6ICdGbGlnaHRzIMK3IFRyYWlucyDCtyBIb3RlbHMgwrcgUGFja2FnZXMnLCBibHVyYjogJ1BsYW4geW91ciBlbnRpcmUgam91cm5leSBpbiBvbmUgcGxhY2Ug4oCUIGNoYXQgd2l0aCBmcmllbmRzLCBzcGxpdCBleHBlbnNlcywgYm9vayB0b2dldGhlci4nIH0sCiAgIHsgdG86ICcvYXN0cm9sb2d5JywgaW1nOiAnYXN0cm9sb2d5LWh1Yi53ZWJwJywgdGl0bGU6ICdBc3Ryb2xvZ3kgSHViJywgbWV0YTogJ0JpcnRoIGNoYXJ0IMK3IEhvcm9zY29wZSDCtyBDb21wYXRpYmlsaXR5JywgYmx1cmI6ICdZb3VyIG5hdGFsIGNoYXJ0LCBkYWlseSByZWFkaW5ncyBhbmQgY29zbWljIGNvbXBhdGliaWxpdHkg4oCUIGd1aWRhbmNlIHdyaXR0ZW4gaW4gdGhlIHN0YXJzLCBwZXJzb25hbGlzZWQgdG8geW91LicgfSwKQEAgLTQ0LDEwICs0NSwxMyBAQAogICB7IHRvOiAnL2JlYXV0eScsIGltZzogJ2JlYXV0eW1hcmtldC53ZWJwJywgdGl0bGU6ICdCZWF1dHkgTWFya2V0JywgbWV0YTogJ1Byb2ZpbGUgwrcgTWFya2V0IMK3IFJvdXRpbmUnLCBibHVyYjogJ0Egcm91dGluZSBidWlsdCBmcm9tIHlvdXIgc2tpbiwgeW91ciBnb2FscyBhbmQgdmVyaWZpZWQgZXhwZXJ0aXNlIOKAlCBub3QgbWFya2V0aW5nLicgfSwKICAgeyB0bzogJy9maXRuZXNzJywgaW1nOiAnZml0bmVzcy1oZXJvLndlYnAnLCB0aXRsZTogJ0ZpdG5lc3MgSHViJywgbWV0YTogJ1dvcmtvdXRzIMK3IFdhbGtzIMK3IFN1cHBsZW1lbnRzJywgYmx1cmI6ICdQZXJzb25hbGlzZWQgaG9tZSAmIGd5bSBwbGFucywgYSBsaXZlIGd1aWRlZCB0aW1lciwgYW5kIGV2ZXJ5dGhpbmcgdHJhY2tlZC4nIH0sCiAgIHsgdG86ICcvZmluYW5jaWFsJywgaW1nOiAnZmluYW5jaWFsLWRpc3RyaWN0LndlYnAnLCB0aXRsZTogJ0ZpbmFuY2lhbCBEaXN0cmljdCcsIG1ldGE6ICdCdWRnZXQgwrcgV2FsbGV0IMK3IFBheW1lbnRzJywgYmx1cmI6ICdBbGwgeW91ciBjaXR5IHNwZW5kaW5nIGluIG9uZSBzaW1wbGUgZGFzaGJvYXJkIOKAlCB1bmRlcnN0YW5kLCBwbGFuLCBkZWNpZGUuJyB9LAotICB7IHRvOiAnIycsIGltZzogJ2UtY29tbWVyY2Uud2VicCcsIHRpdGxlOiAnRS1Db21tZXJjZScsIG1ldGE6ICdWZXR0ZWQgcHJvZHVjdHMgb25seScsIGJsdXJiOiAnRXZlcnkgcHJvZHVjdCBjaGVja2VkIGFnYWluc3QgcXVhbGl0eSBhbmQgc2FmZXR5IHN0YW5kYXJkcy4gV2UgcmVzZWFyY2gsIHlvdSBzaG9wLicsIHNvb246IHRydWUgfSwKIF07CiAKLWNvbnN0IEZBTExCQUNLID0gUEFWSUxJT05TLnNsaWNlKDAsIDEyKTsKKy8qIFR3ZWx2ZSB0aWxlcywgc2l4IGFjcm9zcyBhbmQgdHdvIGRvd24uIFRoaXMgdXNlZCB0byBiZSBgc2xpY2UoMCwgMTIpYCwKKyAgIHdoaWNoIHdhcyBub3QgYSBjYXAg4oCUIGl0IHdhcyBob3cgdGhlIHRoaXJ0ZWVudGggZW50cnksIGEgY29taW5nLXNvb24KKyAgIEUtQ29tbWVyY2UgdGlsZSwgd2FzIGtlcHQgb2ZmIHRoZSBncmlkIHdoaWxlIHN0YXlpbmcgaW4gdGhlIGFycmF5LiBUaGUKKyAgIGVudHJ5IGlzIGdvbmUsIHNvIHRoZSBzbGljZSB3b3VsZCBub3cgYmUgYSBydWxlIHdpdGggbm90aGluZyB0byBlbmZvcmNlLiAqLworY29uc3QgRkFMTEJBQ0sgPSBQQVZJTElPTlM7CiAKIC8qKgogICogIldhbGsgdGhlIGRpc3RyaWN0cyIg4oCUIHRoZSBodWIgbGFuZGluZyBoZXJvZXMgbGFpZCBvdXQgaW5saW5lIG9uIHRoZSBob21lCkBAIC02OSw3ICs3Myw3IEBACiAgKiBhbm5vdW5jZWQgYSByb29tIHRoZSBhcHAgZG9lcyBub3QgaGF2ZSB3b3VsZCBiZSB0aGUgb25lIHRoaW5nIHRoZSBnb2xkZW4KICAqIHJ1bGUgZm9yYmlkcywgc28gU2VydmljZXMga2VlcHMgaXRzIGNvbmZpZyBjb3B5IHVudGlsIGl0IGlzIGdpdmVuIGEgbGluZS4KICAqLwotY29uc3QgRElTVFJJQ1RfQ09QWTogUGFydGlhbDxSZWNvcmQ8SHViS2V5IHwgJ2Vjb21tZXJjZScsIHsgbmFtZTogc3RyaW5nOyBsaW5lOiBzdHJpbmcgfT4+ID0geworY29uc3QgRElTVFJJQ1RfQ09QWTogUGFydGlhbDxSZWNvcmQ8SHViS2V5LCB7IG5hbWU6IHN0cmluZzsgbGluZTogc3RyaW5nIH0+PiA9IHsKICAgdHJhdmVsOiB7IG5hbWU6ICdUcmF2ZWwnLCBsaW5lOiAnWW91ciB3b3JsZCwgcGxhbm5lZCB5b3VyIHdheS4nIH0sCiAgIG51dHJpdGlvbjogeyBuYW1lOiAnTnV0cml0aW9uJywgbGluZTogJ1lvdXIgZm9vZCwgcGVyc29uYWxpemVkIHRvIHlvdS4nIH0sCiAgIGRhdGluZzogeyBuYW1lOiAnTWF0Y2htYWtpbmcnLCBsaW5lOiAnWW91ciBjb25uZWN0aW9uLCBpbnRlbGxpZ2VudGx5IG1hdGNoZWQuJyB9LApAQCAtODIsMjUgKzg2LDIzIEBACiAgIGJlYXV0eTogeyBuYW1lOiAnQmVhdXR5JywgbGluZTogJ1lvdXIgbG9vaywgeW91ciB3YXkuJyB9LAogICBzb2NpYWw6IHsgbmFtZTogJ1NvY2lhbCBMaWZlJywgbGluZTogJ1lvdXIgcGVvcGxlLiBZb3VyIGNvbW11bml0aWVzLiBZb3VyIHdvcmxkLicgfSwKICAgYXN0cm9sb2d5OiB7IG5hbWU6ICdBc3Ryb2xvZ3knLCBsaW5lOiAnWW91ciBzdGFycy4gWW91ciBqb3VybmV5LiBZb3VyIHRpbWluZy4nIH0sCi0gIGVjb21tZXJjZTogeyBuYW1lOiAnRS1Db21tZXJjZScsIGxpbmU6ICdFdmVyeXRoaW5nIHlvdSBuZWVkLCBjdXJhdGVkIGZvciB5b3UuJyB9LAogfTsKIAogLyoqCiAgKiBUSEUgTkFNRSBBIERJU1RSSUNUIFdFQVJTLCBJTiBPTkUgUExBQ0UuCiAgKgotICogVGhyZWUgc291cmNlcywgaW4gb3JkZXI6IHRoZSBiaWxsYm9hcmQgY29weSBhYm92ZSwgdGhlIGh1YiBjb25maWcsIGFuZCBvbmUKLSAqIGxpdGVyYWwgZm9yIEUtQ29tbWVyY2UsIHdoaWNoIGhhcyBubyBodWIuIEl0IHdhcyB3cml0dGVuIGlubGluZSBpbiB0aGUgbWFwCi0gKiBiZWZvcmUsIHdoaWNoIHdhcyBmaW5lIHdoaWxlIHRoZSBtYXAgd2FzIHRoZSBvbmx5IHRoaW5nIHRoYXQgbmVlZGVkIGl0IOKAlAotICogdGhlIHJ1biBpcyBub3cgU09SVEVEIGJ5IHRoaXMgbmFtZSwgYW5kIGEgc29ydCBrZXllZCBvbiBvbmUgc3BlbGxpbmcgd2hpbGUKLSAqIHRoZSBzY3JlZW4gcHJpbnRzIGFub3RoZXIgaXMgdGhlIGtpbmQgb2YgYnVnIHRoYXQgbG9va3MgbGlrZSBhIG15c3RlcnkuCisgKiBUd28gc291cmNlcyBub3c6IHRoZSBiaWxsYm9hcmQgY29weSBhYm92ZSwgdGhlbiB0aGUgaHViIGNvbmZpZy4gVGhlcmUgdXNlZAorICogdG8gYmUgYSB0aGlyZCDigJQgYSBsaXRlcmFsIGZvciBFLUNvbW1lcmNlLCB0aGUgb25lIGRpc3RyaWN0IHdpdGggbm8gaHViCisgKiBiZWhpbmQgaXQg4oCUIGFuZCBldmVyeSBwbGFjZSB0aGlzIGtleSB3YXMgaGFuZGxlZCBjYXJyaWVkIGEgYnJhbmNoIGZvciB0aGF0CisgKiBvbmUgZXhjZXB0aW9uLiBUaGUgcnVuIGlzIFNPUlRFRCBieSB0aGlzIG5hbWUsIGFuZCBhIHNvcnQga2V5ZWQgb24gb25lCisgKiBzcGVsbGluZyB3aGlsZSB0aGUgc2NyZWVuIHByaW50cyBhbm90aGVyIGlzIHRoZSBraW5kIG9mIGJ1ZyB0aGF0IGxvb2tzIGxpa2UKKyAqIGEgbXlzdGVyeSwgc28gaXQgaXMgd29ydGggaGF2aW5nIGV4YWN0bHkgb25lIGFuc3dlciBoZXJlLgogICovCi1mdW5jdGlvbiBkaXN0cmljdE5hbWUoa2V5OiBQYW5lbFsna2V5J10pOiBzdHJpbmcgewotICBjb25zdCBjb3B5ID0gRElTVFJJQ1RfQ09QWVtrZXldOwotICBpZiAoY29weSkgcmV0dXJuIGNvcHkubmFtZTsKLSAgcmV0dXJuIGtleSA9PT0gJ2Vjb21tZXJjZScgPyAnRS1Db21tZXJjZScgOiBIVUJTW2tleV0ubmFtZTsKK2Z1bmN0aW9uIGRpc3RyaWN0TmFtZShrZXk6IEh1YktleSk6IHN0cmluZyB7CisgIHJldHVybiBESVNUUklDVF9DT1BZW2tleV0/Lm5hbWUgPz8gSFVCU1trZXldLm5hbWU7CiB9CiAKLWludGVyZmFjZSBQYW5lbCB7IGtleTogSHViS2V5IHwgJ2Vjb21tZXJjZSc7IGltZzogc3RyaW5nOyB9CitpbnRlcmZhY2UgUGFuZWwgeyBrZXk6IEh1YktleTsgaW1nOiBzdHJpbmc7IH0KIGNvbnN0IFBBTkVMUzogUGFuZWxbXSA9IFsKICAgeyBrZXk6ICd0cmF2ZWwnLCBpbWc6ICd0cmF2ZWwtaHViLndlYnAnIH0sCiAgIHsga2V5OiAnYXN0cm9sb2d5JywgaW1nOiAnYXN0cm9sb2d5LWh1Yi53ZWJwJyB9LApAQCAtMTE3LDcgKzExOSw2IEBACiAgIC8vIFdhaXRpbmcgb24gaXRzIHBob3RvZ3JhcGguIFRoZSBwbGF0ZSBpcyBidWlsdCBmb3IgdGhhdCDigJQgdGhlIHdlbGwgaXMgbGl0CiAgIC8vIGFuZCB0aGUgcGljdHVyZSBmYWRlcyBvbnRvIGl0IHdoZW4gbG9jYWwtc2VydmljZXMud2VicCBsYW5kcyBpbiBhc3NldHMvaW1nLgogICB7IGtleTogJ3NlcnZpY2VzJywgaW1nOiAnbG9jYWwtc2VydmljZXMud2VicCcgfSwKLSAgeyBrZXk6ICdlY29tbWVyY2UnLCBpbWc6ICdlLWNvbW1lcmNlLndlYnAnIH0sCiBdOwogCiAvKioKQEAgLTIyMCwxMiArMjIxLDE0IEBACiAgICAgICAgIDwvZGl2PgogICAgICAgICA8ZGl2IGNsYXNzTmFtZT0iZGlzdHJpY3QtcnVuIj4KICAgICAgICAgICB7RElTVFJJQ1RTLm1hcCgocCwgcGFuZWxJbmRleCkgPT4gewotICAgICAgICAgICAgY29uc3QgY2ZnID0gcC5rZXkgPT09ICdlY29tbWVyY2UnID8gbnVsbCA6IEhVQlNbcC5rZXldOwotICAgICAgICAgICAgY29uc3Qgc29vbiA9ICFjZmcgfHwgY2ZnLml0ZW1zLmxlbmd0aCA9PT0gMDsgICAvLyBhIGh1YiB3aXRoIG5vIGlubmVyIHBhZ2VzIGlzIG5vdCB5ZXQgYSByb29tCi0gICAgICAgICAgICBjb25zdCBjb3B5ID0gRElTVFJJQ1RfQ09QWVtwLmtleV07CisgICAgICAgICAgICBjb25zdCBjZmcgPSBIVUJTW3Aua2V5XTsKKyAgICAgICAgICAgIGNvbnN0IHNvb24gPSBjZmcuaXRlbXMubGVuZ3RoID09PSAwOyAgIC8vIGEgaHViIHdpdGggbm8gaW5uZXIgcGFnZXMgaXMgbm90IHlldCBhIHJvb20KICAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBkaXN0cmljdE5hbWUocC5rZXkpOwotICAgICAgICAgICAgY29uc3QgdGFnID0gY29weT8ubGluZSA/PyAoY2ZnID8gY2ZnLm5hbWUgOiAnVmV0dGVkIHByb2R1Y3RzLiBPbmx5IHRoZSBiZXN0LicpOwotICAgICAgICAgICAgY29uc3QgdG8gPSBjZmcgPyAoY2ZnLml0ZW1zWzBdPy5wYXRoID8/IGNmZy5iYWNrUGF0aCkgOiBudWxsOworICAgICAgICAgICAgY29uc3QgdGFnID0gRElTVFJJQ1RfQ09QWVtwLmtleV0/LmxpbmUgPz8gY2ZnLm5hbWU7CisgICAgICAgICAgICAvLyBBIHJvb20gbm9ib2R5IGNhbiBlbnRlciBpcyBub3QgbGlua2VkLCBvbmx5IGxhYmVsbGVkLiBObyBkaXN0cmljdAorICAgICAgICAgICAgLy8gaXMgaW4gdGhhdCBzdGF0ZSB0b2RheTsgdGhlIGJyYW5jaCBzdGF5cyBiZWNhdXNlIHRoZSBuZXh0IG9uZSB0bworICAgICAgICAgICAgLy8gYmUgYnVpbHQgd2lsbCBwYXNzIHRocm91Z2ggaXQgYmVmb3JlIGl0cyBwYWdlcyBleGlzdC4KKyAgICAgICAgICAgIGNvbnN0IHRvID0gc29vbiA/IG51bGwgOiAoY2ZnLml0ZW1zWzBdPy5wYXRoID8/IGNmZy5iYWNrUGF0aCk7CiAgICAgICAgICAgICBjb25zdCBpbm5lciA9ICgKICAgICAgICAgICAgICAgPD4KICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT0iaHViLXBsYXRlLWFydCI+CkBAIC0yMzksNyArMjQyLDcgQEAKICAgICAgICAgICAgICAgICA8L2Rpdj4KICAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzTmFtZT0iaHViLXBsYXRlLWZvb3QiPgogICAgICAgICAgICAgICAgICAgPHNwYW4gY2xhc3NOYW1lPSJodWItcGxhdGUtaWNvbiIgYXJpYS1oaWRkZW4+Ci0gICAgICAgICAgICAgICAgICAgIDxJY29uIG5hbWU9eyhwLmtleSAhPT0gJ2Vjb21tZXJjZScgJiYgSFVCX0lDT05bcC5rZXldKSB8fCAncHJvZHVjdCd9IHNpemU9ezMwfSBzdHJva2VXaWR0aD17Mn0gLz4KKyAgICAgICAgICAgICAgICAgICAgPEljb24gbmFtZT17SFVCX0lDT05bcC5rZXldID8/ICdwcm9kdWN0J30gc2l6ZT17MzB9IHN0cm9rZVdpZHRoPXsyfSAvPgogICAgICAgICAgICAgICAgICAgPC9zcGFuPgogICAgICAgICAgICAgICAgICAgPGRpdiBjbGFzc05hbWU9Imh1Yi1wbGF0ZS1zYWlkIj4KICAgICAgICAgICAgICAgICAgICAgPGgyPntuYW1lfTwvaDI+Cg==
B64EOF

WANT="4a33ac2d8cf540d208466f73ccff1a932deb31afa595fbe837b25bf7c0f429d1"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

# 257 KB of photograph nothing renders any more. One `git checkout` on the
# commit before this brings it back if E-Commerce is ever built.
rm -f together-city-react/public/assets/img/e-commerce.webp
echo "== artwork removed"

# Nothing may still be pointing at either of them.
if grep -rn "ecommerce\|e-commerce\.webp" together-city-react/src --include=*.ts --include=*.tsx | grep -v legal-data.ts; then
  echo "!! Something still references E-Commerce. Look at the lines above."; exit 1
fi
echo "== no references left (the legal pages' prose about e-commerce law is not one)"

cd together-city-react
npx tsc --noEmit
npx vitest run
node scripts/a11y-audit.mjs
node scripts/lint-ceiling.mjs
npx vite build
cd ..

git add together-city-react/src/pages/Home.tsx \
        together-city-react/public/assets/img/e-commerce.webp
git commit -F - <<'MSG'
E-Commerce was never a room

The owner asked for it to go. Alphabetical order had just moved it from last to
third, which is what made the problem visible: the third plate a visitor walked
past said "Coming soon" over a photograph of a shop that does not exist. In an
order nobody could predict it read as a placeholder at the end of a list; on
the way in, it reads as the city's third district being shut.

IT WAS THE ONLY DISTRICT WITHOUT A HUB, AND EVERY PLACE ITS KEY WAS HANDLED
CARRIED A BRANCH FOR THAT. `Panel['key']` was `HubKey | 'ecommerce'`, so the
config lookup had a ternary, the icon lookup had a `&&`, `districtName` had a
literal fallback, and the tagline had a string that lived nowhere else in the
application. All of it existed to describe one exception. The union is now
`HubKey`, and the four branches are gone with it — the diff removes more
special-casing than it removes district.

THE FOOT GRID ALREADY HID IT, WHICH IS ITS OWN SMALL LESSON. `PAVILIONS` had
thirteen entries and the grid rendered `PAVILIONS.slice(0, 12)`. That slice
looked like a cap on a grid and was really a way of keeping one entry in the
array and off the screen — data and its presentation disagreeing quietly. The
entry is gone and the slice with it; `FALLBACK` is `PAVILIONS`, twelve tiles,
six across and two down, because that is what the array now holds.

`public/assets/img/e-commerce.webp` is deleted too: 257 KB nothing renders.
It is one `git checkout` away if E-Commerce is ever built.

WHAT IS DELIBERATELY LEFT. The E-Commerce building is still in the homepage
photograph, unzoned and unclickable, exactly as the News building has always
been — the render is one image and the city in it is not a menu. The legal
pages still discuss e-commerce law, which is about the marketplace this
application intermediates and not about a district.

Thirteen districts remain, and they now match the thirteen hub tabs above them
one for one: Astrology, Beauty, Entertainment, Financial, Fitness, Jobs, Local
Services, Matchmaking, Medical, Nutrition, Real Estate, Social Life, Travel.

tsc clean, vitest all green, a11y 0, lint at ceiling, vite build clean.

MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo " Thirteen districts, one per hub tab, still A to Z."
echo "==============================================================="
