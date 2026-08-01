# API surface

**Generated — do not edit by hand.** Run `npx ts-node scripts/gen-api-docs.ts` after adding or
removing a route. It is produced from the same parse the security guards in
`src/security/` use, so it cannot describe a route that does not exist.

Every path below is prefixed with `/api`. **395 routes** across
**34 controllers**; **9** are reachable without a token.

## Conventions

Authentication is the default. A route is reachable without a bearer token only when it is
explicitly marked `@Public()`, which means a new controller is protected by omission rather
than exposed by omission. Those routes are marked **public** below and are asserted against a
frozen allowlist in `route-exposure.spec.ts` — adding one fails the suite until it is reviewed.

`🔒` marks a handler that receives the authenticated citizen. A route taking a resource id
without it would be unable to check ownership; the eight exceptions are shared catalogue reads
(film metadata, lookups, a recipe, a travel package) and are frozen by name in the same spec.

## /

_messages/messages.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/chat/:id/messages` | 🔒 |
| DELETE | `/api/messages/:id` | 🔒 |
| PUT | `/api/messages/:id` | 🔒 |
| GET | `/api/messages/search` | 🔒 |
| POST | `/api/messages` | 🔒 |

## /ai

_ai/ai-suggestions.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/ai/astrology` | 🔒 |
| GET | `/api/ai/beauty` | 🔒 |
| GET | `/api/ai/fitness` | 🔒 |
| GET | `/api/ai/recipes` | 🔒 |

## /astrology

_astrology/astrology.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/astrology/ask` | 🔒 |
| GET | `/api/astrology/daily/history` | 🔒 |
| GET | `/api/astrology/daily` | 🔒 |
| GET | `/api/astrology/gems` | 🔒 |
| GET | `/api/astrology/monthly` | 🔒 |
| GET | `/api/astrology/profile` | 🔒 |
| PUT | `/api/astrology/profile` | 🔒 |
| GET | `/api/astrology/questions` | 🔒 |
| GET | `/api/astrology/remedies` | 🔒 |
| GET | `/api/astrology/tarot/daily` | 🔒 |
| POST | `/api/astrology/tarot/draw` | 🔒 |
| GET | `/api/astrology/tarot/history` | 🔒 |
| GET | `/api/astrology/tarot/spreads` | token |

## /auth

_auth/auth.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/delete-account` | 🔒 |
| GET | `/api/auth/email-available` | **public** |
| POST | `/api/auth/forgot` | **public** |
| GET | `/api/auth/handle-available` | **public** |
| POST | `/api/auth/login` | **public** |
| POST | `/api/auth/logout-all` | 🔒 |
| POST | `/api/auth/logout-others` | 🔒 |
| POST | `/api/auth/logout` | 🔒 |
| POST | `/api/auth/refresh` | **public** |
| POST | `/api/auth/register` | **public** |
| POST | `/api/auth/reset` | **public** |
| POST | `/api/auth/sessions/revoke` | 🔒 |
| GET | `/api/auth/sessions` | 🔒 |
| POST | `/api/auth/verification/confirm` | 🔒 |
| POST | `/api/auth/verification/send` | 🔒 |
| GET | `/api/auth/verification/status` | 🔒 |

## /avatars

_avatars/avatars.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/avatars/:id/asset` | 🔒 |
| POST | `/api/avatars/:id/select` | 🔒 |
| DELETE | `/api/avatars/:id` | 🔒 |
| GET | `/api/avatars/:id` | 🔒 |
| POST | `/api/avatars/deselect` | 🔒 |
| GET | `/api/avatars` | 🔒 |
| GET | `/api/avatars/options` | token |
| POST | `/api/avatars` | 🔒 |
| POST | `/api/avatars/preview` | token |

## /beauty

_beauty/beauty.controller.ts_

| Method | Path | Auth |
|---|---|---|
| DELETE | `/api/beauty/assessments/latest` | 🔒 |
| GET | `/api/beauty/history` | 🔒 |
| GET | `/api/beauty/insights` | 🔒 |
| DELETE | `/api/beauty/looks/:id` | 🔒 |
| GET | `/api/beauty/looks/:id` | 🔒 |
| GET | `/api/beauty/looks` | 🔒 |
| POST | `/api/beauty/looks` | 🔒 |
| GET | `/api/beauty/makeup` | 🔒 |
| GET | `/api/beauty/orders` | 🔒 |
| POST | `/api/beauty/orders` | 🔒 |
| POST | `/api/beauty/photos/analyze` | token |
| GET | `/api/beauty/products` | 🔒 |
| GET | `/api/beauty/profile` | 🔒 |
| PUT | `/api/beauty/profile` | 🔒 |
| GET | `/api/beauty/routine` | 🔒 |

## /calls

_calls/calls.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/calls/:id/end` | 🔒 |
| POST | `/api/calls/:id/join` | 🔒 |
| POST | `/api/calls/:id/leave` | 🔒 |
| GET | `/api/calls/:id` | 🔒 |
| GET | `/api/calls` | 🔒 |
| GET | `/api/calls/ice` | token |
| POST | `/api/calls` | 🔒 |

