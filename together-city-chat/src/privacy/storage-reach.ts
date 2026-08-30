/**
 * ── EVERY COLUMN IN THE CITY THAT NAMES A FILE ──────────────────────────────
 *
 * purge-plan.ts asks one exhaustive question — "is every model carrying a
 * citizen's id classified?" — and its spec fails the build when a new model is
 * not. That question found a great deal. It could not find any of this.
 *
 * On 30 Aug, five separate places were destroying the ROW and leaving the FILE:
 *
 *   · post media, on account deletion (auth.service.ts)
 *   · a look analysis's reference photograph of a face, on `remove()`
 *   · a CV, on `deleteResume()`
 *   · a shopfront's logo, scanned menu, gallery, menu-item photographs and
 *     VERIFICATION DOCUMENTS, on deleting the listing
 *   · legacy medical documents held as a public URL rather than a key
 *
 * None of them was careless. Each was invisible for its own reason, and the
 * reasons are worth stating because they are what this file is built against:
 *
 *   1 · THE MODEL HAD NO CITIZEN COLUMN. PostMedia hangs off Post, so the
 *       exhaustiveness spec was never going to ask anybody about the one model
 *       in that hub holding storage keys.
 *   2 · THE ROW WAS DESTROYED EARLY. Nulling `fileKey`, nulling `resumeUrl`,
 *       deleting the posts at soft-delete — each destroyed the only record of
 *       where the file was, so the purge could not have recovered it later
 *       even though a rule existed.
 *   3 · THE FILE WAS IN THE PUBLIC BUCKET. Every storage clause in the purge
 *       plan named a private-vault KEY, because health and dating photographs
 *       were what people went looking for. Half the city keeps its pictures as
 *       a public URL, and there was no vocabulary for that shape, so those
 *       rules read as complete.
 *
 * So this is a REGISTRY rather than a detector. The spec beside it reads
 * schema.prisma, finds every column whose name looks like it could name a
 * file, and fails when one is not listed here. It cannot tell whether a
 * classification is right — only that somebody made one. That is the same
 * bargain purge-plan.ts strikes and it says so in its own words: "Getting that
 * decision wrong is still possible; forgetting to make it is not."
 */

export type Holding =
  /** A file in OUR private vault, addressed by key. */
  | 'private-object'
  /** A file in OUR public bucket, addressed by full URL. */
  | 'public-object'
  /** A link somewhere else on the internet. We hold nothing. */
  | 'external-link'
  /** A `data:` payload living in Postgres. Deleting the row deletes the file. */
  | 'inline-data'
  /** A slug, an idempotency key, a settings key. Nothing to do with files. */
  | 'not-storage';

export interface StorageColumn {
  model: string;
  column: string;
  holds: Holding;
  /**
   * For the two object kinds: what removes the file, in words. Not optional,
   * because "something must" is exactly the belief that produced all five
   * leaks above.
   */
  carriedAwayBy?: string;
  /** Why it is classified this way. */
  reason: string;
}

