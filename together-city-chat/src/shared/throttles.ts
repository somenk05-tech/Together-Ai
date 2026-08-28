/**
 * THE LIMIT THAT GUARDS A MODEL CALL, IN ONE PLACE.
 *
 * ── WHY THIS FILE EXISTS ──────────────────────────────────────────────────
 *
 * The rate limits in this codebase protect two different things and the
 * difference matters. Most guard a citizen's experience of each other: how
 * fast somebody can like, report, or read a list. Those are per-hub and belong
 * in their own controllers, because only that hub knows what its actions cost
 * a person.
 *
 * This one guards a bill. A handler that reaches the model spends real money
 * per request, and it spends the same money whichever hub it sits in — so the
 * number belongs to the model, not the hub, and there should be exactly one of
 * it.
 *
 * `MODEL_LIMIT` was already written, correctly, in `mira.controller.ts` on the
 * reasoning that "the 200-conversation meter is per citizen for life, which is
 * a budget, not a rate". That reasoning was right and applied in one hub. On
 * 28 Aug a sweep found TEN other routes reaching the model with no limit at
 * all, sitting at the global default of 120 a minute:
 *
 *   GET  /ai/recipes, /ai/astrology, /ai/beauty, /ai/fitness
 *        Four GETs, no caching of any kind, one model call each. GETs are
 *        retried by browsers, prefetched by link handlers, and re-fired by a
 *        page that remounts. Four routes at 120 is 480 model calls a minute
 *        from one citizen doing nothing unusual.
 *   POST /jobs/resume                     — readCv, then readCvEntries
 *   POST /services/:id/menu/scan          — a VISION call over a photographed menu
 *   POST /services/:id/menu/recommend
 *   POST /medical/blood-tests/extract     — a VISION call over a lab report
 *   POST /medical/blood-tests/ingest      — likewise
 *   POST /nutrition/analyze               — a VISION call over a meal photo
 *
 * ── ONE NUMBER, NOT TWO ───────────────────────────────────────────────────
 *
 * A vision call over a photograph costs several times a short text completion,
 * so a second, tighter tier for images is arguable. It is deliberately not
 * here: nobody has measured the two against each other, and a number invented
 * to look careful is worse than one number that was reasoned about, because it
 * reads as evidence. Twenty a minute is far past any human uploading lab
 * reports or asking for recipe ideas, and six times tighter than the default
 * every one of these routes was sitting at. If the invoice later says images
 * need their own tier, that is a change to make with the invoice in hand.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────────
 *
 * Not a budget. It caps the RATE one caller can spend at; it says nothing
 * about the total. A per-citizen or per-day ceiling is a different mechanism
 * and still does not exist outside Mira's own 200-conversation meter.
 */
export const MODEL_LIMIT = { default: { ttl: 60_000, limit: 20 } };