## /chat

_conversations/conversations.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/chat/:id/archive` | 🔒 |
| POST | `/api/chat/:id/read` | 🔒 |
| POST | `/api/chat/:id/unarchive` | 🔒 |
| DELETE | `/api/chat/:id` | 🔒 |
| GET | `/api/chat/contacts` | 🔒 |
| GET | `/api/chat/conversations` | 🔒 |
| POST | `/api/chat/group` | 🔒 |
| POST | `/api/chat/start` | 🔒 |

## /city

_city/city.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/city/header` | **public** |

## /connections

_connections/connections.controller.ts_

| Method | Path | Auth |
|---|---|---|
| PATCH | `/api/connections/:id/modules` | 🔒 |
| PATCH | `/api/connections/:id/permissions` | 🔒 |
| DELETE | `/api/connections/:id` | 🔒 |
| GET | `/api/connections` | 🔒 |
| GET | `/api/connections/hubs` | token |
| GET | `/api/connections/module/:key` | 🔒 |
| GET | `/api/connections/recipients` | 🔒 |
| POST | `/api/connections/request` | 🔒 |
| POST | `/api/connections/respond` | 🔒 |

## /dating

_dating/dating.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/dating/activities/invites/:id/respond` | 🔒 |
| POST | `/api/dating/activities/invites/:id/trust` | 🔒 |
| GET | `/api/dating/activities/invites` | 🔒 |
| GET | `/api/dating/activities/mine` | 🔒 |
| POST | `/api/dating/activities` | 🔒 |
| GET | `/api/dating/admin/stats` | 🔒 |
| GET | `/api/dating/allowance` | 🔒 |
| GET | `/api/dating/chats` | 🔒 |
| GET | `/api/dating/discover` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/block` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/connect` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/like` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/pass` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/report` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/reveal` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/super-like` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/unlock-chat` | 🔒 |
| POST | `/api/dating/matches/:targetUserId/unmatch` | 🔒 |
| GET | `/api/dating/matches/:targetUserId` | 🔒 |
| GET | `/api/dating/matches` | 🔒 |
| POST | `/api/dating/photos/presign` | 🔒 |
| DELETE | `/api/dating/profile` | 🔒 |
| GET | `/api/dating/profile` | 🔒 |
| POST | `/api/dating/profile` | 🔒 |
| GET | `/api/dating/stack` | 🔒 |
| POST | `/api/dating/undo-pass` | 🔒 |

## /drive

_drive/drive.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/drive/attachments` | 🔒 |
| POST | `/api/drive/files/:id/attach` | 🔒 |
| GET | `/api/drive/files/:id/url` | 🔒 |
| DELETE | `/api/drive/files/:id` | 🔒 |
| PATCH | `/api/drive/files/:id` | 🔒 |
| POST | `/api/drive/files/presign` | 🔒 |
| POST | `/api/drive/files` | 🔒 |
| DELETE | `/api/drive/folders/:id` | 🔒 |
| PATCH | `/api/drive/folders/:id` | 🔒 |
| POST | `/api/drive/folders` | 🔒 |
| GET | `/api/drive` | 🔒 |
| GET | `/api/drive/usage` | 🔒 |

## /entertainment

