import { swallowed } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { demoDataEnabled } from '../shared/demo-data';
import { PrismaService } from '../shared/prisma/prisma.service';
import { StorageProvider } from '../media/storage.provider';
import { ClockService } from '../shared/clock/clock.service';
import { FEED_CAP, ORDER_HISTORY_CAP } from '../shared/paging';
import { MasterProfileService } from '../profile/master-profile.service';
import { parseResume, matchJobs, relevantMatches, labelFor, JOB_SEEDS, type ParsedResume, type JobLike } from './jobs-engine';
import { ExternalJobsService } from './external/external-jobs.service';
import { AiService } from '../ai/ai.service';
import { defaultSectionOrder, entryKey, toStartSort } from './cv-entries';
import type { Prisma } from '@prisma/client';
import type {
  UploadResumeDto, SaveJobProfileDto, ApplyDto, PostJobDto,
  CvEntryDto, ReorderEntriesDto, CareerPreferencesDto, VisibilityDto,
} from './dto/jobs.dto';

/**
 * THE GENERATED CLIENT IS ONE MIGRATION BEHIND THIS FILE.
 *
 * `prisma generate` cannot run where this was written (the engine download is
 * blocked), so `prisma.cvEntry` and the columns 20260808120000 adds to
 * JobProfile are absent from the generated types even though the schema and the
 * migration both declare them. This block is the ONE place that says so: a
 * hand-written view of exactly the surface this service uses, applied where it
 * crosses into Prisma and nowhere else.
 *
 * A cast rather than `@ts-expect-error`, deliberately. The directive would
 * itself become a compile error the moment somebody regenerates the client,
 * turning a fixed problem into a broken build; these declarations simply become
 * redundant and can be deleted in one edit.
 */
type CvEntryRow = {
  id: string; profileId: string; kind: string; order: number; hidden: boolean;
  title: string; organisation: string; qualifier: string; location: string;
  startText: string; endText: string; startSort: number; current: boolean;
  description: string; bullets: string; tags: string; url: string;
  confidence: string; source: string; evidence: string;
  createdAt: Date; updatedAt: Date;
};
type CvEntryDelegate = {
  findMany(args?: unknown): Promise<CvEntryRow[]>;
  create(args: unknown): Promise<CvEntryRow>;
  updateMany(args: unknown): Promise<{ count: number }>;
  deleteMany(args: unknown): Promise<{ count: number }>;
};
/** The write half of the same gap: new JobProfile columns, typed as the object
 *  they are and cast once on the way in. */
type ProfileWrite = Record<string, unknown>;

/** One entry as the reader hands it over — lists still lists, before they
 *  become the newline- and comma-separated columns the table stores. */
type ReadEntry = NonNullable<Awaited<ReturnType<AiService['readCvEntries']>>>['entries'][number];

@Injectable()
export class JobsService implements OnModuleInit {
  private readonly logger = new Logger('JobsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterProfile: MasterProfileService,
    private readonly clock: ClockService,
    // Reads a CV into a profile. Optional at runtime — when the model is not
    // configured readCv returns null and the heuristic parser carries on.
    private readonly ai: AiService,
    /* Optional so the specs that construct this service directly keep working;
       `deleteResume` says loudly in the log when a document was left behind. */
    @Optional() private readonly storage?: StorageProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSeedJobs();
  }

