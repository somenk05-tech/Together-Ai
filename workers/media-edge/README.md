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

1. **Pick the host, and give it its own.** `cdn.togethercity.tech`, an A/AAAA
   or CNAME record **proxied** (orange cloud). Put `<host>/m/*` in `pattern`.

   Not `media.togethercity.tech` unless you have checked what is on it. If that
   name is an R2 public-bucket custom domain it is a CNAME, and a Worker
   *Custom Domain* cannot be created over a CNAME at all — you would have to
   disconnect the public bucket first, taking every public image down. A
   *Route* (what `wrangler.toml` uses) claims only `/m/*` and leaves the rest
   of the host alone, which may well be fine over an R2 domain; the docs do not
   say so, and a separate host makes the question disappear.

2. `bucket_name` in `wrangler.toml` → the value of `MEDIA_PRIVATE_BUCKET`.
3. `npx wrangler secret put LINK_SECRET` → **the same value as the API's
   `JWT_ACCESS_SECRET`**. Both sides derive the media key from it with the same
   domain string; nothing else is shared.
4. `npx wrangler deploy`
5. On the API, set `MEDIA_CDN_BASE=https://<that host>`.

Until step 5, the API keeps minting presigned URLs and nothing changes. That
fallback is deliberate: a missing or wrong variable must not take every
photograph in the city off the screen.

### Two things NOT to do

**No Cache Rule is needed.** "Only certain file types are cached by default"
is true of Cloudflare's ordinary cache path, which this does not use: the
Worker stores what it read with `cache.put`, explicitly, whatever the type.

**Do not enable Tiered Cache for this host expecting it to help.** `cache.put`
is documented as incompatible with tiered caching. Cloudflare's advice to pair
Smart Tiered Cache with R2 is for a *public* bucket served straight off a
custom domain, where the edge fetches over the network and a tier can sit near
the bucket. This Worker reads through an R2 **binding** and caches what it
read, so there is no fetch for a tier to be in front of.

## Checking it

    curl -sI "https://<host>/m/<token>" | grep -i x-tc-cache

`x-tc-cache: miss`, then `hit` on the second request. **Not**
`cf-cache-status`: that header is documented for Cloudflare's ordinary cache
path, and what the Cache API does with it is not — the Worker answers for its
own cache instead, which is the only thing in the request that knows.

Test on the real host. The Cache API **does not work on `workers.dev`**, so a
`*.workers.dev` smoke test will show a miss every time and tell you nothing
about caching. It will still tell you the token verification and the bucket
binding work, which is worth doing first.

A bad or expired token is a `404`, never a `403` — a 403 tells whoever is
holding the string that they found something real. The token is checked
*before* the cache is consulted, so an expired one can never reach a stored
object.

## What it does not do

It does not know who is asking. Audience is decided when the feed is read, by
the API, against live rows. This serves a bearer link bounded by its window,
which is exactly what the presigned URL it replaces did — see the long note in
`src/media/media-link.ts` for why the token names no viewer.
