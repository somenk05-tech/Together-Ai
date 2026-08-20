#!/bin/bash
# land-nav-fits.sh — the hub tab row fits at every window width. The three-step
# font ladder becomes one fluid size fitted to measurement, with tracking and
# gaps sliding alongside it; the action captions give way before the hub names
# do; and below 1024 the row hands over to the burger that is already there.
#
# FRONTEND ONLY (together-city-react). Push, and Vercel ships it.
set -euo pipefail

cd "$(dirname "$0")"
[ -d together-city-react ] || { echo "!! Run this from the Together-Ai repo root."; exit 1; }

LOG="$(git log --oneline -40)"
MARK="The plate says which room it is"
case "$LOG" in
  *"$MARK"*) ;;
  *) echo "!! This patch applies on top of \"$MARK\" — run land-hub-names.sh first."; exit 1 ;;
esac
NEEDS="Thirteen names on one line"
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
LS0tIGEvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL2xheW91dC5jc3MKKysrIGIvdG9nZXRoZXItY2l0eS1yZWFjdC9zcmMvc3R5bGVzL2xheW91dC5jc3MKQEAgLTUsNyArNSw3IEBACiAgICB0aGUgb2xkIGZpbGUgbWl4ZWQgInRoZSBoZWFkZXIgaXMgNzhweCB0YWxsIiB3aXRoICJ0aGUgaGVhZGVyIGlzIHdoaXRlIiwKICAgIHNvIGNoYW5naW5nIHRoZSBtYXRlcmlhbCBtZWFudCBlZGl0aW5nIHRoZSBsYXlvdXQuCiAgICA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi8KLS50Yy1oZWFkZXIgeyAtLWNoaXAtZnM6IDExLjVweDsgcG9zaXRpb246IGZpeGVkOyB0b3A6IHZhcigtLXNhZmUtdG9wKTsgbGVmdDogMDsgcmlnaHQ6IDA7IGhlaWdodDogdmFyKC0taGVhZGVyLWgpOyB6LWluZGV4OiAxMDA7IGRpc3BsYXk6IGZsZXg7IGZsZXgtZGlyZWN0aW9uOiBjb2x1bW47IGp1c3RpZnktY29udGVudDogc3BhY2UtYmV0d2VlbjsgZ2FwOiAzcHg7IHBhZGRpbmc6IDhweCAyNHB4IDRweDsgY29sb3I6IHZhcigtLWluayk7IH0KKy50Yy1oZWFkZXIgeyAtLWNoaXAtZnM6IGNsYW1wKDkuNXB4LCAwLjU4dncgKyAzcHgsIDExLjVweCk7IHBvc2l0aW9uOiBmaXhlZDsgdG9wOiB2YXIoLS1zYWZlLXRvcCk7IGxlZnQ6IDA7IHJpZ2h0OiAwOyBoZWlnaHQ6IHZhcigtLWhlYWRlci1oKTsgei1pbmRleDogMTAwOyBkaXNwbGF5OiBmbGV4OyBmbGV4LWRpcmVjdGlvbjogY29sdW1uOyBqdXN0aWZ5LWNvbnRlbnQ6IHNwYWNlLWJldHdlZW47IGdhcDogM3B4OyBwYWRkaW5nOiA4cHggMjRweCA0cHg7IGNvbG9yOiB2YXIoLS1pbmspOyB9CiAvKiBUd28tcm93IGhlYWRlcjogUm93IDEgY2VudHJlZCBsb2dvIMK3IFJvdyAyIGh1YiB0YWJzIChsZWZ0KSArIGFjdGlvbnMgKHJpZ2h0KSBvbiBvbmUgbGluZS4KICAgIFRoZSBidXJnZXIgaXMgcGlubmVkIGxlZnQgb24gUm93IDEgKG1vYmlsZSkgd2l0aG91dCBzaGlmdGluZyB0aGUgY2VudHJlZCBsb2dvLiAqLwogLnRjLWhlYWRlci10b3AgeyBwb3NpdGlvbjogcmVsYXRpdmU7IGRpc3BsYXk6IGZsZXg7IGFsaWduLWl0ZW1zOiBjZW50ZXI7IGp1c3RpZnktY29udGVudDogY2VudGVyOyB3aWR0aDogMTAwJTsgbWluLWhlaWdodDogMzRweDsgfQpAQCAtMTYsNyArMTYsNyBAQAogLnRjLWxvZ28gLm1hcmsgaW1nIHsgZGlzcGxheTogYmxvY2s7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDEwMCU7IG9iamVjdC1maXQ6IGNvbnRhaW47IGZpbHRlcjogdmFyKC0tbG9nby1maWx0ZXIpOyB9CiAudGMtbG9nbyAud29yZCB7IGZvbnQtc2l6ZTogMTVweDsgbGV0dGVyLXNwYWNpbmc6IC0uMDJlbTsgd2hpdGUtc3BhY2U6IG5vd3JhcDsgfQogLyogUm93IDIg4oCUIGh1YiB0YWJzIHB1c2hlZCBsZWZ0ICh3aXRoIGEgc21hbGwgbGVmdCBpbmRlbnQpLCBhY3Rpb24gZ3JvdXAgcHVzaGVkIHJpZ2h0LCBhbGwgb24gb25lIGxpbmUuICovCi0udGMtbmF2cm93IHsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiAxOHB4OyB3aWR0aDogMTAwJTsgbWluLXdpZHRoOiAwOyB9CisudGMtbmF2cm93IHsgZGlzcGxheTogZmxleDsgYWxpZ24taXRlbXM6IGNlbnRlcjsgZ2FwOiBjbGFtcCgxMHB4LCAxLjF2dywgMThweCk7IHdpZHRoOiAxMDAlOyBtaW4td2lkdGg6IDA7IH0KIC50Yy1uYXYgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGZsZXgtc3RhcnQ7IGdhcDogNnB4OyBtaW4td2lkdGg6IDA7IHBhZGRpbmctbGVmdDogMzJweDsgb3ZlcmZsb3cteDogYXV0bzsgb3ZlcmZsb3cteTogaGlkZGVuOyBzY3JvbGxiYXItd2lkdGg6IG5vbmU7IH0KIC50Yy1uYXY6Oi13ZWJraXQtc2Nyb2xsYmFyIHsgZGlzcGxheTogbm9uZTsgfQogLyogVGhlIHRhYnMgYXJlIHRoZSBvbmUgcm93IGluIHRoZSBhcHBsaWNhdGlvbiBzZXQgaW4gY2FwaXRhbHMsIGFuZCByZWxpZWYuY3NzCkBAIC0yOCw4ICsyOCwzMyBAQAogLnRjLWFjdGlvbnMgeyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDEwcHg7IGZsZXgtc2hyaW5rOiAwOyB9CiAudGMtYWN0aW9uYmFyIGEsIC50Yy1hY3Rpb25iYXIgYnV0dG9uLCAudGMtYWN0aW9ucyBhLCAudGMtYWN0aW9ucyBidXR0b24geyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBnYXA6IDZweDsgaGVpZ2h0OiAzMnB4OyBwYWRkaW5nOiAwIDEycHg7IGZvbnQtc2l6ZTogdmFyKC0tY2hpcC1mcyk7IGxldHRlci1zcGFjaW5nOiAwOyBmb250LXdlaWdodDogNjAwOyB3aGl0ZS1zcGFjZTogbm93cmFwOyB0ZXh0LXRyYW5zZm9ybTogbm9uZTsgcG9zaXRpb246IHJlbGF0aXZlOyB9CiAvKiBrZWVwIGFsbCAxMiBzZWN0b3JzICsgYWN0aW9ucyBvbiBvbmUgbGluZSDigJQgc2hyaW5rIHRhYnMvZ2FwcyBvbiBuYXJyb3dlciBkZXNrdG9wcyAqLwotQG1lZGlhIChtYXgtd2lkdGg6IDE1NjBweCkgeyAudGMtaGVhZGVyIHsgLS1jaGlwLWZzOiAxMC41cHg7IH0gLnRjLW5hdnJvdyB7IGdhcDogMTRweDsgfSAudGMtbmF2IHsgZ2FwOiA1cHg7IHBhZGRpbmctbGVmdDogMjRweDsgfSAudGMtYWN0aW9uYmFyLCAudGMtYWN0aW9ucyB7IGdhcDogOHB4OyB9IH0KLUBtZWRpYSAobWF4LXdpZHRoOiAxMzQwcHgpIHsgLnRjLWhlYWRlciB7IC0tY2hpcC1mczogOS41cHg7IH0gLnRjLW5hdnJvdyB7IGdhcDogMTJweDsgfSAudGMtbmF2IHsgZ2FwOiA0cHg7IHBhZGRpbmctbGVmdDogMTRweDsgfSAudGMtYWN0aW9uYmFyLCAudGMtYWN0aW9ucyB7IGdhcDogNnB4OyB9IH0KKy8qIOKUgOKUgCBUSElSVEVFTiBOQU1FUyBPTiBPTkUgTElORSwgQVQgRVZFUlkgV0lEVEgg4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSA4pSACisgICBUaGUgdGFiIHJvdyBzdGVwcGVkIGRvd24gaW4gdGhyZWUgc2l6ZXMgYW5kIGNyb3BwZWQgYmV0d2VlbiBldmVyeSBvbmUgb2YKKyAgIHRoZW06IG1lYXN1cmVkIHdpdGggdGhlIHJlYWwgZmFjZSBsb2FkZWQsIFRSQVZFTCB3YXMgY3V0IG9mZiBhdCBldmVyeSB3aW5kb3cKKyAgIG5hcnJvd2VyIHRoYW4gYWJvdXQgMTUwMHB4LCB3aGljaCBpcyBtb3N0IGxhcHRvcHMuIEEgc3RlcCBsYWRkZXIgY2Fubm90IGZpeAorICAgdGhpcyDigJQgdGhlIHJvdydzIHdpZHRoIGdyb3dzIHdpdGggdGhlIFRZUEUgd2hpbGUgdGhlIHNwYWNlIGZvciBpdCBncm93cyB3aXRoCisgICB0aGUgV0lORE9XIE1JTlVTIGEgZml4ZWQgfjMwMHB4IG9mIGxvY2t1cCBhbmQgYWN0aW9ucywgc28gdGhlIHR3byBjdXJ2ZXMKKyAgIGNyb3NzIGluc2lkZSBldmVyeSBiYW5kIGFuZCB0aGUgY3JvcCBsYW5kcyBqdXN0IGFib3ZlIGVhY2ggYnJlYWtwb2ludCwgd2hlcmUKKyAgIHRoZSB0eXBlIGhhcyBvbmx5IGp1c3QganVtcGVkIHVwLgorICAgU28gdGhlIHNpemUgaXMgZmx1aWQsIG9uIGEgbGluZSBmaXR0ZWQgdG8gbWVhc3VyZW1lbnQgcmF0aGVyIHRoYW4gZ3Vlc3NlZDoKKyAgIDExLjVweCB3aGVyZSB0aGVyZSBpcyByb29tLCBzbGlkaW5nIHRvIDkuNXB4LCB3aXRoIHRoZSB0cmFja2luZyAocmVsaWVmLmNzcykKKyAgIGFuZCB0aGUgZ2FwcyBzbGlkaW5nIGFsb25nc2lkZSBpdC4gYDAuNTh2dyArIDNweGAgYW5kIG5vdCBhIGJhcmUgdncg4oCUIGFuCisgICBpbnRlcmNlcHQgaXMgd2hhdCBtYWtlcyBhIGZsdWlkIHNpemUgdHJhY2sgQVZBSUxBQkxFIHNwYWNlIHJhdGhlciB0aGFuIHRvdGFsCisgICB3aWR0aCB3aGVuIGEgZml4ZWQgY29zdCBzaXRzIGJlc2lkZSBpdC4gU2FtcGxlZCBldmVyeSBsaWtlbHkgd2lkdGggZnJvbSAxMDI0CisgICB0byAzMjAwOiB0aGUgdGlnaHRlc3QgZml0IGlzICs0MHB4IG9mIGNsZWFyIHNwYWNlLiAqLworQG1lZGlhIChtYXgtd2lkdGg6IDE1NjBweCkgeyAudGMtYWN0aW9uYmFyLCAudGMtYWN0aW9ucyB7IGdhcDogOHB4OyB9IH0KK0BtZWRpYSAobWF4LXdpZHRoOiAxMzQwcHgpIHsgLnRjLWFjdGlvbmJhciwgLnRjLWFjdGlvbnMgeyBnYXA6IDZweDsgfSB9CisvKiBUaGUgYWN0aW9uIFdPUkRTIGdvIGJlZm9yZSB0aGUgaHViIG5hbWVzIGRvLiBBIGh1YiBuYW1lIGlzIHRoZSBvbmx5IHdheSB0bworICAgcmVhY2ggdGhhdCBodWIgZnJvbSB0aGlzIHJvdzsgTWFpbCwgQ2hhdCBhbmQgQWxlcnRzIGtlZXAgdGhlaXIgaWNvbnMgYW5kCisgICB0aGVpciBhcmlhLWxhYmVscyBhbmQgbG9zZSBub3RoaW5nIGJ1dCBhIGNhcHRpb24uIFRoaXMgdXNlZCB0byBoYXBwZW4gYXQKKyAgIDExMDAsIHdoaWNoIHdhcyB0b28gbGF0ZSDigJQgdGhlIG5hbWVzIHJhbiBvdXQgb2Ygcm9vbSBmaXJzdC4gKi8KK0BtZWRpYSAobWF4LXdpZHRoOiAxMjQwcHgpIHsgLnRjLWFjdGlvbmJhciAubGFiLCAudGMtYWN0aW9ucyAubGFiIHsgZGlzcGxheTogbm9uZTsgfSB9CisvKiBBTkQgQkVMT1cgMTAyNCBUSEUgUk9XIFNUT1BTIFBSRVRFTkRJTkcuIFRoaXJ0ZWVuIGxldHRlcnNwYWNlZCBuYW1lcywgZm91cgorICAgYWN0aW9uIGljb25zIGFuZCB0aGUgbG9ja3VwIGRvIG5vdCBmaXQgb24gb25lIGxpbmUgYXQgOTAwcHggYXQgYW55IHNpemUgYQorICAgY2l0aXplbiBzaG91bGQgYmUgYXNrZWQgdG8gcmVhZDsgdGhlIGhvbmVzdCBjaG9pY2VzIGFyZSB0byBjcm9wIHRoZW0gb3IgdG8KKyAgIGhhbmQgb3ZlciwgYW5kIHRoZSBidXJnZXIgYW5kIGl0cyBkcmF3ZXIgYXJlIGFscmVhZHkgb24gc2NyZWVuIGZyb20gMTEwMAorICAgZG93bi4gV2hhdCBpcyBsb3N0IGlzIGEgcm93IHRoYXQgd2FzIG9ubHkgZXZlciBzaG93aW5nIGVpZ2h0IG9mIHRoaXJ0ZWVuLiAqLworQG1lZGlhIChtYXgtd2lkdGg6IDEwMjNweCkgeyAudGMtbmF2IHsgZGlzcGxheTogbm9uZTsgfSB9CiAudGMtYXZhdGFyIHsgd2lkdGg6IDM2cHg7IGhlaWdodDogMzZweDsgYm9yZGVyLXJhZGl1czogNTAlOyBkaXNwbGF5OiBmbGV4OyBhbGlnbi1pdGVtczogY2VudGVyOyBqdXN0aWZ5LWNvbnRlbnQ6IGNlbnRlcjsgZm9udC1zaXplOiAxMnB4OyBmb250LXdlaWdodDogNzAwOyBmbGV4LXNocmluazogMDsgb3ZlcmZsb3c6IGhpZGRlbjsgfQogCiAudGMtbWFpbiB7IHBhZGRpbmctdG9wOiBjYWxjKHZhcigtLWhlYWRlci1oKSArIHZhcigtLXNhZmUtdG9wKSk7IG1pbi1oZWlnaHQ6IDEwMHZoOyB9CkBAIC04Miw3ICsxMDcsNiBAQAogICAudGMtaGVhZGVyIHsgcGFkZGluZzogNnB4IDEycHg7IH0KICAgLnRjLW5hdiB7IHBhZGRpbmctbGVmdDogMDsgfQogICAvKiBpY29ucy1vbmx5IGFjdGlvbnMgb24gdGhlIHJpZ2h0IHNvIHRoZSB0YWJzICsgYWN0aW9ucyBsaW5lIHN0aWxsIGZpdHMgKi8KLSAgLnRjLWFjdGlvbmJhciAubGFiLCAudGMtYWN0aW9ucyAubGFiIHsgZGlzcGxheTogbm9uZTsgfQogICAudGMtc2lkZSB7IHBvc2l0aW9uOiBmaXhlZDsgdG9wOiAwOyBsZWZ0OiAwOyBib3R0b206IDA7IHotaW5kZXg6IDIwMDsgdHJhbnNmb3JtOiB0cmFuc2xhdGVYKC0xMDAlKTsgdHJhbnNpdGlvbjogdHJhbnNmb3JtIC4yOHMgZWFzZTsgcGFkZGluZy10b3A6IGNhbGMoMjhweCArIHZhcigtLXNhZmUtdG9wKSk7IGJvcmRlci1yYWRpdXM6IDAgdmFyKC0tci01KSB2YXIoLS1yLTUpIDA7IH0KICAgLnRjLXNpZGUub3BlbiB7IHRyYW5zZm9ybTogdHJhbnNsYXRlWCgwKTsgfQogICAvKiBUaGUgcGhvbmUgZ3V0dGVyIGNvbWVzIGZyb20gLS1wYWdlLWd1dHRlcidzIG93biBjbGFtcCBub3cuICovCi0tLSBhL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL3N0eWxlcy9yZWxpZWYuY3NzCisrKyBiL3RvZ2V0aGVyLWNpdHktcmVhY3Qvc3JjL3N0eWxlcy9yZWxpZWYuY3NzCkBAIC02MDAsMTIgKzYwMCwyMCBAQAogfQogLnRjLW5hdiB7CiAgIGJhY2tncm91bmQ6IG5vbmU7IGJveC1zaGFkb3c6IG5vbmU7IHBhZGRpbmc6IDA7IGJvcmRlci1yYWRpdXM6IDA7Ci0gIGdhcDogY2xhbXAoMTRweCwgMS43dncsIDI2cHgpOyBmbGV4OiAxIDEgYXV0bzsKKyAgLyogVGhlIGdhcCBzbGlkZXMgd2l0aCB0aGUgdHlwZSDigJQgc2VlIHRoZSBub3RlIGluIGxheW91dC5jc3MuIFRoaXMgcnVsZSBsb2FkcworICAgICBhZnRlciBsYXlvdXQuY3NzIGFuZCBzbyBpdCBpcyB0aGUgb25lIHRoYXQgZGVjaWRlczsgYSBzZWNvbmQgZ2FwIHdyaXR0ZW4KKyAgICAgb3ZlciB0aGVyZSB3b3VsZCBiZSBhIHZhbHVlIG5vYm9keSBjb3VsZCBmaW5kLiAqLworICBnYXA6IGNsYW1wKDVweCwgLjg1dncsIDIwcHgpOyBmbGV4OiAxIDEgYXV0bzsKKyAgcGFkZGluZy1sZWZ0OiBjbGFtcCgwcHgsIDEuMnZ3LCAyMHB4KTsKIH0KIC50Yy1uYXYgYSB7CiAgIGJhY2tncm91bmQ6IG5vbmU7IGJveC1zaGFkb3c6IG5vbmU7IGJvcmRlcjogMDsgYm9yZGVyLXJhZGl1czogMDsKICAgcGFkZGluZzogMDsgaGVpZ2h0OiBhdXRvOwotICB0ZXh0LXRyYW5zZm9ybTogdXBwZXJjYXNlOyBsZXR0ZXItc3BhY2luZzogLjEzZW07IGZvbnQtd2VpZ2h0OiA2MDA7CisgIHRleHQtdHJhbnNmb3JtOiB1cHBlcmNhc2U7CisgIC8qIFRyYWNraW5nIHNsaWRlcyB3aXRoIHRoZSBzaXplIChzZWUgbGF5b3V0LmNzcykuIC4xM2VtIG9uIHRoaXJ0ZWVuCisgICAgIHVwcGVyY2FzZSBuYW1lcyB3YXMgYWJvdXQgZm91cnRlZW4gY2hhcmFjdGVycyBvZiBwdXJlIGFpciDigJQgdGhlIHNpbmdsZQorICAgICBiaWdnZXN0IHJlYXNvbiB0aGUgcm93IGRpZCBub3QgZml0LCBhbmQgdGhlIGNoZWFwZXN0IHRoaW5nIHRvIHNwZW5kLiAqLworICBsZXR0ZXItc3BhY2luZzogY2xhbXAoLjJweCwgLjA0MnZ3LCAuNjJweCk7IGZvbnQtd2VpZ2h0OiA2MDA7CiAgIGNvbG9yOiB2YXIoLS1tdXRlZCk7CiAgIHRyYW5zaXRpb246IGNvbG9yIHZhcigtLWR1ci1mYXN0KSB2YXIoLS1lYXNlKTsKIH0K
B64EOF