_entertainment/entertainment.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/entertainment/browse` | token |
| GET | `/api/entertainment/categories` | token |
| GET | `/api/entertainment/curated-movies` | token |
| GET | `/api/entertainment/discover` | token |
| POST | `/api/entertainment/events/:id/book` | 🔒 |
| GET | `/api/entertainment/events/:id` | token |
| GET | `/api/entertainment/events` | token |
| GET | `/api/entertainment/movies/:id` | token |
| GET | `/api/entertainment/movies` | token |
| GET | `/api/entertainment/ott` | token |
| GET | `/api/entertainment/person/:id` | token |
| GET | `/api/entertainment/recommended` | 🔒 |
| GET | `/api/entertainment/search` | token |
| GET | `/api/entertainment/sources/:type/:id` | token |
| GET | `/api/entertainment/tickets` | 🔒 |
| GET | `/api/entertainment/tv/:id` | token |
| DELETE | `/api/entertainment/watchlist/:type/:id` | 🔒 |
| GET | `/api/entertainment/watchlist` | 🔒 |
| POST | `/api/entertainment/watchlist` | 🔒 |

## /financial

_financial/financial.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/financial/budgets` | 🔒 |
| PUT | `/api/financial/budgets` | 🔒 |
| DELETE | `/api/financial/card` | 🔒 |
| GET | `/api/financial/card` | 🔒 |
| POST | `/api/financial/card` | 🔒 |
| POST | `/api/financial/pay` | 🔒 |
| GET | `/api/financial/services` | token |
| GET | `/api/financial/spending` | 🔒 |
| GET | `/api/financial/transactions` | 🔒 |
| POST | `/api/financial/wallet/top-up` | 🔒 |
| GET | `/api/financial/wallet` | 🔒 |

## /fitness

_fitness/fitness.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/fitness/body-goal` | 🔒 |
| GET | `/api/fitness/log` | 🔒 |
| POST | `/api/fitness/log` | 🔒 |
| GET | `/api/fitness/plan` | 🔒 |
| GET | `/api/fitness/profile` | 🔒 |
| PUT | `/api/fitness/profile` | 🔒 |
| POST | `/api/fitness/sync-nutrition` | 🔒 |

## /health

_health/health.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | **public** |

## /hub

_connections/hub-members.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/hub/:hub/members` | 🔒 |
| PATCH | `/api/hub/:hub/members` | 🔒 |

## /jobs

_jobs/jobs.controller.ts_

| Method | Path | Auth |
|---|---|---|
| PATCH | `/api/jobs/applications/:id/status` | 🔒 |
| DELETE | `/api/jobs/applications/:id` | 🔒 |
| GET | `/api/jobs/applications` | 🔒 |
| POST | `/api/jobs/applications` | 🔒 |
| GET | `/api/jobs/matches` | 🔒 |
| GET | `/api/jobs/postings/:id/applicants` | 🔒 |
| DELETE | `/api/jobs/postings/:id` | 🔒 |
| PUT | `/api/jobs/postings/:id` | 🔒 |
| GET | `/api/jobs/postings` | 🔒 |
| POST | `/api/jobs/postings` | 🔒 |
| GET | `/api/jobs/profile` | 🔒 |
| PUT | `/api/jobs/profile` | 🔒 |
| POST | `/api/jobs/resume` | 🔒 |

## /lookups

_lookups/lookups.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/lookups/:category` | token |

## /mail

_mail/mail.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/mail/:id/flag` | 🔒 |
| POST | `/api/mail/:id/retry` | 🔒 |
| DELETE | `/api/mail/:id` | 🔒 |
| GET | `/api/mail/:id` | 🔒 |
| GET | `/api/mail/account` | 🔒 |
| GET | `/api/mail/directory` | 🔒 |
| GET | `/api/mail` | 🔒 |
| GET | `/api/mail/outbox` | 🔒 |
| POST | `/api/mail/primary` | 🔒 |
| POST | `/api/mail/send` | 🔒 |
| GET | `/api/mail/thread/:threadId/attachments/:fileId/url` | 🔒 |
| GET | `/api/mail/thread/:threadId/attachments` | 🔒 |
| GET | `/api/mail/thread/:threadId` | 🔒 |

## /media

_media/media-status.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/media/cors-status` | token |
| POST | `/api/media/upload-private` | 🔒 |
| POST | `/api/media/upload` | 🔒 |

## /medical

_medical/medical.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/medical/biomarkers/catalog` | token |
| DELETE | `/api/medical/blood-tests/:id` | 🔒 |
| GET | `/api/medical/blood-tests/:id` | 🔒 |
| POST | `/api/medical/blood-tests/extract` | 🔒 |
| POST | `/api/medical/blood-tests/ingest` | 🔒 |
| GET | `/api/medical/blood-tests/latest` | 🔒 |
| GET | `/api/medical/blood-tests/trends` | 🔒 |
| GET | `/api/medical/blood-tests` | 🔒 |
| POST | `/api/medical/blood-tests` | 🔒 |
| GET | `/api/medical/conditions/suggested` | 🔒 |
| GET | `/api/medical/consents` | 🔒 |
| PATCH | `/api/medical/consents` | 🔒 |
| GET | `/api/medical/consults` | 🔒 |
| POST | `/api/medical/consults` | 🔒 |
| GET | `/api/medical/doctors` | token |
| POST | `/api/medical/documents` | 🔒 |
| GET | `/api/medical/records/:id/file` | 🔒 |
| DELETE | `/api/medical/records/:id` | 🔒 |
| GET | `/api/medical/records` | 🔒 |
| POST | `/api/medical/records` | 🔒 |
| GET | `/api/medical/shared-biomarkers/:hub` | 🔒 |
| GET | `/api/medical/storage` | 🔒 |
| GET | `/api/medical/summary` | 🔒 |
| GET | `/api/medical/supplement-plan` | 🔒 |

