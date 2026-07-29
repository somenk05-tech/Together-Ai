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
 * This is the gate the medical and nutrition hubs already used for their
 * demo practitioners; the commerce hubs now share it.
 */
export const demoDataEnabled = (): boolean => process.env.SEED_DEMO === 'true';

/** Message shown where a hub would otherwise list invented inventory. */
export const DEMO_DISABLED_REASON =
  'This hub has no real inventory connected yet, so there is nothing to show. ' +
  'Sample data is available only on demo deployments.';
