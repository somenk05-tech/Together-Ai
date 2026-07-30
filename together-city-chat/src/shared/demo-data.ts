/**
 * Is this deployment allowed to serve invented commercial inventory?
 *
 * Several hubs shipped with seeded catalogues — tour packages, restaurants,
 * job postings, synthesised flights — that citizens could pay for and receive
 * a booking code and an emailed receipt for. None of it corresponds to anything
 * real, which is fine for a demo and not fine in production.
 *
 * The rule: a hub may present invented inventory only when SEED_DEMO=true.
 * Otherwise it presents an honest empty state, refuses to take money for it,
 * and removes any rows a previous deploy left behind.
 *
 * This is the gate the commerce hubs use. The medical and nutrition hubs used to
 * read process.env.SEED_DEMO directly for their demo practitioners — identical
 * behaviour, two more places to drift, and neither of them reached the
 * production warning below. They now come through here too, and
 * demo-data.spec.ts keeps it that way.
 */
let warnedInProd = false;

export const demoDataEnabled = (): boolean => {
  const on = process.env.SEED_DEMO === 'true';
  // Invented inventory that a citizen can pay for, switched on in production by
  // an environment variable, is a booking code and an emailed receipt for a
  // flight that does not exist. That may be deliberate on a demo deployment
  // running with NODE_ENV=production, so this warns rather than refuses — but
  // it warns loudly, once, instead of leaving it to be noticed by a customer.
  if (on && process.env.NODE_ENV === 'production' && !warnedInProd) {
    warnedInProd = true;
    // eslint-disable-next-line no-console
    console.warn(
      '[demo-data] SEED_DEMO=true in production. Invented catalogues — flights, '
      + 'restaurants, tours, job postings — are being served and can be paid for. '
      + 'Unset SEED_DEMO unless this is deliberately a demo deployment.',
    );
  }
  return on;
};

/** Message shown where a hub would otherwise list invented inventory. */
export const DEMO_DISABLED_REASON =
  'This hub has no real inventory connected yet, so there is nothing to show. ' +
  'Sample data is available only on demo deployments.';
