# media-edge

Serves post media from the **private** R2 bucket, at Cloudflare's edge, for a
token the API signs.

## Why

Presigned R2 URLs only work on `<account>.r2.cloudflarestorage.com` — R2's S3
API endpoint — and **Cloudflare does not cache that host**. So every photograph
in every feed page was fetched from storage on every request, from wherever the
bucket lives, with no edge in between. Caching a private R2 bucket requires a
custom domain, and a custom domain requires our own token rather than a
presigned one.

## Deploy

1. `bucket_name` in `wrangler.toml` → the value of `MEDIA_PRIVATE_BUCKET`.
2. `pattern` → the host you want to serve media from.
3. `npx wrangler secret put LINK_SECRET` → **the same value as the API's
   `JWT_ACCESS_SECRET`**. Both sides derive the media key from it with the same
   domain string; nothing else is shared.
4. `npx wrangler deploy`
5. On the API, set `MEDIA_CDN_BASE=https://<that host>`.

Until step 5, the API keeps minting presigned URLs and nothing changes. That
fallback is deliberate: a missing or wrong variable must not take every
photograph in the city off the screen.

## Checking it

    curl -I "https://<host>/m/<token>"

`cf-cache-status: HIT` on the second request is the thing this exists for.
A bad or expired token is a `404`, never a `403` — a 403 tells whoever is
holding the string that they found something real.

## What it does not do

It does not know who is asking. Audience is decided when the feed is read, by
the API, against live rows. This serves a bearer link bounded by its window,
which is exactly what the presigned URL it replaces did — see the long note in
`src/media/media-link.ts` for why the token names no viewer.
