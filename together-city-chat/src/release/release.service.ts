import { BadGatewayException, BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AdminAccessService } from '../admin/admin-access.service';
import { presence } from '../dev/env-manifest';
import { LIVE_HUBS } from './live-hubs';
import {
  RELEASE_HUBS, RELEASE_REPO, RELEASE_RUNS_URL, RELEASE_WORKFLOW,
  isReleaseKey, normaliseLiveHubs, releaseChannel, releaseLabel,
} from './release';

const GITHUB = 'https://api.github.com';

export interface PendingChanges {
  /** How many changes the developer copy has that the live site lacks; null when GitHub could not be asked. */
  waiting: number | null;
  changes: Array<{ sha: string; title: string; at: string | null; url: string }>;
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
  async runs(): Promise<{ runs: ReleaseRun[] | null }> {
    const token = (process.env.GITHUB_RELEASE_TOKEN ?? '').trim();
    if (!token) return { runs: null };
    try {
      const res = await fetch(
        `${GITHUB}/repos/${RELEASE_REPO}/actions/workflows/${RELEASE_WORKFLOW}/runs?per_page=5`,
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
        const res = await fetch(`${GITHUB}/repos/${RELEASE_REPO}/compare/main...develop`,
          { headers: this.headers(token), signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const body = await res.json() as {
            ahead_by?: number;
            commits?: Array<{ sha: string; html_url: string; commit: { message: string; committer?: { date?: string } } }>;
          };
          const changes = (body.commits ?? [])
            .map((c) => ({
              sha: c.sha.slice(0, 8),
              title: c.commit.message.split('\n')[0].slice(0, 140),
              at: c.commit.committer?.date ?? null,
              url: c.html_url,
            }))
            .reverse()
            .slice(0, 30);
          value = { waiting: body.ahead_by ?? changes.length, changes };
        }
      } catch {
        /* GitHub did not answer: `waiting: null` says so. */
      }
    }
    this.pendingCache = { at: Date.now(), value };
    return value;
  }

  async goLive(userId: string, hubs: string[], reason: string, ip?: string | null) {
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

    return this.access.act({
      actorId: userId, need: 'ops.deploy',
      action: 'release.go-live', entity: 'release', entityId: 'main',
      before: { hubs: [...LIVE_HUBS] },
      after: { hubs: live },
      reason, ip,
    }, async () => {
      const res = await fetch(
        `${GITHUB}/repos/${RELEASE_REPO}/actions/workflows/${RELEASE_WORKFLOW}/dispatches`,
        {
          method: 'POST',
          headers: { ...this.headers(token), 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ref: 'main',
            inputs: { hubs: live.join(','), reason: reason.trim().slice(0, 200) },
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
      return { dispatched: true, hubs: live, runsUrl: RELEASE_RUNS_URL };
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