## /notifications

_notifications/notifications.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/notifications/:id/read` | 🔒 |
| GET | `/api/notifications` | 🔒 |
| POST | `/api/notifications/read-all` | 🔒 |
| GET | `/api/notifications/unread-count` | 🔒 |

## /nutrition

_nutrition/nutrition.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/nutrition/advice` | 🔒 |
| GET | `/api/nutrition/blood` | 🔒 |
| POST | `/api/nutrition/blood` | 🔒 |
| GET | `/api/nutrition/cart` | 🔒 |
| POST | `/api/nutrition/cart` | 🔒 |
| PATCH | `/api/nutrition/delivery-time` | 🔒 |
| GET | `/api/nutrition/diet-plans` | 🔒 |
| POST | `/api/nutrition/dietitians/:id/book` | 🔒 |
| GET | `/api/nutrition/dietitians` | token |
| POST | `/api/nutrition/family/cart` | 🔒 |
| GET | `/api/nutrition/family/dashboard` | 🔒 |
| GET | `/api/nutrition/family/health` | 🔒 |
| POST | `/api/nutrition/family/invite` | 🔒 |
| POST | `/api/nutrition/family/invites/:id/respond` | 🔒 |
| GET | `/api/nutrition/family/invites` | 🔒 |
| GET | `/api/nutrition/family/meal-planning` | 🔒 |
| PATCH | `/api/nutrition/family/meal-planning` | 🔒 |
| DELETE | `/api/nutrition/family/members/:id` | 🔒 |
| PATCH | `/api/nutrition/family/members/:id` | 🔒 |
| GET | `/api/nutrition/family/members` | 🔒 |
| DELETE | `/api/nutrition/family/pantry/:id` | 🔒 |
| PATCH | `/api/nutrition/family/pantry/:id` | 🔒 |
| POST | `/api/nutrition/family/pantry/stock` | 🔒 |
| GET | `/api/nutrition/family/pantry` | 🔒 |
| POST | `/api/nutrition/family/pantry` | 🔒 |
| GET | `/api/nutrition/family/portions/:idx` | 🔒 |
| GET | `/api/nutrition/family/profile` | 🔒 |
| GET | `/api/nutrition/family/search` | 🔒 |
| GET | `/api/nutrition/family/sharing` | 🔒 |
| PATCH | `/api/nutrition/family/sharing` | 🔒 |
| POST | `/api/nutrition/grocery/check` | 🔒 |
| POST | `/api/nutrition/grocery/clear-checked` | 🔒 |
| POST | `/api/nutrition/grocery/item` | 🔒 |
| GET | `/api/nutrition/grocery/plan` | 🔒 |
| DELETE | `/api/nutrition/health/log/:id` | 🔒 |
| GET | `/api/nutrition/health/log` | 🔒 |
| POST | `/api/nutrition/health/log` | 🔒 |
| GET | `/api/nutrition/history/:id` | 🔒 |
| GET | `/api/nutrition/history` | 🔒 |
| GET | `/api/nutrition/meal-settings` | 🔒 |
| PATCH | `/api/nutrition/meal-settings` | token |
| POST | `/api/nutrition/medical-recs/decide` | 🔒 |
| GET | `/api/nutrition/medical-recs` | 🔒 |
| POST | `/api/nutrition/orders/:orderId/deliveries/:deliveryId/cancel` | 🔒 |
| GET | `/api/nutrition/orders/last-address` | 🔒 |
| GET | `/api/nutrition/orders` | 🔒 |
| POST | `/api/nutrition/orders` | token |
| POST | `/api/nutrition/pantry/cooked` | 🔒 |
| GET | `/api/nutrition/pantry/history` | 🔒 |
| POST | `/api/nutrition/pantry/settle` | 🔒 |
| POST | `/api/nutrition/plan/composed/lock` | 🔒 |
| POST | `/api/nutrition/plan/composed/pin` | 🔒 |
| POST | `/api/nutrition/plan/composed/refresh-item` | 🔒 |
| POST | `/api/nutrition/plan/composed/refresh` | 🔒 |
| POST | `/api/nutrition/plan/composed/renew` | 🔒 |
| POST | `/api/nutrition/plan/composed/restore` | 🔒 |
| POST | `/api/nutrition/plan/composed/skip-item` | 🔒 |
| POST | `/api/nutrition/plan/composed/skip` | 🔒 |
| POST | `/api/nutrition/plan/composed/unlock` | 🔒 |
| POST | `/api/nutrition/plan/composed/unpin` | 🔒 |
| GET | `/api/nutrition/plan/composed` | 🔒 |
| GET | `/api/nutrition/preferences` | 🔒 |
| PATCH | `/api/nutrition/preferences` | 🔒 |
| GET | `/api/nutrition/prep-alerts` | 🔒 |
| GET | `/api/nutrition/qa/report` | token |
| GET | `/api/nutrition/qc/compare` | 🔒 |
| POST | `/api/nutrition/qc/order` | 🔒 |
| GET | `/api/nutrition/qc/orders/:id/track` | 🔒 |
| GET | `/api/nutrition/qc/search` | token |
| POST | `/api/nutrition/recipes/:id/save` | 🔒 |
| GET | `/api/nutrition/recipes/:id/variants` | token |
| GET | `/api/nutrition/recipes/:id` | 🔒 |
| GET | `/api/nutrition/recipes/library` | 🔒 |
| DELETE | `/api/nutrition/recipes/own/:id` | 🔒 |
| PATCH | `/api/nutrition/recipes/own/:id` | 🔒 |
| GET | `/api/nutrition/recipes/own` | 🔒 |
| POST | `/api/nutrition/recipes/own` | 🔒 |
| GET | `/api/nutrition/recipes/search` | 🔒 |
| GET | `/api/nutrition/recipes` | 🔒 |
| GET | `/api/nutrition/saved` | 🔒 |
| GET | `/api/nutrition/supplements` | 🔒 |
| GET | `/api/nutrition/targets/history` | 🔒 |
| GET | `/api/nutrition/targets` | 🔒 |
| GET | `/api/nutrition/wallet` | 🔒 |

