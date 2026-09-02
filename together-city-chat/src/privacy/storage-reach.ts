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
 *   4 · THE COLUMN WAS NOT CALLED ANYTHING FILE-SHAPED. `Property.photosJson`
 *       and `floorPlansJson` are arrays of `{url}` in the public bucket. The
 *       first version of the spec beside this file matched `(key|url)$`, the
 *       second matched a list of file words, and "floor plans" defeated both —
 *       because the set of things a picture can be called is not enumerable.
 *       Every `Json` column is a candidate now, which is a rule about the
 *       SHAPE of a column rather than a guess about its name.
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
  { model: 'Attachment', column: 'url', holds: 'public-object', carriedAwayBy: 'For an ordinary attachment, NOTHING, deliberately — Message is `keep` in the purge plan, so no row is ever deleted and no object is orphaned. For a SNAP, two things: MessagesService.retireSnapIfSpent deletes the object the moment its last recipient spends their last view, and ExpiredSnapsService sweeps every ten minutes for snaps past their deadline that still have bytes — snapGoneAt is written only once the delete is confirmed, so a failure is retried forever rather than closed', reason: 'TWO SHAPES IN ONE COLUMN, and the `holds` above names only the common one. An ordinary chat attachment is a full URL in the PUBLIC bucket. A snap — Attachment.snapMode is not null — is a `snaps/<userId>/<uuid>` key in the PRIVATE vault, and the recipient never receives it: the serializer sends an empty url and the bytes are streamed by GET /messages/:id/snap, which spends the view in the same request. The public bucket was never an option for a snap, because a permanent unauthenticated URL makes "view once" a caption rather than a property. A message in a shared conversation belongs to everyone in it, so an ordinary picture survives a deletion — recorded here because "nothing removes it" should be a decision on the page rather than an absence. A snap is the exception in both directions: it removes itself, unless the recipient took the sender up on "keep in chat", at which point it is as permanent as any other attachment and for the same reason.' },
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

  // ── Found by the WIDER scan (30 Aug): file-shaped names that do not end in
  //    Key or Url, and every opaque JSON column. ────────────────────────────
  { model: 'Attachment', column: 'thumbnail', holds: 'public-object', carriedAwayBy: 'NOTHING, deliberately — the same decision as Attachment.url beside it', reason: 'A chat attachment’s thumbnail, in the public bucket like the attachment itself.' },
  { model: 'Property', column: 'photosJson', holds: 'public-object', carriedAwayBy: 'the Property purge rule’s storageUrlsJson (30 Aug — Property was not in the purge plan at all)', reason: 'A property advertisement’s photographs: `[{url,caption}]` in the public bucket.' },
  { model: 'Property', column: 'floorPlansJson', holds: 'public-object', carriedAwayBy: 'the Property purge rule’s storageUrlsJson', reason: 'Floor plans, `[{label,url}]`. THE COLUMN THAT DEFEATED TWO VERSIONS OF THIS SPEC’S NAME PATTERN, and the reason every Json column is now a candidate.' },
  { model: 'ServiceListing', column: 'photosJson', holds: 'public-object', carriedAwayBy: 'LocalServicesService.purgeListingObjects + the listing’s purge rule storageUrlsJson', reason: 'A shopfront’s gallery, `[{url,caption}]`.' },

  { model: 'User', column: 'profileImage', holds: 'inline-data', reason: 'A resized `data:` URL capped at 400 KB in UsersService.setAvatar — it lives in the row, so nulling it at deletion genuinely removes the picture.' },
  { model: 'ConversationMember', column: 'photo', holds: 'inline-data', reason: 'A contact photo one reader set for one conversation — the same resized `data:` shape as the account photo, per its DTO.' },
  { model: 'BeautyProfile', column: 'progressJson', holds: 'inline-data', reason: 'A progress timeline whose `thumb` is a `data:` URL under 200 KB, kept in the row.' },
  { model: 'Attachment', column: 'snapOpensJson', holds: 'not-storage', reason: 'WHO HAS OPENED A SNAP AND HOW MANY TIMES — `{ "<userId>": <opens> }`, the same shape as hiddenForJson and starredForJson. No key, no URL, no payload: it is a per-reader counter, and it is per-reader because one shared counter would mean the first person to open a View Once in a group spends the only view. It is a candidate here solely because every Json column is one, which is the rule that caught floorPlansJson — a cheap line to write and the right kind of false positive.' },
  { model: 'Message', column: 'shareJson', holds: 'external-link', reason: 'A share card. Its `image` is https or a same-origin path and NOT a `data:` payload — messages.dto.ts records why that restriction exists. Whatever it points at, it is not an object this app stores on the citizen’s behalf.' },

  { model: 'CallSession', column: 'avatarId', holds: 'not-storage', reason: 'Which generated Avatar an avatar call is bound to. Avatar.assetKey is the file, and has its own entry.' },
  { model: 'Consult', column: 'doctorId', holds: 'not-storage', reason: 'Which doctor — a citizen id, not a file.' },
  { model: 'CvEntry', column: 'profileId', holds: 'not-storage', reason: 'Which JobProfile the entry belongs to.' },
  { model: 'MailMessage', column: 'attachmentIds', holds: 'not-storage', reason: 'DriveFile ids, not keys. The files are DriveFile.storageKey and go with that model’s rule.' },
  { model: 'JobApplication', column: 'coverNote', holds: 'not-storage', reason: 'The covering note somebody typed. Prose in a column.' },
  { model: 'JobProfile', column: 'profileVisibility', holds: 'not-storage', reason: 'Who may see the profile — a setting.' },
  { model: 'ServiceVerification', column: 'docKind', holds: 'not-storage', reason: 'Which KIND of document was submitted.' },
  { model: 'ServiceVerification', column: 'docRef', holds: 'not-storage', reason: 'A reference number typed off the document, not the document.' },
  { model: 'ServiceVerification', column: 'docStatus', holds: 'not-storage', reason: 'none | submitted | verified | rejected.' },
  { model: 'ServiceVerification', column: 'videoStatus', holds: 'not-storage', reason: 'The same vocabulary for the video.' },
  { model: 'ServiceVerification', column: 'videoDecidedBy', holds: 'not-storage', reason: 'Which moderator decided.' },
  { model: 'ServiceVerification', column: 'videoRejectReason', holds: 'not-storage', reason: 'Why it was refused, in words.' },

  // Opaque JSON that turned out to hold content rather than files. Each one is
  // a line rather than a judgement call somebody has to make again.
  { model: 'AstroProfile', column: 'gemCartJson', holds: 'not-storage', reason: 'Gemstones in a basket.' },
  { model: 'AstroReading', column: 'readingJson', holds: 'not-storage', reason: 'The text of a reading.' },
  { model: 'BeautyOrder', column: 'itemsJson', holds: 'not-storage', reason: 'What was ordered.' },
  { model: 'BeautyProfile', column: 'analysisJson', holds: 'not-storage', reason: 'A saved assessment — readings, not pictures.' },
  { model: 'BeautyProfile', column: 'analysisLogJson', holds: 'not-storage', reason: 'Timestamps of past analysis runs.' },
  { model: 'BeautyProfile', column: 'faceJson', holds: 'not-storage', reason: 'Face-feature readings — shapes and tones as numbers.' },
  { model: 'BeautyProfile', column: 'photosJson', holds: 'not-storage', reason: 'Despite the name: `[{slot, analyzedAt, findings[]}]`. An assessment per photo slot, carrying no picture. The photographs themselves are analysed and not kept.' },
  { model: 'Connection', column: 'modulesJson', holds: 'not-storage', reason: 'Which hubs a connection opens.' },
  { model: 'DatingProfile', column: 'moderationJson', holds: 'not-storage', reason: 'A moderation decision. The dating photographs are in extras, which has its own clause.' },
  { model: 'Event', column: 'tiersJson', holds: 'not-storage', reason: 'Ticket tiers and prices.' },
  { model: 'FoodJournalEntry', column: 'itemsJson', holds: 'not-storage', reason: 'What was eaten.' },
  { model: 'FoodJournalEntry', column: 'totalsJson', holds: 'not-storage', reason: 'The arithmetic of the above.' },
  { model: 'Meal', column: 'addonsJson', holds: 'not-storage', reason: 'Extras on a meal.' },
  { model: 'Message', column: 'hiddenForJson', holds: 'not-storage', reason: 'Who has hidden this message.' },
  { model: 'Message', column: 'reactionsJson', holds: 'not-storage', reason: 'Emoji and who left them.' },
  { model: 'Message', column: 'starredForJson', holds: 'not-storage', reason: 'Who starred it.' },
  { model: 'NutritionOrder', column: 'qcJson', holds: 'not-storage', reason: 'Quality-check notes.' },
  { model: 'PantryConsumption', column: 'itemsJson', holds: 'not-storage', reason: 'What was taken out of the pantry.' },
  { model: 'Post', column: 'taggedJson', holds: 'not-storage', reason: 'The people tagged in a post — ids, names and handles.' },
  { model: 'Property', column: 'milestonesJson', holds: 'not-storage', reason: 'Construction milestones and percentages.' },
  { model: 'Property', column: 'moderationJson', holds: 'not-storage', reason: 'A moderation decision.' },
  { model: 'ServiceListing', column: 'detailsJson', holds: 'not-storage', reason: 'Free-form business details.' },
  { model: 'ServiceListing', column: 'hoursJson', holds: 'not-storage', reason: 'Opening hours, day by day.' },
  { model: 'ServiceListing', column: 'moderationJson', holds: 'not-storage', reason: 'A moderation decision.' },
  { model: 'ServiceMenuItem', column: 'addonsJson', holds: 'not-storage', reason: 'Extras on a dish.' },
  { model: 'ServiceMenuItem', column: 'variantsJson', holds: 'not-storage', reason: 'Sizes and variants of a dish.' },
  { model: 'ServiceOrder', column: 'itemsJson', holds: 'not-storage', reason: 'What was ordered.' },
  { model: 'SupplementBag', column: 'linesJson', holds: 'not-storage', reason: 'Supplements in a bag.' },
  { model: 'SupplementOrder', column: 'itemsJson', holds: 'not-storage', reason: 'What was ordered.' },
  { model: 'TarotReading', column: 'readingJson', holds: 'not-storage', reason: 'The text of a reading.' },
  { model: 'TravelPackage', column: 'highlightsJson', holds: 'not-storage', reason: 'Selling points, in words.' },
  { model: 'TravelPackage', column: 'inclusionsJson', holds: 'not-storage', reason: 'What the price includes.' },
  { model: 'TravelPackage', column: 'itineraryJson', holds: 'not-storage', reason: 'Day by day, in words.' },
  { model: 'TravelPackage', column: 'tiersJson', holds: 'not-storage', reason: 'Price tiers for a package.' },
  { model: 'TripBooking', column: 'detailJson', holds: 'not-storage', reason: 'The booking’s particulars.' },
  { model: 'User', column: 'hiddenHubsJson', holds: 'not-storage', reason: 'Which hubs this citizen has hidden.' },
  { model: 'User', column: 'watchlistJson', holds: 'not-storage', reason: 'Things they are watching.' },
];

/** Every column holding a file we actually store. */
export function ourObjects(): StorageColumn[] {
  return STORAGE_COLUMNS.filter((c) => c.holds === 'private-object' || c.holds === 'public-object');
}
