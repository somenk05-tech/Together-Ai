import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AdminAccessService } from '../admin/admin-access.service';
import { presence } from '../dev/env-manifest';
import { LIVE_HUBS } from './live-hubs';
import {
  RELEASE_BOT_TITLE, areasOf, commitDetails, deployLabel, isLiveEnvironment, pickedFrom,
} from './release-areas';
import {
  RELEASE_HUBS, RELEASE_REPO, RELEASE_RUNS_URL, RELEASE_WORKFLOW,
  isReleaseKey, normaliseLiveHubs, releaseChannel, releaseLabel,
} from './release';

const GITHUB = 'https://api.github.com';

export interface PendingChange {
  /** Full id — what the press sends. */
  sha: string;
  short: string;
  title: string;
  /** The rest of the message, trailers removed. */
  details: string;
  at: string | null;
  url: string;
  /** Where it lands, in words ("Beauty", "Database change", …). Null: GitHub did not say. */
  areas: string[] | null;
  /** The files it touches (first 60) — lets the page warn when one change leans on another. */
  files: string[] | null;
}

export interface PendingChanges {
  /** How many changes the developer copy has that the live site lacks; null when GitHub could not be asked. */
  waiting: number | null;
  /** Newest first, at most 30. */
  changes: PendingChange[];
}

export type ReleaseStage = 'none' | 'building' | 'failed' | 'deploying' | 'deployed' | 'deploy-failed';

export interface ReleaseStatus {
  stage: ReleaseStage;
  run: ReleaseRun | null;
  /** What togethercity.app is built from now. */
  main: { sha: string; title: string; at: string | null; url: string } | null;
  /** Vercel and Railway, as they reported the build of `main` to GitHub. */
  deploys: Array<{ name: string; state: string; at: string | null; url: string | null }>;
}

export interface ReleaseRun {
  id: number;
  title: string;
  status: string;
  conclusion: string | null;
  createdAt: string;
  url: string;
}

/**
 * THE GO LIVE BUTTON, SERVER SIDE.
 *
 * It does not deploy anything itself. It asks GitHub to run
 * .github/workflows/go-live.yml, which writes the chosen hubs into
 * live-hubs.ts on `develop`, builds `develop` from a clean checkout, and only
 * then merges it into `main` — and a push to `main` is what Vercel and Railway
 * deploy. So a release that does not build never reaches the live site, and a
 * press that GitHub refuses changes nothing.
 *
 * GITHUB_RELEASE_TOKEN is set on the DEVELOPER environment only. The live
 * deployment has no token and refuses the press outright, so there is no way
 * to push the live site from the live site.
 */
@Injectable()
export class ReleaseService {
  private readonly logger = new Logger('Release');

  constructor(private readonly access: AdminAccessService) {}

  state() {
    const channel = releaseChannel();
    return {
      channel,
      hubs: RELEASE_HUBS.map((h) => ({
        key: h.key,
        label: releaseLabel(h.key),
        live: LIVE_HUBS.includes(h.key),
      })),
      tokenSet: presence('GITHUB_RELEASE_TOKEN'),
      canGoLive: channel === 'dev' && presence('GITHUB_RELEASE_TOKEN'),
      runsUrl: RELEASE_RUNS_URL,
    };
  }

