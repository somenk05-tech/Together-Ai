/**
 * M1's cheapest third: throwaway-email domains that exist to make accounts
 * nobody answers for. A short, well-known list rather than an aspirationally
 * complete one — every entry here is a service whose entire product is
 * addresses that stop existing. False positives cost a real person their
 * signup, so nothing ambiguous belongs on this list.
 */
const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  '10minutemail.com', '10minutemail.net', 'tempmail.com', 'temp-mail.org', 'temp-mail.io',
  'throwawaymail.com', 'trashmail.com', 'trashmail.net', 'getnada.com', 'nada.email',
  'yopmail.com', 'yopmail.net', 'sharklasers.com', 'dispostable.com', 'maildrop.cc',
  'mintemail.com', 'mytemp.email', 'tempinbox.com', 'fakeinbox.com', 'spamgourmet.com',
  'mohmal.com', 'burnermail.io', 'mailnesia.com', 'emailondeck.com', 'tempr.email',
]);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  // Sub-domains of a throwaway service are the same throwaway service.
  return DISPOSABLE.has(domain) || [...DISPOSABLE].some((d) => domain.endsWith('.' + d));
}
