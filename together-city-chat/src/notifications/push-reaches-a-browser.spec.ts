/**
 * ── PUSH REACHES A BROWSER, AND ONLY A BROWSER ──
 *
 * `pushToDevices` splits a citizen's devices into FCM and web-push and sends to
 * both. That reads as two live channels, and it is one: `/push/subscribe` is
 * the only route in the API that writes a `DeviceToken`, and it always writes
 * `platform: 'webpush'`. The Capacitor shell carries no push plugin, so no
 * native token is produced, and the FCM list is always empty.
 *
 * This matters because the shape of the code says otherwise. It told the 28 Aug
 * audit that the four unset `FCM_*` variables were a launch gap — "no push
 * reaches a phone" — when browser push was working and setting them would have
 * changed nothing. A branch that cannot execute is a branch that misleads
 * whoever reads it next.
 *
 * The day somebody adds native push, this test goes red, and the manifest entry
 * it names stops being true. That is the intended failure: it is the reminder
 * to set the variables, arriving exactly when they start to matter.
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(__dirname, '..');

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) tsFiles(full, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

describe('the only device token this API can store', () => {
  const platforms = tsFiles(SRC).flatMap((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return [...src.matchAll(/platform:\s*'([a-z-]+)'/g)].map((m) => ({ file: path.relative(SRC, f), platform: m[1] }));
  });

  it('finds the writes at all — a check over nothing passes vacuously', () => {
    expect(platforms.length).toBeGreaterThan(0);
  });

  it('is a browser subscription, everywhere it is written', () => {
    expect([...new Set(platforms.map((p) => p.platform))]).toEqual(['webpush']);
  });

  it('says so in the environment manifest, so an operator is not told to fix a gap that is not one', () => {
    const manifest = fs.readFileSync(path.join(SRC, 'dev', 'env-manifest.ts'), 'utf8');
    const fcm = manifest.slice(manifest.indexOf("name: 'FCM_ENABLED'"), manifest.indexOf("name: 'FCM_PRIVATE_KEY'"));
    expect(fcm).toMatch(/Browser push \(VAPID\) is the whole of push right now/);
  });
});