  /** The last few presses, as GitHub tells it. Null when GitHub did not answer
   *  — "no releases yet" and "could not ask" are different sentences. */
  async runs(limit = 5): Promise<{ runs: ReleaseRun[] | null }> {
    const token = (process.env.GITHUB_RELEASE_TOKEN ?? '').trim();
    if (!token) return { runs: null };
    try {
      const res = await fetch(
        `${GITHUB}/repos/${RELEASE_REPO}/actions/workflows/${RELEASE_WORKFLOW}/runs?per_page=${limit}`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return { runs: null };
      const body = await res.json() as {
        workflow_runs?: Array<{
          id: number; display_title?: string; status: string;
          conclusion: string | null; created_at: string; html_url: string;
        }>;
      };
      return {
        runs: (body.workflow_runs ?? []).map((r) => ({
          id: r.id,
          title: r.display_title ?? 'Go live',
          status: r.status,
          conclusion: r.conclusion,
          createdAt: r.created_at,
          url: r.html_url,
        })),
      };
    } catch {
      return { runs: null };
    }
  }

  /**
   * ── WHAT IS WAITING (owner, 16 Sep) ──────────────────────────────────────
   *
   * The commits on `develop` that `main` does not have, newest first, as
   * GitHub's compare answers it. Kept for a minute: every developer page asks,
   * and the answer only changes when somebody pushes or presses Go live.
   * `waiting: null` means "could not ask" — never read as "nothing waiting".
   */
  private pendingCache: { at: number; value: PendingChanges } | null = null;

  async pending(): Promise<PendingChanges> {
    if (this.pendingCache && Date.now() - this.pendingCache.at < 60_000) return this.pendingCache.value;
    const token = (process.env.GITHUB_RELEASE_TOKEN ?? '').trim();
    let value: PendingChanges = { waiting: null, changes: [] };
    if (token) {
      try {
        const [ahead, behind] = await Promise.all([
          this.compare(token, 'main...develop'),
          // What main has that develop does not: changes already sent on their own.
          this.compare(token, 'develop...main').catch(() => null),
        ]);
        const sent = new Set((behind?.commits ?? []).flatMap((c) => pickedFrom(c.commit.message)));
        const waiting = (ahead.commits ?? []).filter((c) =>
          (c.parents?.length ?? 1) < 2
          && !sent.has(c.sha)
          && !c.commit.message.startsWith(RELEASE_BOT_TITLE));
        const newest = waiting.reverse().slice(0, 30);
        const files = await Promise.all(newest.map((c) => this.filesOf(token, c.sha)));
        value = {
          waiting: waiting.length,
          changes: newest.map((c, i) => ({
            sha: c.sha,
            short: c.sha.slice(0, 8),
            title: c.commit.message.split('\n')[0].slice(0, 140),
            details: commitDetails(c.commit.message),
            at: c.commit.committer?.date ?? null,
            url: c.html_url,
            areas: files[i] ? areasOf(files[i] as string[]) : null,
            files: files[i] ? (files[i] as string[]).slice(0, 60) : null,
          })),
        };
      } catch {
        /* GitHub did not answer: `waiting: null` says so. */
      }
    }
    this.pendingCache = { at: Date.now(), value };
    return value;
  }

  /** A commit's files never change, so each is asked once per process. */
  private readonly fileCache = new Map<string, string[]>();

  private async filesOf(token: string, sha: string): Promise<string[] | null> {
    const hit = this.fileCache.get(sha);
    if (hit) return hit;
    try {
      const res = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/commits/${sha}`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const body = await res.json() as { files?: Array<{ filename: string }> };
      const files = (body.files ?? []).map((f) => f.filename);
      if (this.fileCache.size > 500) this.fileCache.clear();
      this.fileCache.set(sha, files);
      return files;
    } catch {
      return null;
    }
  }

  private async compare(token: string, range: string) {
    const res = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/compare/${range}?per_page=250`,
      { headers: this.headers(token), signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`compare ${res.status}`);
    return await res.json() as {
      commits?: Array<{
        sha: string; html_url: string; parents?: unknown[];
        commit: { message: string; committer?: { date?: string } };
      }>;
    };
  }

  /**
   * ── HAS IT GONE LIVE? (owner, 16 Sep: "add if the changes has been deployed")
   *
   * The last press, then what main is, then what Vercel and Railway told
   * GitHub about deploying that exact commit. Kept 15 seconds; the page asks
   * every 15 while something is moving.
   */
  private statusCache: { at: number; value: ReleaseStatus } | null = null;

  async status(): Promise<ReleaseStatus> {
    if (this.statusCache && Date.now() - this.statusCache.at < 15_000) return this.statusCache.value;
    const token = (process.env.GITHUB_RELEASE_TOKEN ?? '').trim();
    const value: ReleaseStatus = { stage: 'none', run: null, main: null, deploys: [] };
    if (token) {
      const [runs, main] = await Promise.all([this.runs(1), this.mainCommit(token)]);
      value.run = runs.runs?.[0] ?? null;
      value.main = main;
      if (main) value.deploys = await this.deploysOf(token, main.sha);
      value.stage = stageOf(value);
    }
    this.statusCache = { at: Date.now(), value };
    return value;
  }

  private async mainCommit(token: string): Promise<ReleaseStatus['main']> {
    try {
      const res = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/commits/main`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const c = await res.json() as { sha: string; html_url: string; commit: { message: string; committer?: { date?: string } } };
      return { sha: c.sha, title: c.commit.message.split('\n')[0].slice(0, 140), at: c.commit.committer?.date ?? null, url: c.html_url };
    } catch {
      return null;
    }
  }

  private async deploysOf(token: string, sha: string): Promise<ReleaseStatus['deploys']> {
    try {
      const res = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/deployments?sha=${sha}&per_page=20`,
        { headers: this.headers(token), signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return [];
      const list = (await res.json() as Array<{ id: number; environment: string; created_at: string }>)
        .filter((d) => isLiveEnvironment(d.environment));
      // Newest per environment only.
      const latest = new Map<string, { id: number; environment: string; created_at: string }>();
      for (const d of list) {
        const had = latest.get(d.environment);
        if (!had || had.created_at < d.created_at) latest.set(d.environment, d);
      }
      return await Promise.all([...latest.values()].map(async (d) => {
        const r = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/deployments/${d.id}/statuses?per_page=1`,
          { headers: this.headers(token), signal: AbortSignal.timeout(10_000) }).catch(() => null);
        const st = r && r.ok
          ? (await r.json() as Array<{ state: string; created_at: string; environment_url?: string; target_url?: string }>)[0]
          : undefined;
        return {
          name: deployLabel(d.environment),
          state: st?.state ?? 'pending',
          at: st?.created_at ?? d.created_at,
          url: st?.environment_url || st?.target_url || null,
        };
      }));
    } catch {
      return [];
    }
  }

  async goLive(userId: string, hubs: string[], reason: string, ip?: string | null, commits?: string[]) {
    if (releaseChannel() !== 'dev') {
      throw new BadRequestException('Go live is pressed on the developer site, not on the live one.');
    }
    const token = (process.env.GITHUB_RELEASE_TOKEN ?? '').trim();
    if (!token) {
      throw new BadRequestException('GITHUB_RELEASE_TOKEN is not set on the developer environment, so GitHub cannot be asked to release.');
    }
    const unknown = hubs.filter((k) => !isReleaseKey(k));
    if (unknown.length) throw new BadRequestException(`No such hub: ${unknown.join(', ')}`);
    const live = normaliseLiveHubs(hubs);
    if (live.length === 0) throw new BadRequestException('Choose at least one hub for the live site.');
    // No list: everything on develop. A list: only those changes (the workflow checks each is waiting).
    const only = [...new Set((commits ?? []).map((c) => c.trim().toLowerCase()))];
    if (only.some((c) => !/^[0-9a-f]{7,40}$/.test(c))) throw new BadRequestException('A chosen change is not a commit id.');
    if (only.length > 30) throw new BadRequestException('Choose at most 30 changes, or send everything.');

    return this.access.act({
      actorId: userId, need: 'ops.deploy',
      action: 'release.go-live', entity: 'release', entityId: 'main',
      before: { hubs: [...LIVE_HUBS] },
      after: { hubs: live, changes: only.length ? only : 'everything' },
      reason, ip,
    }, async () => {
      const res = await fetch(
        `${GITHUB}/repos/${RELEASE_REPO}/actions/workflows/${RELEASE_WORKFLOW}/dispatches`,
        {
          method: 'POST',
          headers: { ...this.headers(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              hubs: live.join(','),
              reason: reason.trim().slice(0, 200),
              ...(only.length ? { commits: only.join(' ') } : {}),
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      ).catch(() => null);
      if (!res || !res.ok) {
        // The status, never the body: GitHub's error body can echo the request.
        this.logger.error(`go-live dispatch refused: ${res ? res.status : 'no answer'}`);
        throw new BadGatewayException(res
          ? `GitHub refused the release (${res.status}). Check the token can run workflows on ${RELEASE_REPO}.`
          : 'GitHub did not answer. Nothing was released; try again.');
      }
      this.pendingCache = null;
      this.statusCache = null;
      return { dispatched: true, hubs: live, changes: only.length || null, runsUrl: RELEASE_RUNS_URL };
    });
  }

  private headers(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'together-city-release',
    };
  }
}

/**
 * One word for where the last release is. A run newer than main is still the
 * story (building, or failed and nothing changed); otherwise main's own
 * deployments are.
 */
export function stageOf(s: Pick<ReleaseStatus, 'run' | 'main' | 'deploys'>, now = Date.now()): ReleaseStage {
  const { run, main, deploys } = s;
  if (run && run.status !== 'completed') return 'building';
  if (run && run.conclusion !== 'success' && (!main?.at || run.createdAt > main.at)) return 'failed';
  if (!main) return run ? 'deploying' : 'none';
  if (deploys.some((d) => d.state === 'failure' || d.state === 'error')) return 'deploy-failed';
  if (deploys.length > 0 && deploys.every((d) => d.state === 'success' || d.state === 'inactive')) return 'deployed';
  // Nothing reported for an old main: nothing to say, rather than "deploying" for ever.
  if (deploys.length === 0 && main.at && now - Date.parse(main.at) > 30 * 60_000) return 'none';
  return 'deploying';
}
