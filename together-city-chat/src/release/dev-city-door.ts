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

/**
 * ── TWO PEOPLE ON THE COPY, ONE AT THE CONTROLS (owner, 17 Sep) ─────────────
 *
 * "Let @shruti login to dev.togethercity.app so only me and shruti have
 * access." Signing in to the copy and opening /dev (Go live, the site
 * switches) were one list until now, so adding a name to the copy would have
 * handed it the operator page's account lock as well. They are two lists:
 *
 *   DEV_COPY_ACCOUNTS  — who may sign in / create an account on the copy.
 *   DEV_PAGE_ACCOUNTS  — who may open /dev and see what is waiting to go live.
 *
 * DEV_COPY_ACCOUNTS UNSET means the copy's door follows DEV_PAGE_ACCOUNTS, as
 * it did on 16 Sep — so deploying this changes nothing until the variable is
 * written. Written but empty (or only commas) is still "unset": an empty list
 * written by mistake must not quietly lock the owner out of his own copy.
 */
export function devCopyAccounts(env: NodeJS.ProcessEnv = process.env): string[] {
  const own = (env.DEV_COPY_ACCOUNTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return own.length > 0 ? own : devAccounts(env);
}

function listed(list: string[], who: { id?: string | null; handle: string }): boolean {
  const handle = who.handle.trim().toLowerCase().replace(/^@/, '');
  const id = (who.id ?? '').trim().toLowerCase();
  return list
    .map((a) => a.replace(/^@/, ''))
    .some((a) => a === handle || (id !== '' && a === id));
}

/** May this account sign in to (or join) the developer copy? */
export function devCopyAdmits(
  who: { id?: string | null; handle: string },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDevCopy(env)) return true;
  return listed(devCopyAccounts(env), who);
}

/** Is this account one of the copy's operators (DEV_PAGE_ACCOUNTS)? Never on the live site. */
export function devCopyOperator(
  who: { id?: string | null; handle: string },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isDevCopy(env)) return false;
  return listed(devAccounts(env), who);
}
