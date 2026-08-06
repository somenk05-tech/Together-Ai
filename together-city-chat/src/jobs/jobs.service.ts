import { swallowed } from '../shared/swallow';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { demoDataEnabled } from '../shared/demo-data';
import { PrismaService } from '../shared/prisma/prisma.service';
import { ClockService } from '../shared/clock/clock.service';
import { FEED_CAP, ORDER_HISTORY_CAP } from '../shared/paging';
import { MasterProfileService } from '../profile/master-profile.service';
import { parseResume, matchJobs, labelFor, JOB_SEEDS, type ParsedResume, type JobLike } from './jobs-engine';
import { AiService } from '../ai/ai.service';
import type { UploadResumeDto, SaveJobProfileDto, ApplyDto, PostJobDto } from './dto/jobs.dto';

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
  } | null) {
    if (!row) {
      return {
        saved: false, headline: '', skills: [] as { key: string; label: string }[],
        experienceYears: 0, seniority: 'junior', location: null, resumeName: null,
        resumeUrl: null, resumeBytes: 0, resumeAt: null, photoUrl: null, fullName: '',
        summary: '', currentTitle: '', currentCompany: '', education: '',
        openToRoles: [] as string[], noticeDays: null, expectedLpa: null, links: '',
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
      openToRoles: (row.openToRoles ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      noticeDays: row.noticeDays ?? null,
      expectedLpa: row.expectedLpa ?? null,
      links: row.links ?? '',
    };
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
    await this.prisma.jobProfile.updateMany({
      where: { userId },
      data: { resumeText: '', resumeName: null, resumeUrl: null, resumeBytes: 0, resumeAt: null },
    });
    return this.getProfile(userId);
  }

  async getProfile(userId: string) {
    const shaped = this.shapeProfile(await this.prisma.jobProfile.findUnique({ where: { userId } }));
    // Auto-fill the shared location from the Master Profile when the CV had none
    // (spec: read shared fields; never re-ask).
    if (!shaped.location) {
      const m = await this.masterProfile.get(userId).catch(swallowed('jobs.getProfile', null));
      if (m?.city) shaped.location = m.city;
    }
    return shaped;
  }

  async uploadResume(userId: string, dto: UploadResumeDto) {
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
      resumeUrl: dto.fileUrl ?? null,
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
    const jobs = await this.allJobs(userId);
    return { parsed: this.shapeProfile({ headline: parsed.headline, skills: parsed.skills.join(','), experienceYears: parsed.experienceYears, location: parsed.location, seniority: parsed.seniority, resumeName: dto.fileName ?? null }), matchCount: matchJobs(parsed, jobs).length };
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

  /** Matched roles for the saved profile, scored across every open posting. */
  async matches(userId: string) {
    const row = await this.prisma.jobProfile.findUnique({ where: { userId } });
    if (!row) return { hasProfile: false, matches: [] };
    const parsed: ParsedResume = {
      headline: row.headline, skills: row.skills ? row.skills.split(',').filter(Boolean) : [],
      experienceYears: row.experienceYears, seniority: row.seniority as ParsedResume['seniority'], location: row.location,
    };
    const jobs = await this.allJobs(userId);
    // unbounded: their own applications, as a filter set — truncation would
    // re-offer roles they already applied to
    const applied = new Set((await this.prisma.jobApplication.findMany({ where: { userId }, select: { jobId: true } })).map((a) => a.jobId));
    const matches = matchJobs(parsed, jobs).map((m) => ({
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
    if (!job) throw new NotFoundException('job not found');
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
