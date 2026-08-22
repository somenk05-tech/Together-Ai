-- THE RESTAURANTS HUB IS REMOVED, AND THE TABLES GO WITH IT.
--
-- The hub served an invented catalogue. RESTAURANT_SEEDS placed made-up
-- restaurants at real Bengaluru localities with made-up star ratings and priced
-- menus, and `reserve()` handed out a table-booking code for them — the service
-- said so in its own comment: "A citizen following one turns up at an address
-- where no such restaurant exists."
--
-- IT WAS ALREADY OFF IN PRODUCTION. Without SEED_DEMO=true, `ensureSeeds()`
-- deleted the seeded rows on boot and the hub presented an honest empty state,
-- which is the same gate the flights, tours and job catalogues sit behind. So
-- these three tables hold no real inventory, no real order and no real booking
-- on this deployment, and dropping them takes nothing from anybody.
--
-- IF THAT IS NOT TRUE OF SOME OTHER DEPLOYMENT, STOP AND READ THIS. Run the
-- counts below first. A non-zero DiningOrder is a citizen who paid through the
-- one city wallet and whose only record of it is the wallet transaction; a
-- non-zero Reservation is somebody expecting a table. Neither has anywhere to
-- be seen once the hub is gone, and this migration is not reversible.
--
--   SELECT (SELECT count(*) FROM "DiningOrder") AS orders,
--          (SELECT count(*) FROM "Reservation") AS reservations,
--          (SELECT count(*) FROM "Restaurant")  AS venues;
--
-- The wallet transactions those orders produced are NOT touched. They live in
-- the financial hub, they are the citizen's own record of money that moved, and
-- deleting a receipt because the shop closed is not a migration, it is a lie.
DROP TABLE IF EXISTS "DiningOrder";
DROP TABLE IF EXISTS "Reservation";
DROP TABLE IF EXISTS "Restaurant";
