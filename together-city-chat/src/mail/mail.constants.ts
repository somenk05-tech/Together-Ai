import { informalName } from '../shared/salutation';
/** Together City Mail — constants. */

export const MAIL_DOMAIN = 'togethercity.app';
/** Previously issued city domain — still routed internally so addresses that
 *  were already shared (and mail already in inboxes) keep working. */
export const LEGACY_MAIL_DOMAINS = ['togethercity.tech'] as const;
export const CITY_DOMAINS: readonly string[] = [MAIL_DOMAIN, ...LEGACY_MAIL_DOMAINS];
export const QUOTA_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB per citizen

export const addressFor = (handle: string): string => `${handle}@${MAIL_DOMAIN}`;
/** True for any address on a city domain (current or legacy). */
export const isCityAddress = (raw: string): boolean => {
  const domain = (raw || '').trim().toLowerCase().split('@')[1];
  return Boolean(domain) && CITY_DOMAINS.includes(domain);
};
/** Strip a city domain off an address, leaving the bare handle. */
export const stripCityDomain = (raw: string): string => {
  const v = (raw || '').trim().toLowerCase();
  const [local, domain] = v.split('@');
  return domain && CITY_DOMAINS.includes(domain) ? local : v;
};
/**
 * Parse a city address into the mailbox it names and the project tag it was
 * sub-addressed with, or null if the address is off-domain (truly external).
 *
 * SUB-ADDRESSING IS ONE MAILBOX, NOT A SECOND ACCOUNT. `you+abg@` is delivered
 * to `you`, and the `abg` is a hint about where in that mailbox it belongs —
 * which is the whole reason project folders do not each need an address of
 * their own.
 *
 * The `+` USED TO BE SCRUBBED. The old parser stripped everything outside
 * [a-z0-9._-] from the local part, so `you+abg@togethercity.app` resolved to
 * the handle `youabg` — a mailbox nobody has — and the mail was silently
 * dropped as having no city recipient. Sub-addressed mail has therefore never
 * arrived here; splitting on the `+` before scrubbing is what fixes it, and it
 * is a fix whether or not projects exist.
 */
export const cityRecipient = (raw: string): { handle: string; tag: string | null } | null => {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  const at = v.includes('@');
  const [localRaw, domain] = at ? v.split('@') : [v, ''];
  if (at && !CITY_DOMAINS.includes(domain)) return null;
  const [base, ...rest] = localRaw.split('+');
  const handle = base.replace(/[^a-z0-9._-]/g, '');
  if (!handle) return null;
  const tag = rest.join('').replace(/[^a-z0-9-]/g, '');
  return { handle, tag: tag || null };
};

/** Parse a "handle@togethercity.app" (or legacy .tech, or bare handle) into a
 *  city handle, or null if the address is off-domain (i.e. truly external). */
export const handleFromAddress = (raw: string): string | null => cityRecipient(raw)?.handle ?? null;

/** you+abg@togethercity.app — the citizen's own address with a hint on it.
 *  One mailbox, and never a second account: see cityRecipient above. */
export const subAddressed = (address: string, key: string): string => {
  const [local, domain] = (address || '').split('@');
  return domain ? `${local}+${key}@${domain}` : `${local}+${key}`;
};

export const snippetOf = (body: string, n = 140): string => {
  const s = (body || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
};

/** Deterministic on-disk size: header overhead + UTF-8 byte length of subject + body. */
export const sizeOf = (subject: string, body: string): number =>
  512 + Buffer.byteLength(subject || '', 'utf8') + Buffer.byteLength(body || '', 'utf8');

export const humanBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};

/** The welcome mail every new mailbox is seeded with. */
export const welcomeMail = (name: string, address: string) => ({
  fromAddr: `city@${MAIL_DOMAIN}`, fromName: 'Together City',
  subject: `Welcome to Together City Mail, ${informalName(name)}!`,
  body: [
    `Hi ${informalName(name)},`,
    ``,
    `Your city inbox is live. Your address is ${address} — share it with anyone in Together City and they can reach you here.`,
    ``,
    `A few things you can do:`,
    `• Compose a message to any citizen at their @${MAIL_DOMAIN} address`,
    `• Star important mail to find it fast`,
    `• You've got 10 GB of space — plenty for a lifetime of city letters`,
    ``,
    `Confirmations from your bookings across the city — tickets, tables, trips — can land here too.`,
    ``,
    `Warmly,`,
    `The Together City team`,
  ].join('\n'),
  system: true,
});
