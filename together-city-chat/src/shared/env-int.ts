/**
 * ── AN INTEGER FROM THE ENVIRONMENT, AND ZERO IS A NUMBER ───────────────────
 *
 * There were three copies of this idea — `envInt` in prisma.service.ts,
 * `ReadCache.ttlFromEnv`, and a hand-rolled expression in SocialService — and
 * the hand-rolled one had the bug the other two were written to avoid:
 *
 *     Math.max(0, Number.parseInt(process.env.SOCIAL_FANOUT_MAX ?? '', 10) || 1_000)
 *
 * `parseInt('0')` is `0`, and `0 || 1_000` is `1_000`. So setting
 * SOCIAL_FANOUT_MAX=0 — the one value an operator would reach for to turn live
 * fan-out OFF during an incident — silently set it to a thousand, the busiest
 * setting there is. The `||` cannot tell "unset" from "zero", and for a limit
 * those are opposite instructions.
 *
 * `??` would not have been enough either: it distinguishes unset from zero but
 * not from `SOCIAL_FANOUT_MAX=banana`. The check has to be about whether a
 * number was read, which is what this does.
 */
export function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