export const STORAGE_COLUMNS: StorageColumn[] = [
  // ── Our files, private vault ───────────────────────────────────────────
  { model: 'Avatar', column: 'assetKey', holds: 'private-object', carriedAwayBy: 'AvatarsService.remove + purge rule storageKey', reason: 'Generated avatar images.' },
  { model: 'DatingPhotoReview', column: 'key', holds: 'private-object', carriedAwayBy: 'DatingService deletes the objects from DatingProfile.extras before these rows; purge rule storageKeysJson covers the same keys', reason: 'The review row is keyed BY the photo key. Correct only while the two key sets stay identical — if dating ever reviews a key not in extras, this needs its own clause.' },
  { model: 'DayPhoto', column: 'fileKey', holds: 'private-object', carriedAwayBy: 'DaybookService.removePhoto + purge rule storageKey', reason: 'Diary photographs.' },
  { model: 'DriveFile', column: 'storageKey', holds: 'private-object', carriedAwayBy: 'DriveService file and folder delete + purge rule storageKey', reason: 'The citizen’s vault files.' },
  { model: 'LookAnalysis', column: 'fileKey', holds: 'private-object', carriedAwayBy: 'LookAnalysisService.remove (30 Aug — it used to null the key and keep the file) + purge rule storageKey', reason: 'A reference photograph of a face.' },
  { model: 'MedicalRecord', column: 'fileKey', holds: 'private-object', carriedAwayBy: 'MedicalService.deleteRecord + purge rule storageKey', reason: 'Uploaded medical documents.' },
  { model: 'PetPhoto', column: 'fileKey', holds: 'private-object', carriedAwayBy: 'PetsService.removePhoto and .remove + purge rule storageKey', reason: 'Photographs of a pet.' },
  { model: 'PostMedia', column: 'url', holds: 'private-object', carriedAwayBy: 'SocialService.deletePost, and AuthService.purgePostObjects at account deletion — which must run BEFORE the rows go, because deleting them destroys the keys', reason: 'Post photographs and videos. Moved to the private vault on 30 Aug.' },
  { model: 'PostMedia', column: 'thumbUrl', holds: 'private-object', carriedAwayBy: 'the same two paths as PostMedia.url', reason: 'A video’s poster frame — the one a partial fix forgets, and the one that shows a face.' },
  { model: 'Prescription', column: 'fileKey', holds: 'private-object', carriedAwayBy: 'purge rule storageKey (no interactive delete path exists)', reason: 'Scanned prescriptions.' },

  // ── Our files, public bucket ──────────────────────────────────────────
  { model: 'Attachment', column: 'url', holds: 'public-object', carriedAwayBy: 'NOTHING, deliberately — Message is `keep` in the purge plan, so no row is ever deleted and no object is orphaned', reason: 'Chat attachments. A message in a shared conversation belongs to everyone in it, so it survives a deletion and so does its picture. Recorded here because "nothing removes it" should be a decision on the page rather than an absence.' },
  { model: 'JobProfile', column: 'resumeUrl', holds: 'public-object', carriedAwayBy: 'JobsService.deleteResume (30 Aug) + purge rule storageUrls', reason: 'The uploaded CV document.' },
  { model: 'JobProfile', column: 'photoUrl', holds: 'public-object', carriedAwayBy: 'purge rule storageUrls', reason: 'A profile photograph on the jobs profile.' },
  { model: 'MedicalRecord', column: 'fileUrl', holds: 'public-object', carriedAwayBy: 'MedicalService.deleteRecord + purge rule storageUrls (30 Aug)', reason: 'LEGACY. Rows written before the private vault carry this and no fileKey; the purge named only the key, so those documents survived.' },
  { model: 'ServiceListing', column: 'logoUrl', holds: 'public-object', carriedAwayBy: 'LocalServicesService.purgeListingObjects (30 Aug) + purge rule storageUrls', reason: 'A shopfront logo.' },
  { model: 'ServiceListing', column: 'menuScanUrl', holds: 'public-object', carriedAwayBy: 'the same two paths as logoUrl', reason: 'A scanned menu.' },
  { model: 'ServiceMenuItem', column: 'photoUrl', holds: 'public-object', carriedAwayBy: 'LocalServicesService.purgeListingObjects (it reads the menu items before the cascade) + the listing’s purge rule', reason: 'A photograph of a dish. Cascades from the listing, which is why nothing here had its own rule.' },
  { model: 'ServiceVerification', column: 'docUrl', holds: 'public-object', carriedAwayBy: 'LocalServicesService.purgeListingObjects + the listing’s purge rule', reason: 'THE MOST SENSITIVE OF THESE. A document an owner submitted to prove the business is real. It cascaded away with the listing and stayed in a public bucket indefinitely.' },
  { model: 'ServiceVerification', column: 'videoUrl', holds: 'public-object', carriedAwayBy: 'the same path as docUrl', reason: 'A verification video, same as above.' },

  // ── Not ours ──────────────────────────────────────────────────────────
  { model: 'CvEntry', column: 'url', holds: 'external-link', reason: 'A link the citizen typed, or one a CV parser read out of their document.' },
  { model: 'ExternalJob', column: 'url', holds: 'external-link', reason: 'The job board we scraped it from.' },

  // ── In the row itself ─────────────────────────────────────────────────
  { model: 'Event', column: 'posterUrl', holds: 'inline-data', reason: 'A generated SVG data URL. The flow that wrote it was retired; nothing writes it now.' },
  { model: 'FoodJournalEntry', column: 'photoUrl', holds: 'inline-data', reason: 'A base64 data URL in Postgres — the DTO caps it at 200,000 characters. Deleting the row deletes the picture. (That it is inline at all is a separate problem, and the same one the social feed had.)' },
  { model: 'TravelPackage', column: 'heroUrl', holds: 'inline-data', reason: 'A generated SVG data URL.' },

  // ── Keys that are not file keys ───────────────────────────────────────
  { model: 'BloodMarker', column: 'key', holds: 'not-storage', reason: 'A marker slug — hb, vitd, b12.' },
  { model: 'Conversation', column: 'directKey', holds: 'not-storage', reason: 'The ordered pair of two citizens, so a direct chat is found once.' },
  { model: 'FeatureFlag', column: 'key', holds: 'not-storage', reason: 'The name of a feature flag — a switch, not a file.' },
  { model: 'GroceryListItem', column: 'key', holds: 'not-storage', reason: 'The canonical item name items are merged on.' },
  { model: 'MailProject', column: 'key', holds: 'not-storage', reason: 'A slug, used as a URL path and a sub-address.' },
  { model: 'MealPlan', column: 'key', holds: 'not-storage', reason: 'The plan’s identity.' },
  { model: 'MedicalBiomarker', column: 'key', holds: 'not-storage', reason: 'A biomarker slug, the same vocabulary BloodMarker uses.' },
  { model: 'NutritionHistory', column: 'planKey', holds: 'not-storage', reason: 'The MealPlan this snapshot came from.' },
  { model: 'PantryConsumption', column: 'mealKey', holds: 'not-storage', reason: '"<day>:<slot>" — which meal was eaten.' },
  { model: 'PaymentIntent', column: 'idempotencyKey', holds: 'not-storage', reason: 'The Idempotency-Key header.' },
  { model: 'Post', column: 'musicUrl', holds: 'not-storage', reason: 'An app-relative path to a bundled library track — /music/<file>, regex-locked in the DTO. Not an object and not an external link.' },
  { model: 'Prescription', column: 'fileUrl', holds: 'not-storage', reason: 'DEAD. Declared in the schema, read and written by nothing. Left in place rather than dropped, which is a migration, but recorded so the next reader does not go looking for its delete path.' },
  { model: 'PrivacySetting', column: 'key', holds: 'not-storage', reason: 'A consent flag name.' },
  { model: 'ServiceListing', column: 'categoryKey', holds: 'not-storage', reason: 'One of a fixed enum of categories.' },
  { model: 'WalletTxn', column: 'idempotencyKey', holds: 'not-storage', reason: 'The Idempotency-Key header.' },
];

/** Every column holding a file we actually store. */
export function ourObjects(): StorageColumn[] {
  return STORAGE_COLUMNS.filter((c) => c.holds === 'private-object' || c.holds === 'public-object');
}
