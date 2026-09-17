/**
 * The one way the desk talks to a platform.
 *
 * `fetch` is passed in rather than reached for, so every call in oauth.ts and
 * platforms.ts can be driven by a spec with a scripted server — and a spec
 * that never touches the network is the only kind that can say what a
 * platform's refusal looks like on this page.
 *
 * A REFUSAL IS RECORDED IN THE PLATFORM'S OWN WORDS. Meta nests them under
 * `error.error_user_msg` / `error.message`, Google under `error.message` or
 * `error_description`; whichever is there is what the row says, with the HTTP
 * status in front so it can be searched for.
 */
export type Http = (url: string, init?: RequestInit & { duplex?: 'half' }) => Promise<Response>;

export class PlatformError extends Error {
  constructor(readonly platform: string, readonly status: number, message: string) {
    super(message);
    this.name = 'PlatformError';
  }
}

export function platformWords(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    for (const k of ['error_user_msg', 'message', 'error_description']) {
      if (typeof e[k] === 'string' && (e[k] as string).trim()) return e[k] as string;
    }
  }
  for (const k of ['error_message', 'error_description', 'message']) {
    if (typeof b[k] === 'string' && (b[k] as string).trim()) return b[k] as string;
  }
  if (typeof err === 'string') return err;
  return null;
}

export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text.slice(0, 300) }; }
}

/** One request, JSON back, or a PlatformError carrying the platform's own sentence. */
export async function callJson<T>(http: Http, platform: string, url: string, init?: RequestInit): Promise<T> {
  const res = await http(url, init);
  const body = await readJson(res);
  if (!res.ok) {
    throw new PlatformError(platform, res.status, `${platform} ${res.status}: ${platformWords(body) ?? res.statusText ?? 'refused'}`);
  }
  return body as T;
}

export const form = (fields: Record<string, string>): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
});

export const query = (base: string, fields: Record<string, string>): string =>
  `${base}?${new URLSearchParams(fields).toString()}`;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
