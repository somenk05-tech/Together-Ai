# The worker service

**Why it exists.** `libx264` at `veryfast` holds a full vCPU for as long as the
video is long, and the owner allows a two-gigabyte, sixty-minute upload. Until
6 September that ran inside the API process — the same process answering every
HTTP route and carrying every WebSocket. One upload could take the city with it.
The arithmetic was never close: even 1% of 100,000 daily citizens posting one
two-minute video is about 33 CPU-hours a day against the 24 a container has.

So the encode moved to a lane of its own, on a container of its own. Nothing
about the code changed except *where* it runs and *what may starve it*.

## The two variables

| Variable | API service | Worker service |
|---|---|---|
| `JOBS_ROLE` | `api` | `worker` |
| `MIGRATE_ON_BOOT` | (unset — `on`) | `off` |

`JOBS_ROLE` is read in `src/shared/queue/queue.service.ts`:

- **`api`** — build the queues, run no workers. The container enqueues and
  never executes. This is what the containers serving citizens should be.
- **`worker`** — build the queues *and* the workers.
- **`both`** — the old behaviour and still the default, so a single-container
  deployment and every dev machine keep working with no new variable to set.

`JOBS=off` is unchanged and still means no queue at all. The test environment
relies on it, because the in-process fallback is what several specs assert.

## The lanes

A job belongs to a lane; a lane is its own BullMQ queue with its own worker and
its own concurrency. The routing table is `LANE_OF` in `queue.service.ts` and it
is two entries long on purpose.

| Lane | Jobs | Default concurrency | Variable |
|---|---|---|---|
| `city` | everything short — dating reindex, photo review, the retry sweep, the funnel digest | 8 | `JOBS_CONCURRENCY` |
| `media` | `transcode-video`, `media.sweep` | 1 | `JOBS_MEDIA_CONCURRENCY` |

Before this there was one queue at concurrency 4, so four queued videos took
every slot and the dating reindex waited behind an hour of ffmpeg. Now a long
lane can only be slow for itself.

Media concurrency of 1 is not timidity. A 2 GB input plus its rendition is up
to ~4 GB of ephemeral disk, and two encodes on one container is two encodes at
half speed. Scale it with replicas on the worker service, not with concurrency
on one box.

## Setting it up on Railway

Project `abundant-creation`, production environment.

1. **New service** from the same GitHub repo. In its settings set
   **Config-as-code** to `together-city-chat/railway.worker.json`.
2. **Variables** on the new service — the same `DATABASE_URL`, `REDIS_URL`,
   `S3_*`, `MEDIA_*` and `ANTHROPIC_API_KEY` references the API has, plus:
   - `JOBS_ROLE=worker`
   - `MIGRATE_ON_BOOT=off`
3. **Variables on the existing `Together-Ai` API service**: add
   `JOBS_ROLE=api`. Nothing else changes there.
4. Deploy the worker first, confirm its log says
   `Job queue is on (JOBS_ROLE=worker); lanes city×8, media×1`, then redeploy
   the API and confirm its log says
   `Job queue is on, producing only (JOBS_ROLE=api) — no work runs on this container.`

Do the worker first. Between the two deploys the API is still `both` and still
does the work, so there is no window where nothing is consuming.

## What happens if the queue is down

`add` returns `false`, and callers may run the work themselves. That is right on
a `both` container and wrong on an `api` one, so `TranscodeService.enqueue`
checks the role: on `api` it leaves the row `'processing'`, says so in the log,
and `media.sweep` re-queues it every fifteen minutes once Redis is back.

The sweep uses no age filter and does not need one — `jobId` is
`transcode:<mediaId>`, so a video genuinely queued or genuinely being encoded
has that id in Redis and the re-add is dropped. It reads through the partial
index in `20260906T170000_a_worker_of_its_own`, which holds only the rows in
flight.

## What did NOT move

The Social "Set cover" frame cut (`social.service.ts`, `COVER_LIMIT = 2`) still
runs ffmpeg on whichever container takes the request. It is one frame out of an
already-downloaded file and finishes in well under a second, which is a
different animal from an hour-long encode — but it is still ffmpeg on the API
box, and if cover-setting ever becomes a hot path it should follow the encode
onto the `media` lane.
