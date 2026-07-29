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
/** Parse a "handle@togethercity.app" (or legacy .tech, or bare handle) into a
 *  city handle, or null if the address is off-domain (i.e. truly external). */
export const handleFromAddress = (raw: string): string | null => {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return null;
  if (!v.includes('@')) return v.replace(/[^a-z0-9._-]/g, '') || null;
  const [local, domain] = v.split('@');
  if (!CITY_DOMAINS.includes(domain)) return null;
  return local.replace(/[^a-z0-9._-]/g, '') || null;
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
  subject: `Welcome to Together City Mail, ${name.split(' ')[0]}!`,
  body: [
    `Hi ${name.split(' ')[0]},`,
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