WANT="5b200931f338d0cc6597d3417fdff402612a194655ecde2a0279933c1a5bcc4d"
GOT="$(shasum -a 256 "$PATCH" | awk '{print $1}')"
[ "$GOT" = "$WANT" ] || { echo "!! Patch is corrupt."; echo "   want $WANT"; echo "   got  $GOT"; exit 1; }
echo "== patch verified"
git apply --check -C1 "$PATCH" || { echo "!! Patch does not apply cleanly. Nothing written."; exit 1; }
git apply -C1 "$PATCH"
echo "== applied"

cd together-city-react
npx tsc --noEmit
npx vitest run
npx eslint src || true
node scripts/lint-ceiling.mjs
node scripts/dead-export-audit.mjs
node scripts/motion-ceiling.mjs
node scripts/a11y-audit.mjs
node scripts/nav-audit.mjs
npx vite build
cd ..

git add together-city-react/src/styles/layout.css together-city-react/src/styles/relief.css
git commit -F - <<'MSG'
Thirteen names on one line, at every width

TRAVEL was cut off. Measured with the real face loaded, so was every window
narrower than about 1500px — which is most laptops, and which is why the owner
saw it and I had not.

WHY A STEP LADDER COULD NEVER HAVE FIXED IT. The row stepped 11.5 → 10.5 → 9.5
at 1560 and 1340. But the row's width grows with the TYPE, while the space for
it grows with the WINDOW MINUS a fixed cost — the lockup, four action buttons,
the gutters, about 300px that does not shrink. Two curves with different
slopes cross inside every band, so the crop always lands just above a
breakpoint, where the type has only just jumped up. Adding a fourth step moves
the crop; it does not remove it.