## /prescriptions

_prescriptions/prescriptions.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/prescriptions/:id/confirm` | 🔒 |
| DELETE | `/api/prescriptions/:id/items/:itemId` | 🔒 |
| PATCH | `/api/prescriptions/:id/items/:itemId` | 🔒 |
| POST | `/api/prescriptions/:id/items` | 🔒 |
| GET | `/api/prescriptions/:id` | 🔒 |
| POST | `/api/prescriptions/doses` | 🔒 |
| GET | `/api/prescriptions` | 🔒 |
| GET | `/api/prescriptions` | 🔒 |
| GET | `/api/prescriptions/logs` | 🔒 |
| POST | `/api/prescriptions` | 🔒 |
| GET | `/api/prescriptions/today` | 🔒 |

## /privacy

_privacy/privacy.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/privacy/export` | 🔒 |
| GET | `/api/privacy` | 🔒 |
| PATCH | `/api/privacy` | 🔒 |

## /profile

_profile/profile.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/profile/completion` | 🔒 |
| GET | `/api/profile/health-score` | 🔒 |
| GET | `/api/profile/master` | 🔒 |
| PATCH | `/api/profile/master` | token |
| GET | `/api/profile/me` | 🔒 |
| PATCH | `/api/profile` | 🔒 |
| GET | `/api/profile/people/search` | 🔒 |
| PATCH | `/api/profile/posts/order` | 🔒 |
| GET | `/api/profile/posts` | 🔒 |
| PATCH | `/api/profile/section` | 🔒 |
| GET | `/api/profile/summary` | 🔒 |
| GET | `/api/profile/user/:handle/posts` | 🔒 |
| GET | `/api/profile/user/:handle` | 🔒 |

## /push

_notifications/push.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/push/subscribe` | token |
| POST | `/api/push/unsubscribe` | token |
| GET | `/api/push/vapid-public-key` | token |

## /realestate

