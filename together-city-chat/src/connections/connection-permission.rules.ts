import { ConnectionType } from '@prisma/client';

/**
 * Per-connection-type policy. Extending the system = add a ConnectionType enum
 * value (schema) + one entry here. No messaging code changes required.
 */
export interface ConnectionTypeRule {
  /** Who may initiate the request. 'either' | 'first' (userOne) | 'second' (userTwo). */
  initiator: 'either' | 'first' | 'second';
  /** Must an external event exist first (e.g. a marketplace order, an assignment)? */
  requiresExternalEvent: boolean;
  /** Human label for UIs/audit. */
  label: string;
}

export const CONNECTION_RULES: Record<ConnectionType, ConnectionTypeRule> = {
  FRIEND: { initiator: 'either', requiresExternalEvent: false, label: 'Friends' },
  COUPLE: { initiator: 'either', requiresExternalEvent: false, label: 'Couple' },
  FAMILY: { initiator: 'either', requiresExternalEvent: false, label: 'Family' },
  BUSINESS_CUSTOMER: {
    initiator: 'either',
    requiresExternalEvent: false,
    label: 'Business ↔ Customer',
  },
  DOCTOR_PATIENT: { initiator: 'either', requiresExternalEvent: true, label: 'Doctor ↔ Patient' },
  NUTRITIONIST_CLIENT: {
    initiator: 'either',
    requiresExternalEvent: true,
    label: 'Nutritionist ↔ Client',
  },
  LAWYER_CLIENT: { initiator: 'either', requiresExternalEvent: true, label: 'Lawyer ↔ Client' },
  MARKETPLACE_BUYER_SELLER: {
    initiator: 'either',
    requiresExternalEvent: true,
    label: 'Marketplace Buyer ↔ Seller',
  },
  EVENT_PARTICIPANT: {
    initiator: 'either',
    requiresExternalEvent: true,
    label: 'Event Participant',
  },
};
