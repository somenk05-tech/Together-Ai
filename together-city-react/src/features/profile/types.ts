export interface HubContribution {
  hub: string;
  label: string;
  summary: string;      // e.g. "Diet: veg · Goal: maintain"
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
  profileImage: string | null;
}