_realestate/realestate.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/realestate/listings` | 🔒 |
| POST | `/api/realestate/moderation/:id/decision` | 🔒 |
| GET | `/api/realestate/moderation/queue` | 🔒 |
| GET | `/api/realestate/my-listings` | 🔒 |
| GET | `/api/realestate/properties/:id` | 🔒 |
| POST | `/api/realestate/properties` | 🔒 |
| GET | `/api/realestate/under-construction` | 🔒 |

## /restaurants

_restaurants/restaurants.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/restaurants/:id/order` | 🔒 |
| GET | `/api/restaurants/:id/overview` | 🔒 |
| POST | `/api/restaurants/:id/reserve` | 🔒 |
| GET | `/api/restaurants/:id` | 🔒 |
| GET | `/api/restaurants/collections` | 🔒 |
| GET | `/api/restaurants/cuisines` | token |
| GET | `/api/restaurants/discover` | 🔒 |
| GET | `/api/restaurants` | 🔒 |
| GET | `/api/restaurants/meal-match` | 🔒 |
| GET | `/api/restaurants/orders` | 🔒 |
| GET | `/api/restaurants/reservations` | 🔒 |
| GET | `/api/restaurants/search` | 🔒 |
| GET | `/api/restaurants/top` | 🔒 |

## /social

_social/social.controller.ts_

| Method | Path | Auth |
|---|---|---|
| DELETE | `/api/social/block/:userId` | 🔒 |
| POST | `/api/social/block` | 🔒 |
| GET | `/api/social/blocks` | 🔒 |
| GET | `/api/social/feed` | 🔒 |
| DELETE | `/api/social/follow/:userId` | 🔒 |
| GET | `/api/social/followers` | 🔒 |
| GET | `/api/social/following` | 🔒 |
| POST | `/api/social/follow` | 🔒 |
| GET | `/api/social/map` | 🔒 |
| GET | `/api/social/posts/:id/comments` | 🔒 |
| POST | `/api/social/posts/:id/comments` | 🔒 |
| PATCH | `/api/social/posts/:id/cover` | 🔒 |
| POST | `/api/social/posts/:id/like` | 🔒 |
| POST | `/api/social/posts/:id/repost` | 🔒 |
| DELETE | `/api/social/posts/:id` | 🔒 |
| PATCH | `/api/social/posts/:id` | 🔒 |
| POST | `/api/social/posts` | 🔒 |
| POST | `/api/social/report` | 🔒 |
| POST | `/api/social/reports/decide` | 🔒 |
| GET | `/api/social/reports/queue` | 🔒 |

## /thoughts

_thoughts/thoughts.controller.ts_

| Method | Path | Auth |
|---|---|---|
| DELETE | `/api/thoughts/:id` | 🔒 |
| GET | `/api/thoughts/:id` | 🔒 |
| PATCH | `/api/thoughts/:id` | 🔒 |
| GET | `/api/thoughts` | 🔒 |
| POST | `/api/thoughts` | 🔒 |

## /travel

_travel/travel.controller.ts_

| Method | Path | Auth |
|---|---|---|
| GET | `/api/travel/airports` | token |
| GET | `/api/travel/categories` | token |
| POST | `/api/travel/flights/book` | 🔒 |
| GET | `/api/travel/flights/search` | token |
| POST | `/api/travel/packages/:id/book` | 🔒 |
| GET | `/api/travel/packages/:id` | token |
| GET | `/api/travel/packages` | token |
| GET | `/api/travel/trips` | 🔒 |

## /users

_users/users.controller.ts_

| Method | Path | Auth |
|---|---|---|
| POST | `/api/users/avatar` | 🔒 |
| POST | `/api/users/device-token` | 🔒 |
| GET | `/api/users/lookup` | 🔒 |
| GET | `/api/users/me` | 🔒 |
| GET | `/api/users/online` | 🔒 |

## Errors

| Status | Means |
|---|---|
| 401 | No token, an expired one, or a deleted account. |
| 403 | Authenticated but not permitted — a hub you have no grant for, a chat you are not in. |
| 404 | Missing, **or** belonging to somebody else. Deliberately indistinguishable, so ids cannot be probed. |
| 409 | A conflicting state — a duplicate signup, a second booking of the same seat. |
| 422 | Validation. Zod rejects the body before a handler sees it. |
| 429 | Rate limited (120 requests a minute by default). |

The 404-for-someone-else's-resource rule is the one worth knowing: dating conversations, family
resources, thoughts and prescriptions all answer 404 rather than 403 when they belong to another
citizen, so a stranger cannot learn that an id exists.