So the size is fluid and fitted to the measurement rather than guessed:

  --chip-fs: clamp(9.5px, 0.58vw + 3px, 11.5px)

`0.58vw + 3px` and not a bare vw, and the intercept is the whole point — a
fluid size has to track AVAILABLE space, not total width, when a fixed cost
sits beside it. The slope comes from five measured points (9.5px needs a
1038px window, 11.5px needs 1373px) and sits deliberately under that line.

THE TRACKING WAS THE CHEAPEST THING TO SPEND. `.13em` across thirteen
uppercase names is roughly fourteen characters of pure air — more than any
single hub name. It now slides with the size, clamp(.2px, .042vw, .62px), and
so do the gaps and the indent.

TWO ORDERING TRAPS WORTH RECORDING. The gap and the indent are set in
relief.css, not layout.css, because relief.css loads last (layout is
@imported at the top of index.css) — the first version of this fix wrote them
in layout.css, measured no change, and looked correct in the diff. And the
harness itself has to load the stylesheets in main.tsx's order and wait on
`document.fonts.ready`: with the fallback face the row measures ~7% wide and
every number is wrong in the safe direction, which is the worst direction to
be wrong in when you are computing a fit.

THE OTHER TWO MOVES, IN THE ORDER THINGS SHOULD GIVE WAY:
- Action captions hide at 1240 rather than 1100. A hub name is the only way to
  reach that hub from this row; Mail, Chat and Alerts keep their icons and
  their aria-labels and lose a word.
- Below 1024 the row hands over to the burger and drawer that are already on
  screen from 1100 down. Thirteen letterspaced names, four icons and a lockup
  do not fit at 900px at any size worth reading — the honest choices are to
  crop or to hand over, and what is lost is a row that was showing eight of
  your thirteen hubs anyway.

MEASURED: every width from 1024 to 2200 in 8px steps, real font, real cascade.
Cropped at none of them. Tightest fit is +36px of clear space at 1024, +49px
at 1280.

relief.spec 26/26.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_019qSREyzo69hB7j1ryn26SB
MSG
echo "== committed"

echo
echo "==============================================================="
echo " Landed: $NEEDS — push and Vercel ships it."
echo " All thirteen hubs visible from 1024px up. No crop, measured"
echo " every 8px to 2200."
echo "==============================================================="
