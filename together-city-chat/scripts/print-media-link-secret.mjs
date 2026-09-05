#!/usr/bin/env node
// Prints the value the media-edge Worker needs as LINK_SECRET.
//
// If MEDIA_LINK_SECRET is set, that is the value. If not, the API derives one
// from JWT_ACCESS_SECRET (see src/shared/secrets/derived-secret.ts) and this
// prints the derivation so it can be put in the Worker without the Worker ever
// holding the JWT secret. Run with the API's environment:
//   npx @railway/cli run node scripts/print-media-link-secret.mjs
import { createHmac } from 'node:crypto';
const explicit = (process.env.MEDIA_LINK_SECRET ?? '').trim();
const root = process.env.JWT_ACCESS_SECRET ?? '';
if (!explicit && !root) { console.error('Neither MEDIA_LINK_SECRET nor JWT_ACCESS_SECRET is set.'); process.exit(1); }
process.stdout.write((explicit || createHmac('sha256', root).update('tc:secret:media-link:v1').digest('hex')) + '\n');
