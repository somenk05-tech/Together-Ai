# Two cities: the developer copy and the live site

Set up 16 Sep 2026. One codebase, two deployments, two databases.

| | Developer copy | Live site |
|---|---|---|
| Git branch | `develop` | `main` |
| Web (Vercel, project `together-ai`) | `dev.togethercity.app` | `togethercity.app` |
| API (Railway, project `abundant-creation`) | environment `development`, `dev-api.togethercity.app` | environment `production`, `api.togethercity.app` |
| Database | its own Postgres + Redis | the real one |
| `RELEASE_CHANNEL` | `dev` | `live` (also the default when unset) |
| Hubs shown | all of them | the ones the Go live button chose |
| Who can open it | you and the accounts in `DEV_COPY_ACCOUNTS` (Vercel login + that list) | everybody |

## The rule

**All work lands on `develop`.** Pushing `develop` updates the developer copy only.
Nothing reaches `main` except the **Go live** button at `dev.togethercity.app/dev`.

The button runs `.github/workflows/go-live.yml`, which:

1. writes the hubs you switched on into `together-city-chat/src/release/live-hubs.ts` on `develop`;
2. merges `develop` into `main` inside GitHub's runner;
3. applies every migration to an empty Postgres, type-checks the API, builds the API, and runs the exact web build Vercel runs — all on the merged tree, from a clean checkout;
4. only if all of that passes, pushes `develop` and `main` together.

A failure at any step pushes nothing; the live site keeps what it had. When `main` moves, Vercel and Railway deploy it as they always have (Railway runs `prisma migrate deploy` first).

**Go live sends everything on `develop`.** The hub switches hide whole districts on the live site, but unfinished changes inside a hub that *is* live go out with the press. Keep `develop` to work that is finished or sits in a hub that is switched to "Developer only".

### What a "Developer only" hub looks like on the live site

