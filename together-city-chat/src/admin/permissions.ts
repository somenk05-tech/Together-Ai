/**
 * WHO MAY DO WHAT, DECLARED IN ONE PLACE.
 *
 * An admin console is a set of buttons that reach into other people's lives:
 * suspending an account, approving a business, refunding money. The question
 * "who is allowed to press this" cannot live next to the button — a check
 * written at each call site is a check somebody forgets at exactly one of
 * them, and that one is the breach.
 *
 * So permissions are DATA. A route declares the permission it needs; a role
 * declares the permissions it holds; the guard is the only code that compares
 * them. Adding a console screen means adding a key here, and a screen with no
 * key cannot be reached at all — see admin.spec.ts, which fails on a route
 * that forgot to declare one.
 *
 * TWO THINGS THIS FILE DELIBERATELY DOES NOT CONTAIN.
 *
 * There is no `*` and no "founder can do anything" shortcut. A role that holds
 * every permission by construction is a role nobody can reason about, and the
 * first person given it "temporarily" keeps it. Founder holds every key
 * because every key is LISTED against it, so removing one shows up in a diff.
 *
 * And no permission grants another permission. Escalation paths are how a
 * support account becomes a finance account on a Friday afternoon.
 */

/** Every action the console can take. Frozen once shipped — a renamed key
 *  silently un-grants itself from every role that held it. */
export const PERMISSIONS = {
  'users.read': 'See citizen accounts and their status',
  'users.suspend': 'Suspend or restore an account',
  'users.delete': 'Delete an account and its data',

  'business.read': 'See listings, including ones awaiting moderation',
  'business.approve': 'Approve or reject a listing',
  'business.suspend': 'Take a listing out of the directory',
  'business.feature': 'Promote a listing in the directory',

  'moderation.read': 'See the report queue',
  'moderation.act': 'Act on a report — hide, warn, remove',

  'support.read': 'See support tickets',
  'support.reply': 'Reply to a citizen',
  'support.assign': 'Assign and escalate tickets',

  'finance.read': 'See revenue, payouts and invoices',
  'finance.act': 'Issue a refund or release a payout',

  'ops.health': 'See system health and error rates',
  'ops.flags': 'Turn features on and off',
  'ops.deploy': 'See deployment and job history',

  'cms.write': 'Edit help pages, policies and announcements',
  'notify.send': 'Send a push, email or announcement',

  'audit.read': 'Read the audit log',
  'admin.grant': 'Give or take away an admin role',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/**
 * The roles, and what each one holds.
 *
 * Written out rather than composed from one another. "Operations inherits
 * Support" reads well and hides the moment somebody adds a permission to
 * Support and hands it to Operations without noticing.
 */
export const ROLES = {
  founder: ALL_PERMISSIONS,
  superadmin: ALL_PERMISSIONS.filter((p) => p !== 'users.delete'),
  admin: [
    'users.read', 'users.suspend',
    'business.read', 'business.approve', 'business.suspend', 'business.feature',
    'moderation.read', 'moderation.act',
    'support.read', 'support.reply', 'support.assign',
    'ops.health', 'audit.read',
  ],
  operations: [
    'users.read', 'business.read', 'business.approve', 'business.suspend',
    'moderation.read', 'support.read', 'support.reply', 'support.assign', 'ops.health',
  ],
  support: ['users.read', 'business.read', 'support.read', 'support.reply'],
  finance: ['users.read', 'business.read', 'finance.read', 'finance.act', 'audit.read'],
  marketing: ['business.read', 'cms.write', 'notify.send'],
  moderator: ['moderation.read', 'moderation.act', 'business.read', 'users.read'],
  engineering: ['ops.health', 'ops.flags', 'ops.deploy', 'audit.read'],
  business_success: ['business.read', 'business.approve', 'business.feature', 'support.read', 'support.reply'],
} as const satisfies Record<string, readonly Permission[]>;

export type AdminRole = keyof typeof ROLES;
export const ALL_ROLES = Object.keys(ROLES) as AdminRole[];
export const isAdminRole = (r: string): r is AdminRole => (ALL_ROLES as string[]).includes(r);

/** Everything this set of roles can do. A person may hold more than one. */
export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    if (!isAdminRole(r)) continue;
    for (const p of ROLES[r]) out.add(p);
  }
  return out;
}

export const can = (roles: readonly string[], need: Permission): boolean =>
  permissionsFor(roles).has(need);

/**
 * ACTIONS THAT CHANGE SOMETHING, AND THEREFORE MUST BE WRITTEN DOWN.
 *
 * "Nothing happens silently" is the rule, and a rule with no list is one
 * nobody can check. Every permission here MUST produce an audit row when it is
 * used; admin.spec.ts fails on a handler that declares one and does not record.
 *
 * Read permissions are absent on purpose. Auditing every page view produces a
 * log nobody reads — which is the same as no log — and it also builds a record
 * of which staff member looked at which citizen, which is its own hazard.
 */
export const MUST_AUDIT: readonly Permission[] = [
  'users.suspend', 'users.delete',
  'business.approve', 'business.suspend', 'business.feature',
  'moderation.act',
  'support.reply', 'support.assign',
  'finance.act',
  'ops.flags',
  'cms.write', 'notify.send',
  'admin.grant',
];