  // ─────────────── candidate profile (upload once) ───────────────
  private shapeProfile(row: {
    headline: string; skills: string; experienceYears: number; location: string | null;
    seniority: string; resumeName: string | null;
    resumeUrl?: string | null; resumeBytes?: number; resumeAt?: Date | null;
    photoUrl?: string | null; fullName?: string; summary?: string; currentTitle?: string; currentCompany?: string;
    education?: string; openToRoles?: string; noticeDays?: number | null; expectedLpa?: number | null; links?: string;
    // Added by 20260808120000. Optional on the way in because the generated
    // client does not know them yet — see the note at the top of this file.
    employmentStatus?: string; openToOffers?: string; employmentTypes?: string; workModes?: string;
    relocate?: string; preferredPlaces?: string;
    currentFixed?: number | null; currentVariable?: number | null; expectedMin?: number | null;
    currency?: string; salaryPeriod?: string;
    profileVisibility?: string; contactVisibility?: string; salaryVisibility?: string;
  } | null) {
    const csv = (v: string | undefined) => (v ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    if (!row) {
      return {
        saved: false, headline: '', skills: [] as { key: string; label: string }[],
        experienceYears: 0, seniority: 'junior', location: null, resumeName: null,
        resumeUrl: null, resumeBytes: 0, resumeAt: null, photoUrl: null, fullName: '',
        summary: '', currentTitle: '', currentCompany: '', education: '',
        openToRoles: [] as string[], noticeDays: null, expectedLpa: null, links: '',
        employmentStatus: '', openToOffers: '', employmentTypes: [] as string[], workModes: [] as string[],
        relocate: '', preferredPlaces: [] as string[],
        currentFixed: null, currentVariable: null, expectedMin: null,
        currency: 'INR', salaryPeriod: 'annual',
        // The promise /jobs/profile already prints — "companies can't browse or
        // search you" — is the default for somebody who has nothing saved too.
        profileVisibility: 'private', contactVisibility: 'private', salaryVisibility: 'private',
      };
    }
    const keys = row.skills ? row.skills.split(',').filter(Boolean) : [];
    return {
      saved: true, headline: row.headline,
      skills: keys.map((k) => ({ key: k, label: labelFor(k) })),
      experienceYears: row.experienceYears, seniority: row.seniority, location: row.location,
      // THE FILE, not only what we read out of it. A citizen who uploaded a CV
      // and could never see it again had handed a document to something that
      // gave nothing back.
      resumeName: row.resumeName,
      resumeUrl: row.resumeUrl ?? null,
      resumeBytes: row.resumeBytes ?? 0,
      resumeAt: row.resumeAt ? row.resumeAt.toISOString() : null,
      photoUrl: row.photoUrl ?? null,
      // The person, kept apart from the job title. Two facts, two fields.
      fullName: row.fullName ?? '',
      summary: row.summary ?? '',
      currentTitle: row.currentTitle ?? '',
      currentCompany: row.currentCompany ?? '',
      education: row.education ?? '',
      openToRoles: csv(row.openToRoles),
      noticeDays: row.noticeDays ?? null,
      expectedLpa: row.expectedLpa ?? null,
      links: row.links ?? '',
      employmentStatus: row.employmentStatus ?? '',
      openToOffers: row.openToOffers ?? '',
      employmentTypes: csv(row.employmentTypes),
      workModes: csv(row.workModes),
      relocate: row.relocate ?? '',
      preferredPlaces: csv(row.preferredPlaces),
      currentFixed: row.currentFixed ?? null,
      currentVariable: row.currentVariable ?? null,
      expectedMin: row.expectedMin ?? null,
      currency: row.currency || 'INR',
      salaryPeriod: row.salaryPeriod || 'annual',
      profileVisibility: row.profileVisibility || 'private',
      contactVisibility: row.contactVisibility || 'private',
      salaryVisibility: row.salaryVisibility || 'private',
    };
  }

  /** One entry, as a screen wants it: bullets and tags back as lists, and the
   *  provenance kept, because a row the reader was unsure about renders as a
   *  question and must be able to say so. */
  private shapeEntry(row: CvEntryRow) {
    return {
      id: row.id, kind: row.kind, order: row.order, hidden: row.hidden,
      title: row.title, organisation: row.organisation, qualifier: row.qualifier, location: row.location,
      startText: row.startText, endText: row.endText, startSort: row.startSort, current: row.current,
      description: row.description,
      bullets: row.bullets ? row.bullets.split('\n').map((b) => b.trim()).filter(Boolean) : [],
      tags: row.tags ? row.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      url: row.url,
      confidence: row.confidence, source: row.source, evidence: row.evidence,
      // The one derived field worth sending: a screen should not have to know
      // that 'high' is the only value that means "this is a claim they are
      // making" in order to decide whether to ask.
      needsConfirming: row.confidence !== 'high',
    };
  }

  /** The CvEntry delegate, through the hand-written view declared at the top of
   *  this file. */
  private get cvEntry(): CvEntryDelegate {
    return (this.prisma as unknown as { cvEntry: CvEntryDelegate }).cvEntry;
  }

  /**
   * The citizen's own profile id, creating the row if they have never saved
   * anything.
   *
   * An entry cannot exist without a profile to hang off, and somebody adding
   * their first job by hand has not uploaded a CV. The upsert is scoped by
   * userId, which is what makes every CvEntry query below scoped too: the
   * profileId is never taken from the request.
   */
  private async ownProfileId(userId: string): Promise<string> {
    const row = await this.prisma.jobProfile.upsert({ where: { userId }, update: {}, create: { userId } });
    return row.id;
  }

  /** The profile id, or null when there is none — for reads, which must not
   *  create a profile as a side effect of somebody looking at an empty page. */
  private async findProfileId(userId: string): Promise<string | null> {
    const row = await this.prisma.jobProfile.findUnique({ where: { userId }, select: { id: true } });
    return row?.id ?? null;
  }

  /**
   * Bump `revision` after an accepted change.
   *
   * The column exists so a later upload can be diffed against what is already
   * here rather than assuming it is unchanged. A write that forgot to bump it
   * would make a stale profile look current, which is the one failure the diff
   * cannot detect for itself.
   */
  private async touchProfile(userId: string): Promise<void> {
    await this.prisma.jobProfile.updateMany({
      where: { userId },
      data: { revision: { increment: 1 } } as unknown as Prisma.JobProfileUpdateManyMutationInput,
    });
  }

  /**
   * DELETE THE CV. The file, the text pulled out of it, and its name.
   *
   * A citizen who uploaded the wrong document, or who simply wants it gone,
   * had no way to remove it — the app kept a copy of their career history with
   * no door out. The rest of the profile survives: they may still want to be
   * matched on what they typed themselves.
   */
  async deleteResume(userId: string) {
    /**
     * ── "THE APP KEPT A COPY WITH NO DOOR OUT" WAS STILL TRUE OF THE FILE ───
     *
     * The paragraph above this method says a citizen who wants their CV gone
     * "had no way to remove it — the app kept a copy of their career history
     * with no door out". This method was that door, and it opened onto the
     * database only: it nulled `resumeUrl` and left the DOCUMENT in the public
     * bucket, permanently addressable by its URL to anyone who ever had it.
     *
     * And nulling the column destroyed the only record of where it was, so the
     * purge could not have caught it later either — the same shape as the look
     * photograph and the post media, in a third place.
     *
     * `keyFromUrl` returns '' for anything not under our own public base. That
     * matters here more than anywhere: `fileUrl` is a client-supplied
     * `z.string().max(500)` with no bucket validation, so a citizen could have
     * put any URL in this column, and we must not try to delete somebody
     * else's.
     */
    const row = await this.prisma.jobProfile.findUnique({
      where: { userId }, select: { resumeUrl: true },
    }).catch(swallowed('jobs.deleteResume: read the resume url', null, { userId }));
    const url = row?.resumeUrl ?? '';
    if (url) {
      if (this.storage) {
        /* Since 2 Sep the column holds a vault key; before it, a public URL.
           Both shapes are still in the table until the migration has run, so
           both are deleted from where they actually are. */
        if (StorageProvider.isOwnResumeKey(userId, url)) {
          await this.storage.deletePrivateObject(url)
            .catch(swallowed('jobs.deleteResume: delete the stored CV', undefined, { userId }));
        } else {
          const key = this.storage.keyFromUrl(url);
          if (key) {
            await this.storage.deleteObject(key)
              .catch(swallowed('jobs.deleteResume: delete the stored CV', undefined, { userId }));
          }
        }
      } else {
        this.logger.error(
          `deleteResume: no storage provider wired — the stored CV (${url}) for ${userId} was NOT removed, `
          + 'and the column is about to be nulled, so it is now orphaned.',
        );
      }
    }
    await this.prisma.jobProfile.updateMany({
      where: { userId },
      data: { resumeText: '', resumeName: null, resumeUrl: null, resumeBytes: 0, resumeAt: null },
    });
    return this.getProfile(userId);
  }

  async getProfile(userId: string) {
    const row = await this.prisma.jobProfile.findUnique({ where: { userId } });
    const shaped = this.shapeProfile(row);
    // Auto-fill the shared location from the Master Profile when the CV had none
    // (spec: read shared fields; never re-ask).
    if (!shaped.location) {
      const m = await this.masterProfile.get(userId).catch(swallowed('jobs.getProfile', null));
      if (m?.city) shaped.location = m.city;
    }
    const rows = row ? await this.ownEntries(row.id) : [];
    const entries: Record<string, ReturnType<JobsService['shapeEntry']>[]> = {};
    for (const e of rows) (entries[e.kind] ??= []).push(this.shapeEntry(e));
    return {
      ...shaped,
      entries,
      sectionOrder: this.sectionOrderFor((row as { sectionOrder?: string } | null)?.sectionOrder ?? '', rows),
    };
  }

  /** Every entry on one profile, in the order it is meant to be read: the
   *  citizen's own arrangement first, most recent first within a tie, because a
   *  row nobody has dragged yet should still come out of an upload sensibly. */
  private async ownEntries(profileId: string): Promise<CvEntryRow[]> {
    // unbounded: one citizen's own entries, and a CV is not a feed
    return this.cvEntry.findMany({
      where: { profileId },
      orderBy: [{ order: 'asc' }, { startSort: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * The running order of the sections, reconciled with what the profile holds.
   *
   * The stored order is a list the citizen dragged into place, and it goes
   * stale the moment they add a kind they did not have then. Filtering it to
   * what exists and appending the rest means a new Awards section appears at
   * the bottom rather than not at all — and a section they deleted every entry
   * from stops being printed as an empty heading.
   */
  private sectionOrderFor(stored: string, rows: CvEntryRow[]): string[] {
    const present = new Set(rows.map((r) => r.kind));
    // Hidden rows still belong to the citizen and their section has to survive
    // long enough for them to unhide one, so the default is computed from what
    // is visible and any kind that is only hidden is appended rather than lost.
    const visible = rows.filter((r) => !r.hidden).map((r) => r.kind);
    const kept = stored.split(',').map((k) => k.trim()).filter((k) => k && present.has(k));
    const order = kept.length ? [...new Set(kept)] : defaultSectionOrder(visible);
    for (const kind of present) if (!order.includes(kind)) order.push(kind);
    return order;
  }

  /**
   * ── THE CV IS A PRIVATE FILE (launch blocker 3, 2 Sep) ─────────────────────
   *
   * `fileUrl` used to be whatever the client said it was: a public-bucket URL
   * minted by `mediaApi.upload`, permanent and unauthenticated — a career
   * history addressable by anybody who ever saw the string. The document goes
   * into the vault under `cv/<userId>/` now, the client hands back the KEY,
   * and the only way it comes out is `resumeLink`: a signed URL that lasts
   * minutes, offered as a download, to its owner.
   */
  async presignResume(userId: string, mimeType: string, sizeBytes: number): Promise<{ uploadUrl: string; key: string; expiresInSec: number }> {
    if (!this.storage) throw new BadRequestException('File storage is not configured.');
    if (sizeBytes > 20_000_000) throw new BadRequestException('A CV must be under 20 MB.');
    const ext = mimeType === 'application/pdf' ? 'pdf'
      : mimeType === 'text/plain' ? 'txt'
      : mimeType === 'application/msword' ? 'doc' : 'docx';
    return this.storage.presignResumeUpload(userId, mimeType, ext);
  }

  /** A short-lived signed URL for the citizen's own stored CV, or null when
   *  there is none. Rows written before 2 Sep hold a public URL rather than a
   *  key; those are handed back as they are until the migration moves them. */
  async resumeLink(userId: string): Promise<{ url: string | null; fileName: string | null }> {
    const row = await this.prisma.jobProfile.findUnique({
      where: { userId }, select: { resumeUrl: true, resumeName: true },
    });
    const stored = row?.resumeUrl ?? '';
    if (!stored) return { url: null, fileName: row?.resumeName ?? null };
    if (!StorageProvider.isOwnResumeKey(userId, stored)) {
      // A legacy public URL, or a key that is not this citizen's. The second
      // cannot be written through uploadResume; if it ever appears, it is not
      // signed either way.
      return { url: StorageProvider.isCvOrKycKey(stored) ? null : stored, fileName: row?.resumeName ?? null };
    }
    const url = this.storage
      ? await this.storage.presignHealthDownload(stored, { asAttachment: true, filename: row?.resumeName ?? 'cv' })
      : null;
    return { url, fileName: row?.resumeName ?? null };
  }

  async uploadResume(userId: string, dto: UploadResumeDto) {
    if (dto.fileKey && !StorageProvider.isOwnResumeKey(userId, dto.fileKey)) {
      throw new ForbiddenException('That file is not yours to file.');
    }
    /**
     * THE READER FIRST, THE HEURISTIC AS A FLOOR.
     *
     * parseResume takes the first non-empty line of the extracted text as the
     * headline. On a real CV that line is the person's NAME, or a phone
     * number, or "CURRICULUM VITAE", or — on a two-column PDF — whichever
     * fragment pdf.js emitted first. Every citizen who uploaded a document got
     * a synopsis that was not about their career, and the matcher then scored
     * them on it.
     *
     * The reader is asked first and the heuristic keeps whatever the reader
     * left empty. Falling back rather than refusing matters: a worse headline
     * beats no profile, and the citizen edits either one before it matters.
     */
    const heuristic = parseResume(dto.resumeText);
    const read = await this.ai.readCv(dto.resumeText).catch(swallowed('jobs.readCv', null));
    const parsed: ParsedResume = read
      ? {
        ...heuristic,
        headline: read.headline || heuristic.headline,
        // The reader's year count only wins when it HAS one. Null means it
        // could not tell, and a heuristic guess is better than a zero that
        // reads as "no experience".
        experienceYears: read.experienceYears ?? heuristic.experienceYears,
        location: read.location ?? heuristic.location,
        skills: read.skills.length ? [...new Set([...heuristic.skills, ...read.skills])].slice(0, 40) : heuristic.skills,
      }
      : heuristic;
    await this.persistProfile(userId, parsed, dto.resumeText, dto.fileName ?? null, {
      resumeUrl: dto.fileKey ?? null,
      resumeBytes: dto.fileBytes ?? 0,
      resumeAt: this.clock.now(),
      // The reader's name first, the heuristic's second, and neither
      // overwrites a name the citizen has already corrected by hand.
      fullName: read?.fullName || parsed.name || undefined,
      summary: read?.summary ?? undefined,
      currentTitle: read?.currentTitle ?? undefined,
      currentCompany: read?.currentCompany ?? undefined,
      education: read?.education.length ? read.education.join('\n') : undefined,
      openToRoles: read?.openToRoles.length ? read.openToRoles.join(',') : undefined,
    });
    /**
     * THE RECORD, not only the synopsis.
     *
     * readCv gives a headline and a summary; this gives the jobs, the degrees
     * and the things they built, as rows a citizen can edit one at a time. It
     * is a second call rather than a bigger one so that a model which runs out
     * of tokens on a long filmography still leaves them with a profile.
     *
     * Best-effort on purpose: an upload whose entries could not be read is
     * still an upload, and the citizen adds them by hand.
     */
    const readEntries = await this.ai.readCvEntries(dto.resumeText).catch(swallowed('jobs.readCvEntries', null));
    const entries = await this.mergeReadEntries(userId, readEntries?.entries ?? []);
    const jobs = await this.allJobs(userId);
    return {
      parsed: this.shapeProfile({ headline: parsed.headline, skills: parsed.skills.join(','), experienceYears: parsed.experienceYears, location: parsed.location, seniority: parsed.seniority, resumeName: dto.fileName ?? null }),
      matchCount: matchJobs(parsed, jobs).length,
      entries,
    };
  }

  /**
   * FOLD A READ CV INTO THE ENTRIES ALREADY THERE.
   *
   * The rule that governs this method: a row the citizen wrote or corrected
   * themselves is never touched. A second upload is usually a slightly updated
   * CV, not a replacement person — one new job and thirty rows somebody may
   * have spent an evening fixing — and an upload that overwrites those has
   * punished them for using the editor.
   *
   * So the merge is three-way. A row that matches something the citizen owns is
   * dropped on the floor and counted; a row that matches an earlier reading is
   * refreshed, field by field, and only where the new reading has something to
   * say; everything left is new and gets appended to the end of its section.
   *
   * Nothing here reorders anything. Appending is the honest place for a row
   * nobody has looked at yet.
   */
  private async mergeReadEntries(
    userId: string,
    incoming: ReadEntry[],
  ): Promise<{ added: number; updated: number; keptYours: number }> {
    // Lists become the strings the column holds — bullets one per line, tags
    // csv — right here, so nothing downstream has to know which is which.
    const rows = incoming.map((e) => ({
      kind: e.kind,
      title: e.title,
      organisation: e.organisation,
      qualifier: e.qualifier,
      location: e.location,
      startText: e.startText,
      endText: e.endText,
      current: e.current,
      description: e.description,
      bullets: e.bullets.join('\n'),
      tags: e.tags.join(','),
      url: e.url,
      confidence: e.confidence as string,
    })).filter((e) => e.kind && (e.title || e.organisation));
    if (!rows.length) return { added: 0, updated: 0, keptYours: 0 };

    const profileId = await this.ownProfileId(userId);
    const existing = await this.ownEntries(profileId);
    const byKey = new Map<string, CvEntryRow>();
    for (const row of existing) if (!byKey.has(entryKey(row))) byKey.set(entryKey(row), row);
    const nextOrder = new Map<string, number>();
    for (const row of existing) nextOrder.set(row.kind, Math.max(nextOrder.get(row.kind) ?? 0, row.order + 1));

    let added = 0, updated = 0, keptYours = 0;
    for (const row of rows) {
      const match = byKey.get(entryKey(row));
      if (match?.source === 'citizen') { keptYours++; continue; }
      const startSort = toStartSort(row.startText);
      if (match) {
        // Only what the new reading actually has. An empty field is a page the
        // model could not read this time, not news that the citizen no longer
        // has a location.
        const data: Record<string, unknown> = { confidence: row.confidence, source: 'cv' };
        for (const [field, value] of Object.entries(row)) {
          if (field === 'kind' || field === 'confidence') continue;
          if (typeof value === 'string' && value.trim()) data[field] = value;
        }
        if (row.current !== match.current) data.current = row.current;
        if (startSort) data.startSort = startSort;
        await this.cvEntry.updateMany({ where: { id: match.id, profileId }, data });
        updated++;
        continue;
      }
      const order = nextOrder.get(row.kind) ?? 0;
      nextOrder.set(row.kind, order + 1);
      const created = await this.cvEntry.create({ data: { ...row, profileId, startSort, order, source: 'cv' } });
      // A two-column PDF can emit the same job twice. Remembering what was just
      // written turns the second copy into a no-op update rather than a
      // duplicate row the citizen has to delete.
      byKey.set(entryKey(row), created);
      added++;
    }
    if (added || updated) await this.touchProfile(userId);
    return { added, updated, keptYours };
  }

  // ─────────────── the professional record ───────────────
  /**
   * Create or edit one entry. The citizen is writing it, so it is theirs:
   * `source` becomes 'citizen' and `confidence` becomes 'high', which is what
   * stops a later upload overwriting it and what stops the screen asking them
   * to confirm something they just typed.
   */
  async upsertEntry(userId: string, dto: CvEntryDto, id?: string) {
    const profileId = await this.ownProfileId(userId);
    const data: Record<string, unknown> = {
      kind: dto.kind,
      title: dto.title ?? '',
      organisation: dto.organisation ?? '',
      qualifier: dto.qualifier ?? '',
      location: dto.location ?? '',
      startText: dto.startText ?? '',
      endText: dto.endText ?? '',
      startSort: toStartSort(dto.startText ?? ''),
      current: dto.current ?? false,
      description: dto.description ?? '',
      bullets: (dto.bullets ?? []).map((b) => b.trim()).filter(Boolean).join('\n'),
      tags: (dto.tags ?? []).map((t) => t.trim()).filter(Boolean).join(','),
      url: dto.url ?? '',
      hidden: dto.hidden ?? false,
      confidence: 'high',
      source: 'citizen',
    };
    if (id) {
      // Scoped by profileId as well as id: the id arrives from the request and
      // is not evidence of anything on its own.
      const { count } = await this.cvEntry.updateMany({ where: { id, profileId }, data });
      if (!count) throw new NotFoundException('entry not found');
    } else {
      const existing = await this.ownEntries(profileId);
      const order = existing.filter((e) => e.kind === dto.kind).reduce((n, e) => Math.max(n, e.order + 1), 0);
      await this.cvEntry.create({ data: { ...data, profileId, order } });
    }
    await this.touchProfile(userId);
    return this.getProfile(userId);
  }

  async deleteEntry(userId: string, id: string) {
    const profileId = await this.findProfileId(userId);
    if (!profileId) throw new NotFoundException('entry not found');
    const { count } = await this.cvEntry.deleteMany({ where: { id, profileId } });
    if (!count) throw new NotFoundException('entry not found');
    await this.touchProfile(userId);
    return this.getProfile(userId);
  }

  /** Hidden, not deleted — "I do not want this on my profile" is not the same
   *  statement as "this never happened", and only one of them is destructive. */
  async setEntryHidden(userId: string, id: string, hidden: boolean) {
    const profileId = await this.findProfileId(userId);
    if (!profileId) throw new NotFoundException('entry not found');
    const { count } = await this.cvEntry.updateMany({ where: { id, profileId }, data: { hidden } });
    if (!count) throw new NotFoundException('entry not found');
    await this.touchProfile(userId);
    return this.getProfile(userId);
  }

  /**
   * One section, in the order the citizen dragged it into.
   *
   * Ids not in that section are ignored rather than rejected: a stale tab
   * sending an id that has since been deleted should reorder the rest, not fail
   * the whole gesture. Every write names both the profile and the kind, so an
   * id belonging to somebody else matches nothing and changes nothing.
   */
  async reorderEntries(userId: string, dto: ReorderEntriesDto) {
    const profileId = await this.findProfileId(userId);
    if (!profileId) throw new NotFoundException('nothing to reorder');
    for (const [index, id] of dto.ids.entries()) {
      await this.cvEntry.updateMany({ where: { id, profileId, kind: dto.kind }, data: { order: index } });
    }
    await this.touchProfile(userId);
    return this.getProfile(userId);
  }

  /**
   * Employment, availability and money.
   *
   * `undefined` leaves a column alone and `null` clears it, and the difference
   * is the whole point: a citizen updating their notice period must not
   * republish a salary they removed last week. Nothing here is ever inferred
   * from a CV — a document that mentions a figure is not a person telling us
   * what they earn.
   */
  async saveCareerPreferences(userId: string, dto: CareerPreferencesDto) {
    const data: ProfileWrite = {};
    const text = (v: string | null | undefined) => (v === undefined ? undefined : v ?? '');
    const csv = (v: string[] | null | undefined) => (v === undefined ? undefined : (v ?? []).join(','));
    const set = (key: string, value: unknown) => { if (value !== undefined) data[key] = value; };
    set('employmentStatus', text(dto.employmentStatus));
    set('openToOffers', text(dto.openToOffers));
    set('employmentTypes', csv(dto.employmentTypes));
    set('workModes', csv(dto.workModes));
    set('relocate', text(dto.relocate));
    set('preferredPlaces', csv(dto.preferredPlaces));
    set('currentFixed', dto.currentFixed);
    set('currentVariable', dto.currentVariable);
    set('expectedMin', dto.expectedMin);
    set('currency', dto.currency === undefined ? undefined : (dto.currency ?? 'INR').toUpperCase());
    set('salaryPeriod', dto.salaryPeriod === undefined ? undefined : dto.salaryPeriod ?? 'annual');
    set('noticeDays', dto.noticeDays);
    await this.writeProfile(userId, data);
    return this.getProfile(userId);
  }

  /** Who can see the profile, the contact details and the money. Three
   *  separate answers because they are three separate risks. */
  async saveVisibility(userId: string, dto: VisibilityDto) {
    await this.writeProfile(userId, {
      profileVisibility: dto.profileVisibility,
      contactVisibility: dto.contactVisibility,
      salaryVisibility: dto.salaryVisibility,
    });
    return this.getProfile(userId);
  }

  /** The one place the new columns are written, cast once — see the note at the
   *  top of this file. */
  private async writeProfile(userId: string, data: ProfileWrite): Promise<void> {
    await this.prisma.jobProfile.upsert({
      where: { userId },
      update: { ...data, revision: { increment: 1 } } as unknown as Prisma.JobProfileUpdateInput,
      create: { userId, ...data } as unknown as Prisma.JobProfileUncheckedCreateInput,
    });
  }

  /**
   * HOW FINISHED IS THIS PROFILE, section by section.
   *
   * One number would be useless. "You are 62% complete" tells somebody nothing
   * about what to do next, and the thing they need to do next is usually one
   * specific missing sentence. So every section reports its own percentage and
   * names what is missing, in the citizen's words rather than the column's.
   *
   * Sections with nothing in them still count. An empty Experience section is
   * the largest single thing wrong with a profile and hiding it from the score
   * would flatter the profile into looking finished.
   */
  async profileCompletion(userId: string) {
    const row = await this.prisma.jobProfile.findUnique({ where: { userId } });
    const p = this.shapeProfile(row);
    const rows = row ? await this.ownEntries(row.id) : [];
    const visible = rows.filter((r) => !r.hidden);
    const of = (kind: string) => visible.filter((r) => r.kind === kind);
    const experience = of('experience');

    const sections: Array<{ key: string; label: string; checks: Array<[string, boolean]> }> = [
      { key: 'basics', label: 'About you', checks: [
        ['your name', !!p.fullName],
        ['a headline', !!p.headline],
        ['a short summary', !!p.summary],
        ['where you are', !!p.location],
        ['a photo', !!p.photoUrl],
      ] },
      { key: 'experience', label: 'Experience', checks: [
        ['at least one role', experience.length > 0],
        ['when each role started', experience.length > 0 && experience.every((e) => !!e.startText)],
        ['what you did in at least one of them', experience.some((e) => !!e.description || !!e.bullets)],
      ] },
      { key: 'education', label: 'Education', checks: [['a qualification', of('education').length > 0]] },
      { key: 'skills', label: 'Skills', checks: [
        ['three skills', p.skills.length >= 3],
        ['eight skills', p.skills.length >= 8],
      ] },
      { key: 'preferences', label: 'What you are looking for', checks: [
        ['your employment status', !!p.employmentStatus],
        ['whether you are open to offers', !!p.openToOffers],
        ['the kind of work you want', p.employmentTypes.length > 0],
        ['where you would work', p.workModes.length > 0],
      ] },
    ];

    const shaped = sections.map((s) => {
      const done = s.checks.filter(([, ok]) => ok).length;
      return {
        key: s.key, label: s.label, done, total: s.checks.length,
        percent: Math.round((done / s.checks.length) * 100),
        missing: s.checks.filter(([, ok]) => !ok).map(([what]) => what),
      };
    });
    const done = shaped.reduce((n, s) => n + s.done, 0);
    const total = shaped.reduce((n, s) => n + s.total, 0);
    return {
      overall: Math.round((done / total) * 100),
      sections: shaped,
      // Rows the reader was not sure about. Confirming one is the cheapest
      // improvement available to most people, so it is surfaced beside the
      // score rather than buried in the sections.
      needsConfirming: rows.filter((r) => r.confidence !== 'high').length,
    };
  }

  async saveProfile(userId: string, dto: SaveJobProfileDto) {
    const existing = await this.prisma.jobProfile.findUnique({ where: { userId } });
    const parsed: ParsedResume = {
      headline: dto.headline, skills: dto.skills, experienceYears: dto.experienceYears,
      seniority: dto.experienceYears >= 10 ? 'lead' : dto.experienceYears >= 6 ? 'senior' : dto.experienceYears >= 2 ? 'mid' : 'junior',
      location: dto.location ?? null,
    };
    await this.persistProfile(userId, parsed, existing?.resumeText ?? '', existing?.resumeName ?? null, {
      fullName: dto.fullName, summary: dto.summary, currentTitle: dto.currentTitle, currentCompany: dto.currentCompany,
      education: dto.education, links: dto.links,
      openToRoles: dto.openToRoles ? dto.openToRoles.join(',') : undefined,
      noticeDays: dto.noticeDays, expectedLpa: dto.expectedLpa, photoUrl: dto.photoUrl,
    });
    return this.getProfile(userId);
  }

  private async persistProfile(userId: string, p: ParsedResume, resumeText: string, resumeName: string | null,
    extra: Record<string, unknown> = {}) {
    // `undefined` in `extra` means "leave whatever is there" — a citizen who
    // has edited their own summary must not have it overwritten by a re-upload
    // that the reader could not summarise.
    const clean = Object.fromEntries(Object.entries(extra).filter(([, v]) => v !== undefined));
    const data = { headline: p.headline, skills: p.skills.join(','), experienceYears: p.experienceYears, seniority: p.seniority, location: p.location, resumeText, resumeName, ...clean };
    await this.prisma.jobProfile.upsert({ where: { userId }, update: data, create: { userId, ...data } });
    // Write shared fields back to the Master Profile (job title → occupation,
    // CV location → city) so every other hub stays in sync.
    await this.masterProfile.syncShared(userId, { occupation: p.headline || undefined, city: p.location ?? undefined }, 'jobs').catch(swallowed('jobs.persistProfile', undefined));
  }

  // ─────────────── job board (seeded + company-posted) ───────────────
  private toJobLike(j: { id: string; title: string; company: string; location: string; remote: boolean; seniority: string; skills: string; minYears: number; salaryLpa: number; blurb: string; postedById: string | null }, userId?: string): JobLike {
    return {
      id: j.id, title: j.title, company: j.company, location: j.location, remote: j.remote,
      seniority: j.seniority as ParsedResume['seniority'], skills: j.skills ? j.skills.split(',').filter(Boolean) : [],
      minYears: j.minYears, salaryLpa: j.salaryLpa, blurb: j.blurb,
      postedByYou: Boolean(userId && j.postedById === userId),
    };
  }

  private async allJobs(userId?: string): Promise<JobLike[]> {
    // unbounded: the matcher scores EVERY open posting — the board is
    // employer-curated and moderated, not citizen-grown
    const rows = await this.prisma.job.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((r) => this.toJobLike(r, userId));
  }

  /**
   * Postings found on companies' own public ATS boards (the scanner writes
   * them; see external/external-jobs.service.ts). Bounded two ways, both
   * honesty rules rather than performance ones: only rows a re-scan has
   * CONFIRMED inside the serve window (a posting the city has not seen for
   * a month must not be offered as open), newest first, capped so the
   * matcher scores a market, not an archive. minYears 0 and salaryLpa 0:
   * the board did not say, so the matcher's experience and salary terms
   * stay silent instead of guessing.
   */
  private async externalJobs(): Promise<JobLike[]> {
    const seenSince = new Date(Date.now() - ExternalJobsService.SERVE_WINDOW_DAYS * 24 * 3600 * 1000);
    const rows = await this.prisma.externalJob.findMany({
      where: { lastSeenAt: { gte: seenSince } },
      orderBy: [{ postedAt: { sort: 'desc', nulls: 'last' } }, { firstSeenAt: 'desc' }],
      take: 500,
    });
    return rows.map((r): JobLike => ({
      id: r.id, title: r.title, company: r.company, location: r.location, remote: r.remote,
      seniority: r.seniority as ParsedResume['seniority'],
      skills: r.skills ? r.skills.split(',').filter(Boolean) : [],
      minYears: 0, salaryLpa: r.salaryLpa, blurb: r.blurb,
      postedByYou: false,
      externalUrl: r.url,
      source: r.source,
    }));
  }

  /** Matched roles for the saved profile, scored across every open posting —
   *  Together City's own board and the live India postings read from
   *  companies' public ATS boards, one ranked list. */
  async matches(userId: string) {
    const row = await this.prisma.jobProfile.findUnique({ where: { userId } });
    if (!row) return { hasProfile: false, matches: [] };
    const parsed: ParsedResume = {
      headline: row.headline, skills: row.skills ? row.skills.split(',').filter(Boolean) : [],
      experienceYears: row.experienceYears, seniority: row.seniority as ParsedResume['seniority'], location: row.location,
    };
    const jobs = (await this.allJobs(userId)).concat(await this.externalJobs());
    // unbounded: their own applications, as a filter set — truncation would
    // re-offer roles they already applied to
    const applied = new Set((await this.prisma.jobApplication.findMany({ where: { userId }, select: { jobId: true } })).map((a) => a.jobId));
    // The shortlist rule (jobs-engine.relevantMatches): no weak fits, and an
    // external role must share at least one skill with the CV — the page
    // shows roles matched to the citizen, not everything the sweep found.
    const matches = relevantMatches(matchJobs(parsed, jobs)).map((m) => ({
      ...m,
      matchedSkills: m.matchedSkills.map((k) => ({ key: k, label: labelFor(k) })),
      missingSkills: m.missingSkills.map((k) => ({ key: k, label: labelFor(k) })),
      applied: applied.has(m.id),
    }));
    return { hasProfile: true, matches };
  }

  async apply(userId: string, dto: ApplyDto) {
    // C2: you can't apply without a parsed resume/profile — recruiters were
    // getting blank "0 yrs, no skills" applications.
    const profile = await this.prisma.jobProfile.findUnique({ where: { userId } });
    if (!profile || !(profile.skills && profile.skills.trim())) {
      throw new BadRequestException('Add your resume before applying so recruiters can see your skills.');
    }
    const job = await this.prisma.job.findUnique({ where: { id: dto.jobId } });
    if (!job) {
      // An external posting reached the apply route (an old client, or a
      // hand-built request). The truthful answer is where to actually apply,
      // not a bare 404 that reads as "this job vanished".
      const ext = await this.prisma.externalJob.findUnique({ where: { id: dto.jobId } });
      if (ext) throw new BadRequestException('This role lives on the company’s own site — open it there to apply.');
      throw new NotFoundException('job not found');
    }
    await this.prisma.jobApplication.upsert({
      where: { userId_jobId: { userId, jobId: dto.jobId } },
      update: { coverNote: dto.coverNote ?? null },
      create: { userId, jobId: dto.jobId, title: job.title, company: job.company, coverNote: dto.coverNote ?? null, status: 'applied' },
    });
    return this.applications(userId);
  }

  /** H6: a candidate withdraws their own application. */
  async withdraw(userId: string, appId: string) {
    const app = await this.prisma.jobApplication.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('application not found');
    if (app.userId !== userId) throw new ForbiddenException('not your application');
    await this.prisma.jobApplication.delete({ where: { id: appId } });
    return this.applications(userId);
  }

  /** C1: a recruiter shortlists / rejects an applicant on one of their postings. */
  async updateApplicationStatus(userId: string, appId: string, status: string) {
    const app = await this.prisma.jobApplication.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('application not found');
    const job = await this.prisma.job.findUnique({ where: { id: app.jobId } });
    if (!job || job.postedById !== userId) throw new ForbiddenException('not your posting');
    await this.prisma.jobApplication.update({ where: { id: appId }, data: { status } });
    return this.applicants(userId, app.jobId);
  }

  async applications(userId: string) {
    const rows = await this.prisma.jobApplication.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP });
    // createdAt is an instant, so the date it falls on depends on who is
    // looking. Applying at 01:00 in Asia/Kolkata is 19:30 the previous day in
    // UTC — the citizen would see a date they did not apply on.
    const tz = await this.clock.timezoneFor(userId);
    return rows.map((a) => ({ id: a.id, jobId: a.jobId, title: a.title, company: a.company, status: a.status, coverNote: a.coverNote, appliedOn: this.clock.dayIn(tz, a.createdAt) }));
  }

  // ─────────────── employer side (post a job, see applicants) ───────────────
  private seniorityFromYears(years: number): string {
    return years >= 10 ? 'lead' : years >= 6 ? 'senior' : years >= 2 ? 'mid' : 'junior';
  }

  async postJob(userId: string, dto: PostJobDto) {
    // M2: don't let the same role be posted twice by the same employer.
    const dupe = await this.prisma.job.findFirst({
      where: {
        postedById: userId,
        title: { equals: dto.title, mode: 'insensitive' },
        company: { equals: dto.company, mode: 'insensitive' },
        location: { equals: dto.location, mode: 'insensitive' },
      },
    });
    if (dupe) throw new BadRequestException('You already have a posting with this title, company and location.');
    const seniority = dto.seniority ?? this.seniorityFromYears(dto.minYears); // M5
    await this.prisma.job.create({
      data: {
        postedById: userId, title: dto.title, company: dto.company, location: dto.location, remote: dto.remote,
        seniority, skills: dto.skills.join(','), minYears: dto.minYears, salaryLpa: dto.salaryLpa, blurb: dto.blurb ?? '',
      },
    });
    return this.myPostings(userId);
  }

  /** H4: edit one of your own postings (existing columns only — no migration). */
  async updatePosting(userId: string, id: string, dto: PostJobDto) {
    const existing = await this.prisma.job.findFirst({ where: { id, postedById: userId } });
    if (!existing) throw new NotFoundException('posting not found');
    const seniority = dto.seniority ?? this.seniorityFromYears(dto.minYears);
    await this.prisma.job.update({
      where: { id },
      data: {
        title: dto.title, company: dto.company, location: dto.location, remote: dto.remote,
        seniority, skills: dto.skills.join(','), minYears: dto.minYears, salaryLpa: dto.salaryLpa, blurb: dto.blurb ?? '',
      },
    });
    return this.myPostings(userId);
  }

  /** H4: delete one of your own postings (cascades to its applications). */
  async deletePosting(userId: string, id: string) {
    const existing = await this.prisma.job.findFirst({ where: { id, postedById: userId } });
    if (!existing) throw new NotFoundException('posting not found');
    await this.prisma.job.delete({ where: { id } });
    return this.myPostings(userId);
  }

  async myPostings(userId: string) {
    const rows = await this.prisma.job.findMany({ where: { postedById: userId }, orderBy: { createdAt: 'desc' }, take: ORDER_HISTORY_CAP });
    const counts = await this.prisma.jobApplication.groupBy({ by: ['jobId'], where: { jobId: { in: rows.map((r) => r.id) } }, _count: { jobId: true } });
    const countBy = new Map(counts.map((c) => [c.jobId, c._count.jobId]));
    const tz = await this.clock.timezoneFor(userId);
    return rows.map((r) => ({
      id: r.id, title: r.title, company: r.company, location: r.location, remote: r.remote,
      salaryLpa: r.salaryLpa, minYears: r.minYears, seniority: r.seniority, blurb: r.blurb,
      skills: (r.skills ? r.skills.split(',').filter(Boolean) : []).map((k) => ({ key: k, label: labelFor(k) })),
      applicantCount: countBy.get(r.id) ?? 0, postedOn: this.clock.dayIn(tz, r.createdAt),
    }));
  }

  async applicants(userId: string, jobId: string) {
    const job = await this.prisma.job.findFirst({ where: { id: jobId, postedById: userId } });
    if (!job) throw new NotFoundException('posting not found');
    const apps = await this.prisma.jobApplication.findMany({ where: { jobId }, orderBy: { createdAt: 'desc' }, take: FEED_CAP });
    const jobSkills = new Set(job.skills ? job.skills.split(',').filter(Boolean) : []);
    // M1: batch the user + profile lookups instead of N+1 per applicant.
    const userIds = [...new Set(apps.map((a) => a.userId))];
    const [users, profs] = await Promise.all([
      // unbounded: `in:` of ids from the capped list above bounds both reads
      this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, handle: true } }),
      // unbounded: same bounded id set
      this.prisma.jobProfile.findMany({ where: { userId: { in: userIds } } }),
    ]);
    const userBy = new Map(users.map((u) => [u.id, u]));
    const profBy = new Map(profs.map((p) => [p.userId, p]));
    // The recruiter's zone: these dates are being shown to THEM.
    const tz = await this.clock.timezoneFor(userId);
    const out = apps.map((a) => {
      const applicant = userBy.get(a.userId);
      const prof = profBy.get(a.userId);
      const skills = prof?.skills ? prof.skills.split(',').filter(Boolean) : [];
      const matched = skills.filter((s) => jobSkills.has(s));
      return {
        id: a.id, name: applicant?.name ?? 'Candidate', handle: applicant?.handle ?? '',
        headline: prof?.headline ?? '', experienceYears: prof?.experienceYears ?? 0,
        matchedSkills: matched.map((k) => labelFor(k)), coverNote: a.coverNote, status: a.status,
        appliedOn: this.clock.dayIn(tz, a.createdAt),
      };
    });
    return { job: { id: job.id, title: job.title, company: job.company }, applicants: out };
  }

  private async ensureSeedJobs(): Promise<void> {
    // JOB_SEEDS are postings from companies that do not exist, upserted on every
    // boot, and real citizens can apply to them. Off a demo deployment they are
    // removed — but only the ones nobody applied to, because a JobApplication is
    // a real person's real submission and is not ours to delete.
    if (!demoDataEnabled()) {
      const ids = JOB_SEEDS.map((j) => j.id);
      // unbounded: distinct jobIds over the fixed seed-id set
      const withApplicants = await this.prisma.jobApplication
        .findMany({ where: { jobId: { in: ids } }, select: { jobId: true }, distinct: ['jobId'] })
        .then((rows: Array<{ jobId: string }>) => rows.map((r) => r.jobId))
        .catch(() => ids);   // on error, touch nothing
      const removable = ids.filter((id) => !withApplicants.includes(id));
      if (removable.length) {
        await this.prisma.job.deleteMany({ where: { id: { in: removable }, postedById: null } })
          .catch(swallowed('jobs.ensureSeedJobs', undefined));
      }
      if (withApplicants.length) {
        this.logger.warn(
          `Seeded job postings still live because citizens have applied to them: ${withApplicants.join(', ')}. Their applications need answering or withdrawing before the postings can go.`,
        );
      }
      return;
    }
    try {
      for (const j of JOB_SEEDS) {
        await this.prisma.job.upsert({
          where: { id: j.id },
          update: {},
          create: { id: j.id, postedById: null, title: j.title, company: j.company, location: j.location, remote: j.remote, seniority: j.seniority, skills: j.skills.join(','), minYears: j.minYears, salaryLpa: j.salaryLpa, blurb: j.blurb },
        });
      }
    } catch { /* seeding best-effort */ }
  }
}
