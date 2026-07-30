/**
 * The password rule, in one place.
 *
 * It lived in recovery.service.ts, which was the wrong home: registration and
 * password reset both enforce it, and account recovery is the one flow that
 * merely happens to sit beside it. Moved out on its own so that deleting a
 * recovery implementation cannot take the rule guarding every password in the
 * city with it.
 */
import { BadRequestException } from '@nestjs/common';

/** Enforce the password policy server-side (never trust the client). */
/**
 * Common-password cores: composition rules already reject bare dictionary
 * words, but "Password@123"-style dress-ups pass them. Strip digits/symbols,
 * lowercase what's left, and reject the classic cores outright.
 */
const COMMON_CORES = new Set([
  'password', 'passwort', 'qwerty', 'qwertyuiop', 'welcome', 'admin', 'administrator',
  'letmein', 'iloveyou', 'monkey', 'dragon', 'sunshine', 'princess', 'football',
  'baseball', 'master', 'shadow', 'superman', 'batman', 'michael', 'computer',
  'internet', 'whatever', 'trustno', 'abcdef', 'abcdefgh', 'india', 'mumbai',
  'together', 'togethercity', 'togetherai',
]);

export function assertStrongPassword(pw: string): void {
  const need: string[] = [];
  if ((pw ?? '').length < 12) need.push('at least 12 characters');
  if (!/[A-Z]/.test(pw)) need.push('an uppercase letter');
  if (!/[a-z]/.test(pw)) need.push('a lowercase letter');
  if (!/[0-9]/.test(pw)) need.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw)) need.push('a special character');
  if (need.length) throw new BadRequestException(`Password needs ${need.join(', ')}.`);
  const core = (pw ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (COMMON_CORES.has(core)) {
    throw new BadRequestException('That password is too common — pick something less guessable.');
  }
}
