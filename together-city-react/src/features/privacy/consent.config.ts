import type { HubKey } from '@/types';
import type { IconName } from '@/components/ui/Icon';

/**
 * Contextual consent copy (audit 2.2 + 2.5). One plain-language source of truth
 * for every sensitive hub: the short inline reassurance shown at the point of
 * data entry, and the fuller "before you enter" consent screen — what data, why,
 * how it's used, who can see it, and how to control or delete it.
 */
export interface HubConsent {
  hub: HubKey;
  label: string;
  icon: IconName;
  /** One-line reassurance for inline notices on sensitive forms (2.5). */
  inline: string;
  /** The consent-screen headline promise. */
  promise: string;
  what: string;
  why: string;
  who: string;
  control: string;
}

export const SENSITIVE_HUBS: Record<string, HubConsent> = {
  medical: {
    hub: 'medical', label: 'Medical Hub', icon: 'heart',
    inline: 'Your health records are private and only used to personalize your health insights.',
    promise: 'Your blood tests and health records remain private and are only used to personalize your health insights.',
    what: 'Blood tests, health records, documents and any biomarkers you add or upload.',
    why: 'To interpret your results, track trends over time, and tailor nutrition, fitness and supplement guidance to you.',
    who: 'Only you, by default. Other hubs can read your biomarkers only while you allow it in Privacy & Consent, and it stops the moment you turn it off.',
    control: 'Manage or revoke every permission in Medical → Privacy & Consent, and delete records any time from Health Records.',
  },
  dating: {
    hub: 'dating', label: 'Dating Hub', icon: 'heart',
    inline: 'Your dating profile is never visible to connected family or friends, and only appears to compatible matches you choose to interact with.',
    promise: 'Only information you choose to make public will be visible to potential matches.',
    what: 'Your dating profile, preferences, interests and the birth details used for compatibility.',
    why: 'To find genuinely compatible matches (75%+) and improve who we surface to you.',
    who: 'Connected family, friends and blocked people can never see your dating profile. Only compatible matches you engage with see what you make public.',
    control: 'Edit visibility any time on your Dating Profile, hide your profile, or remove it entirely.',
  },
  financial: {
    hub: 'financial', label: 'Financial District', icon: 'product',
    inline: 'Your financial information is encrypted and never shared without your permission.',
    promise: 'Financial data is encrypted and never shared without your permission.',
    what: 'Your wallet balance, spending, budgets and transactions across the city.',
    why: 'To show one clear view of your money and give you budgeting and spending insights.',
    who: 'Only you. We never share your financial data with third parties or other people without your explicit permission.',
    control: 'Review activity any time, and manage data sharing in Privacy & Permissions.',
  },
  family: {
    hub: 'family', label: 'Family Nutrition', icon: 'people',
    inline: 'You control which family members can view or manage shared information.',
    promise: 'You control which family members can view or manage shared information.',
    what: 'Family relationships, shared plans, pantry and the roles you assign to each member.',
    why: 'To coordinate meals, groceries and plans for your household from one place.',
    who: 'Only the members you connect, each limited to the role and access you grant them.',
    control: 'Adjust roles and permissions any time in Family → Connect Members, and remove a member to end their access.',
  },
  astrology: {
    hub: 'astrology', label: 'Astrology Zone', icon: 'sparkles',
    inline: 'Your birth details are used only to generate your personalized guidance and remain private.',
    promise: 'Your birth details are used only to generate personalized guidance.',
    what: 'Your date, time and place of birth, stored once in your Master Profile.',
    why: 'To calculate your Vedic chart and generate personalized daily and monthly guidance.',
    who: 'Only you. Birth details are never shown publicly and are used solely for your own guidance and compatibility features you opt into.',
    control: 'Update or clear your birth details any time from your Astrology Profile.',
  },
};

export function consentFor(hub?: string): HubConsent | undefined {
  return hub ? SENSITIVE_HUBS[hub] : undefined;
}

/** Granular, opt-in permissions for optional features (audit 2.2). */
export interface PermissionDef { key: string; label: string; desc: string }
export const PERMISSIONS: PermissionDef[] = [
  { key: 'ai_personalization', label: 'AI personalization', desc: 'Use your activity and profile to personalize insights, plans and guidance.' },
  { key: 'family_sharing', label: 'Family sharing', desc: 'Allow connected family members to view or manage information you share with them.' },
  { key: 'location', label: 'Location', desc: 'Use your location for nearby places, city map posts and local recommendations.' },
  { key: 'health_integrations', label: 'Health integrations', desc: 'Let hubs like Nutrition, Fitness and Beauty read your Medical biomarkers to personalize advice.' },
  { key: 'notifications', label: 'Notifications', desc: 'Send alerts for messages, requests, matches and important updates.' },
];

/** Sensible defaults — personalization and notifications on; sharing off until chosen. */
export const PERMISSION_DEFAULTS: Record<string, boolean> = {
  ai_personalization: true, family_sharing: false, location: false, health_integrations: true, notifications: true,
};
