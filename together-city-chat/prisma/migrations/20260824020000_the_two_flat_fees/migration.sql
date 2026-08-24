-- THE TWO FLAT FEES, ITEMIZED (owner, 24 Aug): a Rs.20 platform fee on every
-- order and a Rs.50 delivery fee on delivery orders, named in the quote, the
-- checkout, the order card and the invoice's extra line — never only in the
-- charge. Zero-backfilled: orders placed before the fees existed carried
-- none, and their rows should keep saying so.
ALTER TABLE "ServiceOrder" ADD COLUMN "platformFeeInr" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ServiceOrder" ADD COLUMN "deliveryFeeInr" INTEGER NOT NULL DEFAULT 0;
