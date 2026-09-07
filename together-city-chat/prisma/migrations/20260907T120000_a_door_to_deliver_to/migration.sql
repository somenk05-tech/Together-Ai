-- A door a parcel can find (owner, 7 Sep). The address book grows the fields a
-- rider needs; the one-line addressText is composed from them and kept for every
-- older reader. Each store order keeps a snapshot of the door it was sent to.
ALTER TABLE "SavedAddress" ADD COLUMN "name" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "phone" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "line1" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "line2" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "landmark" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "city" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "state" TEXT;
ALTER TABLE "SavedAddress" ADD COLUMN "pincode" TEXT;
ALTER TABLE "BeautyOrder" ADD COLUMN "addressJson" TEXT;
ALTER TABLE "SupplementOrder" ADD COLUMN "addressJson" TEXT;