No door anywhere (header, drawer, home, grid, Search the city, Personalize's pills), and its address shows "Opening soon". Its API still answers, because the Digital Store reads the Beauty, Nutrition, Astrology and Pet endpoints. To refuse an API, use the kill switches on `/dev` as before.

Launch set (16 Sep): **Personalize, Digital Store, Local Market, Together TV**. Note that Personalize's pills and the Personalized Store both lead into districts that are "Developer only" at launch, so on the live site Personalize shows no pills and the Personalized Store has no profiles to read. Switch the districts on when they are ready.

---

## One-time setup (about 30 minutes)

### 1. Create `develop` — done by the landing script

`land-two-cities.sh` commits this work, creates `develop`, and moves your working copy onto it. Then:

```
git push -u origin main develop
```

### 2. Railway: the developer environment

In project **abundant-creation**:

1. Environments → **New environment** → **Duplicate** `production` → name it `development`. This copies the services and their variables and creates a **new, empty** Postgres and Redis for it.
2. In `development`, open the **Together-Ai** service → Settings → Source → **Branch: `develop`**. Do the same for the worker service if there is one.
3. Settings → Networking → **Custom domain** → `dev-api.togethercity.app` (Railway shows the CNAME to add in step 5).
4. Variables on the `development` Together-Ai service — change or add:

| Variable | Value |
|---|---|
| `RELEASE_CHANNEL` | `dev` |
| `GITHUB_RELEASE_TOKEN` | the token from step 4 below |
| `CORS_ORIGIN` | `https://dev.togethercity.app` |
| `PUBLIC_API_URL` | `https://dev-api.togethercity.app/api` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (the development Postgres — check it does **not** point at production) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (the development Redis) |
| `TURNSTILE_HOSTNAMES` | `dev.togethercity.app` (if set) |
| `MEDIA_CORS_ORIGINS` | `https://dev.togethercity.app` (if set) |
| `PAYMENTS_SANDBOX` | `on` — test payments on the copy, never real ones |
| `MEDIA_BUCKET` / `MEDIA_PRIVATE_BUCKET` / `MEDIA_PUBLIC_BASE_URL` | a separate R2 bucket pair is best; if you keep the production buckets, test uploads land beside real ones |

Leave `DEV_PAGE_ACCOUNTS` and `DEV_PAGE_PASSWORD` as they are.

`DEV_COPY_ACCOUNTS` (development only, added 17 Sep) — the handles that may sign in to or join the developer copy, comma-separated, e.g. `somen,shruti`. Unset, it follows `DEV_PAGE_ACCOUNTS`. It does **not** open `/dev` or show the Go live button: that stays `DEV_PAGE_ACCOUNTS`. Anyone on it also needs to get past Vercel's login on `dev.togethercity.app` (see 3.3).

5. On **production**, add `RELEASE_CHANNEL` = `live`. (Unset already means live; writing it down makes it visible on `/dev`.)

The developer database starts empty: migrations run on its first deploy, and you sign up again on `dev.togethercity.app`. Copying real citizens' data into it is possible but not advised.

### 3. Vercel: the developer web

In team **togethercity**, project **together-ai**:

1. Settings → Domains → **Add** `dev.togethercity.app` → **Connect to an environment: Preview**, Git branch **`develop`**.
2. Settings → Environment Variables → add, for **Preview**, branch **`develop`** only:
   - `VITE_API_URL` = `https://dev-api.togethercity.app/api`
   - `VITE_SOCKET_URL` = `https://dev-api.togethercity.app`
   - `VITE_TURNSTILE_SITE_KEY` = the same site key, if production has one (and add `dev.togethercity.app` to the widget's hostnames in Cloudflare)
3. Deployment Protection: **already on** (set 16 Sep) — Vercel Authentication for preview deployments. `dev.togethercity.app` opens only for members of the team; `togethercity.app` stays public.

`vercel.json` also sends `X-Robots-Tag: noindex` on `dev.togethercity.app`.

### 4. GitHub

1. github.com/settings/personal-access-tokens → **Generate new token** (fine-grained): resource owner `somenk05-tech`, only repository **Together-Ai**, permission **Actions: Read and write**. Put it in `GITHUB_RELEASE_TOKEN` on the Railway **development** environment only.
2. Repository → Settings → Actions → General → Workflow permissions → **Read and write permissions**, so the workflow can push `main` and `develop`.
3. If `main` has branch protection, allow GitHub Actions to push to it.

### 5. DNS

Where `togethercity.app` is managed, add:

- `dev` → CNAME → the value Vercel shows for `dev.togethercity.app`
- `dev-api` → CNAME → the value Railway shows for `dev-api.togethercity.app`

### 6. Check

- `dev.togethercity.app` asks for your Vercel login, then opens with every hub.
- `dev.togethercity.app/dev` shows **This is the developer copy** and a **Go live** button that is not greyed out.
- `togethercity.app/dev` shows **This is the live site** and no button.
- Press Go live once with the four launch hubs; watch the run in GitHub → Actions → Go live; then `togethercity.app` shows the four doors and `togethercity.app/beauty` says "Opening soon".

## Day to day

```
git switch develop
bash land-<name>.sh && git push
```

Landing scripts written from now on land on `develop` (`CLAUDE.md` says so). Look at the change on `dev.togethercity.app`, then press **Go live** when it should be public.

**An urgent fix** goes the same way: land it on `develop`, press Go live. If `develop` holds unfinished work you do not want public yet, untick everything except the fix and send only that (below), or switch the unfinished hub to "Developer only" and send everything.

### Choosing what goes live

The Go live button (corner of every developer page, and on `/dev`) lists every change waiting on `develop`: its title, where it lands ("Beauty", "Whole site: look and shared parts", "Database change"), and what it changes behind **What it changes**. All are ticked to start with.

- **Everything ticked** sends all of `develop`; `main` becomes exactly the developer copy.
- **Some unticked** sends only the ticked changes, oldest first, on top of what is live. Each keeps a "cherry picked from" line, so the list stops showing it. The unticked ones stay waiting.
- A ticked change that touches the same files as an unticked older one is flagged in red. If it really needs that one, the release stops before anything goes live ("builds on a change you did not choose") — tick both, or send everything.

The steps are in `release/go-live.sh`, which the workflow reads from `main`. Changing how releases work is an ordinary change: land it on `develop`, send it live, and the next press uses it. Only a change to `.github/workflows/` has to be pushed to `main` by you (GitHub will not let the release push one).

### Has it gone live?

After a press the button follows the release: **Building…** (GitHub is building it; nothing has changed yet), **Deploying…** (main has moved; Vercel and Railway are deploying), then **Live now**, with each of Website (Vercel) and Server (Railway) marked deployed. **Release stopped** means either the build stopped (nothing changed on the live site) or a deploy failed — the panel says which and links to the reason. This is what Vercel and Railway report to GitHub under the repository's Deployments.
