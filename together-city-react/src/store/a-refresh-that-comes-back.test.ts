import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A REFRESH THAT COMES BACK (10 Sep). Owner, on "All listed services":
 * "this does not get loaded at once — find the issue and fix it."
 *
 * The API's log for that minute: every Local Market request 401 "expired
 * token", and no refresh at all. The single-flight slot in auth.store was only
 * emptied on the body-fallback path, so after the first SUCCESSFUL cookie
 * refresh it held a settled promise for the life of the tab — the next time
 * the fifteen-minute access token died, every caller was handed the same dead
 * token back, the retry 401'd, and the directory said it could not load.
 */
const refresh = vi.fn();
vi.mock('@/api', () => ({ authApi: { refresh: (...a: unknown[]) => refresh(...a), me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn() } }));
vi.mock('@/api/session-reset', () => ({ resetClientState: vi.fn() }));
vi.mock('@/lib/turnstile', () => ({ getTurnstileToken: vi.fn() }));

const { useAuthStore } = await import('./auth.store');

describe('the refresh slot empties on every exit', () => {
  beforeEach(() => { refresh.mockReset(); useAuthStore.setState({ tokens: { accessToken: 'old' }, cookieSession: true }); });

  it('asks the server again the second time — a cookie refresh is not a forever answer', async () => {
    refresh.mockResolvedValueOnce({ accessToken: 'first' }).mockResolvedValueOnce({ accessToken: 'second' });
    expect(await useAuthStore.getState().refresh()).toBe('first');
    expect(await useAuthStore.getState().refresh()).toBe('second');
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('recovers after an outage instead of answering null for ever', async () => {
    refresh.mockRejectedValueOnce({ response: { status: 503 } }).mockResolvedValueOnce({ accessToken: 'back' });
    expect(await useAuthStore.getState().refresh()).toBeNull();
    expect(await useAuthStore.getState().refresh()).toBe('back');
  });

  it('still shares ONE rotation between callers who ask at the same moment', async () => {
    let done!: (v: { accessToken: string }) => void;
    refresh.mockReturnValueOnce(new Promise((r) => { done = r; }));
    const a = useAuthStore.getState().refresh();
    const b = useAuthStore.getState().refresh();
    done({ accessToken: 'shared' });
    expect(await a).toBe('shared');
    expect(await b).toBe('shared');
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
