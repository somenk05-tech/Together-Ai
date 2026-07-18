import type { HubKey } from '@/types';

export interface HubContribution {
  hub: HubKey;
  label: string;
  summary: string;      // e.g. "Weekly plan saved · 12,976 recipes"
  href: string;
}

export interface ProfileSection {
  key: string;
  label: string;
  value: string | null;   // null → empty (prompts to fill)
}

export interface ProfileSummary {
  hubs: HubContribution[];     // "Your data across Together City"
  sections: ProfileSection[];  // profile detail rows
  memberSince: string;
}
