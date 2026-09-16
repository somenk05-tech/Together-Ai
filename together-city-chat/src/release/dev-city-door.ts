import { devAccounts } from '../dev/dev-password.guard';

/**
 * ── THE DEVELOPER COPY HAS ONE DOOR (owner, 16 Sep) ─────────────────────────
 *
 * "Only I should be able to log in and create an account there, and no one
 * else."
 *
 * dev.togethercity.app is already behind Vercel's login, but its API
 * (dev-api.togethercity.app) is a public address. So the API refuses, on the
 * developer environment only, every sign-in and every new account that is not
 * named in DEV_PAGE_ACCOUNTS — the same list that already decides who may
 * open /dev, handles or user ids.
 *
 * ONLY WHEN RELEASE_CHANNEL IS WRITTEN AS "dev". Not the inferred channel in
 * release.ts: a laptop and the test suites are also "the developer city" by
 * inference, and neither should need an allowlist to sign in. The live site
 * never sets it to "dev", so this can never close the live city.
 *
 * FAILS CLOSED on the developer environment: with the list empty nobody signs
 * in there, exactly like /dev.
 */
export function isDevCopy(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.RELEASE_CHANNEL ?? '').trim().toLowerCase() === 'dev';
}

export function devCopyAdmits(
  who: { id?: string | null; handle: string },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDevCopy(env)) return true;
  const handle = who.handle.trim().toLowerCase().replace(/^@/, '');
  const id = (who.id ?? '').trim().toLowerCase();
  return devAccounts(env)
    .map((a) => a.replace(/^@/, ''))
    .some((a) => a === handle || (id !== '' && a === id));
}
