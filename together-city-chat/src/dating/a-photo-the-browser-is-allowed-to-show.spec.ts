import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── A 200 THE BROWSER THREW AWAY ──
 *
 * Every dating photograph was a broken frame, on every screen, for the owner's
 * own pictures as much as anybody else's. The API's HTTP log said 200. Nothing
 * failed: not the token, not mayViewPhoto, not the bucket read — there was not
 * one warning anywhere, because nothing went wrong on this side of the wire.
 *
 * helmet() sets `Cross-Origin-Resource-Policy: same-origin` by default. The web
 * app is togethercity.app; this API is api.togethercity.app. So the browser
 * fetched each photograph, received it, read that header and DISCARDED it —
 * which an <img> reports exactly as it reports a 404.
 *
 * This is the only image the API serves itself; everything else in the city is
 * a presigned link straight to the bucket and never meets helmet. That is why
 * dating was the only hub full of holes, and why nothing in the logs said so.
 *
 * Pinned here because the failure is invisible from the server's side: no test
 * that exercises this route can see it, and the next person to add an
 * API-served image will not think of it either.
 */
const src = readFileSync(join(__dirname, 'dating.controller.ts'), 'utf8');
const photoRoute = src.slice(src.indexOf("@Get('photo/:token')"), src.indexOf('new StreamableFile'));

describe('a photo the browser is allowed to show', () => {
  it('sends a cross-origin resource policy, or the image is fetched and dropped', () => {
    expect(photoRoute).toMatch(/'Cross-Origin-Resource-Policy':\s*'cross-origin'/);
  });

  it('still sends the object’s own content type and a private cache', () => {
    expect(photoRoute).toMatch(/'Content-Type':\s*found\.contentType/);
    expect(photoRoute).toMatch(/'Cache-Control':\s*'private/);
  });

  /**
   * The header that makes the image embeddable says nothing about who may
   * fetch it. If that check ever leaves this route, the relaxation becomes a
   * real one.
   */
  it('still asks the permission question on every fetch', () => {
    const service = readFileSync(join(__dirname, 'dating.service.ts'), 'utf8');
    const openPhoto = service.slice(service.indexOf('async openPhoto('), service.indexOf('async openPhoto(') + 400);
    expect(openPhoto).toMatch(/mayViewPhoto\(claim\.viewerId, claim\.key\)/);
  });
});
