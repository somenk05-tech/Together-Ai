/**
 * ONE ORIGIN POLICY, READ BY BOTH DOORS.
 *
 * There were two. `main.ts` was tightened on 26 Aug after the drive-by
 * account-takeover finding — it had been reflecting ANY `*.vercel.app` origin
 * with `credentials: true` while `POST /auth/refresh` was public and returned
 * a 60-day refresh token to a `SameSite=None` cookie — and was rewritten to
 * accept only the explicit allowlist, our own domain, and the aliases of ONE
 * named Vercel project.
 *
 * `shared/ws-cors.ts` was a copy of the OLD policy, and its docblock said
 * "same policy as the HTTP CORS in main.ts" while the two had diverged. The
 * socket gateway authenticates on `handshake.auth.token` rather than on the
 * cookie, so it was not the same takeover — but a second copy of a rule that
 * looks correct and is a month stale is exactly the failure CLAUDE.md's Fold
 * note describes, and the next person to tighten one of them would have
 * tightened one of them.
 *
 * So the matcher lives here and both import it. The gateway needs it at import
 * time (decorators evaluate then), so this reads `process.env` rather than
 * taking a ConfigService; `main.ts` passes the value it has already resolved,
 * which is the same variable.
 */
export interface OriginPolicy {
  /** Is this Origin header allowed? An absent Origin (curl, same-origin, S2S) is. */
  allows(origin: string | undefined): boolean;
  /** True when the policy is the development wildcard. */
  allowAll: boolean;
}

const isOwnDomain = (o: string): boolean => /^https:\/\/([a-z0-9-]+\.)?togethercity\.app$/i.test(o);

/**
 * Preview deployments of ONE named project, never of the whole platform.
 *
 * `<project>-<hash>-<team>.vercel.app` and `<project>-git-<branch>-<team>` are
 * the two shapes Vercel produces. Unset `CORS_PREVIEW_PROJECT` or
 * `CORS_PREVIEW_TEAM` and nothing on vercel.app matches at all, which is the
 * right default: a free subdomain anybody can deploy to is not a trusted
 * origin for a credentialed request.
 */
function previewMatcher(): (o: string) => boolean {
  const project = (process.env.CORS_PREVIEW_PROJECT ?? '').trim().toLowerCase();
  const team = (process.env.CORS_PREVIEW_TEAM ?? '').trim().toLowerCase();
  if (!project || !team) return () => false;
  return (o: string): boolean => {
    const m = /^https:\/\/([a-z0-9-]+)\.vercel\.app$/i.exec(o);
    if (!m) return false;
    const host = m[1].toLowerCase();
    return host === `${project}-${team}`
      || (host.startsWith(`${project}-git-`) && host.endsWith(`-${team}`))
      || new RegExp(`^${project}-[a-z0-9]{6,12}-${team}$`).test(host);
  };
}

/**
 * @param corsOrigin the CORS_ORIGIN value — a comma-separated allowlist, or
 *   the `*` development sentinel.
 * @param prod whether this is a production deploy. `*` is refused there, and
 *   refusing it loudly is the CALLER's job in `main.ts`, which throws on boot;
 *   here it simply stops meaning "everything".
 */
export function originPolicy(corsOrigin: string, prod: boolean): OriginPolicy {
  const allowlist = corsOrigin.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const allowAll = corsOrigin === '*' && !prod;
  const isOurPreview = previewMatcher();
  return {
    allowAll,
    allows(origin: string | undefined): boolean {
      if (!origin) return true;
      const o = origin.replace(/\/+$/, '');
      return allowAll || allowlist.includes(o) || isOwnDomain(o) || isOurPreview(o);
    },
  };
}
